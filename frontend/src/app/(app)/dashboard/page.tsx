// force-dynamic: garantiza datos frescos en cada visita (sin caché del router)
export const dynamic = 'force-dynamic';

import { fmtKPI, fmtCRC, fmtFecha, hoyISO } from '@/lib/utils/formato';
import { calcAvaluoRiesgo } from '@/lib/utils/riesgo';
import {
  getBusinessDaysInMonth,
  getElapsedBusinessDays,
  getRemainingBusinessDays,
} from '@/lib/utils/dias-habiles';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';
import {
  TrendingDown,
  TrendingUp,
  Lock,
  Target,
  Sparkles,
  Shield,
  Timer,
  AlertTriangle,
  Percent,
  Calculator,
} from 'lucide-react';
import MiEquipoCard, { type AnalistaEquipo } from '@/components/coordinador/MiEquipoCard';
import DashboardResumen from '@/components/analista/DashboardResumen';
import SaludoDashboard from '@/components/dashboard/saludo-dashboard';
import PorVendedor from '@/components/analista/PorVendedor';
import AgendaCompacta from '@/components/analista/AgendaCompacta';
import MiProgreso from '@/components/analista/MiProgreso';
import NotasRapidas from '@/components/analista/NotasRapidas';
import TareasSugeridasAutomatizacion from '@/components/analista/TareasSugeridasAutomatizacion';
import TendenciaCarteraChart from '@/components/coordinador/TendenciaCarteraChart';
import type { HistoricoCarteraRow } from '@/components/coordinador/TendenciaCarteraChart';
import DSOTendenciaCard from '@/components/coordinador/DSOTendenciaCard';
import type { DSOPunto } from '@/components/coordinador/DSOTendenciaCard';
import { analistasConCarteraReal } from '@/lib/utils/analistas-equipo';
import { getServerHttp } from '@/shared/api/server-http';
import type { ApiError } from '@/shared/api/api-error';
import type { HttpClient } from '@/shared/api/http-client';
import { createDashboardApi } from '@/views/dashboard/api/dashboard-api';
import type {
  DashboardAnalistaResponse,
  DashboardCoordinadorResponse,
  KpisCartera,
} from '@/views/dashboard/types';
import type {
  KpisAnalistaDashboard,
  VendedorResumen,
  AgendaGestion,
} from '@/types/dashboard-analista';
import { DashboardError } from '@/views/dashboard/components/dashboard-error';

// ── Tipos compartidos ─────────────────────────────────────────────────
interface CarteraRow {
  no_vencido: number;
  mora_1_30: number;
  mora_31_60: number;
  mora_61_90: number;
  mora_91_120: number;
  mora_120_plus: number;
  total: number;
  dias_mora: number;
  fecha_corte: string;
}
interface CarteraRowFull extends CarteraRow {
  cliente_cod: string;
  cliente_nombre: string;
}

type Urgencia = 'ROJO' | 'AMARILLO' | 'VERDE';

function pct(a: number, b: number) {
  return b ? Math.round((a / b) * 100) : 0;
}
function pct1(a: number, b: number) {
  return b ? (Math.round((a / b) * 1000) / 10).toFixed(1) : '0.0';
}

// ── Página principal (detecta rol) ────────────────────────────────────
export default async function DashboardPage() {
  const http = await getServerHttp();
  const hoyStr = hoyISO();

  // Perf: auth+perfil+rol ya los resolvió el layout para esta misma request
  // (React.cache(), ver usuario-actual.ts) -- este await no repite el
  // round-trip.
  const { user, perfil, rolEfectivo } = await getUsuarioActual();
  const userEmail = perfil?.email ?? user?.email ?? '';
  const rolUsuario = (rolEfectivo ?? 'ANALISTA') as 'COORDINADOR' | 'ANALISTA' | 'GERENCIA';
  const nombreUsuario = perfil?.nombre ?? user?.user_metadata?.full_name ?? '';

  // Gerencia ve el mismo dashboard ejecutivo que Coordinador (ya es 100% solo lectura).
  if (rolUsuario === 'COORDINADOR' || rolUsuario === 'GERENCIA') {
    return <DashboardCoordinador http={http} nombre={nombreUsuario} />;
  }
  return (
    <DashboardAnalista http={http} hoyStr={hoyStr} userEmail={userEmail} nombre={nombreUsuario} />
  );
}

