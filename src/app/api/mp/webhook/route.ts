import { NextResponse } from "next/server";

import {
  findPaymentForMpWebhook,
  getAnyActiveMpAccessToken,
  getMpAccessTokenByUserId,
  getMpAccessTokenForTenant,
  paymentExistsWithMpPaymentId,
  updatePaymentMpWebhookFields,
} from "@/lib/db/mp-webhook-payments";
import { closeOrder } from "@/lib/db/orders";
import { fetchMercadoPagoPayment } from "@/lib/mp/mercadopago-payment-api";
import { verifyMercadoPagoWebhookSignature } from "@/lib/mp/webhook-signature";

function ok(): NextResponse {
  return new NextResponse(null, { status: 200 });
}

function unauthorized(): NextResponse {
  return new NextResponse(null, { status: 401 });
}

function extractDataId(
  url: URL,
  body: Record<string, unknown>,
): string {
  const fromQuery = url.searchParams.get("data.id") ?? "";
  const data = body.data;
  const fromBody =
    typeof data === "object" && data !== null && "id" in data
      ? String((data as { id: unknown }).id)
      : "";
  return (fromQuery || fromBody).trim();
}

function mapMpStatusToPaymentStatus(
  mpStatus: string | undefined,
): "pendiente" | "aprobado" | "rechazado" | "cancelado" | "reembolsado" {
  const s = String(mpStatus ?? "").toLowerCase();
  if (s === "approved") {
    return "aprobado";
  }
  if (s === "rejected") {
    return "rechazado";
  }
  if (s === "cancelled" || s === "canceled") {
    return "cancelado";
  }
  if (s === "refunded") {
    return "reembolsado";
  }
  return "pendiente";
}

function isPaymentWebhookAction(action: unknown): boolean {
  const a = String(action ?? "");
  return a === "payment.created" || a === "payment.updated";
}

export async function POST(request: Request) {
  const secret = (process.env.MP_WEBHOOK_SECRET ?? "").trim();
  const url = new URL(request.url);

  let rawBody = "";
  let body: Record<string, unknown> = {};
  try {
    rawBody = await request.text();
    if (rawBody) {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    }
  } catch (e) {
    console.error("[MP webhook] JSON inválido", e);
    return ok();
  }

  const dataId = extractDataId(url, body);
  const xSignature = request.headers.get("x-signature");
  const xRequestId = request.headers.get("x-request-id");

  if (!secret) {
    console.error("[MP webhook] MP_WEBHOOK_SECRET no configurado");
    return unauthorized();
  }

  const signatureOk = verifyMercadoPagoWebhookSignature({
    xSignature,
    xRequestId,
    dataId,
    secret,
  });
  if (!signatureOk) {
    return unauthorized();
  }

  try {
    const action = body.action;
    if (!isPaymentWebhookAction(action)) {
      return ok();
    }

    const mpPaymentId = dataId;
    if (!mpPaymentId) {
      console.error("[MP webhook] Sin data.id en query ni body");
      return ok();
    }

    if (await paymentExistsWithMpPaymentId(mpPaymentId)) {
      return ok();
    }

    const mpUserIdRaw = body.user_id;
    const mpUserId =
      mpUserIdRaw === undefined || mpUserIdRaw === null
        ? ""
        : String(mpUserIdRaw);

    let tokenRow = mpUserId
      ? await getMpAccessTokenByUserId(mpUserId)
      : null;
    if (!tokenRow) {
      tokenRow = await getAnyActiveMpAccessToken();
    }
    if (!tokenRow) {
      console.error(
        "[MP webhook] Sin access_token en mp_integrations para consultar el pago",
      );
      return ok();
    }

    let mpResource;
    try {
      mpResource = await fetchMercadoPagoPayment(
        tokenRow.access_token,
        mpPaymentId,
      );
    } catch (e) {
      console.error("[MP webhook] Error al consultar MP /v1/payments", e);
      return ok();
    }
    if (!mpResource) {
      console.error("[MP webhook] Pago no encontrado en MP", mpPaymentId);
      return ok();
    }

    let prefId =
      mpResource.preference_id != null && mpResource.preference_id !== ""
        ? String(mpResource.preference_id)
        : null;

    let row = await findPaymentForMpWebhook(mpPaymentId, prefId);
    if (row) {
      const tenantToken = await getMpAccessTokenForTenant(row.tenant_id);
      if (tenantToken) {
        try {
          const again = await fetchMercadoPagoPayment(
            tenantToken.access_token,
            mpPaymentId,
          );
          if (again) {
            mpResource = again;
            if (again.preference_id != null && String(again.preference_id)) {
              prefId = String(again.preference_id);
            }
          }
        } catch (e) {
          console.error(
            "[MP webhook] Refresco GET /v1/payments con token del tenant",
            e,
          );
        }
      }
    }
    if (!row) {
      console.error(
        "[MP webhook] Sin fila en payments para mp_payment_id / preference_id",
        { mpPaymentId, prefId },
      );
      return ok();
    }

    const mpStatus = mpResource.status;
    const dbStatus = mapMpStatusToPaymentStatus(mpStatus);
    const amount =
      typeof mpResource.transaction_amount === "number" &&
      Number.isFinite(mpResource.transaction_amount)
        ? mpResource.transaction_amount
        : 0;
    const currency =
      mpResource.currency_id != null && String(mpResource.currency_id)
        ? String(mpResource.currency_id)
        : "ARS";

    const metadataPayload = {
      webhook: body,
      mp_payment: mpResource,
      raw_body: rawBody,
    };

    await updatePaymentMpWebhookFields({
      tenantId: row.tenant_id,
      paymentId: row.id,
      mpPaymentId,
      mpPreferenceId: prefId,
      status: dbStatus,
      amount,
      currency,
      metadata: metadataPayload,
    });

    if (dbStatus === "aprobado" && !row.order_is_terminal) {
      try {
        await closeOrder(
          row.tenant_id,
          row.order_id,
          {
            method: "mercadopago",
            amount,
            currency,
            mp_payment_id: mpPaymentId,
            mp_preference_id: prefId,
          },
          { reusePaymentId: row.id },
        );
      } catch (e) {
        console.error("[MP webhook] closeOrder tras aprobación MP", e);
      }
    }
  } catch (e) {
    console.error("[MP webhook] Error interno", e);
  }

  return ok();
}
