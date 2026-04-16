import { z } from "zod";

function toOptionalNumber(v: unknown): number | undefined {
  if (v === "" || v === null || v === undefined) {
    return undefined;
  }
  if (typeof v === "number") {
    return Number.isFinite(v) ? v : undefined;
  }
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function toOptionalNullableNumber(v: unknown): number | null | undefined {
  if (v === "" || v === null || v === undefined) {
    return undefined;
  }
  const n = toOptionalNumber(v);
  return n === undefined ? undefined : n;
}

const positiveNum = z.preprocess(
  (v) => toOptionalNumber(v),
  z.number().positive(),
);

const optionalPositiveNullable = z.preprocess(
  (v) => {
    if (v === "" || v === null || v === undefined) {
      return null;
    }
    return toOptionalNumber(v);
  },
  z.number().positive().nullable().optional(),
);

export const variacionFormSchema = z.object({
  nombre: z.string().min(1).max(100),
  sku: z.string().max(100).optional().nullable(),
  precio: z.preprocess(
    (v) => (v === "" || v == null ? null : toOptionalNumber(v)),
    z.number().nonnegative().nullable().optional(),
  ),
  stock: z.preprocess(
    (v) => toOptionalNumber(v) ?? 0,
    z.number().int().min(0),
  ),
});

export const productoCreateFormSchema = z
  .object({
    nombre: z.string().min(1).max(255),
    descripcion: z.string().max(10000).optional().nullable(),
    sku: z.string().max(100).optional().nullable(),
    categoria_id: z.union([z.string().uuid(), z.literal("")]).optional(),
    precio: positiveNum,
    precio_descuento: optionalPositiveNullable,
    track_stock: z.boolean(),
    stock: z.preprocess(
      (v) => (v === "" || v == null ? undefined : toOptionalNumber(v)),
      z.number().int().min(0).optional(),
    ),
    stock_alert_threshold: z.preprocess(
      (v) => toOptionalNullableNumber(v),
      z.number().int().min(0).nullable().optional(),
    ),
    is_active: z.boolean(),
    recipe_id: z.union([z.string().uuid(), z.literal("")]).optional(),
    variaciones: z.array(variacionFormSchema).optional().default([]),
  })
  .superRefine((data, ctx) => {
    const d = data.precio_descuento;
    if (d != null && d !== undefined && d >= data.precio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["precio_descuento"],
        message: "Debe ser menor al precio",
      });
    }
    if (data.track_stock && data.stock === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stock"],
        message: "Indicá el stock",
      });
    }
  });

export const productoEditGeneralSchema = productoCreateFormSchema.omit({
  variaciones: true,
});

export type ProductoCreateFormInput = z.input<typeof productoCreateFormSchema>;
export type ProductoCreateFormValues = z.output<typeof productoCreateFormSchema>;
export type ProductoEditGeneralInput = z.input<typeof productoEditGeneralSchema>;
export type ProductoEditGeneralValues = z.output<typeof productoEditGeneralSchema>;
export type VariacionFormValues = z.output<typeof variacionFormSchema>;
