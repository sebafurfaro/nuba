import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdmin,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { getTenantById, updateTenantProfile } from "@/lib/db/tenant";

type Ctx = { params: Promise<{ tenantId: string }> };

const updateProfileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(500).optional().nullable(),
  email: z.string().email("Email inválido").optional(),
  phone: z.string().max(50).optional().nullable(),
  logo_url: z.string().optional().nullable(),
  banner_url: z.string().optional().nullable(),
  website: z
    .string()
    .url("URL inválida")
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((v) => v || null),
  instagram: z.string().max(100).optional().nullable(),
  tiktok: z.string().max(100).optional().nullable(),
  youtube: z
    .string()
    .url("URL inválida")
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((v) => v || null),
  facebook: z.string().max(100).optional().nullable(),
  whatsapp: z.string().max(50).optional().nullable(),
});

export async function GET(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) return denied;

  try {
    const tenant = await getTenantById(gate.tenantUuid);
    if (!tenant) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json(tenant);
  } catch (e) {
    console.error("[GET perfil]", e);
    return NextResponse.json(
      { error: "Error al cargar el perfil" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdmin(gate.session.user.role);
  if (denied) return denied;

  const raw = await request.json().catch(() => null);
  const parsed = updateProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const tenant = await updateTenantProfile(gate.tenantUuid, parsed.data);
    return NextResponse.json(tenant);
  } catch (e) {
    console.error("[PATCH perfil]", e);
    return NextResponse.json(
      { error: "Error al actualizar el perfil" },
      { status: 500 },
    );
  }
}
