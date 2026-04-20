import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdminOrSupervisor,
  requireOrderStaff,
} from "@/lib/api-tenant-session";
import { updateCustomerBodySchema } from "@/lib/customer-api-schema";
import {
  deleteCustomer,
  getCustomerById,
  getCustomerFavoriteProducts,
  getCustomerMetrics,
  getCustomerOrdersByMonth,
  updateCustomer,
} from "@/lib/db/customers";
import type { CustomerWithMetrics, UpdateCustomerInput } from "@/types/customer";
import { CustomerDuplicateError } from "@/types/customer";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireOrderStaff(gate.session.user.role);
  if (denied) {
    return denied;
  }
  if (!z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).safeParse(id).success) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  try {
    const [customer, metrics, favorites, byMonth] = await Promise.all([
      getCustomerById(gate.tenantUuid, id),
      getCustomerMetrics(gate.tenantUuid, id),
      getCustomerFavoriteProducts(gate.tenantUuid, id, 10),
      getCustomerOrdersByMonth(gate.tenantUuid, id, 24),
    ]);
    if (!customer) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    const payload: CustomerWithMetrics = {
      ...customer,
      metrics: {
        order_count: metrics.order_count,
        total_spent: metrics.total_spent,
        avg_ticket: metrics.avg_ticket,
        last_order_at: metrics.last_order_at,
        first_order_at: metrics.first_order_at,
        favorite_products: favorites.map((f) => ({
          product_id: f.product_id,
          name: f.name,
          image_url: null,
          times_ordered: f.quantity_sold,
        })),
        orders_by_month: byMonth.map((r) => ({
          month: r.month,
          count: r.order_count,
          total: r.total,
        })),
      },
    };
    return NextResponse.json(payload);
  } catch (e) {
    console.error("[GET clientes/[id]]", e);
    return NextResponse.json({ error: "Error al cargar el cliente" }, { status: 500 });
  }
}

export async function PUT(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) {
    return denied;
  }
  if (!z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).safeParse(id).success) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  const raw = await request.json().catch(() => null);
  const parsed = updateCustomerBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const b = parsed.data;
  try {
    const patch: UpdateCustomerInput = {};
    if (b.first_name !== undefined) {
      patch.first_name = b.first_name;
    }
    if (b.last_name !== undefined) {
      patch.last_name = b.last_name;
    }
    if (b.email !== undefined) {
      patch.email = b.email;
    }
    if (b.whatsapp !== undefined) {
      patch.whatsapp = b.whatsapp;
    }
    if (b.phone !== undefined) {
      patch.phone = b.phone;
    }
    if (b.dni !== undefined) {
      patch.dni = b.dni;
    }
    if (b.birthdate !== undefined) {
      patch.birthdate = b.birthdate;
    }
    if (b.address !== undefined) {
      patch.address = b.address;
    }
    if (b.city !== undefined) {
      patch.city = b.city;
    }
    if (b.notes !== undefined) {
      patch.notes = b.notes;
    }
    if (b.branch_id !== undefined) {
      patch.branch_id = b.branch_id;
    }
    const customer = await updateCustomer(gate.tenantUuid, id, patch);
    return NextResponse.json(customer);
  } catch (e) {
    if (e instanceof CustomerDuplicateError) {
      return NextResponse.json(
        { error: "Ya existe un cliente con ese email o WhatsApp" },
        { status: 409 },
      );
    }
    console.error("[PUT clientes/[id]]", e);
    return NextResponse.json({ error: "Error al actualizar cliente" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) {
    return denied;
  }
  if (!z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).safeParse(id).success) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  try {
    await deleteCustomer(gate.tenantUuid, id);
    return NextResponse.json({ message: "Cliente desactivado" });
  } catch (e) {
    console.error("[DELETE clientes/[id]]", e);
    return NextResponse.json({ error: "Error al desactivar cliente" }, { status: 500 });
  }
}
