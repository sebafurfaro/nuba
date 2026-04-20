import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { pool } from "@/lib/db";
import type {
  FeatureFlag,
  FeatureFlagKey,
  Tenant,
  UpdateTenantProfileInput,
} from "@/types/tenant";

export type { FeatureFlag, FeatureFlagKey, Tenant, UpdateTenantProfileInput };

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
