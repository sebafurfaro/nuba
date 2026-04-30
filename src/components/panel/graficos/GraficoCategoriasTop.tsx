"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@heroui/react";
import type { CategoriaTop } from "@/types/metricas";
import { formatARS } from "@/hooks/useMetricas";

const PieChart = dynamic(
  () => import("recharts").then((m) => m.PieChart),
  { ssr: false },
);
const Pie = dynamic(() => import("recharts").then((m) => m.Pie), {
  ssr: false,
});
const Cell = dynamic(() => import("recharts").then((m) => m.Cell), {
  ssr: false,
});
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), {
  ssr: false,
});
const Legend = dynamic(() => import("recharts").then((m) => m.Legend), {
  ssr: false,
});
const ResponsiveContainer = dynamic(
  () => import("recharts").then((m) => m.ResponsiveContainer),
  { ssr: false },
);

interface Props {
  data: CategoriaTop[];
  isLoading: boolean;
}

const PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

function truncate(str: string, max = 18): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

export function GraficoCategoriasTop({ data, isLoading }: Props) {
  if (isLoading) {
    return <Skeleton className="h-[280px] w-full rounded-xl" />;
  }

  if (data.length === 0) {
    return (
      <div
        className="flex h-[280px] items-center justify-center rounded-xl text-sm"
        style={{ color: "var(--foreground-muted)" }}
      >
        Sin datos para el período
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.ingresos, 0);

  const formatted = data.map((d) => ({
    ...d,
    nombreCorto: truncate(d.nombre),
    pct:
      total > 0 ? Math.round((d.ingresos / total) * 1000) / 10 : 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={formatted}
          cx="50%"
          cy="45%"
          innerRadius={60}
          outerRadius={95}
          dataKey="ingresos"
          nameKey="nombreCorto"
          paddingAngle={3}
        >
          {formatted.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={PALETTE[index % PALETTE.length]}
            />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number, _name: string, props: { payload?: typeof formatted[number] }) => [
            `${formatARS(value)} (${props.payload?.pct ?? 0}%)`,
            props.payload?.nombre ?? "",
          ]}
          contentStyle={{
            background: "var(--background-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Legend
          formatter={(value: string, entry: { payload?: typeof formatted[number] }) =>
            `${value} ${entry.payload?.pct ?? 0}%`
          }
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
