import { redirect } from 'next/navigation';
import { getServerHttp } from '@/shared/api/server-http';
import { createReportesApi } from '@/views/reportes/api/reportes-api';
import CierreMensualCliente from './cierre-mensual-cliente';
import { calcAvaluoRiesgo, badgeAvaluo } from '@/lib/utils/riesgo';
import type {
  CierreMensualData,
  CierreVendedorRow,
  CierreClienteMonto,
  CierreClienteDeficit,
  CierreTopMora,
  CierreTopMejora,
  CierreDeterioroICP,
} from '@/types/reportes';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';
import type {
  CierreMensualRaw,
  IcpRow,
  McRow,
  MoraRow,
  PortafolioGrupoRow,
  PortafolioMiembroRow,
  RecuperacionJson,
  RiesgoVendedorRow,
  VendedorRow,
} from '@/views/reportes/types';

export const dynamic = 'force-dynamic';

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

// Rutas administrativas de cobro (no venta real) -- sus clientes "asignados" son
// casos de cobro administrativo, no cartera de un vendedor. Por código, no por
// nombre (más robusto). Confirmado con el coordinador ago 2026 -- las otras 3
// rutas con tipo_canal='Ruta Administrativa' (Esteban Araya, Joshua Wright,
// Viviana Arce) SÍ tienen cartera real y se quedan en el reporte.
const VENDEDOR_COD_EXCLUIR = new Set(['07', 'T15']);

interface PageProps {
  searchParams: Promise<{ anio?: string; mes?: string }>;
}

