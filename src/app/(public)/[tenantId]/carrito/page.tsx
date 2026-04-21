"use client";

import { ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { CartItem } from "../CartaClient";

function formatPrice(n: number): string {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function CarritoPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const router = useRouter();
  const CART_KEY = `nuba-cart-${tenantId}`;

  const [cart, setCart] = useState<CartItem[]>([]);
  const [mounted, setMounted] = useState(false);

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

  function persist(next: CartItem[]) {
    setCart(next);
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function increment(item: CartItem) {
    persist(
      cart.map((i) =>
        i.product_id === item.product_id && i.variant_id === item.variant_id
          ? { ...i, quantity: i.quantity + 1 }
          : i,
      ),
    );
  }

  function decrement(item: CartItem) {
    if (item.quantity <= 1) {
      persist(cart.filter((i) => !(i.product_id === item.product_id && i.variant_id === item.variant_id)));
      return;
    }
    persist(
      cart.map((i) =>
        i.product_id === item.product_id && i.variant_id === item.variant_id
          ? { ...i, quantity: i.quantity - 1 }
          : i,
      ),
    );
  }

  function remove(item: CartItem) {
    persist(cart.filter((i) => !(i.product_id === item.product_id && i.variant_id === item.variant_id)));
  }

  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const totalItems = cart.reduce((s, i) => s + i.quantity, 0);

  if (!mounted) return null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--background)",
        color: "var(--foreground)",
        display: "flex",
        flexDirection: "column",
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
          gap: 12,
        }}
      >
        <Link
          href={`/${tenantId}`}
          style={{
            fontSize: 13,
            color: "var(--foreground-muted)",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: 4,
            flexShrink: 0,
          }}
        >
          ← Seguir eligiendo
        </Link>
        <div style={{ flex: 1, textAlign: "center" }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Tu pedido</span>
        </div>
        <div style={{ width: 90, flexShrink: 0 }} />
      </header>

      {/* Contenido */}
      <div style={{ flex: 1, maxWidth: 600, width: "100%", margin: "0 auto", padding: "16px 0 180px" }}>
        {cart.length === 0 ? (
          /* Carrito vacío */
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              padding: "80px 16px",
              textAlign: "center",
            }}
          >
            <ShoppingCart size={56} style={{ color: "var(--foreground-muted)" }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
                Tu carrito está vacío
              </div>
              <div style={{ fontSize: 14, color: "var(--foreground-muted)" }}>
                Agregá productos desde la carta para empezar tu pedido.
              </div>
            </div>
            <Link
              href={`/${tenantId}`}
              style={{
                marginTop: 8,
                padding: "12px 28px",
                borderRadius: 50,
                background: "var(--accent)",
                color: "var(--accent-text)",
                fontWeight: 600,
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              Ver la carta
            </Link>
          </div>
        ) : (
          /* Lista de items */
          <div>
            <div style={{ padding: "0 16px", marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: "var(--foreground-muted)" }}>
                {totalItems} {totalItems === 1 ? "producto" : "productos"}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {cart.map((item, idx) => {
                const itemSubtotal = item.unit_price * item.quantity;
                const key = `${item.product_id}-${item.variant_id ?? ""}`;
                return (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "14px 16px",
                      borderBottom: idx < cart.length - 1
                        ? "1px solid var(--border-subtle)"
                        : "none",
                    }}
                  >
                    {/* Imagen */}
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 8,
                        background: "var(--background-raised)",
                        flexShrink: 0,
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                        fontWeight: 700,
                        color: "var(--foreground-muted)",
                      }}
                    >
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.product_name}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        item.product_name.charAt(0).toUpperCase()
                      )}
                    </div>

                    {/* Nombre + variante */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 500,
                          fontSize: 14,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.product_name}
                      </div>
                      {item.variant_name && (
                        <div style={{ fontSize: 12, color: "var(--foreground-muted)", marginTop: 2 }}>
                          {item.variant_name}
                        </div>
                      )}
                      <div style={{ fontSize: 13, color: "var(--foreground-muted)", marginTop: 2 }}>
                        ${formatPrice(item.unit_price)} c/u
                      </div>
                    </div>

                    {/* Controles + subtotal */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: 8,
                        flexShrink: 0,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        ${formatPrice(itemSubtotal)}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button
                          onClick={() => decrement(item)}
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 6,
                            border: "1px solid var(--border-default)",
                            background: "var(--background-raised)",
                            color: "var(--foreground)",
                            fontSize: 16,
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                          aria-label="Quitar uno"
                        >
                          −
                        </button>
                        <span
                          style={{
                            minWidth: 20,
                            textAlign: "center",
                            fontWeight: 700,
                            fontSize: 14,
                          }}
                        >
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => increment(item)}
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 6,
                            border: "none",
                            background: "var(--accent)",
                            color: "var(--accent-text)",
                            fontSize: 16,
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                          aria-label="Agregar uno"
                        >
                          +
                        </button>
                        <button
                          onClick={() => remove(item)}
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 6,
                            border: "1px solid var(--border-subtle)",
                            background: "transparent",
                            color: "var(--foreground-muted)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            marginLeft: 2,
                          }}
                          aria-label="Eliminar producto"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Resumen sticky al pie */}
      {cart.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "var(--background-surface)",
            borderTop: "1px solid var(--border-subtle)",
            padding: "16px",
            zIndex: 20,
          }}
        >
          <div style={{ maxWidth: 600, margin: "0 auto" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <span style={{ fontSize: 14, color: "var(--foreground-muted)" }}>Total</span>
              <span style={{ fontSize: 20, fontWeight: 800 }}>${formatPrice(subtotal)}</span>
            </div>
            <button
              onClick={() => router.push(`/${tenantId}/checkout`)}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 12,
                border: "none",
                background: "var(--accent)",
                color: "var(--accent-text)",
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Ir al checkout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
