import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdmin,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { getBranchById, updateBranch } from "@/lib/db/branches";
import { BranchDuplicateNameError } from "@/types/branch";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const uuidSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const updateBranchSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(255).optional(),
  address: z.string().min(1, "La dirección es requerida").optional(),
  city: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z
    .string()
    .email("Email inválido")
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((v) => v || null),
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
    const branch = await getBranchById(gate.tenantUuid, id);
    if (!branch) {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }
    return NextResponse.json(branch);
  } catch (e) {
    console.error("[GET sucursales/[id]]", e);
    return NextResponse.json(
      { error: "Error al cargar la sucursal" },
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
  const parsed = updateBranchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const branch = await updateBranch(gate.tenantUuid, id, parsed.data);
    return NextResponse.json(branch);
  } catch (e) {
    if (e instanceof BranchDuplicateNameError) {
      return NextResponse.json(
        { error: "Ya existe una sucursal con ese nombre" },
        { status: 409 },
      );
    }
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Sucursal no encontrada") {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }
    console.error("[PUT sucursales/[id]]", e);
    return NextResponse.json(
      { error: "Error al actualizar sucursal" },
      { status: 500 },
    );
  }
}
