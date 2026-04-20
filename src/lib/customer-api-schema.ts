import { z } from "zod";

const emptyToNull = (v: unknown) =>
  v === "" || v === undefined ? null : (v as string | null);

/** Campos comunes POST / PUT (sin refinamiento de contacto). */
export const customerWriteFieldsSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z
    .union([z.string().email(), z.literal(""), z.null()])
    .optional()
    .transform((v) => emptyToNull(v)),
  whatsapp: z
    .union([
      z.string().min(8).max(20),
      z.literal(""),
      z.null(),
    ])
    .optional()
    .transform((v) => emptyToNull(v)),
  phone: z.string().max(50).nullable().optional(),
  dni: z.string().max(20).nullable().optional(),
  birthdate: z.string().max(32).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  branch_id: z
    .preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.union([z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i), z.null()]).optional(),
    )
    .optional(),
});

export const createCustomerBodySchema = customerWriteFieldsSchema.refine(
  (d) => Boolean(d.email) || Boolean(d.whatsapp),
  {
    message: "Se requiere al menos email o WhatsApp",
    path: ["email"],
  },
);

export const updateCustomerBodySchema = customerWriteFieldsSchema.partial();
