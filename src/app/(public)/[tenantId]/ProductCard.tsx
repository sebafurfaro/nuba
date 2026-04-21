"use client";

import { useState } from "react";

export type PublicVariant = {
  id: string;
  name: string;
  price: number | null;
};

export type PublicProduct = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  discount_price: number | null;
  category_id: string | null;
  variants: PublicVariant[];
};

type Props = {
  product: PublicProduct;
  cartQty: number;
  onAdd: (variantId?: string, variantName?: string, unitPrice?: number) => void;
  onRemove: () => void;
};

function formatPrice(n: number): string {
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function ProductCard({ product, cartQty, onAdd, onRemove }: Props) {
  const [showVariants, setShowVariants] = useState(false);

  const effectivePrice = product.discount_price ?? product.price;

  function handleAddClick() {
    if (product.variants.length > 0) {
      setShowVariants(true);
    } else {
      onAdd();
    }
  }

  function handleVariantSelect(v: PublicVariant) {
    const price = v.price ?? effectivePrice;
    onAdd(v.id, v.name, price);
    setShowVariants(false);
  }

  return (
    <>
      <div
        style={{
          borderRadius: 12,
          border: "1px solid var(--border-subtle)",
          background: "var(--background-surface)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Imagen */}
        <div
          style={{
            width: "100%",
            aspectRatio: "1 / 1",
            background: "var(--background-raised)",
            position: "relative",
            flexShrink: 0,
          }}
        >
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                fontWeight: 700,
                color: "var(--foreground-muted)",
              }}
            >
              {product.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Contenido */}
        <div
          style={{
            padding: "10px 12px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            flex: 1,
          }}
        >
          {/* Nombre */}
          <div
            style={{
              fontWeight: 500,
              fontSize: 13,
              lineHeight: "1.3",
              color: "var(--foreground)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {product.name}
          </div>

          {/* Descripción */}
          {product.description && (
            <div
              style={{
                fontSize: 12,
                color: "var(--foreground-muted)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {product.description}
            </div>
          )}

          {/* Precio */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 6,
              marginTop: 2,
            }}
          >
            {product.discount_price != null ? (
              <>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--foreground-muted)",
                    textDecoration: "line-through",
                  }}
                >
                  ${formatPrice(product.price)}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--accent)",
                  }}
                >
                  ${formatPrice(product.discount_price)}
                </span>
              </>
            ) : (
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--foreground)",
                }}
              >
                ${formatPrice(product.price)}
              </span>
            )}
          </div>

          {/* Controles de cantidad */}
          <div style={{ marginTop: 8 }}>
            {cartQty === 0 ? (
              <button
                onClick={handleAddClick}
                style={{
                  width: "100%",
                  minHeight: 36,
                  borderRadius: 8,
                  border: "none",
                  background: "var(--accent)",
                  color: "var(--accent-text)",
                  fontSize: 20,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                +
              </button>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 4,
                }}
              >
                <button
                  onClick={onRemove}
                  style={{
                    minWidth: 36,
                    minHeight: 36,
                    borderRadius: 8,
                    border: "1px solid var(--border-default)",
                    background: "var(--background-raised)",
                    color: "var(--foreground)",
                    fontSize: 18,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: 1,
                  }}
                >
                  −
                </button>
                <span
                  style={{
                    minWidth: 28,
                    textAlign: "center",
                    fontWeight: 700,
                    fontSize: 14,
                    color: "var(--foreground)",
                  }}
                >
                  {cartQty}
                </span>
                <button
                  onClick={handleAddClick}
                  style={{
                    minWidth: 36,
                    minHeight: 36,
                    borderRadius: 8,
                    border: "none",
                    background: "var(--accent)",
                    color: "var(--accent-text)",
                    fontSize: 18,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: 1,
                  }}
                >
                  +
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom sheet de variantes */}
      {showVariants && (
        <>
          {/* Overlay */}
          <div
            onClick={() => setShowVariants(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              zIndex: 50,
            }}
          />
          {/* Sheet */}
          <div
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 51,
              background: "var(--background-surface)",
              borderRadius: "20px 20px 0 0",
              padding: "20px 16px 32px",
              maxHeight: "70vh",
              overflowY: "auto",
            }}
          >
            {/* Handle */}
            <div
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                background: "var(--border-default)",
                margin: "0 auto 16px",
              }}
            />
            <div
              style={{
                fontWeight: 700,
                fontSize: 16,
                color: "var(--foreground)",
                marginBottom: 4,
              }}
            >
              {product.name}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--foreground-muted)",
                marginBottom: 20,
              }}
            >
              Elegí una opción
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {product.variants.map((v) => {
                const vPrice = v.price ?? effectivePrice;
                return (
                  <button
                    key={v.id}
                    onClick={() => handleVariantSelect(v)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "14px 16px",
                      borderRadius: 12,
                      border: "1px solid var(--border-subtle)",
                      background: "var(--background-raised)",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: "var(--foreground)",
                      }}
                    >
                      {v.name}
                    </span>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--accent)",
                      }}
                    >
                      ${formatPrice(vPrice)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
