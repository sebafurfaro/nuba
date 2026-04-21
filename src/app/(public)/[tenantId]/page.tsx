import type { RowDataPacket } from "mysql2/promise";
import { notFound } from "next/navigation";

import { pool } from "@/lib/db";
import { getBranches } from "@/lib/db/branches";
import { getCategoryTree } from "@/lib/db/categories";
import { getFeatureFlags } from "@/lib/db/tenant";
import { getPublicTenant } from "@/lib/public-tenant";

import { CartaClient } from "./CartaClient";
import type { PublicPerfil } from "./CartaClient";
import type { PublicProduct } from "./ProductCard";

type PageProps = {
  params: Promise<{ tenantId: string }>;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default async function PublicTenantPage({ params }: PageProps) {
  const { tenantId: slug } = await params;

  const tenant = await getPublicTenant(slug);
  if (!tenant) notFound();

  // Cargar perfil, categorías, sucursales, flags y productos en paralelo
  const [tenantRows, categoryTree, branches, flags] = await Promise.all([
    pool.query<RowDataPacket[]>(
      `SELECT name, description, logo_url, banner_url, email, phone, whatsapp,
              website, instagram, facebook, tiktok, youtube
       FROM tenants WHERE id = ? LIMIT 1`,
      [tenant.id],
    ).then(([rows]) => rows[0] ?? null),
    getCategoryTree(tenant.id),
    getBranches(tenant.id).then((b) => b.filter((br) => br.is_active)),
    getFeatureFlags(tenant.id),
  ]);

  if (!tenantRows) notFound();

  const t = tenantRows;

  // Productos públicos (sin costo, sin stock, sin SKU)
  const [prodRows] = await pool.query<RowDataPacket[]>(
    `SELECT id, name, description, image_url, price, discount_price, category_id
     FROM products
     WHERE tenant_id = ? AND is_active = TRUE
     ORDER BY name ASC`,
    [tenant.id],
  );

  // Variantes
  const productIds = prodRows.map((r) => String(r.id));
  const variantsByProduct = new Map<
    string,
    { id: string; name: string; price: number | null }[]
  >();

  if (productIds.length > 0) {
    const placeholders = productIds.map(() => "?").join(",");
    const [varRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, product_id, name, price
       FROM product_variants
       WHERE tenant_id = ? AND product_id IN (${placeholders}) AND is_active = TRUE
       ORDER BY name ASC`,
      [tenant.id, ...productIds],
    );
    for (const v of varRows) {
      const pid = String(v.product_id);
      const list = variantsByProduct.get(pid) ?? [];
      list.push({
        id: String(v.id),
        name: String(v.name),
        price: v.price == null ? null : num(v.price),
      });
      variantsByProduct.set(pid, list);
    }
  }

  const publicProducts: PublicProduct[] = prodRows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    description: r.description ? String(r.description) : null,
    image_url: r.image_url ? String(r.image_url) : null,
    price: num(r.price),
    discount_price: r.discount_price == null ? null : num(r.discount_price),
    category_id: r.category_id ? String(r.category_id) : null,
    variants: variantsByProduct.get(String(r.id)) ?? [],
  }));

  // Agrupar productos por category_id
  const productsByCategory: Record<string, PublicProduct[]> = {};
  for (const p of publicProducts) {
    if (!p.category_id) continue;
    if (!productsByCategory[p.category_id]) {
      productsByCategory[p.category_id] = [];
    }
    productsByCategory[p.category_id].push(p);
  }

  // Solo categorías que tienen productos en algún descendiente
  function hasProducts(cat: { id: string; children?: typeof categoryTree }): boolean {
    if (productsByCategory[cat.id]?.length) return true;
    return (cat.children ?? []).some((c) => hasProducts(c));
  }
  const filteredCategories = categoryTree.filter(hasProducts);

  const perfil: PublicPerfil = {
    name: String(t.name),
    description: t.description ? String(t.description) : null,
    logo_url: t.logo_url ? String(t.logo_url) : null,
    banner_url: t.banner_url ? String(t.banner_url) : null,
    email: t.email ? String(t.email) : null,
    phone: t.phone ? String(t.phone) : null,
    whatsapp: t.whatsapp ? String(t.whatsapp) : null,
    website: t.website ? String(t.website) : null,
    instagram: t.instagram ? String(t.instagram) : null,
    facebook: t.facebook ? String(t.facebook) : null,
    tiktok: t.tiktok ? String(t.tiktok) : null,
    youtube: t.youtube ? String(t.youtube) : null,
    enable_delivery: flags.find((f) => f.flag_key === "enable_delivery")?.is_enabled ?? false,
    branches: branches.map((b) => ({
      id: b.id,
      name: b.name,
      address: b.address,
      city: b.city,
      phone: b.phone,
      email: b.email,
    })),
  };

  return (
    <CartaClient
      tenantId={slug}
      perfil={perfil}
      categories={filteredCategories}
      products={productsByCategory}
    />
  );
}
