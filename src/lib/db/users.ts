import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import bcrypt from "bcryptjs";

import { pool } from "@/lib/db";
import type {
  CreateUserInput,
  UpdateUserInput,
  User,
  UserBranch,
  UserListFilters,
  UserSummary,
} from "@/types/user";
import {
  UserDuplicateEmailError,
  UserInvalidTokenError,
  UserLastAdminError,
} from "@/types/user";

export type {
  CreateUserInput,
  UpdateUserInput,
  User,
  UserBranch,
  UserListFilters,
  UserSummary,
};
export { UserDuplicateEmailError, UserInvalidTokenError, UserLastAdminError };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function mapDbBool(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (
    value === false ||
    value === 0 ||
    value === null ||
    value === undefined
  )
    return false;
  if (typeof value === "bigint") return value !== BigInt(0);
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    return s === "1" || s === "true";
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return value.length > 0 && value[0] !== 0;
  }
  return Boolean(value);
}

function trimOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Genera un string alfanumérico aleatorio de la longitud indicada. */
function randomAlphanumeric(length: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => chars[b % chars.length]!)
    .join("");
}

function mapUserRow(r: RowDataPacket, branches: UserBranch[] = []): User {
  return {
    id: String(r.id),
    tenant_id: String(r.tenant_id),
    role_id: String(r.role_id),
    role_name: String(r.role_name) as User["role_name"],
    first_name: String(r.first_name),
    last_name: String(r.last_name),
    email: String(r.email),
    phone: trimOrNull(r.phone),
    avatar_url: trimOrNull(r.avatar_url),
    is_active: mapDbBool(r.is_active),
    last_login_at:
      r.last_login_at == null ? null : asIso(r.last_login_at),
    created_at: asIso(r.created_at),
    updated_at: asIso(r.updated_at),
    branches,
  };
}

async function loadBranchesForUser(
  conn: PoolConnection,
  tenantId: string,
  userId: string,
): Promise<UserBranch[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT ub.branch_id, b.name AS branch_name, ub.is_primary
     FROM user_branches ub
     INNER JOIN branches b
       ON b.id = ub.branch_id AND b.tenant_id = ub.tenant_id
     WHERE ub.tenant_id = ? AND ub.user_id = ?
     ORDER BY ub.is_primary DESC, b.name ASC`,
    [tenantId, userId],
  );
  return rows.map((r) => ({
    branch_id: String(r.branch_id),
    branch_name: String(r.branch_name),
    is_primary: mapDbBool(r.is_primary),
  }));
}

/** Cuenta cuántos admins activos tiene el tenant. */
async function countActiveAdmins(
  conn: PoolConnection,
  tenantId: string,
): Promise<number> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n
     FROM users u
     INNER JOIN roles r ON r.id = u.role_id AND r.tenant_id = u.tenant_id
     WHERE u.tenant_id = ? AND r.name = 'admin' AND u.is_active = TRUE`,
    [tenantId],
  );
  return Number(rows[0]?.n) || 0;
}

