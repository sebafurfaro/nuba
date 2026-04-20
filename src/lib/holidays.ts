import { pool } from "@/lib/db";

const HOLIDAYS_API = "https://api.argentinadatos.com/v1/feriados";

export type ArgentinaHoliday = {
  fecha: string; // 'YYYY-MM-DD'
  tipo: string;  // 'inamovible' | 'trasladable' | 'puente'
  nombre: string;
};

/**
 * Fetch holidays for a given year from argentinadatos.com.
 * Cached for 24 hours via Next.js fetch cache.
 * Returns [] on any error — never throws.
 */
export async function fetchHolidaysForYear(
  year: number,
): Promise<ArgentinaHoliday[]> {
  try {
    const res = await fetch(`${HOLIDAYS_API}/${year}`, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) {
      console.error(`[fetchHolidaysForYear] HTTP ${res.status} for year ${year}`);
      return [];
    }
    const data: unknown = await res.json();
    if (!Array.isArray(data)) {
      console.error("[fetchHolidaysForYear] Unexpected response shape", data);
      return [];
    }
    return data as ArgentinaHoliday[];
  } catch (e) {
    console.error("[fetchHolidaysForYear] fetch failed", e);
    return [];
  }
}

/**
 * Sync holidays for a tenant+year via upsert.
 * Does NOT overwrite is_unlocked — admin decisions are preserved.
 */
export async function syncHolidaysForTenant(
  tenantId: string,
  year: number,
): Promise<{ synced: number; skipped: number }> {
  const holidays = await fetchHolidaysForYear(year);

  if (holidays.length === 0) {
    return { synced: 0, skipped: 0 };
  }

  let synced = 0;
  let skipped = 0;

  for (const h of holidays) {
    try {
      await pool.execute(
        `INSERT INTO tenant_blocked_dates
           (tenant_id, date, reason, holiday_name, holiday_type)
         VALUES (?, ?, 'feriado', ?, ?)
         ON DUPLICATE KEY UPDATE
           holiday_name = VALUES(holiday_name),
           holiday_type = VALUES(holiday_type)`,
        [tenantId, h.fecha, h.nombre, h.tipo],
      );
      synced++;
    } catch (e) {
      console.error(`[syncHolidaysForTenant] failed for ${h.fecha}`, e);
      skipped++;
    }
  }

  return { synced, skipped };
}
