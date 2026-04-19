import { createHmac, timingSafeEqual } from "node:crypto";

export type MercadoPagoWebhookSignatureInput = {
  /** Valor del header `x-signature` (ej. `ts=...,v1=...`). */
  xSignature: string | null;
  /** Valor del header `x-request-id` (opcional según MP). */
  xRequestId: string | null;
  /**
   * `data.id` del aviso (query `data.id` o cuerpo JSON). Si es alfanumérico, MP indica usar minúsculas en el manifest.
   */
  dataId: string;
  /** Secreto de la app en Mercado Pago (panel → Webhooks). */
  secret: string;
};

function normalizeDataIdForManifest(dataId: string): string {
  const t = dataId.trim();
  if (/^[a-zA-Z0-9]+$/.test(t)) {
    return t.toLowerCase();
  }
  return t;
}

/**
 * Verifica el origen del webhook según
 * https://www.mercadopago.com.ar/developers/en/docs/your-integrations/notifications/webhooks
 */
export function verifyMercadoPagoWebhookSignature(
  input: MercadoPagoWebhookSignatureInput,
): boolean {
  const { xSignature, xRequestId, dataId, secret } = input;
  if (!xSignature || !secret.trim()) {
    return false;
  }

  let ts: string | null = null;
  let v1: string | null = null;
  for (const part of xSignature.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) {
      continue;
    }
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === "ts") {
      ts = value;
    } else if (key === "v1") {
      v1 = value;
    }
  }
  if (!ts || !v1) {
    return false;
  }

  const idPart = normalizeDataIdForManifest(dataId);
  const manifest = xRequestId?.trim()
    ? `id:${idPart};request-id:${xRequestId.trim()};ts:${ts};`
    : `id:${idPart};ts:${ts};`;

  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(v1, "utf8");
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
