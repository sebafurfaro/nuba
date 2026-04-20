import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdmin,
} from "@/lib/api-tenant-session";
import { deactivateBranch } from "@/lib/db/branches";
import { BranchLastActiveError } from "@/types/branch";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

export async function PATCH(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdmin(gate.session.user.role);
  if (denied) return denied;

  if (!z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).safeParse(id).success) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  try {
    await deactivateBranch(gate.tenantUuid, id);
    return NextResponse.json({ message: "Sucursal desactivada" });
  } catch (e) {
    if (e instanceof BranchLastActiveError) {
      return NextResponse.json(
        { error: "No podés desactivar la única sucursal activa" },
        { status: 409 },
      );
    }
    console.error("[PATCH sucursales/[id]/desactivar]", e);
    return NextResponse.json(
      { error: "Error al desactivar sucursal" },
      { status: 500 },
    );
  }
}
