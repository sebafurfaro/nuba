export type LoyaltyTier = "bronze" | "silver" | "gold" | "platinum";

export type CustomerSource = "manual" | "order" | "onboarding" | "import";

export type Customer = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  whatsapp: string | null;
  phone: string | null;
  dni: string | null;
  birthdate: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  loyalty_points: number;
  loyalty_tier: LoyaltyTier;
  source: CustomerSource;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** Misma forma que `Customer` (antes solo columnas de `customers`). */
export type CustomerDetail = Customer;

/** Listado compacto (listas y selects). */
export type CustomerListItem = Pick<
  Customer,
  "id" | "first_name" | "last_name" | "email" | "phone"
>;

export type CustomerListFilters = {
  activeOnly?: boolean;
  limit?: number;
};

/** Agregados por cliente (órdenes no canceladas). */
export type CustomerMetrics = {
  order_count: number;
  total_spent: number;
  avg_ticket: number;
  last_order_at: string | null;
  first_order_at: string | null;
};

export type CustomerFavoriteProduct = {
  product_id: string;
  name: string;
  quantity_sold: number;
};

export type CustomerOrdersByMonthRow = {
  month: string;
  order_count: number;
  total: number;
};

export type CreateCustomerInput = {
  branch_id?: string | null;
  first_name: string;
  last_name: string;
  email?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
  dni?: string | null;
  birthdate?: string | null;
  address?: string | null;
  city?: string | null;
  notes?: string | null;
  is_active?: boolean;
};

export type UpdateCustomerInput = {
  branch_id?: string | null;
  first_name?: string;
  last_name?: string;
  email?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
  dni?: string | null;
  birthdate?: string | null;
  address?: string | null;
  city?: string | null;
  notes?: string | null;
  is_active?: boolean;
};

/** Listado con métricas por órdenes en estado terminal (cerradas). */
export type CustomerSummary = Customer & {
  order_count: number;
  total_spent: number;
  avg_ticket: number;
  last_order_at: string | null;
};

export type CustomerSummaryFilters = {
  search?: string;
  isActive?: boolean;
  branchId?: string;
  orderBy?: "name" | "last_order_at" | "total_spent" | "order_count";
  orderDir?: "asc" | "desc";
  page?: number;
  limit?: number;
};

export type CustomerFavoriteWithImage = {
  product_id: string;
  name: string;
  image_url: string | null;
  times_ordered: number;
};

export type CustomerWithMetrics = Customer & {
  metrics: {
    order_count: number;
    total_spent: number;
    avg_ticket: number;
    last_order_at: string | null;
    first_order_at: string | null;
    favorite_products: CustomerFavoriteWithImage[];
    orders_by_month: { month: string; count: number; total: number }[];
  };
};

export type OrderSummaryForCustomer = {
  id: string;
  created_at: string;
  type: string;
  status_key: string;
  status_label: string;
  status_color: string;
  location_name: string | null;
  total: number;
  item_count: number;
  items_preview: string;
};

export class CustomerDuplicateError extends Error {
  readonly code = "DUPLICATE" as const;

  constructor(message = "DUPLICATE") {
    super(message);
    this.name = "CustomerDuplicateError";
  }
}
