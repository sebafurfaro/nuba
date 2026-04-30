import { redirect } from "next/navigation";

import { canAccessPanelTrail } from "@/lib/permissions";
import { getSessionFromCookies } from "@/lib/session";

import { CajaClient } from "./caja-client";

type PageProps = { params: Promise<{ tenantId: string }> };

export default async function CajaPage({ params }: PageProps) {
  const { tenantId } = await params;
  const session = await getSessionFromCookies();
  if (!session || session.tenantId !== tenantId) {
    redirect(
      `/login?tenantId=${encodeURIComponent(tenantId)}&returnUrl=${encodeURIComponent(`/${tenantId}/panel/caja`)}`,
    );
  }
  if (!canAccessPanelTrail(session.role, "caja")) {
    redirect(`/${tenantId}/panel`);
  }
  return <CajaClient tenantId={tenantId} role={session.role} />;
}
