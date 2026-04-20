import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { pool } from "@/lib/db";
import type {
  Branch,
  CreateBranchInput,
  UpdateBranchInput,
} from "@/types/branch";
import {
  BranchDuplicateNameError,
  BranchLastActiveError,
} from "@/types/branch";

export type { Branch, CreateBranchInput, UpdateBranchInput };
export { BranchDuplicateNameError, BranchLastActiveError };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapDbBool(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined)
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

function mapRow(r: RowDataPacket): Branch {
  return {
    id: String(r.id),
    tenant_id: String(r.tenant_id),
    name: String(r.name),
    address: String(r.address),
    city: trimOrNull(r.city),
    province: trimOrNull(r.province),
    phone: trimOrNull(r.phone),
    email: trimOrNull(r.email),
    is_active: mapDbBool(r.is_active),
    created_at: asIso(r.created_at),
    updated_at: asIso(r.updated_at),
    user_count: r.user_count !== undefined ? Number(r.user_count) : undefined,
  };
}

/** Base SELECT con conteo de usuarios asignados. */
const SELECT_BASE = `
  SELECT
    b.id, b.tenant_id, b.name, b.address, b.city, b.province,
    b.phone, b.email, b.is_active, b.created_at, b.updated_at,
    COUNT(ub.user_id) AS user_count
  FROM branches b
  LEFT JOIN user_branches ub ON ub.branch_id = b.id
`;

// ---------------------------------------------------------------------------
// getBranches
// ---------------------------------------------------------------------------

export async function getBranches(tenantId: string): Promise<Branch[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `${SELECT_BASE}
     WHERE b.tenant_id = ?
     GROUP BY b.id, b.tenant_id, b.name, b.address, b.city, b.province,
              b.phone, b.email, b.is_active, b.created_at, b.updated_at
     ORDER BY b.name ASC`,
    [tenantId],
  );
  return rows.map(mapRow);
}

// ---------------------------------------------------------------------------
// getBranchById
// ---------------------------------------------------------------------------

export async function getBranchById(
  tenantId: string,
  id: string,
): Promise<Branch | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `${SELECT_BASE}
     WHERE b.tenant_id = ? AND b.id = ?
     GROUP BY b.id, b.tenant_id, b.name, b.address, b.city, b.province,
              b.phone, b.email, b.is_active, b.created_at, b.updated_at
     LIMIT 1`,
    [tenantId, id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// createBranch
// ---------------------------------------------------------------------------

export async function createBranch(
  tenantId: string,
  data: CreateBranchInput,
): Promise<Branch> {
  // Verificar nombre único dentro del tenant
  const [dup] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM branches
     WHERE tenant_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?))
     LIMIT 1`,
    [tenantId, data.name],
  );
  if (dup.length) throw new BranchDuplicateNameError();

  const [res] = await pool.query<ResultSetHeader>(
    `INSERT INTO branches (tenant_id, name, address, city, province, phone, email)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      data.name.trim(),
      data.address.trim(),
      trimOrNull(data.city),
      trimOrNull(data.province),
      trimOrNull(data.phone),
      trimOrNull(data.email),
    ],
  );

  // mysql2 con UUID() en DEFAULT no devuelve insertId útil; recuperamos por LAST_INSERT_ID().
  // Como la PK es UUID generado por MySQL, buscamos el último insertado.
  const [newRows] = await pool.query<RowDataPacket[]>(
    `${SELECT_BASE}
     WHERE b.tenant_id = ? AND b.name = ?
     GROUP BY b.id, b.tenant_id, b.name, b.address, b.city, b.province,
              b.phone, b.email, b.is_active, b.created_at, b.updated_at
     ORDER BY b.created_at DESC
     LIMIT 1`,
    [tenantId, data.name.trim()],
  );

  void res; // used only for the side-effect
  if (!newRows[0]) throw new Error("Sucursal creada pero no legible");
  return mapRow(newRows[0]);
}

// ---------------------------------------------------------------------------
// updateBranch
// ---------------------------------------------------------------------------

export async function updateBranch(
  tenantId: string,
  id: string,
  data: UpdateBranchInput,
): Promise<Branch> {
  // Verificar existencia
  const [check] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM branches WHERE tenant_id = ? AND id = ? LIMIT 1`,
    [tenantId, id],
  );
  if (!check.length) throw new Error("Sucursal no encontrada");

  // Verificar unicidad de nombre si se está cambiando
  if (data.name !== undefined) {
    const [dup] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM branches
       WHERE tenant_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id <> ?
       LIMIT 1`,
      [tenantId, data.name, id],
    );
    if (dup.length) throw new BranchDuplicateNameError();
  }

  const sets: string[] = [];
  const vals: unknown[] = [];

  if (data.name !== undefined) {
    sets.push("name = ?");
    vals.push(data.name.trim());
  }
  if (data.address !== undefined) {
    sets.push("address = ?");
    vals.push(data.address.trim());
  }
  if (data.city !== undefined) {
    sets.push("city = ?");
    vals.push(trimOrNull(data.city));
  }
  if (data.province !== undefined) {
    sets.push("province = ?");
    vals.push(trimOrNull(data.province));
  }
  if (data.phone !== undefined) {
    sets.push("phone = ?");
    vals.push(trimOrNull(data.phone));
  }
  if (data.email !== undefined) {
    sets.push("email = ?");
    vals.push(trimOrNull(data.email));
  }
  if (data.is_active !== undefined) {
    sets.push("is_active = ?");
    vals.push(data.is_active ? 1 : 0);
  }

  if (sets.length) {
    vals.push(tenantId, id);
    await pool.query<ResultSetHeader>(
      `UPDATE branches SET ${sets.join(", ")} WHERE tenant_id = ? AND id = ?`,
      vals,
    );
  }

  const updated = await getBranchById(tenantId, id);
  if (!updated) throw new Error("Sucursal no encontrada tras actualizar");
  return updated;
}

// ---------------------------------------------------------------------------
// deactivateBranch
// ---------------------------------------------------------------------------

export async function deactivateBranch(
  tenantId: string,
  id: string,
): Promise<void> {
  // Verificar que no es la única sucursal activa
  const [activeRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM branches
     WHERE tenant_id = ? AND is_active = TRUE`,
    [tenantId],
  );
  const activeCount = Number(activeRows[0]?.n) || 0;
  if (activeCount <= 1) throw new BranchLastActiveError();

  await pool.query<ResultSetHeader>(
    `UPDATE branches SET is_active = FALSE WHERE tenant_id = ? AND id = ?`,
    [tenantId, id],
  );
}

// ---------------------------------------------------------------------------
// reactivateBranch
// ---------------------------------------------------------------------------

export async function reactivateBranch(
  tenantId: string,
  id: string,
): Promise<void> {
  const [res] = await pool.query<ResultSetHeader>(
    `UPDATE branches SET is_active = TRUE WHERE tenant_id = ? AND id = ?`,
    [tenantId, id],
  );
  if (res.affectedRows === 0) throw new Error("Sucursal no encontrada");
}
