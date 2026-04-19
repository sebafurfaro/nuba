import { redirect } from "next/navigation";

import { MesasOrdersClient } from "./mesas-orders-client";
import { canAccessPanelTrail } from "@/lib/permissions";
import { getSessionFromCookies } from "@/lib/session";

type PageProps = {
  params: Promise<{ tenantId: string }>;
};

export default async function MesasPage({ params }: PageProps) {
  const { tenantId } = await params;
  const session = await getSessionFromCookies();
  if (!session || session.tenantId !== tenantId) {
    redirect(
      `/login?tenantId=${encodeURIComponent(tenantId)}&returnUrl=${encodeURIComponent(`/${tenantId}/panel/mesas`)}`,
    );
  }
  if (!canAccessPanelTrail(session.role, "mesas")) {
    redirect(`/${tenantId}/panel`);
  }

  return <MesasOrdersClient tenantId={tenantId} role={session.role} />;
}
