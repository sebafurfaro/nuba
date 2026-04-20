import { redirect } from "next/navigation";

import { getSessionFromCookies } from "@/lib/session";
import { ProveedoresClient } from "./proveedores-client";

type PageProps = { params: Promise<{ tenantId: string }> };

export default async function ProveedoresPage({ params }: PageProps) {
  const { tenantId } = await params;
  const session = await getSessionFromCookies();

  if (!session || session.tenantId !== tenantId) {
    redirect(
      `/login?tenantId=${encodeURIComponent(tenantId)}&returnUrl=${encodeURIComponent(`/${tenantId}/panel/proveedores`)}`,
    );
  }

  if (session.role === "vendedor" || session.role === "cliente") {
    redirect(`/${tenantId}/panel`);
  }

  return (
    <ProveedoresClient tenantId={tenantId} isAdmin={session.role === "admin"} />
  );
}