/** Resuelve el role_id de un rol por nombre dentro del tenant. */
async function resolveRoleId(
  conn: PoolConnection,
  tenantId: string,
  roleName: string,
): Promise<string> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id FROM roles WHERE tenant_id = ? AND name = ? LIMIT 1`,
    [tenantId, roleName],
  );
  if (!rows.length) {
    throw new Error(`Rol '${roleName}' no encontrado en el tenant`);
  }
  return String(rows[0]!.id);
}

// ---------------------------------------------------------------------------
// getUsers
// ---------------------------------------------------------------------------

export async function getUsers(
  tenantId: string,
  filters?: UserListFilters,
): Promise<UserSummary[]> {
  const where: string[] = ["u.tenant_id = ?"];
  const params: unknown[] = [tenantId];

  if (filters?.isActive !== undefined) {
    where.push("u.is_active = ?");
    params.push(filters.isActive ? 1 : 0);
  }

  if (filters?.roleId) {
    where.push("u.role_id = ?");
    params.push(filters.roleId);
  }

  if (filters?.branchId) {
    where.push(
      `EXISTS (
        SELECT 1 FROM user_branches ub2
        WHERE ub2.user_id = u.id AND ub2.branch_id = ?
      )`,
    );
    params.push(filters.branchId);
  }

  if (filters?.search?.trim()) {
    const esc = filters.search
      .trim()
      .replace(/\\/g, "\\\\")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");
    const like = `%${esc}%`;
    where.push(
      `(LOWER(u.first_name) LIKE LOWER(?)
       OR LOWER(u.last_name) LIKE LOWER(?)
       OR LOWER(CONCAT(u.first_name, ' ', u.last_name)) LIKE LOWER(?)
       OR LOWER(u.email) LIKE LOWER(?))`,
    );
    params.push(like, like, like, like);
  }

  const whereSql = where.join(" AND ");

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       u.id, u.tenant_id, u.role_id, r.name AS role_name,
       u.first_name, u.last_name, u.email, u.phone, u.avatar_url,
       u.is_active, u.last_login_at, u.created_at, u.updated_at,
       COUNT(ub.branch_id)                                        AS branch_count,
       MAX(CASE WHEN ub.is_primary = TRUE THEN b.name ELSE NULL END) AS primary_branch_name
     FROM users u
     INNER JOIN roles r
       ON r.id = u.role_id AND r.tenant_id = u.tenant_id
     LEFT JOIN user_branches ub
       ON ub.user_id = u.id AND ub.tenant_id = u.tenant_id
     LEFT JOIN branches b
       ON b.id = ub.branch_id AND b.tenant_id = u.tenant_id
     WHERE ${whereSql}
     GROUP BY
       u.id, u.tenant_id, u.role_id, r.name,
       u.first_name, u.last_name, u.email, u.phone, u.avatar_url,
       u.is_active, u.last_login_at, u.created_at, u.updated_at
     ORDER BY u.first_name ASC, u.last_name ASC`,
    params,
  );

  return rows.map((r) => ({
    id: String(r.id),
    tenant_id: String(r.tenant_id),
    role_id: String(r.role_id),
    role_name: String(r.role_name) as User["role_name"],
    first_name: String(r.first_name),
    last_name: String(r.last_name),
    email: String(r.email),
    phone: trimOrNull(r.phone),
    avatar_url: trimOrNull(r.avatar_url),
    is_active: mapDbBool(r.is_active),
    last_login_at:
      r.last_login_at == null ? null : asIso(r.last_login_at),
    created_at: asIso(r.created_at),
    updated_at: asIso(r.updated_at),
    branch_count: Number(r.branch_count) || 0,
    primary_branch_name: trimOrNull(r.primary_branch_name),
  }));
}

// ---------------------------------------------------------------------------
// getUserById
// ---------------------------------------------------------------------------

