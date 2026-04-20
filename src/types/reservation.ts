export type ReservationStatus =
  | "pendiente"
  | "confirmada"
  | "cancelada"
  | "completada"
  | "no_show";

export type Reservation = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  table_id: string | null;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  party_size: number;
  date: string;
  time: string;
  duration_min: number;
  status: ReservationStatus;
  notes: string | null;
  created_by: "admin" | "client";
  created_at: string;
  updated_at: string;
  table?: { id: string; name: string; capacity: number } | null;
  branch?: { id: string; name: string } | null;
  customer?: { id: string; first_name: string; last_name: string } | null;
};

export type CreateReservationInput = {
  branch_id?: string | null;
  table_id?: string | null;
  customer_id?: string | null;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  party_size: number;
  date: string;
  time: string;
  duration_min?: number;
  notes?: string | null;
  created_by: "admin" | "client";
};

export type UpdateReservationInput = Partial<
  Omit<CreateReservationInput, "created_by">
> & {
  status?: ReservationStatus;
};

export type ReservationEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor: string;
  extendedProps: Reservation;
};

export class TableUnavailableError extends Error {
  constructor() {
    super("TABLE_UNAVAILABLE");
    this.name = "TableUnavailableError";
  }
}
