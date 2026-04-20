"use client";

import {
  BadgeLabel,
  BadgeRoot,
  Button,
  Input,
  Label,
  Modal,
  Text,
  toast,
  useOverlayState,
} from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ChevronRight,
  Leaf,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Pencil,
  Phone,
  Plus,
  Power,
  PowerOff,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DialogSuccess, DialogWarning } from "@/components/ui";
import type {
  Supplier,
  SupplierIngredient,
  SupplierProduct,
  SupplierWithProducts,
} from "@/types/supplier";

// ─── Types ─────────────────────────────────────────────────────────────────────

type ProductOption = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
};

// ─── Schemas ───────────────────────────────────────────────────────────────────

const supplierFormSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(255),
  contact_name: z.string().max(255),
  email: z.string().max(255).superRefine((s, ctx) => {
    if (s !== "" && !z.string().email().safeParse(s).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Email inválido",
      });
    }
  }),
  phone: z.string().max(50),
  whatsapp: z.string().max(50),
  address: z.string(),
  notes: z.string().max(1000),
});

type SupplierFormValues = z.input<typeof supplierFormSchema>;

const productCostSchema = z.object({
  product_id: z.string().min(1, "Seleccioná un producto"),
  cost_price: z.number({ invalid_type_error: "Ingresá un costo válido" }).positive("El costo debe ser mayor a 0"),
  notes: z.string().max(500),
});

type ProductCostFormValues = z.input<typeof productCostSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

function supplierInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

function waDigits(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/\D/g, "");
}

function supplierToForm(s: Supplier): SupplierFormValues {
  return {
    name: s.name,
    contact_name: s.contact_name ?? "",
    email: s.email ?? "",
    phone: s.phone ?? "",
    whatsapp: s.whatsapp ?? "",
    address: s.address ?? "",
    notes: s.notes ?? "",
  };
}

function marginColor(margin: number): string {
  if (margin >= 50) return "var(--nuba-success)";
  if (margin >= 20) return "var(--nuba-warning)";
  return "var(--nuba-danger)";
}

function marginBg(margin: number): string {
  if (margin >= 50) return "var(--nuba-success-soft)";
  if (margin >= 20) return "var(--nuba-warning-soft)";
  return "var(--nuba-danger-soft)";
}

// ─── ContactRow ───────────────────────────────────────────────────────────────

