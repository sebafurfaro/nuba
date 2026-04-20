"use client";

import { useEffect, useRef, useState } from "react";

// ─── Types & module-level cache ───────────────────────────────────────────────

type Province = { id: string; nombre: string };
type Municipality = { id: string; nombre: string };

let provincesCache: Province[] | null = null;
const municipiosCache: Record<string, Municipality[]> = {};

async function fetchProvinces(): Promise<Province[]> {
  if (provincesCache) return provincesCache;
  const res = await fetch(
    "https://apis.datos.gob.ar/georef/api/v2.0/provincias?campos=id,nombre&max=24&orden=nombre",
  );
  if (!res.ok) throw new Error("provinces fetch failed");
  const data = (await res.json()) as { provincias: Province[] };
  provincesCache = data.provincias;
  return provincesCache;
}

async function fetchMunicipios(provinceId: string): Promise<Municipality[]> {
  if (municipiosCache[provinceId]) return municipiosCache[provinceId]!;
  const res = await fetch(
    `https://apis.datos.gob.ar/georef/api/v2.0/municipios?provincia=${provinceId}&campos=id,nombre&max=200&orden=nombre`,
  );
  if (!res.ok) throw new Error("municipios fetch failed");
  const data = (await res.json()) as { municipios: Municipality[] };
  municipiosCache[provinceId] = data.municipios;
  return municipiosCache[provinceId]!;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface GeoSelectorProps {
  provinceValue?: string | null;
  cityValue?: string | null;
  onProvinceChange?: (province: string | null) => void;
  onCityChange: (city: string | null) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

// ─── Shared select className ───────────────────────────────────────────────────

const SELECT_CLS =
  "h-10 w-full min-w-0 rounded-lg border border-border-subtle bg-background px-3 text-sm text-foreground outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50";

// ─── Component ────────────────────────────────────────────────────────────────

export function GeoSelector({
  provinceValue,
  cityValue,
  onProvinceChange,
  onCityChange,
  required,
  disabled,
  className,
}: GeoSelectorProps) {
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [loadingProvinces, setLoadingProvinces] = useState(true);
  const [loadingMunis, setLoadingMunis] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [internalProvinceId, setInternalProvinceId] = useState("");

  // Fallback state (used only when apiError)
  const [fallbackProvince, setFallbackProvince] = useState(
    provinceValue ?? "",
  );
  const [fallbackCity, setFallbackCity] = useState(cityValue ?? "");
  const fallbackSynced = useRef(false);

  // ─── Load provinces on mount ────────────────────────────────────────────────

  useEffect(() => {
    fetchProvinces()
      .then((data) => {
        setProvinces(data);
        setLoadingProvinces(false);
      })
      .catch(() => {
        setApiError(true);
        setLoadingProvinces(false);
      });
  }, []);

  // ─── Sync provinceValue → internal ID ─────────────────────────────────────
  // Runs when provinces list arrives OR when provinceValue changes from parent
  // (e.g. form.reset). Only updates internal ID when the name actually maps.

  useEffect(() => {
    if (!provinces.length) return;
    if (!provinceValue) {
      // Province was cleared from outside (form.reset to create mode)
      setInternalProvinceId("");
      return;
    }
    const found = provinces.find((p) => p.nombre === provinceValue);
    if (found && found.id !== internalProvinceId) {
      setInternalProvinceId(found.id);
    }
  // internalProvinceId intentionally omitted to avoid loop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provinceValue, provinces]);

  // ─── Load municipalities on province change ─────────────────────────────────

  useEffect(() => {
    if (!internalProvinceId) {
      setMunicipalities([]);
      return;
    }
    setLoadingMunis(true);
    fetchMunicipios(internalProvinceId)
      .then((data) => {
        setMunicipalities(data);
        setLoadingMunis(false);
      })
      .catch(() => {
        setMunicipalities([]);
        setLoadingMunis(false);
      });
  }, [internalProvinceId]);

  // ─── Sync fallback state when apiError and props change (edit mode) ─────────

  useEffect(() => {
    if (!apiError || fallbackSynced.current) return;
    setFallbackProvince(provinceValue ?? "");
    setFallbackCity(cityValue ?? "");
    fallbackSynced.current = true;
  }, [apiError, provinceValue, cityValue]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  function handleProvinceChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setInternalProvinceId(id);
    onCityChange(null);
    if (onProvinceChange) {
      if (!id) {
        onProvinceChange(null);
      } else {
        const found = provinces.find((p) => p.id === id);
        onProvinceChange(found?.nombre ?? null);
      }
    }
  }

  function handleCityChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    if (!id) {
      onCityChange(null);
      return;
    }
    const found = municipalities.find((m) => m.id === id);
    onCityChange(found?.nombre ?? null);
  }

  // ─── Fallback render ────────────────────────────────────────────────────────

  if (apiError) {
    return (
      <div className={`flex flex-col gap-3 ${className ?? ""}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {onProvinceChange !== undefined && (
            <div className="flex flex-col gap-1">
              <label className="text-sm text-foreground-secondary">
                Provincia{" "}
                {!required && (
                  <span className="text-xs font-normal">(opcional)</span>
                )}
              </label>
              <input
                type="text"
                value={fallbackProvince}
                className={SELECT_CLS}
                disabled={disabled}
                onChange={(e) => {
                  setFallbackProvince(e.target.value);
                  onProvinceChange(e.target.value || null);
                }}
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-sm text-foreground-secondary">
              Ciudad{" "}
              {!required && (
                <span className="text-xs font-normal">(opcional)</span>
              )}
            </label>
            <input
              type="text"
              value={fallbackCity}
              className={SELECT_CLS}
              disabled={disabled}
              onChange={(e) => {
                setFallbackCity(e.target.value);
                onCityChange(e.target.value || null);
              }}
            />
          </div>
        </div>
        <p className="text-xs text-foreground-muted">
          Selector no disponible, ingresá manualmente
        </p>
      </div>
    );
  }

  // ─── Derive current select values ──────────────────────────────────────────

  const currentProvinceSelectId =
    internalProvinceId ||
    provinces.find((p) => p.nombre === provinceValue)?.id ||
    "";

  const currentCitySelectId =
    municipalities.find((m) => m.nombre === cityValue)?.id ?? "";

  // ─── Normal render ──────────────────────────────────────────────────────────

  return (
    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${className ?? ""}`}>
      {/* Province select */}
      <div className="flex flex-col gap-1">
        <label className="text-sm text-foreground-secondary">
          Provincia{" "}
          {!required && (
            <span className="text-xs font-normal">(opcional)</span>
          )}
        </label>
        <select
          className={SELECT_CLS}
          value={loadingProvinces ? "" : currentProvinceSelectId}
          onChange={handleProvinceChange}
          disabled={disabled || loadingProvinces}
        >
          <option value="">
            {loadingProvinces ? "Cargando..." : "Seleccionar provincia"}
          </option>
          {provinces.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* City select */}
      <div className="flex flex-col gap-1">
        <label className="text-sm text-foreground-secondary">
          Ciudad{" "}
          {!required && (
            <span className="text-xs font-normal">(opcional)</span>
          )}
        </label>
        <select
          className={SELECT_CLS}
          value={loadingMunis ? "" : currentCitySelectId}
          onChange={handleCityChange}
          disabled={disabled || !currentProvinceSelectId || loadingMunis}
        >
          <option value="">
            {loadingMunis
              ? "Cargando ciudades..."
              : !currentProvinceSelectId
                ? "Seleccionar provincia primero"
                : "Seleccionar ciudad"}
          </option>
          {!loadingMunis &&
            municipalities.length === 0 &&
            currentProvinceSelectId && (
              <option value="" disabled>
                Sin datos disponibles
              </option>
            )}
          {municipalities.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
