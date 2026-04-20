import { redirect } from "next/navigation";

import { SucursalesClient } from "./sucursales-client";
import { getSessionFromCookies } from "@/lib/session";

type PageProps = {
  params: Promise<{ tenantId: string }>;
};

export default async function SucursalesPage({ params }: PageProps) {
  const { tenantId } = await params;
  const session = await getSessionFromCookies();

  if (!session || session.tenantId !== tenantId) {
    redirect(
      `/login?tenantId=${encodeURIComponent(tenantId)}&returnUrl=${encodeURIComponent(`/${tenantId}/panel/sucursales`)}`,
    );
  }

  if (session.role !== "admin" && session.role !== "supervisor") {
    redirect(`/${tenantId}/panel`);
  }

  return (
    <SucursalesClient
      tenantId={tenantId}
      isAdmin={session.role === "admin"}
    />
  );
}
