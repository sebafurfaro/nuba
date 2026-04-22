"use client";

import {
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogCloseTrigger,
  AlertDialogContainer,
  AlertDialogDialog,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogHeading,
  AlertDialogIcon,
  AlertDialogRoot,
  AlertDialogTrigger,
  AvatarFallback,
  AvatarImage,
  AvatarRoot,
  Button,
  Input,
  Skeleton,
  SwitchControl,
  SwitchRoot,
  SwitchThumb,
  Text,
  toast,
} from "@heroui/react";
import { Eye, FileCheck, FileUp, PackageOpen, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { PanelPageHeader } from "@/components/panel/PanelPageHeader";
import type { CategorySelectOption } from "@/lib/category-select-options";
import type { Role } from "@/lib/permissions";
import type { ImportResult } from "@/types/product";

export type ProductoListItem = {
  id: string;
  name: string;
  sku: string | null;
  image_url: string | null;
  price: number;
  discount_price: number | null;
  stock: number;
  track_stock: boolean;
  is_active: boolean;
  recipe_id: string | null;
  category_id: string | null;
  category_name: string | null;
  food_cost_percentage: number | null;
};

export type CategoriaOption = CategorySelectOption;

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

function foodCostBadgeClass(pct: number | null): string {
  if (pct == null) {
    return "bg-raised text-foreground-muted border border-border-subtle";
  }
  if (pct < 30) {
    return "bg-success-soft text-success border border-success/30";
  }
  if (pct <= 50) {
    return "bg-warning-soft text-warning border border-warning/30";
  }
  return "bg-danger-soft text-danger border border-danger/30";
}

function stockClass(stock: number): string {
  if (stock <= 0) {
    return "text-danger font-medium";
  }
  if (stock < 5) {
    return "text-warning font-medium";
  }
  return "text-foreground";
}

type ProductosClientProps = {
  tenantId: string;
  role: Role;
};

function ProductosQueryToasts({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const t = searchParams.get("toast");
    if (t === "product_not_found") {
      toast.danger("Producto no encontrado");
      router.replace(`/${tenantId}/panel/productos`);
    }
  }, [searchParams, router, tenantId]);

  return null;
}

