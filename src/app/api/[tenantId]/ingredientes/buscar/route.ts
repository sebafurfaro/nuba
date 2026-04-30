import { NextRequest, NextResponse } from "next/server";

import { searchIngredients } from "@/lib/db/suppliers";
import { getTenantSession } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;

  const session = await getTenantSession(tenantId);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const q = (searchParams.get("q") ?? "").trim();
  const excludeSupplierId = searchParams.get("excluir_proveedor") ?? undefined;

  try {
    const results = await searchIngredients(tenantId, q, excludeSupplierId);
    return NextResponse.json(results);
  } catch (error) {
    console.error("[GET /api/ingredientes/buscar]", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