// ══════════════════════════════════════════════════════════════════════
// DASHBOARD COORDINADOR
// ══════════════════════════════════════════════════════════════════════
async function DashboardCoordinador({ http, nombre }: { http: HttpClient; nombre: string }) {
  // ── Fechas de período (CR = UTC-6) — la meta mensual y los días hábiles
  // se calculan con el mes de Costa Rica ──
  const nowCR = new Date(Date.now() - 6 * 3600000);
  const anioActual = nowCR.getUTCFullYear();
  const mesActual = nowCR.getUTCMonth() + 1;

  // Un solo endpoint agrega las consultas del dashboard (GET /dashboard/coordinador);
  // "Mi Equipo" se cruza con quién tiene cartera REAL asignada hoy
  // (analistasConCarteraReal), para que se actualice solo cuando
  // Configuración → Vendedores reasigna cartera.
  const [dashRes, conCarteraRes] = await Promise.allSettled([
    createDashboardApi(http).coordinador(),
    analistasConCarteraReal(http),
  ]);
  if (dashRes.status === 'rejected') {
    return <DashboardError mensaje={(dashRes.reason as ApiError)?.message} />;
  }
  const d: DashboardCoordinadorResponse = dashRes.value;

  // ── Cartera — agregación server-side (fn_get_kpis_cartera) ────────────
  // La función hace SUM() directamente en PostgreSQL y devuelve un único
  // registro con totales (no sumar filas en JS).
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
  const kpisData: KpisCartera[] = d.kpis_cartera ?? [];
  if (kpisData.length > 0) {
    const k = kpisData[0];
    nv = Number(k.total_no_vencido) || 0;
    m130 = Number(k.total_mora_1_30) || 0;
    m31 = Number(k.total_mora_31_60) || 0;
    m61 = Number(k.total_mora_61_90) || 0;
    m91 = Number(k.total_mora_91_120) || 0;
    m120 = Number(k.total_mora_120_plus) || 0;
    cartera = Number(k.total_cartera) || 0;
    mora = Number(k.total_mora) || 0;
    nClientes = Number(k.n_clientes) || 0;
    nMora = Number(k.n_en_mora) || 0;
    fechaCorte = fmtFecha(k.fecha_corte || '');
  }

  // ── Ventas mensuales (DSO actual + tendencia histórica) ───────────────
  // Fórmula DSO: (Cartera Total / Ventas rolling 3m con IVA) × 90
  let ventas90d = 0;
  let dsoTendencia: DSOPunto[] = [];
  const todosMeses = d.ventas_mensuales ?? [];
  if (todosMeses.length > 0) {
    // DSO actual = últimos 3 meses
    const ultimos3 = todosMeses.slice(-3);
    ventas90d = ultimos3.reduce((s, v) => s + Number(v.total_ventas_sin_iva), 0);

    // Tendencia: rolling 3-month DSO por período (necesita ≥3 meses)
    for (let i = 2; i < todosMeses.length; i++) {
      const v3 =
        Number(todosMeses[i - 2].total_ventas_sin_iva) +
        Number(todosMeses[i - 1].total_ventas_sin_iva) +
        Number(todosMeses[i].total_ventas_sin_iva);
      const ventas90dConIva = v3 * 1.13;
      // Usar cartera real del mes si existe; si no, usar cartera actual (estimado)
      const carteraMes =
        todosMeses[i].cartera_total_mes !== null
          ? Number(todosMeses[i].cartera_total_mes)
          : cartera;
      const esEstimado = todosMeses[i].cartera_total_mes === null;
      if (ventas90dConIva > 0 && carteraMes > 0) {
        dsoTendencia.push({
          anio: todosMeses[i].anio,
          mes: todosMeses[i].mes,
          dso: Math.round((carteraMes / ventas90dConIva) * 90 * 10) / 10,
          ventas90d: ventas90dConIva,
          esEstimado,
        });
      }
    }
    dsoTendencia = dsoTendencia.slice(-6); // últimos 6 períodos
  }
  const dso = ventas90d > 0 ? Math.round((cartera / (ventas90d * 1.13)) * 90 * 10) / 10 : 0;

  const pMora = pct(mora, cartera); // entero — para lógica de color
  const pMora1 = pct1(mora, cartera); // "27.3" — para mostrar en card
  // Monto vencido >30 días (31-60 + 61-90 + 91-120 + 120+) y su % sobre cartera total
  const venc30 = Math.max(0, m31) + Math.max(0, m61) + Math.max(0, m91) + Math.max(0, m120);
  const pVenc30 = pct(venc30, cartera); // entero — para lógica de color
  const pVenc301 = pct1(venc30, cartera); // "9.4"  — para mostrar en card

  // ── Pedidos Retenidos (vista global -- mismo RPC que el módulo dedicado) ──
  let montoRetenido = 0,
    pedidosEnEspera = 0;
  if (d.pedidos_retenidos_kpis) {
    montoRetenido = Number(d.pedidos_retenidos_kpis.monto_total_retenido) || 0;
    pedidosEnEspera = Number(d.pedidos_retenidos_kpis.pedidos_en_espera) || 0;
  }

  // ── Mi Equipo (hoy + semana + mes) ───────────────────────────────────
  // Elegibles por rol (con sus conteos, ya agregados en el backend) ∩ con
  // cartera real asignada hoy (ej. Paula tras pasar a Servicio al Cliente
  // sep 2026 no aparece; Jossmin, que sí gestiona cartera, sí).
  const emailsConCarteraHoy = new Set(
    (conCarteraRes.status === 'fulfilled' ? conCarteraRes.value : []).map((r) => r.email),
  );
  const equipoData: AnalistaEquipo[] = (d.equipo ?? [])
    .filter((a) => emailsConCarteraHoy.has(a.email))
    .map((a) => ({
      id: a.id,
      nombre: a.nombre,
      iniciales: a.iniciales,
      color: a.color,
      gHoy: a.gHoy,
      gSemana: a.gSemana,
      gMes: a.gMes,
    }));

  // ── Meta Mensual — enlazada al Presupuesto de Cobro (misma fuente: fn_recuperacion) ──
  let meta = 0,
    cobradoMes = 0;
  if (d.recuperacion_kpis) {
    meta = Number(d.recuperacion_kpis.meta_total) || 0;
    cobradoMes = Number(d.recuperacion_kpis.cobrado_total) || 0;
  }

  // Fallback de meta si el mes aún no tiene presupuesto congelado
  // (config_sistema.meta_mensual, lo resuelve el backend solo en ese caso).
  if (meta === 0) {
    meta = Number(d.meta_mensual_config || 0);
  }

  // ── Meta Mensual — stats ──────────────────────────────────────────────
  const diaActual = nowCR.getUTCDate();
  const pctMeta = meta > 0 ? Math.min(Math.round((cobradoMes / meta) * 100), 999) : 0;

  // Proyección y ritmo en días hábiles (Lun-Vie) -- fn_recuperacion calcula su
  // propio proyeccion_fin_mes en calendario (a propósito, no se toca el RPC),
  // pero acá se recalcula con el mismo criterio de días hábiles que ya usa
  // la pestaña Recuperación de Presupuesto de Cobro (aplicarDiasHabiles en
  // tab-recuperacion.tsx) para que el número de esta tarjeta coincida con el
  // de esa pantalla y sus correos, en vez de mostrar dos proyecciones distintas.
  const diasHabilesEnMes = getBusinessDaysInMonth(anioActual, mesActual);
  const diasHabilesTranscurridos = getElapsedBusinessDays(anioActual, mesActual, diaActual);
  const diasHabilesRestantes = getRemainingBusinessDays(anioActual, mesActual, diaActual);
  const proyeccion =
    diasHabilesTranscurridos > 0
      ? Math.round(cobradoMes * (diasHabilesEnMes / diasHabilesTranscurridos))
      : cobradoMes;
  const ritmoDiarioHabil = diasHabilesTranscurridos > 0 ? cobradoMes / diasHabilesTranscurridos : 0;
  const ritmoRequeridoHabil =
    diasHabilesRestantes > 0 ? Math.max(0, meta - cobradoMes) / diasHabilesRestantes : 0;
  const enCamino =
    meta > 0 &&
    (diasHabilesRestantes > 0 ? ritmoDiarioHabil >= ritmoRequeridoHabil : cobradoMes >= meta);

  // ── Histórico de mora (para gráfica de tendencia) ────────────────────
  const historico: HistoricoCarteraRow[] = [...(d.historico ?? [])].reverse();

  // ── Avalúo de Riesgo (fórmula corporativa) ────────────────────────────
  const {
    riesgoNoVencido: riesgoNV,
    riesgo1_30: riesgo130,
    riesgo31_60: riesgo31,
    riesgo61_90: riesgo61,
    riesgo91_120: riesgo91,
    riesgo120Plus: riesgo120,
    totalRiesgo,
    avaluoPct,
  } = calcAvaluoRiesgo(
    { noVencido: nv, m1_30: m130, m31_60: m31, m61_90: m61, m91_120: m91, m120_plus: m120 },
    cartera,
  );

  return (
    <div className="min-h-full" style={{ background: '#EEF2F7' }}>
      <div className="px-6 pt-5 pb-6 space-y-5">
        {/* Saludo dinámico */}
        <SaludoDashboard nombre={nombre} />

        {/* KPIs */}
        <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
          {/* 1. Cartera Total */}
          <KPICard
            label="Cartera Total"
            valor={fmtKPI(cartera)}
            sub={`${String(nClientes).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} clientes activos`}
            accentColor="#003B5C"
            badge={null}
            icon={<Shield size={16} />}
          />
          {/* 2. Mora Total */}
          <KPICard
            label="Mora Total"
            valor={fmtKPI(mora)}
            sub={`${String(nMora).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} clientes en mora`}
            accentColor="#ef4444"
            badge={null}
            icon={<TrendingDown size={16} />}
          />
          {/* 3. Venc >30D / Cartera */}
          <KPICard
            label="Venc >30D / Cartera"
            valor={`${pVenc301}%`}
            sub={`${fmtKPI(venc30)} vencido`}
            accentColor={pVenc30 > 10 ? '#ea580c' : '#16a34a'}
            badge={null}
            icon={<AlertTriangle size={16} />}
          />
          {/* 4. % Mora / Cartera */}
          <KPICard
            label="% Mora / Cartera"
            valor={`${pMora1}%`}
            sub="Benchmark <15%"
            accentColor={pMora > 15 ? '#ef4444' : '#16a34a'}
            badge={null}
            icon={<Percent size={16} />}
          />
          {/* 5. DSO */}
          <KPICard
            label="DSO Actual"
            valor={`${dso.toFixed(1)}d`}
            sub="ventas reales últimos 3 meses"
            accentColor={dso > 45 ? '#ef4444' : dso > 35 ? '#f59e0b' : '#16a34a'}
            badge={null}
            icon={<Timer size={16} />}
          />
          {/* 6. Pedidos Retenidos */}
          <KPICard
            label="Pedidos Retenidos"
            valor={fmtKPI(montoRetenido)}
            sub={`${pedidosEnEspera} pedido${pedidosEnEspera !== 1 ? 's' : ''} en espera`}
            accentColor={pedidosEnEspera > 0 ? '#dc2626' : '#16a34a'}
            badge={null}
            icon={<Lock size={16} />}
          />
        </div>

        {/* Aging + Avalúo de Riesgo + Mi Equipo + Meta */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* Columna izquierda: Avalúo de Riesgo + Diagnóstico Ejecutivo */}
          <div className="flex flex-col gap-5">
            <AvaluoRiesgoCard
              nv={nv}
              m130={m130}
              m31={m31}
              m61={m61}
              m91={m91}
              m120={m120}
              cartera={cartera}
              fechaCorte={fechaCorte}
              riesgoNV={riesgoNV}
              riesgo130={riesgo130}
              riesgo31={riesgo31}
              riesgo61={riesgo61}
              riesgo91={riesgo91}
              riesgo120={riesgo120}
              totalRiesgo={totalRiesgo}
              avaluoPct={avaluoPct}
            />
            <DiagnosticoEjecutivoCard
              avaluoPct={avaluoPct}
              totalRiesgo={totalRiesgo}
              riesgo61={riesgo61}
              riesgo91={riesgo91}
              riesgo120={riesgo120}
              m120={m120}
              cartera={cartera}
            />
          </div>

          {/* Columna derecha: Meta Mensual + Mi Equipo */}
          <div className="flex flex-col gap-5">
            {meta > 0 && (
              <MetaMensualCard
                cobrado={cobradoMes}
                meta={meta}
                diaHabilActual={diasHabilesTranscurridos}
                diasHabilesRestantes={diasHabilesRestantes}
                pctMeta={pctMeta}
                proyeccion={proyeccion}
                enCamino={enCamino}
              />
            )}
            <MiEquipoCard analistas={equipoData} />
          </div>
        </div>

        {/* Tendencia de Mora */}
        <TendenciaCarteraChart data={historico} />

        {/* Evolución DSO mes a mes */}
        {dsoTendencia.length > 0 && <DSOTendenciaCard puntos={dsoTendencia} />}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// DASHBOARD ANALISTA
// ══════════════════════════════════════════════════════════════════════
async function DashboardAnalista({
  http,
  hoyStr,
  userEmail,
  nombre,
}: {
  http: HttpClient;
  hoyStr: string;
  userEmail: string;
  nombre: string;
}) {
  // ── Un solo endpoint agrega KPIs, vendedores, cola del día (misma lógica
  // que Mi Cartera, Algoritmo V4 en el backend), agenda, promesas, tareas
  // sugeridas, meta de gestiones y pedidos retenidos propios ──
  let d: DashboardAnalistaResponse;
  try {
    d = await createDashboardApi(http).analista(userEmail);
  } catch (e) {
    return <DashboardError mensaje={(e as ApiError)?.message} />;
  }

  const kpis: KpisAnalistaDashboard = d.kpis ?? {
    total_clientes: 0,
    cartera_total: 0,
    mora_total: 0,
    no_vencido: 0,
    mora_1_30: 0,
    mora_31_60: 0,
    mora_61_90: 0,
    mora_91_120: 0,
    mora_120_plus: 0,
    pct_mora: 0,
    gestiones_hoy: 0,
    promesas_activas: 0,
    promesas_vencen_hoy: 0,
    clientes_urgentes: 0,
    meta_individual: 0,
    cobrado_mes_estimado: 0,
    meta_pct: 0,
  };

  const vendedores: VendedorResumen[] = d.vendedores ?? [];

  // Cola: solo clientes PENDIENTES hoy (el backend ya excluye gestionados y próxima acción futura)
  const colaParaDashboard = d.cola ?? [];

  // ── Enriquecer agenda gestiones: nombres de clientes + labels de acción ──
  const PROXIMA_ACCION_LABELS: Record<string, string> = {
    esperar_pago: 'Esperar confirmación de pago',
    sin_seguimiento: 'Sin seguimiento requerido',
    recontactar: 'Recontactar cliente',
    escalar: 'Escalar al coordinador',
    crear_solicitud: 'Crear solicitud al coordinador',
  };

  const agendaGestiones: AgendaGestion[] = (d.agenda_gestiones ?? []).map((g) => ({
    ...g,
    cliente_nombre: g.cliente_nombre ?? g.cliente_cod,
    accion_label: PROXIMA_ACCION_LABELS[g.proxima_accion] ?? g.proxima_accion,
  }));

  const agendaPromesas = d.agenda_promesas ?? [];
  const promesas = d.promesas ?? [];
  const tareasSugeridas = d.tareas_sugeridas ?? [];

  // Meta de gestiones diarias — fallback a 15 (default histórico) si no hay fila
  // o el valor guardado no es un número válido (> 0)
  const metaGestionesRaw = d.meta_gestiones_diarias;
  const metaGestionesParsed = metaGestionesRaw != null ? parseInt(metaGestionesRaw, 10) : NaN;
  const metaGestionesDiarias =
    Number.isFinite(metaGestionesParsed) && metaGestionesParsed > 0 ? metaGestionesParsed : 15;

  // Pedidos Retenidos (propios) — mismos campos que expone el módulo dedicado
  let montoRetenido = 0,
    pedidosEnEspera = 0;
  if (d.pedidos_retenidos_kpis) {
    montoRetenido = Number(d.pedidos_retenidos_kpis.monto_total_retenido) || 0;
    pedidosEnEspera = Number(d.pedidos_retenidos_kpis.pedidos_en_espera) || 0;
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="px-4 sm:px-6 pt-5 pb-6">
        {/* Header: saludo + strip de métricas */}
        <div className="mb-5">
          <SaludoDashboard nombre={nombre} kpis={kpis} />
        </div>

        {/* Layout 2 columnas */}
        <div className="flex flex-col lg:flex-row gap-5 lg:items-stretch">
          {/* Columna principal */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            <DashboardResumen
              kpis={kpis}
              cola={colaParaDashboard}
              promesas={promesas}
              hoyStr={hoyStr}
              montoRetenido={montoRetenido}
              pedidosEnEspera={pedidosEnEspera}
            />
            <TareasSugeridasAutomatizacion eventos={tareasSugeridas} />
            <PorVendedor vendedores={vendedores} />
          </div>

          {/* Columna derecha ~260px */}
          <div className="w-full lg:w-64 xl:w-72 flex-shrink-0 flex flex-col gap-4">
            <AgendaCompacta gestiones={agendaGestiones} promesas={agendaPromesas} hoyStr={hoyStr} />
            <MiProgreso kpis={kpis} metaGestionesDiarias={metaGestionesDiarias} />
            <NotasRapidas hoyStr={hoyStr} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Error de carga (regla 8: nunca pantalla en blanco) ─────────────────
// ── Diagnóstico Ejecutivo Card ────────────────────────────────────────
function DiagnosticoEjecutivoCard({
  avaluoPct,
  totalRiesgo,
  riesgo61,
  riesgo91,
  riesgo120,
  m120,
  cartera,
}: {
  avaluoPct: number;
  totalRiesgo: number;
  riesgo61: number;
  riesgo91: number;
  riesgo120: number;
  m120: number;
  cartera: number;
}) {
  // Chip 1 — Avalúo vs Benchmark 15%
  const diff = avaluoPct - 15;
  const c1Color = avaluoPct >= 25 ? '#dc2626' : avaluoPct >= 15 ? '#f59e0b' : '#16a34a';
  const c1Badge = avaluoPct >= 25 ? 'CRÍTICO' : avaluoPct >= 15 ? 'SOBRE META' : 'DENTRO DE META';

  // Chip 2 — Concentración mora crítica (>60d) sobre riesgo total
  const riesgoCrit = riesgo61 + riesgo91 + riesgo120;
  const pctCrit = totalRiesgo > 0 ? (riesgoCrit / totalRiesgo) * 100 : 0;
  const c2Color = pctCrit >= 20 ? '#dc2626' : pctCrit >= 10 ? '#f59e0b' : '#16a34a';
  const c2Badge = pctCrit >= 20 ? 'CONCENTRACIÓN ALTA' : pctCrit >= 10 ? 'ATENCIÓN' : 'CONTROLADO';

  // Chip 3 — Efecto multiplicador Más 120 días
  const safeM120 = Math.max(0, m120);
  const pctCartM120 = cartera > 0 ? (safeM120 / cartera) * 100 : 0;
  const pctRsgM120 = totalRiesgo > 0 ? (safeM120 / totalRiesgo) * 100 : 0;
  const mult = pctCartM120 > 0.01 ? pctRsgM120 / pctCartM120 : 0;

  return (
    <div
      style={{
        background: 'white',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        borderTop: '3px solid #003B5C',
        boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
        overflow: 'hidden',
        flex: 1,
      }}
    >
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center gap-3"
        style={{ borderBottom: '1px solid #F1F5F9' }}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(0,59,92,0.08)' }}
        >
          <Target size={15} style={{ color: '#003B5C' }} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-gray-900">Diagnóstico Ejecutivo</h2>
          <p className="text-xs text-gray-400">Señales clave del Avalúo de Riesgo</p>
        </div>
      </div>

      {/* 3 Chips */}
      <div className="p-4 grid grid-cols-3 gap-3">
        {/* Chip 1: Avalúo vs Benchmark 15% */}
        <div
          className="rounded-xl p-3.5 flex flex-col items-center text-center gap-1"
          style={{ background: 'white', border: '1px solid #E2E8F0' }}
        >
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-tight">
            Avalúo vs Bench. 15%
          </p>
          <p
            className="text-xl font-black tabular-nums leading-none mt-1.5"
            style={{ color: c1Color }}
          >
            {avaluoPct.toFixed(2)}%
          </p>
          <p className="text-[11px] font-semibold text-gray-500 mt-0.5">
            {diff >= 0 ? `+${diff.toFixed(2)} pts` : `${diff.toFixed(2)} pts`} vs meta
          </p>
          <span
            className="mt-auto pt-2 text-[9px] font-black uppercase px-1.5 py-0.5 rounded"
            style={{ background: `${c1Color}18`, color: c1Color }}
          >
            {c1Badge}
          </span>
        </div>

        {/* Chip 2: Concentración mora crítica >60d */}
        <div
          className="rounded-xl p-3.5 flex flex-col items-center text-center gap-1"
          style={{ background: 'white', border: '1px solid #E2E8F0' }}
        >
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-tight">
            Mora Crítica &gt;60 días
          </p>
          <p
            className="text-xl font-black tabular-nums leading-none mt-1.5"
            style={{ color: c2Color }}
          >
            {pctCrit.toFixed(1)}%
          </p>
          <p className="text-[11px] font-semibold text-gray-500 mt-0.5">del riesgo total</p>
          <span
            className="mt-auto pt-2 text-[9px] font-black uppercase px-1.5 py-0.5 rounded"
            style={{ background: `${c2Color}18`, color: c2Color }}
          >
            {c2Badge}
          </span>
        </div>

        {/* Chip 3: Efecto multiplicador +120d */}
        <div
          className="rounded-xl p-3.5 flex flex-col items-center text-center gap-1"
          style={{ background: 'white', border: '1px solid #E2E8F0' }}
        >
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-tight">
            Efecto Más 120 días
          </p>
          <p
            className="text-xl font-black tabular-nums leading-none mt-1.5"
            style={{ color: '#7f1d1d' }}
          >
            ×{mult.toFixed(1)}
          </p>
          <p className="text-[11px] font-semibold text-gray-500 mt-0.5">
            {pctCartM120.toFixed(2)}% cart. → {pctRsgM120.toFixed(1)}% rsg.
          </p>
          <span
            className="mt-auto pt-2 text-[9px] font-black uppercase px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(127,29,29,0.12)', color: '#7f1d1d' }}
          >
            MULTIPLICADOR
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Meta Mensual Card ─────────────────────────────────────────────────
function MetaMensualCard({
  cobrado,
  meta,
  diaHabilActual,
  diasHabilesRestantes,
  pctMeta,
  proyeccion,
  enCamino,
}: {
  cobrado: number;
  meta: number;
  diaHabilActual: number;
  diasHabilesRestantes: number;
  pctMeta: number;
  proyeccion: number;
  enCamino: boolean;
}) {
  const barW = Math.min(pctMeta, 100);
  return (
    <div
      style={{
        background: 'white',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        borderTop: '3px solid #003B5C',
        boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid #F1F5F9' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(0,158,227,0.08)' }}
          >
            <Target size={15} style={{ color: '#009ee3' }} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Meta Mensual</h2>
            <p className="text-xs text-gray-400">
              Día hábil {diaHabilActual} · {diasHabilesRestantes} días hábiles restantes
            </p>
          </div>
        </div>
        <span
          className="text-[11px] font-bold px-2.5 py-1 rounded-full"
          style={{
            background: enCamino ? '#f0fdf4' : '#fffbeb',
            color: enCamino ? '#15803d' : '#92400e',
          }}
        >
          {enCamino ? '↑ En camino' : '↓ Revisar ritmo'}
        </span>
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="px-6 py-5">
        {/* Split: Cobrado (izq) · Meta (der) */}
        <div className="grid grid-cols-2 w-full mb-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
              Cobrado real (este mes)
            </p>
            <p
              className="text-3xl font-bold tabular-nums leading-none"
              style={{ color: '#0a0a0a' }}
            >
              {fmtKPI(cobrado)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
              Meta institucional
            </p>
            <p
              className="text-3xl font-bold tabular-nums leading-none"
              style={{ color: '#0a0a0a' }}
            >
              {fmtKPI(meta)}
            </p>
          </div>
        </div>

        {/* Barra de progreso — todo el ancho */}
        <div className="h-2 rounded-full" style={{ background: '#F1F5F9' }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.max(barW, cobrado > 0 ? 2 : 0)}%`,
              background: 'linear-gradient(90deg, #009ee3, #38bdf8)',
            }}
          />
        </div>
        <div className="flex justify-between mt-1.5 mb-5">
          <span className="text-xs text-slate-400">{pctMeta}% completado</span>
          <span className="text-xs text-slate-400">{diasHabilesRestantes}d hábiles restantes</span>
        </div>

        {/* Footer integrado: Avance | Proyección */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <div
            className="rounded-xl px-4 py-3 text-center"
            style={{
              background: enCamino ? '#F0FFF4' : '#FFF8F0',
              border: `1px solid ${enCamino ? '#BBF7D0' : '#FED7AA'}`,
            }}
          >
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <TrendingUp size={13} style={{ color: enCamino ? '#16a34a' : '#ea580c' }} />
              <p
                className="text-[10px] uppercase tracking-wider font-bold"
                style={{ color: enCamino ? '#15803d' : '#c2410c' }}
              >
                Avance
              </p>
            </div>
            <p
              className="text-xl font-bold tabular-nums leading-tight"
              style={{ color: '#0a0a0a' }}
            >
              {pctMeta}%
            </p>
          </div>
          <div
            className="rounded-xl px-4 py-3 text-center"
            style={{
              background: '#F0F9FF',
              border: '1px solid #BAE6FD',
            }}
          >
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Sparkles size={13} style={{ color: '#009ee3' }} />
              <p
                className="text-[10px] uppercase tracking-wider font-bold"
                style={{ color: '#0369a1' }}
              >
                Proyección
              </p>
            </div>
            <p
              className="text-xl font-bold tabular-nums leading-tight"
              style={{ color: '#0a0a0a' }}
            >
              {fmtKPI(proyeccion)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Avalúo de Riesgo Card ─────────────────────────────────────────────
function AvaluoRiesgoCard({
  nv,
  m130,
  m31,
  m61,
  m91,
  m120,
  cartera,
  fechaCorte,
  riesgoNV,
  riesgo130,
  riesgo31,
  riesgo61,
  riesgo91,
  riesgo120,
  totalRiesgo,
  avaluoPct,
}: {
  nv: number;
  m130: number;
  m31: number;
  m61: number;
  m91: number;
  m120: number;
  cartera: number;
  fechaCorte: string;
  riesgoNV: number;
  riesgo130: number;
  riesgo31: number;
  riesgo61: number;
  riesgo91: number;
  riesgo120: number;
  totalRiesgo: number;
  avaluoPct: number;
}) {
  const avaluoColor = avaluoPct >= 25 ? '#dc2626' : avaluoPct >= 15 ? '#f59e0b' : '#16a34a';
  const avaluoBg = avaluoPct >= 25 ? '#fef2f2' : avaluoPct >= 15 ? '#fffbeb' : '#f0fdf4';
  const rows = [
    { label: 'No Vencido', color: '#16a34a', v: nv, pRisk: 15, riesgo: riesgoNV },
    { label: '1-30 días', color: '#d97706', v: m130, pRisk: 20, riesgo: riesgo130 },
    { label: '31-60 días', color: '#ea580c', v: m31, pRisk: 25, riesgo: riesgo31 },
    { label: '61-90 días', color: '#dc2626', v: m61, pRisk: 25, riesgo: riesgo61 },
    { label: '91-120 días', color: '#b91c1c', v: m91, pRisk: 25, riesgo: riesgo91 },
    { label: 'Más 120 días', color: '#7f1d1d', v: m120, pRisk: 100, riesgo: riesgo120 },
  ];
  return (
    <div
      style={{
        background: 'white',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        borderTop: '3px solid #003B5C',
        boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid #F1F5F9' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(0,59,92,0.08)' }}
          >
            <Calculator size={15} style={{ color: '#003B5C' }} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Avalúo de Riesgo</h2>
            <p className="text-xs text-gray-400">Fórmula corporativa · {fechaCorte}</p>
          </div>
        </div>
        <div
          className="rounded-xl px-4 py-2 text-center flex-shrink-0"
          style={{ background: avaluoBg }}
        >
          <p
            className="text-2xl font-black tabular-nums leading-none"
            style={{ color: avaluoColor }}
          >
            {avaluoPct.toFixed(2)}%
          </p>
          <p
            className="text-[9px] font-bold uppercase tracking-wider mt-0.5"
            style={{ color: avaluoColor }}
          >
            Avalúo
          </p>
        </div>
      </div>

      {/* Tabla HTML — alineación automática de columnas por contenido */}
      <div className="px-5 py-4 overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
              <th
                className="text-left pb-2.5 pr-4 font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap"
                style={{ fontSize: '10px' }}
              >
                Tramo
              </th>
              <th
                className="text-right pb-2.5 px-3 font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap"
                style={{ fontSize: '10px' }}
              >
                % del Total
              </th>
              <th
                className="text-right pb-2.5 px-3 font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap"
                style={{ fontSize: '10px' }}
              >
                Monto en ₡
              </th>
              <th
                className="text-right pb-2.5 px-3 font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap"
                style={{ fontSize: '10px' }}
              >
                % de Riesgo
              </th>
              <th
                className="text-right pb-2.5 pl-3 font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap"
                style={{ fontSize: '10px' }}
              >
                Riesgo en ₡
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.label} style={{ background: i % 2 === 1 ? '#f8fafc' : 'transparent' }}>
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ background: r.color }}
                    />
                    <span className="font-semibold text-gray-700 whitespace-nowrap">{r.label}</span>
                  </div>
                </td>
                <td className="py-2 px-3 text-right tabular-nums font-bold text-gray-500 whitespace-nowrap">
                  {(cartera > 0 ? (Math.max(0, r.v) / cartera) * 100 : 0).toFixed(2)}%
                </td>
                <td className="py-2 px-3 text-right tabular-nums font-bold text-gray-800 whitespace-nowrap">
                  {fmtCRC(Math.max(0, r.v))}
                </td>
                <td className="py-2 px-3 text-right tabular-nums font-bold text-gray-500 whitespace-nowrap">
                  {r.pRisk}%
                </td>
                <td className="py-2 pl-3 text-right tabular-nums font-bold text-gray-800 whitespace-nowrap">
                  {fmtCRC(r.riesgo)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #E2E8F0', background: avaluoBg }}>
              <td className="py-3 pr-4">
                <span className="text-[11px] font-black text-gray-700 uppercase tracking-wide">
                  Totales
                </span>
              </td>
              <td className="py-3 px-3 text-right tabular-nums font-black text-gray-700 whitespace-nowrap">
                100.00%
              </td>
              <td className="py-3 px-3 text-right tabular-nums font-black text-gray-900 whitespace-nowrap">
                {fmtCRC(cartera)}
              </td>
              <td className="py-3 px-3 text-right tabular-nums font-black text-gray-700 whitespace-nowrap">
                {avaluoPct.toFixed(2)}%
              </td>
              <td className="py-3 pl-3 text-right tabular-nums font-black text-gray-900 whitespace-nowrap">
                {fmtCRC(totalRiesgo)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── KPI Card (compartida) ─────────────────────────────────────────────
function KPICard({
  label,
  valor,
  sub,
  accentColor,
  badge,
  badgeGood,
  icon,
}: {
  label: string;
  valor: string;
  sub: string;
  accentColor: string;
  badge: string | null;
  badgeGood?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center text-center"
      style={{ borderTop: '3px solid #003B5C' }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
        style={{ background: `${accentColor}1a` }}
      >
        <span style={{ color: accentColor }}>{icon}</span>
      </div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 leading-none">
        {label}
      </p>
      <p
        className="font-black tabular-nums text-slate-900 leading-tight"
        style={{ fontSize: '1.75rem' }}
      >
        {valor}
      </p>
      <p className="text-[11px] text-slate-400 mt-1 leading-snug">{sub}</p>
      {badge && (
        <span
          className="mt-2 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide"
          style={{
            background: badgeGood ? '#f0fdf4' : '#fef2f2',
            color: badgeGood ? '#15803d' : '#dc2626',
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}
