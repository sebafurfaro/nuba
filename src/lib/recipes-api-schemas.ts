import { z } from "zod";

export const unitTypeSchema = z.enum([
  "ml",
  "l",
  "g",
  "kg",
  "u",
  "porciones",
]);

export const createIngredientSchema = z.object({
  name: z.string().min(1).max(255),
  unit: unitTypeSchema,
  unit_cost: z.number().nonnegative(),
  stock_quantity: z.number().nonnegative(),
  stock_alert_threshold: z.number().nonnegative().nullable().optional(),
  branch_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).nullable().optional(),
  supplier_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).nullable().optional(),
  is_active: z.boolean().optional().default(true),
});

export const updateIngredientSchema = createIngredientSchema.partial();

export const recipeItemBodySchema = z
  .object({
    ingredient_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).optional(),
    sub_recipe_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).optional(),
    quantity: z.number().positive(),
    unit: unitTypeSchema,
    notes: z.string().max(5000).nullable().optional(),
  })
  .refine(
    (d) =>
      Boolean(d.ingredient_id) !== Boolean(d.sub_recipe_id),
    "Debe enviarse ingredient_id o sub_recipe_id (exclusivo)",
  );

export const createRecipeSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(10000).nullable().optional(),
  yield_quantity: z.number().positive(),
  yield_unit: unitTypeSchema,
  is_sub_recipe: z.boolean().optional(),
  items: z.array(recipeItemBodySchema).optional().default([]),
});

export const updateRecipeSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(10000).nullable().optional(),
  yield_quantity: z.number().positive().optional(),
  yield_unit: unitTypeSchema.optional(),
  is_sub_recipe: z.boolean().optional(),
});
