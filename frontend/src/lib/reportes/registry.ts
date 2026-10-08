// src/lib/reportes/registry.ts
// Catálogo central de reportes (single source of truth del Hub).
// Agregar un reporte nuevo = agregar una entrada acá + su vista.

import type { CategoriaReporte, ReporteDef } from '@/types/reportes';

// ── Metadata de cada categoría (orden + presentación en el Hub) ──────────

export const CATEGORIAS: Record<
  CategoriaReporte,
  {
    label: string;
    descripcion: string;
    icono: string;
    orden: number;
  }
> = {
  GERENCIA: {
    label: 'Inteligencia Financiera y Estratégica',
    descripcion: 'Reportes ejecutivos para dirección',
    icono: 'Briefcase',
    orden: 1,
  },
  VENTAS: {
    label: 'Gestión Comercial y Preventiva',
    descripcion: 'Comportamiento comercial y control por vendedor',
    icono: 'TrendingUp',
    orden: 2,
  },
  COBRANZA: {
    label: 'Control de Riesgo y Operaciones',
    descripcion: 'Operación de cartera, riesgo y recuperación',
    icono: 'Wallet',
    orden: 3,
  },
  CONTROL: {
    label: 'Control',
    descripcion: 'Bloqueos y condiciones especiales',
    icono: 'ShieldAlert',
    orden: 4,
  },
  ANALISTA: {
    label: 'Mis reportes',
    descripcion: 'Reportes de tu cartera asignada',
    icono: 'UserCog',
    orden: 5,
  },
};

// ── Catálogo de reportes ──────────────────────────────────────────────────

