import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdmin,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { deleteUser, getUserById, updateUser } from "@/lib/db/users";
import {
  UserDuplicateEmailError,
  UserLastAdminError,
} from "@/types/user";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const uuidSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const updateUserSchema = z
  .object({
    first_name: z.string().min(1).max(100).optional(),
    last_name: z.string().min(1).max(100).optional(),
    email: z.string().email("Email inválido").optional(),
    role_name: z
      .enum(["supervisor", "vendedor", "cliente"])
      .optional(),
    phone: z.string().optional().nullable(),
    branch_ids: z.array(z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)).min(1).optional(),
    primary_branch_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).optional(),
  })
  .refine(
    (d) =>
      d.branch_ids === undefined ||
      d.primary_branch_id !== undefined,
    {
      message: "primary_branch_id es requerido cuando se envía branch_ids",
      path: ["primary_branch_id"],
    },
  );

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
    const user = await getUserById(gate.tenantUuid, id);
    if (!user) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json(user);
  } catch (e) {
    console.error("[GET usuarios/[id]]", e);
    return NextResponse.json(
      { error: "Error al cargar el usuario" },
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
  const parsed = updateUserSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const user = await updateUser(gate.tenantUuid, id, parsed.data);
    return NextResponse.json(user);
  } catch (e) {
    if (e instanceof UserDuplicateEmailError) {
      return NextResponse.json(
        { error: "Ya existe un usuario con ese email" },
        { status: 409 },
      );
    }
    if (e instanceof UserLastAdminError) {
      return NextResponse.json(
        { error: "No podés cambiar el rol del único administrador" },
        { status: 409 },
      );
    }
    console.error("[PUT usuarios/[id]]", e);
    return NextResponse.json(
      { error: "Error al actualizar usuario" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdmin(gate.session.user.role);
  if (denied) return denied;

  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  try {
    await deleteUser(gate.tenantUuid, id);
    return NextResponse.json({ message: "Usuario desactivado" });
  } catch (e) {
    if (e instanceof UserLastAdminError) {
      return NextResponse.json(
        { error: "No podés desactivar al único administrador" },
        { status: 409 },
      );
    }
    console.error("[DELETE usuarios/[id]]", e);
    return NextResponse.json(
      { error: "Error al desactivar usuario" },
      { status: 500 },
    );
  }
}
