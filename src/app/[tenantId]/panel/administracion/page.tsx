import { redirect } from "next/navigation";

import { AdministracionClient } from "./administracion-client";
import { getSessionFromCookies } from "@/lib/session";

type PageProps = {
  params: Promise<{ tenantId: string }>;
};

export default async function AdministracionPage({ params }: PageProps) {
  const { tenantId } = await params;
  const session = await getSessionFromCookies();

  if (!session || session.tenantId !== tenantId) {
    redirect(
      `/login?tenantId=${encodeURIComponent(tenantId)}&returnUrl=${encodeURIComponent(`/${tenantId}/panel/administracion`)}`,
    );
  }

  if (session.role !== "admin") {
    redirect(`/${tenantId}/panel`);
  }

  return <AdministracionClient tenantId={tenantId} />;
}
