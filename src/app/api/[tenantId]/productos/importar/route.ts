import { parse } from "papaparse";
import { NextResponse } from "next/server";

import {
  getTenantSession,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { importProductsFromCSV } from "@/lib/db/products";
import type { CSVProductRow } from "@/types/product";

type Ctx = { params: Promise<{ tenantId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) return denied;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "El body debe ser multipart/form-data" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No se recibió ningún archivo (campo 'file' requerido)" },
      { status: 400 },
    );
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json(
      { error: "El archivo debe ser CSV (.csv)" },
      { status: 400 },
    );
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: "El archivo no puede superar 5 MB" },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json(
      { error: "El archivo está vacío" },
      { status: 400 },
    );
  }

  const text = await file.text();

  const { data, errors: parseErrors } = parse<CSVProductRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  if (parseErrors.length > 0) {
    return NextResponse.json(
      { error: "El CSV tiene errores de formato", details: parseErrors },
      { status: 400 },
    );
  }

  if (!data.length) {
    return NextResponse.json(
      { error: "El CSV no contiene filas de datos" },
      { status: 400 },
    );
  }

  const headers = Object.keys(data[0]!);
  const requiredColumns = ["nombre", "precio"];
  const missingColumns = requiredColumns.filter((c) => !headers.includes(c));
  if (missingColumns.length > 0) {
    return NextResponse.json(
      {
        error: `Columnas faltantes: ${missingColumns.join(", ")}. El CSV debe tener: nombre,descripcion,sku,categoria,precio,precio_descuento,stock,activo`,
      },
      { status: 400 },
    );
  }

  if (data.length > 500) {
    return NextResponse.json(
      { error: "El CSV no puede tener más de 500 filas por importación" },
      { status: 400 },
    );
  }

  try {
    const result = await importProductsFromCSV(gate.tenantUuid, data);
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    console.error("[POST productos/importar]", e);
    return NextResponse.json(
      { error: "Error interno al procesar la importación" },
      { status: 500 },
    );
  }
}
