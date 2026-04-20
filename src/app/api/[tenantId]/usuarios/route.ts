import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdmin,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { createUser, getUsers } from "@/lib/db/users";
import { UserDuplicateEmailError } from "@/types/user";

type Ctx = { params: Promise<{ tenantId: string }> };

const createUserSchema = z.object({
  first_name: z.string().min(1, "Requerido").max(100),
  last_name: z.string().min(1, "Requerido").max(100),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
  role_name: z.enum(["supervisor", "vendedor", "cliente"], {
    errorMap: () => ({ message: "Rol inválido" }),
  }),
  phone: z.string().optional().nullable(),
  branch_ids: z
    .array(z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i))
    .min(1, "Asigná al menos una sucursal"),
  primary_branch_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
});

export async function GET(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const isActiveParam = searchParams.get("isActive");
    const filters = {
      search: searchParams.get("search") ?? undefined,
      roleId: searchParams.get("roleId") ?? undefined,
      branchId: searchParams.get("branchId") ?? undefined,
      isActive:
        isActiveParam === "true"
          ? true
          : isActiveParam === "false"
            ? false
            : undefined,
    };
    const data = await getUsers(gate.tenantUuid, filters);
    return NextResponse.json(data);
  } catch (e) {
    console.error("[GET usuarios]", e);
    return NextResponse.json(
      { error: "Error al listar usuarios" },
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
  const parsed = createUserSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const user = await createUser(gate.tenantUuid, parsed.data);
    return NextResponse.json(user, { status: 201 });
  } catch (e) {
    if (e instanceof UserDuplicateEmailError) {
      return NextResponse.json(
        { error: "Ya existe un usuario con ese email" },
        { status: 409 },
      );
    }
    console.error("[POST usuarios]", e);
    return NextResponse.json(
      { error: "Error al crear usuario" },
      { status: 500 },
    );
  }
}
