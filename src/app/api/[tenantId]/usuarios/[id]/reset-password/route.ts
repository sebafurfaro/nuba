import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdmin,
} from "@/lib/api-tenant-session";
import { generateTempPassword, sendPasswordResetEmail } from "@/lib/db/users";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const bodySchema = z.object({
  type: z.enum(["email", "temp"], {
    errorMap: () => ({ message: "type debe ser 'email' o 'temp'" }),
  }),
});

export async function POST(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdmin(gate.session.user.role);
  if (denied) return denied;

  if (!z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).safeParse(id).success) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.type === "temp") {
      const tempPassword = await generateTempPassword(gate.tenantUuid, id);
      return NextResponse.json({ temp_password: tempPassword });
    }
    await sendPasswordResetEmail(gate.tenantUuid, id);
    return NextResponse.json({ message: "Email enviado" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Usuario no encontrado" || msg === "Usuario no encontrado o inactivo") {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    if (msg === "No se pudo enviar el email de restablecimiento") {
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    console.error("[POST usuarios/[id]/reset-password]", e);
    return NextResponse.json(
      { error: "Error al resetear contraseña" },
      { status: 500 },
    );
  }
}
