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
  Pencil,
  Search,
  SearchX,
  ShoppingBag,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { PanelPageHeader } from "@/components/panel/PanelPageHeader";
import { DialogSuccess, DialogWarning, GeoSelector } from "@/components/ui";
import type { BranchListItem } from "@/lib/db/order-config";
import type { CustomerSummary } from "@/types/customer";

const PAGE_SIZE = 25;

const money0 = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const moneyAvg = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

type SortKey = "last_order_at" | "total_spent" | "order_count" | "name";

type ListResponse = {
  data: CustomerSummary[];
  total: number;
  page: number;
  totalPages: number;
};

function sortDirFor(key: SortKey): "asc" | "desc" {
  return key === "name" ? "asc" : "desc";
}

function formatRelativePast(iso: string | null): string {
  if (!iso) {
    return "Nunca";
  }
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 45) {
    return "hace un momento";
  }
  const min = Math.floor(sec / 60);
  if (min < 60) {
    return min === 1 ? "hace 1 minuto" : `hace ${min} minutos`;
  }
  const h = Math.floor(min / 60);
  if (h < 24) {
    return h === 1 ? "hace 1 hora" : `hace ${h} horas`;
  }
  const d = Math.floor(h / 24);
  if (d < 7) {
    return d === 1 ? "hace 1 día" : `hace ${d} días`;
  }
  const w = Math.floor(d / 7);
  if (w < 5) {
    return w === 1 ? "hace 1 semana" : `hace ${w} semanas`;
  }
  const mo = Math.floor(d / 30);
  if (mo < 12) {
    return mo <= 1 ? "hace 1 mes" : `hace ${mo} meses`;
  }
  const y = Math.floor(d / 365);
  return y <= 1 ? "hace 1 año" : `hace ${y} años`;
}

function initials(first: string, last: string): string {
  const a = first.trim().charAt(0);
  const b = last.trim().charAt(0);
  return `${a}${b}`.toUpperCase() || "?";
}

const customerFormSchema = z
  .object({
    first_name: z.string().min(1, "Requerido").max(100),
    last_name: z.string().min(1, "Requerido").max(100),
    email: z.string().trim().max(255).superRefine((s, ctx) => {
      if (s !== "" && !z.string().email().safeParse(s).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Email inválido",
        });
      }
    }),
    whatsapp: z.string().trim().superRefine((s, ctx) => {
      if (s !== "" && s.length < 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Mínimo 8 caracteres",
        });
      }
      if (s.length > 50) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Máximo 50 caracteres",
        });
      }
    }),
    phone: z.string().max(50),
    dni: z.string().max(20),
    birthdate: z.string().max(32),
    city: z.string().max(120),
    address: z.string().max(500),
    notes: z.string().max(500),
    branch_id: z.string().superRefine((s, ctx) => {
      if (s !== "" && !z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).safeParse(s).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Sucursal inválida",
        });
      }
    }),
  })
  .refine((d) => d.email.trim() !== "" || d.whatsapp.trim() !== "", {
    message: "Ingresá al menos email o WhatsApp",
    path: ["email"],
  });

type CustomerFormValues = z.infer<typeof customerFormSchema>;

const defaultFormValues: CustomerFormValues = {
  first_name: "",
  last_name: "",
  email: "",
  whatsapp: "",
  phone: "",
  dni: "",
  birthdate: "",
  city: "",
  address: "",
  notes: "",
  branch_id: "",
};

function summaryToFormValues(c: CustomerSummary): CustomerFormValues {
  return {
    first_name: c.first_name,
    last_name: c.last_name,
    email: c.email ?? "",
    whatsapp: c.whatsapp ?? "",
    phone: c.phone ?? "",
    dni: c.dni ?? "",
    birthdate: c.birthdate ?? "",
    city: c.city ?? "",
    address: c.address ?? "",
    notes: c.notes ?? "",
    branch_id: c.branch_id ?? "",
  };
}

