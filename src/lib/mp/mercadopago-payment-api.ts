export type MercadoPagoPaymentResource = {
  id?: string | number;
  status?: string;
  transaction_amount?: number;
  currency_id?: string;
  metadata?: Record<string, unknown>;
  external_reference?: string | null;
  /** ID de preferencia asociado (Checkout Pro / API). */
  preference_id?: string | null;
};

export async function fetchMercadoPagoPayment(
  accessToken: string,
  paymentId: string,
): Promise<MercadoPagoPaymentResource | null> {
  const res = await fetch(
    `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `MP payments API ${res.status}: ${text.slice(0, 500)}`,
    );
  }
  return (await res.json()) as MercadoPagoPaymentResource;
}
