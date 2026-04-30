export interface CashRegister {
  id: string;
  tenantId: string;
  branchId: string;
  branchNombre: string;
  cerradoPor: string;
  cerradoPorNombre: string;
  fechaCierre: string; // ISO date YYYY-MM-DD
  totalEfectivo: number;
  totalMp: number;
  totalOtros: number;
  totalGeneral: number;
  cantidadOrdenes: number;
  notas: string | null;
  createdAt: string;
}

export interface OrdenHistorial {
  id: string;
  numero: number;
  branchId: string;
  branchNombre: string;
  locationNombre: string;
  tableNombre: string | null;
  statusKey: string;
  statusNombre: string;
  total: number;
  totalCosto: number | null;
  margen: number | null;
  margenPct: number | null;
  metodoPago: string | null;
  cantidadItems: number;
  archivedAt: string | null;
  cashRegisterId: string | null;
  createdAt: string;
  closedAt: string | null;
}

export interface RentabilidadPeriodo {
  desde: string;
  hasta: string;
  totalVentas: number;
  totalCosto: number;
  margenBruto: number;
  margenPct: number;
  foodCostPct: number;
  porProducto: RentabilidadProducto[];
  porDia: RentabilidadDia[];
}

export interface RentabilidadProducto {
  productoId: string;
  productoNombre: string;
  cantidadVendida: number;
  totalVentas: number;
  totalCosto: number;
  margenPct: number;
  foodCostPct: number;
}

export interface RentabilidadDia {
  fecha: string;
  totalVentas: number;
  totalCosto: number;
  margenPct: number;
}

export interface OrdenParaArchivar {
  id: string;
  locationNombre: string;
  tableNombre: string | null;
  statusKey: string;
  statusNombre: string;
  total: number;
  metodoPago: string | null;
  closedAt: string | null;
  cantidadItems: number;
}

export interface OrdenesHistorialResponse {
  ordenes: OrdenHistorial[];
  total: number;
  page: number;
  limit: number;
}

export interface CierreDetalle extends CashRegister {
  ordenes: OrdenParaArchivar[];
}
