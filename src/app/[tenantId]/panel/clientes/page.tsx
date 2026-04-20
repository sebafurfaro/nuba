import { redirect } from "next/navigation";

import { ClientesClient } from "./clientes-client";
import { listBranchesByTenantSlug } from "@/lib/db/order-config";
import { canAccessPanelTrail } from "@/lib/permissions";
import { getSessionFromCookies } from "@/lib/session";

type PageProps = {
  params: Promise<{ tenantId: string }>;
};

export default async function ClientesPage({ params }: PageProps) {
  const { tenantId } = await params;
  const session = await getSessionFromCookies();
  if (!session || session.tenantId !== tenantId) {
    redirect(
      `/login?tenantId=${encodeURIComponent(tenantId)}&returnUrl=${encodeURIComponent(`/${tenantId}/panel/clientes`)}`,
    );
  }
  if (!canAccessPanelTrail(session.role, "clientes")) {
    redirect(`/${tenantId}/panel`);
  }

  const canMutate = session.role === "admin" || session.role === "supervisor";
  const branches = await listBranchesByTenantSlug(tenantId);

  return (
    <ClientesClient tenantId={tenantId} branches={branches} canMutate={canMutate} />
  );
}
