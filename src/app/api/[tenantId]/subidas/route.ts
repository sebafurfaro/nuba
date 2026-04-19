import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { NextResponse } from "next/server";

import { getTenantSession, requireAdminOrSupervisor } from "@/lib/api-tenant-session";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

function extFromMime(mime: string): string {
  if (mime === "image/jpeg") {
    return "jpg";
  }
  if (mime === "image/png") {
    return "png";
  }
  return "webp";
}

type Ctx = { params: Promise<{ tenantId: string }> };

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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "Solo JPG, PNG o WEBP" },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "El archivo supera los 2 MB" },
      { status: 400 },
    );
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const id = crypto.randomUUID();
    const ext = extFromMime(file.type);
    const relativeDir = path.join("uploads", gate.tenantUuid);
    const dir = path.join(process.cwd(), "public", relativeDir);
    await mkdir(dir, { recursive: true });
    const filename = `${id}.${ext}`;
    const fullPath = path.join(dir, filename);
    await writeFile(fullPath, buf);

    const url = `/${relativeDir.replace(/\\/g, "/")}/${filename}`;
    return NextResponse.json({ url });
  } catch (e) {
    console.error("[POST uploads]", e);
    return NextResponse.json(
      { error: "Error al guardar el archivo" },
      { status: 500 },
    );
  }
}
