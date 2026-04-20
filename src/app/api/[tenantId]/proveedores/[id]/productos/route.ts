import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdmin,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { getSupplierById, upsertSupplierProduct } from "@/lib/db/suppliers";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const upsertProductSchema = z.object({
  product_id: z
    .string()
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      "product_id inválido",
    ),
  cost_price: z.number().positive("El costo debe ser mayor a 0"),
  notes: z.string().max(500).optional().nullable(),
});

export async function GET(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) return denied;

  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  try {
    const supplier = await getSupplierById(gate.tenantUuid, id);
    if (!supplier) {
      return NextResponse.json(
        { error: "Proveedor no encontrado" },
        { status: 404 },
      );
    }
    return NextResponse.json(supplier.products);
  } catch (e) {
    console.error("[GET proveedores/[id]/productos]", e);
    return NextResponse.json(
      { error: "Error al listar productos del proveedor" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdmin(gate.session.user.role);
  if (denied) return denied;

  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = upsertProductSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const supplierProduct = await upsertSupplierProduct(
      gate.tenantUuid,
      id,
      parsed.data,
    );
    return NextResponse.json(supplierProduct);
  } catch (e) {
    console.error("[POST proveedores/[id]/productos]", e);
    return NextResponse.json(
      { error: "Error al agregar producto al proveedor" },
      { status: 500 },
    );
  }
}
