import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { pool } from "@/lib/db";
import type {
  BusinessHour,
  BusinessHourSlot,
  BusinessHoursWeek,
  DayOfWeek,
  FeatureFlag,
  FeatureFlagKey,
  Tenant,
  UpdateTenantProfileInput,
  UpsertBusinessHourInput,
} from "@/types/tenant";
import type { TenantTema } from "@/types/tema";

export type {
  BusinessHour,
  BusinessHoursWeek,
  DayOfWeek,
  FeatureFlag,
  FeatureFlagKey,
  Tenant,
  TenantTema,
  UpdateTenantProfileInput,
  UpsertBusinessHourInput,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapDbBool(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined)
    return false;
  if (typeof value === "bigint") return value !== BigInt(0);
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    return s === "1" || s === "true";
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return value.length > 0 && value[0] !== 0;
  }
  return Boolean(value);
}

function trimOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function mapTenantRow(r: RowDataPacket): Tenant {
  return {
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    description: trimOrNull(r.description),
    email: String(r.email),
    phone: trimOrNull(r.phone),
    logo_url: trimOrNull(r.logo_url),
    banner_url: trimOrNull(r.banner_url),
    website: trimOrNull(r.website),
    instagram: trimOrNull(r.instagram),
    tiktok: trimOrNull(r.tiktok),
    youtube: trimOrNull(r.youtube),
    facebook: trimOrNull(r.facebook),
    whatsapp: trimOrNull(r.whatsapp),
    plan: String(r.plan) as Tenant["plan"],
    is_active: mapDbBool(r.is_active),
    created_at: asIso(r.created_at),
    updated_at: asIso(r.updated_at),
  };
}

function mapFlagRow(r: RowDataPacket): FeatureFlag {
  return {
    id: String(r.id),
    tenant_id: String(r.tenant_id),
    flag_key: String(r.flag_key),
    is_enabled: mapDbBool(r.is_enabled),
  };
}

// ---------------------------------------------------------------------------
// getTenantBySlug
// ---------------------------------------------------------------------------

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM tenants WHERE slug = ? AND is_active = TRUE LIMIT 1`,
    [slug],
  );
  return rows[0] ? mapTenantRow(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// getTenantById
// ---------------------------------------------------------------------------

export async function getTenantById(tenantId: string): Promise<Tenant | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM tenants WHERE id = ? LIMIT 1`,
    [tenantId],
  );
  return rows[0] ? mapTenantRow(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// updateTenantProfile
// ---------------------------------------------------------------------------

export async function updateTenantProfile(
  tenantId: string,
  data: UpdateTenantProfileInput,
): Promise<Tenant> {
  const sets: string[] = [];
  const vals: unknown[] = [];

  if (data.name !== undefined) {
    sets.push("name = ?");
    vals.push(data.name.trim());
  }
  if (data.description !== undefined) {
    sets.push("description = ?");
    vals.push(trimOrNull(data.description));
  }
  if (data.email !== undefined) {
    sets.push("email = ?");
    vals.push(data.email.trim().toLowerCase());
  }
  if (data.phone !== undefined) {
    sets.push("phone = ?");
    vals.push(trimOrNull(data.phone));
  }
  if (data.logo_url !== undefined) {
    sets.push("logo_url = ?");
    vals.push(trimOrNull(data.logo_url));
  }
  if (data.banner_url !== undefined) {
    sets.push("banner_url = ?");
    vals.push(trimOrNull(data.banner_url));
  }
  if (data.website !== undefined) {
    sets.push("website = ?");
    vals.push(trimOrNull(data.website));
  }
  if (data.instagram !== undefined) {
    sets.push("instagram = ?");
    vals.push(trimOrNull(data.instagram));
  }
  if (data.tiktok !== undefined) {
    sets.push("tiktok = ?");
    vals.push(trimOrNull(data.tiktok));
  }
  if (data.youtube !== undefined) {
    sets.push("youtube = ?");
    vals.push(trimOrNull(data.youtube));
  }
  if (data.facebook !== undefined) {
    sets.push("facebook = ?");
    vals.push(trimOrNull(data.facebook));
  }
  if (data.whatsapp !== undefined) {
    sets.push("whatsapp = ?");
    vals.push(trimOrNull(data.whatsapp));
  }

  if (sets.length) {
    vals.push(tenantId);
    await pool.query<ResultSetHeader>(
      `UPDATE tenants SET ${sets.join(", ")} WHERE id = ?`,
      vals,
    );
  }

  const updated = await getTenantById(tenantId);
  if (!updated) throw new Error("Tenant no encontrado tras actualizar");
  return updated;
}

// ---------------------------------------------------------------------------
// getFeatureFlags
// ---------------------------------------------------------------------------

export async function getFeatureFlags(tenantId: string): Promise<FeatureFlag[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, tenant_id, flag_key, is_enabled
     FROM feature_flags
     WHERE tenant_id = ?
     ORDER BY flag_key ASC`,
    [tenantId],
  );
  return rows.map(mapFlagRow);
}

// ---------------------------------------------------------------------------
// updateFeatureFlag
// ---------------------------------------------------------------------------

export async function updateFeatureFlag(
  tenantId: string,
  flagKey: FeatureFlagKey,
  isEnabled: boolean,
): Promise<FeatureFlag> {
  await pool.query<ResultSetHeader>(
    `INSERT INTO feature_flags (tenant_id, flag_key, is_enabled)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled)`,
    [tenantId, flagKey, isEnabled ? 1 : 0],
  );

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, tenant_id, flag_key, is_enabled
     FROM feature_flags
     WHERE tenant_id = ? AND flag_key = ? LIMIT 1`,
    [tenantId, flagKey],
  );
  if (!rows[0]) throw new Error(`Flag '${flagKey}' no encontrado tras actualizar`);
  return mapFlagRow(rows[0]);
}

