import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { pool } from "@/lib/db";

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

export type BlockedDate = {
  id: string;
  tenant_id: string;
  date: string; // 'YYYY-MM-DD'
  reason: "feriado" | "manual";
  holiday_name: string | null;
  holiday_type: string | null;
  is_unlocked: boolean;
  unlocked_at: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapRow(r: RowDataPacket): BlockedDate {
  return {
    id: String(r.id),
    tenant_id: String(r.tenant_id),
    date:
      r.date instanceof Date
        ? r.date.toISOString().slice(0, 10)
        : String(r.date).slice(0, 10),
    reason: String(r.reason) as "feriado" | "manual",
    holiday_name: r.holiday_name ? String(r.holiday_name) : null,
    holiday_type: r.holiday_type ? String(r.holiday_type) : null,
    is_unlocked: Boolean(r.is_unlocked),
    unlocked_at: r.unlocked_at
      ? r.unlocked_at instanceof Date
        ? r.unlocked_at.toISOString()
        : String(r.unlocked_at)
      : null,
    created_at:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at),
  };
}

// ---------------------------------------------------------------------------
// getBlockedDates
// ---------------------------------------------------------------------------

export async function getBlockedDates(
  tenantId: string,
  dateFrom: string,
  dateTo: string,
): Promise<BlockedDate[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM tenant_blocked_dates
     WHERE tenant_id = ? AND date BETWEEN ? AND ?
     ORDER BY date ASC`,
    [tenantId, dateFrom, dateTo],
  );
  return rows.map(mapRow);
}

// ---------------------------------------------------------------------------
// isDateBlocked
// ---------------------------------------------------------------------------

export async function isDateBlocked(
  tenantId: string,
  date: string,
): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM tenant_blocked_dates
     WHERE tenant_id = ? AND date = ? AND is_unlocked = FALSE`,
    [tenantId, date],
  );
  return Number((rows[0] as RowDataPacket)?.cnt ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// unlockDate
// ---------------------------------------------------------------------------

export async function unlockDate(
  tenantId: string,
  date: string,
): Promise<BlockedDate> {
  await pool.execute(
    `INSERT INTO tenant_blocked_dates
       (tenant_id, date, reason, is_unlocked, unlocked_at)
     VALUES (?, ?, 'manual', TRUE, NOW())
     ON DUPLICATE KEY UPDATE
       is_unlocked = TRUE, unlocked_at = NOW()`,
    [tenantId, date],
  );

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM tenant_blocked_dates
     WHERE tenant_id = ? AND date = ? LIMIT 1`,
    [tenantId, date],
  );
  return mapRow(rows[0]!);
}

// ---------------------------------------------------------------------------
// relockDate
// ---------------------------------------------------------------------------

export async function relockDate(
  tenantId: string,
  date: string,
): Promise<void> {
  await pool.execute<ResultSetHeader>(
    `UPDATE tenant_blocked_dates
     SET is_unlocked = FALSE, unlocked_at = NULL
     WHERE tenant_id = ? AND date = ?`,
    [tenantId, date],
  );
}

// ---------------------------------------------------------------------------
// blockDateManually
// ---------------------------------------------------------------------------

export async function blockDateManually(
  tenantId: string,
  date: string,
  reason?: string,
): Promise<BlockedDate> {
  await pool.execute(
    `INSERT INTO tenant_blocked_dates
       (tenant_id, date, reason, holiday_name)
     VALUES (?, ?, 'manual', ?)
     ON DUPLICATE KEY UPDATE
       is_unlocked = FALSE, unlocked_at = NULL`,
    [tenantId, date, reason ?? null],
  );

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM tenant_blocked_dates
     WHERE tenant_id = ? AND date = ? LIMIT 1`,
    [tenantId, date],
  );
  return mapRow(rows[0]!);
}
