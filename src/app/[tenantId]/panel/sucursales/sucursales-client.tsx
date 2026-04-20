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
  Building2,
  Mail,
  MapPin,
  Navigation2,
  Pencil,
  Phone,
  Plus,
  Power,
  PowerOff,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { PanelPageHeader } from "@/components/panel/PanelPageHeader";
import { DialogSuccess, DialogWarning, GeoSelector } from "@/components/ui";
import type { Branch } from "@/types/branch";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const branchFormSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(255),
  address: z.string().min(1, "La dirección es requerida"),
  city: z.string().max(100),
  province: z.string().max(100),
  phone: z.string().max(50),
  email: z
    .string()
    .max(255)
    .superRefine((s, ctx) => {
      if (s !== "" && !z.string().email().safeParse(s).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Email inválido",
        });
      }
    }),
  is_active: z.boolean(),
});

type BranchFormValues = z.infer<typeof branchFormSchema>;

const defaultFormValues: BranchFormValues = {
  name: "",
  address: "",
  city: "",
  province: "",
  phone: "",
  email: "",
  is_active: true,
};

function branchToFormValues(b: Branch): BranchFormValues {
  return {
    name: b.name,
    address: b.address,
    city: b.city ?? "",
    province: b.province ?? "",
    phone: b.phone ?? "",
    email: b.email ?? "",
    is_active: b.is_active,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function SucursalesClient({
  tenantId,
  isAdmin,
}: {
  tenantId: string;
  isAdmin: boolean;
}) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal crear / editar
  const modalState = useOverlayState();
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  // Dialogs de feedback
  const [successOpen, setSuccessOpen] = useState(false);
  const [successCopy, setSuccessCopy] = useState({ title: "", description: "" });

  const [dupOpen, setDupOpen] = useState(false);
  const [dupMsg, setDupMsg] = useState("");

  // Desactivar
  const deactivateDialog = useOverlayState();
  const [pendingDeactivate, setPendingDeactivate] = useState<Branch | null>(null);
  const [deactivateErrOpen, setDeactivateErrOpen] = useState(false);
  const [deactivateErrMsg, setDeactivateErrMsg] = useState("");

  // Reactivar
  const reactivateDialog = useOverlayState();
  const [pendingReactivate, setPendingReactivate] = useState<Branch | null>(null);

  const form = useForm<BranchFormValues>({
    resolver: zodResolver(branchFormSchema),
    defaultValues: defaultFormValues,
  });
  const submitting = form.formState.isSubmitting;

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/${tenantId}/sucursales`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) {
        toast.danger("No se pudieron cargar las sucursales");
        setBranches([]);
        return;
      }
      const data = (await res.json()) as Branch[];
      setBranches(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  // ---------------------------------------------------------------------------
  // Modal helpers
  // ---------------------------------------------------------------------------
  function openCreate() {
    setEditingBranch(null);
    form.reset(defaultFormValues);
    modalState.open();
  }

  function openEdit(b: Branch) {
    setEditingBranch(b);
    form.reset(branchToFormValues(b));
    modalState.open();
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------
  const submitBranch = form.handleSubmit(async (values) => {
    const isCreating = !editingBranch;
    const url = isCreating
      ? `/api/${tenantId}/sucursales`
      : `/api/${tenantId}/sucursales/${editingBranch!.id}`;

    const body: Record<string, unknown> = {
      name: values.name.trim(),
      address: values.address.trim(),
      city: values.city.trim() || null,
      province: values.province.trim() || null,
      phone: values.phone.trim() || null,
      email: values.email.trim() || null,
    };
    if (!isCreating) {
      body.is_active = values.is_active;
    }

    const res = await fetch(url, {
      method: isCreating ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => null)) as { error?: string } | null;

    if (res.status === 409) {
      setDupMsg(j?.error ?? "Ya existe una sucursal con ese nombre");
      setDupOpen(true);
      return;
    }
    if (!res.ok) {
      toast.danger(j?.error ?? "Error al guardar la sucursal");
      return;
    }

    modalState.close();
    setSuccessCopy({
      title: isCreating ? "Sucursal creada" : "Sucursal actualizada",
      description: isCreating
        ? "La nueva sucursal está disponible para asignar usuarios."
        : "Los cambios se guardaron correctamente.",
    });
    setSuccessOpen(true);
    await load();
  });

  // ---------------------------------------------------------------------------
  // Desactivar
  // ---------------------------------------------------------------------------
  async function confirmDeactivate() {
    if (!pendingDeactivate) return;
    const res = await fetch(
      `/api/${tenantId}/sucursales/${pendingDeactivate.id}/desactivar`,
      { method: "PATCH", credentials: "include" },
    );
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    if (res.status === 409) {
      throw new Error(j?.error ?? "No se puede desactivar");
    }
    if (!res.ok) {
      throw new Error(j?.error ?? "Error al desactivar");
    }
    setSuccessCopy({
      title: "Sucursal desactivada",
      description: `${pendingDeactivate.name} fue desactivada correctamente.`,
    });
    setSuccessOpen(true);
    setPendingDeactivate(null);
    await load();
  }

  // ---------------------------------------------------------------------------
  // Reactivar
  // ---------------------------------------------------------------------------
  async function confirmReactivate() {
    if (!pendingReactivate) return;
    const res = await fetch(
      `/api/${tenantId}/sucursales/${pendingReactivate.id}/reactivar`,
      { method: "PATCH", credentials: "include" },
    );
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      throw new Error(j?.error ?? "Error al reactivar");
    }
    setSuccessCopy({
      title: "Sucursal reactivada",
      description: `${pendingReactivate.name} volvió a estar activa.`,
    });
    setSuccessOpen(true);
    setPendingReactivate(null);
    await load();
  }

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------
  const activeCount = branches.filter((b) => b.is_active).length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-6">
      {/* Feedback */}
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
        isOpen={deactivateErrOpen}
        onClose={() => setDeactivateErrOpen(false)}
        title="No se pudo desactivar"
        description={deactivateErrMsg}
        confirmLabel="Entendido"
        cancelLabel="Cerrar"
        onConfirm={() => setDeactivateErrOpen(false)}
      />

      <DialogWarning
        isOpen={deactivateDialog.isOpen}
        onClose={() => {
          deactivateDialog.close();
          setPendingDeactivate(null);
        }}
        title="Eliminar sucursal?"
        description={
          pendingDeactivate ? (
            <div className="inline-block">
              ¿Eliminar{" "}
              <span className="font-semibold text-foreground">
                {pendingDeactivate.name}
              </span>
              ? Los usuarios asignados mantendrán su asignación pero la sucursal
              no estará disponible para nuevas operaciones.
            </div>
          ) : undefined
        }
        confirmLabel="Sí, desactivar"
        cancelLabel="Cancelar"
        onConfirm={confirmDeactivate}
      />

      <DialogWarning
        isOpen={reactivateDialog.isOpen}
        onClose={() => {
          reactivateDialog.close();
          setPendingReactivate(null);
        }}
        title="¿Reactivar sucursal?"
        description={
          pendingReactivate ? (
            <>
              ¿Reactivar{" "}
              <span className="font-semibold text-foreground">
                {pendingReactivate.name}
              </span>
              ? Volverá a estar disponible para operaciones.
            </>
          ) : undefined
        }
        confirmLabel="Sí, reactivar"
        cancelLabel="Cancelar"
        onConfirm={confirmReactivate}
      />

      {/* Header */}
      <PanelPageHeader
        title="Sucursales"
        end={
          <div className="flex flex-wrap items-center gap-3">
            <BadgeRoot
              variant="soft"
              className="border border-border-subtle bg-raised text-foreground-secondary"
            >
              <BadgeLabel>{activeCount} activas</BadgeLabel>
            </BadgeRoot>
            {isAdmin ? (
              <Button
                variant="primary"
                className="bg-accent text-accent-text hover:bg-accent-hover"
                onPress={openCreate}
              >
                <span className="inline-flex items-center gap-2">
                  <Plus className="size-4 shrink-0" aria-hidden />
                  Nueva sucursal
                </span>
              </Button>
            ) : null}
          </div>
        }
      />

      {/* Grid de cards */}
      {loading ? (
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          }}
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={`sk-${i}`}
              className="flex flex-col gap-3 rounded-xl border border-border-subtle p-5"
              style={{ backgroundColor: "var(--background-surface)" }}
            >
              <div className="flex items-center gap-3">
                <div className="size-6 animate-pulse rounded-full bg-raised" />
                <div className="h-5 w-36 animate-pulse rounded bg-raised" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="h-4 w-full animate-pulse rounded bg-raised" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-raised" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-raised" />
              </div>
              <div className="mt-1 flex gap-2 border-t border-border-subtle pt-3">
                <div className="h-8 w-16 animate-pulse rounded bg-raised" />
                <div className="h-8 w-24 animate-pulse rounded bg-raised" />
              </div>
            </div>
          ))}
        </div>
      ) : branches.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border-subtle py-20 text-center"
          style={{ backgroundColor: "var(--background-surface)" }}
        >
          <Building2
            className="size-12 text-foreground-muted"
            strokeWidth={1.25}
            aria-hidden
          />
          <Text className="text-foreground-secondary">
            No hay sucursales registradas.
          </Text>
          {isAdmin ? (
            <Button
              variant="primary"
              className="bg-accent text-accent-text hover:bg-accent-hover"
              onPress={openCreate}
            >
              Crear la primera
            </Button>
          ) : null}
        </div>
      ) : (
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          }}
        >
          {branches.map((b) => (
            <BranchCard
              key={b.id}
              branch={b}
              isAdmin={isAdmin}
              onEdit={openEdit}
              onDeactivate={(branch) => {
                setPendingDeactivate(branch);
                deactivateDialog.open();
              }}
              onReactivate={(branch) => {
                setPendingReactivate(branch);
                reactivateDialog.open();
              }}
            />
          ))}
        </div>
      )}

      {/* Modal Nuevo / Editar sucursal */}
      <Modal.Root state={modalState}>
        <Modal.Backdrop
          className="z-200 flex items-center justify-center p-3 sm:p-6"
          variant="blur"
        >
          <Modal.Container placement="center" size="lg">
            <Modal.Dialog className="flex max-h-[min(90dvh,760px)] w-[min(100vw-1.5rem,30rem)] max-w-none flex-col overflow-hidden border border-border-subtle bg-surface/95 shadow-lg outline-none backdrop-blur-sm sm:w-[min(100vw-3rem,30rem)]">
              <Modal.Header className="shrink-0 border-b border-border-subtle px-5 pb-3 pt-5 sm:px-6">
                <div className="flex items-start justify-between gap-3">
                  <Modal.Heading className="min-w-0 flex-1 pr-2">
                    {editingBranch ? "Editar sucursal" : "Nueva sucursal"}
                  </Modal.Heading>
                  <Modal.CloseTrigger aria-label="Cerrar" className="shrink-0" />
                </div>
              </Modal.Header>

              <Modal.Body className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 sm:px-6 sm:py-5">
                <form
                  id="branch-form"
                  className="flex min-w-0 flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitBranch();
                  }}
                >
                  {/* Nombre */}
                  <div className="flex min-w-0 flex-col gap-1">
                    <Label
                      htmlFor="b-name"
                      className="flex items-baseline gap-1"
                    >
                      Nombre
                      <span className="text-xs font-normal text-danger">
                        (obligatorio)
                      </span>
                    </Label>
                    <Input
                      id="b-name"
                      variant="secondary"
                      className="w-full min-w-0"
                      {...form.register("name")}
                    />
                    {form.formState.errors.name?.message ? (
                      <Text className="text-xs text-danger">
                        {form.formState.errors.name.message}
                      </Text>
                    ) : null}
                  </div>

                  {/* Dirección */}
                  <div className="flex min-w-0 flex-col gap-1">
                    <Label
                      htmlFor="b-address"
                      className="flex items-baseline gap-1"
                    >
                      Dirección
                      <span className="text-xs font-normal text-danger">
                        (obligatorio)
                      </span>
                    </Label>
                    <Input
                      id="b-address"
                      variant="secondary"
                      className="w-full min-w-0"
                      {...form.register("address")}
                    />
                    {form.formState.errors.address?.message ? (
                      <Text className="text-xs text-danger">
                        {form.formState.errors.address.message}
                      </Text>
                    ) : null}
                  </div>

                  {/* Ciudad / Provincia */}
                  <GeoSelector
                    provinceValue={form.watch("province")}
                    cityValue={form.watch("city")}
                    onProvinceChange={(v) =>
                      form.setValue("province", v ?? "", {
                        shouldValidate: true,
                      })
                    }
                    onCityChange={(v) =>
                      form.setValue("city", v ?? "", { shouldValidate: true })
                    }
                    disabled={submitting}
                  />

                  {/* Teléfono */}
                  <div className="flex min-w-0 flex-col gap-1">
                    <Label
                      htmlFor="b-phone"
                      className="text-foreground-secondary"
                    >
                      Teléfono{" "}
                      <span className="text-xs font-normal">(opcional)</span>
                    </Label>
                    <Input
                      id="b-phone"
                      variant="secondary"
                      className="w-full min-w-0"
                      {...form.register("phone")}
                    />
                  </div>

                  {/* Email */}
                  <div className="flex min-w-0 flex-col gap-1">
                    <Label
                      htmlFor="b-email"
                      className="text-foreground-secondary"
                    >
                      Email{" "}
                      <span className="text-xs font-normal">(opcional)</span>
                    </Label>
                    <Input
                      id="b-email"
                      type="email"
                      variant="secondary"
                      className="w-full min-w-0"
                      {...form.register("email")}
                    />
                    {form.formState.errors.email?.message ? (
                      <Text className="text-xs text-danger">
                        {form.formState.errors.email.message}
                      </Text>
                    ) : null}
                  </div>

                  {/* is_active — solo en edición */}
                  {editingBranch ? (
                    <div className="flex items-center gap-3 rounded-lg border border-border-subtle p-3">
                      <SwitchRoot
                        isSelected={form.watch("is_active")}
                        onChange={(v) =>
                          form.setValue("is_active", v, { shouldValidate: true })
                        }
                      >
                        <SwitchControl>
                          <SwitchThumb />
                        </SwitchControl>
                      </SwitchRoot>
                      <Text className="text-sm text-foreground-secondary">
                        {form.watch("is_active") ? "Sucursal activa" : "Sucursal inactiva"}
                      </Text>
                    </div>
                  ) : null}
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
                  form="branch-form"
                  variant="primary"
                  className="bg-accent text-accent-text hover:bg-accent-hover"
                  isDisabled={submitting}
                >
                  {editingBranch ? "Guardar cambios" : "Crear sucursal"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BranchCard
// ---------------------------------------------------------------------------
function BranchCard({
  branch,
  isAdmin,
  onEdit,
  onDeactivate,
  onReactivate,
}: {
  branch: Branch;
  isAdmin: boolean;
  onEdit: (b: Branch) => void;
  onDeactivate: (b: Branch) => void;
  onReactivate: (b: Branch) => void;
}) {
  const inactive = !branch.is_active;

  const locationParts = [branch.city, branch.province]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      className="flex flex-col rounded-xl border transition-colors"
      style={{
        backgroundColor: "var(--background-surface)",
        borderColor: inactive
          ? "var(--border-default)"
          : "var(--border-subtle)",
        borderStyle: inactive ? "dashed" : "solid",
        opacity: inactive ? 0.6 : 1,
      }}
    >
      {/* Card header */}
      <div
        className="flex items-center justify-between gap-3 px-4 pt-4 pb-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <MapPin
            className="size-5 shrink-0"
            style={{ color: "var(--accent)" }}
            aria-hidden
          />
          <span
            className="truncate font-semibold text-foreground"
            style={{ fontSize: "15px" }}
          >
            {branch.name}
          </span>
        </div>
        {branch.is_active ? (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: "var(--nuba-success-soft)",
              color: "var(--success)",
            }}
          >
            Activa
          </span>
        ) : (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: "var(--danger-soft)",
              color: "var(--danger)",
            }}
          >
            Inactiva
          </span>
        )}
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col gap-2 px-4 py-3">
        {/* Dirección */}
        <div className="flex items-start gap-2 text-sm text-foreground-secondary">
          <Navigation2
            className="mt-0.5 size-3.5 shrink-0 text-foreground-muted"
            aria-hidden
          />
          <span>{branch.address}</span>
        </div>

        {/* Ciudad / provincia */}
        {locationParts ? (
          <div className="pl-[22px] text-sm text-foreground-muted">
            {locationParts}
          </div>
        ) : null}

        {/* Teléfono */}
        {branch.phone ? (
          <div className="flex items-center gap-2 text-sm text-foreground-secondary">
            <Phone
              className="size-3.5 shrink-0 text-foreground-muted"
              aria-hidden
            />
            <span>{branch.phone}</span>
          </div>
        ) : null}

        {/* Email */}
        {branch.email ? (
          <div className="flex items-center gap-2 text-sm text-foreground-secondary">
            <Mail
              className="size-3.5 shrink-0 text-foreground-muted"
              aria-hidden
            />
            <a
              href={`mailto:${branch.email}`}
              className="truncate hover:underline"
              style={{ color: "var(--accent)" }}
            >
              {branch.email}
            </a>
          </div>
        ) : null}

        {/* Usuarios asignados */}
        <div className="mt-1 flex items-center gap-1.5 text-xs text-foreground-muted">
          <Users className="size-3 shrink-0" aria-hidden />
          <span>
            {branch.user_count ?? 0}{" "}
            {(branch.user_count ?? 0) === 1
              ? "usuario asignado"
              : "usuarios asignados"}
          </span>
        </div>
      </div>

      {/* Card footer — acciones (solo admin) */}
      {isAdmin ? (
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <Button
            size="sm"
            variant="secondary"
            onPress={() => onEdit(branch)}
          >
            <span className="inline-flex items-center gap-1.5">
              <Pencil className="size-3.5" aria-hidden />
              Editar
            </span>
          </Button>

          {branch.is_active ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-foreground-secondary hover:text-danger"
              onPress={() => onDeactivate(branch)}
            >
              <span className="inline-flex items-center gap-1.5">
                <PowerOff className="size-3.5" aria-hidden />
                Desactivar
              </span>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="text-foreground-secondary"
              onPress={() => onReactivate(branch)}
            >
              <span className="inline-flex items-center gap-1.5">
                <Power className="size-3.5" aria-hidden />
                Reactivar
              </span>
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
