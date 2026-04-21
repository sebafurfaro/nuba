"use client";

import {
  ExternalLink,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShoppingCart,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ProductCard } from "./ProductCard";
import type { PublicProduct } from "./ProductCard";

export type CartItem = {
  product_id: string;
  product_name: string;
  variant_id: string | null;
  variant_name: string | null;
  unit_price: number;
  quantity: number;
  image_url: string | null;
};

export type PublicCategoryNode = {
  id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  image_url: string | null;
  level: number;
  sort_order: number;
  children: PublicCategoryNode[];
};

export type PublicBranch = {
  id: string;
  name: string;
  address: string;
  city: string | null;
  phone: string | null;
  email: string | null;
};

export type PublicPerfil = {
  name: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  youtube: string | null;
  enable_delivery: boolean;
  branches: PublicBranch[];
};

type Props = {
  tenantId: string;
  perfil: PublicPerfil;
  categories: PublicCategoryNode[];
  products: Record<string, PublicProduct[]>;
};

function formatPrice(n: number): string {
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function CartaClient({ tenantId, perfil, categories, products }: Props) {
  const router = useRouter();
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);

  const CART_KEY = `nuba-cart-${tenantId}`;

  // Cargar carrito del localStorage al montar
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
  }, [CART_KEY]);

  // Persistir carrito en localStorage al cambiar
  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      // ignore
    }
  }, [cart, CART_KEY]);

  function getCartQty(productId: string): number {
    return cart
      .filter((i) => i.product_id === productId)
      .reduce((s, i) => s + i.quantity, 0);
  }

  function addToCart(
    product: PublicProduct,
    variantId?: string,
    variantName?: string,
    unitPrice?: number,
  ) {
    const price = unitPrice ?? product.discount_price ?? product.price;
    const vId = variantId ?? null;

    setCart((prev) => {
      const existing = prev.find(
        (i) => i.product_id === product.id && i.variant_id === vId,
      );
      if (existing) {
        return prev.map((i) =>
          i.product_id === product.id && i.variant_id === vId
            ? { ...i, quantity: i.quantity + 1 }
            : i,
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          product_name: product.name,
          variant_id: vId,
          variant_name: variantName ?? null,
          unit_price: price,
          quantity: 1,
          image_url: product.image_url,
        },
      ];
    });
  }

  function removeFromCart(productId: string) {
    setCart((prev) => {
      const item = prev.find((i) => i.product_id === productId);
      if (!item) return prev;
      if (item.quantity <= 1) {
        return prev.filter((i) => i.product_id !== productId);
      }
      return prev.map((i) =>
        i.product_id === productId ? { ...i, quantity: i.quantity - 1 } : i,
      );
    });
  }

  const totalItems = cart.reduce((s, i) => s + i.quantity, 0);
  const totalPrice = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);

  const categoriesToShow =
    activeCategoryId
      ? categories.filter((c) => c.id === activeCategoryId)
      : categories;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--background)",
        color: "var(--foreground)",
        fontFamily: "inherit",
      }}
    >
      {/* Hero */}
      <div style={{ position: "relative" }}>
        <div
          style={{
            width: "100%",
            height: 220,
            background: perfil.banner_url
              ? `url(${perfil.banner_url}) center/cover`
              : "var(--background-raised)",
            position: "relative",
          }}
        />
        {/* Logo */}
        <div
          style={{
            position: "absolute",
            bottom: -40,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1,
          }}
        >
          {perfil.logo_url ? (
            <img
              src={perfil.logo_url}
              alt={perfil.name}
              style={{
                width: 80,
                height: 80,
                borderRadius: 16,
                border: "3px solid var(--background-surface)",
                background: "var(--background-surface)",
                objectFit: "cover",
                display: "block",
              }}
            />
          ) : (
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 16,
                border: "3px solid var(--background-surface)",
                background: "var(--accent-soft)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                fontWeight: 700,
                color: "var(--accent)",
              }}
            >
              {perfil.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {/* Nombre del tenant */}
      <div style={{ textAlign: "center", marginTop: 52, marginBottom: 24, padding: "0 16px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "var(--foreground)" }}>
          {perfil.name}
        </h1>
        {perfil.description && (
          <p
            style={{
              color: "var(--foreground-muted)",
              fontSize: 14,
              marginTop: 6,
              marginBottom: 0,
              lineHeight: 1.5,
            }}
          >
            {perfil.description}
          </p>
        )}
      </div>

      {/* Filtro de categorías */}
      <div
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          padding: "0 16px 12px",
          scrollbarWidth: "none",
        }}
      >
        <button
          onClick={() => setActiveCategoryId(null)}
          style={{
            padding: "6px 16px",
            borderRadius: 20,
            flexShrink: 0,
            background: !activeCategoryId ? "var(--accent)" : "var(--background-raised)",
            color: !activeCategoryId ? "var(--accent-text)" : "var(--foreground)",
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          Todos
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategoryId(cat.id)}
            style={{
              padding: "6px 16px",
              borderRadius: 20,
              flexShrink: 0,
              background:
                activeCategoryId === cat.id ? "var(--accent)" : "var(--background-raised)",
              color:
                activeCategoryId === cat.id ? "var(--accent-text)" : "var(--foreground)",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Cuerpo: productos por subcategoría */}
      <div style={{ maxWidth: 960, margin: "0 auto", paddingBottom: 120 }}>
        {categoriesToShow.map((parentCat) => {
          // Productos directamente en la categoría padre (sin subcategoría)
          const directProds = products[parentCat.id] ?? [];
          const hasChildren = parentCat.children.length > 0;

          return (
            <section key={parentCat.id} style={{ marginBottom: 40 }}>
              {/* Mostrar productos directos del padre (si existen y no hay hijos) */}
              {!hasChildren && directProds.length > 0 && (
                <div style={{ marginBottom: 32 }}>
                  <h2
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      padding: "0 16px",
                      marginBottom: 12,
                      marginTop: 0,
                      color: "var(--foreground)",
                    }}
                  >
                    {parentCat.name}
                  </h2>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                      gap: 12,
                      padding: "0 16px",
                    }}
                  >
                    {directProds.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        cartQty={getCartQty(product.id)}
                        onAdd={(variantId, variantName, unitPrice) =>
                          addToCart(product, variantId, variantName, unitPrice)
                        }
                        onRemove={() => removeFromCart(product.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Subcategorías */}
              {hasChildren && (
                <>
                  {/* Título de categoría padre como separador */}
                  <h2
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      padding: "0 16px",
                      marginBottom: 16,
                      marginTop: 8,
                      color: "var(--foreground)",
                    }}
                  >
                    {parentCat.name}
                  </h2>
                  {parentCat.children.map((childCat) => {
                    const prods = products[childCat.id] ?? [];
                    if (!prods.length) return null;
                    return (
                      <div key={childCat.id} style={{ marginBottom: 32 }}>
                        <h3
                          style={{
                            fontSize: 15,
                            fontWeight: 600,
                            padding: "0 16px",
                            marginBottom: 12,
                            marginTop: 0,
                            color: "var(--foreground)",
                          }}
                        >
                          {childCat.name}
                        </h3>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fill, minmax(160px, 1fr))",
                            gap: 12,
                            padding: "0 16px",
                          }}
                        >
                          {prods.map((product) => (
                            <ProductCard
                              key={product.id}
                              product={product}
                              cartQty={getCartQty(product.id)}
                              onAdd={(variantId, variantName, unitPrice) =>
                                addToCart(product, variantId, variantName, unitPrice)
                              }
                              onRemove={() => removeFromCart(product.id)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </section>
          );
        })}

        {categoriesToShow.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "60px 16px",
              color: "var(--foreground-muted)",
              fontSize: 14,
            }}
          >
            No hay productos disponibles por el momento.
          </div>
        )}
      </div>

      {/* Carrito flotante */}
      {totalItems > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            padding: "0 16px",
            pointerEvents: "none",
            zIndex: 40,
          }}
        >
          <button
            onClick={() => router.push(`/${tenantId}/carrito`)}
            style={{
              pointerEvents: "all",
              background: "var(--accent)",
              color: "var(--accent-text)",
              border: "none",
              borderRadius: 50,
              padding: "13px 24px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
              whiteSpace: "nowrap",
            }}
          >
            <ShoppingCart size={18} />
            Ver carrito · {totalItems} {totalItems === 1 ? "item" : "items"} · $
            {formatPrice(totalPrice)}
          </button>
        </div>
      )}

      {/* Footer */}
      <footer
        style={{
          background: "var(--background-raised)",
          borderTop: "1px solid var(--border-subtle)",
          padding: "40px 16px",
          marginTop: 60,
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 32,
          }}
        >
          {/* Columna 1: Logo + descripción */}
          <div>
            {perfil.logo_url && (
              <img
                src={perfil.logo_url}
                alt={perfil.name}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 8,
                  marginBottom: 12,
                  objectFit: "cover",
                  display: "block",
                }}
              />
            )}
            <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--foreground)" }}>
              {perfil.name}
            </div>
            {perfil.description && (
              <p
                style={{
                  fontSize: 13,
                  color: "var(--foreground-muted)",
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                {perfil.description}
              </p>
            )}
          </div>

          {/* Columna 2: Contacto + Redes */}
          {(perfil.email ||
            perfil.phone ||
            perfil.whatsapp ||
            perfil.instagram ||
            perfil.facebook ||
            perfil.tiktok ||
            perfil.youtube) && (
            <div>
              <div
                style={{
                  fontWeight: 600,
                  marginBottom: 12,
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                  color: "var(--foreground-muted)",
                }}
              >
                Contacto
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {perfil.email && (
                  <a
                    href={`mailto:${perfil.email}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      color: "var(--foreground)",
                      textDecoration: "none",
                    }}
                  >
                    <Mail size={14} style={{ color: "var(--foreground-muted)", flexShrink: 0 }} />
                    {perfil.email}
                  </a>
                )}
                {perfil.phone && (
                  <a
                    href={`tel:${perfil.phone}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      color: "var(--foreground)",
                      textDecoration: "none",
                    }}
                  >
                    <Phone size={14} style={{ color: "var(--foreground-muted)", flexShrink: 0 }} />
                    {perfil.phone}
                  </a>
                )}
                {perfil.whatsapp && (
                  <a
                    href={`https://wa.me/${perfil.whatsapp.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      color: "var(--foreground)",
                      textDecoration: "none",
                    }}
                  >
                    <MessageCircle
                      size={14}
                      style={{ color: "var(--foreground-muted)", flexShrink: 0 }}
                    />
                    {perfil.whatsapp}
                  </a>
                )}
                {/* Redes sociales */}
                <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
                  {perfil.instagram && (
                    <a
                      href={`https://instagram.com/${perfil.instagram.replace("@", "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                        color: "var(--foreground-muted)",
                        textDecoration: "none",
                      }}
                    >
                      <ExternalLink size={12} />
                      Instagram
                    </a>
                  )}
                  {perfil.facebook && (
                    <a
                      href={
                        perfil.facebook.startsWith("http")
                          ? perfil.facebook
                          : `https://facebook.com/${perfil.facebook}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                        color: "var(--foreground-muted)",
                        textDecoration: "none",
                      }}
                    >
                      <ExternalLink size={12} />
                      Facebook
                    </a>
                  )}
                  {perfil.tiktok && (
                    <a
                      href={`https://tiktok.com/@${perfil.tiktok.replace("@", "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                        color: "var(--foreground-muted)",
                        textDecoration: "none",
                      }}
                    >
                      <ExternalLink size={12} />
                      TikTok
                    </a>
                  )}
                  {perfil.youtube && (
                    <a
                      href={
                        perfil.youtube.startsWith("http")
                          ? perfil.youtube
                          : `https://youtube.com/@${perfil.youtube}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                        color: "var(--foreground-muted)",
                        textDecoration: "none",
                      }}
                    >
                      <ExternalLink size={12} />
                      YouTube
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Columna por sucursal */}
          {perfil.branches.map((branch) => (
            <div key={branch.name}>
              <div
                style={{
                  fontWeight: 600,
                  marginBottom: 12,
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                  color: "var(--foreground-muted)",
                }}
              >
                {branch.name}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {branch.address && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      fontSize: 13,
                      color: "var(--foreground)",
                    }}
                  >
                    <MapPin
                      size={14}
                      style={{
                        color: "var(--foreground-muted)",
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    />
                    <span>
                      {branch.address}
                      {branch.city ? `, ${branch.city}` : ""}
                    </span>
                  </div>
                )}
                {branch.phone && (
                  <a
                    href={`tel:${branch.phone}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      color: "var(--foreground)",
                      textDecoration: "none",
                    }}
                  >
                    <Phone
                      size={14}
                      style={{ color: "var(--foreground-muted)", flexShrink: 0 }}
                    />
                    {branch.phone}
                  </a>
                )}
                {branch.email && (
                  <a
                    href={`mailto:${branch.email}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      color: "var(--foreground)",
                      textDecoration: "none",
                    }}
                  >
                    <Mail
                      size={14}
                      style={{ color: "var(--foreground-muted)", flexShrink: 0 }}
                    />
                    {branch.email}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Copyright */}
        <div
          style={{
            textAlign: "center",
            marginTop: 40,
            paddingTop: 24,
            borderTop: "1px solid var(--border-subtle)",
            fontSize: 12,
            color: "var(--foreground-muted)",
          }}
        >
          Powered by{" "}
          <a
            href="https://nuba.nodoapp.com.ar"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent)", textDecoration: "none" }}
          >
            Nuba
          </a>
        </div>
      </footer>
    </div>
  );
}
