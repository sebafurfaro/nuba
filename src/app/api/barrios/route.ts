import { NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GeorefAsentamiento {
  id: string;
  nombre: string;
  categoria: string;
  departamento: { id: string; nombre: string };
  centroide: { lat: number; lon: number };
  provincia: { id: string; nombre: string };
}

interface GeorefResponse {
  asentamientos: GeorefAsentamiento[];
}

export interface BarrioData {
  id: string;
  nombre: string;
  comuna: string;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const res = await fetch(
      "https://apis.datos.gob.ar/georef/api/asentamientos?provincia=02&max=100",
      { next: { revalidate: 86400 } },
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: "Error al obtener barrios" },
        { status: 502 },
      );
    }

    const data = (await res.json()) as GeorefResponse;

    const barrios: BarrioData[] = data.asentamientos
      .map((a) => ({
        id: a.id,
        nombre: a.nombre,
        comuna: a.departamento.nombre,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

    return NextResponse.json(barrios);
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
