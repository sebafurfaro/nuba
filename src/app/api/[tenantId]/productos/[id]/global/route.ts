import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import {
  makeProductBranchSpecific,
  makeProductGlobal,
} from "@/lib/db/products";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const patchSchema = z.object({
  is_global: z.boolean(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id: productId } = await ctx.params;
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
    if (parsed.data.is_global) {
      await makeProductGlobal(gate.tenantUuid, productId);
      return NextResponse.json({ message: "Producto marcado como global" });
    } else {
      await makeProductBranchSpecific(gate.tenantUuid, productId);
      return NextResponse.json({
        message: "Producto marcado como específico por sucursal",
      });
    }
  } catch (e) {
    console.error("[PATCH productos/[id]/global]", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
