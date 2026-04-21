"use client";

import { CheckCircle2, Clock, MessageCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type OrderPublic = {
  id: string;
  status_key: string;
  status_label: string | null;
  total: number;
  type: string;
  created_at: string;
  payment_status: string | null;
  items: { name: string; quantity: number; unit_price: number }[];
};

type PerfilLight = {
  name: string;
  logo_url: string | null;
  whatsapp: string | null;
  email: string | null;
};

function formatPrice(n: number): string {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function ConfirmacionContent() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const searchParams = useSearchParams();

  const status = searchParams.get("status") ?? "pending";
  const externalRef = searchParams.get("external_reference");

  const [order, setOrder] = useState<OrderPublic | null>(null);
  const [perfil, setPerfil] = useState<PerfilLight | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(!!externalRef);

  useEffect(() => {
    fetch(`/api/public/${tenantId}/perfil`)
      .then((r) => r.json())
      .then((d: PerfilLight) => setPerfil(d))
      .catch(() => null);
  }, [tenantId]);

  useEffect(() => {
    if (!externalRef) return;
    fetch(`/api/public/${tenantId}/orden/${externalRef}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: OrderPublic | null) => setOrder(d))
      .catch(() => null)
      .finally(() => setLoadingOrder(false));
  }, [tenantId, externalRef]);

  const orderShortId = order ? order.id.slice(0, 8).toUpperCase() : null;

  const isApproved = status === "approved";
  const isPending = status === "pending";
  const isFailure = status === "failure" || status === "rejected";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--background)",
        color: "var(--foreground)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "40px 16px 60px",
      }}
    >
      {/* Logo */}
      {perfil?.logo_url && (
        <img
          src={perfil.logo_url}
          alt={perfil.name ?? ""}
          style={{
            width: 52,
            height: 52,
            borderRadius: 12,
            objectFit: "cover",
            marginBottom: 32,
          }}
        />
      )}

      <div
        style={{
          width: "100%",
          maxWidth: 480,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0,
        }}
      >
        {/* ─── Approved ─────────────────────────────────────────────── */}
        {isApproved && (
          <>
            <CheckCircle2
              size={64}
              strokeWidth={1.5}
              style={{ color: "var(--success)", marginBottom: 16 }}
            />
            <h1
              style={{
                fontSize: 24,
                fontWeight: 800,
                margin: "0 0 8px",
                textAlign: "center",
              }}
            >
              ¡Pedido confirmado!
            </h1>
            {orderShortId && (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--foreground-muted)",
                  marginBottom: 4,
                }}
              >
                Orden #{orderShortId}
              </div>
            )}
            <div
              style={{
                fontSize: 14,
                color: "var(--foreground-muted)",
                textAlign: "center",
                marginBottom: 24,
                lineHeight: 1.5,
              }}
            >
              {order?.type === "delivery"
                ? "Te lo estamos preparando. Pronto te lo enviamos."
                : "Podés pasar a retirarlo en breve."}
            </div>

            {/* Resumen del pedido */}
            {order && !loadingOrder && (
              <div
                style={{
                  width: "100%",
                  background: "var(--background-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 16,
                  padding: "16px 20px",
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--foreground-muted)",
                    textTransform: "uppercase",
                    letterSpacing: ".04em",
                    marginBottom: 12,
                  }}
                >
                  Detalle
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {order.items.map((item, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 13,
                      }}
                    >
                      <span>
                        {item.quantity}× {item.name}
                      </span>
                      <span style={{ fontWeight: 600 }}>
                        ${formatPrice(item.unit_price * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontWeight: 700,
                    fontSize: 15,
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: "1px solid var(--border-subtle)",
                  }}
                >
                  <span>Total</span>
                  <span>${formatPrice(order.total)}</span>
                </div>
              </div>
            )}

            <Link
              href={`/${tenantId}`}
              style={{
                padding: "13px 32px",
                borderRadius: 50,
                background: "var(--accent)",
                color: "var(--accent-text)",
                fontWeight: 600,
                fontSize: 15,
                textDecoration: "none",
              }}
            >
              Volver al inicio
            </Link>
          </>
        )}

        {/* ─── Pending ──────────────────────────────────────────────── */}
        {isPending && (
          <>
            <Clock
              size={64}
              strokeWidth={1.5}
              style={{ color: "var(--warning)", marginBottom: 16 }}
            />
            <h1
              style={{
                fontSize: 24,
                fontWeight: 800,
                margin: "0 0 8px",
                textAlign: "center",
              }}
            >
              Pago en proceso
            </h1>
            <div
              style={{
                fontSize: 14,
                color: "var(--foreground-muted)",
                textAlign: "center",
                marginBottom: 32,
                lineHeight: 1.6,
              }}
            >
              Tu pago está siendo procesado. Te avisaremos por email cuando se confirme.
            </div>
            {orderShortId && (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--foreground-muted)",
                  marginBottom: 24,
                }}
              >
                Orden #{orderShortId}
              </div>
            )}
            <Link
              href={`/${tenantId}`}
              style={{
                padding: "13px 32px",
                borderRadius: 50,
                background: "var(--accent)",
                color: "var(--accent-text)",
                fontWeight: 600,
                fontSize: 15,
                textDecoration: "none",
              }}
            >
              Volver al inicio
            </Link>
          </>
        )}

        {/* ─── Failure ──────────────────────────────────────────────── */}
        {isFailure && (
          <>
            <XCircle
              size={64}
              strokeWidth={1.5}
              style={{ color: "var(--danger)", marginBottom: 16 }}
            />
            <h1
              style={{
                fontSize: 24,
                fontWeight: 800,
                margin: "0 0 8px",
                textAlign: "center",
              }}
            >
              No pudimos procesar tu pago
            </h1>
            <div
              style={{
                fontSize: 14,
                color: "var(--foreground-muted)",
                textAlign: "center",
                marginBottom: 32,
                lineHeight: 1.6,
              }}
            >
              Podés intentarlo de nuevo o contactarnos para coordinar tu pedido.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
              <Link
                href={`/${tenantId}/checkout`}
                style={{
                  display: "block",
                  textAlign: "center",
                  padding: "13px",
                  borderRadius: 12,
                  background: "var(--accent)",
                  color: "var(--accent-text)",
                  fontWeight: 600,
                  fontSize: 15,
                  textDecoration: "none",
                }}
              >
                Intentar de nuevo
              </Link>
              {perfil?.whatsapp && (
                <a
                  href={`https://wa.me/${perfil.whatsapp.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "13px",
                    borderRadius: 12,
                    background: "#25D366",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: 15,
                    textDecoration: "none",
                  }}
                >
                  <MessageCircle size={16} />
                  Contactar por WhatsApp
                </a>
              )}
              <Link
                href={`/${tenantId}`}
                style={{
                  display: "block",
                  textAlign: "center",
                  padding: "13px",
                  borderRadius: 12,
                  border: "1px solid var(--border-default)",
                  background: "transparent",
                  color: "var(--foreground-muted)",
                  fontWeight: 500,
                  fontSize: 14,
                  textDecoration: "none",
                }}
              >
                Volver al inicio
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ConfirmacionPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--background)",
          }}
        />
      }
    >
      <ConfirmacionContent />
    </Suspense>
  );
}
