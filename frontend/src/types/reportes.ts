// src/types/reportes.ts
// Tipos para el módulo Hub de Reportes

export type RolReporte = 'COORDINADOR' | 'ANALISTA' | 'ANALISTA_RIESGO' | 'GERENCIA';
export type FormatoReporte = 'pantalla' | 'pdf' | 'excel';
export type CategoriaReporte = 'GERENCIA' | 'VENTAS' | 'COBRANZA' | 'CONTROL' | 'ANALISTA';

/** Definición de un reporte en el catálogo central */
export interface ReporteDef {
  id: string;
  titulo: string;
  descripcion: string;
  categoria: CategoriaReporte;
  icono: string; // clave de icono lucide (mapeada en HubGrid)
  roles: RolReporte[];
  href: string;
  formatos: FormatoReporte[];
  programable: boolean; // si puede entregarse en envío programado (Fase 2)
  disponible: boolean; // false → tarjeta "Próximamente", no navega
}

// ── RPC fn_reporte_mora_vendedor ────────────────────────────────────────

export interface MoraVendedorCliente {
  cliente_cod: string;
  cliente_nombre: string;
  cartera_total: number;
  no_vencido: number;
  mora_1_30: number;
  mora_31_60: number;
  mora_61_90: number;
  mora_91_120: number;
  mora_120_plus: number;
  mora_total: number;
  pct_mora: number;
}

export interface MoraVendedorRow {
  vendedor_cod: string;
  vendedor_nombre: string;
  supervisor_cod: string;
  vendedor_email: string | null;
  supervisor_email: string | null;
  analistas_email: string[];
  total_clientes: number;
  cartera_total: number;
  no_vencido: number;
  mora_1_30: number;
  mora_31_60: number;
  mora_61_90: number;
  mora_91_120: number;
  mora_120_plus: number;
  mora_total: number;
  pct_mora: number;
  clientes: MoraVendedorCliente[];
}

export interface MoraVendedorKPIs {
  cartera_total: number;
  mora_total: number;
  pct_mora: number;
  total_vendedores: number;
}

export interface MoraVendedorResult {
  kpis: MoraVendedorKPIs;
  rows: MoraVendedorRow[];
}

// ── fn_reporte_bloqueados ────────────────────────────────────────────────

export interface BloqueadoCliente {
  cliente_cod: string;
  cliente_nombre: string;
  no_vencido: number;
  m1_30: number;
  m31_60: number;
  m61_90: number;
  m91_120: number;
  m120: number;
  total: number;
  saldo_vencido: number;
  semanas: number;
  es_nuevo: boolean;
}

export interface BloqueadosVendedor {
  vendedor_cod: string;
  vendedor_nombre: string;
  supervisor_cod: string | null;
  vendedor_email: string | null;
  supervisor_email: string | null;
  analistas_email: string[];
  n_clientes: number;
  saldo_vencido: number;
  criticos_120: number;
  clientes: BloqueadoCliente[];
}

export interface BloqueadosGerencial {
  vendedor_nombre: string;
  n_clientes: number;
  saldo_vencido: number;
  criticos_120: number;
}

export interface BloqueadosEscalacion {
  cliente_cod: string;
  cliente_nombre: string;
  vendedor_nombre: string;
  semanas: number;
  saldo_vencido: number;
}

export interface BloqueadosResult {
  kpis: {
    total_bloqueados: number;
    saldo_vencido_total: number;
    criticos_120: number;
    total_vendedores: number;
    fecha_semana: string;
  };
  vendedores: BloqueadosVendedor[];
  gerencial: BloqueadosGerencial[];
  escalacion: BloqueadosEscalacion[];
}

// ── fn_reporte_plazo_especial ────────────────────────────────────────────

export interface PlazoEspecialFactura {
  documento: string;
  cliente_nombre: string;
  contribuyente: string;
  cliente_cod: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  plazo_factura: number;
  plazo_cliente: number;
  monto: number;
  saldo: number;
  dias_a_vencer: number;
  vencida: boolean;
}

export interface PlazoEspecialVendedor {
  vendedor_cod: string;
  vendedor_nombre: string;
  supervisor_cod: string | null;
  vendedor_email: string | null;
  supervisor_email: string | null;
  analistas_email: string[];
  n_facturas: number;
  vencidas: number;
  saldo_total: number;
  facturas: PlazoEspecialFactura[];
}

