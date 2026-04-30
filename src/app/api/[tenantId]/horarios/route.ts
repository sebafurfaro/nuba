import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdmin,
  requireOrderStaff,
} from "@/lib/api-tenant-session";
import { getBusinessHours, upsertBusinessHour } from "@/lib/db/tenant";

type Ctx = { params: Promise<{ tenantId: string }> };

const slotSchema = z.object({
  open_time: z.string().regex(/^\d{2}:\d{2}$/, "Formato inválido, usar HH:MM"),
  close_time: z.string().regex(/^\d{2}:\d{2}$/, "Formato inválido, usar HH:MM"),
});

const putBodySchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  is_open: z.boolean(),
  slots: z
    .array(slotSchema)
    .max(5, "Máximo 5 franjas por día")
    .refine(
      (slots) => slots.every((s) => s.open_time < s.close_time),
      "La apertura debe ser anterior al cierre en cada franja",
    )
    .refine((slots) => {
      for (let i = 1; i < slots.length; i++) {
        if (slots[i]!.open_time < slots[i - 1]!.close_time) return false;
      }
      return true;
    }, "Las franjas horarias no pueden solaparse"),
});

export async function GET(_req: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireOrderStaff(gate.session.user.role);
  if (denied) return denied;

  try {
    const hours = await getBusinessHours(gate.tenantUuid);
    return NextResponse.json(hours);
  } catch (e) {
    console.error("[GET /api/[tenantId]/horarios]", e);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdmin(gate.session.user.role);
  if (denied) return denied;

  const raw = await req.json().catch(() => null);
  const parsed = putBodySchema.safeParse(raw);
  if (!parsed.success) {
    const message =
      parsed.error.errors[0]?.message ?? "Datos inválidos";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const result = await upsertBusinessHour(gate.tenantUuid, parsed.data);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("anterior al cierre")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[PUT /api/[tenantId]/horarios]", e);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
