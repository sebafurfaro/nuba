/** Fila `categories` (MySQL). Solo `level` 0 (raíz) o 1 (hijo). */
export type Category = {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  image_url: string | null;
  level: 0 | 1;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  /** Presente cuando el backend lo incluye (p. ej. listados con conteo). */
  product_count?: number;
};

export type CategoryWithChildren = Category & {
  /** Solo un nivel de hijos; `children` son hojas (`level === 1`). */
  children: Category[];
};

/** Raíces (`parent_id` null) con `children` populados. */
export type CategoryTree = CategoryWithChildren[];
