import type { CategoryTree } from "@/types/category";

/** Opción plana para `<select>` de productos (id + etiqueta legible). */
export type CategorySelectOption = { id: string; name: string };

/**
 * Aplana el árbol en orden (raíz, luego hijos por `sort_order` / nombre).
 * Incluye cada categoría activa; si la raíz está inactiva, igual se listan los hijos
 * activos (etiqueta `Raíz › Hijo` usando el nombre de la raíz).
 */
export function categoryTreeToSelectOptions(
  tree: CategoryTree,
): CategorySelectOption[] {
  const out: CategorySelectOption[] = [];
  for (const root of tree) {
    if (root.is_active) {
      out.push({ id: root.id, name: root.name });
    }
    for (const child of root.children) {
      if (!child.is_active) {
        continue;
      }
      out.push({
        id: child.id,
        name: `${root.name} › ${child.name}`,
      });
    }
  }
  return out;
}
