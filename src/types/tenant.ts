export type Tenant = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  email: string;
  phone: string | null;
  logo_url: string | null;
  banner_url: string | null;
  website: string | null;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  facebook: string | null;
  whatsapp: string | null;
  plan: "free" | "starter" | "pro" | "enterprise";
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type UpdateTenantProfileInput = {
  name?: string;
  description?: string | null;
  email?: string;
  phone?: string | null;
  logo_url?: string | null;
  banner_url?: string | null;
  website?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  youtube?: string | null;
  facebook?: string | null;
  whatsapp?: string | null;
};

export type FeatureFlag = {
  id: string;
  tenant_id: string;
  flag_key: string;
  is_enabled: boolean;
};

export type FeatureFlagKey =
  | "enable_tables"
  | "enable_takeaway"
  | "enable_delivery"
  | "enable_reservations"
  | "enable_mercadopago"
  | "enable_kitchen_display"
  | "enable_split_bill"
  | "enable_tips"
  | "enable_holiday_blocking";
