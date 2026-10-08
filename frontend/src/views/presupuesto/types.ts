/** Tipos del módulo Presupuesto de Cobro (respuestas de /presupuesto/*). */
import type { PptoCliente } from '@/types/presupuesto';
import type { SinPagoFila } from '@/types/reportes';

/** Fila por vendedor del presupuesto (congelado trae meta/meta_editada). */
export interface PresupuestoVendedorRow {
  vendedor_cod: string;
  vendedor_nombre: string;
  n_clientes: number;
  ppto_cartera: number;
  ppto_nuevas_ventas: number;
  ppto_total: number;
  meta?: number;
  meta_editada?: boolean;
  clientes: PptoCliente[];
}

/** GET /presupuesto/mes — congelado (fn_presupuesto_frozen) o estimado (fn_presupuesto_preview). */
export interface PresupuestoMes {
  congelado: boolean;
  kpis: {
    anio: number;
    mes: number;
    ppto_total: number;
    ppto_cartera: number;
    ppto_nuevas_ventas: number;
    n_clientes: number;
    n_vendedores: number;
  };
  vendedores: PresupuestoVendedorRow[];
}

export interface PresupuestoAccionResult {
  ok: boolean;
  n_clientes?: number;
  ppto_total?: number;
}

export interface VendedorOpcion {
  cod: string;
  nombre: string;
}

/** GET /presupuesto/destinatarios — insumos para armar los destinatarios del Presupuesto General. */
export interface DestinatariosPresupuesto {
  vendedores: { cod: string; nombre: string; email: string | null; activo: boolean }[];
  supervisores: { email: string | null }[];
  grupos: { principal_cod: string }[];
  miembros: { principal_cod: string; vendedor_cod: string; activo: boolean }[];
}

export interface EnvioCorreoBody {
  to: string;
  cc?: string[];
  subject: string;
  html: string;
}

export interface EnvioCorreoResult {
  ok: boolean;
  email_sent: boolean;
  to: string;
}

/** GET /presupuesto/sin-pago */
export interface SinPagoResponse {
  filas: SinPagoFila[];
  ppto_total: number;
}

export interface RecuperacionPeriodoParams {
  ini: string;
  fin: string;
  email: string | null;
  group: 'analista' | 'vendedor';
}
