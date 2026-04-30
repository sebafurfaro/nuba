export type Supplier = {
  id: string;
  tenant_id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  ingredient_count?: number;
};

// Vínculo proveedor ↔ ingrediente (tabla supplier_ingredients)
export type SupplierIngredient = {
  id: string;
  tenant_id: string;
  supplier_id: string;
  ingredient_id: string;
  ingredient_nombre: string;
  ingredient_unit: string;
  ingredient_stock: number;
  ingredient_stock_minimo: number | null;
  purchase_unit: string;
  purchase_qty: number;
  cost_per_purchase: number;
  unit_cost_calculated: number;
  es_principal: boolean;
  initial_stock_qty: number | null;
  notes: string | null;
  created_at: string;
};

export type SupplierWithIngredients = Supplier & {
  supplier_ingredients: SupplierIngredient[];
};

export type CreateSupplierInput = {
  name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  notes?: string | null;
};

export type UpdateSupplierInput = Partial<CreateSupplierInput> & {
  is_active?: boolean;
};

export type CreateIngredientAndLinkInput = {
  nombre: string;
  unit: string;
  stock_minimo?: number | null;
  purchase_unit: string;
  purchase_qty: number;
  cost_per_purchase: number;
  es_principal: boolean;
  initial_stock_qty?: number | null;
  notes?: string | null;
};

export type LinkExistingIngredientInput = {
  ingredient_id: string;
  purchase_unit: string;
  purchase_qty: number;
  cost_per_purchase: number;
  es_principal: boolean;
  initial_stock_qty?: number | null;
  notes?: string | null;
};

export type UpdateSupplierIngredientInput = {
  purchase_unit?: string;
  purchase_qty?: number;
  cost_per_purchase?: number;
  es_principal?: boolean;
  notes?: string | null;
};

export type IngredientSearchResult = {
  id: string;
  nombre: string;
  unit: string;
  unit_cost: number;
  stock: number;
};

export type SupplierStats = {
  total_comprado: number;
  cantidad_ordenes: number;
  ordenes_por_estado: {
    draft: number;
    sent: number;
    received: number;
    cancelled: number;
  };
  ultima_orden: string | null;
};

export class SupplierDuplicateNameError extends Error {
  constructor() {
    super("DUPLICATE_NAME");
    this.name = "SupplierDuplicateNameError";
  }
}

// ─── Purchase Orders ──────────────────────────────────────────────────────────

export type PurchaseOrderStatus = "draft" | "sent" | "received" | "cancelled";

export type PurchaseOrderItem = {
  id: string;
  purchase_order_id: string;
  ingredient_id: string;
  ingredient_nombre: string;
  ingredient_unit: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

export type PurchaseOrder = {
  id: string;
  tenant_id: string;
  supplier_id: string;
  supplier_nombre: string;
  status: PurchaseOrderStatus;
  expected_date: string | null;
  received_date: string | null;
  notes: string | null;
  total: number;
  item_count: number;
  items: PurchaseOrderItem[];
  created_at: string;
  updated_at: string;
};

export type CreatePurchaseOrderInput = {
  supplier_id: string;
  expected_date?: string | null;
  notes?: string | null;
  items: {
    ingredient_id: string;
    quantity: number;
    unit_price: number;
  }[];
};

export type UpdatePurchaseOrderInput = {
  expected_date?: string | null;
  notes?: string | null;
  status?: PurchaseOrderStatus;
  items?: {
    ingredient_id: string;
    quantity: number;
    unit_price: number;
  }[];
};

export type StockAlertItem = {
  ingredient_id: string;
  nombre: string;
  unit: string;
  stock: number;
  stock_minimo: number;
};
