/** Tipos de respuesta del módulo Reportes (API /reportes/*) que no estaban en `@/types/reportes`. */
import type { Gestion } from '@/types/database';
import type { ConcentracionResult } from '@/types/analisis-pagos';
import type { RecupMomMes } from '@/types/reportes';
import type { HistoricoCarteraRow } from '@/components/coordinador/TendenciaCarteraChart';

export type { Gestion };

// ── Envío por correo (POST /reportes/enviar) ─────────────────────────────────
export interface EnvioReporteBody {
  to: string;
  cc?: string[];
  subject: string;
  html: string;
  adjunto?: { base64: string; mimeType: string; filename: string } | null;
}

export interface EnvioReporteResult {
  ok: boolean;
  email_sent: boolean;
  to: string;
}

// ── Estados de cuenta ─────────────────────────────────────────────────────────
export interface ContribEC {
  contribuyente: string;
  cliente_nombre: string;
  rep_cod: string;
  n_codigos: number;
  correo: string;
  analista_email: string | null;
  analista_nombre: string;
  saldo: number;
  ultimo_envio: string | null;
  vendedor_cod: string | null;
  vendedor_nombre: string | null;
}

// ── Migración de mora ──────────────────────────────────────────────────────────
export interface SupervisorOpcion {
  cod: string;
  nombre: string;
}
export interface VendedorOpcion {
  cod: string;
  nombre: string;
  supervisor_cod: string | null;
}
export interface MigracionFiltros {
  supervisores: SupervisorOpcion[];
  vendedores: VendedorOpcion[];
}

// ── Cartera vencida (analista) ─────────────────────────────────────────────────
export interface CarteraVencidaRow {
  cliente_cod: string;
  cliente_nombre: string;
  vendedor_nombre: string;
  mora_1_30: number;
  mora_31_60: number;
  mora_61_90: number;
  mora_91_120: number;
  mora_120_plus: number;
  ultima_gestion: string | null;
}

// ── Resumen ejecutivo (GET /reportes/resumen-ejecutivo) ────────────────────────
export interface KpisCartera {
  total_no_vencido: number;
  total_mora_1_30: number;
  total_mora_31_60: number;
  total_mora_61_90: number;
  total_mora_91_120: number;
  total_mora_120_plus: number;
  total_cartera: number;
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

export interface ResumenEjecutivoRaw {
  kpis: KpisCartera[];
  ventas: VentaMensual[];
  concentracion: ConcentracionResult | null;
  recaudo_meses: RecupMomMes[];
  historico: HistoricoCarteraRow[];
}

// ── Cierre mensual (GET /reportes/cierre-mensual) ──────────────────────────────
export interface RecuperacionCliente {
  cliente_cod: string;
  cliente_nombre: string;
  meta: number;
  cobrado: number;
}
export interface RecuperacionVendedor {
  vendedor_cod: string;
  vendedor_nombre: string;
  meta: number;
  cobrado: number;
  pct: number | null;
  clientes: RecuperacionCliente[];
}
export interface RecuperacionJson {
  kpis: { meta_total: number; cobrado_total: number; pct: number };
  vendedores: RecuperacionVendedor[];
}
export interface McRow {
  cliente_cod: string;
  cliente_nombre: string;
  vendedor_nombre: string | null;
  vendedor_cod: string | null;
  updated_at: string | null;
}
export interface MoraRow {
  cliente_cod: string;
  no_vencido: number;
  mora_1_30: number;
  mora_31_60: number;
  mora_61_90: number;
  mora_91_120: number;
  mora_120_plus: number;
  mora_actual: number;
  mora_anterior: number;
  total_actual: number;
}
export interface IcpRow {
  cliente_cod: string;
  atraso_previo: number;
  n_previo: number;
  atraso_reciente: number;
  n_reciente: number;
}
export interface RiesgoVendedorRow {
  vendedor_cod: string;
  no_vencido: number;
  mora_1_30: number;
  mora_31_60: number;
  mora_61_90: number;
  mora_91_120: number;
  mora_120_plus: number;
}
export interface VendedorRow {
  cod: string;
  nombre: string;
  zona: string | null;
}
export interface PortafolioGrupoRow {
  principal_cod: string;
}
export interface PortafolioMiembroRow {
  principal_cod: string;
  vendedor_cod: string;
}

export interface CierreMensualRaw {
  meses: { anio: number; mes: number }[];
  vendedores: VendedorRow[];
  grupos: PortafolioGrupoRow[];
  miembros: PortafolioMiembroRow[];
  maestro: McRow[];
  recuperacion: RecuperacionJson | null;
  riesgo: RiesgoVendedorRow[];
  mora: MoraRow[];
  icp: IcpRow[];
}
