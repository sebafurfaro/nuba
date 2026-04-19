import { redirect } from "next/navigation";

import { ProductoCrearForm } from "../crear/producto-crear-form";
import { getSessionFromCookies } from "@/lib/session";

type PageProps = {
  params: Promise<{ tenantId: string; id: string }>;
};

export default async function ProductoDetallePage({ params }: PageProps) {
  const { tenantId, id } = await params;
  const session = await getSessionFromCookies();
  if (!session || session.tenantId !== tenantId) {
    redirect(
      `/login?tenantId=${encodeURIComponent(tenantId)}&returnUrl=${encodeURIComponent(`/${tenantId}/panel/productos/${id}`)}`,
    );
  }
  if (session.role !== "admin" && session.role !== "supervisor") {
    redirect(`/${tenantId}/panel/productos`);
  }

  return <ProductoCrearForm tenantId={tenantId} productId={id} />;
}
