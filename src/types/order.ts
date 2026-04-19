export type LocationType =
  | "table"
  | "counter"
  | "takeaway"
  | "delivery"
  | "online";

export type Location = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  table_id: string | null;
  type: LocationType;
  name: string;
  capacity: number | null;
  is_active: boolean;
  is_reservable: boolean;
  accepts_queue: boolean;
  sort_order: number;
  /** Órdenes activas en esta location (no terminales). */
  active_orders?: Order[];
};

export type OrderStatus = {
  id: string;
  tenant_id: string;
  key: string;
  label: string;
  color: string;
  sort_order: number;
  triggers_stock: boolean;
  is_terminal: boolean;
  is_cancellable: boolean;
};

export type OrderType = "dine_in" | "takeaway" | "delivery" | "online";

export type Order = {
  id: string;
  tenant_id: string;
  location_id: string | null;
  location?: Location;
  table_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  user_id: string | null;
  status_key: string;
  status?: OrderStatus;
  type: OrderType;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  notes: string | null;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  notes: string | null;
};

export type CreateOrderInput = {
  location_id?: string;
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  delivery_address?: string;
  type: Order["type"];
  notes?: string;
  items: {
    product_id: string;
    variant_id?: string;
    quantity: number;
    notes?: string;
  }[];
};

export type CloseOrderPaymentInput = {
  method: "efectivo" | "mercadopago" | "tarjeta" | "transferencia" | "otro";
  amount: number;
  currency?: string;
  mp_payment_id?: string | null;
  mp_preference_id?: string | null;
  metadata?: unknown;
};

export type AddOrderItemInput = {
  product_id: string;
  variant_id?: string;
  quantity: number;
  notes?: string;
};
