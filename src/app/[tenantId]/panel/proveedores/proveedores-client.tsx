"use client";

import {
  BadgeLabel,
  BadgeRoot,
  Button,
  Input,
  Label,
  Modal,
  SwitchControl,
  SwitchRoot,
  SwitchThumb,
  Text,
  toast,
  useOverlayState,
} from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Eye,
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
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { PanelPageHeader } from "@/components/panel/PanelPageHeader";
import { DialogSuccess, DialogWarning } from "@/components/ui";
import type { Supplier } from "@/types/supplier";

// ─── Schema ──────────────────────────────────────────────────────────────────

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

const defaultValues: SupplierFormValues = {
  name: "",
  contact_name: "",
  email: "",
  phone: "",
  whatsapp: "",
  address: "",
  notes: "",
};

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── SupplierCard ─────────────────────────────────────────────────────────────

function SupplierCard({
  supplier: s,
  isAdmin,
  tenantId,
  onEdit,
  onDeactivate,
  onReactivate,
}: {
  supplier: Supplier;
  isAdmin: boolean;
  tenantId: string;
  onEdit: (s: Supplier) => void;
  onDeactivate: (s: Supplier) => void;
  onReactivate: (s: Supplier) => void;
}) {
  return (
    <div
      className={`flex flex-col rounded-xl border transition-opacity ${s.is_active ? "border-border-subtle" : "border-dashed border-border-default opacity-60"}`}
      style={{
        background: "var(--nuba-glass-surface)",
        backdropFilter: "blur(var(--nuba-glass-blur-sm))",
      }}
    >
      {/* Header */}
      <div
        className="flex items-start gap-3 border-b px-4 py-3"
        style={{ borderColor: "var(--nuba-border-subtle)" }}
      >
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
          style={{
            background: "var(--nuba-accent-soft)",
            color: "var(--nuba-accent)",
          }}
        >
          {supplierInitials(s.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {s.name}
          </p>
          {s.contact_name && (
            <p className="truncate text-xs text-foreground-muted">
              {s.contact_name}
            </p>
          )}
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
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

      {/* Body */}
      <div className="flex flex-1 flex-col gap-1.5 px-4 py-3">
        {s.email && (
          <a
            href={`mailto:${s.email}`}
            className="flex items-center gap-2 truncate text-xs transition-colors hover:text-accent"
            style={{ color: "var(--nuba-fg-secondary)" }}
          >
            <Mail size={12} className="shrink-0 text-foreground-muted" />
            {s.email}
          </a>
        )}
        {s.phone && (
          <a
            href={`tel:${s.phone}`}
            className="flex items-center gap-2 text-xs transition-colors hover:text-accent"
            style={{ color: "var(--nuba-fg-secondary)" }}
          >
            <Phone size={12} className="shrink-0 text-foreground-muted" />
            {s.phone}
          </a>
        )}
        {s.whatsapp && (
          <a
            href={`https://wa.me/${waDigits(s.whatsapp)}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-xs transition-colors hover:text-accent"
            style={{ color: "var(--nuba-fg-secondary)" }}
          >
            <MessageCircle size={12} className="shrink-0 text-foreground-muted" />
            {s.whatsapp}
          </a>
        )}
        {s.address && (
          <p
            className="flex items-start gap-2 text-xs"
            style={{ color: "var(--nuba-fg-muted)" }}
          >
            <MapPin size={12} className="mt-0.5 shrink-0" />
            <span className="line-clamp-2">{s.address}</span>
          </p>
        )}

        {/* Counts */}
        <div className="mt-1 flex flex-wrap gap-2">
          <span
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
            style={{
              background: "var(--nuba-raised)",
              color: "var(--nuba-fg-secondary)",
            }}
          >
            <Package size={10} />
            {s.product_count ?? 0} productos
          </span>
          <span
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
            style={{
              background: "var(--nuba-raised)",
              color: "var(--nuba-fg-secondary)",
            }}
          >
            <Leaf size={10} />
            {s.ingredient_count ?? 0} ingredientes
          </span>
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex flex-wrap items-center gap-1.5 border-t px-4 py-3"
        style={{ borderColor: "var(--nuba-border-subtle)" }}
      >
        <Link href={`/${tenantId}/panel/proveedores/${s.id}`}>
          <Button variant="secondary" size="sm" className="h-7 text-xs">
            <Eye size={13} />
            Ver detalle
          </Button>
        </Link>
        {isAdmin && (
          <>
            <Button
              variant="secondary"
              size="sm"
              className="h-7 text-xs"
              onPress={() => onEdit(s)}
            >
              <Pencil size={13} />
              Editar
            </Button>
            {s.is_active ? (
              <Button
                variant="secondary"
                size="sm"
                className="h-7 text-xs"
                onPress={() => onDeactivate(s)}
              >
                <PowerOff size={13} />
                Desactivar
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                className="h-7 text-xs"
                onPress={() => onReactivate(s)}
              >
                <Power size={13} />
                Reactivar
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProveedoresClient({
  tenantId,
  isAdmin,
}: {
  tenantId: string;
  isAdmin: boolean;
}) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  // Modal
  const modalState = useOverlayState();
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Feedback
  const [successOpen, setSuccessOpen] = useState(false);
  const [successCopy, setSuccessCopy] = useState({ title: "", description: "" });
  const [dupOpen, setDupOpen] = useState(false);
  const [dupMsg, setDupMsg] = useState("");

  // Deactivate
  const deactivateDialog = useOverlayState();
  const [pendingDeactivate, setPendingDeactivate] = useState<Supplier | null>(null);

  // Reactivate
  const reactivateDialog = useOverlayState();
  const [pendingReactivate, setPendingReactivate] = useState<Supplier | null>(null);

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues,
  });
  const submitting = form.formState.isSubmitting;

  // ─── Debounce search ────────────────────────────────────────────────────────

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // ─── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (debouncedSearch) sp.set("search", debouncedSearch);
      if (!showInactive) sp.set("isActive", "true");
      const res = await fetch(
        `/api/${tenantId}/proveedores${sp.size ? `?${sp.toString()}` : ""}`,
        { cache: "no-store", credentials: "include" },
      );
      if (!res.ok) {
        toast.danger("No se pudieron cargar los proveedores");
        setSuppliers([]);
        return;
      }
      const data = (await res.json()) as Supplier[];
      setSuppliers(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [tenantId, debouncedSearch, showInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  // ─── Modal helpers ───────────────────────────────────────────────────────────

  function openCreate() {
    setEditingSupplier(null);
    form.reset(defaultValues);
    modalState.open();
  }

  function openEdit(s: Supplier) {
    setEditingSupplier(s);
    form.reset(supplierToForm(s));
    modalState.open();
  }

  // ─── Submit ──────────────────────────────────────────────────────────────────

  const submitSupplier = form.handleSubmit(async (values) => {
    const isCreating = !editingSupplier;
    const url = isCreating
      ? `/api/${tenantId}/proveedores`
      : `/api/${tenantId}/proveedores/${editingSupplier!.id}`;

    const body = {
      name: values.name.trim(),
      contact_name: values.contact_name.trim() || null,
      email: values.email.trim() || null,
      phone: values.phone.trim() || null,
      whatsapp: values.whatsapp.trim() || null,
      address: values.address.trim() || null,
      notes: values.notes.trim() || null,
    };

    const res = await fetch(url, {
      method: isCreating ? "POST" : "PUT",
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

    modalState.close();
    setSuccessCopy({
      title: isCreating ? "Proveedor creado" : "Proveedor actualizado",
      description: isCreating
        ? "El proveedor está disponible para vincular productos e ingredientes."
        : "Los cambios se guardaron correctamente.",
    });
    setSuccessOpen(true);
    await load();
  });

  // ─── Deactivate ──────────────────────────────────────────────────────────────

  async function confirmDeactivate() {
    if (!pendingDeactivate) return;
    deactivateDialog.close();
    const res = await fetch(
      `/api/${tenantId}/proveedores/${pendingDeactivate.id}/desactivar`,
      { method: "PATCH", credentials: "include" },
    );
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.danger(j?.error ?? "Error al desactivar el proveedor");
      return;
    }
    setSuccessCopy({
      title: "Proveedor desactivado",
      description: `"${pendingDeactivate.name}" ya no aparecerá en los listados activos.`,
    });
    setSuccessOpen(true);
    setPendingDeactivate(null);
    await load();
  }

  // ─── Reactivate ──────────────────────────────────────────────────────────────

  async function confirmReactivate() {
    if (!pendingReactivate) return;
    reactivateDialog.close();
    const res = await fetch(
      `/api/${tenantId}/proveedores/${pendingReactivate.id}/reactivar`,
      { method: "PATCH", credentials: "include" },
    );
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.danger(j?.error ?? "Error al reactivar el proveedor");
      return;
    }
    setSuccessCopy({
      title: "Proveedor reactivado",
      description: `"${pendingReactivate.name}" volvió a estar activo.`,
    });
    setSuccessOpen(true);
    setPendingReactivate(null);
    await load();
  }

  // ─── Active count ────────────────────────────────────────────────────────────

  const activeCount = useMemo(
    () => suppliers.filter((s) => s.is_active).length,
    [suppliers],
  );

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
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
        onClose={() => {
          deactivateDialog.close();
          setPendingDeactivate(null);
        }}
        title="¿Desactivar proveedor?"
        description={`"${pendingDeactivate?.name}" dejará de aparecer en los listados activos. Podés reactivarlo en cualquier momento.`}
        confirmLabel="Sí, desactivar"
        cancelLabel="Cancelar"
        onConfirm={() => void confirmDeactivate()}
      />
      <DialogWarning
        isOpen={reactivateDialog.isOpen}
        onClose={() => {
          reactivateDialog.close();
          setPendingReactivate(null);
        }}
        title="¿Reactivar proveedor?"
        description={`"${pendingReactivate?.name}" volverá a aparecer en los listados activos.`}
        confirmLabel="Sí, reactivar"
        cancelLabel="Cancelar"
        onConfirm={() => void confirmReactivate()}
      />

      <PanelPageHeader
        title="Proveedores"
        end={
          <div className="flex flex-wrap items-center gap-3">
            <BadgeRoot variant="soft">
              <BadgeLabel>
                {loading ? "…" : `${activeCount} activos`}
              </BadgeLabel>
            </BadgeRoot>
            {isAdmin && (
              <Button
                variant="primary"
                className="bg-accent text-accent-text hover:bg-accent-hover"
                onPress={openCreate}
              >
                <Plus size={16} />
                Nuevo proveedor
              </Button>
            )}
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted"
          />
          <Input
            variant="secondary"
            className="w-full pl-8"
            placeholder="Buscar por nombre o contacto"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2">
          <SwitchRoot
            isSelected={showInactive}
            onChange={setShowInactive}
            size="sm"
          >
            <SwitchControl>
              <SwitchThumb />
            </SwitchControl>
          </SwitchRoot>
          <Text className="text-sm text-foreground-secondary">
            Mostrar inactivos
          </Text>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-xl border border-border-subtle p-4"
              style={{ background: "var(--nuba-surface)" }}
            >
              <div className="flex items-center gap-3">
                <div className="size-9 animate-pulse rounded-full bg-raised" />
                <div className="flex flex-col gap-1.5">
                  <div className="h-4 w-32 animate-pulse rounded bg-raised" />
                  <div className="h-3 w-20 animate-pulse rounded bg-raised" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="h-3 w-full animate-pulse rounded bg-raised" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-raised" />
              </div>
            </div>
          ))}
        </div>
      ) : suppliers.length === 0 ? (
        <div
          className="flex flex-col items-center gap-4 rounded-xl border border-border-subtle py-20 text-center"
          style={{ background: "var(--nuba-surface)" }}
        >
          <Truck
            size={48}
            strokeWidth={1.25}
            style={{ color: "var(--nuba-fg-muted)" }}
          />
          <Text className="text-foreground-secondary">
            No hay proveedores registrados.
          </Text>
          {isAdmin && (
            <Button
              variant="primary"
              className="bg-accent text-accent-text hover:bg-accent-hover"
              onPress={openCreate}
            >
              Crear el primero
            </Button>
          )}
        </div>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
        >
          {suppliers.map((s) => (
            <SupplierCard
              key={s.id}
              supplier={s}
              isAdmin={isAdmin}
              tenantId={tenantId}
              onEdit={openEdit}
              onDeactivate={(sup) => {
                setPendingDeactivate(sup);
                deactivateDialog.open();
              }}
              onReactivate={(sup) => {
                setPendingReactivate(sup);
                reactivateDialog.open();
              }}
            />
          ))}
        </div>
      )}

      {/* Modal crear / editar */}
      <Modal.Root state={modalState}>
        <Modal.Backdrop
          className="z-200 flex items-center justify-center p-3 sm:p-6"
          variant="blur"
        >
          <Modal.Container placement="center" size="lg">
            <Modal.Dialog className="flex max-h-[min(90dvh,780px)] w-[min(100vw-1.5rem,30rem)] max-w-none flex-col overflow-hidden border border-border-subtle bg-surface/95 shadow-lg outline-none backdrop-blur-sm sm:w-[min(100vw-3rem,30rem)]">
              <Modal.Header className="shrink-0 border-b border-border-subtle px-5 pb-3 pt-5 sm:px-6">
                <div className="flex items-start justify-between gap-3">
                  <Modal.Heading className="min-w-0 flex-1 pr-2">
                    {editingSupplier ? "Editar proveedor" : "Nuevo proveedor"}
                  </Modal.Heading>
                  <Modal.CloseTrigger aria-label="Cerrar" className="shrink-0" />
                </div>
              </Modal.Header>

              <Modal.Body className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 sm:px-6 sm:py-5">
                <form
                  id="supplier-form"
                  className="flex min-w-0 flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitSupplier();
                  }}
                >
                  {/* Nombre */}
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="s-name" className="flex items-baseline gap-1">
                      Nombre
                      <span className="text-xs font-normal text-danger">
                        (obligatorio)
                      </span>
                    </Label>
                    <Input
                      id="s-name"
                      variant="secondary"
                      className="w-full"
                      {...form.register("name")}
                    />
                    {form.formState.errors.name?.message && (
                      <Text className="text-xs text-danger">
                        {form.formState.errors.name.message}
                      </Text>
                    )}
                  </div>

                  {/* Nombre de contacto */}
                  <div className="flex flex-col gap-1">
                    <Label
                      htmlFor="s-contact"
                      className="text-foreground-secondary"
                    >
                      Nombre de contacto{" "}
                      <span className="text-xs font-normal">(opcional)</span>
                    </Label>
                    <Input
                      id="s-contact"
                      variant="secondary"
                      className="w-full"
                      {...form.register("contact_name")}
                    />
                  </div>

                  {/* Email */}
                  <div className="flex flex-col gap-1">
                    <Label
                      htmlFor="s-email"
                      className="text-foreground-secondary"
                    >
                      Email{" "}
                      <span className="text-xs font-normal">(opcional)</span>
                    </Label>
                    <Input
                      id="s-email"
                      type="email"
                      variant="secondary"
                      className="w-full"
                      {...form.register("email")}
                    />
                    {form.formState.errors.email?.message && (
                      <Text className="text-xs text-danger">
                        {form.formState.errors.email.message}
                      </Text>
                    )}
                  </div>

                  {/* Teléfono + WhatsApp */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <Label
                        htmlFor="s-phone"
                        className="text-foreground-secondary"
                      >
                        Teléfono
                      </Label>
                      <Input
                        id="s-phone"
                        variant="secondary"
                        className="w-full"
                        {...form.register("phone")}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label
                        htmlFor="s-wa"
                        className="text-foreground-secondary"
                      >
                        WhatsApp
                      </Label>
                      <Input
                        id="s-wa"
                        variant="secondary"
                        className="w-full"
                        {...form.register("whatsapp")}
                      />
                    </div>
                  </div>

                  {/* Dirección */}
                  <div className="flex flex-col gap-1">
                    <Label
                      htmlFor="s-address"
                      className="text-foreground-secondary"
                    >
                      Dirección{" "}
                      <span className="text-xs font-normal">(opcional)</span>
                    </Label>
                    <textarea
                      id="s-address"
                      rows={2}
                      className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none"
                      style={{
                        background: "var(--nuba-raised)",
                        borderColor: "var(--nuba-border-default)",
                        color: "var(--nuba-fg)",
                      }}
                      {...form.register("address")}
                    />
                  </div>

                  {/* Notas */}
                  <div className="flex flex-col gap-1">
                    <Label
                      htmlFor="s-notes"
                      className="text-foreground-secondary"
                    >
                      Notas{" "}
                      <span className="text-xs font-normal">(opcional)</span>
                    </Label>
                    <textarea
                      id="s-notes"
                      rows={3}
                      maxLength={1000}
                      className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none"
                      style={{
                        background: "var(--nuba-raised)",
                        borderColor: "var(--nuba-border-default)",
                        color: "var(--nuba-fg)",
                      }}
                      {...form.register("notes")}
                    />
                    {form.formState.errors.notes?.message && (
                      <Text className="text-xs text-danger">
                        {form.formState.errors.notes.message}
                      </Text>
                    )}
                  </div>
                </form>
              </Modal.Body>

              <Modal.Footer className="flex shrink-0 justify-end gap-2 border-t border-border-subtle px-5 py-4 sm:px-6">
                <Button
                  variant="secondary"
                  onPress={() => modalState.close()}
                  isDisabled={submitting}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  form="supplier-form"
                  variant="primary"
                  className="bg-accent text-accent-text hover:bg-accent-hover"
                  isDisabled={submitting}
                >
                  {editingSupplier ? "Guardar cambios" : "Crear proveedor"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </div>
  );
}
