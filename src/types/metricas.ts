export type RangoMetricas = "hoy" | "semana" | "mes" | "personalizado";

export interface DatoPorDia {
  fecha: string; // YYYY-MM-DD
  total?: number;
  cantidad?: number;
}

export interface MetricasVentas {
  total_ingresos: number;
  total_ordenes: number;
  ticket_promedio: number;
  variacion_ingresos: number | null;
  variacion_ordenes: number | null;
  ingresos_por_dia: { fecha: string; total: number }[];
  ordenes_por_dia: { fecha: string; cantidad: number }[];
}

export interface MetricasReservas {
  total_reservas: number;
  confirmadas: number;
  pendientes: number;
  no_shows: number;
  tasa_no_show: number;
  variacion_reservas: number | null;
  reservas_por_dia: { fecha: string; cantidad: number }[];
}

export interface ProductoTop {
  productoId: string;
  nombre: string;
  cantidad: number;
  ingresos: number;
}

export interface CategoriaTop {
  categoriaId: string;
  nombre: string;
  ingresos: number;
}

export interface MetricasProductos {
  mas_vendidos: ProductoTop[];
  categorias_top: CategoriaTop[];
}

export interface MetricasDashboard {
  ventas: MetricasVentas;
  reservas: MetricasReservas;
  productos: MetricasProductos;
}

export interface UseMetricasParams {
  tenantId: string;
  rango: RangoMetricas;
  desde?: string;
  hasta?: string;
}
