'use client';

/**
 * Módulo /gestiones — Registro de cobros del equipo
 * Header + 5 KPIs + barra de filtros (1 fila) + tabla compacta
 * (con columna Cliente) + paginación client-side 25/pág.
 *
 * Reutiliza TablaGestionesCompacta + KpiCard del base compartido.
 */

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Coins, FileText, Clock } from 'lucide-react';
import type { Gestion } from '@/types/database';
import type { SolicitudGestionRef } from '@/views/gestiones/types';
import TablaGestionesCompacta, { KpiCard } from './tabla-gestiones-base';

const PERIODOS = [
  { label: 'Hoy', value: 'hoy', sub: 'registradas hoy' },
  { label: 'Semana', value: 'semana', sub: 'esta semana' },
  { label: 'Mes', value: 'mes', sub: 'este mes' },
  { label: 'Todo', value: 'todo', sub: 'historial completo' },
];
const CERRADOS = ['Resuelta', 'Cerrada', 'Rechazada', 'APROBADA', 'RECHAZADA'];

// ── Listas estáticas de filtros — idénticas al form-nueva-gestion ──────
const TIPOS_FILTRO: { value: string; label: string }[] = [
  { value: 'Todos', label: 'Todos los tipos' },
  { value: 'LLAMADA', label: 'Llamada' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'CORREO', label: 'Correo' },
  { value: 'INTERNA', label: 'Gestión Interna' },
  { value: 'VISITA', label: 'Visita' },
];

const RESULTADOS_FILTRO: string[] = [
  'Todos los resultados',
  // Contacto exitoso
  'Compromiso de pago confirmado',
  'Cliente indica pago realizado',
  'Solicitud de convenio',
  // Reclamos
  'Reclamo comercial',
  'Reclamo logístico',
  'Requiere revisión interna',
  // Llamada / WhatsApp sin éxito
  'No contestó',
  'Número ocupado',
  'Llamar después',
  'Contacto inválido',
  // WhatsApp
  'Mensaje enviado',
  'Visto sin respuesta',
  'Sin respuesta',
  // Correo
  'Correo enviado',
  'Pendiente respuesta',
  'Correo inválido',
  // Interna
  'Validación comercial',
  'Validación logística',
  'Validación crédito',
  'Escalado coordinación',
  'Seguimiento interno',
  // Visita
  'Cliente visitado',
  'No localizado',
];
const POR_PAGINA = 25;

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
  gestiones: Gestion[];
  solicitudes: SolicitudGestionRef[];
  promesaEstadoMap: Record<string, string>;
  nombreClienteMap: Record<string, string>;
  codsConCartera?: Set<string>;
  rol: 'COORDINADOR' | 'ANALISTA' | 'GERENCIA';
  userEmail: string;
  userName: string;
  analistas: { email: string; nombre: string }[];
}

