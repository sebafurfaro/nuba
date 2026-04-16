import { redirect } from "next/navigation";

import { CategoriasClient } from "./categorias-client";
import { getSessionFromCookies } from "@/lib/session";

type PageProps = {
  params: Promise<{ tenantId: string }>;
};

export default async function CategoriasPage({ params }: PageProps) {
  const { tenantId } = await params;
  const session = await getSessionFromCookies();
  if (!session || session.tenantId !== tenantId) {
    redirect(
      `/login?tenantId=${encodeURIComponent(tenantId)}&returnUrl=${encodeURIComponent(`/${tenantId}/panel/categorias`)}`,
    );
  }
  return <CategoriasClient tenantId={tenantId} role={session.role} />;
}
