import { redirect } from "next/navigation";

import { ProductoDetalleClient } from "./producto-detalle-client";
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

  return (
    <ProductoDetalleClient
      tenantId={tenantId}
      productId={id}
      role={session.role}
    />
  );
}
