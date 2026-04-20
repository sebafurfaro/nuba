import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import {
  unassignProductFromBranch,
  updateBranchProductPrice,
} from "@/lib/db/products";

type Ctx = {
  params: Promise<{ tenantId: string; id: string; branchId: string }>;
};

export async function DELETE(_req: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id: productId, branchId } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) return denied;

  try {
    await unassignProductFromBranch(gate.tenantUuid, productId, branchId);
    return NextResponse.json({ message: "Producto desasignado de la sucursal" });
  } catch (e) {
    console.error("[DELETE productos/[id]/sucursales/[branchId]]", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

const patchSchema = z.object({
  price_override: z.number().positive().nullable(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id: productId, branchId } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) return denied;

  const raw = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const updated = await updateBranchProductPrice(
      gate.tenantUuid,
      productId,
      branchId,
      parsed.data.price_override,
    );
    return NextResponse.json(updated);
  } catch (e) {
    console.error("[PATCH productos/[id]/sucursales/[branchId]]", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
