import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdmin,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { createSupplier, getSuppliers } from "@/lib/db/suppliers";
import { SupplierDuplicateNameError } from "@/types/supplier";

type Ctx = { params: Promise<{ tenantId: string }> };

const createSupplierSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(255),
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
});

export async function GET(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? undefined;
  const isActiveParam = searchParams.get("isActive");
  const isActive =
    isActiveParam === "true"
      ? true
      : isActiveParam === "false"
        ? false
        : undefined;

  try {
    const suppliers = await getSuppliers(gate.tenantUuid, { search, isActive });
    return NextResponse.json(suppliers);
  } catch (e) {
    console.error("[GET proveedores]", e);
    return NextResponse.json(
      { error: "Error al listar proveedores" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdmin(gate.session.user.role);
  if (denied) return denied;

  const raw = await request.json().catch(() => null);
  const parsed = createSupplierSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const supplier = await createSupplier(gate.tenantUuid, parsed.data);
    return NextResponse.json(supplier, { status: 201 });
  } catch (e) {
    if (e instanceof SupplierDuplicateNameError) {
      return NextResponse.json(
        { error: "Ya existe un proveedor con ese nombre" },
        { status: 409 },
      );
    }
    console.error("[POST proveedores]", e);
    return NextResponse.json(
      { error: "Error al crear proveedor" },
      { status: 500 },
    );
  }
}
