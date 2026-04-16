import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { getTenantSession } from "@/lib/api-tenant-session";
import { pool } from "@/lib/db";
import { deductStockFromOrderWithConnection } from "@/lib/db/recipes";

type Ctx = {
  params: Promise<{ tenantId: string; mesaId: string; orderId: string }>;
};

/**
 * Marca la orden como entregada, descuenta stock (misma lógica que `deductStockFromOrder`)
 * y notifica stock bajo. Todo en una transacción MySQL.
 */
export async function POST(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, mesaId, orderId } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [ordRows] = await conn.query<RowDataPacket[]>(
      `SELECT id, status, table_id FROM orders WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [orderId, gate.tenantUuid],
    );
    const ord = ordRows[0] as
      | { id: string; status: string; table_id: string | null }
      | undefined;
    if (!ord) {
      await conn.rollback();
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }
    if (ord.table_id !== mesaId) {
      await conn.rollback();
      return NextResponse.json(
        { error: "La orden no pertenece a esta mesa" },
        { status: 403 },
      );
    }
    if (ord.status === "entregado") {
      await conn.rollback();
      return NextResponse.json(
        { error: "El pedido ya fue entregado" },
        { status: 409 },
      );
    }
    if (ord.status === "cancelado") {
      await conn.rollback();
      return NextResponse.json(
        { error: "No se puede entregar un pedido cancelado" },
        { status: 409 },
      );
    }

    const [upd] = await conn.query<ResultSetHeader>(
      `UPDATE orders SET status = 'entregado', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND tenant_id = ? AND table_id = ? AND status <> 'entregado'`,
      [orderId, gate.tenantUuid, mesaId],
    );
    if (upd.affectedRows !== 1) {
      await conn.rollback();
      return NextResponse.json(
        { error: "No se pudo actualizar el pedido" },
        { status: 409 },
      );
    }

    const affectedIngredientIds = await deductStockFromOrderWithConnection(
      conn,
      gate.tenantUuid,
      orderId,
    );

    if (affectedIngredientIds.size > 0) {
      const ids = [...affectedIngredientIds];
      const placeholders = ids.map(() => "?").join(", ");
      const [lowRows] = await conn.query<RowDataPacket[]>(
        `SELECT name FROM ingredients
         WHERE tenant_id = ?
           AND id IN (${placeholders})
           AND stock_alert_threshold IS NOT NULL
           AND stock_quantity < stock_alert_threshold`,
        [gate.tenantUuid, ...ids],
      );
      if (lowRows.length > 0) {
        const names = lowRows.map((r) => String(r.name)).join(", ");
        const notifId = crypto.randomUUID();
        await conn.query<ResultSetHeader>(
          `INSERT INTO notifications (id, tenant_id, user_id, type, title, body, link, is_read)
           VALUES (?, ?, NULL, 'warning', ?, ?, NULL, FALSE)`,
          [
            notifId,
            gate.tenantUuid,
            "Stock bajo",
            `Los siguientes ingredientes están por debajo del mínimo: ${names}`,
          ],
        );
      }
    }

    await conn.commit();
    return NextResponse.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    console.error("[POST confirmar pedido]", e);
    return NextResponse.json({ error: "Error al confirmar el pedido" }, { status: 500 });
  } finally {
    conn.release();
  }
}