export async function getUserById(
  tenantId: string,
  id: string,
): Promise<User | null> {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT
         u.id, u.tenant_id, u.role_id, r.name AS role_name,
         u.first_name, u.last_name, u.email, u.phone, u.avatar_url,
         u.is_active, u.last_login_at, u.created_at, u.updated_at
       FROM users u
       INNER JOIN roles r
         ON r.id = u.role_id AND r.tenant_id = u.tenant_id
       WHERE u.tenant_id = ? AND u.id = ?
       LIMIT 1`,
      [tenantId, id],
    );
    const r = rows[0];
    if (!r) return null;
    const branches = await loadBranchesForUser(conn, tenantId, id);
    return mapUserRow(r, branches);
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// createUser
// ---------------------------------------------------------------------------

export async function createUser(
  tenantId: string,
  data: CreateUserInput,
): Promise<User> {
  const userId = crypto.randomUUID();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Verificar email único dentro del tenant
    const [dup] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM users
       WHERE tenant_id = ? AND LOWER(TRIM(email)) = LOWER(TRIM(?))
       LIMIT 1`,
      [tenantId, data.email],
    );
    if (dup.length) {
      throw new UserDuplicateEmailError();
    }

    // 2. Resolver role_id
    const roleId = await resolveRoleId(conn, tenantId, data.role_name);

    // 3. Hash de contraseña
    const passwordHash = await bcrypt.hash(data.password, 12);

    // 4. INSERT users
    await conn.query<ResultSetHeader>(
      `INSERT INTO users (
        id, tenant_id, role_id, first_name, last_name,
        email, password_hash, phone, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        userId,
        tenantId,
        roleId,
        data.first_name.trim(),
        data.last_name.trim(),
        data.email.trim().toLowerCase(),
        passwordHash,
        trimOrNull(data.phone),
      ],
    );

    // 5. INSERT user_branches
    const uniqueBranchIds = [...new Set(data.branch_ids)];
    if (uniqueBranchIds.length === 0) {
      throw new Error("Se requiere al menos una sucursal");
    }
    for (const branchId of uniqueBranchIds) {
      const isPrimary = branchId === data.primary_branch_id;
      await conn.query<ResultSetHeader>(
        `INSERT INTO user_branches (tenant_id, user_id, branch_id, is_primary)
         VALUES (?, ?, ?, ?)`,
        [tenantId, userId, branchId, isPrimary ? 1 : 0],
      );
    }

    // Si primary_branch_id no estaba en branch_ids, agregar igualmente
    if (!uniqueBranchIds.includes(data.primary_branch_id)) {
      await conn.query<ResultSetHeader>(
        `INSERT INTO user_branches (tenant_id, user_id, branch_id, is_primary)
         VALUES (?, ?, ?, TRUE)`,
        [tenantId, userId, data.primary_branch_id],
      );
    }

    await conn.commit();

    const branches = await loadBranchesForUser(conn, tenantId, userId);
    const [userRows] = await conn.query<RowDataPacket[]>(
      `SELECT u.id, u.tenant_id, u.role_id, r.name AS role_name,
              u.first_name, u.last_name, u.email, u.phone, u.avatar_url,
              u.is_active, u.last_login_at, u.created_at, u.updated_at
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id AND r.tenant_id = u.tenant_id
       WHERE u.tenant_id = ? AND u.id = ? LIMIT 1`,
      [tenantId, userId],
    );
    if (!userRows[0]) throw new Error("Usuario creado pero no legible");
    return mapUserRow(userRows[0], branches);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// updateUser
// ---------------------------------------------------------------------------

export async function updateUser(
  tenantId: string,
  id: string,
  data: UpdateUserInput,
): Promise<User> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Verificar que el usuario existe
    const [check] = await conn.query<RowDataPacket[]>(
      `SELECT u.id, r.name AS role_name
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id AND r.tenant_id = u.tenant_id
       WHERE u.tenant_id = ? AND u.id = ? LIMIT 1`,
      [tenantId, id],
    );
    if (!check.length) throw new Error("Usuario no encontrado");

    // Si se cambia el rol y era admin, verificar que no es el último
    if (
      data.role_name !== undefined &&
      data.role_name !== check[0]!.role_name &&
      check[0]!.role_name === "admin"
    ) {
      const adminCount = await countActiveAdmins(conn, tenantId);
      if (adminCount <= 1) throw new UserLastAdminError();
    }

    const sets: string[] = [];
    const vals: unknown[] = [];

    if (data.first_name !== undefined) {
      sets.push("first_name = ?");
      vals.push(data.first_name.trim());
    }
    if (data.last_name !== undefined) {
      sets.push("last_name = ?");
      vals.push(data.last_name.trim());
    }
    if (data.email !== undefined) {
      // Verificar unicidad del nuevo email
      const [dup] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM users
         WHERE tenant_id = ? AND LOWER(TRIM(email)) = LOWER(TRIM(?))
           AND id <> ? LIMIT 1`,
        [tenantId, data.email, id],
      );
      if (dup.length) throw new UserDuplicateEmailError();
      sets.push("email = ?");
      vals.push(data.email.trim().toLowerCase());
    }
    if (data.phone !== undefined) {
      sets.push("phone = ?");
      vals.push(trimOrNull(data.phone));
    }
    if (data.role_name !== undefined) {
      const roleId = await resolveRoleId(conn, tenantId, data.role_name);
      sets.push("role_id = ?");
      vals.push(roleId);
    }

    if (sets.length) {
      vals.push(tenantId, id);
      await conn.query<ResultSetHeader>(
        `UPDATE users
         SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = ? AND id = ?`,
        vals,
      );
    }

    // Actualizar sucursales si se proveyeron
    if (data.branch_ids !== undefined) {
      await conn.query<ResultSetHeader>(
        `DELETE FROM user_branches WHERE user_id = ? AND tenant_id = ?`,
        [id, tenantId],
      );
      const uniqueBranchIds = [...new Set(data.branch_ids)];
      if (uniqueBranchIds.length === 0) {
        throw new Error("Se requiere al menos una sucursal");
      }
      for (const branchId of uniqueBranchIds) {
        const isPrimary = branchId === data.primary_branch_id;
        await conn.query<ResultSetHeader>(
          `INSERT INTO user_branches (tenant_id, user_id, branch_id, is_primary)
           VALUES (?, ?, ?, ?)`,
          [tenantId, id, branchId, isPrimary ? 1 : 0],
        );
      }
      // Asegurar primary si no estaba incluida
      if (
        data.primary_branch_id &&
        !uniqueBranchIds.includes(data.primary_branch_id)
      ) {
        await conn.query<ResultSetHeader>(
          `INSERT INTO user_branches (tenant_id, user_id, branch_id, is_primary)
           VALUES (?, ?, ?, TRUE)`,
          [tenantId, id, data.primary_branch_id],
        );
      }
    }

    await conn.commit();

    const branches = await loadBranchesForUser(conn, tenantId, id);
    const [userRows] = await conn.query<RowDataPacket[]>(
      `SELECT u.id, u.tenant_id, u.role_id, r.name AS role_name,
              u.first_name, u.last_name, u.email, u.phone, u.avatar_url,
              u.is_active, u.last_login_at, u.created_at, u.updated_at
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id AND r.tenant_id = u.tenant_id
       WHERE u.tenant_id = ? AND u.id = ? LIMIT 1`,
      [tenantId, id],
    );
    if (!userRows[0]) throw new Error("Usuario no encontrado tras actualizar");
    return mapUserRow(userRows[0], branches);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// deleteUser (soft delete)
