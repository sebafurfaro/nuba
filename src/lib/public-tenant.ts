import type { RowDataPacket } from "mysql2/promise";

import { pool } from "@/lib/db";

export type PublicTenant = {
  id: string;
  name: string;
  slug: string;
};

/**
 * Resuelve un tenant por slug sin autenticación.
 * Devuelve null si no existe o está inactivo.
 */
export async function getPublicTenant(
  slug: string,
): Promise<PublicTenant | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, name, slug FROM tenants WHERE slug = ? AND is_active = TRUE LIMIT 1`,
    [slug],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: String(r.id),
    name: String(r.name),
    slug: String(r.slug),
  };
}
