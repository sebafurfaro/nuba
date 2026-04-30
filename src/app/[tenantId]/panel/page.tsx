import { DashboardClient } from "./dashboard-client";

type PageProps = {
  params: Promise<{ tenantId: string }>;
};

export default async function PanelHomePage({ params }: PageProps) {
  const { tenantId } = await params;
  return <DashboardClient tenantId={tenantId} />;
}
