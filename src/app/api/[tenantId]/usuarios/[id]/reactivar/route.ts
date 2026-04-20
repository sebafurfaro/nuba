import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdmin,
} from "@/lib/api-tenant-session";
import { reactivateUser } from "@/lib/db/users";

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
    await reactivateUser(gate.tenantUuid, id);
    return NextResponse.json({ message: "Usuario reactivado" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Usuario no encontrado") {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    console.error("[PATCH usuarios/[id]/reactivar]", e);
    return NextResponse.json(
      { error: "Error al reactivar usuario" },
      { status: 500 },
    );
  }
}
