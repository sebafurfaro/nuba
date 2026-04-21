import { MercadoPagoConfig, Preference } from "mercadopago";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { z } from "zod";

import { pool } from "@/lib/db";
import { createCustomer } from "@/lib/db/customers";
import { getMpAccessTokenForTenant } from "@/lib/db/mp-webhook-payments";
import { createOrder } from "@/lib/db/orders";
import { getPublicTenant } from "@/lib/public-tenant";

type Ctx = { params: Promise<{ tenantId: string }> };

const checkoutSchema = z.object({
  customer_name: z.string().min(1).max(255),
  customer_email: z.string().email(),
  customer_phone: z.string().min(8).max(20),
  type: z.enum(["takeaway", "delivery"]),
  delivery_address: z.string().optional(),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        variant_id: z.string().uuid().optional().nullable(),
        quantity: z.number().int().min(1).max(99),
        notes: z.string().max(255).optional().nullable(),
      }),
    )
    .min(1, "El carrito está vacío"),
  branch_id: z.string().uuid().optional().nullable(),
});

export async function POST(req: Request, ctx: Ctx) {
  const { tenantId: slug } = await ctx.params;

  try {
    const tenant = await getPublicTenant(slug);
    if (!tenant) {
      return NextResponse.json({ error: "Local no encontrado" }, { status: 404 });
    }

    const raw = await req.json().catch(() => null);
    const parsed = checkoutSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const body = parsed.data;

    if (body.type === "delivery" && !body.delivery_address?.trim()) {
      return NextResponse.json(
        { error: "La dirección es requerida para delivery" },
        { status: 400 },
      );
    }

    // Verificar integración de MercadoPago del tenant
    const mpToken = await getMpAccessTokenForTenant(tenant.id);
    if (!mpToken) {
      return NextResponse.json(
        { error: "Este local no tiene MercadoPago configurado" },
        { status: 422 },
      );
    }

    // findOrCreate cliente por email
    let customerId: string | null = null;
    const emailLower = body.customer_email.trim().toLowerCase();
    const [existingRows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM customers WHERE tenant_id = ? AND email = ? LIMIT 1`,
      [tenant.id, emailLower],
    );
    if (existingRows.length > 0) {
      customerId = String(existingRows[0]!.id);
    } else {
      const nameParts = body.customer_name.trim().split(/\s+/);
      const firstName = nameParts[0] ?? body.customer_name;
      const lastName = nameParts.slice(1).join(" ") || "-";
      const newCustomer = await createCustomer(tenant.id, {
        first_name: firstName,
        last_name: lastName,
        email: emailLower,
        phone: body.customer_phone,
      });
      customerId = newCustomer.id;
    }

    // Crear la orden (valida productos y calcula precios reales desde DB)
    const order = await createOrder(tenant.id, null, {
      type: body.type,
      customer_id: customerId ?? undefined,
      customer_name: body.customer_name,
      customer_phone: body.customer_phone,
      delivery_address: body.delivery_address ?? undefined,
      items: body.items.map((i) => ({
        product_id: i.product_id,
        variant_id: i.variant_id ?? undefined,
        quantity: i.quantity,
        notes: i.notes ?? undefined,
      })),
    });

    // Crear preferencia en MercadoPago
    const mpClient = new MercadoPagoConfig({ accessToken: mpToken.access_token });
    const preferenceApi = new Preference(mpClient);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const preferenceResult = await preferenceApi.create({
      body: {
        items: order.items.map((item) => ({
          id: item.product_id ?? item.id,
          title: item.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          currency_id: "ARS",
        })),
        payer: {
          name: body.customer_name,
          email: body.customer_email,
        },
        external_reference: order.id,
        back_urls: {
          success: `${appUrl}/${slug}/checkout/confirmacion`,
          failure: `${appUrl}/${slug}/checkout/confirmacion`,
          pending: `${appUrl}/${slug}/checkout/confirmacion`,
        },
        auto_return: "approved",
        notification_url: `${appUrl}/api/mp/webhook`,
      },
    });

    const preferenceId = preferenceResult.id ?? null;
    const initPoint = preferenceResult.init_point ?? null;

    // Insertar registro de pago pendiente
    const paymentId = crypto.randomUUID();
    await pool.query<ResultSetHeader>(
      `INSERT INTO payments (id, tenant_id, order_id, mp_preference_id, method, status, amount, currency)
       VALUES (?, ?, ?, ?, 'mercadopago', 'pendiente', ?, 'ARS')`,
      [paymentId, tenant.id, order.id, preferenceId, order.total],
    );

    return NextResponse.json(
      {
        order_id: order.id,
        preference_id: preferenceId,
        init_point: initPoint,
      },
      { status: 201 },
    );
  } catch (error) {
    // Error de producto no encontrado o no disponible
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.startsWith("Producto no encontrado") || msg.startsWith("Variación no encontrada")) {
      return NextResponse.json({ error: msg }, { status: 422 });
    }
    console.error("[POST /api/public/[tenantId]/checkout]", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
