"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import dynamic from "next/dynamic";
import type FullCalendarType from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";

const FullCalendar = dynamic(() => import("@fullcalendar/react"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: 500,
        background: "var(--background-raised)",
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--foreground-muted)",
        fontSize: 14,
      }}
    >
      Cargando calendario...
    </div>
  ),
}) as unknown as typeof FullCalendarType;

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
import {
  CalendarOff,
  CalendarPlus,
  Check,
  CheckCircle2,
  Clock,
  Mail,
  MapPin,
  Phone,
  Settings,
  User,
  UserX,
  Users,
  X,
} from "lucide-react";

import { PanelPageHeader } from "@/components/panel/PanelPageHeader";
import { DialogSuccess } from "@/components/ui/DialogSuccess";
import { DialogWarning } from "@/components/ui/DialogWarning";
import type { BlockedDate } from "@/lib/db/blocked-dates";
import type {
  Reservation,
  ReservationEvent,
  ReservationStatus,
} from "@/types/reservation";

// ─── Types ─────────────────────────────────────────────────────────────────────

type BranchOption = { id: string; name: string };
type TableOption = { id: string; name: string; capacity: number };
type CustomerOption = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
};

// ─── Constants ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ReservationStatus,
  { label: string; bg: string; color: string; opacity?: number }
> = {
  pendiente: {
    label: "Pendiente",
    bg: "var(--nuba-warning-soft)",
    color: "var(--nuba-warning)",
  },
  confirmada: {
    label: "Confirmada",
    bg: "var(--nuba-success-soft)",
    color: "var(--nuba-success)",
  },
  cancelada: {
    label: "Cancelada",
    bg: "var(--nuba-danger-soft)",
    color: "var(--nuba-danger)",
    opacity: 0.5,
  },
  completada: {
    label: "Completada",
    bg: "var(--nuba-accent-soft)",
    color: "var(--nuba-accent)",
  },
  no_show: {
    label: "No show",
    bg: "var(--nuba-raised)",
    color: "var(--nuba-fg-muted)",
    opacity: 0.5,
  },
};

const DURATION_OPTIONS = [
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hora" },
  { value: 90, label: "1h 30min" },
  { value: 120, label: "2 horas" },
  { value: 180, label: "3 horas" },
  { value: 240, label: "4 horas" },
];

const FC_STYLES = `
.fc-nuba .fc {
  --fc-border-color: var(--nuba-border-subtle);
  --fc-today-bg-color: var(--nuba-accent-soft);
  --fc-page-bg-color: transparent;
  --fc-neutral-bg-color: var(--nuba-surface);
  --fc-list-event-hover-bg-color: var(--nuba-raised);
  font-family: inherit;
  color: var(--nuba-fg);
}
.fc-nuba .fc .fc-button {
  background: var(--nuba-raised);
  border-color: var(--nuba-border-default);
  color: var(--nuba-fg);
  font-size: 0.8125rem;
  font-weight: 500;
  padding: 0.35rem 0.75rem;
  box-shadow: none;
  text-transform: none;
}
.fc-nuba .fc .fc-button:hover {
  background: var(--nuba-border-default);
  border-color: var(--nuba-border-default);
  color: var(--nuba-fg);
}
.fc-nuba .fc .fc-button-primary:not(:disabled).fc-button-active,
.fc-nuba .fc .fc-button-primary:not(:disabled):active {
  background: var(--nuba-accent);
  border-color: var(--nuba-accent);
  color: var(--nuba-accent-text);
}
.fc-nuba .fc .fc-button:focus {
  box-shadow: 0 0 0 2px var(--nuba-accent-soft);
  outline: none;
}
.fc-nuba .fc-theme-standard .fc-scrollgrid {
  border-color: var(--nuba-border-subtle);
}
.fc-nuba .fc-theme-standard td,
.fc-nuba .fc-theme-standard th {
  border-color: var(--nuba-border-subtle);
}
.fc-nuba .fc .fc-col-header-cell-cushion,
.fc-nuba .fc .fc-daygrid-day-number {
  color: var(--nuba-fg-secondary);
  text-decoration: none;
  font-size: 0.8125rem;
}
.fc-nuba .fc .fc-list-event-title a {
  color: var(--nuba-fg);
  text-decoration: none;
}
.fc-nuba .fc .fc-list-event-time {
  color: var(--nuba-fg-muted);
  font-size: 0.8125rem;
}
.fc-nuba .fc .fc-list-day-text,
.fc-nuba .fc .fc-list-day-side-text {
  color: var(--nuba-fg);
  text-decoration: none;
  font-size: 0.875rem;
}
.fc-nuba .fc .fc-list-empty {
  background: transparent;
  color: var(--nuba-fg-muted);
  font-size: 0.875rem;
}
.fc-nuba .fc .fc-toolbar-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--nuba-fg);
}
`;

// ─── Zod Schema ─────────────────────────────────────────────────────────────────

const reservationFormSchema = z.object({
  customer_name: z.string().min(1, "El nombre es requerido").max(255),
  customer_phone: z.string().optional().nullable(),
  customer_email: z
    .string()
    .optional()
    .nullable()
    .refine(
      (v) => !v || z.string().email().safeParse(v).success,
      "Email inválido",
    ),
  party_size: z.number().int().min(1, "Mínimo 1 persona").max(50),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida"),
  duration_min: z.number().int().min(30).max(480),
  branch_id: z.string().optional().nullable(),
  table_id: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  customer_id: z.string().optional().nullable(),
});

