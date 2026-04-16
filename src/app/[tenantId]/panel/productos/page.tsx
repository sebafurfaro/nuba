import { redirect } from "next/navigation";

import { ProductosClient } from "./productos-client";
import { getSessionFromCookies } from "@/lib/session";

type PageProps = {
  params: Promise<{ tenantId: string }>;
};

export default async function ProductosPage({ params }: PageProps) {
  const { tenantId } = await params;
  const session = await getSessionFromCookies();
  if (!session || session.tenantId !== tenantId) {
    redirect(
      `/login?tenantId=${encodeURIComponent(tenantId)}&returnUrl=${encodeURIComponent(`/${tenantId}/panel/productos`)}`,
    );
  }
  return <ProductosClient tenantId={tenantId} role={session.role} />;
}
