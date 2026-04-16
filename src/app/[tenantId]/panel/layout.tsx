import { redirect } from "next/navigation";

import { PanelLayoutClient } from "./panel-layout-client";
import { getSessionFromCookies } from "@/lib/session";

type PanelLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ tenantId: string }>;
};

export default async function PanelLayout({
  children,
  params,
}: PanelLayoutProps) {
  const { tenantId } = await params;
  const session = await getSessionFromCookies();

  if (!session || session.tenantId !== tenantId) {
    redirect(
      `/login?tenantId=${encodeURIComponent(tenantId)}&returnUrl=${encodeURIComponent(`/${tenantId}/panel`)}`,
    );
  }

  return (
    <PanelLayoutClient tenantId={tenantId} role={session.role}>
      {children}
    </PanelLayoutClient>
  );
}
