// src/types/presupuesto.ts
// Tipos del módulo Presupuesto de Cobro

export interface PptoCliente {
  cliente_cod: string;
  cliente_nombre: string;
  dias_prom: number;
  dias_prom_ajustado: number;
  n_facturas: number;
  ppto_cartera: number;
  ppto_nuevas_ventas: number;
  ppto_total: number;
}

export interface PptoVendedor {
  vendedor_cod: string;
  vendedor_nombre: string;
  n_clientes: number;
  ppto_cartera: number;
  ppto_nuevas_ventas: number;
  ppto_total: number;
  clientes: PptoCliente[];
}

export interface PresupuestoResult {
  kpis: {
    anio: number;
    mes: number;
    ppto_total: number;
    ppto_cartera: number;
    ppto_nuevas_ventas: number;
    n_clientes: number;
    n_vendedores: number;
  };
  vendedores: PptoVendedor[];
}

// ── Recuperación ─────────────────────────────────────────────────────────

export interface RecupCliente {
  cliente_cod: string;
  cliente_nombre: string;
  meta: number;
  cobrado: number;
  pct: number | null;
}

export interface RecupVendedor {
  vendedor_cod: string;
  vendedor_nombre: string;
  vendedor_email: string | null;
  supervisor_email: string | null;
  analista_email: string | null; // CC automático en envíos por vendedor
  meta: number;
  cobrado: number;
  proyeccion: number;
  pct: number | null;
  pct_proyectado: number | null;
  clientes: RecupCliente[];
}

export interface RecuperacionResult {
  kpis: {
    anio: number;
    mes: number;
    congelado: boolean;
    meta_total: number;
    cobrado_total: number;
    pct: number;
    proyeccion_fin_mes: number;
    pct_proyectado: number;
    dias_mes: number;
    dias_transcurridos: number;
  };
  vendedores: RecupVendedor[];
  serie: { dia: string; monto: number }[];
}

// ── Proyección ───────────────────────────────────────────────────────────

export interface ProyeccionSemana {
  idx: number;
  tipo: 'pasada' | 'actual' | 'futura';
  inicio: string;
  fin: string;
  // esperado_facturas es null en semanas pasadas sin snapshot congelado
  // (anteriores al 08/06/2026) — no se recalcula en vivo a propósito.
  esperado_facturas: number | null;
  cobrado: number;
  cumplimiento: number | null;
}

export interface ProyeccionResult {
  kpis: {
    horizonte_semanas: number;
    total_esperado: number;
    total_cobrado: number;
    mora_vencida: number;
  };
  semanas: ProyeccionSemana[];
}