function ContactRow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 shrink-0" style={{ color: "var(--nuba-fg-muted)" }}>
        {icon}
      </span>
      <span style={{ color: "var(--nuba-fg-secondary)" }}>{children}</span>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ProveedorDetallePage() {
  const params = useParams<{ tenantId: string; id: string }>();
  const { tenantId, id } = params;
  const router = useRouter();

  const [supplier, setSupplier] = useState<SupplierWithProducts | null>(null);
  const [loading, setLoading] = useState(true);

  // All tenant products for "add product" modal
  const [allProducts, setAllProducts] = useState<ProductOption[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);

  // Notes autosave
  const [notesValue, setNotesValue] = useState("");
  const notesSavingRef = useRef(false);

  // Supplier edit modal
  const editModalState = useOverlayState();
  const supplierForm = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
  });

  // Product upsert modal
  const productModalState = useOverlayState();
  const [editingProduct, setEditingProduct] = useState<SupplierProduct | null>(null);
  const productForm = useForm<ProductCostFormValues>({
    resolver: zodResolver(productCostSchema),
    defaultValues: { product_id: "", cost_price: 0, notes: "" },
  });

  // Feedback
  const [successOpen, setSuccessOpen] = useState(false);
  const [successCopy, setSuccessCopy] = useState({ title: "", description: "" });
  const [dupOpen, setDupOpen] = useState(false);
  const [dupMsg, setDupMsg] = useState("");

  // Deactivate / reactivate
  const deactivateDialog = useOverlayState();
  const reactivateDialog = useOverlayState();

  // Delete product confirm
  const [deletingProduct, setDeletingProduct] = useState<SupplierProduct | null>(null);
  const deleteProductDialog = useOverlayState();

  // ─── Load supplier ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/${tenantId}/proveedores/${id}`, {
        cache: "no-store",
        credentials: "include",
      });
      if (res.status === 404) {
        router.replace(`/${tenantId}/panel/proveedores`);
        return;
      }
      if (!res.ok) {
        toast.danger("No se pudo cargar el proveedor");
        return;
      }
      const data = (await res.json()) as SupplierWithProducts;
      setSupplier(data);
      setNotesValue(data.notes ?? "");
    } finally {
      setLoading(false);
    }
  }, [tenantId, id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  // ─── Load products for modal ─────────────────────────────────────────────────

  useEffect(() => {
    if (!productModalState.isOpen) return;
    fetch(`/api/${tenantId}/productos`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ProductOption[]) => setAllProducts(Array.isArray(data) ? data : []))
      .catch(() => setAllProducts([]));
  }, [productModalState.isOpen, tenantId]);

  // ─── Notes autosave ───────────────────────────────────────────────────────────

  async function saveNotes() {
    if (!supplier || notesSavingRef.current) return;
    if (notesValue === (supplier.notes ?? "")) return;
    notesSavingRef.current = true;
    try {
      await fetch(`/api/${tenantId}/proveedores/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notes: notesValue || null }),
      });
      setSupplier((prev) =>
        prev ? { ...prev, notes: notesValue || null } : prev,
      );
    } finally {
      notesSavingRef.current = false;
    }
  }

  // ─── Edit supplier submit ─────────────────────────────────────────────────────

  const submitEditSupplier = supplierForm.handleSubmit(async (values) => {
    const body = {
      name: values.name.trim(),
      contact_name: values.contact_name.trim() || null,
      email: values.email.trim() || null,
      phone: values.phone.trim() || null,
      whatsapp: values.whatsapp.trim() || null,
      address: values.address.trim() || null,
      notes: values.notes.trim() || null,
    };
    const res = await fetch(`/api/${tenantId}/proveedores/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    if (res.status === 409) {
      setDupMsg(j?.error ?? "Ya existe un proveedor con ese nombre");
      setDupOpen(true);
      return;
    }
    if (!res.ok) {
      toast.danger(j?.error ?? "Error al guardar el proveedor");
      return;
    }
    editModalState.close();
    setSuccessCopy({
      title: "Proveedor actualizado",
      description: "Los cambios se guardaron correctamente.",
    });
    setSuccessOpen(true);
    await load();
  });

  // ─── Deactivate / reactivate ──────────────────────────────────────────────────

  async function confirmDeactivate() {
    deactivateDialog.close();
    const res = await fetch(`/api/${tenantId}/proveedores/${id}/desactivar`, {
      method: "PATCH",
      credentials: "include",
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.danger(j?.error ?? "Error al desactivar el proveedor");
      return;
    }
    setSuccessCopy({
      title: "Proveedor desactivado",
      description: "Podés reactivarlo en cualquier momento.",
    });
    setSuccessOpen(true);
    await load();
  }

  async function confirmReactivate() {
    reactivateDialog.close();
    const res = await fetch(`/api/${tenantId}/proveedores/${id}/reactivar`, {
      method: "PATCH",
      credentials: "include",
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.danger(j?.error ?? "Error al reactivar el proveedor");
      return;
    }
    setSuccessCopy({
      title: "Proveedor reactivado",
      description: "El proveedor volvió a estar activo.",
    });
    setSuccessOpen(true);
    await load();
  }

  // ─── Product upsert submit ────────────────────────────────────────────────────

  const submitProduct = productForm.handleSubmit(async (values) => {
    const res = await fetch(`/api/${tenantId}/proveedores/${id}/productos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        product_id: values.product_id,
        cost_price: Number(values.cost_price),
        notes: values.notes.trim() || null,
      }),
    });
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      toast.danger(j?.error ?? "Error al guardar el producto");
      return;
    }
    productModalState.close();
    setSuccessCopy({
      title: editingProduct ? "Costo actualizado" : "Producto vinculado",
      description: editingProduct
        ? "El precio de costo se actualizó correctamente."
        : "El producto fue vinculado a este proveedor.",
    });
    setSuccessOpen(true);
    await load();
  });

  // ─── Delete product ──────────────────────────────────────────────────────────

  async function confirmDeleteProduct() {
    if (!deletingProduct) return;
    deleteProductDialog.close();
    const res = await fetch(
      `/api/${tenantId}/proveedores/${id}/productos/${deletingProduct.product_id}`,
      { method: "DELETE", credentials: "include" },
    );
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.danger(j?.error ?? "Error al eliminar el producto");
      return;
    }
    setDeletingProduct(null);
    await load();
  }

  // ─── Available products for modal (filtered) ─────────────────────────────────

  const linkedProductIds = new Set(supplier?.products.map((p) => p.product_id) ?? []);

  const availableProducts = allProducts.filter((p) => {
    const alreadyLinked = !editingProduct && linkedProductIds.has(p.id);
    if (alreadyLinked) return false;
    if (!productSearch) return true;
    return p.name.toLowerCase().includes(productSearch.toLowerCase());
  });

  // ─── Loading skeleton ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-6 w-40 animate-pulse rounded bg-raised" />
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="h-64 w-full animate-pulse rounded-xl bg-raised lg:w-1/3" />
          <div className="h-64 flex-1 animate-pulse rounded-xl bg-raised" />
        </div>
      </div>
    );
  }

  if (!supplier) return null;

  const s = supplier;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* Feedback dialogs */}
      <DialogSuccess
        isOpen={successOpen}
        onClose={() => setSuccessOpen(false)}
        title={successCopy.title}
        description={successCopy.description}
      />
      <DialogWarning
        isOpen={dupOpen}
        onClose={() => setDupOpen(false)}
        title="Nombre duplicado"
        description={dupMsg}
        confirmLabel="Entendido"
        cancelLabel="Cerrar"
        onConfirm={() => setDupOpen(false)}
      />
      <DialogWarning
        isOpen={deactivateDialog.isOpen}
        onClose={() => deactivateDialog.close()}
        title="¿Desactivar proveedor?"
        description={`"${s.name}" dejará de aparecer en los listados activos.`}
        confirmLabel="Sí, desactivar"
        cancelLabel="Cancelar"
        onConfirm={() => void confirmDeactivate()}
      />
      <DialogWarning
        isOpen={reactivateDialog.isOpen}
        onClose={() => reactivateDialog.close()}
        title="¿Reactivar proveedor?"
        description={`"${s.name}" volverá a aparecer en los listados activos.`}
        confirmLabel="Sí, reactivar"
        cancelLabel="Cancelar"
        onConfirm={() => void confirmReactivate()}
      />
      <DialogWarning
        isOpen={deleteProductDialog.isOpen}
        onClose={() => {
          deleteProductDialog.close();
          setDeletingProduct(null);
        }}
        title="¿Eliminar producto del proveedor?"
        description={`¿Querés desvincular "${deletingProduct?.product_name}" de este proveedor? Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={() => void confirmDeleteProduct()}
      />

      {/* Back link */}
      <div className="flex items-center gap-2">
        <Link
          href={`/${tenantId}/panel/proveedores`}
          className="flex items-center gap-1.5 text-sm transition-colors hover:text-accent"
          style={{ color: "var(--nuba-fg-muted)" }}
        >
          <ArrowLeft size={14} />
          Proveedores
        </Link>
        <ChevronRight size={12} style={{ color: "var(--nuba-fg-muted)" }} />
        <span className="text-sm text-foreground">{s.name}</span>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* ── Left column: supplier info ─────────────────────────────────── */}
        <div className="w-full lg:w-1/3">
          <div
            className="flex flex-col gap-4 rounded-xl border p-5"
            style={{
              background: "var(--nuba-glass-surface)",
              backdropFilter: "blur(var(--nuba-glass-blur-sm))",
              borderColor: "var(--nuba-border-subtle)",
            }}
          >
            {/* Avatar + name */}
            <div className="flex items-center gap-3">
              <div
                className="flex size-14 shrink-0 items-center justify-center rounded-full text-xl font-bold"
                style={{
                  background: "var(--nuba-accent-soft)",
                  color: "var(--nuba-accent)",
                }}
              >
                {supplierInitials(s.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-foreground">
                  {s.name}
                </p>
                {s.contact_name && (
                  <p
                    className="truncate text-sm"
                    style={{ color: "var(--nuba-fg-muted)" }}
                  >
                    {s.contact_name}
                  </p>
                )}
                <span
                  className="mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={
                    s.is_active
                      ? {
                          background: "var(--nuba-success-soft)",
                          color: "var(--nuba-success)",
                        }
                      : {
                          background: "var(--nuba-raised)",
                          color: "var(--nuba-fg-muted)",
                        }
                  }
                >
                  {s.is_active ? "Activo" : "Inactivo"}
                </span>
              </div>
            </div>

            {/* Counts */}
            <div className="flex gap-3">
              <span
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
                style={{
                  background: "var(--nuba-raised)",
                  color: "var(--nuba-fg-secondary)",
                }}
              >
                <Package size={11} />
                {s.products.length} productos
              </span>
              <span
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
                style={{
                  background: "var(--nuba-raised)",
                  color: "var(--nuba-fg-secondary)",
                }}
              >
                <Leaf size={11} />
                {s.ingredients.length} ingredientes
              </span>
            </div>

            {/* Contact */}
            {(s.email || s.phone || s.whatsapp || s.address) && (
              <div
                className="flex flex-col gap-2 border-t pt-3"
                style={{ borderColor: "var(--nuba-border-subtle)" }}
              >
                {s.email && (
                  <ContactRow icon={<Mail size={14} />}>
                    <a
                      href={`mailto:${s.email}`}
                      className="hover:text-accent hover:underline"
                    >
                      {s.email}
                    </a>
                  </ContactRow>
                )}
                {s.phone && (
                  <ContactRow icon={<Phone size={14} />}>
                    <a
                      href={`tel:${s.phone}`}
                      className="hover:text-accent hover:underline"
                    >
                      {s.phone}
                    </a>
                  </ContactRow>
                )}
                {s.whatsapp && (
                  <ContactRow icon={<MessageCircle size={14} />}>
                    <a
                      href={`https://wa.me/${waDigits(s.whatsapp)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-accent hover:underline"
                    >
                      {s.whatsapp}
                    </a>
                  </ContactRow>
                )}
                {s.address && (
                  <ContactRow icon={<MapPin size={14} />}>
                    {s.address}
                  </ContactRow>
                )}
              </div>
            )}

            {/* Notes (autosave on blur) */}
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="supplier-notes"
                className="text-xs text-foreground-secondary"
              >
                Notas internas
              </Label>
              <textarea
                id="supplier-notes"
                rows={4}
                maxLength={1000}
                className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
                style={{
                  background: "var(--nuba-raised)",
                  borderColor: "var(--nuba-border-default)",
                  color: "var(--nuba-fg)",
                }}
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                onBlur={() => void saveNotes()}
                placeholder="Observaciones sobre el proveedor..."
              />
            </div>

            {/* Actions */}
            <div
              className="flex flex-wrap gap-2 border-t pt-3"
              style={{ borderColor: "var(--nuba-border-subtle)" }}
            >
              <Button
                variant="secondary"
                size="sm"
                onPress={() => {
                  supplierForm.reset(supplierToForm(s));
                  editModalState.open();
                }}
              >
                <Pencil size={14} />
                Editar
              </Button>
              {s.is_active ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() => deactivateDialog.open()}
                >
                  <PowerOff size={14} />
                  Desactivar
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() => reactivateDialog.open()}
                >
                  <Power size={14} />
                  Reactivar
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* ── Right column: products + ingredients ───────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Products card */}
          <div
            className="rounded-xl border"
            style={{
              background: "var(--nuba-glass-surface)",
              backdropFilter: "blur(var(--nuba-glass-blur-sm))",
              borderColor: "var(--nuba-border-subtle)",
            }}
          >
            <div
              className="flex items-center justify-between gap-3 border-b px-5 py-3"
              style={{ borderColor: "var(--nuba-border-subtle)" }}
            >
              <div className="flex items-center gap-2">
                <Text className="text-sm font-semibold text-foreground">
                  Productos que provee
                </Text>
                <BadgeRoot variant="soft">
                  <BadgeLabel>{s.products.length}</BadgeLabel>
                </BadgeRoot>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="h-7 text-xs"
                onPress={() => {
                  setEditingProduct(null);
                  productForm.reset({ product_id: "", cost_price: 0, notes: "" });
                  setProductSearch("");
                  productModalState.open();
                }}
              >
                <Plus size={13} />
                Agregar producto
              </Button>
            </div>

            {s.products.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Package
                  size={32}
                  strokeWidth={1.25}
                  style={{ color: "var(--nuba-fg-muted)" }}
                />
                <Text className="text-sm text-foreground-muted">
                  No hay productos vinculados
                </Text>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr
                      style={{ borderBottom: "1px solid var(--nuba-border-subtle)" }}
                    >
                      <th
                        className="py-3 pl-5 pr-4 text-left font-medium"
                        style={{ color: "var(--nuba-fg-muted)" }}
                      >
                        Producto
                      </th>
                      <th
                        className="px-4 py-3 text-right font-medium"
                        style={{ color: "var(--nuba-fg-muted)" }}
                      >
                        Precio venta
                      </th>
                      <th
                        className="px-4 py-3 text-right font-medium"
                        style={{ color: "var(--nuba-fg-muted)" }}
                      >
                        Costo
                      </th>
                      <th
                        className="px-4 py-3 text-right font-medium"
                        style={{ color: "var(--nuba-fg-muted)" }}
                      >
                        Margen
                      </th>
                      <th
                        className="py-3 pl-4 pr-5 text-right font-medium"
                        style={{ color: "var(--nuba-fg-muted)" }}
                      >
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.products.map((p: SupplierProduct) => (
                      <tr
                        key={p.id}
                        className="transition-colors hover:bg-raised"
                        style={{ borderBottom: "1px solid var(--nuba-border-subtle)" }}
                      >
                        <td className="py-3 pl-5 pr-4">
                          <div className="flex items-center gap-2">
                            {p.product_image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={p.product_image_url}
                                alt=""
                                className="size-8 rounded object-cover"
                              />
                            ) : (
                              <div
                                className="flex size-8 items-center justify-center rounded"
                                style={{ background: "var(--nuba-raised)" }}
                              >
                                <Package
                                  size={14}
                                  style={{ color: "var(--nuba-fg-muted)" }}
                                />
                              </div>
                            )}
                            <span className="font-medium text-foreground">
                              {p.product_name}
                            </span>
                          </div>
                        </td>
                        <td
                          className="px-4 py-3 text-right text-foreground-secondary"
                        >
                          {money.format(p.product_price)}
                        </td>
                        <td
                          className="px-4 py-3 text-right font-medium text-foreground"
                        >
                          {money.format(p.cost_price)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className="rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{
                              background: marginBg(p.margin),
                              color: marginColor(p.margin),
                            }}
                          >
                            {p.margin.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 pl-4 pr-5">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              title="Editar costo"
                              className="rounded-lg p-1.5 transition-colors hover:bg-raised"
                              style={{ color: "var(--nuba-fg-muted)" }}
                              onClick={() => {
                                setEditingProduct(p);
                                productForm.reset({
                                  product_id: p.product_id,
                                  cost_price: p.cost_price,
                                  notes: p.notes ?? "",
                                });
                                setProductSearch(p.product_name);
                                productModalState.open();
                              }}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              title="Eliminar"
                              className="rounded-lg p-1.5 transition-colors hover:bg-danger-soft"
                              style={{ color: "var(--nuba-danger)" }}
                              onClick={() => {
                                setDeletingProduct(p);
                                deleteProductDialog.open();
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Ingredients card */}
          <div
            className="rounded-xl border"
            style={{
              background: "var(--nuba-glass-surface)",
              backdropFilter: "blur(var(--nuba-glass-blur-sm))",
              borderColor: "var(--nuba-border-subtle)",
            }}
          >
            <div
              className="flex items-center gap-2 border-b px-5 py-3"
              style={{ borderColor: "var(--nuba-border-subtle)" }}
            >
              <Text className="text-sm font-semibold text-foreground">
                Ingredientes vinculados
              </Text>
              <BadgeRoot variant="soft">
                <BadgeLabel>{s.ingredients.length}</BadgeLabel>
              </BadgeRoot>
            </div>

            {s.ingredients.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Leaf
                  size={32}
                  strokeWidth={1.25}
                  style={{ color: "var(--nuba-fg-muted)" }}
                />
                <Text className="text-sm text-foreground-muted">
                  No hay ingredientes vinculados
                </Text>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border-subtle">
                {s.ingredients.map((ing: SupplierIngredient) => (
                  <div
                    key={ing.id}
                    className="flex items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {ing.name}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--nuba-fg-muted)" }}
                      >
                        Unidad: {ing.unit}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 text-right">
                      <div>
                        <p
                          className="text-xs"
                          style={{ color: "var(--nuba-fg-muted)" }}
                        >
                          Costo/u
                        </p>
                        <p className="text-sm font-medium text-foreground">
                          {money.format(ing.unit_cost)}
                        </p>
                      </div>
                      <div>
                        <p
                          className="text-xs"
                          style={{ color: "var(--nuba-fg-muted)" }}
                        >
                          Stock
                        </p>
                        <p
                          className="text-sm font-medium"
                          style={{
                            color:
                              ing.stock_quantity === 0
                                ? "var(--nuba-danger)"
                                : "var(--nuba-fg)",
                          }}
                        >
                          {ing.stock_quantity} {ing.unit}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div
              className="border-t px-5 py-2.5"
              style={{ borderColor: "var(--nuba-border-subtle)" }}
            >
              <p
                className="flex items-center gap-1.5 text-xs"
                style={{ color: "var(--nuba-fg-muted)" }}
              >
                <Leaf size={11} />
                Para gestionar ingredientes, ir a{" "}
                <Link
                  href={`/${tenantId}/panel/productos`}
                  className="hover:underline"
                  style={{ color: "var(--nuba-accent)" }}
                >
                  Recetas
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Edit supplier modal ────────────────────────────────────────────── */}
      <Modal.Root state={editModalState}>
        <Modal.Backdrop
          className="z-200 flex items-center justify-center p-3 sm:p-6"
          variant="blur"
        >
          <Modal.Container placement="center" size="lg">
            <Modal.Dialog className="flex max-h-[min(90dvh,780px)] w-[min(100vw-1.5rem,30rem)] max-w-none flex-col overflow-hidden border border-border-subtle bg-surface/95 shadow-lg outline-none backdrop-blur-sm sm:w-[min(100vw-3rem,30rem)]">
              <Modal.Header className="shrink-0 border-b border-border-subtle px-5 pb-3 pt-5 sm:px-6">
                <div className="flex items-start justify-between gap-3">
                  <Modal.Heading className="min-w-0 flex-1 pr-2">
                    Editar proveedor
                  </Modal.Heading>
                  <Modal.CloseTrigger aria-label="Cerrar" className="shrink-0" />
                </div>
              </Modal.Header>
              <Modal.Body className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 sm:px-6 sm:py-5">
                <form
                  id="supplier-edit-form"
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitEditSupplier();
                  }}
                >
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="se-name" className="flex items-baseline gap-1">
                      Nombre
                      <span className="text-xs font-normal text-danger">(obligatorio)</span>
                    </Label>
                    <Input id="se-name" variant="secondary" className="w-full" {...supplierForm.register("name")} />
                    {supplierForm.formState.errors.name?.message && (
                      <Text className="text-xs text-danger">{supplierForm.formState.errors.name.message}</Text>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="se-contact" className="text-foreground-secondary">
                      Nombre de contacto <span className="text-xs font-normal">(opcional)</span>
                    </Label>
                    <Input id="se-contact" variant="secondary" className="w-full" {...supplierForm.register("contact_name")} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="se-email" className="text-foreground-secondary">
                      Email <span className="text-xs font-normal">(opcional)</span>
                    </Label>
                    <Input id="se-email" type="email" variant="secondary" className="w-full" {...supplierForm.register("email")} />
                    {supplierForm.formState.errors.email?.message && (
                      <Text className="text-xs text-danger">{supplierForm.formState.errors.email.message}</Text>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="se-phone" className="text-foreground-secondary">Teléfono</Label>
                      <Input id="se-phone" variant="secondary" className="w-full" {...supplierForm.register("phone")} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="se-wa" className="text-foreground-secondary">WhatsApp</Label>
                      <Input id="se-wa" variant="secondary" className="w-full" {...supplierForm.register("whatsapp")} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="se-address" className="text-foreground-secondary">
                      Dirección <span className="text-xs font-normal">(opcional)</span>
                    </Label>
                    <textarea
                      id="se-address" rows={2}
                      className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none"
                      style={{ background: "var(--nuba-raised)", borderColor: "var(--nuba-border-default)", color: "var(--nuba-fg)" }}
                      {...supplierForm.register("address")}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="se-notes" className="text-foreground-secondary">
                      Notas <span className="text-xs font-normal">(opcional)</span>
                    </Label>
                    <textarea
                      id="se-notes" rows={3} maxLength={1000}
                      className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none"
                      style={{ background: "var(--nuba-raised)", borderColor: "var(--nuba-border-default)", color: "var(--nuba-fg)" }}
                      {...supplierForm.register("notes")}
                    />
                  </div>
                </form>
              </Modal.Body>
              <Modal.Footer className="flex shrink-0 justify-end gap-2 border-t border-border-subtle px-5 py-4 sm:px-6">
                <Button variant="secondary" onPress={() => editModalState.close()} isDisabled={supplierForm.formState.isSubmitting}>
                  Cancelar
                </Button>
                <Button
                  type="submit" form="supplier-edit-form" variant="primary"
                  className="bg-accent text-accent-text hover:bg-accent-hover"
                  isDisabled={supplierForm.formState.isSubmitting}
                >
                  Guardar cambios
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>

      {/* ── Add/edit product modal ────────────────────────────────────────── */}
      <Modal.Root state={productModalState}>
        <Modal.Backdrop
          className="z-200 flex items-center justify-center p-3 sm:p-6"
          variant="blur"
        >
          <Modal.Container placement="center" size="lg">
            <Modal.Dialog className="flex max-h-[min(90dvh,600px)] w-[min(100vw-1.5rem,28rem)] max-w-none flex-col overflow-hidden border border-border-subtle bg-surface/95 shadow-lg outline-none backdrop-blur-sm">
              <Modal.Header className="shrink-0 border-b border-border-subtle px-5 pb-3 pt-5">
                <div className="flex items-start justify-between gap-3">
                  <Modal.Heading className="min-w-0 flex-1 pr-2">
                    {editingProduct ? "Editar costo del producto" : "Agregar producto al proveedor"}
                  </Modal.Heading>
                  <Modal.CloseTrigger aria-label="Cerrar" className="shrink-0" />
                </div>
              </Modal.Header>
              <Modal.Body className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <form
                  id="product-cost-form"
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitProduct();
                  }}
                >
                  {/* Product selector */}
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="pc-product" className="flex items-baseline gap-1">
                      Producto
                      <span className="text-xs font-normal text-danger">(obligatorio)</span>
                    </Label>
                    {editingProduct ? (
                      <div
                        className="rounded-lg border px-3 py-2 text-sm font-medium text-foreground"
                        style={{ background: "var(--nuba-raised)", borderColor: "var(--nuba-border-default)" }}
                      >
                        {editingProduct.product_name}
                      </div>
                    ) : (
                      <div className="relative">
                        <Search
                          size={13}
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted"
                        />
                        <Input
                          id="pc-product"
                          variant="secondary"
                          className="w-full pl-8"
                          placeholder="Buscar producto..."
                          value={productSearch}
                          onChange={(e) => {
                            setProductSearch(e.target.value);
                            setProductDropdownOpen(true);
                          }}
                          onFocus={() => setProductDropdownOpen(true)}
                          onBlur={() =>
                            setTimeout(() => setProductDropdownOpen(false), 150)
                          }
                        />
                        {productDropdownOpen && availableProducts.length > 0 && (
                          <div
                            className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border shadow-lg"
                            style={{
                              background: "var(--nuba-surface)",
                              borderColor: "var(--nuba-border-default)",
                            }}
                          >
                            {availableProducts.slice(0, 10).map((p) => (
                              <button
                                type="button"
                                key={p.id}
                                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-sm transition-colors hover:bg-raised"
                                onMouseDown={() => {
                                  productForm.setValue("product_id", p.id, { shouldValidate: true });
                                  setProductSearch(p.name);
                                  setProductDropdownOpen(false);
                                }}
                              >
                                <span className="truncate text-foreground">{p.name}</span>
                                <span style={{ color: "var(--nuba-fg-muted)" }} className="shrink-0 text-xs">
                                  {money.format(p.price)}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {productForm.formState.errors.product_id?.message && (
                      <Text className="text-xs text-danger">
                        {productForm.formState.errors.product_id.message}
                      </Text>
                    )}
                  </div>

                  {/* Cost price */}
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="pc-cost" className="flex items-baseline gap-1">
                      Costo
                      <span className="text-xs font-normal text-danger">(obligatorio)</span>
                    </Label>
                    <div className="relative">
                      <span
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm"
                        style={{ color: "var(--nuba-fg-muted)" }}
                      >
                        $
                      </span>
                      <input
                        id="pc-cost"
                        type="number"
                        min={0}
                        step={0.01}
                        className="w-full rounded-lg border py-2 pl-7 pr-3 text-sm outline-none"
                        style={{
                          background: "var(--nuba-raised)",
                          borderColor: "var(--nuba-border-default)",
                          color: "var(--nuba-fg)",
                        }}
                        {...productForm.register("cost_price", { valueAsNumber: true })}
                      />
                    </div>
                    {productForm.formState.errors.cost_price?.message && (
                      <Text className="text-xs text-danger">
                        {productForm.formState.errors.cost_price.message}
                      </Text>
                    )}
                  </div>

                  {/* Notes */}
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="pc-notes" className="text-foreground-secondary">
                      Notas <span className="text-xs font-normal">(opcional)</span>
                    </Label>
                    <textarea
                      id="pc-notes"
                      rows={2}
                      maxLength={500}
                      className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none"
                      style={{
                        background: "var(--nuba-raised)",
                        borderColor: "var(--nuba-border-default)",
                        color: "var(--nuba-fg)",
                      }}
                      {...productForm.register("notes")}
                    />
                  </div>
                </form>
              </Modal.Body>
              <Modal.Footer className="flex shrink-0 justify-end gap-2 border-t border-border-subtle px-5 py-4">
                <Button variant="secondary" onPress={() => productModalState.close()} isDisabled={productForm.formState.isSubmitting}>
                  Cancelar
                </Button>
                <Button
                  type="submit" form="product-cost-form" variant="primary"
                  className="bg-accent text-accent-text hover:bg-accent-hover"
                  isDisabled={productForm.formState.isSubmitting}
                >
                  {editingProduct ? "Guardar costo" : "Vincular producto"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </div>
  );
}
