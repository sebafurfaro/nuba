import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdmin,
} from "@/lib/api-tenant-session";
import { insertOrderStatusRow, type CreateOrderStatusInput } from "@/lib/db/order-config";
import { getOrderStatuses } from "@/lib/db/orders";

type Ctx = { params: Promise<{ tenantId: string }> };

const createStatusBodySchema = z.object({
  key: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  color: z.string().max(7).optional(),
  sort_order: z.number().int().optional(),
  triggers_stock: z.boolean().optional(),
  is_terminal: z.boolean().optional(),
  is_cancellable: z.boolean().optional(),
});

/** Cualquier usuario autenticado del tenant puede leer los estados (p. ej. UI pública del tenant). */
export async function GET(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  try {
    const statuses = await getOrderStatuses(gate.tenantUuid);
    return NextResponse.json({ statuses });
  } catch (e) {
    console.error("[GET order-statuses]", e);
    return NextResponse.json({ error: "Error al listar estados" }, { status: 500 });
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireAdmin(gate.session.user.role);
  if (denied) {
    return denied;
  }
  const raw = await request.json().catch(() => null);
  const parsed = createStatusBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const b = parsed.data;
  const input: CreateOrderStatusInput = {
    key: b.key,
    label: b.label,
    color: b.color,
    sort_order: b.sort_order,
    triggers_stock: b.triggers_stock,
    is_terminal: b.is_terminal,
    is_cancellable: b.is_cancellable,
  };
  try {
    const id = await insertOrderStatusRow(gate.tenantUuid, input);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "ER_DUP_ENTRY") {
      return NextResponse.json(
        { error: "Ya existe un estado con esa clave" },
        { status: 409 },
      );
    }
    console.error("[POST order-statuses]", e);
    return NextResponse.json({ error: "Error al crear estado" }, { status: 500 });
  }
}
