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
  /** Presente solo al editar producto (persistencia en API). */
  id: z
    .union([z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i), z.literal(""), z.undefined()])
    .optional()
    .transform((v) => (v == null || v === "" ? undefined : v)),
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

export const ingredienteInlineFormSchema = z.object({
  nombre: z.string().max(255).optional().default(""),
  cantidad: z.preprocess(
    (v) => (v === "" || v == null ? undefined : toOptionalNumber(v)),
    z.number().positive().optional(),
  ),
  unidad: z.enum(["ml", "l", "g", "kg", "u", "porciones"]),
});

const productoCreateFormBaseSchema = z.object({
  nombre: z.string().min(1).max(255),
  descripcion: z.string().max(10000).optional().nullable(),
  sku: z.string().max(100).optional().nullable(),
  categoria_id: z.preprocess(
    (v) => {
      if (v == null || v === "") {
        return undefined;
      }
      const s = String(v).trim();
      return s === "" ? undefined : s;
    },
    z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).optional(),
  ),
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
  recipe_id: z.union([z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i), z.literal("")]).optional(),
  /** Solo creación: se persiste como `recipes` + `ingredients` + `recipe_items`. */
  ingredientes_inline: z
    .array(ingredienteInlineFormSchema)
    .max(40)
    .default([]),
  variaciones: z.array(variacionFormSchema).optional().default([]),
});

function refineProductoPrecioYStock(
  data: {
    precio: number;
    precio_descuento?: number | null | undefined;
    track_stock: boolean;
    stock?: number | undefined;
  },
  ctx: z.RefinementCtx,
) {
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
}

function refineIngredientesInline(
  data: { ingredientes_inline?: { nombre?: string; cantidad?: number }[] },
  ctx: z.RefinementCtx,
) {
  const rows = data.ingredientes_inline ?? [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const name = String(r.nombre ?? "").trim();
    const cant = r.cantidad;
    const hasCantidad = cant != null && Number.isFinite(cant) && cant > 0;
    if (!name && hasCantidad) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ingredientes_inline", i, "nombre"],
        message: "Nombre del ingrediente",
      });
    }
    if (name && !hasCantidad) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ingredientes_inline", i, "cantidad"],
        message: "Cantidad mayor a 0",
      });
    }
  }
}

export const productoCreateFormSchema = productoCreateFormBaseSchema
  .superRefine(refineProductoPrecioYStock)
  .superRefine(refineIngredientesInline);

export const productoEditGeneralSchema = productoCreateFormBaseSchema
  .omit({ variaciones: true, ingredientes_inline: true })
  .superRefine(refineProductoPrecioYStock);

export type ProductoCreateFormInput = z.input<typeof productoCreateFormSchema>;
export type ProductoCreateFormValues = z.output<typeof productoCreateFormSchema>;
export type ProductoEditGeneralInput = z.input<typeof productoEditGeneralSchema>;
export type ProductoEditGeneralValues = z.output<typeof productoEditGeneralSchema>;
export type VariacionFormValues = z.output<typeof variacionFormSchema>;
export type IngredienteInlineFormValues = z.output<typeof ingredienteInlineFormSchema>;
