import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdmin,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { createBranch, getBranches } from "@/lib/db/branches";
import { BranchDuplicateNameError } from "@/types/branch";

type Ctx = { params: Promise<{ tenantId: string }> };

const createBranchSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(255),
  address: z.string().min(1, "La dirección es requerida"),
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
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) return denied;

  try {
    const branches = await getBranches(gate.tenantUuid);
    return NextResponse.json(branches);
  } catch (e) {
    console.error("[GET sucursales]", e);
    return NextResponse.json(
      { error: "Error al listar sucursales" },
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
  const parsed = createBranchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const branch = await createBranch(gate.tenantUuid, parsed.data);
    return NextResponse.json(branch, { status: 201 });
  } catch (e) {
    if (e instanceof BranchDuplicateNameError) {
      return NextResponse.json(
        { error: "Ya existe una sucursal con ese nombre" },
        { status: 409 },
      );
    }
    console.error("[POST sucursales]", e);
    return NextResponse.json(
      { error: "Error al crear sucursal" },
      { status: 500 },
    );
  }
}
