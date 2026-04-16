import { z } from "zod";

export const categoryFormSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  parent_id: z.union([z.string().uuid(), z.literal("")]).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  is_active: z.boolean(),
});

export type CategoryFormValues = z.infer<typeof categoryFormSchema>;
