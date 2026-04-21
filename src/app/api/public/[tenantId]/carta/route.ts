import type { RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";

import { pool } from "@/lib/db";
import { getPublicTenant } from "@/lib/public-tenant";

type Ctx = { params: Promise<{ tenantId: string }> };

type PublicProduct = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  discount_price: number | null;
  category_id: string | null;
  variants: { id: string; name: string; price: number | null }[];
};

export async function GET(req: Request, ctx: Ctx) {
  const { tenantId: slug } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const branchId = searchParams.get("branchId") ?? null;

  try {
    const tenant = await getPublicTenant(slug);
    if (!tenant) {
      return NextResponse.json({ error: "Local no encontrado" }, { status: 404 });
    }

    // Categorías activas con jerarquía
    const [catRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, parent_id, name, description, image_url, level, sort_order
       FROM categories
       WHERE tenant_id = ? AND is_active = TRUE
       ORDER BY sort_order ASC, name ASC`,
      [tenant.id],
    );

    // Productos públicos (sin costo, sin stock, sin SKU)
    let prodRows: RowDataPacket[];
    if (branchId) {
      [prodRows] = await pool.query<RowDataPacket[]>(
        `SELECT p.id, p.name, p.description, p.image_url,
                COALESCE(bp.price_override, p.price) AS price,
                p.discount_price, p.category_id
         FROM products p
         LEFT JOIN branch_products bp
           ON bp.product_id = p.id AND bp.branch_id = ?
         WHERE p.tenant_id = ?
           AND p.is_active = TRUE
           AND (p.is_global = TRUE OR bp.branch_id IS NOT NULL)
           AND COALESCE(bp.is_active, TRUE) = TRUE
         ORDER BY p.name ASC`,
        [branchId, tenant.id],
      );
    } else {
      [prodRows] = await pool.query<RowDataPacket[]>(
        `SELECT id, name, description, image_url, price, discount_price, category_id
         FROM products
         WHERE tenant_id = ? AND is_active = TRUE
         ORDER BY name ASC`,
        [tenant.id],
      );
    }

    // Variantes de los productos encontrados
    const productIds = prodRows.map((r) => r.id as string);
    let variantsByProduct = new Map<string, { id: string; name: string; price: number | null }[]>();

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
        const pid = v.product_id as string;
        const list = variantsByProduct.get(pid) ?? [];
        list.push({
          id: String(v.id),
          name: String(v.name),
          price: v.price == null ? null : Number(v.price),
        });
        variantsByProduct.set(pid, list);
      }
    }

    // Construir productos públicos
    const products: PublicProduct[] = prodRows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      description: r.description ?? null,
      image_url: r.image_url ?? null,
      price: Number(r.price),
      discount_price: r.discount_price == null ? null : Number(r.discount_price),
      category_id: r.category_id ?? null,
      variants: variantsByProduct.get(String(r.id)) ?? [],
    }));

    // Construir árbol de categorías (solo parents con hijos o con productos)
    const categoryProductCount = new Map<string, number>();
    for (const p of products) {
      if (p.category_id) {
        categoryProductCount.set(
          p.category_id,
          (categoryProductCount.get(p.category_id) ?? 0) + 1,
        );
      }
    }

    type CatNode = {
      id: string;
      parent_id: string | null;
      name: string;
      description: string | null;
      image_url: string | null;
      level: number;
      sort_order: number;
      children: CatNode[];
    };

    const catMap = new Map<string, CatNode>();
    for (const r of catRows) {
      catMap.set(String(r.id), {
        id: String(r.id),
        parent_id: r.parent_id ?? null,
        name: String(r.name),
        description: r.description ?? null,
        image_url: r.image_url ?? null,
        level: Number(r.level),
        sort_order: Number(r.sort_order),
        children: [],
      });
    }

    const roots: CatNode[] = [];
    for (const cat of catMap.values()) {
      if (cat.parent_id && catMap.has(cat.parent_id)) {
        catMap.get(cat.parent_id)!.children.push(cat);
      } else {
        roots.push(cat);
      }
    }

    // Solo incluir parents que tienen hijos con productos, o subcategorías con productos
    const hasProducts = (cat: CatNode): boolean => {
      if (categoryProductCount.has(cat.id)) return true;
      return cat.children.some((c) => hasProducts(c));
    };

    const filteredRoots = roots.filter((r) => hasProducts(r));

    // Agrupar productos por category_id
    const productsByCategory: Record<string, PublicProduct[]> = {};
    for (const p of products) {
      if (!p.category_id) continue;
      if (!productsByCategory[p.category_id]) {
        productsByCategory[p.category_id] = [];
      }
      productsByCategory[p.category_id].push(p);
    }

    return NextResponse.json({
      categories: filteredRoots,
      products: productsByCategory,
    });
  } catch (error) {
    console.error("[GET /api/public/[tenantId]/carta]", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