/** anio/mes desplazado `delta` meses (negativo = hacia atrás), sin líos de rollover de Date. */
function shiftMes(anio: number, mes: number, delta: number): { anio: number; mes: number } {
  const idx = anio * 12 + (mes - 1) + delta;
  return { anio: Math.floor(idx / 12), mes: (idx % 12) + 1 };
}
export default async function CierreMensualPage({ searchParams }: PageProps) {
  const { user, perfil, rolEfectivo } = await getUsuarioActual();
  if (!user) redirect('/login');

  const rol = rolEfectivo ?? 'ANALISTA';
  if (rol !== 'COORDINADOR' && rol !== 'GERENCIA') redirect('/reportes');
  const generadoPor = perfil?.nombre ?? user.email ?? '';

  // ── Mes por defecto: el mes recién cerrado (hora CR, UTC-6 sin DST) ────
  const hoyCR = new Date(Date.now() - 6 * 3600_000);
  const cerradoDefault = shiftMes(hoyCR.getUTCFullYear(), hoyCR.getUTCMonth() + 1, -1);

  const sp = await searchParams;
  const anio = Number(sp.anio) || cerradoDefault.anio;
  const mes = Number(sp.mes) || cerradoDefault.mes;
  // Un solo endpoint agregado (GET /reportes/cierre-mensual): meses con snapshot, vendedores,
  // Portafolio Acotado, maestro de clientes, fn_recuperacion, riesgo por vendedor, mora actual vs
  // mes anterior e ICP (3 meses recientes vs 3 previos; las ventanas las calcula el backend).
  let raw: CierreMensualRaw;
  try {
    raw = await createReportesApi(await getServerHttp()).cierreMensual(anio, mes);
  } catch {
    return (
      <div className="px-5 py-5">
        <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
          <p className="text-red-600 text-sm font-semibold">
            Error al cargar el cierre mensual. Intentá de nuevo.
          </p>
        </div>
      </div>
    );
  }
  const {
    meses: mesesData,
    vendedores: vendedoresData,
    grupos: gruposData,
    miembros: miembrosData,
    maestro: mcRows,
    recuperacion: recData,
    riesgo: riesgoData,
    mora: moraData,
    icp: icpData,
  } = raw;

  // ── Meses con snapshot de cierre disponible (para el selector) ────────
  const mesesRaw = (mesesData ?? []) as { anio: number; mes: number }[];
  const mesesDisponibles = mesesRaw.map((m) => ({ ...m, label: `${MESES[m.mes - 1]} ${m.anio}` }));
  const disponible = mesesRaw.some((m) => m.anio === anio && m.mes === mes);

  // ── Vendedores (zona) + Portafolio Acotado (rutas que absorben a otro vendedor) ──
  const vendedoresRows = (vendedoresData ?? []) as VendedorRow[];
  const zonaDe = new Map(vendedoresRows.map((v) => [v.cod, v.zona ?? '—']));
  const nombreVendedorDe = new Map(vendedoresRows.map((v) => [v.cod, v.nombre]));

  const principalesAcotados = new Set(
    ((gruposData ?? []) as PortafolioGrupoRow[]).map((g) => g.principal_cod),
  );
  const miembrosPorPrincipal = new Map<string, string[]>();
  for (const m of (miembrosData ?? []) as PortafolioMiembroRow[]) {
    const lista = miembrosPorPrincipal.get(m.principal_cod) ?? [];
    lista.push(nombreVendedorDe.get(m.vendedor_cod) ?? m.vendedor_cod);
    miembrosPorPrincipal.set(m.principal_cod, lista);
  }

  // ── Maestro de clientes (nombre + vendedor por cliente_cod) ────────────
  const mcMap = new Map<
    string,
    { cliente_nombre: string; vendedor_nombre: string; vendedor_cod: string | null }
  >();
  for (const r of (mcRows ?? []) as McRow[]) {
    if (!mcMap.has(r.cliente_cod))
      mcMap.set(r.cliente_cod, {
        cliente_nombre: r.cliente_nombre,
        vendedor_nombre: r.vendedor_nombre ?? '—',
        vendedor_cod: r.vendedor_cod,
      });
  }
  const nombreDe = (cod: string) => mcMap.get(cod)?.cliente_nombre ?? cod;
  const vendedorDe = (cod: string) => mcMap.get(cod)?.vendedor_nombre ?? '—';
  const esAdminCliente = (cod: string) => {
    const vcod = mcMap.get(cod)?.vendedor_cod;
    return !!vcod && VENDEDOR_COD_EXCLUIR.has(vcod);
  };

  // ── A. Alcance de presupuesto por vendedor (fn_recuperacion) + Avalúo de Riesgo ──
  const rec = (recData ?? null) as RecuperacionJson | null;
  const riesgoMap = new Map<string, RiesgoVendedorRow>(
    ((riesgoData ?? []) as RiesgoVendedorRow[]).map((r) => [r.vendedor_cod, r]),
  );

  const vendedores: CierreVendedorRow[] = (rec?.vendedores ?? [])
    .filter((v) => !VENDEDOR_COD_EXCLUIR.has(v.vendedor_cod))
    .filter((v) => Number(v.meta) > 0 || Number(v.cobrado) > 0) // sin cartera este mes -- no aporta a la reunión
    .map((v) => {
      const t = riesgoMap.get(v.vendedor_cod);
      const cartera = t
        ? Number(t.no_vencido) +
          Number(t.mora_1_30) +
          Number(t.mora_31_60) +
          Number(t.mora_61_90) +
          Number(t.mora_91_120) +
          Number(t.mora_120_plus)
        : 0;
      const avaluo = t
        ? calcAvaluoRiesgo(
            {
              noVencido: Number(t.no_vencido),
              m1_30: Number(t.mora_1_30),
              m31_60: Number(t.mora_31_60),
              m61_90: Number(t.mora_61_90),
              m91_120: Number(t.mora_91_120),
              m120_plus: Number(t.mora_120_plus),
            },
            cartera,
          )
        : null;
      return {
        vendedor_cod: v.vendedor_cod,
        vendedor_nombre: v.vendedor_nombre,
        zona: zonaDe.get(v.vendedor_cod) ?? '—',
        meta: v.meta,
        cobrado: v.cobrado,
        pct: v.pct,
        avaluoPct: avaluo ? Math.round(avaluo.avaluoPct * 10) / 10 : 0,
        avaluoBadge: avaluo ? badgeAvaluo(avaluo.avaluoPct) : '—',
        portafolioAcotado: principalesAcotados.has(v.vendedor_cod),
        miembrosAcotado: miembrosPorPrincipal.get(v.vendedor_cod) ?? [],
      };
    })
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1)); // mejor alcance primero

  // Aplanado cliente↔vendedor -- misma fuente, filtrado distinto para B/C. Excluye
  // las mismas 2 rutas administrativas (sus clientes no son cartera de un vendedor real).
  const todosClientes: CierreClienteMonto[] = [];
  for (const v of rec?.vendedores ?? []) {
    if (VENDEDOR_COD_EXCLUIR.has(v.vendedor_cod)) continue;
    for (const c of v.clientes ?? []) {
      todosClientes.push({
        cliente_cod: c.cliente_cod,
        cliente_nombre: c.cliente_nombre,
        vendedor_nombre: v.vendedor_nombre,
        meta: c.meta,
        cobrado: c.cobrado,
      });
    }
  }

  const sinPagoTodos = todosClientes.filter((c) => c.meta > 0 && c.cobrado === 0);
  const sinPago: CierreClienteMonto[] = sinPagoTodos.sort((a, b) => b.meta - a.meta).slice(0, 10);

  const deficitTodos = todosClientes
    .filter((c) => c.meta > 0 && c.cobrado > 0 && c.cobrado < c.meta)
    .map((c) => ({
      ...c,
      deficit: c.meta - c.cobrado,
      pct: Math.round((c.cobrado / c.meta) * 1000) / 10,
    }));
  const deficit: CierreClienteDeficit[] = deficitTodos
    .sort((a, b) => b.deficit - a.deficit)
    .slice(0, 10);

  // ── B/C. Top Mayor Atraso (con aging completo) y Top Mejoras ───────────────────
  const moraRows = ((moraData ?? []) as MoraRow[]).filter((r) => !esAdminCliente(r.cliente_cod));

  const topMora: CierreTopMora[] = moraRows
    .filter((r) => Number(r.mora_actual) > 0)
    .sort((a, b) => Number(b.mora_actual) - Number(a.mora_actual))
    .slice(0, 10)
    .map((r) => ({
      cliente_cod: r.cliente_cod,
      cliente_nombre: nombreDe(r.cliente_cod),
      vendedor_nombre: vendedorDe(r.cliente_cod),
      no_vencido: Number(r.no_vencido),
      mora_1_30: Number(r.mora_1_30),
      mora_31_60: Number(r.mora_31_60),
      mora_61_90: Number(r.mora_61_90),
      mora_91_120: Number(r.mora_91_120),
      mora_120_plus: Number(r.mora_120_plus),
      mora_total: Number(r.mora_actual),
      total_general: Number(r.total_actual),
      pct_cta_vencida:
        Number(r.total_actual) > 0
          ? Math.round((Number(r.mora_actual) / Number(r.total_actual)) * 1000) / 10
          : 0,
    }));

  const mejoras: CierreTopMejora[] = moraRows
    .filter(
      (r) => Number(r.mora_anterior) > 0 && Number(r.mora_anterior) - Number(r.mora_actual) > 0,
    )
    .sort(
      (a, b) =>
        Number(b.mora_anterior) -
        Number(b.mora_actual) -
        (Number(a.mora_anterior) - Number(a.mora_actual)),
    )
    .slice(0, 10)
    .map((r) => ({
      cliente_cod: r.cliente_cod,
      cliente_nombre: nombreDe(r.cliente_cod),
      vendedor_nombre: vendedorDe(r.cliente_cod),
      mora_anterior: Number(r.mora_anterior),
      mora_actual: Number(r.mora_actual),
      reduccion: Number(r.mora_anterior) - Number(r.mora_actual),
    }));

  // ── D. Deterioro de Comportamiento de Pago (ICP): 3 meses recientes vs 3 previos ──
  const icpRows = ((icpData ?? []) as IcpRow[]).filter((r) => !esAdminCliente(r.cliente_cod));

  const deterioro: CierreDeterioroICP[] = icpRows
    .filter((r) => Number(r.atraso_reciente) - Number(r.atraso_previo) > 0)
    .sort(
      (a, b) =>
        Number(b.atraso_reciente) -
        Number(b.atraso_previo) -
        (Number(a.atraso_reciente) - Number(a.atraso_previo)),
    )
    .slice(0, 10)
    .map((r) => ({
      cliente_cod: r.cliente_cod,
      cliente_nombre: nombreDe(r.cliente_cod),
      vendedor_nombre: vendedorDe(r.cliente_cod),
      atraso_previo: Number(r.atraso_previo),
      atraso_reciente: Number(r.atraso_reciente),
      delta: Math.round((Number(r.atraso_reciente) - Number(r.atraso_previo)) * 10) / 10,
    }));

  const data: CierreMensualData = {
    anio,
    mes,
    mesLabel: `${MESES[mes - 1]} ${anio}`,
    disponible,
    mesesDisponibles,
    kpis: {
      meta_total: rec?.kpis?.meta_total ?? 0,
      cobrado_total: rec?.kpis?.cobrado_total ?? 0,
      pct: rec?.kpis?.pct ?? 0,
      n_vendedores: vendedores.length,
      n_sin_pago: sinPagoTodos.length,
      n_deficit: deficitTodos.length,
    },
    vendedores,
    topMora,
    sinPago,
    deficit,
    mejoras,
    deterioro,
  };

  return <CierreMensualCliente data={data} generadoPor={generadoPor} />;
}
