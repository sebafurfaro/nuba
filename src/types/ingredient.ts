export type UnitType = "ml" | "l" | "g" | "kg" | "u" | "porciones";

/** Fila `ingredients` (MySQL) — stock y costo en unidad mínima de `unit`. */
export type Ingredient = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  name: string;
  unit: UnitType;
  unit_cost: number;
  stock_quantity: number;
  stock_alert_threshold: number | null;
  supplier_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** Ingredient con costo por unidad mínima ya normalizado/calculado (p. ej. $/ml, $/g). */
export type IngredientWithCost = Ingredient & {
  cost_per_unit_min: number;
};
