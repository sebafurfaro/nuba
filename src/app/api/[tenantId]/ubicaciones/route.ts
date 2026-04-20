import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdminOrSupervisor,
  requireOrderStaff,
} from "@/lib/api-tenant-session";
import {
  insertLocation,
  insertLocationsBulk,
  type CreateLocationInput,
} from "@/lib/db/order-config";
import { getLocations } from "@/lib/db/orders";
import type { LocationType } from "@/types/order";

type Ctx = { params: Promise<{ tenantId: string }> };

const locationTypeEnum = z.enum([
  "table",
  "counter",
  "takeaway",
  "delivery",
  "online",
]);

const createLocationBodySchema = z
  .object({
    branch_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).nullable().optional(),
    table_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).nullable().optional(),
    type: locationTypeEnum,
    name: z.string().max(100).optional(),
    /** Si viene con `name_prefix`, crea N ubicaciones `{prefix} 1` … `{prefix} N`. */
    bulk_count: z.number().int().min(1).max(100).optional(),
    name_prefix: z.string().max(80).optional(),
    capacity: z.number().int().min(0).nullable().optional(),
    is_active: z.boolean().optional(),
    is_reservable: z.boolean().optional(),
    accepts_queue: z.boolean().optional(),
    sort_order: z.number().int().optional(),
  })
  .superRefine((data, ctx) => {
    const bulk = data.bulk_count != null;
    if (bulk) {
      const p = data.name_prefix?.trim() ?? "";
      if (!p) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["name_prefix"],
          message: "Indicá un prefijo para los nombres",
        });
      }
    } else {
      const n = data.name?.trim() ?? "";
      if (!n) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["name"],
          message: "Indicá un nombre",
        });
      }
    }
  });

export async function GET(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireOrderStaff(gate.session.user.role);
  if (denied) {
    return denied;
  }
  const { searchParams } = new URL(request.url);
  const branchId = searchParams.get("branchId") ?? undefined;
  const typeRaw = searchParams.get("type");
  let type: LocationType | undefined;
  if (typeRaw) {
    const parsed = locationTypeEnum.safeParse(typeRaw);
    if (!parsed.success) {
      return NextResponse.json({ error: "type inválido" }, { status: 400 });
    }
    type = parsed.data;
  }
  try {
    const locations = await getLocations(gate.tenantUuid, {
      branchId,
      type,
    });
    const body = locations.map((loc) => {
      const { active_orders, ...rest } = loc;
      const previews =
        active_orders?.map((o) => ({
          id: o.id,
          status_key: o.status_key,
          total: o.total,
          created_at: o.created_at,
          item_count: o.items.length,
          status_color: o.status?.color,
          status_label: o.status?.label,
        })) ?? [];
      return {
        ...rest,
        active_order_count: previews.length,
        active_orders_preview: previews,
      };
    });
    return NextResponse.json({ locations: body });
  } catch (e) {
    console.error("[GET locations]", e);
    const details = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Error al listar locations", details },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) {
    return denied;
  }
  const raw = await request.json().catch(() => null);
  const parsed = createLocationBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const b = parsed.data;
  try {
    if (b.bulk_count != null) {
      const ids = await insertLocationsBulk(gate.tenantUuid, {
        branch_id: b.branch_id ?? undefined,
        table_id: b.table_id ?? undefined,
        type: b.type,
        name_prefix: b.name_prefix!.trim(),
        count: b.bulk_count,
        capacity: b.capacity,
        is_active: b.is_active,
        is_reservable: b.is_reservable,
        accepts_queue: b.accepts_queue,
        sort_order: b.sort_order,
      });
      return NextResponse.json({ ids, count: ids.length }, { status: 201 });
    }
    const input: CreateLocationInput = {
      branch_id: b.branch_id ?? undefined,
      table_id: b.table_id ?? undefined,
      type: b.type,
      name: b.name!.trim(),
      capacity: b.capacity,
      is_active: b.is_active,
      is_reservable: b.is_reservable,
      accepts_queue: b.accepts_queue,
      sort_order: b.sort_order,
    };
    const id = await insertLocation(gate.tenantUuid, input);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "ER_DUP_ENTRY") {
      return NextResponse.json({ error: "Duplicado" }, { status: 409 });
    }
    const msg = e instanceof Error ? e.message : "Error al crear location";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
