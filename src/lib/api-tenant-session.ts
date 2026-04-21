import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { cache } from "react";

import { auth } from "@/auth";
import { pool } from "@/lib/db";
import type { Role } from "@/lib/permissions";

export type TenantSessionOk = {
  session: Session;
  tenantUuid: string;
};

// Cache de resolución de tenant — se deduplica por request
const resolveTenantId = cache(async (slug: string): Promise<string | null> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM tenants WHERE slug = ? AND is_active = TRUE LIMIT 1`,
    [slug],
  );
  return (rows[0] as { id: string } | undefined)?.id ?? null;
});

// Cache de sesión completa — se deduplica por request
export const getTenantSession = cache(
  async (
    tenantSlug: string,
  ): Promise<TenantSessionOk | NextResponse> => {
    const session = await auth();
    if (!session?.user?.id || !session.user.tenantId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.user.tenantId !== tenantSlug) {
      return NextResponse.json({ error: "Tenant inválido" }, { status: 403 });
    }
    const id = await resolveTenantId(tenantSlug);
    if (!id) {
      return NextResponse.json(
        { error: "Tenant no encontrado" },
        { status: 404 },
      );
    }
    return { session, tenantUuid: id };
  },
);

export function requireAdminOrSupervisor(role: Role): NextResponse | null {
  if (role !== "admin" && role !== "supervisor") {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }
  return null;
}

/** Admin, supervisor o vendedor (p. ej. órdenes en salón). */
export function requireOrderStaff(role: Role): NextResponse | null {
  if (role !== "admin" && role !== "supervisor" && role !== "vendedor") {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }
  return null;
}

export function requireAdmin(role: Role): NextResponse | null {
  if (role !== "admin") {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }
  return null;
}