type ReservationFormValues = z.input<typeof reservationFormSchema>;

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatTodayLabel(): string {
  return new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(t: string): string {
  return t.slice(0, 5);
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────────

function StatusBadge({
  status,
  size = "sm",
}: {
  status: ReservationStatus;
  size?: "xs" | "sm";
}) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"}`}
      style={{
        background: cfg.bg,
        color: cfg.color,
        opacity: cfg.opacity,
      }}
    >
      {cfg.label}
    </span>
  );
}

// ─── TodayReservationItem ─────────────────────────────────────────────────────────

function TodayReservationItem({
  reservation: r,
  onOpen,
  onStatusChange,
}: {
  reservation: Reservation;
  onOpen: (r: Reservation) => void;
  onStatusChange: (
    id: string,
    action: "confirmar" | "cancelar" | "completar" | "no-show",
  ) => Promise<boolean>;
}) {
  const isDim =
    r.status === "cancelada" ||
    r.status === "completada" ||
    r.status === "no_show";

  return (
    <div
      className={`flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-raised ${isDim ? "opacity-50" : ""}`}
    >
      <button
        type="button"
        className="flex w-full items-start gap-3 text-left"
        onClick={() => onOpen(r)}
      >
        <span
          className="mt-0.5 shrink-0 text-sm font-semibold tabular-nums"
          style={{ color: "var(--nuba-accent)" }}
        >
          {formatTime(r.time)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {r.customer_name}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-foreground-muted">
            <Users size={11} />
            {r.party_size} personas
            {r.table ? (
              <>
                <span>·</span>
                <MapPin size={11} />
                {r.table.name}
              </>
            ) : (
              <>
                <span>·</span>Sin mesa asignada
              </>
            )}
          </p>
        </div>
        <StatusBadge status={r.status} size="xs" />
      </button>

      {r.status === "pendiente" && (
        <div className="flex gap-1.5">
          <button
            type="button"
            title="Confirmar"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
            style={{
              background: "var(--nuba-success-soft)",
              color: "var(--nuba-success)",
            }}
            onClick={() => void onStatusChange(r.id, "confirmar")}
          >
            <CheckCircle2 size={12} />
            Confirmar
          </button>
          <button
            type="button"
            title="Cancelar"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
            style={{
              background: "var(--nuba-danger-soft)",
              color: "var(--nuba-danger)",
            }}
            onClick={() => void onStatusChange(r.id, "cancelar")}
          >
            <X size={12} />
            Cancelar
          </button>
        </div>
      )}

      {r.status === "confirmada" && (
        <div className="flex gap-1.5">
          <button
            type="button"
            title="Completar"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
            style={{
              background: "var(--nuba-accent-soft)",
              color: "var(--nuba-accent)",
            }}
            onClick={() => void onStatusChange(r.id, "completar")}
          >
            <Check size={12} />
            Completar
          </button>
          <button
            type="button"
            title="No show"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
            style={{
              background: "var(--nuba-raised)",
              color: "var(--nuba-fg-muted)",
            }}
            onClick={() => void onStatusChange(r.id, "no-show")}
          >
            <UserX size={12} />
            No show
          </button>
          <button
            type="button"
            title="Cancelar"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
            style={{
              background: "var(--nuba-danger-soft)",
              color: "var(--nuba-danger)",
            }}
            onClick={() => void onStatusChange(r.id, "cancelar")}
          >
            <X size={12} />
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

// ─── DrawerContent ────────────────────────────────────────────────────────────────

function DrawerContent({
  reservation: r,
  tenantId,
  onClose,
  onEdit,
  onStatusChange,
}: {
  reservation: Reservation;
  tenantId: string;
  onClose: () => void;
  onEdit: (r: Reservation) => void;
  onStatusChange: (
    id: string,
    action: "confirmar" | "cancelar" | "completar" | "no-show",
  ) => Promise<boolean>;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4"
        style={{ borderColor: "var(--nuba-border-subtle)" }}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-foreground">
            {r.customer_name}
          </p>
          <div className="mt-1">
            <StatusBadge status={r.status} />
          </div>
        </div>
        <button
          type="button"
          aria-label="Cerrar"
          className="shrink-0 rounded-lg p-1 transition-colors hover:bg-raised"
          onClick={onClose}
        >
          <X size={18} style={{ color: "var(--nuba-fg-muted)" }} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-5">
          {/* Fecha / hora / personas / mesa */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
              Detalles
            </p>
            <div className="grid grid-cols-2 gap-3">
              <InfoCell label="Fecha" value={formatDateLabel(r.date)} />
              <InfoCell label="Hora" value={formatTime(r.time)} />
              <InfoCell
                label="Duración"
                value={`${r.duration_min} min`}
              />
              <InfoCell
                label="Personas"
                value={
                  <span className="flex items-center gap-1">
                    <Users size={12} />
                    {r.party_size}
                  </span>
                }
              />
              {r.table && (
                <InfoCell label="Mesa" value={r.table.name} />
              )}
              {r.branch && (
                <InfoCell label="Sucursal" value={r.branch.name} />
              )}
            </div>
          </div>

          {/* Contacto */}
          {(r.customer_phone || r.customer_email) && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                Contacto
              </p>
              <div className="flex flex-col gap-1.5">
                {r.customer_phone && (
                  <a
                    href={`tel:${r.customer_phone}`}
                    className="flex items-center gap-2 text-sm transition-colors hover:text-accent"
                    style={{ color: "var(--nuba-fg-secondary)" }}
                  >
                    <Phone
                      size={14}
                      style={{ color: "var(--nuba-fg-muted)" }}
                    />
                    {r.customer_phone}
                  </a>
                )}
                {r.customer_email && (
                  <a
                    href={`mailto:${r.customer_email}`}
                    className="flex items-center gap-2 text-sm transition-colors hover:text-accent"
                    style={{ color: "var(--nuba-fg-secondary)" }}
                  >
                    <Mail
                      size={14}
                      style={{ color: "var(--nuba-fg-muted)" }}
                    />
                    {r.customer_email}
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Notas */}
          {r.notes && (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                Notas
              </p>
              <p
                className="rounded-lg p-3 text-sm"
                style={{
                  background: "var(--nuba-raised)",
                  color: "var(--nuba-fg-secondary)",
                }}
              >
                {r.notes}
              </p>
            </div>
          )}

          {/* Perfil del cliente */}
          {r.customer_id && (
            <Link
              href={`/${tenantId}/panel/clientes/${r.customer_id}`}
              className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-raised"
              style={{ borderColor: "var(--nuba-border-subtle)" }}
              onClick={onClose}
            >
              <span className="flex items-center gap-2 text-foreground">
                <User size={14} style={{ color: "var(--nuba-fg-muted)" }} />
                Ver perfil del cliente
              </span>
              <span style={{ color: "var(--nuba-fg-muted)" }}>→</span>
            </Link>
          )}

          {/* Acciones de estado */}
          {r.status === "pendiente" && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                Acciones
              </p>
              <div className="flex flex-col gap-2">
                <ActionButton
                  label="Confirmar reserva"
                  icon={<CheckCircle2 size={14} />}
                  bg="var(--nuba-success-soft)"
                  color="var(--nuba-success)"
                  onClick={() => void onStatusChange(r.id, "confirmar")}
                />
                <ActionButton
                  label="Cancelar reserva"
                  icon={<X size={14} />}
                  bg="var(--nuba-danger-soft)"
                  color="var(--nuba-danger)"
                  onClick={() => void onStatusChange(r.id, "cancelar")}
                />
              </div>
            </div>
          )}

          {r.status === "confirmada" && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                Acciones
              </p>
              <div className="flex flex-col gap-2">
                <ActionButton
                  label="Marcar como completada"
                  icon={<Check size={14} />}
                  bg="var(--nuba-accent-soft)"
                  color="var(--nuba-accent)"
                  onClick={() => void onStatusChange(r.id, "completar")}
                />
                <ActionButton
                  label="No show"
                  icon={<UserX size={14} />}
                  bg="var(--nuba-raised)"
                  color="var(--nuba-fg-muted)"
                  onClick={() => void onStatusChange(r.id, "no-show")}
                />
                <ActionButton
                  label="Cancelar reserva"
                  icon={<X size={14} />}
                  bg="var(--nuba-danger-soft)"
                  color="var(--nuba-danger)"
                  onClick={() => void onStatusChange(r.id, "cancelar")}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div
        className="shrink-0 border-t px-5 py-4"
        style={{ borderColor: "var(--nuba-border-subtle)" }}
      >
        <Button
          className="w-full"
          variant="secondary"
          onPress={() => {
            onEdit(r);
            onClose();
          }}
        >
          Editar reserva
        </Button>
      </div>
    </div>
  );
}

function InfoCell({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-foreground-muted">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  bg,
  color,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  bg: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
      style={{ background: bg, color }}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────────

export default function CalendarioPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = params.tenantId;

  // Feature flags
  const [reservationsEnabled, setReservationsEnabled] = useState<
    boolean | null
  >(null);
  const [holidayBlocking, setHolidayBlocking] = useState(false);

  // Blocked dates
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);

  // Unlock / relock dialogs
  const [selectedBlockedDate, setSelectedBlockedDate] =
    useState<BlockedDate | null>(null);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [showRelockDialog, setShowRelockDialog] = useState(false);

  // Branches for modal
  const [branches, setBranches] = useState<BranchOption[]>([]);

  // Today's reservations (right panel)
  const [todayReservations, setTodayReservations] = useState<Reservation[]>([]);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerReservation, setDrawerReservation] =
    useState<Reservation | null>(null);

  // Create/edit modal
  const modalState = useOverlayState();
  const [editingReservation, setEditingReservation] =
    useState<Reservation | null>(null);

  // Feedback
  const [successOpen, setSuccessOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState({
    title: "",
    description: "",
  });
  const [warnOpen, setWarnOpen] = useState(false);
  const [warnMsg, setWarnMsg] = useState("");

  // Table availability
  const [availableTables, setAvailableTables] = useState<TableOption[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesReady, setTablesReady] = useState(false);

  // Customer search
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);

  const calendarRef = useRef<FullCalendar>(null);

  // ─── Form ──────────────────────────────────────────────────────────────────────

  const form = useForm<ReservationFormValues>({
    resolver: zodResolver(reservationFormSchema),
    defaultValues: {
      customer_name: "",
      customer_phone: "",
      customer_email: "",
      party_size: 2,
      date: todayIso(),
      time: "20:00",
      duration_min: 90,
      branch_id: null,
      table_id: null,
      notes: "",
      customer_id: null,
    },
  });

  const watchDate = form.watch("date");
  const watchTime = form.watch("time");
  const watchDuration = form.watch("duration_min");
  const watchPartySize = form.watch("party_size");
  const watchBranchId = form.watch("branch_id");

  // ─── Load feature flags + branches ────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      fetch(`/api/${tenantId}/banderas`, { credentials: "include" }).then((r) =>
        r.json(),
      ),
      fetch(`/api/${tenantId}/sucursales`, { credentials: "include" }).then(
        (r) => (r.ok ? r.json() : []),
      ),
    ])
      .then(([flagsData, branchesData]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const flags = (flagsData as any).flags ?? {};
        setReservationsEnabled(flags.enable_reservations ?? false);
        setHolidayBlocking(flags.enable_holiday_blocking ?? false);
        setBranches(
          Array.isArray(branchesData)
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              branchesData.map((b: any) => ({ id: b.id, name: b.name }))
            : [],
        );
      })
      .catch(() => setReservationsEnabled(false));
  }, [tenantId]);

  // ─── Load today's reservations ─────────────────────────────────────────────────

  const loadToday = useCallback(async () => {
    const today = todayIso();
    const res = await fetch(
      `/api/${tenantId}/reservas?dateFrom=${today}&dateTo=${today}`,
      { cache: "no-store", credentials: "include" },
    );
    if (res.ok) {
      const data = (await res.json()) as Reservation[];
      setTodayReservations(Array.isArray(data) ? data : []);
    }
  }, [tenantId]);

  useEffect(() => {
    if (reservationsEnabled) void loadToday();
  }, [reservationsEnabled, loadToday]);

  // ─── Table availability ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!modalState.isOpen || !watchDate || !watchTime) return;
    const partySize = Number(watchPartySize);
    if (!partySize || partySize < 1) return;

    setTablesLoading(true);
    setTablesReady(false);

    const timer = setTimeout(async () => {
      try {
        const sp = new URLSearchParams({
          date: watchDate,
          time: watchTime,
          durationMin: String(watchDuration || 90),
          partySize: String(partySize),
          ...(watchBranchId ? { branchId: watchBranchId } : {}),
        });
        const res = await fetch(
          `/api/${tenantId}/reservas/disponibilidad?${sp.toString()}`,
          { credentials: "include" },
        );
        if (res.ok) {
          const data = (await res.json()) as TableOption[];
          setAvailableTables(Array.isArray(data) ? data : []);
        }
      } finally {
        setTablesLoading(false);
        setTablesReady(true);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [
    watchDate,
    watchTime,
    watchDuration,
    watchPartySize,
    watchBranchId,
    modalState.isOpen,
    tenantId,
  ]);

  // ─── Customer search ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (customerSearch.length < 2) {
      setCustomerResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await fetch(
        `/api/${tenantId}/clientes?search=${encodeURIComponent(customerSearch)}&limit=8`,
        { credentials: "include" },
      );
      if (res.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (await res.json()) as any;
        setCustomerResults(data.customers ?? []);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch, tenantId]);

  // ─── Status actions ────────────────────────────────────────────────────────────

  const changeStatus = useCallback(
    async (
      id: string,
      action: "confirmar" | "cancelar" | "completar" | "no-show",
    ): Promise<boolean> => {
      const res = await fetch(`/api/${tenantId}/reservas/${id}/${action}`, {
        method: "PATCH",
        credentials: "include",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.danger(j?.error ?? "Error al actualizar la reserva");
        return false;
      }
      await loadToday();
      calendarRef.current?.getApi().refetchEvents();
      if (drawerReservation?.id === id) {
        const updated = await fetch(`/api/${tenantId}/reservas/${id}`, {
          credentials: "include",
        });
        if (updated.ok) {
          const data = (await updated.json()) as Reservation;
          setDrawerReservation(data);
        }
      }
      return true;
    },
    [tenantId, loadToday, drawerReservation],
  );

  // ─── Modal helpers ─────────────────────────────────────────────────────────────

  function openCreate() {
    setEditingReservation(null);
    form.reset({
      customer_name: "",
      customer_phone: "",
      customer_email: "",
      party_size: 2,
      date: todayIso(),
      time: "20:00",
      duration_min: 90,
      branch_id: null,
      table_id: null,
      notes: "",
      customer_id: null,
    });
    setAvailableTables([]);
    setTablesReady(false);
    setCustomerSearch("");
    setCustomerResults([]);
    modalState.open();
  }

  function openEdit(r: Reservation) {
    setEditingReservation(r);
    form.reset({
      customer_name: r.customer_name,
      customer_phone: r.customer_phone ?? "",
      customer_email: r.customer_email ?? "",
      party_size: r.party_size,
      date: r.date,
      time: r.time,
      duration_min: r.duration_min,
      branch_id: r.branch_id ?? null,
      table_id: r.table_id ?? null,
      notes: r.notes ?? "",
      customer_id: r.customer_id ?? null,
    });
    setAvailableTables([]);
    setTablesReady(false);
    setCustomerSearch("");
    setCustomerResults([]);
    modalState.open();
  }

  // ─── Submit ────────────────────────────────────────────────────────────────────

  const onSubmit = form.handleSubmit(async (values) => {
    const isCreating = !editingReservation;
    const url = isCreating
      ? `/api/${tenantId}/reservas`
      : `/api/${tenantId}/reservas/${editingReservation!.id}`;

    const body = {
      ...values,
      customer_phone: values.customer_phone || null,
      customer_email: values.customer_email || null,
      notes: values.notes || null,
      branch_id: values.branch_id || null,
      table_id: values.table_id || null,
      customer_id: values.customer_id || null,
      created_by: "admin" as const,
    };

    const res = await fetch(url, {
      method: isCreating ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });

    const j = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;

    if (!res.ok) {
      if (res.status === 409) {
        setWarnMsg(j?.error ?? "La mesa no está disponible en ese horario");
        setWarnOpen(true);
      } else {
        toast.danger(j?.error ?? "Error al guardar la reserva");
      }
      return;
    }

    if (values.customer_email) {
      toast.success("Confirmación enviada por email");
    }

    modalState.close();
    setSuccessMsg({
      title: isCreating ? "Reserva creada" : "Reserva actualizada",
      description: isCreating
        ? `Reserva confirmada para ${values.customer_name}`
        : "Los cambios se guardaron correctamente.",
    });
    setSuccessOpen(true);
    await loadToday();
    calendarRef.current?.getApi().refetchEvents();
  });

  // ─── FullCalendar events ───────────────────────────────────────────────────────

  const fetchCalendarEvents = useCallback(
    (
      fetchInfo: { startStr: string; endStr: string },
      successCallback: (events: unknown[]) => void,
      failureCallback: (error: Error) => void,
    ) => {
      const dateFrom = fetchInfo.startStr.slice(0, 10);
      const dateTo = fetchInfo.endStr.slice(0, 10);

      Promise.all([
        fetch(
          `/api/${tenantId}/reservas/calendario?dateFrom=${dateFrom}&dateTo=${dateTo}`,
          { credentials: "include" },
        ).then((r) =>
          r.ok
            ? (r.json() as Promise<ReservationEvent[]>)
            : Promise.reject(new Error("Error al cargar reservas")),
        ),
        holidayBlocking
          ? fetch(
              `/api/${tenantId}/feriados?dateFrom=${dateFrom}&dateTo=${dateTo}`,
              { credentials: "include" },
            ).then((r) =>
              r.ok ? (r.json() as Promise<BlockedDate[]>) : ([] as BlockedDate[]),
            )
          : Promise.resolve([] as BlockedDate[]),
      ])
        .then(([reservas, feriados]) => {
          setBlockedDates(feriados);

          // Auto-sync if no holidays loaded yet for current year
          const currentYear = new Date().getFullYear();
          if (
            holidayBlocking &&
            feriados.filter(
              (f) =>
                f.date.startsWith(String(currentYear)) &&
                f.reason === "feriado",
            ).length === 0
          ) {
            void fetch(`/api/${tenantId}/feriados/sincronizar`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ year: currentYear }),
            })
              .then(() =>
                fetch(
                  `/api/${tenantId}/feriados?dateFrom=${dateFrom}&dateTo=${dateTo}`,
                  { credentials: "include" },
                ),
              )
              .then((r) =>
                r.ok ? (r.json() as Promise<BlockedDate[]>) : ([] as BlockedDate[]),
              )
              .then((synced) => setBlockedDates(synced))
              .catch(() => null);
          }

          const blockedEvents = feriados
            .filter((f) => !f.is_unlocked)
            .map((f) => ({
              id: `blocked-${f.date}`,
              start: f.date,
              display: "background",
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              classNames: ["blocked-day"],
              extendedProps: { type: "blocked", blocked: f },
            }));

          const unlockedEvents = feriados
            .filter((f) => f.is_unlocked)
            .map((f) => ({
              id: `unlocked-${f.date}`,
              start: f.date,
              display: "background",
              backgroundColor: "rgba(251, 191, 36, 0.15)",
              extendedProps: { type: "unlocked", blocked: f },
            }));

          successCallback([...reservas, ...blockedEvents, ...unlockedEvents]);
        })
        .catch((e: Error) => failureCallback(e));
    },
    [tenantId, holidayBlocking],
  );

  // ─── Drawer ────────────────────────────────────────────────────────────────────

  function openDrawer(r: Reservation) {
    setDrawerReservation(r);
    setDrawerOpen(true);
  }

  // ─── Date click (blocked day handling) ─────────────────────────────────────────

  function handleDateClick(info: { dateStr: string }) {
    const dateStr = info.dateStr;
    const blocked = blockedDates.find((f) => f.date === dateStr);

    if (blocked && !blocked.is_unlocked) {
      setSelectedBlockedDate(blocked);
      setShowUnlockDialog(true);
    } else if (blocked?.is_unlocked) {
      setSelectedBlockedDate(blocked);
      setShowRelockDialog(true);
    } else {
      // Normal day — open create modal with pre-filled date
      setEditingReservation(null);
      form.reset({
        customer_name: "",
        customer_phone: "",
        customer_email: "",
        party_size: 2,
        date: dateStr,
        time: "20:00",
        duration_min: 90,
        branch_id: null,
        table_id: null,
        notes: "",
        customer_id: null,
      });
      setAvailableTables([]);
      setTablesReady(false);
      setCustomerSearch("");
      setCustomerResults([]);
      modalState.open();
    }
  }

  // ─── Unlock / relock ──────────────────────────────────────────────────────────

  async function confirmUnlock() {
    if (!selectedBlockedDate) return;
    setShowUnlockDialog(false);
    const res = await fetch(
      `/api/${tenantId}/feriados/${selectedBlockedDate.date}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "unlock" }),
      },
    );
    if (res.ok) {
      setSuccessMsg({
        title: "Día desbloqueado",
        description: "El día quedó habilitado para recibir reservas.",
      });
      setSuccessOpen(true);
      calendarRef.current?.getApi().refetchEvents();
    } else {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      setWarnMsg(j?.error ?? "No se pudo desbloquear el día");
      setWarnOpen(true);
    }
    setSelectedBlockedDate(null);
  }

  async function confirmRelock() {
    if (!selectedBlockedDate) return;
    setShowRelockDialog(false);
    const res = await fetch(
      `/api/${tenantId}/feriados/${selectedBlockedDate.date}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "relock" }),
      },
    );
    if (res.ok) {
      setSuccessMsg({
        title: "Día bloqueado",
        description: "El feriado volvió a estar bloqueado para reservas.",
      });
      setSuccessOpen(true);
      calendarRef.current?.getApi().refetchEvents();
    } else {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      setWarnMsg(j?.error ?? "No se pudo bloquear el día");
      setWarnOpen(true);
    }
    setSelectedBlockedDate(null);
  }

  // ─── Conditional renders ────────────────────────────────────────────────────────

  if (reservationsEnabled === null) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-raised" />
        <div className="h-[500px] animate-pulse rounded-xl bg-raised" />
      </div>
    );
  }

  if (!reservationsEnabled) {
    return (
      <div
        className="flex flex-col items-center gap-6 rounded-xl border py-24 text-center"
        style={{
          background: "var(--nuba-surface)",
          borderColor: "var(--nuba-border-subtle)",
        }}
      >
        <CalendarOff
          size={48}
          strokeWidth={1.25}
          style={{ color: "var(--nuba-fg-muted)" }}
        />
        <div className="flex flex-col gap-1">
          <Text className="text-base font-semibold text-foreground">
            Las reservas no están habilitadas para tu local
          </Text>
          <Text className="text-sm text-foreground-secondary">
            Activá la funcionalidad para empezar a gestionar reservas.
          </Text>
        </div>
        <Link href={`/${tenantId}/panel/administracion`}>
          <Button
            variant="primary"
            className="bg-accent text-accent-text hover:bg-accent-hover"
          >
            <Settings size={16} />
            Activar en Administración
          </Button>
        </Link>
      </div>
    );
  }

  // ─── Main render ────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{FC_STYLES}</style>

      <DialogSuccess
        isOpen={successOpen}
        onClose={() => setSuccessOpen(false)}
        title={successMsg.title}
        description={successMsg.description}
      />
      <DialogWarning
        isOpen={warnOpen}
        onClose={() => setWarnOpen(false)}
        title="Mesa no disponible"
        description={warnMsg}
        confirmLabel="Entendido"
        cancelLabel="Cerrar"
        onConfirm={() => setWarnOpen(false)}
      />
      <DialogWarning
        isOpen={showUnlockDialog}
        onClose={() => {
          setShowUnlockDialog(false);
          setSelectedBlockedDate(null);
        }}
        title={`Desbloquear ${selectedBlockedDate?.holiday_name ?? selectedBlockedDate?.date ?? ""}`}
        description="Este día está bloqueado como feriado. ¿Querés habilitarlo para recibir reservas?"
        confirmLabel="Sí, desbloquear"
        cancelLabel="Cancelar"
        onConfirm={() => void confirmUnlock()}
      />
      <DialogWarning
        isOpen={showRelockDialog}
        onClose={() => {
          setShowRelockDialog(false);
          setSelectedBlockedDate(null);
        }}
        title={`¿Volver a bloquear ${selectedBlockedDate?.date ?? ""}?`}
        description="Este feriado estaba desbloqueado. ¿Querés volver a bloquearlo para reservas?"
        confirmLabel="Sí, bloquear"
        cancelLabel="Cancelar"
        onConfirm={() => void confirmRelock()}
      />

      {/* Drawer backdrop */}
      {drawerOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40"
          style={{ background: "var(--nuba-scrim)" }}
          aria-label="Cerrar panel de detalle"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-[min(100vw,420px)] border-l shadow-2xl transition-transform duration-300 ${drawerOpen ? "translate-x-0" : "translate-x-full"}`}
        style={{
          background: "var(--nuba-surface)",
          borderColor: "var(--nuba-border-subtle)",
        }}
      >
        {drawerReservation && (
          <DrawerContent
            reservation={drawerReservation}
            tenantId={tenantId}
            onClose={() => setDrawerOpen(false)}
            onEdit={openEdit}
            onStatusChange={changeStatus}
          />
        )}
      </div>

      {/* Header */}
      <PanelPageHeader
        title="Reservas"
        end={
          <div className="flex flex-wrap items-center gap-3">
            <BadgeRoot variant="soft">
              <BadgeLabel>{todayReservations.length} hoy</BadgeLabel>
            </BadgeRoot>
            <Button
              variant="primary"
              className="bg-accent text-accent-text hover:bg-accent-hover"
              onPress={openCreate}
            >
              <CalendarPlus size={16} />
              Nueva reserva
            </Button>
          </div>
        }
      />

      {/* Two-column layout */}
      <div className="mt-4 flex flex-col gap-4 lg:flex-row">
        {/* Left — FullCalendar (70%) */}
        <div
          className="min-w-0 flex-1 rounded-xl border p-3 md:p-4"
          style={{
            background: "var(--nuba-glass-surface)",
            backdropFilter: "blur(var(--nuba-glass-blur-sm))",
            borderColor: "var(--nuba-border-subtle)",
          }}
        >
          <div className="fc-nuba">
            <FullCalendar
              ref={calendarRef}
              plugins={[
                dayGridPlugin,
                timeGridPlugin,
                listPlugin,
                interactionPlugin,
              ]}
              initialView="listWeek"
              locale="es"
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,timeGridWeek,listWeek",
              }}
              buttonText={{
                today: "Hoy",
                month: "Mes",
                week: "Semana",
                list: "Agenda",
              }}
              events={fetchCalendarEvents}
              eventClick={(arg) => {
                // Only open drawer for actual reservation events
                if (arg.event.extendedProps?.type === "blocked" || arg.event.extendedProps?.type === "unlocked") return;
                const r = arg.event.extendedProps as Reservation;
                openDrawer(r);
              }}
              dateClick={handleDateClick}
              height="auto"
              eventDisplay="block"
              noEventsContent="Sin reservas en este período"
              dayMaxEvents={3}
            />
          </div>

          {/* Legend */}
          {holidayBlocking && (
            <div
              className="mt-3 flex flex-wrap gap-4 border-t pt-3 text-xs"
              style={{
                borderColor: "var(--nuba-border-subtle)",
                color: "var(--nuba-fg-muted)",
              }}
            >
              <span className="flex items-center gap-1.5">
                <span
                  style={{
                    display: "inline-block",
                    width: 12,
                    height: 12,
                    borderRadius: 2,
                    background: "rgba(239,68,68,0.3)",
                    flexShrink: 0,
                  }}
                />
                Día bloqueado
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  style={{
                    display: "inline-block",
                    width: 12,
                    height: 12,
                    borderRadius: 2,
                    background: "rgba(251,191,36,0.3)",
                    flexShrink: 0,
                  }}
                />
                Feriado desbloqueado
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  style={{
                    display: "inline-block",
                    width: 12,
                    height: 12,
                    borderRadius: 2,
                    background: "rgba(16,185,129,0.3)",
                    flexShrink: 0,
                  }}
                />
                Con reservas
              </span>
            </div>
          )}
        </div>

        {/* Right — today panel (30%) */}
        <div
          className="w-full shrink-0 overflow-hidden rounded-xl border lg:w-80"
          style={{
            background: "var(--nuba-glass-surface)",
            backdropFilter: "blur(var(--nuba-glass-blur-sm))",
            borderColor: "var(--nuba-border-subtle)",
          }}
        >
          {/* Panel header */}
          <div
            className="border-b px-4 py-3"
            style={{ borderColor: "var(--nuba-border-subtle)" }}
          >
            <div className="flex items-center justify-between gap-2">
              <Text
                className="text-sm font-semibold capitalize text-foreground"
              >
                {formatTodayLabel()}
              </Text>
              <BadgeRoot variant="soft">
                <BadgeLabel>{todayReservations.length}</BadgeLabel>
              </BadgeRoot>
            </div>
          </div>

          {/* Reservation list */}
          <div
            className="flex flex-col divide-y divide-border-subtle overflow-y-auto"
            style={{
              maxHeight: "calc(100vh - 16rem)",
            }}
          >
            {todayReservations.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Clock
                  size={32}
                  strokeWidth={1.25}
                  style={{ color: "var(--nuba-fg-muted)" }}
                />
                <Text className="text-sm text-foreground-muted">
                  Sin reservas para hoy
                </Text>
              </div>
            ) : (
              todayReservations.map((r) => (
                <TodayReservationItem
                  key={r.id}
                  reservation={r}
                  onOpen={openDrawer}
                  onStatusChange={changeStatus}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Create / Edit modal */}
      <Modal.Root state={modalState}>
        <Modal.Backdrop
          className="z-60 flex items-center justify-center p-3 sm:p-6"
          variant="blur"
        >
          <Modal.Container placement="center" size="lg">
            <Modal.Dialog className="flex max-h-[min(90dvh,800px)] w-[min(100vw-1.5rem,38rem)] max-w-none flex-col overflow-hidden border border-border-subtle bg-surface/95 shadow-lg outline-none backdrop-blur-sm">
              <Modal.Header className="shrink-0 border-b border-border-subtle px-5 pb-3 pt-5">
                <div className="flex items-center justify-between gap-3">
                  <Modal.Heading className="min-w-0 flex-1 text-base font-semibold text-foreground">
                    {editingReservation ? "Editar reserva" : "Nueva reserva"}
                  </Modal.Heading>
                  <Modal.CloseTrigger aria-label="Cerrar" className="shrink-0" />
                </div>
              </Modal.Header>

              <Modal.Body className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <form
                  id="reservation-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void onSubmit(e);
                  }}
                  className="flex flex-col gap-4"
                >
                  {/* Nombre */}
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="r-name">
                      Nombre del cliente{" "}
                      <span className="text-xs font-normal text-danger">
                        (obligatorio)
                      </span>
                    </Label>
                    <Input
                      id="r-name"
                      variant="secondary"
                      placeholder="Juan Pérez"
                      {...form.register("customer_name")}
                    />
                    {form.formState.errors.customer_name && (
                      <p className="text-xs text-danger">
                        {form.formState.errors.customer_name.message}
                      </p>
                    )}
                  </div>

                  {/* Vincular cliente registrado */}
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="r-customer-search">
                      Vincular a cliente registrado (opcional)
                    </Label>
                    <div className="relative">
                      <Input
                        id="r-customer-search"
                        variant="secondary"
                        placeholder="Buscar por nombre o email..."
                        value={customerSearch}
                        onChange={(e) => {
                          setCustomerSearch(e.target.value);
                          setCustomerDropdownOpen(true);
                        }}
                        onBlur={() =>
                          setTimeout(() => setCustomerDropdownOpen(false), 150)
                        }
                      />
                      {customerDropdownOpen && customerResults.length > 0 && (
                        <div
                          className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border shadow-lg"
                          style={{
                            background: "var(--nuba-surface)",
                            borderColor: "var(--nuba-border-default)",
                          }}
                        >
                          {customerResults.map((c) => (
                            <button
                              type="button"
                              key={c.id}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-raised"
                              onMouseDown={() => {
                                form.setValue("customer_id", c.id);
                                form.setValue(
                                  "customer_name",
                                  `${c.first_name} ${c.last_name}`,
                                );
                                if (c.phone)
                                  form.setValue("customer_phone", c.phone);
                                if (c.email)
                                  form.setValue("customer_email", c.email);
                                setCustomerSearch(
                                  `${c.first_name} ${c.last_name}`,
                                );
                                setCustomerDropdownOpen(false);
                              }}
                            >
                              <User
                                size={14}
                                className="shrink-0"
                                style={{ color: "var(--nuba-fg-muted)" }}
                              />
                              <span className="flex-1 text-foreground">
                                {c.first_name} {c.last_name}
                              </span>
                              {c.email && (
                                <span
                                  className="truncate text-xs"
                                  style={{ color: "var(--nuba-fg-muted)" }}
                                >
                                  {c.email}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Teléfono + Email */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="r-phone">Teléfono</Label>
                      <Input
                        id="r-phone"
                        variant="secondary"
                        placeholder="+54 9 11 1234-5678"
                        {...form.register("customer_phone")}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="r-email">Email</Label>
                      <Input
                        id="r-email"
                        variant="secondary"
                        type="email"
                        placeholder="juan@email.com"
                        {...form.register("customer_email")}
                      />
                      {form.formState.errors.customer_email && (
                        <p className="text-xs text-danger">
                          {form.formState.errors.customer_email.message}
                        </p>
                      )}
                      <p
                        className="text-[11px]"
                        style={{ color: "var(--nuba-fg-muted)" }}
                      >
                        Se enviará confirmación si se completa
                      </p>
                    </div>
                  </div>

                  {/* Fecha + Hora */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="r-date">
                        Fecha{" "}
                        <span className="text-xs font-normal text-danger">
                          (obligatorio)
                        </span>
                      </Label>
                      <input
                        id="r-date"
                        type="date"
                        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                        style={{
                          background: "var(--nuba-raised)",
                          borderColor: "var(--nuba-border-default)",
                          color: "var(--nuba-fg)",
                        }}
                        {...form.register("date")}
                      />
                      {form.formState.errors.date && (
                        <p className="text-xs text-danger">
                          {form.formState.errors.date.message}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="r-time">
                        Hora{" "}
                        <span className="text-xs font-normal text-danger">
                          (obligatorio)
                        </span>
                      </Label>
                      <input
                        id="r-time"
                        type="time"
                        step="1800"
                        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                        style={{
                          background: "var(--nuba-raised)",
                          borderColor: "var(--nuba-border-default)",
                          color: "var(--nuba-fg)",
                        }}
                        {...form.register("time")}
                      />
                      {form.formState.errors.time && (
                        <p className="text-xs text-danger">
                          {form.formState.errors.time.message}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Personas + Duración */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="r-party">
                        Personas{" "}
                        <span className="text-xs font-normal text-danger">
                          (obligatorio)
                        </span>
                      </Label>
                      <input
                        id="r-party"
                        type="number"
                        min={1}
                        max={50}
                        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                        style={{
                          background: "var(--nuba-raised)",
                          borderColor: "var(--nuba-border-default)",
                          color: "var(--nuba-fg)",
                        }}
                        {...form.register("party_size", { valueAsNumber: true })}
                      />
                      {form.formState.errors.party_size && (
                        <p className="text-xs text-danger">
                          {form.formState.errors.party_size.message}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="r-duration">Duración</Label>
                      <select
                        id="r-duration"
                        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                        style={{
                          background: "var(--nuba-raised)",
                          borderColor: "var(--nuba-border-default)",
                          color: "var(--nuba-fg)",
                        }}
                        {...form.register("duration_min", { valueAsNumber: true })}
                      >
                        {DURATION_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Sucursal (si hay más de una) */}
                  {branches.length > 1 && (
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="r-branch">Sucursal</Label>
                      <select
                        id="r-branch"
                        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                        style={{
                          background: "var(--nuba-raised)",
                          borderColor: "var(--nuba-border-default)",
                          color: "var(--nuba-fg)",
                        }}
                        {...form.register("branch_id")}
                      >
                        <option value="">Todas las sucursales</option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Mesa */}
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="r-table">Mesa</Label>
                    {tablesLoading ? (
                      <div
                        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                        style={{
                          borderColor: "var(--nuba-border-subtle)",
                          color: "var(--nuba-fg-muted)",
                        }}
                      >
                        <div
                          className="size-3 animate-spin rounded-full border-2 border-t-accent"
                          style={{ borderColor: "var(--nuba-border-default)" }}
                        />
                        Verificando disponibilidad...
                      </div>
                    ) : tablesReady && availableTables.length === 0 ? (
                      <div
                        className="rounded-lg px-3 py-2 text-xs"
                        style={{
                          background: "var(--nuba-warning-soft)",
                          color: "var(--nuba-warning)",
                        }}
                      >
                        No hay mesas disponibles en ese horario
                      </div>
                    ) : (
                      <select
                        id="r-table"
                        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                        style={{
                          background: "var(--nuba-raised)",
                          borderColor: "var(--nuba-border-default)",
                          color: "var(--nuba-fg)",
                        }}
                        {...form.register("table_id")}
                      >
                        <option value="">Sin mesa asignada</option>
                        {availableTables.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} — cap. {t.capacity}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Notas */}
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="r-notes">Notas internas</Label>
                    <textarea
                      id="r-notes"
                      rows={3}
                      maxLength={500}
                      className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none"
                      style={{
                        background: "var(--nuba-raised)",
                        borderColor: "var(--nuba-border-default)",
                        color: "var(--nuba-fg)",
                      }}
                      placeholder="Alergias, preferencias, ocasión especial..."
                      {...form.register("notes")}
                    />
                  </div>
                </form>
              </Modal.Body>

              <Modal.Footer className="flex shrink-0 justify-end gap-2 border-t border-border-subtle px-5 py-4">
                <Button
                  variant="secondary"
                  onPress={modalState.close}
                  isDisabled={form.formState.isSubmitting}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  className="bg-accent text-accent-text hover:bg-accent-hover"
                  type="submit"
                  form="reservation-form"
                  isDisabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting
                    ? "Guardando..."
                    : editingReservation
                      ? "Guardar cambios"
                      : "Crear reserva"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </>
  );
}
