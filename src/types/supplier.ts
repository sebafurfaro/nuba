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
  // Populados opcionalmente en listado
  product_count?: number;
  ingredient_count?: number;
};

export type SupplierProduct = {
  id: string;
  tenant_id: string;
  supplier_id: string;
  product_id: string;
  cost_price: number;
  notes: string | null;
  created_at: string;
  // Populados desde JOIN con products
  product_name: string;
  product_image_url: string | null;
  product_price: number;
  margin: number; // (product_price - cost_price) / product_price * 100
};

export type SupplierIngredient = {
  id: string;
  name: string;
  unit: string;
  unit_cost: number;
  stock_quantity: number;
};

export type SupplierWithProducts = Supplier & {
  products: SupplierProduct[];
  ingredients: SupplierIngredient[];
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

export type UpsertSupplierProductInput = {
  product_id: string;
  cost_price: number;
  notes?: string | null;
};

export class SupplierDuplicateNameError extends Error {
  constructor() {
    super("DUPLICATE_NAME");
    this.name = "SupplierDuplicateNameError";
  }
}
