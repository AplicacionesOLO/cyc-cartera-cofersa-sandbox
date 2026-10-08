/** Respuestas del API del Dashboard (GET /dashboard/*) — misma forma que leían las páginas. */
import type { HistoricoCarteraRow } from '@/components/coordinador/TendenciaCarteraChart';
import type { CarteraRow, KPIs } from '@/lib/utils/cola-analista';
import type {
  AgendaGestion,
  AgendaPromesa,
  KpisAnalistaDashboard,
  PromesaPendiente,
  VendedorResumen,
} from '@/types/dashboard-analista';

/** Fila de fn_get_kpis_cartera() (agrega en SQL; sin límite de filas). */
export interface KpisCartera {
  total_cartera: number;
  total_no_vencido: number;
  total_mora_1_30: number;
  total_mora_31_60: number;
  total_mora_61_90: number;
  total_mora_91_120: number;
  total_mora_120_plus: number;
  total_mora: number;
  n_clientes: number;
  n_en_mora: number;
  fecha_corte: string;
}

export interface VentaMensual {
  anio: number;
  mes: number;
  total_ventas_sin_iva: number;
  cartera_total_mes: number | null;
}

export interface PedidosRetenidosKpis {
  monto_total_retenido?: number;
  pedidos_en_espera?: number;
}

export interface MiembroEquipo {
  id: string;
  nombre: string;
  email: string;
  iniciales: string;
  color: string;
  gHoy: number;
  gSemana: number;
  gMes: number;
}

export interface DashboardCoordinadorResponse {
  kpis_cartera: KpisCartera[];
  ventas_mensuales: VentaMensual[];
  pedidos_retenidos_kpis: PedidosRetenidosKpis | null;
  /** Elegibles por rol con sus conteos de gestiones; la página cruza con analistasConCarteraReal. */
  equipo: MiembroEquipo[];
  recuperacion_kpis: { meta_total?: number; cobrado_total?: number } | null;
  /** config_sistema.meta_mensual (solo cuando el mes no tiene presupuesto congelado). */
  meta_mensual_config: string | null;
  /** Últimos 90 cortes, fecha desc. */
  historico: HistoricoCarteraRow[];
}

export interface TareaSugerida {
  id: string;
  titulo: string;
  mensaje: string | null;
  link: string | null;
  created_at: string;
}

export interface DashboardAnalistaResponse {
  kpis: KpisAnalistaDashboard | null;
  vendedores: VendedorResumen[];
  /** Cola del día ya filtrada: en agenda y no gestionados hoy. */
  cola: CarteraRow[];
  /** cliente_nombre viene del maestro (null si no se encontró). */
  agenda_gestiones: (Omit<AgendaGestion, 'cliente_nombre'> & { cliente_nombre?: string | null })[];
  agenda_promesas: AgendaPromesa[];
  promesas: PromesaPendiente[];
  tareas_sugeridas: TareaSugerida[];
  meta_gestiones_diarias: string | null;
  pedidos_retenidos_kpis: PedidosRetenidosKpis | null;
}

export interface MiCarteraResponse {
  rows: CarteraRow[];
  kpis: KPIs;
}
