import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdmin,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import {
  createIngredientAndLink,
  getSupplierIngredients,
  linkExistingIngredient,
} from "@/lib/db/suppliers";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const purchaseFields = {
  purchase_unit: z.string().min(1, "La unidad de compra es requerida").max(100),
  purchase_qty: z.number().positive("La cantidad debe ser mayor a 0"),
  cost_per_purchase: z.number().min(0, "El costo debe ser >= 0"),
  es_principal: z.boolean().default(false),
  initial_stock_qty: z.number().min(0).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
};

const nuevoSchema = z.object({
  modo: z.literal("nuevo"),
  nombre: z.string().min(1, "El nombre es requerido").max(255),
  unit: z.enum(["ml", "l", "g", "kg", "u", "porciones"]),
  stock_minimo: z.number().min(0).optional().nullable(),
  ...purchaseFields,
});

const existenteSchema = z.object({
  modo: z.literal("existente"),
  ingredient_id: z
    .string()
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      "ingredient_id inválido",
    ),
  ...purchaseFields,
});

const postSchema = z.discriminatedUnion("modo", [nuevoSchema, existenteSchema]);

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
    const items = await getSupplierIngredients(gate.tenantUuid, id);
    return NextResponse.json(items);
  } catch (e) {
    console.error("[GET proveedores/[id]/ingredientes]", e);
    return NextResponse.json(
      { error: "Error al listar ingredientes del proveedor" },
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
  const parsed = postSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    let item;
    if (parsed.data.modo === "nuevo") {
      item = await createIngredientAndLink(gate.tenantUuid, id, parsed.data);
    } else {
      item = await linkExistingIngredient(gate.tenantUuid, id, parsed.data);
    }
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "ALREADY_LINKED") {
        return NextResponse.json(
          { error: "Este ingrediente ya está vinculado al proveedor" },
          { status: 409 },
        );
      }
      if (e.message === "INGREDIENT_NOT_FOUND") {
        return NextResponse.json(
          { error: "Ingrediente no encontrado" },
          { status: 404 },
        );
      }
    }
    console.error("[POST proveedores/[id]/ingredientes]", e);
    return NextResponse.json(
      { error: "Error al agregar ingrediente al proveedor" },
      { status: 500 },
    );
  }
}
