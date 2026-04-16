import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";

import {
  getTenantSession,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { pool } from "@/lib/db";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const bodySchema = z.object({
  name: z.string().min(1).max(100),
  sku: z.string().max(100).nullable().optional(),
  price: z.number().nonnegative().nullable().optional(),
  stock: z.number().int().min(0),
});

export async function POST(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id: productId } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) {
    return denied;
  }

  const [p] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM products WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [productId, gate.tenantUuid],
  );
  if (!p.length) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
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
  const variantId = crypto.randomUUID();
  const vsku =
    b.sku && String(b.sku).trim() !== "" ? String(b.sku).trim() : null;

  try {
    await pool.query<ResultSetHeader>(
      `INSERT INTO product_variants (
        id, tenant_id, product_id, name, sku, price, stock, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        variantId,
        gate.tenantUuid,
        productId,
        b.name,
        vsku,
        b.price ?? null,
        b.stock,
      ],
    );
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "ER_DUP_ENTRY") {
      return NextResponse.json(
        { error: "SKU de variación duplicado" },
        { status: 409 },
      );
    }
    console.error("[POST variant]", e);
    return NextResponse.json({ error: "Error al crear variación" }, { status: 500 });
  }

  return NextResponse.json({ id: variantId }, { status: 201 });
}
