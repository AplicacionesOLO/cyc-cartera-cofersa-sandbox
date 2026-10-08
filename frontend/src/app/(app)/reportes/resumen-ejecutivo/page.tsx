import { redirect } from 'next/navigation';
import { getServerHttp } from '@/shared/api/server-http';
import { createReportesApi } from '@/views/reportes/api/reportes-api';
import type { KpisCartera, ResumenEjecutivoRaw } from '@/views/reportes/types';
import ResumenEjecutivoCliente from './resumen-ejecutivo-cliente';
import type { DSOPunto } from '@/components/coordinador/DSOTendenciaCard';
import type { HistoricoCarteraRow } from '@/components/coordinador/TendenciaCarteraChart';
import type { ConcentracionResult } from '@/types/analisis-pagos';
import type { RecupMomMes } from '@/types/reportes';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';

export const dynamic = 'force-dynamic';

export interface ResumenEjecutivoData {
  cartera: number;
  mora: number;
  noVencido: number;
  m130: number;
  m3160: number;
  m6190: number;
  m91120: number;
  m120: number;
  nClientes: number;
  nMora: number;
  venc30: number;
  pctMora: number;
  pctVenc30: number;
  dso: number;
  dsoTendencia: DSOPunto[];
  fechaCorte: string;
  concentracion: ConcentracionResult | null;
  recaudoMeses: RecupMomMes[];
  historicoCartera: HistoricoCarteraRow[];
}

export default async function ResumenEjecutivoPage() {
  const { user, perfil, rolEfectivo } = await getUsuarioActual();
  if (!user) redirect('/login');

  const rol = rolEfectivo ?? 'ANALISTA';
  // Gerencia también ve este reporte (categoría GERENCIA del Hub, registry.ts).
  if (rol !== 'COORDINADOR' && rol !== 'GERENCIA') redirect('/reportes');
  const nombre = perfil?.nombre ?? user.email ?? '';

  // Un solo endpoint agregado (GET /reportes/resumen-ejecutivo): KPIs de cartera, ventas
  // mensuales, concentración, recaudo de 13 meses e histórico diario de mora.
  let raw: ResumenEjecutivoRaw;
  try {
    raw = await createReportesApi(await getServerHttp()).resumenEjecutivo();
  } catch {
    return (
      <div className="px-5 py-5">
        <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
          <p className="text-red-600 text-sm font-semibold">
            Error al cargar el resumen ejecutivo. Intentá de nuevo.
          </p>
        </div>
      </div>
    );
  }

  // ── KPIs de cartera (SUM server-side) ──────────────────────────────────
  let nv = 0,
    m130 = 0,
    m31 = 0,
    m61 = 0,
    m91 = 0,
    m120 = 0;
  let cartera = 0,
    mora = 0,
    nClientes = 0,
    nMora = 0,
    fechaCorte = '';
  const kpisData = (raw.kpis ?? null) as KpisCartera[] | null;
  if (kpisData && kpisData.length > 0) {
    const k = kpisData[0];
    nv = +k.total_no_vencido || 0;
    m130 = +k.total_mora_1_30 || 0;
    m31 = +k.total_mora_31_60 || 0;
    m61 = +k.total_mora_61_90 || 0;
    m91 = +k.total_mora_91_120 || 0;
    m120 = +k.total_mora_120_plus || 0;
    cartera = +k.total_cartera || 0;
    mora = +k.total_mora || 0;
    nClientes = +k.n_clientes || 0;
    nMora = +k.n_en_mora || 0;
    fechaCorte = k.fecha_corte || '';
  }

  // ── DSO (ventas_mensuales rolling 3m con IVA) ──────────────────────────
  let ventas90d = 0;
  let dsoTendencia: DSOPunto[] = [];
  const meses = (raw.ventas ?? []) as {
    anio: number;
    mes: number;
    total_ventas_sin_iva: number;
    cartera_total_mes: number | null;
  }[];
  if (meses.length > 0) {
    ventas90d = meses.slice(-3).reduce((s, v) => s + Number(v.total_ventas_sin_iva), 0);
    for (let i = 2; i < meses.length; i++) {
      const v3 =
        Number(meses[i - 2].total_ventas_sin_iva) +
        Number(meses[i - 1].total_ventas_sin_iva) +
        Number(meses[i].total_ventas_sin_iva);
      const v90iva = v3 * 1.13;
      const carteraMes =
        meses[i].cartera_total_mes !== null ? Number(meses[i].cartera_total_mes) : cartera;
      const esEstimado = meses[i].cartera_total_mes === null;
      if (v90iva > 0 && carteraMes > 0) {
        dsoTendencia.push({
          anio: meses[i].anio,
          mes: meses[i].mes,
          dso: Math.round((carteraMes / v90iva) * 90 * 10) / 10,
          ventas90d: v90iva,
          esEstimado,
        });
      }
    }
    dsoTendencia = dsoTendencia.slice(-6);
  }
  const dso = ventas90d > 0 ? Math.round((cartera / (ventas90d * 1.13)) * 90 * 10) / 10 : 0;

  // ── Concentración (top 10 + HHI) ───────────────────────────────────────
  const concentracion = (raw.concentracion as ConcentracionResult) ?? null;

  // ── Recaudo mensual: últimos 13 meses ──────────────────────────────────
  const momData = raw.recaudo_meses;
  const recaudoMeses: RecupMomMes[] = Array.isArray(momData) ? (momData as RecupMomMes[]) : [];

  // ── Histórico diario de mora (misma fuente que el dashboard) ─────────────
  const historicoCartera = (raw.historico ?? []) as HistoricoCarteraRow[];

  const venc30 = Math.max(0, m31) + Math.max(0, m61) + Math.max(0, m91) + Math.max(0, m120);
  const pctMora = cartera > 0 ? Math.round((mora / cartera) * 1000) / 10 : 0;
  const pctVenc30 = cartera > 0 ? Math.round((venc30 / cartera) * 1000) / 10 : 0;

  const data: ResumenEjecutivoData = {
    cartera,
    mora,
    noVencido: nv,
    m130,
    m3160: m31,
    m6190: m61,
    m91120: m91,
    m120,
    nClientes,
    nMora,
    venc30,
    pctMora,
    pctVenc30,
    dso,
    dsoTendencia,
    fechaCorte,
    concentracion,
    recaudoMeses,
    historicoCartera,
  };

  return <ResumenEjecutivoCliente data={data} generadoPor={nombre} />;
}
