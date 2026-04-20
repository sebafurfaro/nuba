import { NextResponse } from "next/server";

import {
  getTenantSession,
  requireAdminOrSupervisor,
  requireOrderStaff,
} from "@/lib/api-tenant-session";
import { createCustomerBodySchema } from "@/lib/customer-api-schema";
import { createCustomer, getCustomersSummary } from "@/lib/db/customers";
import type { CustomerSummaryFilters } from "@/types/customer";
import { CustomerDuplicateError } from "@/types/customer";

type Ctx = { params: Promise<{ tenantId: string }> };

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
  try {
    const { searchParams } = new URL(request.url);
    const orderByRaw = searchParams.get("orderBy");
    const orderBy: CustomerSummaryFilters["orderBy"] =
      orderByRaw === "name" ||
      orderByRaw === "last_order_at" ||
      orderByRaw === "total_spent" ||
      orderByRaw === "order_count"
        ? orderByRaw
        : "last_order_at";
    const orderDirRaw = searchParams.get("orderDir");
    const orderDir: CustomerSummaryFilters["orderDir"] =
      orderDirRaw === "asc" || orderDirRaw === "desc" ? orderDirRaw : "desc";
    const pageRaw = parseInt(searchParams.get("page") ?? "1", 10);
    const limitRaw = parseInt(searchParams.get("limit") ?? "25", 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 25;
    const isActiveParam = searchParams.get("isActive");
    const filters: CustomerSummaryFilters = {
      search: searchParams.get("search") ?? undefined,
      isActive:
        isActiveParam === "true" ? true : isActiveParam === "false" ? false : undefined,
      branchId: searchParams.get("branchId") || undefined,
      orderBy,
      orderDir,
      page,
      limit,
    };
    const { data, total } = await getCustomersSummary(gate.tenantUuid, filters);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return NextResponse.json({ data, total, page, totalPages });
  } catch (e) {
    console.error("[GET clientes]", e);
    return NextResponse.json({ error: "Error al listar clientes" }, { status: 500 });
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
  const parsed = createCustomerBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const b = parsed.data;
  try {
    const customer = await createCustomer(gate.tenantUuid, {
      branch_id: b.branch_id ?? null,
      first_name: b.first_name,
      last_name: b.last_name,
      email: b.email ?? null,
      whatsapp: b.whatsapp ?? null,
      phone: b.phone ?? null,
      dni: b.dni ?? null,
      birthdate: b.birthdate ?? null,
      address: b.address ?? null,
      city: b.city ?? null,
      notes: b.notes ?? null,
    });
    return NextResponse.json(customer, { status: 201 });
  } catch (e) {
    if (e instanceof CustomerDuplicateError) {
      return NextResponse.json(
        { error: "Ya existe un cliente con ese email o WhatsApp" },
        { status: 409 },
      );
    }
    console.error("[POST clientes]", e);
    return NextResponse.json({ error: "Error al crear cliente" }, { status: 500 });
  }
}
