"use client";

import { useState } from "react";
import { BarChart2, Calendar, DollarSign, ShoppingCart, TrendingUp } from "lucide-react";

import { PanelPageHeader } from "@/components/panel/PanelPageHeader";
import { MetricCard } from "@/components/panel/MetricCard";
import { RangoSelector } from "@/components/panel/RangoSelector";
import { GraficoIngresosPorDia } from "@/components/panel/graficos/GraficoIngresosPorDia";
import { GraficoReservasPorDia } from "@/components/panel/graficos/GraficoReservasPorDia";
import { GraficoTopProductos } from "@/components/panel/graficos/GraficoTopProductos";
import { GraficoCategoriasTop } from "@/components/panel/graficos/GraficoCategoriasTop";
import { useMetricas, formatARS } from "@/hooks/useMetricas";
import type { RangoMetricas } from "@/types/metricas";

// ─── Section card wrapper ──────────────────────────────────────────────────────

function SectionCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${className ?? ""}`}
      style={{
        background: "var(--background-surface)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <p
        className="mb-4 text-sm font-semibold"
        style={{ color: "var(--foreground)" }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

// ─── Dashboard Client ──────────────────────────────────────────────────────────

export function DashboardClient({ tenantId }: { tenantId: string }) {
  const [rango, setRango] = useState<RangoMetricas>("mes");
  const [desde, setDesde] = useState<string | undefined>();
  const [hasta, setHasta] = useState<string | undefined>();

  const { metricas, isLoading } = useMetricas({ tenantId, rango, desde, hasta });

  function handleRangoChange(
    newRango: RangoMetricas,
    newDesde?: string,
    newHasta?: string,
  ) {
    setRango(newRango);
    setDesde(newDesde);
    setHasta(newHasta);
  }

  const v = metricas?.ventas;
  const r = metricas?.reservas;
  const p = metricas?.productos;

  return (
    <div className="flex flex-col gap-6">
      <PanelPageHeader
        title="Dashboard"
        description="Métricas del período seleccionado"
        end={
          <RangoSelector
            value={rango}
            desde={desde}
            hasta={hasta}
            onChange={handleRangoChange}
          />
        }
      />

      {/* ── Fila 1: Ventas ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Ingresos totales"
          value={v ? formatARS(v.total_ingresos) : "—"}
          variacion={v?.variacion_ingresos}
          icon={<DollarSign className="size-4" />}
          isLoading={isLoading}
        />
        <MetricCard
          label="Total órdenes"
          value={v ? String(v.total_ordenes) : "—"}
          variacion={v?.variacion_ordenes}
          icon={<ShoppingCart className="size-4" />}
          isLoading={isLoading}
        />
        <MetricCard
          label="Ticket promedio"
          value={v ? formatARS(v.ticket_promedio) : "—"}
          descripcion="Ingresos ÷ órdenes"
          icon={<TrendingUp className="size-4" />}
          isLoading={isLoading}
        />
      </div>

      {/* ── Fila 2: Reservas ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Total reservas"
          value={r ? String(r.total_reservas) : "—"}
          variacion={r?.variacion_reservas}
          icon={<Calendar className="size-4" />}
          isLoading={isLoading}
        />
        <MetricCard
          label="Tasa de no-shows"
          value={r ? `${r.tasa_no_show}%` : "—"}
          descripcion={r ? `${r.no_shows} de ${r.total_reservas} reservas` : undefined}
          icon={<BarChart2 className="size-4" />}
          isLoading={isLoading}
        />
        <MetricCard
          label="Pendientes de confirmar"
          value={r ? String(r.pendientes) : "—"}
          descripcion={r ? `${r.confirmadas} confirmadas` : undefined}
          icon={<Calendar className="size-4" />}
          isLoading={isLoading}
        />
      </div>

      {/* ── Fila 3: Gráficos de tendencia ──────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Ingresos por día" className="lg:col-span-1">
          <GraficoIngresosPorDia
            data={v?.ingresos_por_dia ?? []}
            rango={rango}
            isLoading={isLoading}
          />
        </SectionCard>
        <SectionCard title="Reservas por día">
          <GraficoReservasPorDia
            data={r?.reservas_por_dia ?? []}
            rango={rango}
            isLoading={isLoading}
          />
        </SectionCard>
      </div>

      {/* ── Fila 4: Gráficos de productos ──────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Top 10 productos más vendidos">
          <GraficoTopProductos
            data={p?.mas_vendidos ?? []}
            isLoading={isLoading}
          />
        </SectionCard>
        <SectionCard title="Top 5 categorías por ingresos">
          <GraficoCategoriasTop
            data={p?.categorias_top ?? []}
            isLoading={isLoading}
          />
        </SectionCard>
      </div>
    </div>
  );
}