export interface PlazoEspecialResult {
  kpis: {
    total_facturas: number;
    saldo_total: number;
    vencidas: number;
    total_vendedores: number;
  };
  vendedores: PlazoEspecialVendedor[];
}

// ── fn_reporte_aging ──────────────────────────────────────────────────────

export interface AgingFila {
  nombre: string;
  n_clientes: number;
  no_vencido: number;
  m1_30: number;
  m31_60: number;
  m61_90: number;
  m91_120: number;
  m120: number;
  mora_total: number;
  total: number;
  pct_mora: number;
}
export interface AgingResult {
  consolidado: Omit<AgingFila, 'nombre'>;
  por_analista: AgingFila[];
  por_vendedor: AgingFila[];
}

// ── fn_reporte_cei (Índice de Efectividad de Cobro) ───────────────────────

export interface CeiVendedorRow {
  vendedor_cod: string;
  vendedor_nombre: string;
  supervisor_cod: string | null;
  supervisor_nombre: string;
  analista_email: string | null;
  analista_nombre: string;
  cobrado: number;
  vencido: number;
  cei: number | null; // cobrado/vencido*100 (null si vencido=0)
  provisional: boolean; // apertura provisional (cierre del mes anterior aproximado)
  apertura_anio: number; // mes cuyo cierre se usa como saldo vencido de apertura
  apertura_mes: number;
}

// ── fn_reporte_migracion_mora (roll rates) ────────────────────────────────
export interface MigracionMatrizRow {
  tramo: string; // tramo origen (mes anterior)
  saldo_origen: number;
  destinos: Record<string, number>; // tramo destino -> colones (incluye 'PAGADO')
}
export interface MigracionMoraResult {
  disponible: boolean;
  mensaje?: string;
  provisional?: boolean;
  periodo: { anio: number; mes: number; label: string };
  anterior: { anio: number; mes: number; label: string };
  matriz?: MigracionMatrizRow[];
  balances_actual?: Record<string, number>;
  kpis?: { roll_critico_pct: number; perdida_esperada: number; vencido_actual: number };
}

// ── fn_recuperacion_periodo ───────────────────────────────────────────────

export interface RecupPeriodoResult {
  kpis: {
    ini: string;
    fin: string;
    total: number;
    n_pagos: number;
    n_clientes: number;
    dias: number;
  };
  grupos: { nombre: string; cobrado: number; n_pagos: number; n_clientes: number }[];
  serie: { dia: string; monto: number }[];
  top_clientes: {
    cliente_cod: string;
    cliente_nombre: string;
    analista: string;
    vendedor: string;
    cobrado: number;
  }[];
}

// ── fn_recuperacion_tramos ────────────────────────────────────────────────

export interface RecupTramosKPIs {
  ini: string;
  fin: string;
  total: number;
  n_pagos: number;
  n_clientes: number;
  dias: number;
  no_vencido: number;
  mora_1_30: number;
  mora_31_60: number;
  mora_61_90: number;
  mora_91_120: number;
  mora_120_plus: number;
}

export interface RecupTramosGrupo {
  nombre: string;
  total: number;
  no_vencido: number;
  mora_1_30: number;
  mora_31_60: number;
  mora_61_90: number;
  mora_91_120: number;
  mora_120_plus: number;
}

export interface RecupTramosResult {
  kpis: RecupTramosKPIs;
  grupos: RecupTramosGrupo[];
}

// ── fn_recuperacion_mom ───────────────────────────────────────────────────

export interface RecupMomMes {
  mes_ini: string;
  anio: number;
  mes: number;
  dias_mes: number;
  total: number;
  n_pagos: number;
  n_clientes: number;
  promedio_diario: number;
}

export type RecupMomResult = RecupMomMes[];

// ── fn_reporte_efectividad ────────────────────────────────────────────────

export interface EfectividadKPIs {
  total: number;
  compromisos: number;
  contactadas: number;
  analistas_activos: number;
  clientes_gestionados: number;
}

export interface EfectividadAnalista {
  analista_email: string;
  analista_nombre: string;
  total: number;
  compromisos: number;
  contactadas: number;
  dias_activos: number;
  whatsapps: number;
  correos: number;
  llamadas: number;
  visitas: number;
  internas: number;
  clientes_gestionados: number;
}

export interface EfectividadTipo {
  tipo: string;
  total: number;
}

