import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { z } from "zod";

import { getTenantSession, requireAdmin } from "@/lib/api-tenant-session";
import { pool } from "@/lib/db";
import { updateFeatureFlag, updateFeatureFlags } from "@/lib/db/tenant";
import type { FeatureFlagKey } from "@/types/tenant";

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

const patchFlagSchema = z.object({
  flag_key: z.string().min(1),
  is_enabled: z.boolean(),
});

export async function PATCH(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdmin(gate.session.user.role);
  if (denied) return denied;

  const raw = await request.json().catch(() => null);
  const parsed = patchFlagSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const flag = await updateFeatureFlag(
      gate.tenantUuid,
      parsed.data.flag_key as FeatureFlagKey,
      parsed.data.is_enabled,
    );
    return NextResponse.json(flag);
  } catch (e) {
    console.error("[PATCH banderas]", e);
    return NextResponse.json(
      { error: "Error al actualizar el flag" },
      { status: 500 },
    );
  }
}

const putFlagsSchema = z.object({
  flags: z
    .array(
      z.object({
        flag_key: z.string().min(1),
        is_enabled: z.boolean(),
      }),
    )
    .min(1, "Se requiere al menos un flag"),
});

export async function PUT(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdmin(gate.session.user.role);
  if (denied) return denied;

  const raw = await request.json().catch(() => null);
  const parsed = putFlagsSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const flags = await updateFeatureFlags(
      gate.tenantUuid,
      parsed.data.flags.map((f) => ({
        flag_key: f.flag_key as FeatureFlagKey,
        is_enabled: f.is_enabled,
      })),
    );
    return NextResponse.json(flags);
  } catch (e) {
    console.error("[PUT banderas]", e);
    return NextResponse.json(
      { error: "Error al actualizar los flags" },
      { status: 500 },
    );
  }
}
