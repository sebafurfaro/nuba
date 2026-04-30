"use client";

import { useEffect, useState } from "react";

export type Barrio = {
  id: string;
  nombre: string;
  comuna: string;
};

type UseBarriosCabaOptions = {
  enabled?: boolean;
};

type UseBarriosCabaResult = {
  barrios: Barrio[];
  isLoading: boolean;
  error: string | null;
};

export function useBarriosCaba(
  { enabled = true }: UseBarriosCabaOptions = {},
): UseBarriosCabaResult {
  const [barrios, setBarrios] = useState<Barrio[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetch("/api/barrios")
      .then((res) => {
        if (!res.ok) throw new Error("Error al cargar barrios");
        return res.json() as Promise<Barrio[]>;
      })
      .then((data) => {
        if (!cancelled) setBarrios(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error desconocido");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { barrios, isLoading, error };
}
