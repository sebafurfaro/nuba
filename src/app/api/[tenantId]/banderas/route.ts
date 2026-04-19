import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { getTenantSession } from "@/lib/api-tenant-session";
import { pool } from "@/lib/db";

type Ctx = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT flag_key, is_enabled FROM feature_flags WHERE tenant_id = ?`,
      [gate.tenantUuid],
    );
    const flags: Record<string, boolean> = {};
    for (const r of rows) {
      flags[String(r.flag_key)] = Boolean(r.is_enabled);
    }
    if (flags.enable_tables === undefined) {
      flags.enable_tables = true;
    }
    if (flags.enable_takeaway === undefined) {
      flags.enable_takeaway = true;
    }
    return NextResponse.json({ flags });
  } catch (e) {
    console.error("[GET feature-flags]", e);
    return NextResponse.json({ error: "Error al leer flags" }, { status: 500 });
  }
}