export function ClientesClient({
  tenantId,
  branches,
  canMutate,
}: {
  tenantId: string;
  branches: BranchListItem[];
  canMutate: boolean;
}) {
  const showBranchSelect = branches.length > 1;

  const [rows, setRows] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalAllCustomers, setTotalAllCustomers] = useState<number | null>(null);
  const [activeCustomersTotal, setActiveCustomersTotal] = useState(0);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("last_order_at");
  const [activeOnly, setActiveOnly] = useState(true);

  const modalState = useOverlayState();
  const [editingId, setEditingId] = useState<string | null>(null);

  const deleteDialog = useOverlayState();
  const [pendingDelete, setPendingDelete] = useState<CustomerSummary | null>(null);

  const [successOpen, setSuccessOpen] = useState(false);
  const [successCopy, setSuccessCopy] = useState({ title: "", description: "" });

  const [dupOpen, setDupOpen] = useState(false);

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: defaultFormValues,
  });

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, sortKey, activeOnly]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const orderDir = sortDirFor(sortKey);
      const listParams = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        orderBy: sortKey,
        orderDir,
        isActive: activeOnly ? "true" : "false",
      });
      if (debouncedSearch) {
        listParams.set("search", debouncedSearch);
      }

      const allCountParams = new URLSearchParams({
        page: "1",
        limit: "1",
      });
      const activeCountParams = new URLSearchParams({
        page: "1",
        limit: "1",
        isActive: "true",
      });

      const [listRes, allRes, activeRes] = await Promise.all([
        fetch(`/api/${tenantId}/clientes?${listParams}`, {
          cache: "no-store",
          credentials: "include",
        }),
        fetch(`/api/${tenantId}/clientes?${allCountParams}`, {
          cache: "no-store",
          credentials: "include",
        }),
        fetch(`/api/${tenantId}/clientes?${activeCountParams}`, {
          cache: "no-store",
          credentials: "include",
        }),
      ]);

      const listJson = (await listRes.json().catch(() => null)) as
        | ListResponse
        | { error?: string }
        | null;
      if (!listRes.ok) {
        toast.danger(
          (listJson as { error?: string } | null)?.error ?? "No se pudieron cargar los clientes",
        );
        setRows([]);
        setTotal(0);
        setTotalPages(1);
        return;
      }
      const body = listJson as ListResponse;
      setRows(Array.isArray(body.data) ? body.data : []);
      setTotal(typeof body.total === "number" ? body.total : 0);
      setTotalPages(typeof body.totalPages === "number" ? body.totalPages : 1);

      const allJson = (await allRes.json().catch(() => null)) as { total?: number } | null;
      if (allRes.ok && allJson && typeof allJson.total === "number") {
        setTotalAllCustomers(allJson.total);
      }

      const actJson = (await activeRes.json().catch(() => null)) as { total?: number } | null;
      if (activeRes.ok && actJson && typeof actJson.total === "number") {
        setActiveCustomersTotal(actJson.total);
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId, page, debouncedSearch, sortKey, activeOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    form.reset(defaultFormValues);
    modalState.open();
  }

  function openEdit(c: CustomerSummary) {
    setEditingId(c.id);
    form.reset(summaryToFormValues(c));
    modalState.open();
  }

  function closeModal() {
    modalState.close();
    setEditingId(null);
  }

  const submitting = form.formState.isSubmitting;

  const submitCustomer = form.handleSubmit(async (values) => {
    const payload = {
      first_name: values.first_name.trim(),
      last_name: values.last_name.trim(),
      email: values.email.trim() === "" ? null : values.email.trim(),
      whatsapp: values.whatsapp.trim() === "" ? null : values.whatsapp.trim(),
      phone: values.phone.trim() === "" ? null : values.phone.trim(),
      dni: values.dni.trim() === "" ? null : values.dni.trim(),
      birthdate: values.birthdate.trim() === "" ? null : values.birthdate.trim(),
      city: values.city.trim() === "" ? null : values.city.trim(),
      address: values.address.trim() === "" ? null : values.address.trim(),
      notes: values.notes.trim() === "" ? null : values.notes.trim(),
      branch_id:
        showBranchSelect && values.branch_id.trim() !== ""
          ? values.branch_id.trim()
          : null,
    };

    const isEdit = editingId != null;
    const url = isEdit
      ? `/api/${tenantId}/clientes/${editingId}`
      : `/api/${tenantId}/clientes`;
    const res = await fetch(url, {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify(payload),
    });

    if (res.status === 409) {
      setDupOpen(true);
      return;
    }

    const j = (await res.json().catch(() => null)) as {
      error?: string;
      details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
    } | null;
    if (!res.ok) {
      if (res.status === 400 && j?.details?.fieldErrors) {
        const parts = Object.entries(j.details.fieldErrors)
          .flatMap(([k, msgs]) => (Array.isArray(msgs) ? msgs.map((m) => `${k}: ${m}`) : []))
          .slice(0, 4);
        if (parts.length) {
          toast.danger(`${j.error ?? "Datos inválidos"} — ${parts.join(" · ")}`);
          return;
        }
      }
      toast.danger(j?.error ?? "No se pudo guardar el cliente");
      return;
    }

    closeModal();
    setSuccessCopy({
      title: isEdit ? "Cliente actualizado" : "Cliente creado",
      description: isEdit
        ? "Los datos del cliente se guardaron correctamente."
        : "El cliente se registró correctamente.",
    });
    setSuccessOpen(true);
    await load();
  });

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }
    const res = await fetch(
      `/api/${tenantId}/clientes/${pendingDelete.id}`,
      {
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
      },
    );
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      throw new Error(j?.error ?? "No se pudo desactivar el cliente");
    }
    setSuccessCopy({
      title: "Cliente desactivado",
      description: `${pendingDelete.first_name} ${pendingDelete.last_name} ya no podrá asociarse a nuevas órdenes.`,
    });
    setSuccessOpen(true);
    setPendingDelete(null);
    await load();
  }

  const rangeLabel = useMemo(() => {
    if (total === 0) {
      return "0";
    }
    const from = (page - 1) * PAGE_SIZE + 1;
    const to = Math.min(page * PAGE_SIZE, total);
    return `${from}–${to}`;
  }, [page, total]);

  const emptyAbsolute =
    totalAllCustomers !== null && totalAllCustomers === 0 && !debouncedSearch;
  const emptySearch =
    !loading &&
    rows.length === 0 &&
    debouncedSearch !== "" &&
    totalAllCustomers !== null &&
    totalAllCustomers > 0;
  const emptyFiltered =
    !loading &&
    rows.length === 0 &&
    debouncedSearch === "" &&
    totalAllCustomers !== null &&
    totalAllCustomers > 0;

  return (
    <div className="flex flex-col gap-6">
      <PanelPageHeader
        title="Clientes"
        end={
          <div className="flex flex-wrap items-center gap-3">
            <BadgeRoot
              variant="soft"
              className="border border-border-subtle bg-raised text-foreground-secondary"
            >
              <BadgeLabel>{activeCustomersTotal} activos</BadgeLabel>
            </BadgeRoot>
            {canMutate ? (
              <Button
                variant="primary"
                className="bg-accent text-accent-text hover:bg-accent-hover"
                onPress={openCreate}
              >
                <span className="inline-flex items-center gap-2">
                  <UserPlus className="size-4 shrink-0" aria-hidden />
                  Nuevo cliente
                </span>
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface/90 p-4 backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-0 flex-1 sm:max-w-md">
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
              placeholder="Buscar por nombre, email o WhatsApp"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>
        <div className="w-full sm:w-56">
          <Label className="mb-1 block text-sm text-foreground-secondary">
            Ordenar por
          </Label>
          <select
            className="h-10 w-full rounded-lg border border-border-subtle bg-background px-2 text-sm text-foreground"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            <option value="last_order_at">Última visita</option>
            <option value="total_spent">Total gastado</option>
            <option value="order_count">Visitas</option>
            <option value="name">Nombre</option>
          </select>
        </div>
        <div className="flex items-center gap-2 pb-1">
          <SwitchRoot
            isSelected={activeOnly}
            onChange={(v) => setActiveOnly(v)}
          >
            <SwitchControl>
              <SwitchThumb />
            </SwitchControl>
          </SwitchRoot>
          <Text className="text-sm text-foreground-secondary">
            {activeOnly ? "Solo activos" : "Solo inactivos"}
          </Text>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface/90">
        <table className="w-full min-w-[960px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b-[0.5px] border-border-subtle bg-background/80">
              <th className="px-4 py-3 font-medium text-foreground-secondary">
                Cliente
              </th>
              <th className="px-4 py-3 font-medium text-foreground-secondary">
                Última visita
              </th>
              <th className="px-4 py-3 font-medium text-foreground-secondary">Visitas</th>
              <th className="px-4 py-3 font-medium text-foreground-secondary">
                Total gastado
              </th>
              <th className="px-4 py-3 font-medium text-foreground-secondary">Ticket medio</th>
              <th className="w-28 px-4 py-3 text-right font-medium text-foreground-secondary">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr
                    key={`sk-${i}`}
                    className="border-b-[0.5px] border-border-subtle"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="size-9 shrink-0 animate-pulse rounded-full"
                          style={{ backgroundColor: "var(--accent-soft)" }}
                        />
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <div className="h-4 w-40 animate-pulse rounded bg-raised" />
                          <div className="h-3 w-56 animate-pulse rounded bg-raised" />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-24 animate-pulse rounded bg-raised" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-12 animate-pulse rounded bg-raised" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-20 animate-pulse rounded bg-raised" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-16 animate-pulse rounded bg-raised" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="ml-auto h-8 w-20 animate-pulse rounded bg-raised" />
                    </td>
                  </tr>
                ))
              : rows.map((c) => {
                  const inactive = !c.is_active;
                  const subline = c.email?.trim() || c.whatsapp?.trim() || "—";
                  return (
                    <tr
                      key={c.id}
                      className="border-b-[0.5px] border-border-subtle transition-colors hover:bg-background-raised"
                      style={inactive ? { opacity: 0.5 } : undefined}
                    >
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                            style={{
                              backgroundColor: "var(--accent-soft)",
                              color: "var(--accent)",
                            }}
                          >
                            {initials(c.first_name, c.last_name)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-foreground">
                                {c.first_name} {c.last_name}
                              </span>
                              {inactive ? (
                                <BadgeRoot
                                  variant="soft"
                                  className="border border-border-subtle bg-danger-soft text-danger"
                                >
                                  <BadgeLabel>Inactivo</BadgeLabel>
                                </BadgeRoot>
                              ) : null}
                            </div>
                            <Text className="truncate text-xs text-foreground-muted">
                              {subline}
                            </Text>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle text-foreground-secondary">
                        {formatRelativePast(c.last_order_at)}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span className="inline-flex items-center gap-1.5 text-foreground">
                          <ShoppingBag className="size-3.5 shrink-0 text-foreground-muted" />
                          {c.order_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle tabular-nums text-foreground">
                        {money0.format(c.total_spent)}
                      </td>
                      <td
                        className={
                          c.order_count === 0
                            ? "px-4 py-3 align-middle tabular-nums text-foreground-muted"
                            : "px-4 py-3 align-middle tabular-nums text-foreground"
                        }
                      >
                        {moneyAvg.format(c.avg_ticket)}
                      </td>
                      <td className="px-4 py-3 align-middle text-right">
                        <div className="flex justify-end gap-1">
                          <Link
                            href={`/${tenantId}/panel/clientes/${c.id}`}
                            className="inline-flex size-8 items-center justify-center rounded-lg text-foreground hover:bg-background-raised"
                            aria-label="Ver cliente"
                          >
                            <Eye className="size-4" />
                          </Link>
                          {canMutate ? (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                isIconOnly
                                aria-label="Editar cliente"
                                onPress={() => openEdit(c)}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                isIconOnly
                                aria-label="Desactivar cliente"
                                onPress={() => {
                                  setPendingDelete(c);
                                  deleteDialog.open();
                                }}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>

        {!loading && rows.length === 0 && emptyAbsolute ? (
          <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <Users
              className="size-12 text-foreground-muted"
              strokeWidth={1.25}
              aria-hidden
            />
            <Text className="max-w-sm text-foreground-secondary">
              Todavía no hay clientes registrados.
            </Text>
            {canMutate ? (
              <Button
                variant="primary"
                className="bg-accent text-accent-text hover:bg-accent-hover"
                onPress={openCreate}
              >
                Crear el primero
              </Button>
            ) : null}
          </div>
        ) : null}

        {!loading && emptySearch ? (
          <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <SearchX
              className="size-12 text-foreground-muted"
              strokeWidth={1.25}
              aria-hidden
            />
            <Text className="max-w-sm text-foreground-secondary">
              Sin resultados para «{debouncedSearch}».
            </Text>
            <Button variant="secondary" onPress={() => setSearchInput("")}>
              Limpiar búsqueda
            </Button>
          </div>
        ) : null}

        {!loading && emptyFiltered && !emptyAbsolute ? (
          <div className="border-t border-border-subtle px-6 py-12 text-center">
            <Text className="text-sm text-foreground-secondary">
              {activeOnly
                ? "No hay clientes activos."
                : "No hay clientes inactivos."}
            </Text>
          </div>
        ) : null}
      </div>

      {!loading && total > 0 ? (
        <div className="flex flex-col gap-3 border-t border-border-subtle pt-2 sm:flex-row sm:items-center sm:justify-between">
          <Text className="text-sm text-foreground-secondary">
            Mostrando {rangeLabel} de {total} clientes
          </Text>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              isDisabled={page <= 1}
              onPress={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              size="sm"
              isDisabled={page >= totalPages}
              onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Siguiente
            </Button>
          </div>
        </div>
      ) : null}

      <Modal.Root state={modalState}>
        <Modal.Backdrop
          className="z-200 flex items-center justify-center p-3 sm:p-6"
          variant="blur"
        >
          <Modal.Container placement="center" size="lg">
            <Modal.Dialog className="flex max-h-[min(90dvh,920px)] w-[min(100vw-1.5rem,48rem)] max-w-none flex-col overflow-hidden border border-border-subtle bg-surface/95 shadow-lg outline-none backdrop-blur-sm sm:w-[min(100vw-3rem,48rem)]">
              <Modal.Header className="shrink-0 border-b border-border-subtle px-5 pb-3 pt-5 sm:px-6">
                <div className="flex flex-row items-start justify-between gap-3">
                  <Modal.Heading className="min-w-0 flex-1 pr-2">
                    {editingId ? "Editar cliente" : "Nuevo cliente"}
                  </Modal.Heading>
                  <Modal.CloseTrigger aria-label="Cerrar" className="shrink-0" />
                </div>
              </Modal.Header>
              <Modal.Body className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 sm:px-6 sm:py-5">
                <form
                  id="customer-form"
                  className="flex min-w-0 flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitCustomer();
                  }}
                >
                  <p className="border-l-2 border-accent pl-3 text-xs leading-relaxed text-foreground-secondary">
                    <span className="font-medium text-foreground">Campos obligatorios:</span>{" "}
                    nombre, apellido, y al menos uno entre{" "}
                    <span className="font-medium text-foreground">email</span> o{" "}
                    <span className="font-medium text-foreground">WhatsApp</span>. El resto es
                    opcional.
                  </p>
                  <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="min-w-0 flex flex-col gap-1">
                      <Label htmlFor="c-fn" className="flex flex-wrap items-baseline gap-1">
                        Nombre
                        <span className="text-xs font-normal text-danger">(obligatorio)</span>
                      </Label>
                      <Input
                        id="c-fn"
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
                    <div className="min-w-0 flex flex-col gap-1">
                      <Label htmlFor="c-ln" className="flex flex-wrap items-baseline gap-1">
                        Apellido
                        <span className="text-xs font-normal text-danger">(obligatorio)</span>
                      </Label>
                      <Input
                        id="c-ln"
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
                    <div className="min-w-0 flex flex-col gap-1 md:col-span-2">
                      <Text className="text-xs font-medium text-foreground-secondary">
                        Contacto — completá al menos uno (obligatorio)
                      </Text>
                    </div>
                    <div className="min-w-0 flex flex-col gap-1">
                      <Label htmlFor="c-em" className="flex flex-wrap items-baseline gap-1">
                        Email
                        <span className="text-xs font-normal text-foreground-muted">
                          (opcional si hay WhatsApp)
                        </span>
                      </Label>
                      <Input
                        id="c-em"
                        variant="secondary"
                        type="email"
                        className="w-full min-w-0"
                        {...form.register("email")}
                      />
                      {form.formState.errors.email?.message ? (
                        <Text className="text-xs text-danger">
                          {form.formState.errors.email.message}
                        </Text>
                      ) : null}
                    </div>
                    <div className="min-w-0 flex flex-col gap-1">
                      <Label htmlFor="c-wa" className="flex flex-wrap items-baseline gap-1">
                        WhatsApp
                        <span className="text-xs font-normal text-foreground-muted">
                          (opcional si hay email)
                        </span>
                      </Label>
                      <Input
                        id="c-wa"
                        variant="secondary"
                        className="w-full min-w-0"
                        {...form.register("whatsapp")}
                      />
                      {form.formState.errors.whatsapp?.message ? (
                        <Text className="text-xs text-danger">
                          {form.formState.errors.whatsapp.message}
                        </Text>
                      ) : null}
                    </div>
                    <div className="min-w-0 flex flex-col gap-1">
                      <Label htmlFor="c-ph" className="text-foreground-secondary">
                        Teléfono <span className="text-xs font-normal">(opcional)</span>
                      </Label>
                      <Input
                        id="c-ph"
                        variant="secondary"
                        className="w-full min-w-0"
                        {...form.register("phone")}
                      />
                    </div>
                    <div className="min-w-0 flex flex-col gap-1">
                      <Label htmlFor="c-dni" className="text-foreground-secondary">
                        DNI <span className="text-xs font-normal">(opcional)</span>
                      </Label>
                      <Input
                        id="c-dni"
                        variant="secondary"
                        className="w-full min-w-0"
                        {...form.register("dni")}
                      />
                    </div>
                    <div className="min-w-0 flex flex-col gap-1">
                      <Label htmlFor="c-bd" className="text-foreground-secondary">
                        Fecha de nacimiento <span className="text-xs font-normal">(opcional)</span>
                      </Label>
                      <Input
                        id="c-bd"
                        variant="secondary"
                        type="date"
                        className="w-full min-w-0"
                        {...form.register("birthdate")}
                      />
                    </div>
                    <div className="min-w-0 flex flex-col gap-1 md:col-span-2">
                      <GeoSelector
                        cityValue={form.watch("city")}
                        onCityChange={(v) =>
                          form.setValue("city", v ?? "", {
                            shouldValidate: true,
                          })
                        }
                      />
                    </div>
                    {showBranchSelect ? (
                      <div className="min-w-0 flex flex-col gap-1 md:col-span-2">
                        <Label htmlFor="c-br" className="text-foreground-secondary">
                          Sucursal <span className="text-xs font-normal">(opcional)</span>
                        </Label>
                        <select
                          id="c-br"
                          className="h-10 w-full min-w-0 rounded-lg border border-border-subtle bg-background px-3 text-sm text-foreground"
                          {...form.register("branch_id")}
                        >
                          <option value="">Sin sucursal</option>
                          {branches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex flex-col gap-1">
                    <Label htmlFor="c-ad" className="text-foreground-secondary">
                      Dirección <span className="text-xs font-normal">(opcional)</span>
                    </Label>
                    <Input
                      id="c-ad"
                      variant="secondary"
                      className="w-full min-w-0"
                      {...form.register("address")}
                    />
                  </div>
                  <div className="min-w-0 flex flex-col gap-1">
                    <Label htmlFor="c-no" className="text-foreground-secondary">
                      Notas <span className="text-xs font-normal">(opcional)</span>
                    </Label>
                    <textarea
                      id="c-no"
                      rows={3}
                      className="w-full min-w-0 resize-y rounded-lg border border-border-subtle bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      {...form.register("notes")}
                    />
                    {form.formState.errors.notes?.message ? (
                      <Text className="text-xs text-danger">
                        {form.formState.errors.notes.message}
                      </Text>
                    ) : null}
                  </div>
                </form>
              </Modal.Body>
              <Modal.Footer className="flex shrink-0 justify-end gap-2 border-t border-border-subtle px-5 py-4 sm:px-6">
                <Button variant="secondary" onPress={closeModal} isDisabled={submitting}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  form="customer-form"
                  variant="primary"
                  className="bg-accent text-accent-text hover:bg-accent-hover"
                  isDisabled={submitting}
                >
                  {editingId ? "Guardar" : "Crear cliente"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>

      <DialogWarning
        isOpen={deleteDialog.isOpen}
        onClose={deleteDialog.close}
        title="¿Eliminar cliente?"
        description={
          pendingDelete ? (
            <>
              ¿Eliminar a {pendingDelete.first_name} {pendingDelete.last_name}? El cliente no
              podrá asociarse a nuevas órdenes.
            </>
          ) : null
        }
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={confirmDelete}
      />

      <DialogWarning
        isOpen={dupOpen}
        onClose={() => setDupOpen(false)}
        title="Cliente duplicado"
        description="Ya existe un cliente con ese email o WhatsApp."
        confirmLabel="Entendido"
      />

      <DialogSuccess
        isOpen={successOpen}
        onClose={() => setSuccessOpen(false)}
        title={successCopy.title}
        description={successCopy.description}
      />
    </div>
  );
}