export default function TablaGestiones({
  gestiones,
  solicitudes,
  promesaEstadoMap,
  nombreClienteMap,
  codsConCartera,
  rol,
  analistas,
}: Props) {
  const router = useRouter();
  const hoy = hoyISO();

  const [periodo, setPeriodo] = useState('mes');
  const [busqueda, setBusqueda] = useState('');
  const [fTipo, setFTipo] = useState('Todos');
  const [fResult, setFResult] = useState('Todos');
  const [fAnalista, setFAnalista] = useState('Todos');
  const [tag, setTag] = useState<'' | 'promesa' | 'solicitud' | 'pendientes'>('');
  const [pagina, setPagina] = useState(1);

  const base = useMemo(() => gestiones.filter((g) => g.activo !== false), [gestiones]);

  // Set de gestion_id que generaron solicitud + abiertas
  const solSet = useMemo(() => {
    const s = new Set<string>();
    for (const x of solicitudes) if (x.gestion_id) s.add(x.gestion_id);
    return s;
  }, [solicitudes]);
  const solAbiertas = useMemo(
    () => solicitudes.filter((x) => x.gestion_id && !CERRADOS.includes(x.estado)).length,
    [solicitudes],
  );

  function diasDesde(fecha: string) {
    return Math.floor((new Date(hoy).getTime() - new Date(fecha).getTime()) / 86400000);
  }
  function enPeriodo(fecha: string) {
    if (periodo === 'todo') return true;
    const d = diasDesde(fecha);
    if (periodo === 'hoy') return d === 0;
    if (periodo === 'semana') return d >= 0 && d <= 6;
    if (periodo === 'mes') return d >= 0 && d <= 30;
    return true;
  }
  function esPendiente(g: Gestion) {
    return !!g.proxima_accion && g.proxima_accion !== 'sin_seguimiento';
  }

  // ── Filtrado ──────────────────────────────────────────────────────
  const filtradas = useMemo(() => {
    return base
      .filter((g) => {
        if (!enPeriodo(g.fecha)) return false;
        // Normalizar tipo legacy (ej. "WhatsApp" → "WHATSAPP") antes de comparar
        if (fTipo !== 'Todos' && (g.tipo ?? '').toUpperCase() !== fTipo) return false;
        if (fResult !== 'Todos' && g.resultado !== fResult) return false;
        if (fAnalista !== 'Todos' && g.analista_email !== fAnalista) return false;
        if (tag === 'promesa' && !g.promesa_id) return false;
        if (tag === 'solicitud' && !solSet.has(g.id)) return false;
        if (tag === 'pendientes' && !esPendiente(g)) return false;
        if (busqueda) {
          const q = busqueda.toLowerCase();
          if (
            !(g.nota ?? '').toLowerCase().includes(q) &&
            !(g.resultado ?? '').toLowerCase().includes(q) &&
            !(nombreClienteMap[g.cliente_cod] ?? '').toLowerCase().includes(q) &&
            !(g.cliente_cod ?? '').toLowerCase().includes(q)
          )
            return false;
        }
        return true;
      })
      .sort((a, b) =>
        `${b.fecha}T${b.hora ?? '00:00'}`.localeCompare(`${a.fecha}T${a.hora ?? '00:00'}`),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, periodo, fTipo, fResult, fAnalista, tag, busqueda, hoy, solSet, nombreClienteMap]);

  // Reset de página cuando cambian filtros
  useEffect(() => {
    setPagina(1);
  }, [periodo, fTipo, fResult, fAnalista, tag, busqueda]);

  // ── KPIs (sobre el set filtrado por período) ──────────────────────
  const porPeriodo = useMemo(
    () => base.filter((g) => enPeriodo(g.fecha)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, periodo, hoy],
  );
  const conPromesa = porPeriodo.filter((g) => g.promesa_id);
  const promActivas = conPromesa.filter((g) => {
    const e = promesaEstadoMap[g.promesa_id!];
    return e === 'PENDIENTE' || e === 'ABONO_PARCIAL';
  }).length;
  const conSolicitud = porPeriodo.filter((g) => solSet.has(g.id)).length;
  const sinSeg = porPeriodo.filter(
    (g) => !g.proxima_accion || g.proxima_accion === 'sin_seguimiento',
  ).length;
  const deHoy = base.filter((g) => g.fecha === hoy).length;
  const subPeriodo = PERIODOS.find((p) => p.value === periodo)?.sub ?? '';

  // ── Paginación ────────────────────────────────────────────────────
  const totalPag = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const pagActual = Math.min(pagina, totalPag);
  const desde = (pagActual - 1) * POR_PAGINA;
  const pageItems = filtradas.slice(desde, desde + POR_PAGINA);
  const paginas = Array.from({ length: totalPag }, (_, i) => i + 1).filter(
    (p) => Math.abs(p - pagActual) <= 2 || p === 1 || p === totalPag,
  );

  // Filtros de tipo y resultado: listas estáticas (idénticas al form activo)
  // — evita que valores legacy de BD aparezcan en el dropdown.

  const selCls = 'text-[12px] text-gray-700 bg-white focus:outline-none';
  const selSty = { border: '0.5px solid #e2e8f0', borderRadius: 7, padding: '5px 8px' };
  const sep = <span style={{ width: 1, height: 22, backgroundColor: '#e2e8f0', flexShrink: 0 }} />;

  function Tag({
    id,
    label,
    bg,
    color,
    border,
    icon,
  }: {
    id: 'promesa' | 'solicitud' | 'pendientes';
    label: string;
    bg: string;
    color: string;
    border: string;
    icon: React.ReactNode;
  }) {
    const on = tag === id;
    return (
      <button
        onClick={() => setTag(on ? '' : id)}
        className="inline-flex items-center gap-1 transition flex-shrink-0"
        style={{
          padding: '4px 8px',
          borderRadius: 20,
          fontSize: 10,
          fontWeight: 700,
          border: `0.5px solid ${border}`,
          backgroundColor: on ? color : bg,
          color: on ? '#fff' : color,
        }}
      >
        {icon} {label}
      </button>
    );
  }

  return (
    <div className="p-5 space-y-3">
      {/* KPIs (5) — el título lo muestra el topbar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Total gestiones" valor={porPeriodo.length} sub={subPeriodo} />
        <KpiCard
          label="Con promesa"
          valor={conPromesa.length}
          sub={`${promActivas} activas`}
          valorColor="#854f0b"
        />
        <KpiCard
          label="Con solicitud"
          valor={conSolicitud}
          sub={`${solAbiertas} abiertas`}
          valorColor="#534ab7"
        />
        <KpiCard
          label="Sin seguimiento"
          valor={sinSeg}
          sub="requieren acción"
          valorColor="#e24b4a"
        />
        <KpiCard label="Hoy" valor={deHoy} sub="registradas hoy" valorColor="#0f6e56" />
      </div>

      {/* Barra de filtros — 1 fila */}
      <div
        className="flex items-center gap-2 flex-wrap"
        style={{
          backgroundColor: '#fff',
          border: '0.5px solid #e2e8f0',
          borderRadius: 10,
          padding: '8px 12px',
        }}
      >
        {/* Pills período */}
        <div
          className="flex rounded-lg overflow-hidden flex-shrink-0"
          style={{ border: '0.5px solid #e2e8f0' }}
        >
          {PERIODOS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriodo(p.value)}
              className="text-[12px] font-semibold transition"
              style={
                periodo === p.value
                  ? { backgroundColor: '#009ee3', color: '#fff', padding: '5px 12px' }
                  : { backgroundColor: '#fff', color: '#64748b', padding: '5px 12px' }
              }
            >
              {p.label}
            </button>
          ))}
        </div>

        {sep}

        {/* Búsqueda */}
        <div className="relative flex-1 min-w-0">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente, nota o resultado…"
            className="w-full text-[12px] text-gray-700 focus:outline-none"
            style={{ border: '0.5px solid #e2e8f0', borderRadius: 7, padding: '5px 10px 5px 28px' }}
          />
        </div>

        <select
          value={fTipo}
          onChange={(e) => setFTipo(e.target.value)}
          className={selCls}
          style={selSty}
        >
          {TIPOS_FILTRO.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          value={fResult}
          onChange={(e) => setFResult(e.target.value)}
          className={selCls}
          style={selSty}
        >
          {RESULTADOS_FILTRO.map((r) => (
            <option key={r} value={r === 'Todos los resultados' ? 'Todos' : r}>
              {r}
            </option>
          ))}
        </select>
        {(rol === 'COORDINADOR' || rol === 'GERENCIA') && (
          <select
            value={fAnalista}
            onChange={(e) => setFAnalista(e.target.value)}
            className={selCls}
            style={selSty}
          >
            <option value="Todos">Todos los analistas</option>
            {analistas.map((a) => (
              <option key={a.email} value={a.email}>
                {a.nombre}
              </option>
            ))}
          </select>
        )}

        {sep}

        {/* Tags rápidos */}
        <Tag
          id="promesa"
          label="Promesa"
          bg="#faeeda"
          color="#854f0b"
          border="#ef9f27"
          icon={<Coins size={11} />}
        />
        <Tag
          id="solicitud"
          label="Solicitud"
          bg="#eeedfe"
          color="#534ab7"
          border="#afa9ec"
          icon={<FileText size={11} />}
        />
        <Tag
          id="pendientes"
          label="Pendientes"
          bg="#e1f5ee"
          color="#0f6e56"
          border="#5dcaa5"
          icon={<Clock size={11} />}
        />

        {sep}

        <span className="text-[11px] text-gray-400 flex-shrink-0">
          {filtradas.length} gestion{filtradas.length !== 1 ? 'es' : ''}
        </span>
      </div>

      {/* Tabla compacta */}
      <TablaGestionesCompacta
        gestiones={pageItems}
        solicitudesPorGestion={solSet}
        nombreClienteMap={nombreClienteMap}
        codsConCartera={codsConCartera}
        mostrarCliente
        onVerCliente={(g) => router.push(`/clientes/${encodeURIComponent(g.cliente_cod)}`)}
      />

      {/* Paginación */}
      {filtradas.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-2 px-1">
          <span className="text-[12px] text-gray-400">
            Mostrando {desde + 1}–{Math.min(desde + POR_PAGINA, filtradas.length)} de{' '}
            {filtradas.length} gestiones
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={pagActual === 1}
              className="px-2 py-1 text-[12px] rounded-lg disabled:opacity-40"
              style={{ border: '0.5px solid #e2e8f0', color: '#64748b' }}
            >
              ‹
            </button>
            {paginas.map((p, i) => {
              const prev = paginas[i - 1];
              const gap = prev && p - prev > 1;
              return (
                <span key={p} className="flex items-center gap-1">
                  {gap && <span className="text-[12px] text-gray-300">…</span>}
                  <button
                    onClick={() => setPagina(p)}
                    className="text-[12px] font-semibold rounded-lg"
                    style={
                      p === pagActual
                        ? { backgroundColor: '#009ee3', color: '#fff', padding: '4px 10px' }
                        : { border: '0.5px solid #e2e8f0', color: '#64748b', padding: '4px 10px' }
                    }
                  >
                    {p}
                  </button>
                </span>
              );
            })}
            <button
              onClick={() => setPagina((p) => Math.min(totalPag, p + 1))}
              disabled={pagActual === totalPag}
              className="px-2 py-1 text-[12px] rounded-lg disabled:opacity-40"
              style={{ border: '0.5px solid #e2e8f0', color: '#64748b' }}
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