export const REPORTES: ReporteDef[] = [
  // ═══ GERENCIA (orden: Resumen → Presupuesto → Migración) ════════════════
  {
    id: 'resumen-ejecutivo',
    titulo: 'Resumen Ejecutivo de Cartera',
    descripcion:
      'Cartera total, % mora, DSO, tendencia, top deudores y concentración HHI en una página.',
    categoria: 'GERENCIA',
    icono: 'LayoutDashboard',
    roles: ['COORDINADOR', 'GERENCIA'],
    href: '/reportes/resumen-ejecutivo',
    formatos: ['pantalla', 'pdf', 'excel'],
    programable: true,
    disponible: true,
  },
  {
    id: 'presupuesto-cobro',
    titulo: 'Presupuesto de Cobro',
    descripcion:
      'Meta de recaudo del mes por cliente y vendedor, recuperación diaria vs meta, y proyección de caja a 8 semanas.',
    categoria: 'GERENCIA',
    icono: 'Target',
    roles: ['COORDINADOR', 'GERENCIA'],
    href: '/reportes/presupuesto-cobro',
    formatos: ['pantalla', 'pdf', 'excel'],
    programable: true,
    disponible: true,
  },
  {
    id: 'cierre-mensual',
    titulo: 'Resumen de Cierre Mensual',
    descripcion:
      'Una lámina para la reunión general de ventas: alcance de presupuesto por vendedor, top clientes sin pago, con mayor déficit, mayor atraso y con deterioro o mejora en su comportamiento de pago -- todo al cierre del mes elegido.',
    categoria: 'GERENCIA',
    icono: 'CalendarCheck',
    roles: ['COORDINADOR', 'GERENCIA'],
    href: '/reportes/cierre-mensual',
    formatos: ['pantalla', 'pdf', 'excel'],
    programable: false,
    disponible: true,
  },
  {
    id: 'migracion-mora',
    titulo: 'Matriz de Migración de Mora (Roll Rates)',
    descripcion:
      'Cómo migra el saldo entre tramos de un mes al siguiente (roll rates), con tasa de rodamiento crítica y proyección de pérdida esperada.',
    categoria: 'GERENCIA',
    icono: 'TrendingUp',
    roles: ['COORDINADOR', 'GERENCIA'],
    href: '/reportes/migracion-mora',
    formatos: ['pantalla', 'pdf', 'excel'],
    programable: false,
    disponible: true,
  },

  // ═══ VENTAS (orden: Mora Vendedor → Plazo Especial → Comportamiento) ════
  {
    id: 'mora-vendedor',
    titulo: 'Mora por Vendedor y Clientes Bloqueados',
    descripcion:
      'Resumen de mora por tramos o detalle de clientes bloqueados, por vendedor. Envío individual a cada vendedor con copia a su supervisor. Los analistas ven solo sus vendedores asignados.',
    categoria: 'VENTAS',
    icono: 'Users',
    roles: ['COORDINADOR', 'ANALISTA', 'GERENCIA'],
    href: '/reportes/mora-vendedor',
    formatos: ['pantalla', 'pdf', 'excel'],
    programable: true,
    disponible: true,
  },
  {
    id: 'facturas-plazo-especial',
    titulo: 'Facturas con Plazo Especial',
    descripcion:
      'Facturas con condición de pago especial y su estado de vencimiento. Envío al vendedor con copia al supervisor. Los analistas ven solo sus vendedores asignados.',
    categoria: 'VENTAS',
    icono: 'CalendarClock',
    roles: ['COORDINADOR', 'ANALISTA', 'GERENCIA'],
    href: '/reportes/facturas-plazo-especial',
    formatos: ['pantalla', 'pdf', 'excel'],
    programable: true,
    disponible: true,
  },
  {
    id: 'icp-vendedor',
    titulo: 'Comportamiento de Pago por Vendedor',
    descripcion: 'ICP promedio, % pago puntual, días de atraso y clientes críticos por vendedor.',
    categoria: 'VENTAS',
    icono: 'Gauge',
    roles: ['COORDINADOR', 'GERENCIA'],
    href: '/reportes/icp-vendedor',
    formatos: ['pantalla', 'pdf', 'excel'],
    programable: true,
    disponible: true,
  },

  // ═══ COBRANZA (orden: Recuperación → CEI → Aging → Efectividad → Cuentas)
  {
    id: 'recuperacion-periodo',
    titulo: 'Recuperación del Período',
    descripcion:
      'Recaudo entre las fechas que elijas, por analista o vendedor, con serie diaria y top clientes.',
    categoria: 'COBRANZA',
    icono: 'TrendingDown',
    roles: ['COORDINADOR', 'GERENCIA'],
    href: '/reportes/recuperacion-periodo',
    formatos: ['pantalla', 'pdf', 'excel'],
    programable: false,
    disponible: true,
  },
  {
    id: 'pagos-aplicados',
    titulo: 'Pagos Aplicados del Mes',
    descripcion:
      'Resumen de recibos aplicados en el mes, agrupados por recibo, para contrastar contra Softland (duplicados y anulados ya cargados). Exportable a Excel.',
    categoria: 'COBRANZA',
    icono: 'Wallet',
    roles: ['COORDINADOR', 'GERENCIA'],
    href: '/reportes/pagos-aplicados',
    formatos: ['pantalla', 'excel'],
    programable: false,
    disponible: true,
  },
  {
    id: 'cei',
    titulo: 'Índice de Efectividad de Cobro (CEI)',
    descripcion:
      'Efectividad de cobro por supervisor y vendedor: cobrado del mes vs saldo vencido, con CEI %, filtros por supervisor y analista.',
    categoria: 'COBRANZA',
    icono: 'Gauge',
    roles: ['COORDINADOR', 'GERENCIA'],
    href: '/reportes/cei',
    formatos: ['pantalla', 'pdf', 'excel'],
    programable: false,
    disponible: true,
  },
  {
    id: 'aging-consolidado',
    titulo: 'Aging Consolidado',
    descripcion: 'Antigüedad de la cartera por tramos: consolidado, por analista y por vendedor.',
    categoria: 'COBRANZA',
    icono: 'BarChart3',
    roles: ['COORDINADOR', 'GERENCIA'],
    href: '/reportes/aging-consolidado',
    formatos: ['pantalla', 'pdf', 'excel'],
    programable: true,
    disponible: true,
  },
  {
    id: 'efectividad-gestiones',
    titulo: 'Efectividad de Gestiones',
    descripcion:
      'Actividad del equipo por período: gestiones por canal, compromisos de pago, tasa por analista y actividad diaria.',
    categoria: 'COBRANZA',
    icono: 'Activity',
    roles: ['COORDINADOR', 'GERENCIA'],
    href: '/reportes/efectividad-gestiones',
    formatos: ['pantalla', 'excel'],
    programable: false,
    disponible: true,
  },
  {
    id: 'estados-cuenta',
    titulo: 'Estados de Cuenta',
    descripcion:
      'Marcá varios clientes y enviales el estado de cuenta por correo, o descargá un archivo por cada cliente.',
    categoria: 'COBRANZA',
    icono: 'Send',
    roles: ['COORDINADOR', 'ANALISTA', 'GERENCIA'],
    href: '/reportes/estados-cuenta',
    formatos: ['pantalla', 'pdf'],
    programable: false,
    disponible: true,
  },

  // ═══ ANALISTA ═════════════════════════════════════════════════════════════
  {
    id: 'recuperacion-mi-cartera',
    titulo: 'Recuperación de mi cartera',
    descripcion:
      'Cuánto han pagado tus clientes en el período: recaudo diario y top clientes (solo lectura).',
    categoria: 'ANALISTA',
    icono: 'TrendingDown',
    roles: ['ANALISTA'],
    href: '/reportes/mi-recuperacion',
    formatos: ['pantalla', 'pdf', 'excel'],
    programable: false,
    disponible: true,
  },
  {
    id: 'gestiones-periodo',
    titulo: 'Gestiones del Período',
    descripcion: 'Tu actividad de cobro por rango de fechas, con tasa de éxito.',
    categoria: 'ANALISTA',
    icono: 'CalendarRange',
    roles: ['ANALISTA'],
    href: '/reportes/gestiones-periodo',
    formatos: ['pantalla', 'pdf'],
    programable: false,
    disponible: true,
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────

/** Reportes visibles para un rol dado */
export function reportesPorRol(rol: 'COORDINADOR' | 'ANALISTA'): ReporteDef[] {
  return REPORTES.filter((r) => r.roles.includes(rol));
}

/** Reporte por id */
export function reportePorId(id: string): ReporteDef | undefined {
  return REPORTES.find((r) => r.id === id);
}
