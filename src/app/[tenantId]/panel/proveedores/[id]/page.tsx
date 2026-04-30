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
  BarChart3,
  ChevronRight,
  ClipboardList,
  Leaf,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Power,
  PowerOff,
  Search,
  ShoppingCart,
  Star,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DialogSuccess, DialogWarning } from "@/components/ui";
import type {
  IngredientSearchResult,
  PurchaseOrder,
  PurchaseOrderStatus,
  StockAlertItem,
  Supplier,
  SupplierIngredient,
  SupplierStats,
  SupplierWithIngredients,
} from "@/types/supplier";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "ingredientes" | "ordenes" | "estadisticas";
type AddTab = "nuevo" | "existente";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const supplierFormSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(255),
  contact_name: z.string().max(255),
  email: z.string().max(255).superRefine((s, ctx) => {
    if (s !== "" && !z.string().email().safeParse(s).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Email inválido" });
    }
  }),
  phone: z.string().max(50),
  whatsapp: z.string().max(50),
  address: z.string(),
  notes: z.string().max(1000),
});
type SupplierFormValues = z.input<typeof supplierFormSchema>;

const purchaseFieldsSchema = {
  purchase_unit: z.string().min(1, "La unidad de compra es requerida").max(100),
  purchase_qty: z
    .number({ error: "Ingresá una cantidad válida" })
    .positive("La cantidad debe ser mayor a 0"),
  cost_per_purchase: z
    .number({ error: "Ingresá un costo válido" })
    .min(0, "El costo debe ser >= 0"),
  es_principal: z.boolean(),
  initial_stock_qty: z.number().min(0).optional().nullable(),
  notes: z.string().max(500),
};

const nuevoIngSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido").max(255),
  unit: z.enum(["ml", "l", "g", "kg", "u", "porciones"]),
  stock_minimo: z.number().min(0).optional().nullable(),
  ...purchaseFieldsSchema,
});
type NuevoIngValues = z.input<typeof nuevoIngSchema>;

const editIngSchema = z.object({
  purchase_unit: z.string().min(1, "La unidad de compra es requerida").max(100),
  purchase_qty: z
    .number({ error: "Ingresá una cantidad válida" })
    .positive("La cantidad debe ser mayor a 0"),
  cost_per_purchase: z
    .number({ error: "Ingresá un costo válido" })
    .min(0, "El costo debe ser >= 0"),
  es_principal: z.boolean(),
  notes: z.string().max(500),
});
type EditIngValues = z.input<typeof editIngSchema>;

const orderItemSchema = z.object({
  ingredient_id: z.string().min(1, "Seleccioná un ingrediente"),
  quantity: z
    .number({ error: "Ingresá una cantidad válida" })
    .positive(),
  unit_price: z
    .number({ error: "Ingresá un precio válido" })
    .min(0),
});
type OrderItemValues = z.input<typeof orderItemSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

function formatCost(value: number): string {
  return money.format(value);
}

function supplierInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2)
    return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
}

function waDigits(raw: string | null | undefined): string {
  return raw ? raw.replace(/\D/g, "") : "";
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

function statusLabel(status: PurchaseOrderStatus): string {
  const map: Record<PurchaseOrderStatus, string> = {
    draft: "Borrador",
    sent: "Enviada",
    received: "Recibida",
    cancelled: "Cancelada",
  };
  return map[status];
}

function statusColors(
  status: PurchaseOrderStatus,
): { bg: string; color: string } {
  const map: Record<PurchaseOrderStatus, { bg: string; color: string }> = {
    draft: { bg: "var(--background-raised)", color: "var(--foreground-muted)" },
    sent: { bg: "var(--warning-soft)", color: "var(--warning)" },
    received: { bg: "var(--success-soft)", color: "var(--success)" },
    cancelled: { bg: "var(--danger-soft)", color: "var(--danger)" },
  };
  return map[status];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function calcUnitCost(costPerPurchase: number, purchaseQty: number): number {
  if (!purchaseQty || purchaseQty <= 0) return 0;
  return costPerPurchase / purchaseQty;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ContactRow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span
        className="mt-0.5 shrink-0"
        style={{ color: "var(--foreground-muted)" }}
      >
        {icon}
      </span>
      <span style={{ color: "var(--foreground-secondary)" }}>{children}</span>
    </div>
  );
}

function Separator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-px flex-1"
        style={{ background: "var(--border-subtle)" }}
      />
      <span
        className="shrink-0 text-xs font-medium"
        style={{ color: "var(--foreground-muted)" }}
      >
        {label}
      </span>
      <div
        className="h-px flex-1"
        style={{ background: "var(--border-subtle)" }}
      />
    </div>
  );
}

