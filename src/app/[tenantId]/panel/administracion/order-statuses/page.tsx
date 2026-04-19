import Link from "next/link";
import { redirect } from "next/navigation";

import { OrderStatusesSettingsClient } from "./order-statuses-settings-client";
import { canAccessPanelTrail } from "@/lib/permissions";
import { getSessionFromCookies } from "@/lib/session";

type PageProps = {
  params: Promise<{ tenantId: string }>;
};

export default async function OrderStatusesSettingsPage({ params }: PageProps) {
  const { tenantId } = await params;
  const session = await getSessionFromCookies();
  if (!session || session.tenantId !== tenantId) {
    redirect(
      `/login?tenantId=${encodeURIComponent(tenantId)}&returnUrl=${encodeURIComponent(`/${tenantId}/panel/administracion/order-statuses`)}`,
    );
  }
  if (!canAccessPanelTrail(session.role, "administracion/order-statuses")) {
    redirect(`/${tenantId}/panel`);
  }

  return (
    <div className="flex flex-col gap-4">
      <nav className="text-sm text-foreground-muted">
        <Link
          href={`/${tenantId}/panel/administracion`}
          className="text-accent underline-offset-2 hover:underline"
        >
          Administración
        </Link>
        <span className="mx-1">/</span>
        <span className="text-foreground">Pipeline de órdenes</span>
      </nav>
      <OrderStatusesSettingsClient tenantId={tenantId} />
    </div>
  );
}
