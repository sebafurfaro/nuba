import { z } from "zod";

const uuidOrEmpty = z.union([z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i), z.literal("")]);

export const createCategoryBodySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  image_url: z.string().max(2000).nullable().optional(),
  parent_id: uuidOrEmpty.nullable().optional(),
  sort_order: z.number().int().optional(),
});

export const updateCategoryBodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  image_url: z.string().max(2000).nullable().optional(),
  parent_id: uuidOrEmpty.nullable().optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

export const sortCategoriesBodySchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
        sort_order: z.number().int(),
      }),
    )
    .min(1),
});
