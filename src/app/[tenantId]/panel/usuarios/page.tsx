import { redirect } from "next/navigation";

import { UsuariosClient } from "./usuarios-client";
import { listBranchesByTenantSlug } from "@/lib/db/order-config";
import { getSessionFromCookies } from "@/lib/session";

type PageProps = {
  params: Promise<{ tenantId: string }>;
};

export default async function UsuariosPage({ params }: PageProps) {
  const { tenantId } = await params;
  const session = await getSessionFromCookies();

  if (!session || session.tenantId !== tenantId) {
    redirect(
      `/login?tenantId=${encodeURIComponent(tenantId)}&returnUrl=${encodeURIComponent(`/${tenantId}/panel/usuarios`)}`,
    );
  }

  if (session.role !== "admin") {
    redirect(`/${tenantId}/panel`);
  }

  const branches = await listBranchesByTenantSlug(tenantId);

  return <UsuariosClient tenantId={tenantId} branches={branches} />;
}
