"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@heroui/react";
import type { ProductoTop } from "@/types/metricas";
import { formatARS } from "@/hooks/useMetricas";

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
  data: ProductoTop[];
  isLoading: boolean;
}

function truncate(str: string, max = 20): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

export function GraficoTopProductos({ data, isLoading }: Props) {
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

  const formatted = data.map((d) => ({
    ...d,
    nombreCorto: truncate(d.nombre),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        data={formatted}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
        barSize={16}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border-subtle)"
          horizontal={false}
        />
        <XAxis
          type="number"
          dataKey="cantidad"
          tick={{ fontSize: 11, fill: "var(--foreground-muted)" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="nombreCorto"
          width={120}
          tick={{ fontSize: 11, fill: "var(--foreground-muted)" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(value: number, _name: string, props: { payload?: ProductoTop }) => [
            `${value} uds · ${formatARS(props.payload?.ingresos ?? 0)}`,
            props.payload?.nombre ?? "",
          ]}
          labelFormatter={() => ""}
          contentStyle={{
            background: "var(--background-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Bar dataKey="cantidad" fill="var(--accent)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
