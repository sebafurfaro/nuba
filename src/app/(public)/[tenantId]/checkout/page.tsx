"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MessageCircle, ShoppingBag, Truck } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { GeoSelector } from "@/components/ui/GeoSelector";

import type { CartItem, PublicBranch } from "../CartaClient";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type PerfilPublic = {
  name: string;
  logo_url: string | null;
  whatsapp: string | null;
  email: string | null;
  enable_delivery: boolean;
  branches: PublicBranch[];
};

// ─── Zod schema ───────────────────────────────────────────────────────────────

const schema = z
  .object({
    first_name: z.string().min(1, "Requerido").max(100),
    last_name: z.string().min(1, "Requerido").max(100),
    email: z.string().email("Email inválido"),
    phone: z.string().min(8, "Teléfono inválido").max(20),
    type: z.enum(["takeaway", "delivery"]),
    delivery_street: z.string().optional(),
    delivery_city: z.string().optional(),
    branch_id: z.string().uuid().optional().nullable(),
  })
  .refine(
    (d) => {
      if (d.type === "delivery" && !d.delivery_street?.trim()) return false;
      return true;
    },
    { message: "Ingresá la dirección de entrega", path: ["delivery_street"] },
  );

type FormValues = z.input<typeof schema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(n: number): string {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CheckoutPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const router = useRouter();
  const CART_KEY = `nuba-cart-${tenantId}`;

  const [cart, setCart] = useState<CartItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [perfil, setPerfil] = useState<PerfilPublic | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [noMpDialog, setNoMpDialog] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: "takeaway",
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      delivery_street: "",
      delivery_city: "",
      branch_id: null,
    },
  });

  const orderType = form.watch("type");
  const deliveryCity = form.watch("delivery_city");
  const cartTotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const cartItems = cart.reduce((s, i) => s + i.quantity, 0);

  // Cargar carrito + perfil al montar
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CART_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as CartItem[];
        if (Array.isArray(parsed)) setCart(parsed);
      }
    } catch {
      // ignore
    }
    setMounted(true);
  }, [CART_KEY]);

  useEffect(() => {
    fetch(`/api/public/${tenantId}/perfil`)
      .then((r) => r.json())
      .then((data: PerfilPublic) => setPerfil(data))
      .catch(() => null);
  }, [tenantId]);

  // Si carrito vacío después de montar → redirigir
  const redirectedRef = useRef(false);
  useEffect(() => {
    if (mounted && cart.length === 0 && !redirectedRef.current) {
      redirectedRef.current = true;
      router.replace(`/${tenantId}/carrito`);
    }
  }, [mounted, cart.length, tenantId, router]);

  // Pre-seleccionar sucursal si solo hay una
  useEffect(() => {
    if (perfil?.branches.length === 1 && perfil.branches[0]) {
      form.setValue("branch_id", perfil.branches[0].id);
    }
  }, [perfil, form]);

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    setApiError(null);
    try {
      const deliveryAddress =
        values.type === "delivery"
          ? [values.delivery_street, values.delivery_city].filter(Boolean).join(", ")
          : undefined;

      const res = await fetch(`/api/public/${tenantId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: `${values.first_name.trim()} ${values.last_name.trim()}`,
          customer_email: values.email,
          customer_phone: values.phone,
          type: values.type,
          delivery_address: deliveryAddress,
          branch_id: values.branch_id ?? null,
          items: cart.map((i) => ({
            product_id: i.product_id,
            variant_id: i.variant_id ?? null,
            quantity: i.quantity,
          })),
        }),
      });

      if (res.status === 422) {
        setNoMpDialog(true);
        return;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setApiError(body.error ?? "No se pudo procesar tu pedido. Intentá de nuevo.");
        return;
      }

      const { init_point } = (await res.json()) as { init_point: string };

      // Limpiar carrito
      try {
        localStorage.removeItem(CART_KEY);
      } catch {
        // ignore
      }

      // Redirigir a MercadoPago
      window.location.href = init_point;
    } catch {
      setApiError("Error de conexión. Revisá tu internet e intentá de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!mounted) return null;

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 42,
    borderRadius: 8,
    border: "1px solid var(--border-subtle)",
    background: "var(--background-raised)",
    color: "var(--foreground)",
    padding: "0 12px",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 500,
    color: "var(--foreground)",
    marginBottom: 4,
    display: "block",
  };

  const errorStyle: React.CSSProperties = {
    fontSize: 12,
    color: "var(--danger)",
    marginTop: 4,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--background)",
        color: "var(--foreground)",
      }}
    >
      {/* Header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--background-surface)",
          borderBottom: "1px solid var(--border-subtle)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link
          href={`/${tenantId}/carrito`}
          style={{ fontSize: 13, color: "var(--foreground-muted)", textDecoration: "none" }}
        >
          ← Volver
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {perfil?.logo_url && (
            <img
              src={perfil.logo_url}
              alt={perfil.name}
              style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }}
            />
          )}
          <span style={{ fontWeight: 700, fontSize: 15 }}>Checkout</span>
        </div>
        {/* Indicador de pasos */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <span
            style={{
              padding: "2px 10px",
              borderRadius: 20,
              background: "var(--accent)",
              color: "var(--accent-text)",
              fontWeight: 600,
            }}
          >
            1 Datos
          </span>
          <span style={{ color: "var(--foreground-muted)" }}>→</span>
          <span
            style={{
              padding: "2px 10px",
              borderRadius: 20,
              background: "var(--background-raised)",
              color: "var(--foreground-muted)",
              fontWeight: 500,
            }}
          >
            2 Pago
          </span>
        </div>
      </header>

      {/* Layout desktop: form + sidebar */}
      <div
        style={{
          maxWidth: 920,
          margin: "0 auto",
          padding: "24px 16px 120px",
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 24,
        }}
      >
        {/* Formulario */}
        <form
          onSubmit={(e) => {
            void form.handleSubmit(onSubmit)(e);
          }}
        >
          {/* Sección: Tus datos */}
          <section
            style={{
              background: "var(--background-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 16,
              padding: "20px 20px",
              marginBottom: 16,
            }}
          >
            <h2
              style={{
                fontSize: 16,
                fontWeight: 700,
                marginBottom: 16,
                marginTop: 0,
              }}
            >
              Tus datos
            </h2>

            {/* Nombre + apellido */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div>
                <label style={labelStyle}>Nombre</label>
                <input
                  {...form.register("first_name")}
                  placeholder="Ana"
                  style={inputStyle}
                />
                {form.formState.errors.first_name && (
                  <div style={errorStyle}>{form.formState.errors.first_name.message}</div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Apellido</label>
                <input
                  {...form.register("last_name")}
                  placeholder="García"
                  style={inputStyle}
                />
                {form.formState.errors.last_name && (
                  <div style={errorStyle}>{form.formState.errors.last_name.message}</div>
                )}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Email</label>
              <input
                {...form.register("email")}
                type="email"
                placeholder="ana@email.com"
                style={inputStyle}
              />
              {form.formState.errors.email && (
                <div style={errorStyle}>{form.formState.errors.email.message}</div>
              )}
            </div>

            <div>
              <label style={labelStyle}>Teléfono</label>
              <input
                {...form.register("phone")}
                type="tel"
                placeholder="+54 11 1234-5678"
                style={inputStyle}
              />
              {form.formState.errors.phone && (
                <div style={errorStyle}>{form.formState.errors.phone.message}</div>
              )}
            </div>

            {/* Cuenta opcional */}
            <div
              style={{
                marginTop: 16,
                paddingTop: 16,
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              <Link
                href={`/login?tenantId=${tenantId}&returnUrl=/${tenantId}/checkout`}
                style={{
                  fontSize: 13,
                  color: "var(--accent)",
                  textDecoration: "none",
                }}
              >
                ¿Tenés cuenta? Ingresá para acumular historial de compras →
              </Link>
            </div>
          </section>

          {/* Sección: Modalidad */}
          <section
            style={{
              background: "var(--background-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 16,
              padding: "20px",
              marginBottom: 16,
            }}
          >
            <h2
              style={{
                fontSize: 16,
                fontWeight: 700,
                marginBottom: 16,
                marginTop: 0,
              }}
            >
              ¿Cómo querés recibirlo?
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: perfil?.enable_delivery ? "1fr 1fr" : "1fr",
                gap: 12,
              }}
            >
              {/* Takeaway */}
              <button
                type="button"
                onClick={() => form.setValue("type", "takeaway")}
                style={{
                  padding: "16px",
                  borderRadius: 12,
                  border: `2px solid ${orderType === "takeaway" ? "var(--accent)" : "var(--border-subtle)"}`,
                  background:
                    orderType === "takeaway" ? "var(--accent-soft)" : "var(--background-raised)",
                  cursor: "pointer",
                  textAlign: "left",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <ShoppingBag
                  size={20}
                  style={{
                    color: orderType === "takeaway" ? "var(--accent)" : "var(--foreground-muted)",
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                />
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      color: "var(--foreground)",
                      marginBottom: 2,
                    }}
                  >
                    Takeaway
                  </div>
                  <div style={{ fontSize: 12, color: "var(--foreground-muted)" }}>
                    Retirás en el local
                  </div>
                </div>
              </button>

              {/* Delivery (solo si habilitado) */}
              {perfil?.enable_delivery && (
                <button
                  type="button"
                  onClick={() => form.setValue("type", "delivery")}
                  style={{
                    padding: "16px",
                    borderRadius: 12,
                    border: `2px solid ${orderType === "delivery" ? "var(--accent)" : "var(--border-subtle)"}`,
                    background:
                      orderType === "delivery"
                        ? "var(--accent-soft)"
                        : "var(--background-raised)",
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <Truck
                    size={20}
                    style={{
                      color:
                        orderType === "delivery" ? "var(--accent)" : "var(--foreground-muted)",
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  />
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 14,
                        color: "var(--foreground)",
                        marginBottom: 2,
                      }}
                    >
                      Delivery
                    </div>
                    <div style={{ fontSize: 12, color: "var(--foreground-muted)" }}>
                      Te lo enviamos
                    </div>
                  </div>
                </button>
              )}
            </div>

            {/* Select de sucursal (si hay múltiples) */}
            {orderType === "takeaway" && perfil && perfil.branches.length > 1 && (
              <div style={{ marginTop: 16 }}>
                <label style={labelStyle}>Sucursal de retiro</label>
                <select
                  {...form.register("branch_id")}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="">Seleccionar sucursal</option>
                  {perfil.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} — {b.address}
                      {b.city ? `, ${b.city}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Dirección de entrega */}
            {orderType === "delivery" && (
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Calle y número</label>
                  <input
                    {...form.register("delivery_street")}
                    placeholder="Av. Corrientes 1234"
                    style={inputStyle}
                  />
                  {form.formState.errors.delivery_street && (
                    <div style={errorStyle}>
                      {form.formState.errors.delivery_street.message}
                    </div>
                  )}
                </div>
                <div>
                  <label style={labelStyle}>Ciudad</label>
                  <GeoSelector
                    cityValue={deliveryCity ?? null}
                    onCityChange={(v) =>
                      form.setValue("delivery_city", v ?? "", { shouldValidate: true })
                    }
                  />
                </div>
              </div>
            )}
          </section>

          {/* Resumen del pedido (visible en mobile al pie del form) */}
          <section
            style={{
              background: "var(--background-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 16,
              padding: "20px",
              marginBottom: 16,
            }}
          >
            <h2
              style={{
                fontSize: 16,
                fontWeight: 700,
                marginBottom: 12,
                marginTop: 0,
              }}
            >
              Resumen del pedido
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {cart.map((item) => (
                <div
                  key={`${item.product_id}-${item.variant_id ?? ""}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>
                      {item.quantity}× {item.product_name}
                    </span>
                    {item.variant_name && (
                      <span style={{ fontSize: 12, color: "var(--foreground-muted)" }}>
                        {" "}
                        ({item.variant_name})
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
                    ${formatPrice(item.unit_price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 16,
                paddingTop: 12,
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              <span style={{ fontWeight: 700 }}>Total</span>
              <span style={{ fontWeight: 800, fontSize: 18 }}>${formatPrice(cartTotal)}</span>
            </div>
          </section>

          {/* Error de API */}
          {apiError && (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: 10,
                background: "var(--danger-soft)",
                color: "var(--danger)",
                fontSize: 14,
                marginBottom: 16,
              }}
            >
              {apiError}
            </div>
          )}

          {/* Botón submit */}
          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              padding: "16px",
              borderRadius: 12,
              border: "none",
              background: submitting ? "var(--background-raised)" : "var(--accent)",
              color: submitting ? "var(--foreground-muted)" : "var(--accent-text)",
              fontSize: 16,
              fontWeight: 700,
              cursor: submitting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {submitting ? "Procesando..." : `Confirmar y pagar · $${formatPrice(cartTotal)}`}
          </button>

          <div
            style={{
              textAlign: "center",
              marginTop: 12,
              fontSize: 12,
              color: "var(--foreground-muted)",
            }}
          >
            {cartItems} {cartItems === 1 ? "producto" : "productos"} · Pago seguro con MercadoPago
          </div>
        </form>
      </div>

      {/* Dialog: sin MP configurado */}
      {noMpDialog && (
        <>
          <div
            onClick={() => setNoMpDialog(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              zIndex: 50,
            }}
          />
          <div
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 51,
              background: "var(--background-surface)",
              borderRadius: "20px 20px 0 0",
              padding: "24px 20px 36px",
              maxWidth: 480,
              margin: "0 auto",
            }}
          >
            <div
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                background: "var(--border-default)",
                margin: "0 auto 20px",
              }}
            />
            <div
              style={{
                fontWeight: 700,
                fontSize: 16,
                marginBottom: 10,
                color: "var(--foreground)",
              }}
            >
              Pagos online no disponibles
            </div>
            <div
              style={{
                fontSize: 14,
                color: "var(--foreground-muted)",
                lineHeight: 1.6,
                marginBottom: 20,
              }}
            >
              Este local todavía no tiene pagos online configurados. Contactalos directamente para
              coordinar tu pedido.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                    padding: "12px",
                    borderRadius: 10,
                    background: "#25D366",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: 14,
                    textDecoration: "none",
                  }}
                >
                  <MessageCircle size={16} />
                  Contactar por WhatsApp
                </a>
              )}
              {perfil?.email && (
                <a
                  href={`mailto:${perfil.email}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "12px",
                    borderRadius: 10,
                    border: "1px solid var(--border-default)",
                    background: "var(--background-raised)",
                    color: "var(--foreground)",
                    fontWeight: 600,
                    fontSize: 14,
                    textDecoration: "none",
                  }}
                >
                  Enviar email
                </a>
              )}
              <button
                onClick={() => setNoMpDialog(false)}
                style={{
                  padding: "12px",
                  borderRadius: 10,
                  border: "none",
                  background: "transparent",
                  color: "var(--foreground-muted)",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
