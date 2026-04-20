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
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { PanelPageHeader } from "@/components/panel/PanelPageHeader";
import { DialogSuccess, DialogWarning } from "@/components/ui";
import type { BranchListItem } from "@/lib/db/order-config";
import type { User, UserSummary } from "@/types/user";

// ---------------------------------------------------------------------------
// Role metadata — colours kept in CSS variables where available;
// purple/blue use Tailwind utilities (these are decorative role tokens
// not present in the design-system CSS variable set).
// ---------------------------------------------------------------------------
const ROLE_META: Record<
  string,
  { label: string; avatarCls: string; badgeCls: string }
> = {
  admin: {
    label: "Admin",
    avatarCls: "bg-[var(--accent-soft)] text-[var(--accent)]",
    badgeCls: "bg-[var(--accent-soft)] text-[var(--accent)]",
  },
  supervisor: {
    label: "Supervisor",
    avatarCls:
      "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
    badgeCls:
      "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  },
  vendedor: {
    label: "Vendedor",
    avatarCls:
      "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
    badgeCls:
      "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  },
  cliente: {
    label: "Cliente",
    avatarCls:
      "bg-[var(--background-raised)] text-[var(--foreground-secondary)]",
    badgeCls:
      "bg-[var(--background-raised)] text-[var(--foreground-secondary)]",
  },
};

function roleMeta(name: string) {
  return (
    ROLE_META[name] ?? {
      label: name,
      avatarCls: "bg-[var(--background-raised)] text-[var(--foreground-secondary)]",
      badgeCls: "bg-[var(--background-raised)] text-[var(--foreground-secondary)]",
    }
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatRelativePast(iso: string | null): string {
  if (!iso) return "Nunca";
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 45) return "hace un momento";
  const min = Math.floor(sec / 60);
  if (min < 60) return min === 1 ? "hace 1 minuto" : `hace ${min} minutos`;
  const h = Math.floor(min / 60);
  if (h < 24) return h === 1 ? "hace 1 hora" : `hace ${h} horas`;
  const d = Math.floor(h / 24);
  if (d < 7) return d === 1 ? "hace 1 día" : `hace ${d} días`;
  const w = Math.floor(d / 7);
  if (w < 5) return w === 1 ? "hace 1 semana" : `hace ${w} semanas`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return mo <= 1 ? "hace 1 mes" : `hace ${mo} meses`;
  const y = Math.floor(d / 365);
  return y <= 1 ? "hace 1 año" : `hace ${y} años`;
}

function initials(first: string, last: string): string {
  return `${first.trim().charAt(0)}${last.trim().charAt(0)}`.toUpperCase() || "?";
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------
const userFormSchema = z.object({
  first_name: z.string().trim().min(1, "Requerido").max(100),
  last_name: z.string().trim().min(1, "Requerido").max(100),
  email: z.string().trim().email("Email inválido").max(255),
  password: z.string(),
  role_name: z.enum(["supervisor", "vendedor", "cliente"]),
  phone: z.string().max(50),
  branch_ids: z.array(z.string()),
  primary_branch_id: z.string(),
});

type UserFormValues = z.infer<typeof userFormSchema>;

function makeDefaultValues(branches: BranchListItem[]): UserFormValues {
  const single = branches.length === 1 ? branches[0] : null;
  return {
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    role_name: "vendedor",
    phone: "",
    branch_ids: single ? [single.id] : [],
    primary_branch_id: single ? single.id : "",
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function UsuariosClient({
  tenantId,
  branches,
}: {
  tenantId: string;
  branches: BranchListItem[];
}) {
  const showBranchUI = branches.length > 1;

  // Data
  const [rows, setRows] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCount, setActiveCount] = useState<number | null>(null);

  // Filters
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);

  // User modal
  const modalState = useOverlayState();
  const [editingUser, setEditingUser] = useState<UserSummary | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Reset modal
  const resetModalState = useOverlayState();
  const [resetTarget, setResetTarget] = useState<UserSummary | null>(null);
  const [resetType, setResetType] = useState<"email" | "temp">("email");
  const [resetSubmitting, setResetSubmitting] = useState(false);

  // Delete
  const deleteDialog = useOverlayState();
  const [pendingDelete, setPendingDelete] = useState<UserSummary | null>(null);

  // Reactivate
  const reactivateDialog = useOverlayState();
  const [pendingReactivate, setPendingReactivate] = useState<UserSummary | null>(null);

  // Feedback
  const [successOpen, setSuccessOpen] = useState(false);
  const [successTitle, setSuccessTitle] = useState("");
  const [successDesc, setSuccessDesc] = useState<ReactNode>("");
  const [tempPasswordResult, setTempPasswordResult] = useState<string | null>(null);
  const [copiedTemp, setCopiedTemp] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const [warnMsg, setWarnMsg] = useState("");

  // Form
  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: makeDefaultValues(branches),
  });
  const submitting = form.formState.isSubmitting;
  const watchedBranchIds = (form.watch("branch_ids") ?? []) as string[];

  // Sync primary when branch selection changes
  useEffect(() => {
    const primary = form.getValues("primary_branch_id");
    if (primary && !watchedBranchIds.includes(primary)) {
      form.setValue("primary_branch_id", "", { shouldValidate: false });
    }
    if (watchedBranchIds.length === 1 && !form.getValues("primary_branch_id")) {
      form.setValue("primary_branch_id", watchedBranchIds[0]!, { shouldValidate: false });
    }
  }, [watchedBranchIds, form]);

  // Search debounce
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------
  const refreshActiveCount = useCallback(async () => {
    const res = await fetch(`/api/${tenantId}/usuarios?isActive=true`, {
      credentials: "include",
    });
    if (res.ok) {
      const d = (await res.json()) as UserSummary[];
      setActiveCount(Array.isArray(d) ? d.length : 0);
    }
  }, [tenantId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ isActive: String(activeOnly) });
      if (debouncedSearch) p.set("search", debouncedSearch);
      if (branchFilter) p.set("branchId", branchFilter);
      const res = await fetch(`/api/${tenantId}/usuarios?${p.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        toast.danger("No se pudieron cargar los usuarios");
        setRows([]);
        return;
      }
      const d = (await res.json()) as UserSummary[];
      setRows(Array.isArray(d) ? d : []);
    } finally {
      setLoading(false);
    }
  }, [tenantId, debouncedSearch, branchFilter, activeOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void refreshActiveCount();
  }, [refreshActiveCount]);

  // ---------------------------------------------------------------------------
  // Filtered rows (role filter applied client-side)
  // ---------------------------------------------------------------------------
  const filteredRows = useMemo(() => {
    if (!roleFilter) return rows;
    return rows.filter((u) => u.role_name === roleFilter);
  }, [rows, roleFilter]);

  const emptyAbsolute = !loading && rows.length === 0 && !debouncedSearch && !roleFilter;

  // ---------------------------------------------------------------------------
  // Submit user form
  // ---------------------------------------------------------------------------
  const submitUser = form.handleSubmit(async (values) => {
    const isCreating = !editingUser;

    if (isCreating && values.password.trim().length < 8) {
      form.setError("password", { message: "Mínimo 8 caracteres" });
      return;
    }
    if (values.branch_ids.length === 0) {
      form.setError("branch_ids", { message: "Asigná al menos una sucursal" });
      return;
    }
    if (!values.primary_branch_id) {
      form.setError("primary_branch_id", { message: "Seleccioná la sucursal principal" });
      return;
    }

    const url = isCreating
      ? `/api/${tenantId}/usuarios`
      : `/api/${tenantId}/usuarios/${editingUser!.id}`;

    const body: Record<string, unknown> = {
      first_name: values.first_name.trim(),
      last_name: values.last_name.trim(),
      role_name: values.role_name,
      phone: values.phone.trim() || null,
      branch_ids: values.branch_ids,
      primary_branch_id: values.primary_branch_id,
    };
    if (isCreating) {
      body.email = values.email.trim().toLowerCase();
      body.password = values.password;
    }

    const res = await fetch(url, {
      method: isCreating ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => null)) as { error?: string } | null;

    if (res.status === 409) {
      setWarnMsg(j?.error ?? "Conflicto al guardar el usuario");
      setWarnOpen(true);
      return;
    }
    if (!res.ok) {
      toast.danger(j?.error ?? "Error al guardar usuario");
      return;
    }
    modalState.close();
    setTempPasswordResult(null);
    setSuccessTitle(isCreating ? "Usuario creado" : "Usuario actualizado");
    setSuccessDesc(
      isCreating
        ? "El nuevo usuario ya puede ingresar al panel."
        : "Los cambios se guardaron correctamente.",
    );
    setSuccessOpen(true);
    await Promise.all([load(), refreshActiveCount()]);
  });

  // ---------------------------------------------------------------------------
  // Delete / reactivate
  // ---------------------------------------------------------------------------
  async function confirmDelete() {
    if (!pendingDelete) return;
    const res = await fetch(`/api/${tenantId}/usuarios/${pendingDelete.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) throw new Error(j?.error ?? "No se pudo desactivar el usuario");
    await Promise.all([load(), refreshActiveCount()]);
  }

  async function confirmReactivate() {
    if (!pendingReactivate) return;
    const res = await fetch(
      `/api/${tenantId}/usuarios/${pendingReactivate.id}/reactivar`,
      { method: "PATCH", credentials: "include" },
    );
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) throw new Error(j?.error ?? "No se pudo reactivar el usuario");
    await Promise.all([load(), refreshActiveCount()]);
  }

  // ---------------------------------------------------------------------------
  // Reset password
  // ---------------------------------------------------------------------------
  async function submitReset() {
    if (!resetTarget || resetSubmitting) return;
    setResetSubmitting(true);
    try {
      const res = await fetch(
        `/api/${tenantId}/usuarios/${resetTarget.id}/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ type: resetType }),
        },
      );
      const j = (await res.json().catch(() => null)) as {
        error?: string;
        temp_password?: string;
      } | null;
      if (!res.ok) {
        toast.danger(j?.error ?? "Error al resetear la contraseña");
        return;
      }
      resetModalState.close();
      if (resetType === "temp" && j?.temp_password) {
        setTempPasswordResult(j.temp_password);
        setCopiedTemp(false);
        setSuccessTitle("Contraseña temporal generada");
        setSuccessDesc("");
      } else {
        setTempPasswordResult(null);
        setSuccessTitle("Email enviado");
        setSuccessDesc(
          `Se envió un link de restablecimiento a ${resetTarget.email}.`,
        );
      }
      setSuccessOpen(true);
    } finally {
      setResetSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Modal open helpers
  // ---------------------------------------------------------------------------
  function openCreate() {
    setEditingUser(null);
    form.reset(makeDefaultValues(branches));
    setShowPassword(false);
    modalState.open();
  }

  async function openEdit(u: UserSummary) {
    setEditingUser(u);
    setEditLoading(true);
    modalState.open();
    try {
      const res = await fetch(`/api/${tenantId}/usuarios/${u.id}`, {
        credentials: "include",
      });
      if (!res.ok) {
        modalState.close();
        toast.danger("No se pudo cargar el usuario");
        return;
      }
      const full = (await res.json()) as User;
      const editRole =
        full.role_name === "admin" ? "supervisor" : full.role_name;
      form.reset({
        first_name: full.first_name,
        last_name: full.last_name,
        email: full.email,
        password: "",
        role_name: editRole as UserFormValues["role_name"],
        phone: full.phone ?? "",
        branch_ids: full.branches.map((b) => b.branch_id),
        primary_branch_id:
          full.branches.find((b) => b.is_primary)?.branch_id ??
          full.branches[0]?.branch_id ??
          "",
      });
    } finally {
      setEditLoading(false);
    }
  }

  function openReset(u: UserSummary) {
    setResetTarget(u);
    setResetType("email");
    resetModalState.open();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-6">
      {/* ─── Feedback ──────────────────────────────────────────────── */}
      <DialogSuccess
        isOpen={successOpen}
        onClose={() => {
          setSuccessOpen(false);
          setTempPasswordResult(null);
        }}
        title={successTitle}
        description={successDesc}
      >
        {tempPasswordResult ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-foreground-secondary">
              Comunícasela al usuario. Vence en 24 horas.
            </p>
            <div
              className="flex items-center justify-between gap-3 rounded-lg px-4 py-3"
              style={{ backgroundColor: "var(--background-raised)" }}
            >
              <span className="font-mono text-lg font-semibold tracking-widest text-foreground">
                {tempPasswordResult}
              </span>
              <Button
                size="sm"
                variant="secondary"
                isIconOnly={false}
                onPress={() => {
                  void navigator.clipboard.writeText(tempPasswordResult!);
                  setCopiedTemp(true);
                  window.setTimeout(() => setCopiedTemp(false), 2000);
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Copy className="size-3.5" aria-hidden />
                  {copiedTemp ? "Copiado" : "Copiar"}
                </span>
              </Button>
            </div>
          </div>
        ) : null}
      </DialogSuccess>

      <DialogWarning
        isOpen={warnOpen}
        onClose={() => setWarnOpen(false)}
        title="No se pudo guardar"
        description={warnMsg}
        confirmLabel="Entendido"
        cancelLabel="Cerrar"
        onConfirm={() => setWarnOpen(false)}
      />

      <DialogWarning
        isOpen={deleteDialog.isOpen}
        onClose={() => {
          deleteDialog.close();
          setPendingDelete(null);
        }}
        title="Eliminar usuario?"
        description={
          pendingDelete ? (
            <div className="inline-block">
              ¿Eliminar a{" "}
              <span className="font-semibold text-foreground">
                {pendingDelete.first_name} {pendingDelete.last_name}
              </span>
              ? El usuario no podrá ingresar al panel.
            </div>
          ) : undefined
        }
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={confirmDelete}
      />

      <DialogWarning
        isOpen={reactivateDialog.isOpen}
        onClose={() => {
          reactivateDialog.close();
          setPendingReactivate(null);
        }}
        title="¿Reactivar usuario?"
        description={
          pendingReactivate ? (
            <>
              ¿Reactivar a{" "}
              <span className="font-semibold text-foreground">
                {pendingReactivate.first_name} {pendingReactivate.last_name}
              </span>
              ? Podrá volver a ingresar al panel.
            </>
          ) : undefined
        }
        confirmLabel="Sí, reactivar"
        cancelLabel="Cancelar"
        onConfirm={confirmReactivate}
      />

      {/* ─── Header ─────────────────────────────────────────────────── */}
      <PanelPageHeader
        title="Usuarios"
        end={
          <div className="flex flex-wrap items-center gap-3">
            {activeCount !== null ? (
              <BadgeRoot
                variant="soft"
                className="border border-border-subtle bg-raised text-foreground-secondary"
              >
                <BadgeLabel>{activeCount} activos</BadgeLabel>
              </BadgeRoot>
            ) : null}
            <Button
              variant="primary"
              className="bg-accent text-accent-text hover:bg-accent-hover"
              onPress={openCreate}
            >
              <span className="inline-flex items-center gap-2">
                <UserPlus className="size-4 shrink-0" aria-hidden />
                Nuevo usuario
              </span>
            </Button>
          </div>
        }
      />

      {/* ─── Filters ────────────────────────────────────────────────── */}
      <div
        className="flex flex-col gap-3 rounded-xl border border-border-subtle p-4 backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-end"
        style={{ backgroundColor: "var(--background-surface)" }}
      >
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <Label className="mb-1 block text-sm text-foreground-secondary">
            Buscar
          </Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
              aria-hidden
            />
            <Input
              variant="secondary"
              className="pl-9"
              placeholder="Nombre o email"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>

        <div className="w-full sm:w-44">
          <Label className="mb-1 block text-sm text-foreground-secondary">
            Rol
          </Label>
          <select
            className="h-10 w-full rounded-lg border border-border-subtle bg-background px-2 text-sm text-foreground"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">Todos los roles</option>
            <option value="supervisor">Supervisor</option>
            <option value="vendedor">Vendedor</option>
            <option value="cliente">Cliente</option>
          </select>
        </div>

        {showBranchUI ? (
          <div className="w-full sm:w-52">
            <Label className="mb-1 block text-sm text-foreground-secondary">
              Sucursal
            </Label>
            <select
              className="h-10 w-full rounded-lg border border-border-subtle bg-background px-2 text-sm text-foreground"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
            >
              <option value="">Todas</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="flex items-center gap-2 pb-1">
          <SwitchRoot isSelected={activeOnly} onChange={(v) => setActiveOnly(v)}>
            <SwitchControl>
              <SwitchThumb />
            </SwitchControl>
          </SwitchRoot>
          <Text className="text-sm text-foreground-secondary">
            {activeOnly ? "Solo activos" : "Solo inactivos"}
          </Text>
        </div>
      </div>

      {/* ─── Table ──────────────────────────────────────────────────── */}
      <div
        className="overflow-x-auto rounded-xl border border-border-subtle"
        style={{ backgroundColor: "var(--background-surface)" }}
      >
        <table className="w-full min-w-[780px] border-collapse text-left text-sm">
          <thead>
            <tr
              className="border-b-[0.5px]"
              style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--background-raised)" }}
            >
              <th className="px-4 py-3 font-medium text-foreground-secondary">
                Usuario
              </th>
              <th className="px-4 py-3 font-medium text-foreground-secondary">
                Rol
              </th>
              <th className="px-4 py-3 font-medium text-foreground-secondary">
                Sucursal
              </th>
              <th className="px-4 py-3 font-medium text-foreground-secondary">
                Último acceso
              </th>
              <th className="px-4 py-3 font-medium text-foreground-secondary">
                Estado
              </th>
              <th className="w-36 px-4 py-3 text-right font-medium text-foreground-secondary">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr
                    key={`sk-${i}`}
                    className="border-b-[0.5px] border-border-subtle"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="size-9 shrink-0 animate-pulse rounded-full bg-raised"
                        />
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <div className="h-4 w-36 animate-pulse rounded bg-raised" />
                          <div className="h-3 w-48 animate-pulse rounded bg-raised" />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-5 w-20 animate-pulse rounded-full bg-raised" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-28 animate-pulse rounded bg-raised" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-24 animate-pulse rounded bg-raised" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-5 w-16 animate-pulse rounded-full bg-raised" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="ml-auto h-8 w-24 animate-pulse rounded bg-raised" />
                    </td>
                  </tr>
                ))
              : filteredRows.map((u) => {
                  const meta = roleMeta(u.role_name);
                  const inactive = !u.is_active;
                  return (
                    <tr
                      key={u.id}
                      className="border-b-[0.5px] border-border-subtle transition-colors hover:bg-background-raised"
                      style={inactive ? { opacity: 0.55 } : undefined}
                    >
                      {/* Avatar + name */}
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${meta.avatarCls}`}
                          >
                            {initials(u.first_name, u.last_name)}
                          </div>
                          <div className="min-w-0">
                            <span className="block truncate font-medium text-foreground">
                              {u.first_name} {u.last_name}
                            </span>
                            <Text className="truncate text-xs text-foreground-muted">
                              {u.email}
                            </Text>
                          </div>
                        </div>
                      </td>

                      {/* Rol */}
                      <td className="px-4 py-3 align-middle">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.badgeCls}`}
                        >
                          {meta.label}
                        </span>
                      </td>

                      {/* Sucursales */}
                      <td className="px-4 py-3 align-middle text-foreground-secondary">
                        {u.primary_branch_name ? (
                          <span className="inline-flex items-center gap-1.5 text-sm">
                            {u.primary_branch_name}
                            {u.branch_count > 1 ? (
                              <span className="rounded-full bg-[var(--background-raised)] px-1.5 py-0.5 text-xs text-foreground-muted">
                                +{u.branch_count - 1} más
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-foreground-muted">—</span>
                        )}
                      </td>

                      {/* Último acceso */}
                      <td className="px-4 py-3 align-middle text-foreground-secondary">
                        {formatRelativePast(u.last_login_at)}
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3 align-middle">
                        {u.is_active ? (
                          <span
                            className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
                            style={{
                              backgroundColor: "var(--nuba-success-soft)",
                              color: "var(--success)",
                            }}
                          >
                            Activo
                          </span>
                        ) : (
                          <span
                            className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
                            style={{
                              backgroundColor: "var(--danger-soft)",
                              color: "var(--danger)",
                            }}
                          >
                            Inactivo
                          </span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-3 align-middle text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            isIconOnly
                            aria-label="Editar usuario"
                            onPress={() => void openEdit(u)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            isIconOnly
                            aria-label="Resetear contraseña"
                            onPress={() => openReset(u)}
                          >
                            <KeyRound className="size-4" />
                          </Button>
                          {u.is_active ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              isIconOnly
                              aria-label="Desactivar usuario"
                              onPress={() => {
                                setPendingDelete(u);
                                deleteDialog.open();
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              isIconOnly
                              aria-label="Reactivar usuario"
                              onPress={() => {
                                setPendingReactivate(u);
                                reactivateDialog.open();
                              }}
                            >
                              <RotateCcw className="size-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>

        {/* Empty state */}
        {!loading && filteredRows.length === 0 && emptyAbsolute ? (
          <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <Users
              className="size-12 text-foreground-muted"
              strokeWidth={1.25}
              aria-hidden
            />
            <Text className="text-foreground-secondary">
              No hay usuarios registrados.
            </Text>
            <Button
              variant="primary"
              className="bg-accent text-accent-text hover:bg-accent-hover"
              onPress={openCreate}
            >
              Crear el primero
            </Button>
          </div>
        ) : null}

        {!loading && filteredRows.length === 0 && !emptyAbsolute ? (
          <div className="border-t border-border-subtle px-6 py-10 text-center">
            <Text className="text-sm text-foreground-secondary">
              No hay usuarios que coincidan con los filtros.
            </Text>
          </div>
        ) : null}
      </div>

      {/* ─── Modal Nuevo / Editar usuario ───────────────────────────── */}
      <Modal.Root state={modalState}>
        <Modal.Backdrop
          className="z-200 flex items-center justify-center p-3 sm:p-6"
          variant="blur"
        >
          <Modal.Container placement="center" size="lg">
            <Modal.Dialog className="flex max-h-[min(90dvh,860px)] w-[min(100vw-1.5rem,44rem)] max-w-none flex-col overflow-hidden border border-border-subtle bg-surface/95 shadow-lg outline-none backdrop-blur-sm sm:w-[min(100vw-3rem,44rem)]">
              <Modal.Header className="shrink-0 border-b border-border-subtle px-5 pb-3 pt-5 sm:px-6">
                <div className="flex items-start justify-between gap-3">
                  <Modal.Heading className="min-w-0 flex-1 pr-2">
                    {editingUser ? "Editar usuario" : "Nuevo usuario"}
                  </Modal.Heading>
                  <Modal.CloseTrigger aria-label="Cerrar" className="shrink-0" />
                </div>
              </Modal.Header>

              <Modal.Body className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 sm:px-6 sm:py-5">
                {editLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="size-6 animate-spin rounded-full border-2 border-border-subtle border-t-accent" />
                  </div>
                ) : (
                  <form
                    id="user-form"
                    className="flex min-w-0 flex-col gap-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submitUser();
                    }}
                  >
                    <p className="border-l-2 border-accent pl-3 text-xs leading-relaxed text-foreground-secondary">
                      <span className="font-medium text-foreground">
                        Campos obligatorios:
                      </span>{" "}
                      nombre, apellido, email{!editingUser ? ", contraseña" : ""}
                      , rol y al menos una sucursal.
                    </p>

                    {/* Nombre / Apellido */}
                    <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="flex min-w-0 flex-col gap-1">
                        <Label htmlFor="u-fn" className="flex items-baseline gap-1">
                          Nombre
                          <span className="text-xs font-normal text-danger">
                            (obligatorio)
                          </span>
                        </Label>
                        <Input
                          id="u-fn"
                          variant="secondary"
                          className="w-full min-w-0"
                          {...form.register("first_name")}
                        />
                        {form.formState.errors.first_name?.message ? (
                          <Text className="text-xs text-danger">
                            {form.formState.errors.first_name.message}
                          </Text>
                        ) : null}
                      </div>

                      <div className="flex min-w-0 flex-col gap-1">
                        <Label htmlFor="u-ln" className="flex items-baseline gap-1">
                          Apellido
                          <span className="text-xs font-normal text-danger">
                            (obligatorio)
                          </span>
                        </Label>
                        <Input
                          id="u-ln"
                          variant="secondary"
                          className="w-full min-w-0"
                          {...form.register("last_name")}
                        />
                        {form.formState.errors.last_name?.message ? (
                          <Text className="text-xs text-danger">
                            {form.formState.errors.last_name.message}
                          </Text>
                        ) : null}
                      </div>
                    </div>

                    {/* Email — disabled in edit */}
                    <div className="flex min-w-0 flex-col gap-1">
                      <Label htmlFor="u-em" className="flex items-baseline gap-1">
                        Email
                        <span className="text-xs font-normal text-danger">
                          (obligatorio)
                        </span>
                        {editingUser ? (
                          <span className="text-xs font-normal text-foreground-muted">
                            — no editable
                          </span>
                        ) : null}
                      </Label>
                      <Input
                        id="u-em"
                        type="email"
                        variant="secondary"
                        className="w-full min-w-0"
                        disabled={!!editingUser}
                        {...form.register("email")}
                      />
                      {form.formState.errors.email?.message ? (
                        <Text className="text-xs text-danger">
                          {form.formState.errors.email.message}
                        </Text>
                      ) : null}
                    </div>

                    {/* Password — creation only */}
                    {!editingUser ? (
                      <div className="flex min-w-0 flex-col gap-1">
                        <Label htmlFor="u-pw" className="flex items-baseline gap-1">
                          Contraseña
                          <span className="text-xs font-normal text-danger">
                            (obligatorio, mínimo 8 caracteres)
                          </span>
                        </Label>
                        <div className="relative">
                          <Input
                            id="u-pw"
                            type={showPassword ? "text" : "password"}
                            variant="secondary"
                            className="w-full min-w-0 pr-10"
                            {...form.register("password")}
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
                            onClick={() => setShowPassword((v) => !v)}
                            tabIndex={-1}
                            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                          >
                            {showPassword ? (
                              <EyeOff className="size-4" aria-hidden />
                            ) : (
                              <Eye className="size-4" aria-hidden />
                            )}
                          </button>
                        </div>
                        {form.formState.errors.password?.message ? (
                          <Text className="text-xs text-danger">
                            {form.formState.errors.password.message}
                          </Text>
                        ) : null}
                      </div>
                    ) : null}

                    {/* Rol */}
                    <div className="flex min-w-0 flex-col gap-1">
                      <Label htmlFor="u-role" className="flex items-baseline gap-1">
                        Rol
                        <span className="text-xs font-normal text-danger">
                          (obligatorio)
                        </span>
                      </Label>
                      <select
                        id="u-role"
                        className="h-10 w-full min-w-0 rounded-lg border border-border-subtle bg-background px-3 text-sm text-foreground"
                        {...form.register("role_name")}
                      >
                        <option value="supervisor">Supervisor</option>
                        <option value="vendedor">Vendedor</option>
                        <option value="cliente">Cliente</option>
                      </select>
                      {form.formState.errors.role_name?.message ? (
                        <Text className="text-xs text-danger">
                          {form.formState.errors.role_name.message}
                        </Text>
                      ) : null}
                    </div>

                    {/* Phone */}
                    <div className="flex min-w-0 flex-col gap-1">
                      <Label htmlFor="u-phone" className="text-foreground-secondary">
                        Teléfono{" "}
                        <span className="text-xs font-normal">(opcional)</span>
                      </Label>
                      <Input
                        id="u-phone"
                        variant="secondary"
                        className="w-full min-w-0"
                        {...form.register("phone")}
                      />
                    </div>

                    {/* Sucursales */}
                    <div className="flex min-w-0 flex-col gap-2">
                      <Label className="flex items-baseline gap-1">
                        Sucursales asignadas
                        <span className="text-xs font-normal text-danger">
                          (al menos una)
                        </span>
                      </Label>
                      <div className="flex flex-col gap-2 rounded-lg border border-border-subtle p-3">
                        {branches.map((b) => (
                          <label
                            key={b.id}
                            className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
                          >
                            <input
                              type="checkbox"
                              value={b.id}
                              className="size-4 accent-[var(--accent)]"
                              {...form.register("branch_ids")}
                            />
                            {b.name}
                          </label>
                        ))}
                      </div>
                      {form.formState.errors.branch_ids?.message ? (
                        <Text className="text-xs text-danger">
                          {form.formState.errors.branch_ids.message}
                        </Text>
                      ) : null}
                    </div>

                    {/* Sucursal principal */}
                    {watchedBranchIds.length > 1 ? (
                      <div className="flex min-w-0 flex-col gap-2">
                        <Label className="flex items-baseline gap-1">
                          Sucursal principal
                          <span className="text-xs font-normal text-danger">
                            (obligatorio)
                          </span>
                        </Label>
                        <div className="flex flex-col gap-2 rounded-lg border border-border-subtle p-3">
                          {branches
                            .filter((b) => watchedBranchIds.includes(b.id))
                            .map((b) => (
                              <label
                                key={b.id}
                                className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
                              >
                                <input
                                  type="radio"
                                  value={b.id}
                                  className="accent-[var(--accent)]"
                                  {...form.register("primary_branch_id")}
                                />
                                {b.name}
                              </label>
                            ))}
                        </div>
                        {form.formState.errors.primary_branch_id?.message ? (
                          <Text className="text-xs text-danger">
                            {form.formState.errors.primary_branch_id.message}
                          </Text>
                        ) : null}
                      </div>
                    ) : null}
                  </form>
                )}
              </Modal.Body>

              <Modal.Footer className="flex shrink-0 justify-end gap-2 border-t border-border-subtle px-5 py-4 sm:px-6">
                <Button
                  variant="secondary"
                  onPress={() => modalState.close()}
                  isDisabled={submitting || editLoading}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  form="user-form"
                  variant="primary"
                  className="bg-accent text-accent-text hover:bg-accent-hover"
                  isDisabled={submitting || editLoading}
                >
                  {editingUser ? "Guardar cambios" : "Crear usuario"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>

      {/* ─── Modal Reset de contraseña ───────────────────────────────── */}
      <Modal.Root state={resetModalState}>
        <Modal.Backdrop
          className="z-200 flex items-center justify-center p-3 sm:p-6"
          variant="blur"
        >
          <Modal.Container placement="center" size="lg">
            <Modal.Dialog className="flex max-h-[min(90dvh,600px)] w-[min(100vw-1.5rem,36rem)] max-w-none flex-col overflow-hidden border border-border-subtle bg-surface/95 shadow-lg outline-none backdrop-blur-sm sm:w-[min(100vw-3rem,36rem)]">
              <Modal.Header className="shrink-0 border-b border-border-subtle px-5 pb-3 pt-5 sm:px-6">
                <div className="flex items-start justify-between gap-3">
                  <Modal.Heading className="min-w-0 flex-1 pr-2">
                    Resetear contraseña
                    {resetTarget ? (
                      <span className="block text-sm font-normal text-foreground-secondary">
                        {resetTarget.first_name} {resetTarget.last_name}
                      </span>
                    ) : null}
                  </Modal.Heading>
                  <Modal.CloseTrigger aria-label="Cerrar" className="shrink-0" />
                </div>
              </Modal.Header>

              <Modal.Body className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-5 sm:px-6">
                <div className="flex flex-col gap-3">
                  {/* Card: Email */}
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-start gap-4 rounded-xl border-2 p-4 text-left transition-colors"
                    style={{
                      borderColor:
                        resetType === "email"
                          ? "var(--accent)"
                          : "var(--border-subtle)",
                      backgroundColor:
                        resetType === "email"
                          ? "var(--accent-soft)"
                          : "transparent",
                    }}
                    onClick={() => setResetType("email")}
                  >
                    <Mail
                      className="mt-0.5 size-5 shrink-0"
                      style={{
                        color:
                          resetType === "email"
                            ? "var(--accent)"
                            : "var(--foreground-muted)",
                      }}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        Enviar por email
                        <span
                          className="ml-2 rounded-full px-2 py-0.5 text-xs"
                          style={{
                            backgroundColor: "var(--accent-soft)",
                            color: "var(--accent)",
                          }}
                        >
                          Recomendado
                        </span>
                      </p>
                      <p className="mt-0.5 text-sm text-foreground-secondary">
                        Se envía un link al email del usuario válido por 24 horas.
                      </p>
                    </div>
                  </button>

                  {/* Card: Temp password */}
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-start gap-4 rounded-xl border-2 p-4 text-left transition-colors"
                    style={{
                      borderColor:
                        resetType === "temp"
                          ? "var(--accent)"
                          : "var(--border-subtle)",
                      backgroundColor:
                        resetType === "temp"
                          ? "var(--accent-soft)"
                          : "transparent",
                    }}
                    onClick={() => setResetType("temp")}
                  >
                    <KeyRound
                      className="mt-0.5 size-5 shrink-0"
                      style={{
                        color:
                          resetType === "temp"
                            ? "var(--accent)"
                            : "var(--foreground-muted)",
                      }}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        Contraseña temporal
                      </p>
                      <p className="mt-0.5 text-sm text-foreground-secondary">
                        Generás una contraseña que le comunicás manualmente.
                      </p>
                    </div>
                  </button>
                </div>
              </Modal.Body>

              <Modal.Footer className="flex shrink-0 justify-end gap-2 border-t border-border-subtle px-5 py-4 sm:px-6">
                <Button
                  variant="secondary"
                  onPress={() => resetModalState.close()}
                  isDisabled={resetSubmitting}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  className="bg-accent text-accent-text hover:bg-accent-hover"
                  isDisabled={resetSubmitting}
                  onPress={() => void submitReset()}
                >
                  {resetSubmitting ? "Enviando…" : "Confirmar"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </div>
  );
}
