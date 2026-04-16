import type { RowDataPacket } from "mysql2";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import type { PermissionClaim } from "@/lib/auth";
import { SESSION_COOKIE_NAME, signSessionToken } from "@/lib/auth";
import { pool } from "@/lib/db";
import { isRole } from "@/lib/permissions";

const loginBodySchema = z.object({
  tenantId: z.string().min(1).trim(),
  email: z.string().email().trim(),
  password: z.string().min(1),
});

type TenantRow = RowDataPacket & { id: string; slug: string };

type UserRow = RowDataPacket & {
  id: string;
  password_hash: string;
  role_id: string;
  role_name: string;
};

type PermRow = RowDataPacket & {
  resource: string;
  can_view: number | boolean;
  can_create: number | boolean;
  can_edit: number | boolean;
  can_delete: number | boolean;
};

export async function POST(request: Request) {
  const raw = await request.json().catch(() => null);
  const parsed = loginBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { tenantId: slug, email, password } = parsed.data;

  try {
    const [tenants] = await pool.query<TenantRow[]>(
      "SELECT id, slug FROM tenants WHERE slug = ? AND is_active = TRUE LIMIT 1",
      [slug],
    );
    if (!tenants.length) {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 },
      );
    }
    const tenant = tenants[0]!;

    const [users] = await pool.query<UserRow[]>(
      `SELECT u.id, u.password_hash, u.role_id, r.name AS role_name
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id AND r.tenant_id = u.tenant_id
       WHERE u.tenant_id = ? AND LOWER(TRIM(u.email)) = LOWER(?) AND u.is_active = TRUE
       LIMIT 1`,
      [tenant.id, email],
    );
    if (!users.length) {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 },
      );
    }
    const user = users[0]!;

    const match = bcrypt.compareSync(password, user.password_hash);
    if (!match) {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 },
      );
    }

    if (!isRole(user.role_name)) {
      return NextResponse.json({ error: "Rol no soportado" }, { status: 500 });
    }

    const [permRows] = await pool.query<PermRow[]>(
      `SELECT resource, can_view, can_create, can_edit, can_delete
       FROM permissions WHERE role_id = ?
       ORDER BY resource`,
      [user.role_id],
    );

    const permissions: PermissionClaim[] = permRows.map((row) => ({
      resource: row.resource,
      can_view: Boolean(row.can_view),
      can_create: Boolean(row.can_create),
      can_edit: Boolean(row.can_edit),
      can_delete: Boolean(row.can_delete),
    }));

    const token = await signSessionToken({
      sub: user.id,
      tenantId: tenant.slug,
      role: user.role_name,
      email,
      permissions,
    });

    const response = NextResponse.json({
      ok: true,
      tenantId: tenant.slug,
      email,
      role: user.role_name,
      permissions,
    });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (error) {
    console.error("[login]", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
