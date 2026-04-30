"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@heroui/react";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  History,
  ReceiptText,
  TrendingUp,
  X,
} from "lucide-react";

import { MetricCard } from "@/components/panel/MetricCard";
import { RangoSelector } from "@/components/panel/RangoSelector";
import { DialogWarning } from "@/components/ui/DialogWarning";
import { DialogSuccess } from "@/components/ui/DialogSuccess";
import type { RangoMetricas } from "@/types/metricas";
import type {
  CashRegister,
  CierreDetalle,
  OrdenHistorial,
  OrdenParaArchivar,
  RentabilidadPeriodo,
} from "@/types/caja";

// ─── Constants ────────────────────────────────────────────────────────────────

const FOOD_COST_ALERT_THRESHOLD = 35;

// ─── Recharts (dynamic SSR:false) ─────────────────────────────────────────────

const BarChart = dynamic(() => import("recharts").then((m) => m.BarChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then((m) => m.Bar), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false });
const RechartTooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const Legend = dynamic(() => import("recharts").then((m) => m.Legend), { ssr: false });
const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ars = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

function formatARS(n: number) {
  return ars.format(n);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function rangoToDates(
  rango: RangoMetricas,
  desde?: string,
  hasta?: string,
): { desde: string; hasta: string } {
  const t = today();
  if (rango === "hoy") return { desde: t, hasta: t };
  if (rango === "semana") {
    const d = new Date();
    const day = d.getDay() || 7;
    const mon = new Date(d);
    mon.setDate(d.getDate() - day + 1);
    return { desde: mon.toISOString().slice(0, 10), hasta: t };
  }
  if (rango === "mes") return { desde: monthStart(), hasta: t };
  return { desde: desde ?? monthStart(), hasta: hasta ?? t };
}

function metodoPagoLabel(m: string | null) {
  if (!m) return "—";
  const map: Record<string, string> = {
    efectivo: "Efectivo",
    mercadopago: "MercadoPago",
    tarjeta: "Tarjeta",
    transferencia: "Transferencia",
    otro: "Otro",
  };
  return map[m] ?? m;
}

// ─── Tab button ───────────────────────────────────────────────────────────────

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
      style={{
        background: active ? "var(--nuba-accent-soft)" : "transparent",
        color: active ? "var(--accent)" : "var(--foreground-secondary)",
        border: active ? "none" : "1px solid var(--border-subtle)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── Card container ───────────────────────────────────────────────────────────

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border p-4 ${className ?? ""}`}
      style={{ background: "var(--background-surface)", borderColor: "var(--border-subtle)" }}
    >
      {children}
    </div>
  );
}

// ─── Branch selector ──────────────────────────────────────────────────────────

interface Branch {
  id: string;
  name: string;
}

function BranchSelector({
  branches,
  value,
  onChange,
}: {
  branches: Branch[];
  value: string;
  onChange: (v: string) => void;
}) {
  if (branches.length <= 1) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2"
      style={{
        background: "var(--background-raised)",
        borderColor: "var(--border-default)",
        color: "var(--foreground)",
        outlineColor: "var(--accent)",
      }}
    >
      <option value="">Todas las sucursales</option>
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({
  page,
  total,
  limit,
  onChange,
}: {
  page: number;
  total: number;
  limit: number;
  onChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-2">
      <button
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
        className="rounded-lg border p-1.5 disabled:opacity-40"
        style={{ borderColor: "var(--border-subtle)", color: "var(--foreground-secondary)" }}
      >
        <ChevronLeft size={16} />
      </button>
      <span className="text-xs" style={{ color: "var(--foreground-muted)" }}>
        {page} / {totalPages}
      </span>
      <button
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
        className="rounded-lg border p-1.5 disabled:opacity-40"
        style={{ borderColor: "var(--border-subtle)", color: "var(--foreground-secondary)" }}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

// ─── Inline modal (overlay) ───────────────────────────────────────────────────

function Overlay({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border shadow-xl"
        style={{ background: "var(--background-surface)", borderColor: "var(--border-subtle)" }}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <h3 className="font-semibold" style={{ color: "var(--foreground)" }}>
            {title}
          </h3>
          <button onClick={onClose} style={{ color: "var(--foreground-muted)" }}>
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ─── OrdenDetalle (items detail modal) ────────────────────────────────────────

function OrdenDetalleModal({
  orden,
  tenantId,
  onClose,
}: {
  orden: OrdenHistorial | null;
  tenantId: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<
    Array<{
      id: string;
      name: string;
      quantity: number;
      unit_price: number;
      unit_cost: number | null;
      subtotal: number;
    }>
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orden) return;
    setLoading(true);
    fetch(`/api/${tenantId}/ordenes/${orden.id}`)
      .then((r) => r.json())
      .then((d) => {
        setItems(d.order?.items ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orden, tenantId]);

  if (!orden) return null;

  return (
    <Overlay isOpen={!!orden} onClose={onClose} title={`Orden #${orden.numero}`}>
      <div className="mb-3 flex flex-wrap gap-3 text-xs" style={{ color: "var(--foreground-secondary)" }}>
        <span>{new Date(orden.createdAt).toLocaleString("es-AR")}</span>
        <span>·</span>
        <span>{orden.locationNombre}</span>
        {orden.tableNombre && (
          <>
            <span>·</span>
            <span>{orden.tableNombre}</span>
          </>
        )}
        <span>·</span>
        <span>{metodoPagoLabel(orden.metodoPago)}</span>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-lg" />
          ))}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              {["Producto", "Cant.", "P. Venta", "P. Costo", "Subtotal", "Margen"].map((h) => (
                <th
                  key={h}
                  className="py-2 text-right first:text-left font-medium"
                  style={{ color: "var(--foreground-muted)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const costoTotal =
                item.unit_cost !== null ? item.unit_cost * item.quantity : null;
              const margenItem =
                costoTotal !== null ? item.subtotal - costoTotal : null;
              return (
                <tr
                  key={item.id}
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  className="hover:bg-[var(--background-raised)] transition-colors"
                >
                  <td className="py-2" style={{ color: "var(--foreground)" }}>
                    {item.name}
                  </td>
                  <td className="py-2 text-right" style={{ color: "var(--foreground-secondary)" }}>
                    {item.quantity}
                  </td>
                  <td className="py-2 text-right" style={{ color: "var(--foreground-secondary)" }}>
                    {formatARS(item.unit_price)}
                  </td>
                  <td className="py-2 text-right" style={{ color: "var(--foreground-secondary)" }}>
                    {item.unit_cost !== null ? formatARS(item.unit_cost) : "—"}
                  </td>
                  <td className="py-2 text-right font-medium" style={{ color: "var(--foreground)" }}>
                    {formatARS(item.subtotal)}
                  </td>
                  <td
                    className="py-2 text-right font-medium"
                    style={{
                      color:
                        margenItem === null
                          ? "var(--foreground-muted)"
                          : margenItem >= 0
                            ? "var(--success)"
                            : "var(--danger)",
                    }}
                  >
                    {margenItem !== null ? formatARS(margenItem) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="pt-3 text-sm font-medium" style={{ color: "var(--foreground-secondary)" }}>
                Total
              </td>
              <td className="pt-3 text-right font-semibold" style={{ color: "var(--foreground)" }}>
                {formatARS(orden.total)}
              </td>
              <td
                className="pt-3 text-right font-semibold"
                style={{
                  color:
                    orden.margen === null
                      ? "var(--foreground-muted)"
                      : orden.margen >= 0
                        ? "var(--success)"
                        : "var(--danger)",
                }}
              >
                {orden.margen !== null ? formatARS(orden.margen) : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </Overlay>
  );
}

// ─── TAB 1: Cierre de caja ────────────────────────────────────────────────────

function CierreTab({ tenantId, branches }: { tenantId: string; branches: Branch[] }) {
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [ordenes, setOrdenes] = useState<OrdenParaArchivar[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notas, setNotas] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastCierre, setLastCierre] = useState<CashRegister | null>(null);

  const fetchOrdenes = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const q = branchId ? `?branchId=${branchId}` : "";
      const res = await fetch(`/api/${tenantId}/caja/para-archivar${q}`);
      const data = await res.json();
      setOrdenes(data.ordenes ?? []);
    } catch {
      setOrdenes([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, branchId]);

  useEffect(() => {
    void fetchOrdenes();
  }, [fetchOrdenes]);

  const toggleAll = () => {
    if (selected.size === ordenes.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(ordenes.map((o) => o.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedOrdenes = ordenes.filter((o) => selected.has(o.id));
  const totalSelec = selectedOrdenes.reduce((s, o) => s + o.total, 0);
  const efectivoSelec = selectedOrdenes
    .filter((o) => o.metodoPago === "efectivo")
    .reduce((s, o) => s + o.total, 0);
  const mpSelec = selectedOrdenes
    .filter((o) => o.metodoPago === "mercadopago")
    .reduce((s, o) => s + o.total, 0);
  const otrosSelec = selectedOrdenes
    .filter((o) => o.metodoPago !== "efectivo" && o.metodoPago !== "mercadopago")
    .reduce((s, o) => s + o.total, 0);

  const handleCerrar = async () => {
    const res = await fetch(`/api/${tenantId}/caja/archivar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        branchId: branchId || branches[0]?.id,
        ordenIds: Array.from(selected),
        notas: notas.trim() || undefined,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error((d as { error?: string }).error ?? "Error al cerrar caja");
    }
    const d = (await res.json()) as { cashRegister: CashRegister };
    setLastCierre(d.cashRegister);
    setShowSuccess(true);
    setNotas("");
    await fetchOrdenes();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <BranchSelector branches={branches} value={branchId} onChange={setBranchId} />
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : ordenes.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm" style={{ color: "var(--foreground-muted)" }}>
            No hay órdenes terminales pendientes de archivar
          </p>
        </Card>
      ) : (
        <Card>
          <div className="mb-3 flex items-center gap-3">
            <input
              type="checkbox"
              checked={selected.size === ordenes.length && ordenes.length > 0}
              onChange={toggleAll}
              className="size-4 cursor-pointer accent-[var(--accent)]"
            />
            <span className="text-xs font-medium" style={{ color: "var(--foreground-muted)" }}>
              Seleccionar todas ({ordenes.length})
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                {["", "Orden", "Canal", "Total", "Método pago", "Hora cierre"].map((h) => (
                  <th
                    key={h}
                    className="py-2 px-2 text-left font-medium"
                    style={{ color: "var(--foreground-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordenes.map((o) => (
                <tr
                  key={o.id}
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  className="hover:bg-[var(--background-raised)] transition-colors"
                >
                  <td className="py-2 px-2">
                    <input
                      type="checkbox"
                      checked={selected.has(o.id)}
                      onChange={() => toggleOne(o.id)}
                      className="size-4 cursor-pointer accent-[var(--accent)]"
                    />
                  </td>
                  <td className="py-2 px-2" style={{ color: "var(--foreground-secondary)" }}>
                    {o.id.slice(-6).toUpperCase()}
                  </td>
                  <td className="py-2 px-2" style={{ color: "var(--foreground)" }}>
                    {o.locationNombre}
                    {o.tableNombre && (
                      <span style={{ color: "var(--foreground-muted)" }}> · {o.tableNombre}</span>
                    )}
                  </td>
                  <td className="py-2 px-2 font-medium" style={{ color: "var(--foreground)" }}>
                    {formatARS(o.total)}
                  </td>
                  <td className="py-2 px-2" style={{ color: "var(--foreground-secondary)" }}>
                    {metodoPagoLabel(o.metodoPago)}
                  </td>
                  <td className="py-2 px-2" style={{ color: "var(--foreground-secondary)" }}>
                    {o.closedAt ? new Date(o.closedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {selected.size > 0 && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: "var(--foreground-muted)" }}>
                Efectivo
              </span>
              <span className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>
                {formatARS(efectivoSelec)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: "var(--foreground-muted)" }}>
                MercadoPago
              </span>
              <span className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>
                {formatARS(mpSelec)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: "var(--foreground-muted)" }}>
                Otros
              </span>
              <span className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>
                {formatARS(otrosSelec)}
              </span>
            </div>
            <div
              className="ml-auto flex items-center gap-2 rounded-lg px-3 py-1.5"
              style={{ background: "var(--accent-soft)" }}
            >
              <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>
                Total ({selected.size} órdenes)
              </span>
              <span className="font-bold" style={{ color: "var(--accent)" }}>
                {formatARS(totalSelec)}
              </span>
            </div>
          </div>

          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Notas opcionales para el cierre…"
            rows={2}
            className="mb-3 w-full rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2"
            style={{
              background: "var(--background-raised)",
              borderColor: "var(--border-default)",
              color: "var(--foreground)",
              outlineColor: "var(--accent)",
            }}
          />

          <button
            onClick={() => setShowConfirm(true)}
            className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors hover:opacity-90"
            style={{ background: "var(--accent)", color: "var(--accent-text)" }}
          >
            <Archive size={16} />
            Cerrar caja
          </button>
        </Card>
      )}

      <DialogWarning
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Confirmar cierre de caja"
        description={
          <div className="flex flex-col gap-1 text-sm" style={{ color: "var(--foreground-secondary)" }}>
            <p>Se archivarán <strong>{selected.size}</strong> órdenes por un total de <strong>{formatARS(totalSelec)}</strong>.</p>
            <p>Esta acción no puede deshacerse.</p>
          </div>
        }
        confirmLabel="Sí, cerrar caja"
        onConfirm={handleCerrar}
      />

      <DialogSuccess
        isOpen={showSuccess}
        onClose={() => setShowSuccess(false)}
        title="Caja cerrada correctamente"
        description={
          lastCierre ? (
            <div className="flex flex-col gap-1 text-sm" style={{ color: "var(--foreground-secondary)" }}>
              <p>{lastCierre.cantidadOrdenes} órdenes archivadas</p>
              <p>Total: <strong>{formatARS(lastCierre.totalGeneral)}</strong></p>
              <p>Efectivo: {formatARS(lastCierre.totalEfectivo)} · MercadoPago: {formatARS(lastCierre.totalMp)} · Otros: {formatARS(lastCierre.totalOtros)}</p>
            </div>
          ) : undefined
        }
      />
    </div>
  );
}

// ─── TAB 2: Historial de órdenes ─────────────────────────────────────────────

function HistorialTab({ tenantId, branches }: { tenantId: string; branches: Branch[] }) {
  const [rango, setRango] = useState<RangoMetricas>("mes");
  const [desde, setDesde] = useState<string | undefined>();
  const [hasta, setHasta] = useState<string | undefined>();
  const [branchId, setBranchId] = useState("");
  const [statusKey, setStatusKey] = useState("");
  const [metodoPago, setMetodoPago] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ ordenes: OrdenHistorial[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<OrdenHistorial | null>(null);

  const limit = 25;

  const fetchHistorial = useCallback(async () => {
    setLoading(true);
    const { desde: d, hasta: h } = rangoToDates(rango, desde, hasta);
    const params = new URLSearchParams({
      desde: d,
      hasta: h,
      page: String(page),
      limit: String(limit),
    });
    if (branchId) params.set("branchId", branchId);
    if (statusKey) params.set("statusKey", statusKey);
    if (metodoPago) params.set("metodoPago", metodoPago);
    try {
      const res = await fetch(`/api/${tenantId}/caja/historial?${params.toString()}`);
      const json = await res.json();
      setData({ ordenes: json.ordenes ?? [], total: json.total ?? 0 });
    } catch {
      setData({ ordenes: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }, [tenantId, rango, desde, hasta, branchId, statusKey, metodoPago, page]);

  useEffect(() => {
    void fetchHistorial();
  }, [fetchHistorial]);

  function handleRangoChange(r: RangoMetricas, d?: string, h?: string) {
    setRango(r);
    setDesde(d);
    setHasta(h);
    setPage(1);
  }

  function exportCSV() {
    if (!data?.ordenes.length) return;
    const headers = ["N°", "Fecha", "Sucursal", "Canal", "Total", "Costo", "Margen", "Margen%", "Método pago"];
    const rows = data.ordenes.map((o) => [
      o.numero,
      new Date(o.createdAt).toLocaleDateString("es-AR"),
      o.branchNombre,
      o.locationNombre,
      o.total,
      o.totalCosto ?? "",
      o.margen ?? "",
      o.margenPct ?? "",
      metodoPagoLabel(o.metodoPago),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historial-ordenes-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const inputStyle = {
    background: "var(--background-raised)",
    borderColor: "var(--border-default)",
    color: "var(--foreground)",
    outlineColor: "var(--accent)",
  } as const;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <RangoSelector value={rango} desde={desde} hasta={hasta} onChange={handleRangoChange} />
        <BranchSelector branches={branches} value={branchId} onChange={(v) => { setBranchId(v); setPage(1); }} />
        <select
          value={metodoPago}
          onChange={(e) => { setMetodoPago(e.target.value); setPage(1); }}
          className="rounded-lg border px-3 py-1.5 text-sm focus:outline-none"
          style={inputStyle}
        >
          <option value="">Todos los métodos</option>
          <option value="efectivo">Efectivo</option>
          <option value="mercadopago">MercadoPago</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="transferencia">Transferencia</option>
          <option value="otro">Otro</option>
        </select>
        <button
          onClick={exportCSV}
          className="ml-auto rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--background-raised)]"
          style={{ borderColor: "var(--border-subtle)", color: "var(--foreground-secondary)" }}
        >
          Exportar CSV
        </button>
      </div>

      <Card>
        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    {["N°", "Fecha", "Sucursal", "Canal", "Total venta", "Costo", "Margen", "Margen%", "Método pago", ""].map((h) => (
                      <th
                        key={h}
                        className="py-3 px-3 text-right first:text-left font-medium whitespace-nowrap"
                        style={{ color: "var(--foreground-muted)" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.ordenes ?? []).map((o) => (
                    <tr
                      key={o.id}
                      style={{ borderBottom: "1px solid var(--border-subtle)" }}
                      className="hover:bg-[var(--background-raised)] transition-colors"
                    >
                      <td className="py-2.5 px-3" style={{ color: "var(--foreground-secondary)" }}>
                        #{o.numero}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap" style={{ color: "var(--foreground-secondary)" }}>
                        {new Date(o.createdAt).toLocaleDateString("es-AR")}
                      </td>
                      <td className="py-2.5 px-3" style={{ color: "var(--foreground-secondary)" }}>
                        {o.branchNombre}
                      </td>
                      <td className="py-2.5 px-3" style={{ color: "var(--foreground)" }}>
                        {o.locationNombre}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium" style={{ color: "var(--foreground)" }}>
                        {formatARS(o.total)}
                      </td>
                      <td className="py-2.5 px-3 text-right" style={{ color: "var(--foreground-secondary)" }}>
                        {o.totalCosto !== null ? (
                          formatARS(o.totalCosto)
                        ) : (
                          <span title="Sin datos de costo" style={{ color: "var(--foreground-muted)" }}>—</span>
                        )}
                      </td>
                      <td
                        className="py-2.5 px-3 text-right font-medium"
                        style={{
                          color:
                            o.margen === null
                              ? "var(--foreground-muted)"
                              : o.margen >= 0
                                ? "var(--success)"
                                : "var(--danger)",
                        }}
                      >
                        {o.margen !== null ? formatARS(o.margen) : "—"}
                      </td>
                      <td
                        className="py-2.5 px-3 text-right font-medium"
                        style={{
                          color:
                            o.margenPct === null
                              ? "var(--foreground-muted)"
                              : o.margenPct >= 0
                                ? "var(--success)"
                                : "var(--danger)",
                        }}
                      >
                        {o.margenPct !== null ? `${o.margenPct}%` : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right" style={{ color: "var(--foreground-secondary)" }}>
                        {metodoPagoLabel(o.metodoPago)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => setSelected(o)}
                          className="rounded-md px-2 py-1 text-xs transition-colors hover:bg-[var(--background-raised)]"
                          style={{ color: "var(--accent)" }}
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!data?.ordenes.length && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-sm" style={{ color: "var(--foreground-muted)" }}>
                        Sin resultados para el período seleccionado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              total={data?.total ?? 0}
              limit={limit}
              onChange={setPage}
            />
          </>
        )}
      </Card>

      <OrdenDetalleModal orden={selected} tenantId={tenantId} onClose={() => setSelected(null)} />
    </div>
  );
}

// ─── TAB 3: Cierres de caja ───────────────────────────────────────────────────

function CierresTab({ tenantId, branches }: { tenantId: string; branches: Branch[] }) {
  const [rango, setRango] = useState<RangoMetricas>("mes");
  const [desde, setDesde] = useState<string | undefined>();
  const [hasta, setHasta] = useState<string | undefined>();
  const [branchId, setBranchId] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ cierres: CashRegister[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [detalle, setDetalle] = useState<CierreDetalle | null>(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const limit = 25;

  const fetchCierres = useCallback(async () => {
    setLoading(true);
    const { desde: d, hasta: h } = rangoToDates(rango, desde, hasta);
    const params = new URLSearchParams({ desde: d, hasta: h, page: String(page), limit: String(limit) });
    if (branchId) params.set("branchId", branchId);
    try {
      const res = await fetch(`/api/${tenantId}/caja/cierres?${params.toString()}`);
      const json = await res.json();
      setData({ cierres: json.cierres ?? [], total: json.total ?? 0 });
    } catch {
      setData({ cierres: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }, [tenantId, rango, desde, hasta, branchId, page]);

  useEffect(() => {
    void fetchCierres();
  }, [fetchCierres]);

  async function openDetalle(id: string) {
    setLoadingDetalle(true);
    try {
      const res = await fetch(`/api/${tenantId}/caja/cierres/${id}`);
      const d = await res.json();
      setDetalle(d.cierre ?? null);
    } catch {
      setDetalle(null);
    } finally {
      setLoadingDetalle(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <RangoSelector
          value={rango}
          desde={desde}
          hasta={hasta}
          onChange={(r, d, h) => { setRango(r); setDesde(d); setHasta(h); setPage(1); }}
        />
        <BranchSelector branches={branches} value={branchId} onChange={(v) => { setBranchId(v); setPage(1); }} />
      </div>

      <Card>
        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    {["Fecha", "Sucursal", "Órdenes", "Efectivo", "MercadoPago", "Otros", "Total", "Cerrado por", ""].map((h) => (
                      <th
                        key={h}
                        className="py-3 px-3 text-right first:text-left font-medium whitespace-nowrap"
                        style={{ color: "var(--foreground-muted)" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.cierres ?? []).map((c) => (
                    <tr
                      key={c.id}
                      style={{ borderBottom: "1px solid var(--border-subtle)" }}
                      className="hover:bg-[var(--background-raised)] transition-colors"
                    >
                      <td className="py-2.5 px-3" style={{ color: "var(--foreground)" }}>
                        {new Date(c.fechaCierre + "T12:00:00").toLocaleDateString("es-AR")}
                      </td>
                      <td className="py-2.5 px-3" style={{ color: "var(--foreground-secondary)" }}>
                        {c.branchNombre}
                      </td>
                      <td className="py-2.5 px-3 text-right" style={{ color: "var(--foreground-secondary)" }}>
                        {c.cantidadOrdenes}
                      </td>
                      <td className="py-2.5 px-3 text-right" style={{ color: "var(--foreground-secondary)" }}>
                        {formatARS(c.totalEfectivo)}
                      </td>
                      <td className="py-2.5 px-3 text-right" style={{ color: "var(--foreground-secondary)" }}>
                        {formatARS(c.totalMp)}
                      </td>
                      <td className="py-2.5 px-3 text-right" style={{ color: "var(--foreground-secondary)" }}>
                        {formatARS(c.totalOtros)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold" style={{ color: "var(--foreground)" }}>
                        {formatARS(c.totalGeneral)}
                      </td>
                      <td className="py-2.5 px-3 text-right" style={{ color: "var(--foreground-secondary)" }}>
                        {c.cerradoPorNombre}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => void openDetalle(c.id)}
                          className="rounded-md px-2 py-1 text-xs transition-colors hover:bg-[var(--background-raised)]"
                          style={{ color: "var(--accent)" }}
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!data?.cierres.length && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-sm" style={{ color: "var(--foreground-muted)" }}>
                        Sin cierres en el período seleccionado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={data?.total ?? 0} limit={limit} onChange={setPage} />
          </>
        )}
      </Card>

      <Overlay
        isOpen={!!detalle || loadingDetalle}
        onClose={() => setDetalle(null)}
        title={detalle ? `Cierre ${new Date(detalle.fechaCierre + "T12:00:00").toLocaleDateString("es-AR")} — ${detalle.branchNombre}` : "Cargando…"}
      >
        {loadingDetalle ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
          </div>
        ) : detalle ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { l: "Efectivo", v: formatARS(detalle.totalEfectivo) },
                { l: "MercadoPago", v: formatARS(detalle.totalMp) },
                { l: "Otros", v: formatARS(detalle.totalOtros) },
                { l: "Total general", v: formatARS(detalle.totalGeneral) },
              ].map(({ l, v }) => (
                <div key={l} className="flex justify-between rounded-lg p-2" style={{ background: "var(--background-raised)" }}>
                  <span style={{ color: "var(--foreground-secondary)" }}>{l}</span>
                  <span className="font-semibold" style={{ color: "var(--foreground)" }}>{v}</span>
                </div>
              ))}
            </div>
            {detalle.notas && (
              <p className="text-xs italic" style={{ color: "var(--foreground-muted)" }}>
                Nota: {detalle.notas}
              </p>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  {["Canal", "Total", "Método pago", "Hora"].map((h) => (
                    <th key={h} className="py-2 px-2 text-right first:text-left font-medium" style={{ color: "var(--foreground-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detalle.ordenes.map((o) => (
                  <tr key={o.id} style={{ borderBottom: "1px solid var(--border-subtle)" }} className="hover:bg-[var(--background-raised)]">
                    <td className="py-2 px-2" style={{ color: "var(--foreground)" }}>{o.locationNombre}</td>
                    <td className="py-2 px-2 text-right font-medium" style={{ color: "var(--foreground)" }}>{formatARS(o.total)}</td>
                    <td className="py-2 px-2 text-right" style={{ color: "var(--foreground-secondary)" }}>{metodoPagoLabel(o.metodoPago)}</td>
                    <td className="py-2 px-2 text-right" style={{ color: "var(--foreground-secondary)" }}>
                      {o.closedAt ? new Date(o.closedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Overlay>
    </div>
  );
}

// ─── TAB 4: Rentabilidad ──────────────────────────────────────────────────────

function RentabilidadTab({ tenantId, branches }: { tenantId: string; branches: Branch[] }) {
  const [rango, setRango] = useState<RangoMetricas>("mes");
  const [desde, setDesde] = useState<string | undefined>();
  const [hasta, setHasta] = useState<string | undefined>();
  const [branchId, setBranchId] = useState("");
  const [data, setData] = useState<RentabilidadPeriodo | null>(null);
  const [loading, setLoading] = useState(false);
  const [sortCol, setSortCol] = useState<"totalVentas" | "totalCosto" | "margenPct" | "foodCostPct" | "cantidadVendida">("totalVentas");
  const [sortAsc, setSortAsc] = useState(false);

  const fetchRentabilidad = useCallback(async () => {
    setLoading(true);
    const { desde: d, hasta: h } = rangoToDates(rango, desde, hasta);
    const params = new URLSearchParams({ desde: d, hasta: h });
    if (branchId) params.set("branchId", branchId);
    try {
      const res = await fetch(`/api/${tenantId}/caja/rentabilidad?${params.toString()}`);
      if (!res.ok) { setData(null); return; }
      setData(await res.json());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, rango, desde, hasta, branchId]);

  useEffect(() => { void fetchRentabilidad(); }, [fetchRentabilidad]);

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) { setSortAsc((p) => !p); } else { setSortCol(col); setSortAsc(false); }
  }

  const sortedProductos = [...(data?.porProducto ?? [])].sort((a, b) => {
    const mult = sortAsc ? 1 : -1;
    return (a[sortCol] - b[sortCol]) * mult;
  });

  const top10 = sortedProductos.slice(0, 10);

  const chartDataDia = (data?.porDia ?? []).map((d) => ({
    fecha: new Date(d.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }),
    costo: Math.round(d.totalCosto),
    margen: Math.round(d.totalVentas - d.totalCosto),
  }));

  const chartDataProducto = [...top10].reverse().map((p) => ({
    name: p.productoNombre.length > 20 ? p.productoNombre.slice(0, 18) + "…" : p.productoNombre,
    venta: Math.round(p.totalVentas),
    costo: Math.round(p.totalCosto),
  }));

  const SortTh = ({ col, label }: { col: typeof sortCol; label: string }) => (
    <th
      className="cursor-pointer select-none py-3 px-3 text-right font-medium whitespace-nowrap hover:opacity-80"
      style={{ color: sortCol === col ? "var(--accent)" : "var(--foreground-muted)" }}
      onClick={() => toggleSort(col)}
    >
      {label} {sortCol === col ? (sortAsc ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <RangoSelector
          value={rango}
          desde={desde}
          hasta={hasta}
          onChange={(r, d, h) => { setRango(r); setDesde(d); setHasta(h); }}
        />
        <BranchSelector branches={branches} value={branchId} onChange={setBranchId} />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <MetricCard label="Total ventas" value={formatARS(data.totalVentas)} icon={<DollarSign size={14} />} />
            <MetricCard label="Costo total" value={formatARS(data.totalCosto)} />
            <MetricCard label="Margen bruto" value={formatARS(data.margenBruto)} />
            <MetricCard
              label="Margen %"
              value={`${data.margenPct}%`}
              descripcion={data.margenPct >= 0 ? "Positivo" : "Negativo"}
            />
            <MetricCard
              label="Food cost %"
              value={`${data.foodCostPct}%`}
              descripcion={data.foodCostPct <= FOOD_COST_ALERT_THRESHOLD ? "En rango" : "⚠ Alto"}
            />
          </div>

          {chartDataDia.length > 0 && (
            <Card>
              <p className="mb-4 text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                Margen por día
              </p>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartDataDia} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: "var(--foreground-muted)" }} />
                    <YAxis tickFormatter={(v: number) => formatARS(v)} tick={{ fontSize: 11, fill: "var(--foreground-muted)" }} width={70} />
                    <RechartTooltip
                      formatter={(value: number, name: string) => [formatARS(value), name === "costo" ? "Costo" : "Margen"]}
                      contentStyle={{ background: "var(--background-surface)", border: "1px solid var(--border-subtle)", borderRadius: 8 }}
                    />
                    <Legend formatter={(v: string) => v === "costo" ? "Costo" : "Margen"} />
                    <Bar dataKey="costo" stackId="a" fill="#f87171" name="costo" />
                    <Bar dataKey="margen" stackId="a" fill="#4ade80" name="margen" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {chartDataProducto.length > 0 && (
            <Card>
              <p className="mb-4 text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                Top 10 productos: venta vs costo
              </p>
              <div style={{ height: Math.max(200, chartDataProducto.length * 36) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartDataProducto} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis type="number" tickFormatter={(v: number) => formatARS(v)} tick={{ fontSize: 11, fill: "var(--foreground-muted)" }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--foreground-muted)" }} width={120} />
                    <RechartTooltip
                      formatter={(value: number, name: string) => [formatARS(value), name === "venta" ? "Venta" : "Costo"]}
                      contentStyle={{ background: "var(--background-surface)", border: "1px solid var(--border-subtle)", borderRadius: 8 }}
                    />
                    <Legend formatter={(v: string) => v === "venta" ? "Venta" : "Costo"} />
                    <Bar dataKey="venta" fill="var(--accent)" name="venta" />
                    <Bar dataKey="costo" fill="#f87171" name="costo" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          <Card>
            <p className="mb-3 text-sm font-semibold" style={{ color: "var(--foreground)" }}>
              Detalle por producto
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <th className="py-3 px-3 text-left font-medium" style={{ color: "var(--foreground-muted)" }}>
                      Producto
                    </th>
                    <SortTh col="cantidadVendida" label="Cant." />
                    <SortTh col="totalVentas" label="Venta total" />
                    <SortTh col="totalCosto" label="Costo total" />
                    <th className="py-3 px-3 text-right font-medium" style={{ color: "var(--foreground-muted)" }}>
                      Margen
                    </th>
                    <SortTh col="margenPct" label="Margen %" />
                    <SortTh col="foodCostPct" label="Food cost %" />
                  </tr>
                </thead>
                <tbody>
                  {sortedProductos.map((p) => {
                    const margen = p.totalVentas - p.totalCosto;
                    const isHighFC = p.foodCostPct > FOOD_COST_ALERT_THRESHOLD;
                    const isNegMargen = p.margenPct < 0;
                    return (
                      <tr
                        key={p.productoId}
                        style={{
                          borderBottom: "1px solid var(--border-subtle)",
                          background: isNegMargen
                            ? "rgba(239,68,68,0.06)"
                            : isHighFC
                              ? "rgba(234,179,8,0.06)"
                              : "transparent",
                        }}
                        className="transition-colors hover:bg-[var(--background-raised)]"
                      >
                        <td className="py-2.5 px-3" style={{ color: "var(--foreground)" }}>
                          {p.productoNombre}
                        </td>
                        <td className="py-2.5 px-3 text-right" style={{ color: "var(--foreground-secondary)" }}>
                          {p.cantidadVendida}
                        </td>
                        <td className="py-2.5 px-3 text-right" style={{ color: "var(--foreground)" }}>
                          {formatARS(p.totalVentas)}
                        </td>
                        <td className="py-2.5 px-3 text-right" style={{ color: "var(--foreground-secondary)" }}>
                          {formatARS(p.totalCosto)}
                        </td>
                        <td
                          className="py-2.5 px-3 text-right font-medium"
                          style={{ color: margen >= 0 ? "var(--success)" : "var(--danger)" }}
                        >
                          {formatARS(margen)}
                        </td>
                        <td
                          className="py-2.5 px-3 text-right font-medium"
                          style={{ color: p.margenPct >= 0 ? "var(--success)" : "var(--danger)" }}
                        >
                          {p.margenPct}%
                        </td>
                        <td
                          className="py-2.5 px-3 text-right font-medium"
                          style={{ color: isHighFC ? "var(--warning)" : "var(--foreground-secondary)" }}
                        >
                          {p.foodCostPct}%
                        </td>
                      </tr>
                    );
                  })}
                  {!sortedProductos.length && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-sm" style={{ color: "var(--foreground-muted)" }}>
                        Sin datos para el período seleccionado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs italic" style={{ color: "var(--foreground-muted)" }}>
              Los cálculos excluyen ítems sin datos de costo registrados (órdenes anteriores a la activación del módulo).
              Umbral de alerta food cost: {FOOD_COST_ALERT_THRESHOLD}%.
            </p>
          </Card>
        </>
      ) : (
        <Card>
          <p className="py-8 text-center text-sm" style={{ color: "var(--foreground-muted)" }}>
            Sin datos de rentabilidad para el período. Solo se incluyen órdenes archivadas con costo registrado.
          </p>
        </Card>
      )}
    </div>
  );
}

// ─── Main CajaClient ──────────────────────────────────────────────────────────

type Tab = "cierre" | "historial" | "cierres" | "rentabilidad";

export function CajaClient({ tenantId, role }: { tenantId: string; role: string }) {
  const [activeTab, setActiveTab] = useState<Tab>("cierre");
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    fetch(`/api/${tenantId}/sucursales`)
      .then((r) => r.json())
      .then((d: unknown) => {
        if (Array.isArray(d)) setBranches(d as Branch[]);
        else if (d && typeof d === "object" && Array.isArray((d as { branches?: unknown }).branches)) {
          setBranches((d as { branches: Branch[] }).branches);
        }
      })
      .catch(() => {});
  }, [tenantId]);

  const isAdminOrSupervisor = role === "admin" || role === "supervisor";

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "cierre", label: "Cierre de caja", icon: <Archive size={14} /> },
    { id: "historial", label: "Historial", icon: <History size={14} /> },
    { id: "cierres", label: "Cierres", icon: <ReceiptText size={14} /> },
    { id: "rentabilidad", label: "Rentabilidad", icon: <TrendingUp size={14} /> },
  ].filter((t) => {
    if (t.id === "cierre" || t.id === "historial") return true;
    return isAdminOrSupervisor;
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          <DollarSign size={18} />
        </div>
        <div>
          <h1 className="text-lg font-bold" style={{ color: "var(--foreground)" }}>
            Caja
          </h1>
          <p className="text-xs" style={{ color: "var(--foreground-muted)" }}>
            Historial de órdenes, cierres, movimientos y rentabilidad
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <TabBtn
            key={t.id}
            active={activeTab === t.id}
            onClick={() => setActiveTab(t.id)}
            icon={t.icon}
            label={t.label}
          />
        ))}
      </div>

      {activeTab === "cierre" && <CierreTab tenantId={tenantId} branches={branches} />}
      {activeTab === "historial" && <HistorialTab tenantId={tenantId} branches={branches} />}
      {activeTab === "cierres" && isAdminOrSupervisor && <CierresTab tenantId={tenantId} branches={branches} />}
      {activeTab === "rentabilidad" && isAdminOrSupervisor && (
        <RentabilidadTab tenantId={tenantId} branches={branches} />
      )}
    </div>
  );
}
