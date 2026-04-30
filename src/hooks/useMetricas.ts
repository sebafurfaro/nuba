"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MetricasDashboard,
  RangoMetricas,
  UseMetricasParams,
} from "@/types/metricas";

interface UseMetricasReturn {
  metricas: MetricasDashboard | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMetricas({
  tenantId,
  rango,
  desde,
  hasta,
}: UseMetricasParams): UseMetricasReturn {
  const [metricas, setMetricas] = useState<MetricasDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchMetricas = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({ rango });
    if (rango === "personalizado") {
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);
    }

    fetch(`/api/${tenantId}/metricas?${params.toString()}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(j?.error ?? "Error al cargar métricas");
        }
        return res.json() as Promise<MetricasDashboard>;
      })
      .then((data) => {
        setMetricas(data);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Error desconocido",
        );
        setIsLoading(false);
      });
  }, [tenantId, rango, desde, hasta]);

  useEffect(() => {
    fetchMetricas();
    return () => abortRef.current?.abort();
  }, [fetchMetricas]);

  return { metricas, isLoading, error, refetch: fetchMetricas };
}

// ─── Formatting helpers (exported for re-use in components) ───────────────────

export function formatARS(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatRangoLabel(rango: RangoMetricas): string {
  const map: Record<RangoMetricas, string> = {
    hoy: "Hoy",
    semana: "Esta semana",
    mes: "Este mes",
    personalizado: "Personalizado",
  };
  return map[rango];
}
