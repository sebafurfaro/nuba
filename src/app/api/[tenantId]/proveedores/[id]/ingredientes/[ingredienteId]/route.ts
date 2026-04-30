import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdmin,
} from "@/lib/api-tenant-session";
import {
  removeSupplierIngredient,
  updateSupplierIngredient,
} from "@/lib/db/suppliers";

type Ctx = {
  params: Promise<{ tenantId: string; id: string; ingredienteId: string }>;
};

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const updateSchema = z.object({
  purchase_unit: z.string().min(1).max(100).optional(),
  purchase_qty: z.number().positive().optional(),
  cost_per_purchase: z.number().min(0).optional(),
  es_principal: z.boolean().optional(),
  notes: z.string().max(500).optional().nullable(),
});

export async function PATCH(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, ingredienteId } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdmin(gate.session.user.role);
  if (denied) return denied;

  if (!uuidSchema.safeParse(ingredienteId).success) {
    return NextResponse.json({ error: "ingredienteId inválido" }, { status: 400 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const item = await updateSupplierIngredient(
      gate.tenantUuid,
      ingredienteId,
      parsed.data,
    );
    return NextResponse.json(item);
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return NextResponse.json(
        { error: "Vínculo no encontrado" },
        { status: 404 },
      );
    }
    console.error("[PATCH proveedores/[id]/ingredientes/[ingredienteId]]", e);
    return NextResponse.json(
      { error: "Error al actualizar el ingrediente del proveedor" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, ingredienteId } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdmin(gate.session.user.role);
  if (denied) return denied;

  if (!uuidSchema.safeParse(ingredienteId).success) {
    return NextResponse.json({ error: "ingredienteId inválido" }, { status: 400 });
  }

  try {
    await removeSupplierIngredient(gate.tenantUuid, ingredienteId);
    return NextResponse.json({ message: "Ingrediente desvinculado" });
  } catch (e) {
    console.error("[DELETE proveedores/[id]/ingredientes/[ingredienteId]]", e);
    return NextResponse.json(
      { error: "Error al eliminar el ingrediente del proveedor" },
      { status: 500 },
    );
  }
}