// ---------------------------------------------------------------------------
// updateFeatureFlags (bulk)
// ---------------------------------------------------------------------------

export async function updateFeatureFlags(
  tenantId: string,
  flags: { flag_key: FeatureFlagKey; is_enabled: boolean }[],
): Promise<FeatureFlag[]> {
  if (flags.length === 0) return getFeatureFlags(tenantId);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const flag of flags) {
      await conn.query<ResultSetHeader>(
        `INSERT INTO feature_flags (tenant_id, flag_key, is_enabled)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled)`,
        [tenantId, flag.flag_key, flag.is_enabled ? 1 : 0],
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  return getFeatureFlags(tenantId);
}

// ---------------------------------------------------------------------------
// getBusinessHours
// ---------------------------------------------------------------------------

export async function getBusinessHours(
  tenantId: string,
): Promise<BusinessHoursWeek> {
  const [[dayRows], [slotRows]] = await Promise.all([
    pool.execute<RowDataPacket[]>(
      `SELECT * FROM business_hours WHERE tenant_id = ? ORDER BY day_of_week ASC`,
      [tenantId],
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT bhs.* FROM business_hour_slots bhs
       JOIN business_hours bh ON bh.id = bhs.business_hour_id
       WHERE bh.tenant_id = ?
       ORDER BY bhs.business_hour_id, bhs.sort_order ASC`,
      [tenantId],
    ),
  ]);

  const slotsByHourId = slotRows.reduce(
    (acc, slot) => {
      const id = String(slot.business_hour_id);
      if (!acc[id]) acc[id] = [];
      acc[id].push({
        id: String(slot.id),
        business_hour_id: id,
        open_time: String(slot.open_time).slice(0, 5),
        close_time: String(slot.close_time).slice(0, 5),
        sort_order: Number(slot.sort_order),
      } as BusinessHourSlot);
      return acc;
    },
    {} as Record<string, BusinessHourSlot[]>,
  );

  const existingDays = new Map(
    dayRows.map((row) => [
      row.day_of_week as DayOfWeek,
      {
        id: String(row.id),
        tenant_id: tenantId,
        day_of_week: row.day_of_week as DayOfWeek,
        is_open: mapDbBool(row.is_open),
        slots: slotsByHourId[String(row.id)] ?? [],
      } as BusinessHour,
    ]),
  );

  const week = {} as BusinessHoursWeek;
  for (let d = 0; d <= 6; d++) {
    const day = d as DayOfWeek;
    week[day] = existingDays.get(day) ?? {
      id: "",
      tenant_id: tenantId,
      day_of_week: day,
      is_open: false,
      slots: [],
    };
  }
  return week;
}

// ---------------------------------------------------------------------------
// upsertBusinessHour
// ---------------------------------------------------------------------------

export async function upsertBusinessHour(
  tenantId: string,
  data: UpsertBusinessHourInput,
): Promise<BusinessHour> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM business_hours
       WHERE tenant_id = ? AND day_of_week = ? LIMIT 1`,
      [tenantId, data.day_of_week],
    );

    let hourId: string;
    if (existing.length > 0) {
      hourId = String(existing[0]!.id);
      await conn.execute(
        `UPDATE business_hours SET is_open = ? WHERE id = ? AND tenant_id = ?`,
        [data.is_open ? 1 : 0, hourId, tenantId],
      );
    } else {
      hourId = crypto.randomUUID();
      await conn.execute(
        `INSERT INTO business_hours (id, tenant_id, day_of_week, is_open)
         VALUES (?, ?, ?, ?)`,
        [hourId, tenantId, data.day_of_week, data.is_open ? 1 : 0],
      );
    }

    await conn.execute(
      `DELETE FROM business_hour_slots WHERE business_hour_id = ? AND tenant_id = ?`,
      [hourId, tenantId],
    );

    if (data.is_open && data.slots.length > 0) {
      for (let i = 0; i < data.slots.length; i++) {
        const slot = data.slots[i]!;
        if (slot.open_time >= slot.close_time) {
          throw new Error("El horario de apertura debe ser anterior al cierre");
        }
        await conn.execute(
          `INSERT INTO business_hour_slots
             (id, tenant_id, business_hour_id, open_time, close_time, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), tenantId, hourId, slot.open_time, slot.close_time, i],
        );
      }
    }

    await conn.commit();

    const hours = await getBusinessHours(tenantId);
    return hours[data.day_of_week]!;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// getTenantTema
// ---------------------------------------------------------------------------

export async function getTenantTema(tenantId: string): Promise<TenantTema> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT color_primario, color_secundario, color_fondo, color_texto, color_links
     FROM tenants WHERE id = ? LIMIT 1`,
    [tenantId],
  );
  const r = rows[0];
  return {
    colorPrimario: r?.color_primario ?? "#000000",
    colorSecundario: r?.color_secundario ?? "#000000",
    colorFondo: r?.color_fondo ?? "#ffffff",
    colorTexto: r?.color_texto ?? "#000000",
    colorLinks: r?.color_links ?? "#000000",
  };
}

// ---------------------------------------------------------------------------
// getTenantTemaBySlug  (uso público sin autenticación)
// ---------------------------------------------------------------------------

export async function getTenantTemaBySlug(slug: string): Promise<TenantTema | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT color_primario, color_secundario, color_fondo, color_texto, color_links
     FROM tenants WHERE slug = ? AND is_active = TRUE LIMIT 1`,
    [slug],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    colorPrimario: r.color_primario ?? "#000000",
    colorSecundario: r.color_secundario ?? "#000000",
    colorFondo: r.color_fondo ?? "#ffffff",
    colorTexto: r.color_texto ?? "#000000",
    colorLinks: r.color_links ?? "#000000",
  };
}

// ---------------------------------------------------------------------------
// updateTenantTema
// ---------------------------------------------------------------------------

export async function updateTenantTema(
  tenantId: string,
  data: TenantTema,
): Promise<TenantTema> {
  await pool.query<ResultSetHeader>(
    `UPDATE tenants
     SET color_primario = ?, color_secundario = ?, color_fondo = ?,
         color_texto = ?, color_links = ?
     WHERE id = ?`,
    [
      data.colorPrimario,
      data.colorSecundario,
      data.colorFondo,
      data.colorTexto,
      data.colorLinks,
      tenantId,
    ],
  );
  return getTenantTema(tenantId);
}
