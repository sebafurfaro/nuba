import type { UnitType } from "@/types/ingredient";
import type { RecipeWithItems } from "@/types/recipe";

export type BranchProduct = {
  id: string;
  branch_id: string;
  branch_name: string;
  product_id: string;
  is_active: boolean;
  price_override: number | null;
  /** `price_override` si existe, sino `product.price`. */
  effective_price: number;
};

/** Fila `products` (MySQL) + costos de receta cuando vienen calculados en API. */
export type Product = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  category_id: string | null;
  recipe_id: string | null;
  name: string;
  description: string | null;
  image_url: string | null;
  sku: string | null;
  price: number;
  discount_price: number | null;
  stock: number;
  track_stock: boolean;
  portion_size: number;
  portion_unit: UnitType | null;
  /** TRUE = disponible en todas las sucursales por defecto. */
  is_global: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Receta con ítems y costos agregados (populate). */
  recipe?: RecipeWithItems;
  /** Costo por unidad vendida (según receta × `portion_size` / precio efectivo). */
  food_cost: number;
  /** Food cost % = (food_cost / precio) × 100 (usar `discount_price` o `price` según regla de negocio). */
  food_cost_percentage: number;
  /** Asignaciones por sucursal (populado en detalle). */
  branch_assignments?: BranchProduct[];
};

// ─── CSV Import ───────────────────────────────────────────────────────────────

export type CSVProductRow = {
  nombre: string;
  descripcion?: string;
  sku?: string;
  categoria?: string;
  precio: string;
  precio_descuento?: string;
  stock?: string;
  activo?: string;
};

export type ImportRowError = {
  row: number;
  sku: string;
  nombre: string;
  error: string;
};

export type ImportResult = {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: ImportRowError[];
};
