import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { pool } from "@/lib/db";
import { getBranches } from "@/lib/db/branches";
import {
  assignProductToBranch,
  getProductBranchAssignments,
} from "@/lib/db/products";
import type { RowDataPacket } from "mysql2/promise";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id: productId } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) return denied;

  try {
    // Verify product belongs to tenant and get is_global
    const [pRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, is_global FROM products WHERE tenant_id = ? AND id = ? LIMIT 1`,
      [gate.tenantUuid, productId],
    );
    if (!pRows.length) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }
    const is_global = Boolean(pRows[0]!.is_global);

    const [assignments, allBranches] = await Promise.all([
      getProductBranchAssignments(gate.tenantUuid, productId),
      getBranches(gate.tenantUuid),
    ]);

    return NextResponse.json({
      is_global,
      assignments,
      all_branches: allBranches.map((b) => ({
        id: b.id,
        name: b.name,
        city: b.city,
        is_active: b.is_active,
      })),
    });
  } catch (e) {
    console.error("[GET productos/[id]/sucursales]", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

const postSchema = z.object({
  branch_id: z.string().uuid("branch_id inválido"),
  price_override: z.number().positive().nullable().optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id: productId } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) return denied;

  const raw = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const assignment = await assignProductToBranch(
      gate.tenantUuid,
      productId,
      parsed.data.branch_id,
      parsed.data.price_override ?? null,
    );
    return NextResponse.json(assignment, { status: 201 });
  } catch (e) {
    console.error("[POST productos/[id]/sucursales]", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
