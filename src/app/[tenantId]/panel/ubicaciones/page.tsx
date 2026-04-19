import { redirect } from "next/navigation";

import { UbicacionesClient } from "./ubicaciones-client";
import { canAccessPanelTrail } from "@/lib/permissions";
import { getSessionFromCookies } from "@/lib/session";

type PageProps = {
  params: Promise<{ tenantId: string }>;
};

export default async function UbicacionesPage({ params }: PageProps) {
  const { tenantId } = await params;
  const session = await getSessionFromCookies();
  if (!session || session.tenantId !== tenantId) {
    redirect(
      `/login?tenantId=${encodeURIComponent(tenantId)}&returnUrl=${encodeURIComponent(`/${tenantId}/panel/ubicaciones`)}`,
    );
  }
  if (!canAccessPanelTrail(session.role, "ubicaciones")) {
    redirect(`/${tenantId}/panel`);
  }

  const canMutate = session.role === "admin" || session.role === "supervisor";

  return <UbicacionesClient tenantId={tenantId} canMutate={canMutate} />;
}
