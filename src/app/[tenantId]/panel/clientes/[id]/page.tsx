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
  BarChart2,
  Cake,
  CreditCard,
  DollarSign,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { z } from "zod";

import { DialogSuccess, DialogWarning } from "@/components/ui";
import type {
  Customer,
  CustomerWithMetrics,
  LoyaltyTier,
  OrderSummaryForCustomer,
} from "@/types/customer";

const money0 = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const moneyCompact = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
  notation: "compact",
  compactDisplay: "short",
});

const dateOrderFmt = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const MONTH_SHORT = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
] as const;

const MONTH_LONG = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

function initials(first: string, last: string): string {
  const a = first.trim().charAt(0);
  const b = last.trim().charAt(0);
  return `${a}${b}`.toUpperCase() || "?";
}

function waDigits(raw: string | null | undefined): string {
  if (!raw) {
    return "";
  }
  return raw.replace(/\D/g, "");
}

function tierBadgeVars(tier: LoyaltyTier): { bg: string; fg: string; label: string } {
  const labels: Record<LoyaltyTier, string> = {
    bronze: "Bronce",
    silver: "Plata",
    gold: "Oro",
    platinum: "Platino",
  };
  switch (tier) {
    case "bronze":
      return {
        bg: "var(--nuba-warning-soft)",
        fg: "var(--nuba-warning)",
        label: labels.bronze,
      };
    case "silver":
      return {
        bg: "var(--nuba-raised)",
        fg: "var(--nuba-fg-secondary)",
        label: labels.silver,
      };
    case "gold":
      return {
        bg: "var(--nuba-warning-soft)",
        fg: "var(--nuba-fg)",
        label: labels.gold,
      };
    case "platinum":
      return {
        bg: "var(--nuba-accent-soft)",
        fg: "var(--nuba-accent)",
        label: labels.platinum,
      };
    default:
      return {
        bg: "var(--nuba-raised)",
        fg: "var(--nuba-fg-secondary)",
        label: tier,
      };
  }
}

function daysUntilNextBirthday(birthdate: string | null): number | null {
  if (!birthdate || birthdate.length < 10) {
    return null;
  }
  const mm = Number.parseInt(birthdate.slice(5, 7), 10);
  const dd = Number.parseInt(birthdate.slice(8, 10), 10);
  if (!Number.isFinite(mm) || !Number.isFinite(dd) || mm < 1 || mm > 12) {
    return null;
  }
  const today = new Date();
  const y = today.getFullYear();
  let next = new Date(y, mm - 1, dd);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (next < startOfToday) {
    next = new Date(y + 1, mm - 1, dd);
  }
  return Math.round((next.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000));
}

function formatBirthdayDisplay(birthdate: string | null): string {
  if (!birthdate || birthdate.length < 10) {
    return "—";
  }
  const mm = Number.parseInt(birthdate.slice(5, 7), 10);
  const dd = Number.parseInt(birthdate.slice(8, 10), 10);
  if (!Number.isFinite(mm) || !Number.isFinite(dd)) {
    return birthdate;
  }
  return `${dd} de ${MONTH_LONG[mm - 1] ?? ""}`;
}

function channelLabel(type: string): string {
  switch (type) {
    case "dine_in":
      return "Salón";
    case "takeaway":
      return "Take away";
    case "delivery":
      return "Delivery";
    case "online":
      return "Online";
    default:
      return type;
  }
}

function parseMonthKey(key: string): { y: number; m0: number } | null {
  const p = key.split("-");
  if (p.length < 2) {
    return null;
  }
  const y = Number.parseInt(p[0]!, 10);
  const m0 = Number.parseInt(p[1]!, 10) - 1;
  if (!Number.isFinite(y) || !Number.isFinite(m0) || m0 < 0 || m0 > 11) {
    return null;
  }
  return { y, m0 };
}

