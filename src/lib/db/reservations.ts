import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { pool } from "@/lib/db";
import {
  sendReservationCancellationEmail,
  sendReservationConfirmationEmail,
} from "@/lib/resend";
import type {
  CreateReservationInput,
  Reservation,
  ReservationEvent,
  ReservationStatus,
  UpdateReservationInput,
} from "@/types/reservation";
import { TableUnavailableError } from "@/types/reservation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function trimOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

const STATUS_COLORS: Record<ReservationStatus, string> = {
  pendiente: "#f59e0b",
  confirmada: "#10b981",
  cancelada: "#ef4444",
  completada: "#6366f1",
  no_show: "#6b7280",
};

function addMinutes(date: string, time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const totalMins = h * 60 + m + minutes;

  let endDate = date;
  let remaining = totalMins;

  if (remaining >= 1440) {
    remaining -= 1440;
    const [y, mo, d] = date.split("-").map(Number);
    const next = new Date(Date.UTC(y, mo - 1, d + 1));
    endDate = next.toISOString().slice(0, 10);
  }

  const endH = Math.floor(remaining / 60);
  const endM = remaining % 60;
  return `${endDate}T${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:00`;
}

function mapRow(r: RowDataPacket): Reservation {
  const res: Reservation = {
    id: String(r.id),
    tenant_id: String(r.tenant_id),
    branch_id: trimOrNull(r.branch_id),
    table_id: trimOrNull(r.table_id),
    customer_id: trimOrNull(r.customer_id),
    customer_name: String(r.customer_name),
    customer_phone: trimOrNull(r.customer_phone),
    customer_email: trimOrNull(r.customer_email),
    party_size: Number(r.party_size),
    date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
    time: typeof r.time === "string" ? r.time.slice(0, 5) : String(r.time).slice(0, 5),
    duration_min: Number(r.duration_min),
    status: String(r.status) as ReservationStatus,
    notes: trimOrNull(r.notes),
    created_by: (r.created_by === "client" ? "client" : "admin") as "admin" | "client",
    created_at: asIso(r.created_at),
    updated_at: asIso(r.updated_at),
  };

  if (r.table_id) {
    res.table = r.table_name
      ? { id: String(r.table_id), name: String(r.table_name), capacity: Number(r.table_capacity) }
      : null;
  }
  if (r.branch_id) {
    res.branch = r.branch_name
      ? { id: String(r.branch_id), name: String(r.branch_name) }
      : null;
  }
  if (r.customer_id) {
    res.customer = r.customer_first_name
      ? { id: String(r.customer_id), first_name: String(r.customer_first_name), last_name: String(r.customer_last_name) }
      : null;
  }

  return res;
}

const BASE_SELECT = `
  SELECT
    r.*,
    t.name       AS table_name,
    t.capacity   AS table_capacity,
    b.name       AS branch_name,
    c.first_name AS customer_first_name,
    c.last_name  AS customer_last_name
  FROM reservations r
  LEFT JOIN tables    t ON t.id = r.table_id
  LEFT JOIN branches  b ON b.id = r.branch_id
  LEFT JOIN customers c ON c.id = r.customer_id
`;

// ---------------------------------------------------------------------------
// getReservations
// ---------------------------------------------------------------------------

export async function getReservations(
  tenantId: string,
  filters?: {
    branchId?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: ReservationStatus;
    tableId?: string;
  },
): Promise<Reservation[]> {
  const conditions: string[] = ["r.tenant_id = ?"];
  const vals: unknown[] = [tenantId];

  if (filters?.branchId) {
    conditions.push("r.branch_id = ?");
    vals.push(filters.branchId);
  }
  if (filters?.dateFrom) {
    conditions.push("r.date >= ?");
    vals.push(filters.dateFrom);
  }
  if (filters?.dateTo) {
    conditions.push("r.date <= ?");
    vals.push(filters.dateTo);
  }
  if (filters?.status) {
    conditions.push("r.status = ?");
    vals.push(filters.status);
  }
  if (filters?.tableId) {
    conditions.push("r.table_id = ?");
    vals.push(filters.tableId);
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `${BASE_SELECT} WHERE ${conditions.join(" AND ")} ORDER BY r.date ASC, r.time ASC`,
    vals,
  );
  return rows.map(mapRow);
}

// ---------------------------------------------------------------------------
// getReservationsForCalendar
// ---------------------------------------------------------------------------

