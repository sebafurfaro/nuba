import { NextResponse } from "next/server";

import { getTenantTemaBySlug } from "@/lib/db/tenant";

type Ctx = { params: Promise<{ tenantId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { tenantId: slug } = await ctx.params;

  try {
    const tema = await getTenantTemaBySlug(slug);
    if (!tema) {
      return NextResponse.json({ error: "Local no encontrado" }, { status: 404 });
    }
    return NextResponse.json(tema, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (e) {
    console.error("[GET /api/public/[tenantId]/tema]", e);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
