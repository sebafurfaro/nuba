"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@heroui/react";
import type { RangoMetricas } from "@/types/metricas";

const BarChart = dynamic(
  () => import("recharts").then((m) => m.BarChart),
  { ssr: false },
);
const Bar = dynamic(() => import("recharts").then((m) => m.Bar), {
  ssr: false,
});
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), {
  ssr: false,
});
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), {
  ssr: false,
});
const CartesianGrid = dynamic(
  () => import("recharts").then((m) => m.CartesianGrid),
  { ssr: false },
);
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), {
  ssr: false,
});
const ResponsiveContainer = dynamic(
  () => import("recharts").then((m) => m.ResponsiveContainer),
  { ssr: false },
);

interface Props {
  data: { fecha: string; cantidad: number }[];
  rango: RangoMetricas;
  isLoading: boolean;
}

function formatFechaEje(fecha: string, rango: RangoMetricas): string {
  const d = new Date(fecha + "T12:00:00");
  if (rango === "hoy") {
    return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

const BAR_COLOR = "#10b981";

export function GraficoReservasPorDia({ data, rango, isLoading }: Props) {
  if (isLoading) {
    return <Skeleton className="h-[220px] w-full rounded-xl" />;
  }

  if (data.length === 0) {
    return (
      <div
        className="flex h-[220px] items-center justify-center rounded-xl text-sm"
        style={{ color: "var(--foreground-muted)" }}
      >
        Sin datos para el período
      </div>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    label: formatFechaEje(d.fecha, rango),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={formatted}
        margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
        barSize={20}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border-subtle)"
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--foreground-muted)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "var(--foreground-muted)" }}
          axisLine={false}
          tickLine={false}
          width={28}
        />
        <Tooltip
          formatter={(value: number) => [value, "Reservas"]}
          labelStyle={{ color: "var(--foreground)", fontSize: 12 }}
          contentStyle={{
            background: "var(--background-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Bar dataKey="cantidad" fill={BAR_COLOR} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
