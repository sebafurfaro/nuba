import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ tenantId: string }>;
};

/** Ruta antigua: `/panel/productos/categorias` → `/panel/categorias`. */
export default async function ProductosCategoriasRedirect({ params }: PageProps) {
  const { tenantId } = await params;
  redirect(`/${tenantId}/panel/categorias`);
}
