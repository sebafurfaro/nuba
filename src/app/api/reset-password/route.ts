import { NextResponse } from "next/server";
import { z } from "zod";

import { applyPasswordReset } from "@/lib/db/users";
import { UserInvalidTokenError } from "@/types/user";

const bodySchema = z
  .object({
    token: z.string().min(1, "Token requerido"),
    password: z.string().min(8, "Mínimo 8 caracteres"),
    password_confirm: z.string().min(1, "Requerido"),
  })
  .refine((d) => d.password === d.password_confirm, {
    message: "Las contraseñas no coinciden",
    path: ["password_confirm"],
  });

export async function POST(request: Request) {
  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await applyPasswordReset(parsed.data.token, parsed.data.password);
    return NextResponse.json({ message: "Contraseña actualizada" });
  } catch (e) {
    if (e instanceof UserInvalidTokenError) {
      return NextResponse.json(
        { error: "Token inválido o expirado" },
        { status: 400 },
      );
    }
    console.error("[POST reset-password]", e);
    return NextResponse.json(
      { error: "Error al actualizar la contraseña" },
      { status: 500 },
    );
  }
}
