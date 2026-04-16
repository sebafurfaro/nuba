import type { Ingredient, UnitType } from "@/types/ingredient";

/** Fila `recipes` (MySQL). */
export type Recipe = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  yield_quantity: number;
  yield_unit: UnitType;
  is_sub_recipe: boolean;
  created_at: string;
  updated_at: string;
};

type RecipeItemBase = {
  id: string;
  tenant_id: string;
  recipe_id: string;
  quantity: number;
  unit: UnitType;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** Línea `recipe_items` con relación cargada: ingrediente XOR sub-receta. */
export type RecipeItem =
  | (RecipeItemBase & {
      ingredient_id: string;
      sub_recipe_id: null;
      ingredient: Ingredient;
      sub_recipe?: never;
    })
  | (RecipeItemBase & {
      ingredient_id: null;
      sub_recipe_id: string;
      ingredient?: never;
      sub_recipe: RecipeWithItems;
    });

export type RecipeWithItems = Recipe & {
  items: RecipeItem[];
  cost_total: number;
  cost_per_portion: number;
};
