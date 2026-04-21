import type { RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";

import { pool } from "@/lib/db";
import { getPublicTenant } from "@/lib/public-tenant";

type Ctx = { params: Promise<{ tenantId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { tenantId: slug } = await ctx.params;

  try {
    const tenant = await getPublicTenant(slug);
    if (!tenant) {
      return NextResponse.json({ error: "Local no encontrado" }, { status: 404 });
    }

    const [[tenantRows], [branchRows], [flagRows]] = await Promise.all([
      pool.query<RowDataPacket[]>(
        `SELECT name, description, logo_url, banner_url, email, phone, whatsapp,
                website, instagram, facebook, tiktok, youtube
         FROM tenants WHERE id = ? LIMIT 1`,
        [tenant.id],
      ),
      pool.query<RowDataPacket[]>(
        `SELECT id, name, address, city, phone, email
         FROM branches WHERE tenant_id = ? AND is_active = TRUE
         ORDER BY name ASC`,
        [tenant.id],
      ),
      pool.query<RowDataPacket[]>(
        `SELECT flag_key, is_enabled FROM feature_flags
         WHERE tenant_id = ? AND flag_key IN ('enable_delivery')`,
        [tenant.id],
      ),
    ]);
    const t = tenantRows[0];
    if (!t) {
      return NextResponse.json({ error: "Local no encontrado" }, { status: 404 });
    }

    function mapDbBool(v: unknown): boolean {
      if (v === true || v === 1) return true;
      if (typeof v === "bigint") return v !== BigInt(0);
      if (typeof v === "string") return v === "1" || v.toLowerCase() === "true";
      if (Buffer.isBuffer(v)) return v.length > 0 && v[0] !== 0;
      return false;
    }

    const flags: Record<string, boolean> = {};
    for (const f of flagRows) {
      flags[String(f.flag_key)] = mapDbBool(f.is_enabled);
    }

    return NextResponse.json({
      name: String(t.name),
      description: t.description ?? null,
      logo_url: t.logo_url ?? null,
      banner_url: t.banner_url ?? null,
      email: t.email ?? null,
      phone: t.phone ?? null,
      whatsapp: t.whatsapp ?? null,
      website: t.website ?? null,
      instagram: t.instagram ?? null,
      facebook: t.facebook ?? null,
      tiktok: t.tiktok ?? null,
      youtube: t.youtube ?? null,
      enable_delivery: flags["enable_delivery"] ?? false,
      branches: branchRows.map((b) => ({
        id: String(b.id),
        name: String(b.name),
        address: String(b.address),
        city: b.city ?? null,
        phone: b.phone ?? null,
        email: b.email ?? null,
      })),
    });
  } catch (error) {
    console.error("[GET /api/public/[tenantId]/perfil]", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
