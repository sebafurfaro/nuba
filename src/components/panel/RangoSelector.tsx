"use client";

import type { RangoMetricas } from "@/types/metricas";

const RANGOS: { value: RangoMetricas; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mes" },
  { value: "personalizado", label: "Personalizado" },
];

const inputStyle = {
  background: "var(--background-raised)",
  borderColor: "var(--border-default)",
  color: "var(--foreground)",
  outlineColor: "var(--accent)",
} as const;

interface RangoSelectorProps {
  value: RangoMetricas;
  desde?: string;
  hasta?: string;
  onChange: (rango: RangoMetricas, desde?: string, hasta?: string) => void;
}

export function RangoSelector({
  value,
  desde,
  hasta,
  onChange,
}: RangoSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as RangoMetricas, desde, hasta)}
        className="rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2"
        style={inputStyle}
        aria-label="Rango de fechas"
      >
        {RANGOS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>

      {value === "personalizado" && (
        <>
          <div className="flex items-center gap-2">
            <label
              htmlFor="rango-desde"
              className="text-xs font-medium"
              style={{ color: "var(--foreground-secondary)" }}
            >
              Desde
            </label>
            <input
              id="rango-desde"
              type="date"
              value={desde ?? ""}
              max={hasta ?? undefined}
              onChange={(e) => onChange("personalizado", e.target.value, hasta)}
              className="rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-2"
              style={inputStyle}
            />
          </div>
          <div className="flex items-center gap-2">
            <label
              htmlFor="rango-hasta"
              className="text-xs font-medium"
              style={{ color: "var(--foreground-secondary)" }}
            >
              Hasta
            </label>
            <input
              id="rango-hasta"
              type="date"
              value={hasta ?? ""}
              min={desde ?? undefined}
              onChange={(e) => onChange("personalizado", desde, e.target.value)}
              className="rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-2"
              style={inputStyle}
            />
          </div>
        </>
      )}
    </div>
  );
}
