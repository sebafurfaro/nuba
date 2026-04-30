"use client";

import { useBarriosCaba } from "@/hooks/useBarriosCaba";

export type { Barrio } from "@/hooks/useBarriosCaba";

// ─── Props ────────────────────────────────────────────────────────────────────

interface BarrioSelectorProps {
  value: string;
  onChange: (value: string) => void;
  isDisabled?: boolean;
  label?: string;
  id?: string;
  error?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BarrioSelector({
  value,
  onChange,
  isDisabled = false,
  label = "Barrio",
  id = "barrio-selector",
  error,
}: BarrioSelectorProps) {
  const { barrios, isLoading, error: fetchError } = useBarriosCaba({
    enabled: !isDisabled,
  });

  const hasError = Boolean(error ?? fetchError);

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="text-sm font-medium"
        style={{ color: "var(--foreground)" }}
      >
        {label}
      </label>

      <select
        id={id}
        value={value}
        disabled={isDisabled || isLoading}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          background: "var(--background-raised)",
          borderColor: hasError ? "var(--danger)" : "var(--border-default)",
          color: "var(--foreground)",
          focusRingColor: "var(--accent)",
        }}
      >
        <option value="">
          {isLoading ? "Cargando barrios..." : "Seleccionar barrio"}
        </option>
        {!isLoading &&
          barrios.map((barrio) => (
            <option key={barrio.id} value={barrio.id}>
              {barrio.nombre}
            </option>
          ))}
      </select>

      {(error ?? fetchError) && (
        <p className="text-xs" style={{ color: "var(--danger)" }}>
          {error ?? fetchError}
        </p>
      )}
    </div>
  );
}