function NumberInput({
  id,
  min,
  step,
  prefix,
  suffix,
  value,
  onChange,
  placeholder,
}: {
  id?: string;
  min?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative flex items-center">
      {prefix && (
        <span
          className="pointer-events-none absolute left-3 text-sm"
          style={{ color: "var(--foreground-muted)" }}
        >
          {prefix}
        </span>
      )}
      <input
        id={id}
        type="number"
        min={min ?? 0}
        step={step ?? 0.01}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border py-2 text-sm outline-none"
        style={{
          background: "var(--background-raised)",
          borderColor: "var(--border-default)",
          color: "var(--foreground)",
          paddingLeft: prefix ? "1.75rem" : "0.75rem",
          paddingRight: suffix ? "3rem" : "0.75rem",
        }}
      />
      {suffix && (
        <span
          className="pointer-events-none absolute right-3 text-xs"
          style={{ color: "var(--foreground-muted)" }}
        >
          {suffix}
        </span>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProveedorDetallePage() {
  const params = useParams<{ tenantId: string; id: string }>();
  const { tenantId, id } = params;
  const router = useRouter();

  const [supplier, setSupplier] = useState<SupplierWithIngredients | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("ingredientes");

  // Ingredient modal state
  const [editingIngredient, setEditingIngredient] =
    useState<SupplierIngredient | null>(null);
  const [deletingIngredient, setDeletingIngredient] =
    useState<SupplierIngredient | null>(null);

  // Add-ingredient modal sub-tabs
  const [addTab, setAddTab] = useState<AddTab>("nuevo");

  // Tab B: search existing ingredient
  const [ingSearchQuery, setIngSearchQuery] = useState("");
  const [ingSearchResults, setIngSearchResults] = useState<
    IngredientSearchResult[]
  >([]);
  const [ingSearchLoading, setIngSearchLoading] = useState(false);
  const [selectedExistingIng, setSelectedExistingIng] =
    useState<IngredientSearchResult | null>(null);

  // Tab B: purchase fields for existing (local state because conditional rendering)
  const [exPurchaseUnit, setExPurchaseUnit] = useState("unidad");
  const [exPurchaseQty, setExPurchaseQty] = useState("1");
  const [exCostPerPurchase, setExCostPerPurchase] = useState("0");
  const [exEsPrincipal, setExEsPrincipal] = useState(false);
  const [exInitialStock, setExInitialStock] = useState("");
  const [exNotes, setExNotes] = useState("");

  // Orders
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(
    null,
  );
  const [orderItemSearch, setOrderItemSearch] = useState("");
  const [orderItemDropdownOpen, setOrderItemDropdownOpen] = useState(false);
  const [orderItems, setOrderItems] = useState<OrderItemValues[]>([]);

  // Stats
  const [stats, setStats] = useState<SupplierStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [stockAlerts, setStockAlerts] = useState<StockAlertItem[]>([]);

  // Notes autosave
  const [notesValue, setNotesValue] = useState("");

  // Feedback
  const [successOpen, setSuccessOpen] = useState(false);
  const [successCopy, setSuccessCopy] = useState({
    title: "",
    description: "",
  });
  const [dupOpen, setDupOpen] = useState(false);
  const [dupMsg, setDupMsg] = useState("");

  // Modals
  const editModalState = useOverlayState();
  const ingredientModalState = useOverlayState();
  const orderModalState = useOverlayState();
  const deactivateDialog = useOverlayState();
  const reactivateDialog = useOverlayState();
  const deleteIngredientDialog = useOverlayState();
  const stockAlertDialog = useOverlayState();

  // Forms
  const supplierForm = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
  });

  const nuevoForm = useForm<NuevoIngValues>({
    resolver: zodResolver(nuevoIngSchema),
    defaultValues: {
      nombre: "",
      unit: "kg",
      stock_minimo: null,
      purchase_unit: "unidad",
      purchase_qty: 1,
      cost_per_purchase: 0,
      es_principal: true,
      initial_stock_qty: null,
      notes: "",
    },
  });

  const editIngForm = useForm<EditIngValues>({
    resolver: zodResolver(editIngSchema),
    defaultValues: {
      purchase_unit: "unidad",
      purchase_qty: 1,
      cost_per_purchase: 0,
      es_principal: false,
      notes: "",
    },
  });

  const orderItemForm = useForm<OrderItemValues>({
    resolver: zodResolver(orderItemSchema),
    defaultValues: { ingredient_id: "", quantity: 0, unit_price: 0 },
  });

  // Real-time previews
  const nuevoUnit = nuevoForm.watch("unit");
  const nuevoPurchaseUnit = nuevoForm.watch("purchase_unit");
  const nuevoPurchaseQty = nuevoForm.watch("purchase_qty");
  const nuevoCostPerPurchase = nuevoForm.watch("cost_per_purchase");
  const nuevoInitialStock = nuevoForm.watch("initial_stock_qty");
  const nuevoCostPreview = calcUnitCost(nuevoCostPerPurchase, nuevoPurchaseQty);

  const editPurchaseQty = editIngForm.watch("purchase_qty");
  const editCostPerPurchase = editIngForm.watch("cost_per_purchase");
  const editEsPrincipal = editIngForm.watch("es_principal");
  const editCostPreview = calcUnitCost(editCostPerPurchase, editPurchaseQty);

  const exPurchaseQtyNum = parseFloat(exPurchaseQty) || 0;
  const exCostPerPurchaseNum = parseFloat(exCostPerPurchase) || 0;
  const exCostPreview = calcUnitCost(exCostPerPurchaseNum, exPurchaseQtyNum);

  // Debounce search ref
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Loaders ──────────────────────────────────────────────────────────────

  const loadSupplier = useCallback(async () => {
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
      const data = (await res.json()) as SupplierWithIngredients;
      setSupplier(data);
      setNotesValue(data.notes ?? "");
    } finally {
      setLoading(false);
    }
  }, [tenantId, id, router]);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await fetch(
        `/api/${tenantId}/ordenes-compra?supplierId=${id}`,
        { credentials: "include" },
      );
      if (res.ok) {
        const data = (await res.json()) as PurchaseOrder[];
        setOrders(data);
      }
    } finally {
      setOrdersLoading(false);
    }
  }, [tenantId, id]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch(`/api/${tenantId}/proveedores/${id}/stats`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = (await res.json()) as SupplierStats;
        setStats(data);
      }
    } finally {
      setStatsLoading(false);
    }
  }, [tenantId, id]);

  useEffect(() => {
    void loadSupplier();
  }, [loadSupplier]);

  useEffect(() => {
    if (activeTab === "ordenes") void loadOrders();
    if (activeTab === "estadisticas") void loadStats();
  }, [activeTab, loadOrders, loadStats]);

  // Debounced ingredient search (Tab B)
  useEffect(() => {
    if (!ingredientModalState.isOpen || addTab !== "existente") return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (ingSearchQuery.trim().length < 1) {
      setIngSearchResults([]);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      setIngSearchLoading(true);
      try {
        const url = new URL(
          `/api/${tenantId}/ingredientes/buscar`,
          window.location.origin,
        );
        url.searchParams.set("q", ingSearchQuery.trim());
        url.searchParams.set("excluir_proveedor", id);
        const res = await fetch(url.toString(), { credentials: "include" });
        if (res.ok) {
          const data = (await res.json()) as IngredientSearchResult[];
          setIngSearchResults(data);
        }
      } finally {
        setIngSearchLoading(false);
      }
    }, 300);
  }, [ingSearchQuery, ingredientModalState.isOpen, addTab, tenantId, id]);

  // ─── Notes autosave ──────────────────────────────────────────────────────

  async function saveNotes() {
    if (!supplier) return;
    if (notesValue === (supplier.notes ?? "")) return;
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
    } catch {
      // silent
    }
  }

  // ─── Supplier edit ────────────────────────────────────────────────────────

  const submitEditSupplier = supplierForm.handleSubmit(async (values) => {
    const res = await fetch(`/api/${tenantId}/proveedores/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: values.name.trim(),
        contact_name: values.contact_name.trim() || null,
        email: values.email.trim() || null,
        phone: values.phone.trim() || null,
        whatsapp: values.whatsapp.trim() || null,
        address: values.address.trim() || null,
        notes: values.notes.trim() || null,
      }),
    });
    const j = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
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
    await loadSupplier();
  });

  // ─── Deactivate / reactivate ──────────────────────────────────────────────

  async function confirmDeactivate() {
    deactivateDialog.close();
    const res = await fetch(`/api/${tenantId}/proveedores/${id}/desactivar`, {
      method: "PATCH",
      credentials: "include",
    });
    if (!res.ok) {
      toast.danger("Error al desactivar el proveedor");
      return;
    }
    setSuccessCopy({
      title: "Proveedor desactivado",
      description: "Podés reactivarlo en cualquier momento.",
    });
    setSuccessOpen(true);
    await loadSupplier();
  }

  async function confirmReactivate() {
    reactivateDialog.close();
    const res = await fetch(`/api/${tenantId}/proveedores/${id}/reactivar`, {
      method: "PATCH",
      credentials: "include",
    });
    if (!res.ok) {
      toast.danger("Error al reactivar el proveedor");
      return;
    }
    setSuccessCopy({
      title: "Proveedor reactivado",
      description: "El proveedor volvió a estar activo.",
    });
    setSuccessOpen(true);
    await loadSupplier();
  }

  // ─── Ingredient submit: crear nuevo ──────────────────────────────────────

  const submitNuevo = nuevoForm.handleSubmit(async (values) => {
    const res = await fetch(
      `/api/${tenantId}/proveedores/${id}/ingredientes`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ modo: "nuevo", ...values }),
      },
    );
    const j = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (!res.ok) {
      toast.danger(j?.error ?? "Error al crear el ingrediente");
      return;
    }
    ingredientModalState.close();
    setSuccessCopy({
      title: "Ingrediente creado y vinculado",
      description: "El ingrediente fue agregado al sistema y vinculado a este proveedor.",
    });
    setSuccessOpen(true);
    await loadSupplier();
  });

  // ─── Ingredient submit: vincular existente ────────────────────────────────

  async function submitExistente() {
    if (!selectedExistingIng) {
      toast.danger("Seleccioná un ingrediente de la lista");
      return;
    }
    const payload = {
      modo: "existente",
      ingredient_id: selectedExistingIng.id,
      purchase_unit: exPurchaseUnit,
      purchase_qty: exPurchaseQtyNum,
      cost_per_purchase: exCostPerPurchaseNum,
      es_principal: exEsPrincipal,
      initial_stock_qty: exInitialStock ? parseFloat(exInitialStock) : null,
      notes: exNotes.trim() || null,
    };

    const res = await fetch(
      `/api/${tenantId}/proveedores/${id}/ingredientes`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      },
    );
    const j = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (res.status === 409) {
      toast.danger(j?.error ?? "Este ingrediente ya está vinculado");
      return;
    }
    if (!res.ok) {
      toast.danger(j?.error ?? "Error al vincular el ingrediente");
      return;
    }
    ingredientModalState.close();
    setSuccessCopy({
      title: "Ingrediente vinculado",
      description: "El ingrediente fue vinculado a este proveedor.",
    });
    setSuccessOpen(true);
    await loadSupplier();
  }

  // ─── Ingredient submit: editar vínculo ────────────────────────────────────

  const submitEditIng = editIngForm.handleSubmit(async (values) => {
    if (!editingIngredient) return;
    const res = await fetch(
      `/api/${tenantId}/proveedores/${id}/ingredientes/${editingIngredient.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(values),
      },
    );
    const j = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (!res.ok) {
      toast.danger(j?.error ?? "Error al actualizar el vínculo");
      return;
    }
    ingredientModalState.close();
    setEditingIngredient(null);
    setSuccessCopy({
      title: "Vínculo actualizado",
      description: "Los datos de compra se actualizaron correctamente.",
    });
    setSuccessOpen(true);
    await loadSupplier();
  });

  async function confirmDeleteIngredient() {
    if (!deletingIngredient) return;
    deleteIngredientDialog.close();
    const res = await fetch(
      `/api/${tenantId}/proveedores/${id}/ingredientes/${deletingIngredient.id}`,
      { method: "DELETE", credentials: "include" },
    );
    if (!res.ok) {
      toast.danger("Error al desvincular el ingrediente");
      return;
    }
    setDeletingIngredient(null);
    await loadSupplier();
  }

  // ─── Orders ───────────────────────────────────────────────────────────────

  function addOrderItem() {
    const values = orderItemForm.getValues();
    const parsed = orderItemSchema.safeParse(values);
    if (!parsed.success) {
      void orderItemForm.trigger();
      return;
    }
    setOrderItems((prev) => [...prev, parsed.data]);
    orderItemForm.reset({ ingredient_id: "", quantity: 0, unit_price: 0 });
    setOrderItemSearch("");
  }

  function removeOrderItem(index: number) {
    setOrderItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function submitOrder(nextStatus?: "sent") {
    if (orderItems.length === 0) {
      toast.danger("Agregá al menos un ítem a la orden");
      return;
    }

    const isEdit = !!selectedOrder;
    const url = isEdit
      ? `/api/${tenantId}/ordenes-compra/${selectedOrder!.id}`
      : `/api/${tenantId}/ordenes-compra`;

    const body = isEdit
      ? { items: orderItems, status: nextStatus }
      : { supplier_id: id, items: orderItems, status: nextStatus };

    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });

    const j = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (!res.ok) {
      toast.danger(j?.error ?? "Error al guardar la orden");
      return;
    }

    orderModalState.close();
    setSelectedOrder(null);
    setOrderItems([]);
    setSuccessCopy({
      title: isEdit ? "Orden actualizada" : "Orden creada",
      description:
        nextStatus === "sent"
          ? "La orden fue marcada como enviada al proveedor."
          : "El borrador de la orden fue guardado.",
    });
    setSuccessOpen(true);
    await loadOrders();
  }

  async function markOrderSent(order: PurchaseOrder) {
    const res = await fetch(`/api/${tenantId}/ordenes-compra/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status: "sent" }),
    });
    if (!res.ok) {
      toast.danger("Error al actualizar la orden");
      return;
    }
    setSuccessCopy({
      title: "Orden enviada",
      description: "La orden fue marcada como enviada al proveedor.",
    });
    setSuccessOpen(true);
    await loadOrders();
  }

  async function receiveOrder(order: PurchaseOrder) {
    const res = await fetch(
      `/api/${tenantId}/ordenes-compra/${order.id}/recibir`,
      { method: "POST", credentials: "include" },
    );
    const j = (await res.json().catch(() => null)) as
      | {
          orden?: PurchaseOrder;
          alertasStockBajo?: StockAlertItem[];
          error?: string;
        }
      | null;
    if (!res.ok) {
      toast.danger(j?.error ?? "Error al recibir la orden");
      return;
    }
    await loadOrders();
    await loadSupplier();
    if (j?.alertasStockBajo && j.alertasStockBajo.length > 0) {
      setStockAlerts(j.alertasStockBajo);
      stockAlertDialog.open();
    } else {
      setSuccessCopy({
        title: "Orden recibida",
        description:
          "El stock de los ingredientes fue actualizado correctamente.",
      });
      setSuccessOpen(true);
    }
  }

  async function cancelOrder(order: PurchaseOrder) {
    const res = await fetch(`/api/${tenantId}/ordenes-compra/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status: "cancelled" }),
    });
    if (!res.ok) {
      toast.danger("Error al cancelar la orden");
      return;
    }
    await loadOrders();
  }

  // ─── Derived state ────────────────────────────────────────────────────────

  const orderTotal = orderItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0,
  );

  const filteredOrderIngredients = (supplier?.supplier_ingredients ?? []).filter(
    (si) =>
      !orderItemSearch ||
      si.ingredient_nombre.toLowerCase().includes(orderItemSearch.toLowerCase()),
  );

  // ─── Loading skeleton ─────────────────────────────────────────────────────

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

  // ─── Render ───────────────────────────────────────────────────────────────

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
        isOpen={deleteIngredientDialog.isOpen}
        onClose={() => {
          deleteIngredientDialog.close();
          setDeletingIngredient(null);
        }}
        title="¿Desvincular ingrediente?"
        description={`¿Querés desvincular "${deletingIngredient?.ingredient_nombre}" de este proveedor?`}
        confirmLabel="Sí, desvincular"
        cancelLabel="Cancelar"
        onConfirm={() => void confirmDeleteIngredient()}
      />
      <DialogWarning
        isOpen={stockAlertDialog.isOpen}
        onClose={() => {
          stockAlertDialog.close();
          setStockAlerts([]);
        }}
        title="Stock bajo mínimo"
        description={
          stockAlerts.length > 0
            ? `Los siguientes ingredientes quedaron por debajo del stock mínimo:\n${stockAlerts
                .map(
                  (a) =>
                    `• ${a.nombre}: ${a.stock} ${a.unit} (mín: ${a.stock_minimo} ${a.unit})`,
                )
                .join("\n")}`
            : ""
        }
        confirmLabel="Entendido"
        cancelLabel="Cerrar"
        onConfirm={() => {
          stockAlertDialog.close();
          setStockAlerts([]);
        }}
      />

      {/* Back link */}
      <div className="flex items-center gap-2">
        <Link
          href={`/${tenantId}/panel/proveedores`}
          className="flex items-center gap-1.5 text-sm transition-colors hover:text-accent"
          style={{ color: "var(--foreground-muted)" }}
        >
          <ArrowLeft size={14} />
          Proveedores
        </Link>
        <ChevronRight size={12} style={{ color: "var(--foreground-muted)" }} />
        <span className="text-sm text-foreground">{s.name}</span>
      </div>

      {/* Single-column layout */}
      <div className="flex flex-col gap-4">
        {/* ── Supplier info ──────────────────────────────────────────────── */}
        <div className="w-full">
          <div
            className="flex flex-col gap-3 rounded-xl border p-4"
            style={{
              background: "var(--glass-surface)",
              backdropFilter: "blur(var(--glass-blur-sm))",
              borderColor: "var(--border-subtle)",
            }}
          >
            {/* Row 1: avatar + name + actions */}
            <div className="flex items-center gap-3">
              <div
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-base font-bold"
                style={{
                  background: "var(--accent-soft)",
                  color: "var(--accent)",
                }}
              >
                {supplierInitials(s.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-foreground">
                    {s.name}
                  </p>
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={
                      s.is_active
                        ? { background: "var(--success-soft)", color: "var(--success)" }
                        : { background: "var(--background-raised)", color: "var(--foreground-muted)" }
                    }
                  >
                    {s.is_active ? "Activo" : "Inactivo"}
                  </span>
                  <span
                    className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
                    style={{
                      background: "var(--background-raised)",
                      color: "var(--foreground-secondary)",
                    }}
                  >
                    <Leaf size={10} />
                    {s.supplier_ingredients.length} ingredientes
                  </span>
                </div>
                {s.contact_name && (
                  <p className="text-sm" style={{ color: "var(--foreground-muted)" }}>
                    {s.contact_name}
                  </p>
                )}
              </div>
              {/* Actions */}
              <div className="flex shrink-0 items-center gap-2">
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

            {/* Row 2: contact + notes */}
            {(s.email || s.phone || s.whatsapp || s.address || true) && (
              <div
                className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-start"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                {/* Contact items */}
                {(s.email || s.phone || s.whatsapp || s.address) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 sm:flex-1">
                    {s.email && (
                      <ContactRow icon={<Mail size={13} />}>
                        <a href={`mailto:${s.email}`} className="hover:text-accent hover:underline">
                          {s.email}
                        </a>
                      </ContactRow>
                    )}
                    {s.phone && (
                      <ContactRow icon={<Phone size={13} />}>
                        <a href={`tel:${s.phone}`} className="hover:text-accent hover:underline">
                          {s.phone}
                        </a>
                      </ContactRow>
                    )}
                    {s.whatsapp && (
                      <ContactRow icon={<MessageCircle size={13} />}>
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
                      <ContactRow icon={<MapPin size={13} />}>{s.address}</ContactRow>
                    )}
                  </div>
                )}

                {/* Notes */}
                <div className="flex flex-col gap-1 sm:w-72 sm:shrink-0">
                  <Label htmlFor="supplier-notes" className="text-xs text-foreground-secondary">
                    Notas internas
                  </Label>
                  <textarea
                    id="supplier-notes"
                    rows={2}
                    maxLength={1000}
                    className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
                    style={{
                      background: "var(--background-raised)",
                      borderColor: "var(--border-default)",
                      color: "var(--foreground)",
                    }}
                    value={notesValue}
                    onChange={(e) => setNotesValue(e.target.value)}
                    onBlur={() => void saveNotes()}
                    placeholder="Observaciones sobre el proveedor..."
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div className="w-full">
          {/* Tab bar */}
          <div
            className="mb-4 flex gap-1 rounded-xl border p-1"
            style={{
              background: "var(--background-raised)",
              borderColor: "var(--border-subtle)",
            }}
          >
            {(
              [
                {
                  key: "ingredientes",
                  label: "Ingredientes",
                  icon: <Leaf size={14} />,
                },
                {
                  key: "ordenes",
                  label: "Órdenes de compra",
                  icon: <ShoppingCart size={14} />,
                },
                {
                  key: "estadisticas",
                  label: "Estadísticas",
                  icon: <BarChart3 size={14} />,
                },
              ] as { key: Tab; label: string; icon: React.ReactNode }[]
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                style={
                  activeTab === tab.key
                    ? {
                        background: "var(--background-surface)",
                        color: "var(--foreground)",
                        boxShadow: "0 1px 3px rgba(0,0,0,.1)",
                      }
                    : { color: "var(--foreground-muted)" }
                }
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* ── Tab: Ingredientes ─────────────────────────────────────────── */}
          {activeTab === "ingredientes" && (
            <div
              className="rounded-xl border"
              style={{
                background: "var(--glass-surface)",
                backdropFilter: "blur(var(--glass-blur-sm))",
                borderColor: "var(--border-subtle)",
              }}
            >
              <div
                className="flex items-center justify-between gap-3 border-b px-5 py-3"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div className="flex items-center gap-2">
                  <Text className="text-sm font-semibold text-foreground">
                    Ingredientes que provee
                  </Text>
                  <BadgeRoot variant="soft">
                    <BadgeLabel>{s.supplier_ingredients.length}</BadgeLabel>
                  </BadgeRoot>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 text-xs"
                  onPress={() => {
                    setEditingIngredient(null);
                    setAddTab("nuevo");
                    setIngSearchQuery("");
                    setIngSearchResults([]);
                    setSelectedExistingIng(null);
                    setExPurchaseUnit("unidad");
                    setExPurchaseQty("1");
                    setExCostPerPurchase("0");
                    setExEsPrincipal(s.supplier_ingredients.length === 0);
                    setExInitialStock("");
                    setExNotes("");
                    nuevoForm.reset({
                      nombre: "",
                      unit: "kg",
                      stock_minimo: null,
                      purchase_unit: "unidad",
                      purchase_qty: 1,
                      cost_per_purchase: 0,
                      es_principal: s.supplier_ingredients.length === 0,
                      initial_stock_qty: null,
                      notes: "",
                    });
                    ingredientModalState.open();
                  }}
                >
                  <Plus size={13} />
                  Agregar ingrediente
                </Button>
              </div>

              {s.supplier_ingredients.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <Leaf
                    size={32}
                    strokeWidth={1.25}
                    style={{ color: "var(--foreground-muted)" }}
                  />
                  <Text className="text-sm text-foreground-muted">
                    No hay ingredientes vinculados
                  </Text>
                </div>
              ) : (
                <div className="overflow-x-auto" style={{ background: "var(--background-surface)" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <th
                          className="py-3 pl-5 pr-4 text-left font-medium"
                          style={{ color: "var(--foreground-muted)" }}
                        >
                          Ingrediente
                        </th>
                        <th
                          className="px-4 py-3 text-left font-medium"
                          style={{ color: "var(--foreground-muted)" }}
                        >
                          Unidad de compra
                        </th>
                        <th
                          className="px-4 py-3 text-right font-medium"
                          style={{ color: "var(--foreground-muted)" }}
                        >
                          Costo/compra
                        </th>
                        <th
                          className="px-4 py-3 text-right font-medium"
                          style={{ color: "var(--foreground-muted)" }}
                        >
                          Costo/unidad
                        </th>
                        <th
                          className="px-4 py-3 text-right font-medium"
                          style={{ color: "var(--foreground-muted)" }}
                        >
                          Stock actual
                        </th>
                        <th
                          className="px-4 py-3 text-center font-medium"
                          style={{ color: "var(--foreground-muted)" }}
                        >
                          Principal
                        </th>
                        <th
                          className="py-3 pl-4 pr-5 text-right font-medium"
                          style={{ color: "var(--foreground-muted)" }}
                        >
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.supplier_ingredients.map((si) => {
                        const stockLow =
                          si.ingredient_stock_minimo != null &&
                          si.ingredient_stock < si.ingredient_stock_minimo;
                        return (
                          <tr
                            key={si.id}
                            className="transition-colors hover:bg-raised"
                            style={{
                              borderBottom: "1px solid var(--border-subtle)",
                            }}
                          >
                            <td className="py-3 pl-5 pr-4">
                              <div className="flex items-center gap-2">
                                {si.es_principal && (
                                  <Star
                                    size={12}
                                    className="shrink-0 fill-current"
                                    style={{ color: "var(--warning)" }}
                                  />
                                )}
                                <span className="font-medium text-foreground">
                                  {si.ingredient_nombre}
                                </span>
                                {si.es_principal && (
                                  <span
                                    className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                                    style={{
                                      background: "var(--warning-soft)",
                                      color: "var(--warning)",
                                    }}
                                  >
                                    Principal
                                  </span>
                                )}
                              </div>
                              {si.notes && (
                                <p
                                  className="mt-0.5 text-xs"
                                  style={{ color: "var(--foreground-muted)" }}
                                >
                                  {si.notes}
                                </p>
                              )}
                            </td>
                            <td
                              className="px-4 py-3"
                              style={{ color: "var(--foreground-secondary)" }}
                            >
                              {si.purchase_unit}{" "}
                              <span
                                className="text-xs"
                                style={{ color: "var(--foreground-muted)" }}
                              >
                                ({si.purchase_qty} {si.ingredient_unit})
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-foreground">
                              {formatCost(si.cost_per_purchase)}
                            </td>
                            <td
                              className="px-4 py-3 text-right"
                              style={{ color: "var(--foreground-secondary)" }}
                            >
                              {formatCost(si.unit_cost_calculated)}/
                              {si.ingredient_unit}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span
                                style={{
                                  color: stockLow
                                    ? "var(--danger)"
                                    : "var(--foreground-secondary)",
                                  fontWeight: stockLow ? 600 : undefined,
                                }}
                              >
                                {si.ingredient_stock} {si.ingredient_unit}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className="inline-block size-2.5 rounded-full"
                                style={{
                                  background: si.es_principal
                                    ? "var(--success)"
                                    : "var(--background-raised)",
                                  border: `1px solid ${si.es_principal ? "var(--success)" : "var(--border-default)"}`,
                                }}
                              />
                            </td>
                            <td className="py-3 pl-4 pr-5">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  title="Editar"
                                  className="rounded-lg p-1.5 transition-colors hover:bg-raised"
                                  style={{ color: "var(--foreground-muted)" }}
                                  onClick={() => {
                                    setEditingIngredient(si);
                                    editIngForm.reset({
                                      purchase_unit: si.purchase_unit,
                                      purchase_qty: si.purchase_qty,
                                      cost_per_purchase: si.cost_per_purchase,
                                      es_principal: si.es_principal,
                                      notes: si.notes ?? "",
                                    });
                                    ingredientModalState.open();
                                  }}
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  title="Desvincular"
                                  className="rounded-lg p-1.5 transition-colors hover:bg-danger-soft"
                                  style={{ color: "var(--danger)" }}
                                  onClick={() => {
                                    setDeletingIngredient(si);
                                    deleteIngredientDialog.open();
                                  }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Órdenes de compra ────────────────────────────────────── */}
          {activeTab === "ordenes" && (
            <div
              className="rounded-xl border"
              style={{
                background: "var(--glass-surface)",
                backdropFilter: "blur(var(--glass-blur-sm))",
                borderColor: "var(--border-subtle)",
              }}
            >
              <div
                className="flex items-center justify-between gap-3 border-b px-5 py-3"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div className="flex items-center gap-2">
                  <Text className="text-sm font-semibold text-foreground">
                    Órdenes de compra
                  </Text>
                  <BadgeRoot variant="soft">
                    <BadgeLabel>{orders.length}</BadgeLabel>
                  </BadgeRoot>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 text-xs"
                  onPress={() => {
                    setSelectedOrder(null);
                    setOrderItems([]);
                    orderItemForm.reset({
                      ingredient_id: "",
                      quantity: 0,
                      unit_price: 0,
                    });
                    setOrderItemSearch("");
                    orderModalState.open();
                  }}
                >
                  <Plus size={13} />
                  Nueva orden
                </Button>
              </div>

              {ordersLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                </div>
              ) : orders.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <ClipboardList
                    size={32}
                    strokeWidth={1.25}
                    style={{ color: "var(--foreground-muted)" }}
                  />
                  <Text className="text-sm text-foreground-muted">
                    No hay órdenes de compra
                  </Text>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <th
                          className="py-3 pl-5 pr-4 text-left font-medium"
                          style={{ color: "var(--foreground-muted)" }}
                        >
                          Fecha
                        </th>
                        <th
                          className="px-4 py-3 text-left font-medium"
                          style={{ color: "var(--foreground-muted)" }}
                        >
                          Estado
                        </th>
                        <th
                          className="px-4 py-3 text-right font-medium"
                          style={{ color: "var(--foreground-muted)" }}
                        >
                          Ítems
                        </th>
                        <th
                          className="px-4 py-3 text-right font-medium"
                          style={{ color: "var(--foreground-muted)" }}
                        >
                          Total
                        </th>
                        <th
                          className="py-3 pl-4 pr-5 text-right font-medium"
                          style={{ color: "var(--foreground-muted)" }}
                        >
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => {
                        const sc = statusColors(order.status);
                        return (
                          <tr
                            key={order.id}
                            className="transition-colors hover:bg-raised"
                            style={{
                              borderBottom: "1px solid var(--border-subtle)",
                            }}
                          >
                            <td className="py-3 pl-5 pr-4">
                              <p className="text-foreground">
                                {formatDate(order.created_at)}
                              </p>
                              {order.expected_date && (
                                <p
                                  className="text-xs"
                                  style={{ color: "var(--foreground-muted)" }}
                                >
                                  Esperada: {formatDate(order.expected_date)}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className="rounded-full px-2 py-0.5 text-xs font-medium"
                                style={{
                                  background: sc.bg,
                                  color: sc.color,
                                }}
                              >
                                {statusLabel(order.status)}
                              </span>
                            </td>
                            <td
                              className="px-4 py-3 text-right"
                              style={{ color: "var(--foreground-secondary)" }}
                            >
                              {order.item_count}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-foreground">
                              {formatCost(order.total)}
                            </td>
                            <td className="py-3 pl-4 pr-5">
                              <div className="flex items-center justify-end gap-2">
                                {order.status === "draft" && (
                                  <>
                                    <button
                                      type="button"
                                      title="Editar"
                                      className="rounded-lg p-1.5 transition-colors hover:bg-raised"
                                      style={{ color: "var(--foreground-muted)" }}
                                      onClick={() => {
                                        setSelectedOrder(order);
                                        setOrderItems(
                                          order.items.map((item) => ({
                                            ingredient_id: item.ingredient_id,
                                            quantity: item.quantity,
                                            unit_price: item.unit_price,
                                          })),
                                        );
                                        setOrderItemSearch("");
                                        orderModalState.open();
                                      }}
                                    >
                                      <Pencil size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors hover:opacity-80"
                                      style={{
                                        background: "var(--warning-soft)",
                                        color: "var(--warning)",
                                      }}
                                      onClick={() => void markOrderSent(order)}
                                    >
                                      Enviar
                                    </button>
                                  </>
                                )}
                                {order.status === "sent" && (
                                  <button
                                    type="button"
                                    className="rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors hover:opacity-80"
                                    style={{
                                      background: "var(--success-soft)",
                                      color: "var(--success)",
                                    }}
                                    onClick={() => void receiveOrder(order)}
                                  >
                                    Recibir
                                  </button>
                                )}
                                {(order.status === "draft" ||
                                  order.status === "sent") && (
                                  <button
                                    type="button"
                                    title="Cancelar"
                                    className="rounded-lg p-1.5 transition-colors hover:bg-danger-soft"
                                    style={{ color: "var(--danger)" }}
                                    onClick={() => void cancelOrder(order)}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Estadísticas ─────────────────────────────────────────── */}
          {activeTab === "estadisticas" && (
            <div className="flex flex-col gap-4">
              {statsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                </div>
              ) : stats ? (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {[
                      {
                        label: "Total comprado",
                        value: formatCost(stats.total_comprado),
                      },
                      {
                        label: "Cantidad de órdenes",
                        value: String(stats.cantidad_ordenes),
                      },
                      {
                        label: "Última orden",
                        value: formatDate(stats.ultima_orden),
                      },
                    ].map((card) => (
                      <div
                        key={card.label}
                        className="rounded-xl border p-4"
                        style={{
                          background: "var(--glass-surface)",
                          backdropFilter: "blur(var(--glass-blur-sm))",
                          borderColor: "var(--border-subtle)",
                        }}
                      >
                        <p
                          className="mb-1 text-xs"
                          style={{ color: "var(--foreground-muted)" }}
                        >
                          {card.label}
                        </p>
                        <p className="text-xl font-bold text-foreground">
                          {card.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div
                    className="rounded-xl border"
                    style={{
                      background: "var(--glass-surface)",
                      backdropFilter: "blur(var(--glass-blur-sm))",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    <div
                      className="border-b px-5 py-3"
                      style={{ borderColor: "var(--border-subtle)" }}
                    >
                      <Text className="text-sm font-semibold text-foreground">
                        Órdenes por estado
                      </Text>
                    </div>
                    <div className="divide-y divide-border-subtle">
                      {(
                        [
                          { key: "draft", label: "Borrador" },
                          { key: "sent", label: "Enviadas" },
                          { key: "received", label: "Recibidas" },
                          { key: "cancelled", label: "Canceladas" },
                        ] as {
                          key: keyof typeof stats.ordenes_por_estado;
                          label: string;
                        }[]
                      ).map((row) => {
                        const sc = statusColors(row.key as PurchaseOrderStatus);
                        return (
                          <div
                            key={row.key}
                            className="flex items-center justify-between px-5 py-3"
                          >
                            <span
                              className="rounded-full px-2 py-0.5 text-xs font-medium"
                              style={{ background: sc.bg, color: sc.color }}
                            >
                              {row.label}
                            </span>
                            <span className="font-semibold text-foreground">
                              {stats.ordenes_por_estado[row.key]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* ── Edit supplier modal ─────────────────────────────────────────────── */}
      <Modal.Root state={editModalState}>
        <Modal.Backdrop
          className="z-200 flex items-center justify-center p-3 sm:p-6"
          variant="blur"
        >
          <Modal.Container placement="center" size="lg">
            <Modal.Dialog className="flex max-h-[min(90dvh,780px)] w-[min(100vw-1.5rem,30rem)] max-w-none flex-col overflow-hidden border border-border-subtle bg-surface/95 shadow-lg outline-none backdrop-blur-sm">
              <Modal.Header className="shrink-0 border-b border-border-subtle px-5 pb-3 pt-5">
                <div className="flex items-start justify-between gap-3">
                  <Modal.Heading className="min-w-0 flex-1 pr-2">
                    Editar proveedor
                  </Modal.Heading>
                  <Modal.CloseTrigger aria-label="Cerrar" className="shrink-0" />
                </div>
              </Modal.Header>
              <Modal.Body className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <form
                  id="supplier-edit-form"
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitEditSupplier();
                  }}
                >
                  <div className="flex flex-col gap-1">
                    <Label
                      htmlFor="se-name"
                      className="flex items-baseline gap-1"
                    >
                      Nombre
                      <span className="text-xs font-normal text-danger">
                        (obligatorio)
                      </span>
                    </Label>
                    <Input
                      id="se-name"
                      variant="secondary"
                      className="w-full"
                      {...supplierForm.register("name")}
                    />
                    {supplierForm.formState.errors.name?.message && (
                      <Text className="text-xs text-danger">
                        {supplierForm.formState.errors.name.message}
                      </Text>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label
                      htmlFor="se-contact"
                      className="text-foreground-secondary"
                    >
                      Contacto{" "}
                      <span className="text-xs font-normal">(opcional)</span>
                    </Label>
                    <Input
                      id="se-contact"
                      variant="secondary"
                      className="w-full"
                      {...supplierForm.register("contact_name")}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label
                      htmlFor="se-email"
                      className="text-foreground-secondary"
                    >
                      Email{" "}
                      <span className="text-xs font-normal">(opcional)</span>
                    </Label>
                    <Input
                      id="se-email"
                      type="email"
                      variant="secondary"
                      className="w-full"
                      {...supplierForm.register("email")}
                    />
                    {supplierForm.formState.errors.email?.message && (
                      <Text className="text-xs text-danger">
                        {supplierForm.formState.errors.email.message}
                      </Text>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <Label
                        htmlFor="se-phone"
                        className="text-foreground-secondary"
                      >
                        Teléfono
                      </Label>
                      <Input
                        id="se-phone"
                        variant="secondary"
                        className="w-full"
                        {...supplierForm.register("phone")}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label
                        htmlFor="se-wa"
                        className="text-foreground-secondary"
                      >
                        WhatsApp
                      </Label>
                      <Input
                        id="se-wa"
                        variant="secondary"
                        className="w-full"
                        {...supplierForm.register("whatsapp")}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label
                      htmlFor="se-address"
                      className="text-foreground-secondary"
                    >
                      Dirección{" "}
                      <span className="text-xs font-normal">(opcional)</span>
                    </Label>
                    <textarea
                      id="se-address"
                      rows={2}
                      className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none"
                      style={{
                        background: "var(--background-raised)",
                        borderColor: "var(--border-default)",
                        color: "var(--foreground)",
                      }}
                      {...supplierForm.register("address")}
                    />
                  </div>
                </form>
              </Modal.Body>
              <Modal.Footer className="flex shrink-0 justify-end gap-2 border-t border-border-subtle px-5 py-4">
                <Button
                  variant="secondary"
                  onPress={() => editModalState.close()}
                  isDisabled={supplierForm.formState.isSubmitting}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  form="supplier-edit-form"
                  variant="primary"
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

      {/* ── Ingredient modal ────────────────────────────────────────────────── */}
      <Modal.Root
        state={ingredientModalState}
        onOpenChange={(open) => {
          if (!open) setEditingIngredient(null);
        }}
      >
        <Modal.Backdrop
          className="z-200 flex items-center justify-center p-3 sm:p-6"
          variant="blur"
        >
          <Modal.Container placement="center" size="lg">
            <Modal.Dialog className="flex max-h-[min(92dvh,700px)] w-[min(100vw-1.5rem,32rem)] max-w-none flex-col overflow-hidden border border-border-subtle bg-surface/95 shadow-lg outline-none backdrop-blur-sm">
              <Modal.Header className="shrink-0 border-b border-border-subtle px-5 pb-3 pt-5">
                <div className="flex items-start justify-between gap-3">
                  <Modal.Heading className="min-w-0 flex-1 pr-2">
                    {editingIngredient
                      ? `Editar: ${editingIngredient.ingredient_nombre}`
                      : "Agregar ingrediente"}
                  </Modal.Heading>
                  <Modal.CloseTrigger aria-label="Cerrar" className="shrink-0" />
                </div>
              </Modal.Header>

              {editingIngredient ? (
                /* ── Edit mode ─────────────────────────────────────────── */
                <>
                  <Modal.Body className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    <form
                      id="edit-ing-form"
                      className="flex flex-col gap-4"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void submitEditIng();
                      }}
                    >
                      <Separator label="Datos de compra" />

                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-foreground-secondary">
                            Unidad de compra
                          </Label>
                          <Input
                            variant="secondary"
                            className="w-full"
                            placeholder="paquete, caja..."
                            {...editIngForm.register("purchase_unit")}
                          />
                          {editIngForm.formState.errors.purchase_unit
                            ?.message && (
                            <Text className="text-xs text-danger">
                              {
                                editIngForm.formState.errors.purchase_unit
                                  .message
                              }
                            </Text>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-foreground-secondary">
                            Cantidad por unidad de compra
                          </Label>
                          <Input
                            type="number"
                            variant="secondary"
                            className="w-full"
                            step={0.001}
                            min={0.001}
                            {...editIngForm.register("purchase_qty", {
                              valueAsNumber: true,
                            })}
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-foreground-secondary">
                          Costo por unidad de compra (ARS)
                        </Label>
                        <div className="relative">
                          <span
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm"
                            style={{ color: "var(--foreground-muted)" }}
                          >
                            $
                          </span>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            className="w-full rounded-lg border py-2 pl-7 pr-3 text-sm outline-none"
                            style={{
                              background: "var(--background-raised)",
                              borderColor: "var(--border-default)",
                              color: "var(--foreground)",
                            }}
                            {...editIngForm.register("cost_per_purchase", {
                              valueAsNumber: true,
                            })}
                          />
                        </div>
                        {editIngForm.formState.errors.cost_per_purchase
                          ?.message && (
                          <Text className="text-xs text-danger">
                            {
                              editIngForm.formState.errors.cost_per_purchase
                                .message
                            }
                          </Text>
                        )}
                      </div>

                      {/* Preview */}
                      <div
                        className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                        style={{
                          background: "var(--accent-soft)",
                          color: "var(--accent)",
                        }}
                      >
                        <span>
                          Costo por {editingIngredient.ingredient_unit}:
                        </span>
                        <span className="font-semibold">
                          {editPurchaseQty > 0
                            ? formatCost(editCostPreview)
                            : "—"}
                        </span>
                      </div>

                      {editEsPrincipal && (
                        <div
                          className="rounded-lg px-3 py-2 text-xs"
                          style={{
                            background: "var(--warning-soft)",
                            color: "var(--warning)",
                          }}
                        >
                          Al guardar, el food cost de todas las recetas que usen
                          &quot;{editingIngredient.ingredient_nombre}&quot; se
                          actualizará automáticamente.
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <input
                          id="edit-principal"
                          type="checkbox"
                          className="size-4 accent-accent"
                          {...editIngForm.register("es_principal")}
                        />
                        <Label
                          htmlFor="edit-principal"
                          className="text-sm text-foreground-secondary"
                        >
                          Proveedor principal de este ingrediente
                        </Label>
                      </div>

                      <div className="flex flex-col gap-1">
                        <Label className="text-foreground-secondary">
                          Notas{" "}
                          <span className="text-xs font-normal">(opcional)</span>
                        </Label>
                        <textarea
                          rows={2}
                          maxLength={500}
                          className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none"
                          style={{
                            background: "var(--background-raised)",
                            borderColor: "var(--border-default)",
                            color: "var(--foreground)",
                          }}
                          {...editIngForm.register("notes")}
                        />
                      </div>
                    </form>
                  </Modal.Body>
                  <Modal.Footer className="flex shrink-0 justify-end gap-2 border-t border-border-subtle px-5 py-4">
                    <Button
                      variant="secondary"
                      onPress={() => ingredientModalState.close()}
                      isDisabled={editIngForm.formState.isSubmitting}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      form="edit-ing-form"
                      variant="primary"
                      className="bg-accent text-accent-text hover:bg-accent-hover"
                      isDisabled={editIngForm.formState.isSubmitting}
                    >
                      Guardar cambios
                    </Button>
                  </Modal.Footer>
                </>
              ) : (
                /* ── Add mode (tabs) ───────────────────────────────────── */
                <>
                  {/* Sub-tabs */}
                  <div
                    className="flex gap-1 border-b px-5 pt-3"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    {(
                      [
                        { key: "nuevo", label: "Crear nuevo ingrediente" },
                        { key: "existente", label: "Buscar existente" },
                      ] as { key: AddTab; label: string }[]
                    ).map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setAddTab(t.key)}
                        className="rounded-t-lg px-4 py-2 text-sm font-medium transition-colors"
                        style={
                          addTab === t.key
                            ? {
                                background: "var(--background-raised)",
                                color: "var(--foreground)",
                                borderBottom: "2px solid var(--accent)",
                              }
                            : { color: "var(--foreground-muted)" }
                        }
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  <Modal.Body className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    {/* ── Tab A: Nuevo ingrediente ────────────────────── */}
                    {addTab === "nuevo" && (
                      <form
                        id="nuevo-ing-form"
                        className="flex flex-col gap-4"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void submitNuevo();
                        }}
                      >
                        <div className="flex flex-col gap-1">
                          <Label className="flex items-baseline gap-1">
                            Nombre del ingrediente
                            <span className="text-xs font-normal text-danger">
                              (obligatorio)
                            </span>
                          </Label>
                          <Input
                            variant="secondary"
                            className="w-full"
                            placeholder="Café en grano, Harina 000..."
                            {...nuevoForm.register("nombre")}
                          />
                          {nuevoForm.formState.errors.nombre?.message && (
                            <Text className="text-xs text-danger">
                              {nuevoForm.formState.errors.nombre.message}
                            </Text>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1">
                            <Label className="text-xs text-foreground-secondary">
                              Unidad de uso
                            </Label>
                            <select
                              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                              style={{
                                background: "var(--background-raised)",
                                borderColor: "var(--border-default)",
                                color: "var(--foreground)",
                              }}
                              {...nuevoForm.register("unit")}
                            >
                              <option value="g">g (gramos)</option>
                              <option value="kg">kg (kilogramos)</option>
                              <option value="ml">ml (mililitros)</option>
                              <option value="l">l (litros)</option>
                              <option value="u">u (unidad)</option>
                              <option value="porciones">porciones</option>
                            </select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label className="text-xs text-foreground-secondary">
                              Stock mínimo (opcional)
                            </Label>
                            <input
                              type="number"
                              min={0}
                              step={0.001}
                              placeholder="Sin mínimo"
                              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                              style={{
                                background: "var(--background-raised)",
                                borderColor: "var(--border-default)",
                                color: "var(--foreground)",
                              }}
                              {...nuevoForm.register("stock_minimo", {
                                setValueAs: (v) =>
                                  v === "" || v === null ? null : Number(v),
                              })}
                            />
                          </div>
                        </div>

                        <Separator label="Datos de compra" />

                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-foreground-secondary">
                            Unidad de compra
                          </Label>
                          <Input
                            variant="secondary"
                            className="w-full"
                            placeholder="paquete, caja, bolsa, lata..."
                            {...nuevoForm.register("purchase_unit")}
                          />
                          {nuevoForm.formState.errors.purchase_unit
                            ?.message && (
                            <Text className="text-xs text-danger">
                              {
                                nuevoForm.formState.errors.purchase_unit
                                  .message
                              }
                            </Text>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1">
                            <Label className="text-xs text-foreground-secondary">
                              Cantidad por{" "}
                              {nuevoPurchaseUnit || "unidad de compra"}
                            </Label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0.001}
                                step={0.001}
                                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                                style={{
                                  background: "var(--background-raised)",
                                  borderColor: "var(--border-default)",
                                  color: "var(--foreground)",
                                }}
                                {...nuevoForm.register("purchase_qty", {
                                  valueAsNumber: true,
                                })}
                              />
                              <span
                                className="shrink-0 text-xs"
                                style={{ color: "var(--foreground-muted)" }}
                              >
                                {nuevoUnit}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label className="text-xs text-foreground-secondary">
                              Costo por {nuevoPurchaseUnit || "unidad"} (ARS)
                            </Label>
                            <div className="relative">
                              <span
                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm"
                                style={{ color: "var(--foreground-muted)" }}
                              >
                                $
                              </span>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                className="w-full rounded-lg border py-2 pl-7 pr-3 text-sm outline-none"
                                style={{
                                  background: "var(--background-raised)",
                                  borderColor: "var(--border-default)",
                                  color: "var(--foreground)",
                                }}
                                {...nuevoForm.register("cost_per_purchase", {
                                  valueAsNumber: true,
                                })}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Preview */}
                        <div
                          className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                          style={{
                            background: "var(--accent-soft)",
                            color: "var(--accent)",
                          }}
                        >
                          <span>Costo por {nuevoUnit}:</span>
                          <span className="font-semibold">
                            {nuevoPurchaseQty > 0
                              ? formatCost(nuevoCostPreview)
                              : "—"}
                          </span>
                        </div>

                        <Separator label="Stock inicial" />

                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-foreground-secondary">
                            Stock inicial (en {nuevoUnit})
                          </Label>
                          <input
                            type="number"
                            min={0}
                            step={0.001}
                            placeholder={`0 — dejar vacío si no tenés stock todavía`}
                            className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                            style={{
                              background: "var(--background-raised)",
                              borderColor: "var(--border-default)",
                              color: "var(--foreground)",
                            }}
                            {...nuevoForm.register("initial_stock_qty", {
                              setValueAs: (v) =>
                                v === "" || v === null ? null : Number(v),
                            })}
                          />
                          {nuevoInitialStock != null &&
                            nuevoInitialStock > 0 &&
                            nuevoPurchaseQty > 0 && (
                              <p
                                className="text-xs"
                                style={{ color: "var(--foreground-muted)" }}
                              >
                                ≈{" "}
                                {(
                                  nuevoInitialStock / nuevoPurchaseQty
                                ).toFixed(2)}{" "}
                                {nuevoPurchaseUnit || "unidades"} en inventario
                              </p>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            id="nuevo-principal"
                            type="checkbox"
                            className="size-4 accent-accent"
                            {...nuevoForm.register("es_principal")}
                          />
                          <Label
                            htmlFor="nuevo-principal"
                            className="text-sm text-foreground-secondary"
                          >
                            Proveedor principal de este ingrediente
                          </Label>
                        </div>

                        <div className="flex flex-col gap-1">
                          <Label className="text-foreground-secondary">
                            Notas{" "}
                            <span className="text-xs font-normal">
                              (opcional)
                            </span>
                          </Label>
                          <textarea
                            rows={2}
                            maxLength={500}
                            className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none"
                            style={{
                              background: "var(--background-raised)",
                              borderColor: "var(--border-default)",
                              color: "var(--foreground)",
                            }}
                            {...nuevoForm.register("notes")}
                          />
                        </div>
                      </form>
                    )}

                    {/* ── Tab B: Buscar existente ──────────────────────── */}
                    {addTab === "existente" && (
                      <div className="flex flex-col gap-4">
                        {/* Search */}
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-foreground-secondary">
                            Buscar ingrediente
                          </Label>
                          <div className="relative">
                            <Search
                              size={13}
                              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                              style={{ color: "var(--foreground-muted)" }}
                            />
                            <Input
                              variant="secondary"
                              className="w-full pl-8"
                              placeholder="Nombre del ingrediente..."
                              value={ingSearchQuery}
                              onChange={(e) => {
                                setIngSearchQuery(e.target.value);
                                if (selectedExistingIng)
                                  setSelectedExistingIng(null);
                              }}
                            />
                          </div>
                        </div>

                        {/* Results */}
                        {ingSearchLoading && (
                          <div className="flex justify-center py-4">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                          </div>
                        )}
                        {!ingSearchLoading &&
                          ingSearchQuery.length > 0 &&
                          ingSearchResults.length === 0 && (
                            <p
                              className="text-center text-sm"
                              style={{ color: "var(--foreground-muted)" }}
                            >
                              No se encontraron ingredientes disponibles
                            </p>
                          )}
                        {ingSearchResults.length > 0 && !selectedExistingIng && (
                          <div
                            className="max-h-44 overflow-y-auto rounded-lg border"
                            style={{ borderColor: "var(--border-default)" }}
                          >
                            {ingSearchResults.map((ing) => (
                              <button
                                key={ing.id}
                                type="button"
                                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-raised"
                                onClick={() => {
                                  setSelectedExistingIng(ing);
                                  setIngSearchQuery(ing.nombre);
                                }}
                              >
                                <span className="truncate font-medium text-foreground">
                                  {ing.nombre}
                                </span>
                                <div
                                  className="flex shrink-0 items-center gap-3 text-xs"
                                  style={{ color: "var(--foreground-muted)" }}
                                >
                                  <span>{ing.unit}</span>
                                  <span>
                                    Stock: {ing.stock} {ing.unit}
                                  </span>
                                  <span>{formatCost(ing.unit_cost)}/ud</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Selected ingredient + purchase fields */}
                        {selectedExistingIng && (
                          <>
                            <div
                              className="flex items-center justify-between rounded-lg border px-3 py-2.5"
                              style={{
                                background: "var(--accent-soft)",
                                borderColor: "var(--accent)",
                              }}
                            >
                              <div>
                                <p className="font-medium text-foreground">
                                  {selectedExistingIng.nombre}
                                </p>
                                <p
                                  className="text-xs"
                                  style={{ color: "var(--foreground-muted)" }}
                                >
                                  {selectedExistingIng.unit} · Stock:{" "}
                                  {selectedExistingIng.stock}{" "}
                                  {selectedExistingIng.unit}
                                </p>
                              </div>
                              <button
                                type="button"
                                className="text-xs underline"
                                style={{ color: "var(--foreground-muted)" }}
                                onClick={() => {
                                  setSelectedExistingIng(null);
                                  setIngSearchQuery("");
                                }}
                              >
                                Cambiar
                              </button>
                            </div>

                            <Separator label="Datos de compra" />

                            <div className="flex flex-col gap-1">
                              <Label className="text-xs text-foreground-secondary">
                                Unidad de compra
                              </Label>
                              <input
                                type="text"
                                value={exPurchaseUnit}
                                onChange={(e) =>
                                  setExPurchaseUnit(e.target.value)
                                }
                                placeholder="paquete, caja, bolsa..."
                                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                                style={{
                                  background: "var(--background-raised)",
                                  borderColor: "var(--border-default)",
                                  color: "var(--foreground)",
                                }}
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div className="flex flex-col gap-1">
                                <Label className="text-xs text-foreground-secondary">
                                  Cantidad por {exPurchaseUnit || "unidad"}
                                </Label>
                                <div className="flex items-center gap-2">
                                  <NumberInput
                                    min={0.001}
                                    step={0.001}
                                    value={exPurchaseQty}
                                    onChange={setExPurchaseQty}
                                  />
                                  <span
                                    className="shrink-0 text-xs"
                                    style={{ color: "var(--foreground-muted)" }}
                                  >
                                    {selectedExistingIng.unit}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col gap-1">
                                <Label className="text-xs text-foreground-secondary">
                                  Costo por {exPurchaseUnit || "unidad"} (ARS)
                                </Label>
                                <NumberInput
                                  prefix="$"
                                  step={0.01}
                                  value={exCostPerPurchase}
                                  onChange={setExCostPerPurchase}
                                />
                              </div>
                            </div>

                            {/* Preview */}
                            <div
                              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                              style={{
                                background: "var(--accent-soft)",
                                color: "var(--accent)",
                              }}
                            >
                              <span>
                                Costo por {selectedExistingIng.unit}:
                              </span>
                              <span className="font-semibold">
                                {exPurchaseQtyNum > 0
                                  ? formatCost(exCostPreview)
                                  : "—"}
                              </span>
                            </div>

                            <Separator label="Stock inicial" />

                            <div className="flex flex-col gap-1">
                              <Label className="text-xs text-foreground-secondary">
                                Stock inicial a agregar (en{" "}
                                {selectedExistingIng.unit})
                              </Label>
                              <input
                                type="number"
                                min={0}
                                step={0.001}
                                placeholder="0 — dejar vacío para no modificar el stock"
                                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                                style={{
                                  background: "var(--background-raised)",
                                  borderColor: "var(--border-default)",
                                  color: "var(--foreground)",
                                }}
                                value={exInitialStock}
                                onChange={(e) =>
                                  setExInitialStock(e.target.value)
                                }
                              />
                            </div>

                            <div className="flex items-center gap-2">
                              <input
                                id="ex-principal"
                                type="checkbox"
                                className="size-4 accent-accent"
                                checked={exEsPrincipal}
                                onChange={(e) =>
                                  setExEsPrincipal(e.target.checked)
                                }
                              />
                              <Label
                                htmlFor="ex-principal"
                                className="text-sm text-foreground-secondary"
                              >
                                Proveedor principal de este ingrediente
                              </Label>
                            </div>

                            <div className="flex flex-col gap-1">
                              <Label className="text-foreground-secondary">
                                Notas{" "}
                                <span className="text-xs font-normal">
                                  (opcional)
                                </span>
                              </Label>
                              <textarea
                                rows={2}
                                maxLength={500}
                                className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none"
                                style={{
                                  background: "var(--background-raised)",
                                  borderColor: "var(--border-default)",
                                  color: "var(--foreground)",
                                }}
                                value={exNotes}
                                onChange={(e) => setExNotes(e.target.value)}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </Modal.Body>

                  <Modal.Footer className="flex shrink-0 justify-end gap-2 border-t border-border-subtle px-5 py-4">
                    <Button
                      variant="secondary"
                      onPress={() => ingredientModalState.close()}
                    >
                      Cancelar
                    </Button>
                    {addTab === "nuevo" ? (
                      <Button
                        type="submit"
                        form="nuevo-ing-form"
                        variant="primary"
                        className="bg-accent text-accent-text hover:bg-accent-hover"
                        isDisabled={nuevoForm.formState.isSubmitting}
                      >
                        Crear y vincular
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        className="bg-accent text-accent-text hover:bg-accent-hover"
                        isDisabled={!selectedExistingIng}
                        onPress={() => void submitExistente()}
                      >
                        Vincular ingrediente
                      </Button>
                    )}
                  </Modal.Footer>
                </>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>

      {/* ── Order modal ─────────────────────────────────────────────────────── */}
      <Modal.Root state={orderModalState}>
        <Modal.Backdrop
          className="z-200 flex items-center justify-center p-3 sm:p-6"
          variant="blur"
        >
          <Modal.Container placement="center" size="lg">
            <Modal.Dialog className="flex max-h-[min(90dvh,700px)] w-[min(100vw-1.5rem,42rem)] max-w-none flex-col overflow-hidden border border-border-subtle bg-surface/95 shadow-lg outline-none backdrop-blur-sm">
              <Modal.Header className="shrink-0 border-b border-border-subtle px-5 pb-3 pt-5">
                <div className="flex items-start justify-between gap-3">
                  <Modal.Heading className="min-w-0 flex-1 pr-2">
                    {selectedOrder
                      ? "Editar orden de compra"
                      : "Nueva orden de compra"}
                  </Modal.Heading>
                  <Modal.CloseTrigger aria-label="Cerrar" className="shrink-0" />
                </div>
              </Modal.Header>
              <Modal.Body className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <div className="flex flex-col gap-5">
                  {/* Add item row */}
                  <div
                    className="rounded-lg border p-4"
                    style={{
                      background: "var(--background-raised)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    <p className="mb-3 text-sm font-medium text-foreground">
                      Agregar ítem
                    </p>
                    <div className="flex flex-col gap-3">
                      {/* Ingredient dropdown — shows supplier's linked ingredients */}
                      <div className="relative">
                        <Search
                          size={13}
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted"
                        />
                        <Input
                          variant="secondary"
                          className="w-full pl-8"
                          placeholder="Buscar entre ingredientes del proveedor..."
                          value={orderItemSearch}
                          onChange={(e) => {
                            setOrderItemSearch(e.target.value);
                            setOrderItemDropdownOpen(true);
                          }}
                          onFocus={() => setOrderItemDropdownOpen(true)}
                          onBlur={() =>
                            setTimeout(
                              () => setOrderItemDropdownOpen(false),
                              150,
                            )
                          }
                        />
                        {orderItemDropdownOpen &&
                          filteredOrderIngredients.length > 0 && (
                            <div
                              className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-lg border shadow-lg"
                              style={{
                                background: "var(--background-surface)",
                                borderColor: "var(--border-default)",
                              }}
                            >
                              {filteredOrderIngredients
                                .slice(0, 10)
                                .map((si) => (
                                  <button
                                    type="button"
                                    key={si.id}
                                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-sm transition-colors hover:bg-raised"
                                    onMouseDown={() => {
                                      orderItemForm.setValue(
                                        "ingredient_id",
                                        si.ingredient_id,
                                        { shouldValidate: true },
                                      );
                                      orderItemForm.setValue(
                                        "unit_price",
                                        si.cost_per_purchase,
                                      );
                                      setOrderItemSearch(si.ingredient_nombre);
                                      setOrderItemDropdownOpen(false);
                                    }}
                                  >
                                    <span className="truncate text-foreground">
                                      {si.ingredient_nombre}
                                    </span>
                                    <span
                                      className="shrink-0 text-xs"
                                      style={{ color: "var(--foreground-muted)" }}
                                    >
                                      {si.purchase_unit} ·{" "}
                                      {formatCost(si.cost_per_purchase)}
                                    </span>
                                  </button>
                                ))}
                            </div>
                          )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-foreground-secondary">
                            Cantidad
                          </Label>
                          <input
                            type="number"
                            min={0}
                            step={0.001}
                            className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                            style={{
                              background: "var(--background-surface)",
                              borderColor: "var(--border-default)",
                              color: "var(--foreground)",
                            }}
                            {...orderItemForm.register("quantity", {
                              valueAsNumber: true,
                            })}
                          />
                          {orderItemForm.formState.errors.quantity
                            ?.message && (
                            <Text className="text-xs text-danger">
                              {
                                orderItemForm.formState.errors.quantity
                                  .message
                              }
                            </Text>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-foreground-secondary">
                            Precio unitario (ARS)
                          </Label>
                          <div className="relative">
                            <span
                              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm"
                              style={{ color: "var(--foreground-muted)" }}
                            >
                              $
                            </span>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              className="w-full rounded-lg border py-2 pl-7 pr-3 text-sm outline-none"
                              style={{
                                background: "var(--background-surface)",
                                borderColor: "var(--border-default)",
                                color: "var(--foreground)",
                              }}
                              {...orderItemForm.register("unit_price", {
                                valueAsNumber: true,
                              })}
                            />
                          </div>
                        </div>
                      </div>

                      <Button
                        variant="secondary"
                        size="sm"
                        onPress={addOrderItem}
                      >
                        <Plus size={13} />
                        Agregar ítem
                      </Button>
                    </div>
                  </div>

                  {/* Items list */}
                  {orderItems.length > 0 && (
                    <div
                      className="rounded-lg border"
                      style={{ borderColor: "var(--border-subtle)" }}
                    >
                      <table className="w-full text-sm">
                        <thead>
                          <tr
                            style={{
                              borderBottom: "1px solid var(--border-subtle)",
                            }}
                          >
                            <th
                              className="py-2 pl-4 pr-3 text-left text-xs font-medium"
                              style={{ color: "var(--foreground-muted)" }}
                            >
                              Ingrediente
                            </th>
                            <th
                              className="px-3 py-2 text-right text-xs font-medium"
                              style={{ color: "var(--foreground-muted)" }}
                            >
                              Cant.
                            </th>
                            <th
                              className="px-3 py-2 text-right text-xs font-medium"
                              style={{ color: "var(--foreground-muted)" }}
                            >
                              Precio
                            </th>
                            <th
                              className="px-3 py-2 text-right text-xs font-medium"
                              style={{ color: "var(--foreground-muted)" }}
                            >
                              Subtotal
                            </th>
                            <th className="w-8 py-2 pl-3 pr-4" />
                          </tr>
                        </thead>
                        <tbody>
                          {orderItems.map((item, idx) => {
                            const si = s.supplier_ingredients.find(
                              (x) => x.ingredient_id === item.ingredient_id,
                            );
                            return (
                              <tr
                                key={idx}
                                style={{
                                  borderBottom:
                                    idx < orderItems.length - 1
                                      ? "1px solid var(--border-subtle)"
                                      : undefined,
                                }}
                              >
                                <td className="py-2 pl-4 pr-3 text-foreground">
                                  {si?.ingredient_nombre ?? item.ingredient_id}
                                </td>
                                <td
                                  className="px-3 py-2 text-right"
                                  style={{ color: "var(--foreground-secondary)" }}
                                >
                                  {item.quantity}{" "}
                                  {si ? si.purchase_unit : ""}
                                </td>
                                <td
                                  className="px-3 py-2 text-right"
                                  style={{ color: "var(--foreground-secondary)" }}
                                >
                                  {formatCost(item.unit_price)}
                                </td>
                                <td className="px-3 py-2 text-right font-medium text-foreground">
                                  {formatCost(item.quantity * item.unit_price)}
                                </td>
                                <td className="py-2 pl-3 pr-4 text-right">
                                  <button
                                    type="button"
                                    onClick={() => removeOrderItem(idx)}
                                    className="rounded p-0.5 hover:bg-danger-soft"
                                    style={{ color: "var(--danger)" }}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <div
                        className="flex items-center justify-end gap-2 border-t px-4 py-2"
                        style={{ borderColor: "var(--border-subtle)" }}
                      >
                        <span
                          className="text-sm"
                          style={{ color: "var(--foreground-muted)" }}
                        >
                          Total:
                        </span>
                        <span className="font-bold text-foreground">
                          {formatCost(orderTotal)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </Modal.Body>
              <Modal.Footer className="flex shrink-0 justify-end gap-2 border-t border-border-subtle px-5 py-4">
                <Button
                  variant="secondary"
                  onPress={() => {
                    orderModalState.close();
                    setSelectedOrder(null);
                    setOrderItems([]);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  variant="secondary"
                  onPress={() => void submitOrder()}
                  isDisabled={orderItems.length === 0}
                >
                  Guardar borrador
                </Button>
                <Button
                  variant="primary"
                  className="bg-accent text-accent-text hover:bg-accent-hover"
                  onPress={() => void submitOrder("sent")}
                  isDisabled={orderItems.length === 0}
                >
                  Guardar y enviar
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </div>
  );
}
