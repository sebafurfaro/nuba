import type { RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";

import { pool } from "@/lib/db";
import { getPublicTenant } from "@/lib/public-tenant";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { tenantId: slug, id: orderId } = await ctx.params;

  try {
    const tenant = await getPublicTenant(slug);
    if (!tenant) {
      return NextResponse.json({ error: "Local no encontrado" }, { status: 404 });
    }

    const [orderRows] = await pool.query<RowDataPacket[]>(
      `SELECT o.id, o.status_key, o.total, o.type, o.created_at,
              os.label AS status_label, os.color AS status_color
       FROM orders o
       LEFT JOIN order_statuses os
         ON os.tenant_id = o.tenant_id AND os.\`key\` = o.status_key
       WHERE o.id = ? AND o.tenant_id = ?
       LIMIT 1`,
      [orderId, tenant.id],
    );

    const order = orderRows[0];
    if (!order) {
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    const [itemRows] = await pool.query<RowDataPacket[]>(
      `SELECT name, quantity, unit_price
       FROM order_items
       WHERE order_id = ? AND tenant_id = ?
       ORDER BY id ASC`,
      [orderId, tenant.id],
    );

    const [paymentRows] = await pool.query<RowDataPacket[]>(
      `SELECT status FROM payments
       WHERE order_id = ? AND tenant_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [orderId, tenant.id],
    );

    const paymentStatus = paymentRows[0]?.status ?? null;

    return NextResponse.json({
      id: String(order.id),
      status_key: String(order.status_key),
      status_label: order.status_label ? String(order.status_label) : null,
      status_color: order.status_color ? String(order.status_color) : null,
      total: Number(order.total),
      type: String(order.type),
      created_at: order.created_at instanceof Date
        ? order.created_at.toISOString()
        : String(order.created_at),
      payment_status: paymentStatus,
      items: itemRows.map((i) => ({
        name: String(i.name),
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
      })),
    });
  } catch (error) {
    console.error("[GET /api/public/[tenantId]/orden/[id]]", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
