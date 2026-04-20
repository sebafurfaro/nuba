import { NextResponse } from "next/server";

import { validateResetToken } from "@/lib/db/users";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token?.trim()) {
    return NextResponse.json(
      { error: "Token requerido" },
      { status: 400 },
    );
  }
  try {
    const result = await validateResetToken(token);
    if (!result.valid) {
      return NextResponse.json(
        { valid: false, expired: result.expired ?? false },
        { status: 200 },
      );
    }
    return NextResponse.json({ valid: true, expired: false });
  } catch (e) {
    console.error("[GET reset-password/validate]", e);
    return NextResponse.json(
      { error: "Error al validar el token" },
      { status: 500 },
    );
  }
}
