import { redirect } from "next/navigation";

import { ProductoCrearForm } from "./producto-crear-form";
import { getSessionFromCookies } from "@/lib/session";

type PageProps = {
  params: Promise<{ tenantId: string }>;
};

export default async function CrearProductoPage({ params }: PageProps) {
  const { tenantId } = await params;
  const session = await getSessionFromCookies();
  if (!session || session.tenantId !== tenantId) {
    redirect(
      `/login?tenantId=${encodeURIComponent(tenantId)}&returnUrl=${encodeURIComponent(`/${tenantId}/panel/productos/crear`)}`,
    );
  }
  if (session.role !== "admin" && session.role !== "supervisor") {
    redirect(`/${tenantId}/panel/productos`);
  }
  return <ProductoCrearForm tenantId={tenantId} />;
}