export function ProductosClient({ tenantId, role }: ProductosClientProps) {
  const router = useRouter();
  const canMutate = role === "admin" || role === "supervisor";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductoListItem[]>([]);
  const [categories, setCategories] = useState<CategoriaOption[]>([]);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  function downloadTemplate() {
    const headers = ["nombre", "descripcion", "sku", "categoria", "precio", "precio_descuento", "stock", "activo"];
    const exampleRows = [
      ["Cappuccino", "Café con leche espumada", "CAP-001", "Bebidas Calientes", "1500", "", "50", "true"],
      ["Flat White", "Doble espresso con leche", "FLW-001", "Bebidas Calientes", "1800", "1500", "30", "true"],
      ["Brownie", "Brownie de chocolate", "BRW-001", "Postres", "900", "", "20", "true"],
    ];
    const csvContent = [headers.join(","), ...exampleRows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nuba-productos-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    if (!importFile) return;
    setImportLoading(true);
    setImportError(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const res = await fetch(`/api/${tenantId}/productos/importar`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const json = (await res.json()) as ImportResult & { error?: string };
      if (!res.ok) {
        setImportError(json.error ?? "Error al importar");
        return;
      }
      setImportResult(json);
      await load();
    } catch {
      setImportError("Error de conexión al importar");
    } finally {
      setImportLoading(false);
    }
  }

  function closeImportModal() {
    setShowImportModal(false);
    setImportFile(null);
    setImportResult(null);
    setImportError(null);
  }

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    "all",
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/${tenantId}/productos`, {
        credentials: "include",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? "No se pudieron cargar los productos");
      }
      const data = (await res.json()) as {
        products: ProductoListItem[];
        categories: CategoriaOption[];
      };
      setProducts(data.products ?? []);
      setCategories(data.categories ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setProducts([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (statusFilter === "active" && !p.is_active) {
        return false;
      }
      if (statusFilter === "inactive" && p.is_active) {
        return false;
      }
      if (categoryId && p.category_id !== categoryId) {
        return false;
      }
      if (!q) {
        return true;
      }
      const name = p.name.toLowerCase();
      const sku = (p.sku ?? "").toLowerCase();
      return name.includes(q) || sku.includes(q);
    });
  }, [products, search, categoryId, statusFilter]);

  const onToggleActive = async (p: ProductoListItem, next: boolean) => {
    if (!canMutate) {
      return;
    }
    const prev = p.is_active;
    setProducts((rows) =>
      rows.map((r) => (r.id === p.id ? { ...r, is_active: next } : r)),
    );
    try {
      const res = await fetch(`/api/${tenantId}/productos/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ is_active: next }),
      });
      if (!res.ok) {
        throw new Error();
      }
    } catch {
      setProducts((rows) =>
        rows.map((r) => (r.id === p.id ? { ...r, is_active: prev } : r)),
      );
    }
  };

  const onConfirmDelete = async (id: string) => {
    const res = await fetch(`/api/${tenantId}/productos/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok && res.status !== 204) {
      throw new Error("No se pudo eliminar");
    }
    await load();
  };

  const glassStyle = {
    background: "var(--nuba-glass-surface)",
    backdropFilter: "blur(var(--nuba-glass-blur-sm))",
  } as const;

  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={null}>
        <ProductosQueryToasts tenantId={tenantId} />
      </Suspense>
      <PanelPageHeader
        title="Productos"
        end={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {canMutate && (
              <>
                <button
                  onClick={downloadTemplate}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--accent)",
                    fontSize: 12,
                    cursor: "pointer",
                    textDecoration: "underline",
                    padding: "0 4px",
                  }}
                >
                  Descargar template
                </button>
                <button
                  onClick={() => setShowImportModal(true)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--border-default)",
                    background: "var(--background-raised)",
                    color: "var(--foreground-secondary)",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  <Upload size={15} />
                  Importar CSV
                </button>
              </>
            )}
            <Button
              variant="primary"
              className="bg-accent text-accent-text hover:bg-accent-hover"
              onPress={() => router.push(`/${tenantId}/panel/productos/crear`)}
            >
              <Plus className="size-4 shrink-0" />
              Nuevo producto
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface p-4 md:flex-row md:flex-wrap md:items-end">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 md:max-w-sm">
          <span className="text-sm text-foreground-secondary">Buscar</span>
          <Input
            placeholder="Nombre o SKU"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full"
            variant="secondary"
          />
        </label>
        <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-sm text-foreground-secondary">
          Categoría
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-10 rounded-lg border border-border-subtle bg-background px-3 text-foreground outline-none focus:border-accent"
          >
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[140px] flex-col gap-1 text-sm text-foreground-secondary">
          Estado
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "all" | "active" | "inactive")
            }
            className="h-10 rounded-lg border border-border-subtle bg-background px-3 text-foreground outline-none focus:border-accent"
          >
            <option value="all">Todos</option>
            <option value="active">Activo</option>
            <option value="inactive">Inactivo</option>
          </select>
        </label>
      </div>

      {error ? (
        <Text className="text-danger">{error}</Text>
      ) : null}

      {loading ? (
        <div
          className="overflow-hidden rounded-xl border border-border-subtle"
          style={glassStyle}
        >
          <div className="divide-y divide-border-subtle">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 px-4 py-3"
              >
                <Skeleton className="size-10 shrink-0 rounded-md" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-48 max-w-full" />
                  <Skeleton className="h-3 w-32 max-w-full" />
                </div>
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </div>
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-subtle bg-raised/40 py-16 text-center">
          <PackageOpen className="size-12 text-foreground-muted" />
          <Text className="max-w-sm text-foreground-secondary">
            Todavía no hay productos. Creá el primero.
          </Text>
          <Button
            variant="primary"
            className="bg-accent text-accent-text hover:bg-accent-hover"
            onPress={() =>
              router.push(`/${tenantId}/panel/productos/crear`)
            }
          >
            Nuevo producto
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border-subtle bg-surface/60 px-4 py-10 text-center text-foreground-secondary">
          No hay productos que coincidan con los filtros.
        </div>
      ) : (
        <div
          className="overflow-x-auto rounded-xl border border-border-subtle"
          style={glassStyle}
        >
          <table className="w-full min-w-[880px] table-fixed border-collapse text-left text-sm">
            <colgroup>
              <col className="w-[76px]" />
              <col />
              <col className="w-[11rem]" />
              <col className="w-[7rem]" />
              <col className="w-[7rem]" />
              <col className="w-[4.5rem]" />
              <col className="w-[6.5rem]" />
              <col className="w-[5.5rem]" />
              <col className="w-[7rem]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border-subtle bg-surface/80 text-foreground-secondary">
                <th className="px-4 py-3 font-medium">Imagen</th>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium">Categoría</th>
                <th className="px-4 py-3 font-medium">Precio</th>
                <th className="px-4 py-3 font-medium">Precio descuento</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 font-medium">Food cost %</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="whitespace-nowrap px-4 py-3 text-end font-medium">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filtered.map((p) => {
                const initial = p.name.trim().charAt(0).toUpperCase() || "?";
                const pctLabel =
                  p.food_cost_percentage == null
                    ? "—"
                    : `${p.food_cost_percentage.toFixed(0)}%`;
                return (
                  <tr
                    key={p.id}
                    className="bg-surface/40 transition-colors hover:bg-surface/70"
                  >
                    <td className="px-4 py-3 align-middle">
                      <AvatarRoot className="size-10 rounded-md">
                        {p.image_url ? (
                          <AvatarImage
                            src={p.image_url}
                            alt=""
                            className="rounded-md object-cover"
                          />
                        ) : null}
                        <AvatarFallback className="rounded-md bg-raised text-sm font-semibold text-foreground-secondary">
                          {initial}
                        </AvatarFallback>
                      </AvatarRoot>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="font-medium text-foreground">{p.name}</div>
                      {p.sku ? (
                        <div className="text-xs text-foreground-muted">{p.sku}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <span className="inline-flex items-center rounded-full border border-border-subtle bg-raised px-2 py-0.5 text-xs text-foreground-secondary">
                        {p.category_id
                          ? (categories.find((c) => c.id === p.category_id)?.name ?? p.category_name ?? "Sin categoría")
                          : "Sin categoría"}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle font-medium text-foreground">
                      {money.format(
                        p.discount_price != null ? p.discount_price : p.price,
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {p.discount_price != null ? (
                        <span className="text-foreground-muted line-through">
                          {money.format(p.price)}
                        </span>
                      ) : (
                        <span className="text-foreground-muted">—</span>
                      )}
                    </td>
                    <td
                      className={`px-4 py-3 align-middle tabular-nums ${stockClass(p.stock)}`}
                    >
                      {p.stock}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${foodCostBadgeClass(p.food_cost_percentage)}`}>
                        {pctLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <SwitchRoot
                        isSelected={p.is_active}
                        isDisabled={!canMutate}
                        onChange={(selected) => void onToggleActive(p, selected)}
                      >
                        <SwitchControl>
                          <SwitchThumb />
                        </SwitchControl>
                      </SwitchRoot>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex justify-end gap-1 whitespace-nowrap">
                        {canMutate ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            isIconOnly
                            aria-label="Editar producto"
                            onPress={() =>
                              router.push(
                                `/${tenantId}/panel/productos/${p.id}`,
                              )
                            }
                          >
                            <Pencil className="size-4" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            isIconOnly
                            aria-label="Ver detalle"
                            onPress={() =>
                              router.push(
                                `/${tenantId}/panel/productos/${p.id}`,
                              )
                            }
                          >
                            <Eye className="size-4" />
                          </Button>
                        )}
                        {canMutate ? (
                          <DeleteProductDialog
                            name={p.name}
                            onConfirm={() => onConfirmDelete(p.id)}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* ── Import CSV modal ── */}
      {showImportModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(4px)",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeImportModal(); }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 560,
              borderRadius: 16,
              border: "1px solid var(--border-default)",
              background: "var(--background-surface)",
              boxShadow: "0 24px 48px rgba(0,0,0,0.18)",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "20px 24px 16px",
                borderBottom: "1px solid var(--border-subtle)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 16 }}>Importar productos desde CSV</span>
              <button
                onClick={closeImportModal}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--foreground-muted)",
                  fontSize: 20,
                  lineHeight: 1,
                  padding: 4,
                }}
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: "20px 24px" }}>
              {importResult ? (
                /* ── Resultado ── */
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16 }}>
                    <div style={{ padding: 12, borderRadius: 8, background: "var(--success-soft)", textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--success)" }}>{importResult.created}</div>
                      <div style={{ fontSize: 12, color: "var(--success)" }}>Creados</div>
                    </div>
                    <div style={{ padding: 12, borderRadius: 8, background: "var(--accent-soft)", textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--accent)" }}>{importResult.updated}</div>
                      <div style={{ fontSize: 12, color: "var(--accent)" }}>Actualizados</div>
                    </div>
                    <div style={{
                      padding: 12, borderRadius: 8, textAlign: "center",
                      background: importResult.skipped > 0 ? "var(--warning-soft)" : "var(--background-raised)",
                    }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: importResult.skipped > 0 ? "var(--warning)" : "var(--foreground-muted)" }}>
                        {importResult.skipped}
                      </div>
                      <div style={{ fontSize: 12, color: importResult.skipped > 0 ? "var(--warning)" : "var(--foreground-muted)" }}>
                        Con errores
                      </div>
                    </div>
                  </div>

                  {importResult.errors.length > 0 && (
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Filas con errores:</p>
                      <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
                        <table style={{ width: "100%", fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: "var(--background-raised)", position: "sticky", top: 0 }}>
                              <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 500 }}>Fila</th>
                              <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 500 }}>Producto</th>
                              <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 500 }}>Error</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importResult.errors.map((err, idx) => (
                              <tr key={idx} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                                <td style={{ padding: "6px 12px", color: "var(--foreground-muted)" }}>#{err.row}</td>
                                <td style={{ padding: "6px 12px" }}>{err.nombre || err.sku || "—"}</td>
                                <td style={{ padding: "6px 12px", color: "var(--danger)" }}>{err.error}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                    <Button variant="primary" className="bg-accent text-accent-text hover:bg-accent-hover" onPress={closeImportModal}>
                      Cerrar
                    </Button>
                  </div>
                </>
              ) : (
                /* ── Selección de archivo ── */
                <>
                  {/* Dropzone */}
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const f = e.dataTransfer.files[0];
                      if (f?.name.toLowerCase().endsWith(".csv")) setImportFile(f);
                    }}
                    onClick={() => document.getElementById("csv-input")?.click()}
                    style={{
                      border: "2px dashed var(--border-default)",
                      borderRadius: 12,
                      padding: 32,
                      textAlign: "center",
                      cursor: "pointer",
                      background: importFile ? "var(--success-soft)" : "var(--background-raised)",
                      transition: "all .15s",
                      marginBottom: 12,
                    }}
                  >
                    <input
                      id="csv-input"
                      type="file"
                      accept=".csv"
                      style={{ display: "none" }}
                      onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                    />
                    {importFile ? (
                      <>
                        <FileCheck size={32} style={{ color: "var(--success)", margin: "0 auto 8px" }} />
                        <p style={{ fontWeight: 500 }}>{importFile.name}</p>
                        <p style={{ fontSize: 12, color: "var(--foreground-muted)" }}>
                          {(importFile.size / 1024).toFixed(1)} KB
                        </p>
                      </>
                    ) : (
                      <>
                        <FileUp size={32} style={{ color: "var(--foreground-muted)", margin: "0 auto 8px" }} />
                        <p style={{ fontWeight: 500 }}>Arrastrá o hacé clic para subir tu CSV</p>
                        <p style={{ fontSize: 12, color: "var(--foreground-muted)", marginTop: 4 }}>
                          Máximo 500 productos · 5 MB
                        </p>
                      </>
                    )}
                  </div>

                  {/* Info formato */}
                  <div style={{
                    padding: 12,
                    background: "var(--background-raised)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--foreground-muted)",
                  }}>
                    <p style={{ fontWeight: 500, marginBottom: 4 }}>Columnas requeridas:</p>
                    <code style={{ fontFamily: "monospace" }}>
                      nombre, descripcion, sku, categoria, precio, precio_descuento, stock, activo
                    </code>
                    <p style={{ marginTop: 8 }}>
                      Si un SKU ya existe → actualiza el producto. Si no existe → lo crea.
                      Las categorías nuevas se crean automáticamente.
                    </p>
                  </div>

                  {/* Error general */}
                  {importError && (
                    <p style={{ marginTop: 12, fontSize: 13, color: "var(--danger)" }}>{importError}</p>
                  )}

                  {/* Footer */}
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
                    <Button variant="ghost" onPress={closeImportModal}>Cancelar</Button>
                    <Button
                      variant="primary"
                      className="bg-accent text-accent-text hover:bg-accent-hover"
                      isDisabled={!importFile || importLoading}
                      onPress={() => void handleImport()}
                    >
                      {importLoading ? "Importando..." : importFile ? "Importar" : "Importar CSV"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DeleteProductDialog({
  name,
  onConfirm,
}: {
  name: string;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <AlertDialogRoot>
      <AlertDialogTrigger className="inline-flex">
        <Button
          size="sm"
          variant="ghost"
          isIconOnly
          aria-label="Eliminar producto"
          className="text-danger"
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogBackdrop>
        <AlertDialogContainer>
          <AlertDialogDialog>
            <AlertDialogIcon status="danger" />
            <AlertDialogHeader>
              <AlertDialogHeading>Eliminar producto</AlertDialogHeading>
            </AlertDialogHeader>
            <AlertDialogBody>
              ¿Seguro que querés eliminar{" "}
              <span className="font-semibold text-foreground">{name}</span>? Esta
              acción desactiva el producto.
            </AlertDialogBody>
            <AlertDialogFooter className="flex gap-2 justify-end">
              <AlertDialogCloseTrigger>Cancelar</AlertDialogCloseTrigger>
              <Button
                variant="danger"
                isDisabled={busy}
                onPress={async () => {
                  setBusy(true);
                  try {
                    await onConfirm();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Eliminar
              </Button>
            </AlertDialogFooter>
          </AlertDialogDialog>
        </AlertDialogContainer>
      </AlertDialogBackdrop>
    </AlertDialogRoot>
  );
}
