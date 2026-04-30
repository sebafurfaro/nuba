import { NextResponse } from "next/server";
import { z } from "zod";

import { getTenantSession, requireAdmin } from "@/lib/api-tenant-session";
import { getTenantTema, updateTenantTema } from "@/lib/db/tenant";

type Ctx = { params: Promise<{ tenantId: string }> };

const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Debe ser un color hexadecimal válido (#RRGGBB)");

const temaSchema = z.object({
  colorPrimario: hexColor,
  colorSecundario: hexColor,
  colorFondo: hexColor,
  colorTexto: hexColor,
  colorLinks: hexColor,
});

export async function GET(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdmin(gate.session.user.role);
  if (denied) return denied;

  try {
    const tema = await getTenantTema(gate.tenantUuid);
    return NextResponse.json(tema);
  } catch (e) {
    console.error("[GET perfil/tema]", e);
    return NextResponse.json(
      { error: "Error al cargar el tema" },
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
  const parsed = temaSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const tema = await updateTenantTema(gate.tenantUuid, parsed.data);
    return NextResponse.json(tema);
  } catch (e) {
    console.error("[PATCH perfil/tema]", e);
    return NextResponse.json(
      { error: "Error al guardar el tema" },
      { status: 500 },
    );
  }
}
