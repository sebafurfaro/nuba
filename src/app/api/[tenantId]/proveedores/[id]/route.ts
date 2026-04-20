import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdmin,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { getSupplierById, updateSupplier } from "@/lib/db/suppliers";
import { SupplierDuplicateNameError } from "@/types/supplier";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const updateSupplierSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(255).optional(),
  contact_name: z.string().max(255).optional().nullable(),
  email: z
    .string()
    .email("Email inválido")
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((v) => v || null),
  phone: z.string().max(50).optional().nullable(),
  whatsapp: z.string().max(50).optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  is_active: z.boolean().optional(),
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
    return NextResponse.json(supplier);
  } catch (e) {
    console.error("[GET proveedores/[id]]", e);
    return NextResponse.json(
      { error: "Error al obtener el proveedor" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdmin(gate.session.user.role);
  if (denied) return denied;

  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = updateSupplierSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const supplier = await updateSupplier(gate.tenantUuid, id, parsed.data);
    return NextResponse.json(supplier);
  } catch (e) {
    if (e instanceof SupplierDuplicateNameError) {
      return NextResponse.json(
        { error: "Ya existe un proveedor con ese nombre" },
        { status: 409 },
      );
    }
    console.error("[PUT proveedores/[id]]", e);
    return NextResponse.json(
      { error: "Error al actualizar el proveedor" },
      { status: 500 },
    );
  }
}
