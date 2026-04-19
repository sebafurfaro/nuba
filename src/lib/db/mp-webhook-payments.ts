import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { pool } from "@/lib/db";

export type PaymentRowForWebhook = {
  id: string;
  tenant_id: string;
  order_id: string;
  mp_preference_id: string | null;
  mp_payment_id: string | null;
  status: string;
  order_status_key: string;
  order_is_terminal: boolean;
};

export async function paymentExistsWithMpPaymentId(
  mpPaymentId: string,
): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM payments WHERE mp_payment_id = ? LIMIT 1`,
    [mpPaymentId],
  );
  return rows.length > 0;
}

/**
 * Busca un pago local por `mp_payment_id` o `mp_preference_id` (tenant siempre vía join).
 */
export async function findPaymentForMpWebhook(
  mpPaymentId: string,
  mpPreferenceId: string | null,
): Promise<PaymentRowForWebhook | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT p.id, p.tenant_id, p.order_id, p.mp_preference_id, p.mp_payment_id,
            p.status AS payment_status, o.status_key AS order_status_key,
            os.is_terminal AS order_is_terminal
     FROM payments p
     INNER JOIN orders o ON o.id = p.order_id AND o.tenant_id = p.tenant_id
     INNER JOIN order_statuses os
       ON os.tenant_id = o.tenant_id AND os.\`key\` = o.status_key
     WHERE p.mp_payment_id = ?
        OR (? IS NOT NULL AND p.mp_preference_id = ?)
     LIMIT 1`,
    [mpPaymentId, mpPreferenceId, mpPreferenceId],
  );
  const r = rows[0];
  if (!r) {
    return null;
  }
  return {
    id: String(r.id),
    tenant_id: String(r.tenant_id),
    order_id: String(r.order_id),
    mp_preference_id: (r.mp_preference_id as string | null) ?? null,
    mp_payment_id: (r.mp_payment_id as string | null) ?? null,
    status: String(r.payment_status),
    order_status_key: String(r.order_status_key),
    order_is_terminal: Boolean(r.order_is_terminal),
  };
}

export type MpIntegrationTokenRow = {
  tenant_id: string;
  access_token: string;
};

export async function getMpAccessTokenByUserId(
  mpUserId: string,
): Promise<MpIntegrationTokenRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT tenant_id, access_token
     FROM mp_integrations
     WHERE is_active = TRUE
       AND mp_user_id = ?
     LIMIT 1`,
    [mpUserId],
  );
  const r = rows[0];
  if (!r) {
    return null;
  }
  return {
    tenant_id: String(r.tenant_id),
    access_token: String(r.access_token),
  };
}

/** Fallback: un token activo (último recurso si no coincide `user_id`). */
export async function getAnyActiveMpAccessToken(): Promise<MpIntegrationTokenRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT tenant_id, access_token
     FROM mp_integrations
     WHERE is_active = TRUE
     ORDER BY updated_at DESC
     LIMIT 1`,
  );
  const r = rows[0];
  if (!r) {
    return null;
  }
  return {
    tenant_id: String(r.tenant_id),
    access_token: String(r.access_token),
  };
}

export async function getMpAccessTokenForTenant(
  tenantId: string,
): Promise<MpIntegrationTokenRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT tenant_id, access_token
     FROM mp_integrations
     WHERE tenant_id = ? AND is_active = TRUE
     LIMIT 1`,
    [tenantId],
  );
  const r = rows[0];
  if (!r) {
    return null;
  }
  return {
    tenant_id: String(r.tenant_id),
    access_token: String(r.access_token),
  };
}

export async function updatePaymentMpWebhookFields(input: {
  tenantId: string;
  paymentId: string;
  mpPaymentId: string | null;
  mpPreferenceId: string | null;
  status: "pendiente" | "aprobado" | "rechazado" | "cancelado" | "reembolsado";
  amount: number;
  currency: string;
  metadata: unknown;
}): Promise<{ affectedRows: number }> {
  const metaJson = JSON.stringify(input.metadata);
  const [res] = await pool.query<ResultSetHeader>(
    `UPDATE payments SET
       mp_payment_id = COALESCE(?, mp_payment_id),
       mp_preference_id = COALESCE(?, mp_preference_id),
       status = ?,
       amount = ?,
       currency = ?,
       metadata = ?,
       updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND id = ?`,
    [
      input.mpPaymentId,
      input.mpPreferenceId,
      input.status,
      input.amount,
      input.currency,
      metaJson,
      input.tenantId,
      input.paymentId,
    ],
  );
  return { affectedRows: res.affectedRows };
}
