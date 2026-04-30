import type { ReactNode } from "react";
import type React from "react";

import { getTenantTemaBySlug } from "@/lib/db/tenant";
import { DEFAULT_TEMA } from "@/types/tema";

type Props = {
  children: ReactNode;
  params: Promise<{ tenantId: string }>;
};

export default async function PublicTenantLayout({ children, params }: Props) {
  const { tenantId: slug } = await params;

  const tema = (await getTenantTemaBySlug(slug)) ?? DEFAULT_TEMA;

  const cssVars: React.CSSProperties = {
    "--color-primario": tema.colorPrimario,
    "--color-secundario": tema.colorSecundario,
    "--color-fondo": tema.colorFondo,
    "--color-texto": tema.colorTexto,
    "--color-links": tema.colorLinks,
  } as React.CSSProperties;

  return <div style={cssVars}>{children}</div>;
}
