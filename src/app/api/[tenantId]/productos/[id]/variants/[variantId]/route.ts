import { NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2/promise";
import { z } from "zod";

import {
  getTenantSession,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { pool } from "@/lib/db";

type Ctx = { params: Promise<{ tenantId: string; id: string; variantId: string }> };

const bodySchema = z.object({
  name: z.string().min(1).max(100),
  sku: z.string().max(100).nullable().optional(),
  price: z.number().nonnegative().nullable().optional(),
  stock: z.number().int().min(0),
});

export async function PUT(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id: productId, variantId } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) {
    return denied;
  }

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const b = parsed.data;
  const vsku =
    b.sku && String(b.sku).trim() !== "" ? String(b.sku).trim() : null;

  try {
    const [res] = await pool.query<ResultSetHeader>(
      `UPDATE product_variants SET
        name = ?, sku = ?, price = ?, stock = ?
       WHERE id = ? AND product_id = ? AND tenant_id = ?`,
      [b.name, vsku, b.price ?? null, b.stock, variantId, productId, gate.tenantUuid],
    );
    if (res.affectedRows === 0) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "ER_DUP_ENTRY") {
      return NextResponse.json(
        { error: "SKU de variación duplicado" },
        { status: 409 },
      );
    }
    console.error("[PUT variant]", e);
    return NextResponse.json({ error: "Error al actualizar variación" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