// ---------------------------------------------------------------------------

export async function deleteUser(
  tenantId: string,
  id: string,
): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [check] = await conn.query<RowDataPacket[]>(
      `SELECT r.name AS role_name
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id AND r.tenant_id = u.tenant_id
       WHERE u.tenant_id = ? AND u.id = ? LIMIT 1`,
      [tenantId, id],
    );
    if (!check.length) throw new Error("Usuario no encontrado");

    if (check[0]!.role_name === "admin") {
      const adminCount = await countActiveAdmins(conn, tenantId);
      if (adminCount <= 1) throw new UserLastAdminError();
    }

    await conn.query<ResultSetHeader>(
      `UPDATE users SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND id = ?`,
      [tenantId, id],
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// reactivateUser
// ---------------------------------------------------------------------------

export async function reactivateUser(
  tenantId: string,
  id: string,
): Promise<void> {
  const [res] = await pool.query<ResultSetHeader>(
    `UPDATE users SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND id = ?`,
    [tenantId, id],
  );
  if (res.affectedRows === 0) throw new Error("Usuario no encontrado");
}

// ---------------------------------------------------------------------------
// generateTempPassword
// ---------------------------------------------------------------------------

export async function generateTempPassword(
  tenantId: string,
  userId: string,
): Promise<string> {
  const tempPassword = randomAlphanumeric(10);
  const hash = await bcrypt.hash(tempPassword, 12);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [check] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM users WHERE tenant_id = ? AND id = ? LIMIT 1`,
      [tenantId, userId],
    );
    if (!check.length) throw new Error("Usuario no encontrado");

    await conn.query<ResultSetHeader>(
      `UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND id = ?`,
      [hash, tenantId, userId],
    );

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await conn.query<ResultSetHeader>(
      `INSERT INTO password_reset_tokens
         (tenant_id, user_id, token, type, expires_at)
       VALUES (?, ?, ?, 'temp_password', ?)`,
      [tenantId, userId, tempPassword, expiresAt],
    );

    await conn.commit();
    return tempPassword;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// sendPasswordResetEmail
// ---------------------------------------------------------------------------

export async function sendPasswordResetEmail(
  tenantId: string,
  userId: string,
): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [userRows] = await conn.query<RowDataPacket[]>(
      `SELECT u.first_name, u.email
       FROM users u
       WHERE u.tenant_id = ? AND u.id = ? AND u.is_active = TRUE LIMIT 1`,
      [tenantId, userId],
    );
    if (!userRows.length) throw new Error("Usuario no encontrado o inactivo");
    const user = userRows[0]!;

    // Token único: UUID + timestamp
    const token = `${crypto.randomUUID()}-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await conn.query<ResultSetHeader>(
      `INSERT INTO password_reset_tokens
         (tenant_id, user_id, token, type, expires_at)
       VALUES (?, ?, ?, 'email_link', ?)`,
      [tenantId, userId, token, expiresAt],
    );

    await conn.commit();

    // Enviar email
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
    const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;

    // Import dinámico para no romper en entornos que no tienen Resend configurado
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: "Nuba <noreply@nodoapp.com.ar>",
        to: String(user.email),
        subject: "Restablecer contraseña — Nuba",
        html: [
          `<p>Hola ${String(user.first_name)},</p>`,
          `<p>Recibimos una solicitud para restablecer tu contraseña en Nuba.</p>`,
          `<p>Hacé click en el siguiente enlace para crear una nueva contraseña:</p>`,
          `<p><a href="${resetUrl}" style="color:#4f46e5;font-weight:600;">`,
          `Restablecer mi contraseña</a></p>`,
          `<p>El enlace expira en 24 horas. Si no lo solicitaste, podés ignorar este email.</p>`,
          `<p style="color:#6b7280;font-size:12px;">Este es un email automático de Nuba — no respondas a este mensaje.</p>`,
        ].join("\n"),
      });
    } catch (mailErr) {
      console.error("[sendPasswordResetEmail] Resend error:", mailErr);
      throw new Error("No se pudo enviar el email de restablecimiento");
    }
  } catch (e) {
    // Solo rollback si el commit aún no ocurrió (Resend falla post-commit)
    try {
      await conn.rollback();
    } catch {
      // ya commiteado; ignorar
    }
    throw e;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// validateResetToken
// ---------------------------------------------------------------------------

export async function validateResetToken(token: string): Promise<{
  valid: boolean;
  userId?: string;
  tenantId?: string;
  expired?: boolean;
}> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, tenant_id, user_id, expires_at, used_at
     FROM password_reset_tokens
     WHERE token = ? LIMIT 1`,
    [token],
  );
  if (!rows.length) {
    return { valid: false };
  }
  const row = rows[0]!;
  if (row.used_at != null) {
    return { valid: false };
  }
  const now = new Date();
  const expiresAt = row.expires_at instanceof Date
    ? row.expires_at
    : new Date(String(row.expires_at));
  if (expiresAt <= now) {
    return { valid: false, expired: true };
  }
  return {
    valid: true,
    userId: String(row.user_id),
    tenantId: String(row.tenant_id),
  };
}

// ---------------------------------------------------------------------------
// applyPasswordReset
// ---------------------------------------------------------------------------

export async function applyPasswordReset(
  token: string,
  newPassword: string,
): Promise<void> {
  const result = await validateResetToken(token);
  if (!result.valid || !result.userId || !result.tenantId) {
    throw new UserInvalidTokenError();
  }

  const hash = await bcrypt.hash(newPassword, 12);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query<ResultSetHeader>(
      `UPDATE users
       SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND id = ?`,
      [hash, result.tenantId, result.userId],
    );

    await conn.query<ResultSetHeader>(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE token = ?`,
      [token],
    );

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