export interface EfectividadResultado {
  resultado: string;
  total: number;
}

export interface EfectividadDia {
  dia: string;
  total: number;
  compromisos: number;
}

export interface EfectividadResult {
  kpis: EfectividadKPIs;
  por_analista: EfectividadAnalista[];
  por_tipo: EfectividadTipo[];
  por_resultado: EfectividadResultado[];
  serie_diaria: EfectividadDia[];
}

// ── fn_aging_por_dimension ────────────────────────────────────────────────
export interface AgingDimensionFila {
  dimension: string;
  n_clientes: number;
  no_vencido: number;
  m1_30: number;
  m31_60: number;
  m61_90: number;
  m91_120: number;
  m120: number;
  mora_total: number;
  total: number;
  pct_mora: number;
}

// ── Nuevos en mora (query directa a cartera) ──────────────────────────────
export interface NuevosMoraFila {
  cliente_cod: string;
  cliente_nombre: string;
  vendedor_nombre: string;
  analista_nombre: string;
  dimension: string;
  mora_1_30: number;
  no_vencido: number;
  condicion_pago: string | null;
}

// ── fn_sin_pago_cliente ───────────────────────────────────────────────────
export interface SinPagoFila {
  cliente_cod: string;
  cliente_nombre: string;
  vendedor_nombre: string;
  analista_nombre: string;
  dimension: string;
  agrupacion: string;
  ppto_mes: number;
  cobrado: number;
}

// ── Reporte "Resumen de Cierre Mensual" (ago 2026) ────────────────────────
// Sin RPC nueva a propósito: se arma en el servidor (page.tsx) combinando
// fn_recuperacion (ya existe, alcance de presupuesto) con agregaciones en
// JS sobre historico_aging_factura (snapshot congelado por factura al
// cierre de cada mes) y pagos (para el deterioro de ICP) -- así el dato es
// "al cierre del mes elegido", no "a hoy", sin tocar la base de datos.

export interface CierreVendedorRow {
  vendedor_cod: string;
  vendedor_nombre: string;
  zona: string;
  meta: number;
  cobrado: number;
  pct: number | null;
  avaluoPct: number; // fórmula corporativa src/lib/utils/riesgo.ts, aplicada a los tramos del cierre del vendedor
  avaluoBadge: string; // 'CRÍTICO' | 'SOBRE META' | 'DENTRO DE META'
  portafolioAcotado: boolean; // true si esta ruta absorbe la cartera de otro(s) vendedor(es)
  miembrosAcotado: string[]; // nombres de los vendedores absorbidos (solo si portafolioAcotado)
}

export interface CierreClienteMonto {
  cliente_cod: string;
  cliente_nombre: string;
  vendedor_nombre: string;
  meta: number;
  cobrado: number;
}

export interface CierreClienteDeficit extends CierreClienteMonto {
  deficit: number;
  pct: number;
}

export interface CierreTopMora {
  cliente_cod: string;
  cliente_nombre: string;
  vendedor_nombre: string;
  no_vencido: number;
  mora_1_30: number;
  mora_31_60: number;
  mora_61_90: number;
  mora_91_120: number;
  mora_120_plus: number;
  mora_total: number;
  total_general: number;
  pct_cta_vencida: number;
}

export interface CierreTopMejora {
  cliente_cod: string;
  cliente_nombre: string;
  vendedor_nombre: string;
  mora_anterior: number;
  mora_actual: number;
  reduccion: number;
}

export interface CierreDeterioroICP {
  cliente_cod: string;
  cliente_nombre: string;
  vendedor_nombre: string;
  atraso_previo: number;
  atraso_reciente: number;
  delta: number;
}

export interface CierreMensualData {
  anio: number;
  mes: number;
  mesLabel: string;
  disponible: boolean; // false si no hay snapshot congelado para ese mes
  mesesDisponibles: { anio: number; mes: number; label: string }[];
  kpis: {
    meta_total: number;
    cobrado_total: number;
    pct: number;
    n_vendedores: number;
    n_sin_pago: number; // total real (antes de recortar a 10) -- para el KPI de cabecera
    n_deficit: number;
  };
  vendedores: CierreVendedorRow[];
  topMora: CierreTopMora[];
  sinPago: CierreClienteMonto[];
  deficit: CierreClienteDeficit[];
  mejoras: CierreTopMejora[];
  deterioro: CierreDeterioroICP[];
}
