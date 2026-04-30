export type Tenant = {
  [x: string]: string | null | boolean | undefined;
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

// ─── Business Hours ───────────────────────────────────────────────────────────

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DAY_NAMES: Record<DayOfWeek, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

export type BusinessHourSlot = {
  id: string;
  business_hour_id: string;
  open_time: string;
  close_time: string;
  sort_order: number;
};

export type BusinessHour = {
  id: string;
  tenant_id: string;
  day_of_week: DayOfWeek;
  is_open: boolean;
  slots: BusinessHourSlot[];
};

export type BusinessHoursWeek = Record<DayOfWeek, BusinessHour>;

export type UpsertBusinessHourInput = {
  day_of_week: DayOfWeek;
  is_open: boolean;
  slots: {
    open_time: string;
    close_time: string;
  }[];
};
