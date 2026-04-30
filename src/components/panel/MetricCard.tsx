import { Skeleton } from "@heroui/react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { ReactNode } from "react";

interface MetricCardProps {
  label: string;
  value: string;
  variacion?: number | null;
  descripcion?: string;
  icon?: ReactNode;
  isLoading?: boolean;
}

export function MetricCard({
  label,
  value,
  variacion,
  descripcion,
  icon,
  isLoading = false,
}: MetricCardProps) {
  if (isLoading) {
    return (
      <div
        className="rounded-2xl border p-4"
        style={{
          background: "var(--background-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <Skeleton className="mb-3 h-4 w-24 rounded" />
        <Skeleton className="mb-2 h-7 w-32 rounded" />
        <Skeleton className="h-3 w-20 rounded" />
      </div>
    );
  }

  const hasVariacion = variacion !== undefined && variacion !== null;
  const isPositive = hasVariacion && variacion > 0;
  const isNegative = hasVariacion && variacion < 0;

  return (
    <div
      className="rounded-2xl border p-4 transition-shadow hover:shadow-sm"
      style={{
        background: "var(--background-surface)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <p
          className="text-xs font-medium uppercase tracking-wide"
          style={{ color: "var(--foreground-muted)" }}
        >
          {label}
        </p>
        {icon != null && (
          <span
            className="flex size-7 items-center justify-center rounded-lg"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            {icon}
          </span>
        )}
      </div>

      <p
        className="text-2xl font-semibold tracking-tight"
        style={{ color: "var(--foreground)" }}
      >
        {value}
      </p>

      <div className="mt-1.5 flex items-center gap-1.5">
        {hasVariacion ? (
          <>
            {isPositive && (
              <TrendingUp
                className="size-3.5"
                style={{ color: "var(--success)" }}
              />
            )}
            {isNegative && (
              <TrendingDown
                className="size-3.5"
                style={{ color: "var(--danger)" }}
              />
            )}
            {!isPositive && !isNegative && (
              <Minus
                className="size-3.5"
                style={{ color: "var(--foreground-muted)" }}
              />
            )}
            <span
              className="text-xs font-medium"
              style={{
                color: isPositive
                  ? "var(--success)"
                  : isNegative
                    ? "var(--danger)"
                    : "var(--foreground-muted)",
              }}
            >
              {isPositive ? "+" : ""}
              {variacion}% vs período anterior
            </span>
          </>
        ) : (
          <span
            className="text-xs"
            style={{ color: "var(--foreground-muted)" }}
          >
            {descripcion ?? "Sin datos del período anterior"}
          </span>
        )}
      </div>
    </div>
  );
}