function monthFullLabelEs(key: string): string {
  const p = parseMonthKey(key);
  if (!p) {
    return key;
  }
  return `${MONTH_LONG[p.m0] ?? key} ${p.y}`;
}

function buildLastSixMonthsChart(
  series: { month: string; count: number; total: number }[],
): { key: string; label: string; total: number; count: number }[] {
  const map = new Map(series.map((s) => [s.month, s]));
  const now = new Date();
  const out: { key: string; label: string; total: number; count: number }[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const row = map.get(key);
    out.push({
      key,
      label: MONTH_SHORT[d.getMonth()] ?? key,
      total: row?.total ?? 0,
      count: row?.count ?? 0,
    });
  }
  return out;
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

function customerToForm(c: CustomerWithMetrics): CustomerFormValues {
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

type OrdersListResponse = {
  data: OrderSummaryForCustomer[];
  total: number;
  page: number;
  totalPages: number;
};

export default function ClientePerfilPage() {
  const params = useParams<{ tenantId: string; id: string }>();
  const router = useRouter();
  const tenantId = params.tenantId ?? "";
  const customerId = params.id ?? "";

  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<CustomerWithMetrics | null>(null);
  const [gone404, setGone404] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const [orders, setOrders] = useState<OrderSummaryForCustomer[]>([]);
  const [ordersPageLoaded, setOrdersPageLoaded] = useState(0);
  const [ordersTotalPages, setOrdersTotalPages] = useState(1);
  const [ordersLoadingMore, setOrdersLoadingMore] = useState(false);

  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);

  const modalState = useOverlayState();
  const deleteDialog = useOverlayState();
  const [successOpen, setSuccessOpen] = useState(false);
  const [successCopy, setSuccessCopy] = useState({ title: "", description: "" });
  const [dupOpen, setDupOpen] = useState(false);

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
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
    },
  });

  const loadInitial = useCallback(async () => {
    if (!tenantId || !customerId) {
      return;
    }
    setLoading(true);
    setGone404(false);
    setLoadFailed(false);
    try {
      const ordersUrl = `/api/${tenantId}/clientes/${customerId}/ordenes?page=1&limit=10`;
      const [cRes, oRes] = await Promise.all([
        fetch(`/api/${tenantId}/clientes/${customerId}`, {
          cache: "no-store",
          credentials: "include",
        }),
        fetch(ordersUrl, { cache: "no-store", credentials: "include" }),
      ]);

      if (cRes.status === 404) {
        setGone404(true);
        setCustomer(null);
        setOrders([]);
        return;
      }

      if (!cRes.ok) {
        const j = (await cRes.json().catch(() => null)) as { error?: string } | null;
        toast.danger(j?.error ?? "No se pudo cargar el cliente");
        setCustomer(null);
        setLoadFailed(true);
        return;
      }

      const c = (await cRes.json()) as CustomerWithMetrics;
      setCustomer(c);
      setNotesDraft(c.notes ?? "");

      if (oRes.ok) {
        const oj = (await oRes.json()) as OrdersListResponse;
        setOrders(Array.isArray(oj.data) ? oj.data : []);
        setOrdersPageLoaded(1);
        setOrdersTotalPages(typeof oj.totalPages === "number" ? oj.totalPages : 1);
      } else {
        setOrders([]);
        setOrdersPageLoaded(0);
        setOrdersTotalPages(1);
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId, customerId]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const saveNotesBlur = useCallback(async () => {
    if (!customer || gone404) {
      return;
    }
    const next = notesDraft.trim();
    const prev = (customer.notes ?? "").trim();
    if (next === prev) {
      return;
    }
    setNotesSaving(true);
    try {
      const res = await fetch(`/api/${tenantId}/clientes/${customerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ notes: next === "" ? null : next }),
      });
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.danger(j?.error ?? "No se pudieron guardar las notas");
        setNotesDraft(customer.notes ?? "");
        return;
      }
      const updated = j as Customer;
      setCustomer((prev) =>
        prev && updated
          ? {
              ...prev,
              ...updated,
              metrics: prev.metrics,
            }
          : prev,
      );
      setNotesDraft(updated.notes ?? "");
    } finally {
      setNotesSaving(false);
    }
  }, [customer, gone404, notesDraft, tenantId, customerId]);

  const chartData = useMemo(() => {
    if (!customer) {
      return [];
    }
    return buildLastSixMonthsChart(customer.metrics.orders_by_month ?? []);
  }, [customer]);

  const chartHasValues = useMemo(
    () => chartData.some((d) => d.total > 0 || d.count > 0),
    [chartData],
  );

  const birthdayDays = useMemo(() => daysUntilNextBirthday(customer?.birthdate ?? null), [customer]);

  const openEdit = () => {
    if (!customer) {
      return;
    }
    form.reset(customerToForm(customer));
    modalState.open();
  };

  const submitEdit = form.handleSubmit(async (values) => {
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
    };
    const res = await fetch(`/api/${tenantId}/clientes/${customerId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify(payload),
    });
    if (res.status === 409) {
      setDupOpen(true);
      return;
    }
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      toast.danger(j?.error ?? "No se pudo guardar");
      return;
    }
    modalState.close();
    const updated = j as Customer;
    setCustomer((prev) =>
      prev && updated
        ? {
            ...prev,
            ...updated,
            metrics: prev.metrics,
          }
        : prev,
    );
    setNotesDraft(updated.notes ?? "");
    setSuccessCopy({
      title: "Cliente actualizado",
      description: "Los datos se guardaron correctamente.",
    });
    setSuccessOpen(true);
  });

  const loadMoreOrders = async () => {
    if (!tenantId || !customerId || ordersLoadingMore) {
      return;
    }
    const nextPage = ordersPageLoaded + 1;
    if (nextPage > ordersTotalPages) {
      return;
    }
    setOrdersLoadingMore(true);
    try {
      const res = await fetch(
        `/api/${tenantId}/clientes/${customerId}/ordenes?page=${nextPage}&limit=10`,
        { cache: "no-store", credentials: "include" },
      );
      const j = (await res.json()) as OrdersListResponse;
      if (!res.ok) {
        toast.danger("No se pudieron cargar más órdenes");
        return;
      }
      const chunk = Array.isArray(j.data) ? j.data : [];
      setOrders((prev) => {
        const seen = new Set(prev.map((o) => o.id));
        const merged = [...prev];
        for (const row of chunk) {
          if (!seen.has(row.id)) {
            seen.add(row.id);
            merged.push(row);
          }
        }
        return merged;
      });
      setOrdersPageLoaded(nextPage);
      setOrdersTotalPages(typeof j.totalPages === "number" ? j.totalPages : ordersTotalPages);
    } finally {
      setOrdersLoadingMore(false);
    }
  };

  const confirmDeactivate = async () => {
    const res = await fetch(`/api/${tenantId}/clientes/${customerId}`, {
      method: "DELETE",
      credentials: "include",
      cache: "no-store",
    });
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      throw new Error(j?.error ?? "No se pudo desactivar");
    }
    router.replace(`/${tenantId}/panel/clientes`);
  };

  const submitting = form.formState.isSubmitting;

  if (gone404) {
    return (
      <DialogWarning
        isOpen
        onClose={() => router.replace(`/${tenantId}/panel/clientes`)}
        title="Cliente no encontrado"
        description="No pudimos encontrar ese cliente en tu comercio."
        confirmLabel="Volver al listado"
      />
    );
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 lg:flex-row lg:items-start">
        <div className="w-full shrink-0 animate-pulse space-y-4 lg:w-1/3">
          <div className="h-64 rounded-xl border border-border-subtle bg-raised" />
          <div className="h-40 rounded-xl border border-border-subtle bg-raised" />
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="h-28 rounded-xl border border-border-subtle bg-raised" />
            <div className="h-28 rounded-xl border border-border-subtle bg-raised" />
            <div className="h-28 rounded-xl border border-border-subtle bg-raised" />
          </div>
          <div className="h-48 rounded-xl border border-border-subtle bg-raised" />
          <div className="h-56 rounded-xl border border-border-subtle bg-raised" />
          <div className="h-72 rounded-xl border border-border-subtle bg-raised" />
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <Text className="text-foreground-secondary">
          {loadFailed
            ? "No se pudo cargar el perfil del cliente."
            : "No hay datos para mostrar."}
        </Text>
        <Link
          href={`/${tenantId}/panel/clientes`}
          className="mt-4 inline-block text-sm font-medium text-accent underline-offset-2 hover:underline"
        >
          Volver al listado
        </Link>
      </div>
    );
  }

  const tier = tierBadgeVars(customer.loyalty_tier);
  const favs = (customer.metrics.favorite_products ?? []).slice(0, 3);
  const hasOrders = (customer.metrics.order_count ?? 0) > 0;

  return (
    <div className="mx-auto w-full px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/${tenantId}/panel/clientes`}
          className="text-sm font-medium text-accent underline-offset-2 hover:underline"
        >
          ← Clientes
        </Link>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <aside className="w-full shrink-0 space-y-4 lg:w-1/3">
          <section className="rounded-xl border border-border-subtle bg-surface/95 p-5 shadow-sm">
            <div className="flex flex-col items-center text-center">
              <div
                className="flex size-14 items-center justify-center rounded-full text-lg font-semibold"
                style={{
                  backgroundColor: "var(--accent-soft)",
                  color: "var(--accent)",
                }}
              >
                {initials(customer.first_name, customer.last_name)}
              </div>
              <h1
                className="mt-3 text-center font-semibold text-foreground"
                style={{ fontSize: "18px", fontWeight: 600 }}
              >
                {customer.first_name} {customer.last_name}
              </h1>
              <BadgeRoot
                variant="soft"
                className="mt-2 border border-border-subtle"
                style={{ backgroundColor: tier.bg, color: tier.fg }}
              >
                <BadgeLabel>{tier.label}</BadgeLabel>
              </BadgeRoot>
            </div>

            <ul className="mt-6 space-y-3 text-sm">
              {customer.email ? (
                <li className="flex gap-2">
                  <Mail className="mt-0.5 size-4 shrink-0 text-foreground-muted" aria-hidden />
                  <a
                    className="break-all text-accent underline-offset-2 hover:underline"
                    href={`mailto:${customer.email}`}
                  >
                    {customer.email}
                  </a>
                </li>
              ) : null}
              {customer.whatsapp ? (
                <li className="flex gap-2">
                  <MessageCircle
                    className="mt-0.5 size-4 shrink-0 text-foreground-muted"
                    aria-hidden
                  />
                  <a
                    className="break-all text-accent underline-offset-2 hover:underline"
                    href={`https://wa.me/${waDigits(customer.whatsapp)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {customer.whatsapp}
                  </a>
                </li>
              ) : null}
              {customer.phone ? (
                <li className="flex gap-2 text-foreground-secondary">
                  <Phone className="mt-0.5 size-4 shrink-0 text-foreground-muted" aria-hidden />
                  <span>{customer.phone}</span>
                </li>
              ) : null}
              {customer.dni ? (
                <li className="flex gap-2 text-foreground-secondary">
                  <CreditCard
                    className="mt-0.5 size-4 shrink-0 text-foreground-muted"
                    aria-hidden
                  />
                  <span>{customer.dni}</span>
                </li>
              ) : null}
              {customer.birthdate ? (
                <li className="flex flex-wrap items-center gap-2 text-foreground-secondary">
                  <Cake className="mt-0.5 size-4 shrink-0 text-foreground-muted" aria-hidden />
                  <span>{formatBirthdayDisplay(customer.birthdate)}</span>
                  {birthdayDays != null && birthdayDays >= 0 && birthdayDays <= 7 ? (
                    <BadgeRoot
                      variant="soft"
                      className="border border-border-subtle"
                      style={{
                        backgroundColor: "var(--accent-soft)",
                        color: "var(--accent)",
                      }}
                    >
                      <BadgeLabel>Cumpleaños próximo</BadgeLabel>
                    </BadgeRoot>
                  ) : null}
                </li>
              ) : null}
              {customer.city || customer.address ? (
                <li className="flex gap-2 text-foreground-secondary">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-foreground-muted" aria-hidden />
                  <span>
                    {[customer.city, customer.address].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ) : null}
            </ul>

            <div className="mt-6 border-t border-border-subtle pt-4">
              <Label className="mb-1 block text-sm text-foreground-secondary">Notas</Label>
              <textarea
                rows={4}
                className="w-full resize-y rounded-lg border border-border-subtle bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                onBlur={() => void saveNotesBlur()}
              />
              {notesSaving ? (
                <Text className="mt-1 text-xs text-foreground-muted">Guardando…</Text>
              ) : null}
            </div>

            <div className="mt-6 flex flex-col gap-2 border-t border-border-subtle pt-4 sm:flex-row">
              <Button
                variant="secondary"
                className="flex-1"
                onPress={openEdit}
                isDisabled={!customer.is_active}
              >
                Editar cliente
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onPress={() => deleteDialog.open()}
                isDisabled={!customer.is_active}
              >
                Desactivar
              </Button>
            </div>
          </section>
        </aside>

        <div className="min-w-0 flex-1 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="panel-glass rounded-xl p-4">
              <div className="flex items-start justify-between gap-2">
                <Text className="text-sm text-foreground-secondary">Total gastado</Text>
                <DollarSign className="size-5 text-foreground-muted" aria-hidden />
              </div>
              <p className="mt-2 text-lg font-semibold tabular-nums text-foreground">
                {money0.format(customer.metrics.total_spent)}
              </p>
            </div>
            <div className="panel-glass rounded-xl p-4">
              <div className="flex items-start justify-between gap-2">
                <Text className="text-sm text-foreground-secondary">Visitas</Text>
                <ShoppingBag className="size-5 text-foreground-muted" aria-hidden />
              </div>
              <p className="mt-2 text-lg font-semibold tabular-nums text-foreground">
                {customer.metrics.order_count}
              </p>
            </div>
            <div className="panel-glass rounded-xl p-4">
              <div className="flex items-start justify-between gap-2">
                <Text className="text-sm text-foreground-secondary">Ticket promedio</Text>
                <TrendingUp className="size-5 text-foreground-muted" aria-hidden />
              </div>
              <p className="mt-2 text-lg font-semibold tabular-nums text-foreground">
                {money0.format(customer.metrics.avg_ticket)}
              </p>
            </div>
          </div>

          <section className="rounded-xl border border-border-subtle bg-surface/95 p-5 shadow-sm">
            <Text className="text-base font-semibold text-foreground mr-2">Platos favoritos</Text>
            {!hasOrders || favs.length === 0 ? (
              <Text className="mt-4 text-sm text-foreground-secondary">
                Aún no hay órdenes registradas
              </Text>
            ) : (
              <ul className="mt-4 space-y-3">
                {favs.map((f) => (
                  <li key={f.product_id} className="flex items-center gap-3">
                    {f.image_url ? (
                      // URLs de producto externas / dinámicas: sin dominio fijo para `next/image`.
                      // eslint-disable-next-line @next/next/no-img-element -- ver comentario arriba
                      <img
                        src={f.image_url}
                        alt=""
                        className="size-8 shrink-0 rounded-md object-cover"
                        role="presentation"
                      />
                    ) : (
                      <div
                        className="flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold"
                        style={{
                          backgroundColor: "var(--accent-soft)",
                          color: "var(--accent)",
                        }}
                      >
                        {f.name.trim().charAt(0).toUpperCase() || "?"}
                      </div>
                    )}
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {f.name}
                    </span>
                    <BadgeRoot
                      variant="soft"
                      className="shrink-0 border border-border-subtle"
                      style={{
                        backgroundColor: "var(--accent-soft)",
                        color: "var(--accent)",
                      }}
                    >
                      <BadgeLabel>{f.times_ordered} veces</BadgeLabel>
                    </BadgeRoot>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-border-subtle bg-surface/95 p-5 shadow-sm">
            <Text className="text-base font-semibold text-foreground">
              Actividad — últimos 6 meses
            </Text>
            {!chartHasValues ? (
              <div className="mt-8 flex flex-col items-center gap-3 py-8 text-center">
                <BarChart2 className="size-10 text-foreground-muted" strokeWidth={1.25} aria-hidden />
                <Text className="text-sm text-foreground-secondary">
                  Sin actividad en este período
                </Text>
              </div>
            ) : (
              <div className="mt-4 h-72 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border-subtle)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "var(--foreground-muted)", fontSize: 12 }}
                      axisLine={{ stroke: "var(--border-subtle)" }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => moneyCompact.format(Number(v))}
                      tick={{ fill: "var(--foreground-muted)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={72}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--nuba-glass-surface)" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) {
                          return null;
                        }
                        const row = payload[0]!.payload as {
                          key: string;
                          total: number;
                          count: number;
                        };
                        return (
                          <div
                            className="rounded-lg border border-border-subtle px-3 py-2 text-sm shadow-md"
                            style={{
                              backgroundColor: "var(--background-surface)",
                              color: "var(--foreground)",
                            }}
                          >
                            <p className="font-medium capitalize">{monthFullLabelEs(row.key)}</p>
                            <p className="text-foreground-secondary">
                              Total: {money0.format(row.total)}
                            </p>
                            <p className="text-foreground-secondary">
                              Órdenes: {row.count}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="total" radius={[4, 4, 0, 0]} fill="var(--accent)" maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border-subtle bg-surface/95 p-5 shadow-sm">
            <Text className="text-base font-semibold text-foreground mr-2">Historial de órdenes</Text>
            {orders.length === 0 ? (
              <Text className="mt-4 text-sm text-foreground-secondary">
                No hay órdenes para este cliente.
              </Text>
            ) : (
              <>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b-[0.5px] border-border-subtle">
                        <th className="px-3 py-2 font-medium text-foreground-secondary">Fecha</th>
                        <th className="px-3 py-2 font-medium text-foreground-secondary">Canal</th>
                        <th className="px-3 py-2 font-medium text-foreground-secondary">Items</th>
                        <th className="px-3 py-2 font-medium text-foreground-secondary">Total</th>
                        <th className="px-3 py-2 font-medium text-foreground-secondary">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr
                          key={o.id}
                          className="border-b-[0.5px] border-border-subtle transition-colors hover:bg-background-raised"
                        >
                          <td className="px-3 py-2.5 text-foreground-secondary">
                            {dateOrderFmt.format(new Date(o.created_at))}
                          </td>
                          <td className="px-3 py-2.5">
                            <BadgeRoot variant="soft" className="border border-border-subtle bg-raised">
                              <BadgeLabel>{channelLabel(o.type)}</BadgeLabel>
                            </BadgeRoot>
                          </td>
                          <td className="max-w-[220px] px-3 py-2.5 text-foreground-secondary">
                            <span className="line-clamp-2">{o.items_preview || "—"}</span>
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-foreground">
                            {money0.format(o.total)}
                          </td>
                          <td className="px-3 py-2.5">
                            <BadgeRoot
                              variant="soft"
                              className="border border-border-subtle"
                              style={
                                o.status_color && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(o.status_color)
                                  ? {
                                      backgroundColor: `color-mix(in srgb, ${o.status_color} 22%, transparent)`,
                                      color: o.status_color,
                                    }
                                  : {
                                      backgroundColor: "var(--nuba-raised)",
                                      color: "var(--foreground)",
                                    }
                              }
                            >
                              <BadgeLabel>{o.status_label}</BadgeLabel>
                            </BadgeRoot>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {orders.length > 0 && ordersPageLoaded < ordersTotalPages ? (
                  <div className="mt-4 flex justify-center">
                    <Button
                      variant="secondary"
                      isDisabled={ordersLoadingMore}
                      onPress={() => void loadMoreOrders()}
                    >
                      Ver más
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>
      </div>

      <Modal.Root state={modalState}>
        <Modal.Backdrop className="z-200 flex items-center justify-center p-4" variant="blur">
          <Modal.Container placement="center" size="lg">
            <Modal.Dialog className="max-h-[90dvh] max-w-3xl overflow-hidden border border-border-subtle bg-surface/95 shadow-lg outline-none backdrop-blur-sm">
              <Modal.Header className="flex flex-row items-center justify-between gap-3 border-b border-border-subtle pb-3">
                <Modal.Heading className="flex-1">Editar cliente</Modal.Heading>
                <Modal.CloseTrigger aria-label="Cerrar" />
              </Modal.Header>
              <Modal.Body className="flex max-h-[calc(90dvh-7rem)] flex-col gap-4 overflow-y-auto">
                <form
                  id="edit-customer-form"
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitEdit();
                  }}
                >
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="e-fn">Nombre</Label>
                      <Input id="e-fn" variant="secondary" {...form.register("first_name")} />
                      {form.formState.errors.first_name?.message ? (
                        <Text className="text-xs text-danger">
                          {form.formState.errors.first_name.message}
                        </Text>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="e-ln">Apellido</Label>
                      <Input id="e-ln" variant="secondary" {...form.register("last_name")} />
                      {form.formState.errors.last_name?.message ? (
                        <Text className="text-xs text-danger">
                          {form.formState.errors.last_name.message}
                        </Text>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="e-em">Email</Label>
                      <Input id="e-em" variant="secondary" type="email" {...form.register("email")} />
                      {form.formState.errors.email?.message ? (
                        <Text className="text-xs text-danger">
                          {form.formState.errors.email.message}
                        </Text>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="e-wa">WhatsApp</Label>
                      <Input id="e-wa" variant="secondary" {...form.register("whatsapp")} />
                      {form.formState.errors.whatsapp?.message ? (
                        <Text className="text-xs text-danger">
                          {form.formState.errors.whatsapp.message}
                        </Text>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="e-ph">Teléfono</Label>
                      <Input id="e-ph" variant="secondary" {...form.register("phone")} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="e-dni">DNI</Label>
                      <Input id="e-dni" variant="secondary" {...form.register("dni")} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="e-bd">Fecha de nacimiento</Label>
                      <Input id="e-bd" variant="secondary" type="date" {...form.register("birthdate")} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="e-ci">Ciudad</Label>
                      <Input id="e-ci" variant="secondary" {...form.register("city")} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="e-ad">Dirección</Label>
                    <Input id="e-ad" variant="secondary" {...form.register("address")} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="e-no">Notas</Label>
                    <textarea
                      id="e-no"
                      rows={3}
                      className="w-full resize-y rounded-lg border border-border-subtle bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      {...form.register("notes")}
                    />
                  </div>
                </form>
              </Modal.Body>
              <Modal.Footer className="flex justify-end gap-2 border-t border-border-subtle">
                <Button variant="secondary" onPress={() => modalState.close()} isDisabled={submitting}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  form="edit-customer-form"
                  variant="primary"
                  className="bg-accent text-accent-text hover:bg-accent-hover"
                  isDisabled={submitting}
                >
                  Guardar
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
        description="El cliente no podrá asociarse a nuevas órdenes."
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={confirmDeactivate}
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