export async function getReservationsForCalendar(
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  branchId?: string,
): Promise<ReservationEvent[]> {
  const conditions: string[] = ["r.tenant_id = ?", "r.date >= ?", "r.date <= ?"];
  const vals: unknown[] = [tenantId, dateFrom, dateTo];

  if (branchId) {
    conditions.push("r.branch_id = ?");
    vals.push(branchId);
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `${BASE_SELECT} WHERE ${conditions.join(" AND ")} ORDER BY r.date ASC, r.time ASC`,
    vals,
  );

  return rows.map((r) => {
    const res = mapRow(r);
    const tableName = r.table_name ? String(r.table_name) : "Sin mesa";
    const start = `${res.date}T${res.time}:00`;
    return {
      id: res.id,
      title: `${tableName} — ${res.customer_name} (${res.party_size} personas)`,
      start,
      end: addMinutes(res.date, res.time, res.duration_min),
      backgroundColor: STATUS_COLORS[res.status],
      extendedProps: res,
    };
  });
}

// ---------------------------------------------------------------------------
// getReservationById
// ---------------------------------------------------------------------------

export async function getReservationById(
  tenantId: string,
  id: string,
): Promise<Reservation | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `${BASE_SELECT} WHERE r.tenant_id = ? AND r.id = ? LIMIT 1`,
    [tenantId, id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// checkTableConflict — helper interno
// ---------------------------------------------------------------------------

async function checkTableConflict(
  tenantId: string,
  tableId: string,
  date: string,
  time: string,
  durationMin: number,
  excludeId?: string,
): Promise<boolean> {
  // Hay conflicto si otra reserva activa (pendiente/confirmada) en la misma
  // mesa ese día tiene un rango que se solapa con [time, time+durationMin].
  const conditions = [
    "r.tenant_id = ?",
    "r.table_id = ?",
    "r.date = ?",
    "r.status IN ('pendiente','confirmada')",
    // Solapamiento: inicio1 < fin2 AND fin1 > inicio2
    "ADDTIME(r.time, SEC_TO_TIME(r.duration_min * 60)) > ? AND r.time < ADDTIME(?, SEC_TO_TIME(? * 60))",
  ];
  const vals: unknown[] = [tenantId, tableId, date, time, time, durationMin];

  if (excludeId) {
    conditions.push("r.id != ?");
    vals.push(excludeId);
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM reservations r WHERE ${conditions.join(" AND ")} LIMIT 1`,
    vals,
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// createReservation
// ---------------------------------------------------------------------------

export async function createReservation(
  tenantId: string,
  data: CreateReservationInput,
): Promise<Reservation> {
  const durationMin = data.duration_min ?? 90;
  const status: ReservationStatus =
    data.created_by === "admin" ? "confirmada" : "pendiente";

  if (data.table_id) {
    const conflict = await checkTableConflict(
      tenantId,
      data.table_id,
      data.date,
      data.time,
      durationMin,
    );
    if (conflict) throw new TableUnavailableError();
  }

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO reservations
       (id, tenant_id, branch_id, table_id, customer_id,
        customer_name, customer_phone, customer_email,
        party_size, date, time, duration_min, status, notes, created_by)
     VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      data.branch_id ?? null,
      data.table_id ?? null,
      data.customer_id ?? null,
      data.customer_name.trim(),
      data.customer_phone ?? null,
      data.customer_email ?? null,
      data.party_size,
      data.date,
      data.time,
      durationMin,
      status,
      data.notes ?? null,
      data.created_by,
    ],
  );

  const [rows] = await pool.query<RowDataPacket[]>(
    `${BASE_SELECT} WHERE r.tenant_id = ? ORDER BY r.created_at DESC LIMIT 1`,
    [tenantId],
  );
  const reservation = mapRow(rows[0]!);

  if (status === "confirmada" && data.customer_email) {
    void sendReservationConfirmationEmail({
      to: data.customer_email,
      customerName: data.customer_name,
      tenantName: tenantId,
      date: data.date,
      time: data.time,
      partySize: data.party_size,
      tableName: reservation.table?.name,
      notes: data.notes ?? undefined,
    }).catch((e) => console.error("[createReservation] email error", e));
  }

  void result;
  return reservation;
}

// ---------------------------------------------------------------------------
// updateReservation
// ---------------------------------------------------------------------------

export async function updateReservation(
  tenantId: string,
  id: string,
  data: UpdateReservationInput,
): Promise<Reservation> {
  const current = await getReservationById(tenantId, id);
  if (!current) throw new Error("Reserva no encontrada");

  const tableId = data.table_id !== undefined ? data.table_id : current.table_id;
  const date = data.date ?? current.date;
  const time = data.time ?? current.time;
  const durationMin = data.duration_min ?? current.duration_min;

  if (tableId && (data.table_id !== undefined || data.date || data.time || data.duration_min)) {
    const conflict = await checkTableConflict(tenantId, tableId, date, time, durationMin, id);
    if (conflict) throw new TableUnavailableError();
  }

  const sets: string[] = [];
  const vals: unknown[] = [];

  const fields: Array<[string, unknown]> = [
    ["branch_id", data.branch_id],
    ["table_id", data.table_id],
    ["customer_id", data.customer_id],
    ["customer_name", data.customer_name != null ? data.customer_name.trim() : undefined],
    ["customer_phone", data.customer_phone],
    ["customer_email", data.customer_email],
    ["party_size", data.party_size],
    ["date", data.date],
    ["time", data.time],
    ["duration_min", data.duration_min],
    ["status", data.status],
    ["notes", data.notes],
  ];

  for (const [col, val] of fields) {
    if (val !== undefined) {
      sets.push(`${col} = ?`);
      vals.push(val === null ? null : val);
    }
  }

  if (sets.length) {
    vals.push(tenantId, id);
    await pool.query<ResultSetHeader>(
      `UPDATE reservations SET ${sets.join(", ")} WHERE tenant_id = ? AND id = ?`,
      vals,
    );
  }

  const updated = await getReservationById(tenantId, id);
  if (!updated) throw new Error("Reserva no encontrada tras actualizar");

  const email = data.customer_email ?? current.customer_email;
  if (email && data.status && data.status !== current.status) {
    if (data.status === "confirmada") {
      void sendReservationConfirmationEmail({
        to: email,
        customerName: updated.customer_name,
        tenantName: tenantId,
        date: updated.date,
        time: updated.time,
        partySize: updated.party_size,
        tableName: updated.table?.name,
        notes: updated.notes ?? undefined,
      }).catch((e) => console.error("[updateReservation] email error", e));
    } else if (data.status === "cancelada") {
      void sendReservationCancellationEmail({
        to: email,
        customerName: updated.customer_name,
        tenantName: tenantId,
        date: updated.date,
        time: updated.time,
      }).catch((e) => console.error("[updateReservation] cancel email error", e));
    }
  }

  return updated;
}

// ---------------------------------------------------------------------------
// cancelReservation
// ---------------------------------------------------------------------------

export async function cancelReservation(
  tenantId: string,
  id: string,
): Promise<void> {
  const current = await getReservationById(tenantId, id);
  if (!current) throw new Error("Reserva no encontrada");

  await pool.query<ResultSetHeader>(
    `UPDATE reservations SET status = 'cancelada' WHERE tenant_id = ? AND id = ?`,
    [tenantId, id],
  );

  if (current.customer_email) {
    void sendReservationCancellationEmail({
      to: current.customer_email,
      customerName: current.customer_name,
      tenantName: tenantId,
      date: current.date,
      time: current.time,
    }).catch((e) => console.error("[cancelReservation] email error", e));
  }
}

// ---------------------------------------------------------------------------
// completeReservation
// ---------------------------------------------------------------------------

export async function completeReservation(
  tenantId: string,
  id: string,
): Promise<void> {
  await pool.query<ResultSetHeader>(
    `UPDATE reservations SET status = 'completada' WHERE tenant_id = ? AND id = ?`,
    [tenantId, id],
  );
}

// ---------------------------------------------------------------------------
// markNoShow
// ---------------------------------------------------------------------------

export async function markNoShow(
  tenantId: string,
  id: string,
): Promise<void> {
  await pool.query<ResultSetHeader>(
    `UPDATE reservations SET status = 'no_show' WHERE tenant_id = ? AND id = ?`,
    [tenantId, id],
  );
}

// ---------------------------------------------------------------------------
// getAvailableTables
// ---------------------------------------------------------------------------

export async function getAvailableTables(
  tenantId: string,
  date: string,
  time: string,
  durationMin: number,
  partySize: number,
  branchId?: string,
): Promise<{ id: string; name: string; capacity: number }[]> {
  const conditions: string[] = [
    "t.tenant_id = ?",
    "t.is_active = TRUE",
    "t.capacity >= ?",
    `t.id NOT IN (
      SELECT r.table_id FROM reservations r
      WHERE r.tenant_id = ?
        AND r.table_id IS NOT NULL
        AND r.date = ?
        AND r.status IN ('pendiente','confirmada')
        AND ADDTIME(r.time, SEC_TO_TIME(r.duration_min * 60)) > ?
        AND r.time < ADDTIME(?, SEC_TO_TIME(? * 60))
    )`,
  ];
  const vals: unknown[] = [tenantId, partySize, tenantId, date, time, time, durationMin];

  if (branchId) {
    conditions.push("t.branch_id = ?");
    vals.push(branchId);
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT t.id, t.name, t.capacity
     FROM tables t
     WHERE ${conditions.join(" AND ")}
     ORDER BY t.capacity ASC, t.name ASC`,
    vals,
  );

  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    capacity: Number(r.capacity),
  }));
}
