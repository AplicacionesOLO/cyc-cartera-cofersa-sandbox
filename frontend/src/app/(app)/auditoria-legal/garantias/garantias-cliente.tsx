'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  Paperclip,
  FileText,
  X,
  Search,
  Truck,
  Pencil,
  ShieldAlert,
  Wallet,
  CalendarClock,
  Undo2,
  FileSignature,
  MoreHorizontal,
  History,
  ChevronLeft,
  ChevronRight,
  Eye,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ShieldOff,
  Plus,
  User,
  Mail,
  RotateCw,
  Trash2,
} from 'lucide-react';
import { useGarantiasController } from '@/views/auditoria-legal/hooks/use-garantias-controller';
import type { ApiError } from '@/shared/api/api-error';
import { fmtCRC, fmtFecha, fmtFechaHora } from '@/lib/utils/formato';
import ModalRegistrarGarantia from './ModalRegistrarGarantia';
import ModalGenerarPagare from './ModalGenerarPagare';
import ModalSelectorTipoRegistro from './ModalSelectorTipoRegistro';
import ModalConfirmarEnvioVendedor from './ModalConfirmarEnvioVendedor';
import ModalConfirmarRecepcion from './ModalConfirmarRecepcion';
import ModalHistorialGarantia from './ModalHistorialGarantia';
import ModalEmitirPagare from './ModalEmitirPagare';
import ModalSolicitarActualizacion from './ModalSolicitarActualizacion';
import ModalRevisarActualizacion from './ModalRevisarActualizacion';
import type {
  GarantiaListaRow,
  AccionCustodia,
  EstadoCustodia,
  ClienteSinGarantiaRow,
  ContribuyenteBusqueda,
} from '@/types/auditoria-legal';
import {
  ACCION_CUSTODIA_CFG,
  ESTADO_CUSTODIA_LABEL,
  SEMAFORO_COLOR,
  RIESGO_LABEL,
  ESTADO_SOLICITUD_LABEL,
  ESTADO_SOLICITUD_BADGE,
} from '@/lib/auditoria-legal/catalogo';
import { esPersonaJuridica } from '@/lib/auditoria-legal/persona';
import { esSoloLectura } from '@/lib/utils/roles';
import type { SolicitudActualizacion } from '@/types/actualizacion-perfil';

interface Props {
  userRol: 'COORDINADOR' | 'ANALISTA' | 'GERENCIA';
  userEmail: string;
}

// 10 columnas, TODAS con ancho fijo (normalizado, sin columna "auto" que absorba espacio
// libre). Contribuyente queda en 280px con truncado de 1 línea. Tipo Título en 140px
// para que "Letra de Cambio" entre en 1 sola línea. Ubicación sube de 140 a 190px y
// pasa de truncado en 1 línea a envolver hasta 2 (ver <td> más abajo) -- el texto es
// determinístico según el catálogo (Mueble corto · Gaveta corta · Carpeta NN) pero
// perseguir un ancho exacto de 1 sola línea es frágil si el catálogo cambia más
// adelante; envolver a 2 líneas no se rompe con eso. Acciones baja de 176 a 126px --
// desde que se colapsó a 1 botón + el disparador del menú "...", ya no necesita el
// ancho que tenía cuando había hasta 5 íconos sueltos por fila (siendo la ÚLTIMA
// columna, un botón ocasional más largo -- "Confirmar Recepción" -- puede extenderse
// un poco más allá del ancho declarado sin romper el layout, porque no hay columna
// después que lo recorte).
const COLS = [280, 110, 140, 120, 60, 110, 90, 190, 115, 126];
const TABLE_MIN_WIDTH = `${COLS.reduce((s, w) => s + w, 0)}px`;

// Ordenamiento interactivo (Spec 4): sólo estas 5 columnas son clicables, tal
// como se pidió -- el resto (Tipo Título, Fiador, Ubicación, Custodia, Acciones)
// se quedan fijas. Default: Consecutivo ascendente.
type SortKey =
  'cliente_nombre' | 'consecutivo' | 'monto_garantizado' | 'fecha_vencimiento' | 'cobertura_pct';
interface ColumnaHeader {
  label: string;
  key?: SortKey;
  align?: 'left' | 'right' | 'center';
}
const COLUMNAS_HEADER: ColumnaHeader[] = [
  { label: 'Contribuyente', key: 'cliente_nombre' },
  { label: 'Consecutivo', key: 'consecutivo' },
  { label: 'Tipo Título' },
  { label: 'Monto Garantizado', key: 'monto_garantizado', align: 'right' },
  { label: 'Fiador', align: 'center' },
  { label: 'Cobertura', key: 'cobertura_pct', align: 'center' },
  { label: 'Vencimiento', key: 'fecha_vencimiento' },
  { label: 'Ubicación' },
  { label: 'Custodia' },
  { label: 'Acciones' },
];

// Estilo único y estandarizado de TODOS los <th> -- se aplica directo sobre el
// elemento de texto (<button> o <span>), NO sólo en el <th> padre. El preflight
// de Tailwind fuerza `button, select { text-transform: none }` (para anular el
// uppercase que algunos navegadores le ponen por defecto a los form controls);
// esa regla del stylesheet le gana a un `text-transform: uppercase` heredado
// desde un ancestro, así que los headers ordenables (que son <button>) salían
// en minúsculas/normal mientras los no-ordenables (<span>, sin ese reset)
// salían en mayúsculas -- de ahí la inconsistencia reportada. Un style inline
// puesto directo en cada elemento sí gana, sin importar el tipo de tag.
const HEADER_TEXT_STYLE: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

function compararFilas(a: GarantiaListaRow, b: GarantiaListaRow, key: SortKey): number {
  switch (key) {
    case 'cliente_nombre':
      return a.cliente_nombre.localeCompare(b.cliente_nombre, 'es');
    case 'consecutivo':
      return a.consecutivo.localeCompare(b.consecutivo, 'es');
    case 'monto_garantizado':
      return a.monto_garantizado - b.monto_garantizado;
    // Fechas ISO 'YYYY-MM-DD' comparan bien lexicográficamente.
    case 'fecha_vencimiento':
      return a.fecha_vencimiento.localeCompare(b.fecha_vencimiento);
    case 'cobertura_pct':
      return a.cobertura_pct - b.cobertura_pct;
  }
}

// Explica por qué la barra de Cobertura sale de un color u otro -- el semáforo
// ya existía (3 colores según la holgura configurada en config_sistema, no
// sólo si cubre o no cubre), esto sólo agrega el tooltip que faltaba.
const EXPLICACION_SEMAFORO: Record<'ROJO' | 'AMBAR' | 'VERDE', string> = {
  ROJO: 'Deuda excede garantía',
  AMBAR: 'Cubre la deuda actual, pero sin margen de holgura configurado',
  VERDE: 'Cobertura completa, con margen de holgura',
};

const TD: React.CSSProperties = { padding: '11px 12px', fontSize: '12.5px', color: '#334155' };

// Umbral de "por vencer" -- mismo que el KPI del Balance de Cobertura (Fase 3) y que
// el tab "Próximos a Vencer" (que agrupa por vencer + ya vencidas, ver tabDeFila).
const DIAS_ALERTA_VENCIMIENTO = 60;

/** Días desde hoy hasta el vencimiento. Negativo si ya venció. */
function diasParaVencer(fechaVencimiento: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(`${fechaVencimiento.slice(0, 10)}T00:00:00`);
  return Math.round((venc.getTime() - hoy.getTime()) / 86_400_000);
}

// Badges de estado de custodia. "Vencido" es un estado calculado, no guardado:
// sobrescribe el badge (decisión de Jeffrey), pero la ubicación real se sigue
// mostrando como texto secundario cuando el papel no está en bóveda.
const CUSTODIA_BADGE: Record<EstadoCustodia, { bg: string; text: string }> = {
  EN_BOVEDA: { bg: '#dcfce7', text: '#15803d' },
  ENVIADO_VENDEDOR: { bg: '#ffedd5', text: '#c2410c' },
  EN_FIRMA: { bg: '#fef9c3', text: '#a16207' },
};
const BADGE_VENCIDO = { bg: '#fee2e2', text: '#dc2626' };

type FiltroFiador = 'TODOS' | 'CON' | 'SIN';

// Tabs de estado (reemplazan el select de custodia): parten la tabla en 4 vistas
// que se excluyen entre sí -- una garantía cae en UNA sola, con "Próximos a Vencer"
// como la de mayor prioridad (una garantía vencida o por vencer se muestra ahí,
// no bajo su custodia física, igual que ya hace el badge VENCIDO de la fila).
// 'SIN_GARANTIA' (ago 2026) es distinta a las otras 4: no filtra `rows` (que son
// garantías YA registradas), sino un dataset aparte de clientes activos SIN
// ninguna garantía activa (ver clientesSinGarantia/fetchSinGarantia) -- de ahí
// que su conteo y su tabla se calculen por separado en el render.
type TabEstado = 'TODOS' | 'EN_BOVEDA' | 'EN_TRANSITO' | 'POR_VENCER' | 'SIN_GARANTIA';
const TABS_ESTADO: { key: TabEstado; label: string; alerta?: boolean }[] = [
  { key: 'TODOS', label: 'Todos' },
  { key: 'EN_BOVEDA', label: 'En Bóveda' },
  { key: 'EN_TRANSITO', label: 'En Tránsito / Vendedor' },
  { key: 'POR_VENCER', label: 'Próximos a Vencer' },
  { key: 'SIN_GARANTIA', label: 'Sin Garantía', alerta: true },
];

function tabDeFila(g: GarantiaListaRow): Exclude<TabEstado, 'TODOS'> {
  if (g.vencido || diasParaVencer(g.fecha_vencimiento) <= DIAS_ALERTA_VENCIMIENTO)
    return 'POR_VENCER';
  if (g.estado_custodia === 'ENVIADO_VENDEDOR' || g.estado_custodia === 'EN_FIRMA')
    return 'EN_TRANSITO';
  return 'EN_BOVEDA';
}

const TAMANOS_PAGINA = [10, 25, 50] as const;
type PorPagina = (typeof TAMANOS_PAGINA)[number];

const SELECT_CLS =
  'rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] text-gray-700 focus:outline-none focus:border-blue-400';

// Mismo límite que el handler de /documento -- Vercel corta el body de una
// Function en ~4.5MB ANTES de que el handler corra, así que sin este chequeo
// previo un PDF grande nunca llega al 400 con mensaje claro: el usuario vería
// un 413 opaco de la plataforma. El texto es idéntico al del route para que la
// experiencia sea la misma venga de donde venga el rechazo.
const MAX_MB = 4;

function Skeleton() {
  return (
    <div className="px-5 py-5 space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border h-[86px] animate-pulse" />
        ))}
      </div>
      <div className="bg-white rounded-xl border h-80 animate-pulse" />
    </div>
  );
}

function KpiCard({
  label,
  valor,
  sub,
  color,
  icon,
}: {
  label: string;
  valor: string;
  sub: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 leading-tight">
          {label}
        </p>
        <span style={{ color }} className="shrink-0">
          {icon}
        </span>
      </div>
      <p
        className="mt-1.5 text-[19px] font-semibold leading-none"
        style={{ color, fontVariantNumeric: 'tabular-nums' }}
      >
        {valor}
      </p>
      <p className="mt-1 text-[11px] text-gray-400">{sub}</p>
    </div>
  );
}

/** Barra de cobertura: llena hasta 100% del monto objetivo (saldo + holgura). */
function BarraCobertura({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex-1 rounded-full overflow-hidden"
        style={{ height: '5px', background: '#f1f5f9', minWidth: '32px' }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }}
        />
      </div>
      <span
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color,
          fontVariantNumeric: 'tabular-nums',
          minWidth: '38px',
          textAlign: 'right',
        }}
      >
        {pct}%
      </span>
    </div>
  );
}

interface MenuFilaProps {
  row: GarantiaListaRow;
  subiendoPdf: boolean;
  despachando: boolean;
  soloLectura: boolean;
  onEditar: () => void;
  onHistorial: () => void;
  onVerPagare: () => void;
  onSubirPdf: (file: File) => void;
  onDespachar: () => void;
}

// Menú "..." de opciones secundarias por fila. No hay ningún componente de
// dropdown/menú reutilizable en el repo todavía -- éste es el primero, construido
// a mano (sin librería) siguiendo la estética del resto del módulo: overlay con
// position:absolute + cierre al hacer click afuera.
// Incluye TODO lo que antes vivía como ícono suelto en la fila (Editar, Ver PDF,
// Adjuntar PDF, Ver/Generar Pagaré) más "Ver Historial" (nuevo) -- se reorganiza,
// no se pierde ninguna capacidad existente. "Eliminar" queda deliberadamente
// afuera: el módulo nunca borra un expediente legal (todo pasa por sustitución +
// garantia_eventos como rastro) y agregar un borrado real es una decisión de
// negocio aparte, no una limpieza de UI.
function MenuFila({
  row,
  subiendoPdf,
  despachando,
  soloLectura,
  onEditar,
  onHistorial,
  onVerPagare,
  onSubirPdf,
  onDespachar,
}: MenuFilaProps) {
  const [abierto, setAbierto] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!abierto) return;
    function onClickFuera(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, [abierto]);

  const ITEM_CLS =
    'flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-gray-700 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent';

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="inline-flex items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-slate-100"
        style={{ color: '#64748b', border: '1px solid #e2e8f0' }}
        aria-haspopup="menu"
        aria-expanded={abierto}
        title="Más opciones"
        aria-label="Más opciones"
      >
        <MoreHorizontal size={13} />
      </button>

      {abierto && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+4px)] z-20 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg py-1"
        >
          {/* CASO A del pedido: mientras está En Bóveda (y no es Existente Física,
              que nunca se despacha), Despachar a Vendedor es la acción secundaria
              -- el botón principal de la fila es siempre "Ver Ficha". */}
          {!soloLectura &&
            row.estado_custodia === 'EN_BOVEDA' &&
            !row.vencido &&
            row.origen_registro !== 'EXISTENTE_FISICA' && (
              <button
                type="button"
                role="menuitem"
                className={ITEM_CLS}
                disabled={despachando}
                onClick={() => {
                  setAbierto(false);
                  onDespachar();
                }}
              >
                {despachando ? <Loader2 size={13} className="animate-spin" /> : <Truck size={13} />}
                Despachar a Vendedor (Salida de Archivo)
              </button>
            )}
          {!soloLectura && (
            <button
              type="button"
              role="menuitem"
              className={ITEM_CLS}
              onClick={() => {
                setAbierto(false);
                onEditar();
              }}
            >
              <Pencil size={13} />{' '}
              {row.origen_registro === 'EXISTENTE_FISICA' ? 'Editar Ubicación' : 'Editar Datos'}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className={ITEM_CLS}
            onClick={() => {
              setAbierto(false);
              onHistorial();
            }}
          >
            <History size={13} /> Ver Historial
          </button>
          {/* Ver/Generar Pagaré no aplica a 'Existente (Física)' -- es un documento que
              ya existía antes del sistema, no se le genera un texto legal nuevo acá.
              Gerencia solo puede VER el texto ya generado, no generarlo. */}
          {row.origen_registro !== 'EXISTENTE_FISICA' &&
            (!soloLectura || row.documento_pagare_generado_en) && (
              <button
                type="button"
                role="menuitem"
                className={ITEM_CLS}
                disabled={row.tipo_titulo !== 'Pagaré'}
                title={
                  row.tipo_titulo !== 'Pagaré'
                    ? 'Solo disponible para garantías tipo Pagaré'
                    : undefined
                }
                onClick={() => {
                  setAbierto(false);
                  onVerPagare();
                }}
              >
                <FileSignature size={13} />{' '}
                {row.documento_pagare_generado_en ? 'Ver Texto del Pagaré' : 'Generar Pagaré'}
              </button>
            )}
          {row.documento_pdf_url && (
            // eslint-disable-next-line react/jsx-no-target-blank -- rel ya incluye noopener
            <a
              role="menuitem"
              href={row.documento_pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className={ITEM_CLS}
              onClick={() => setAbierto(false)}
            >
              <FileText size={13} /> Ver PDF Escaneado
            </a>
          )}
          {!soloLectura && (
            <>
              <button
                type="button"
                role="menuitem"
                className={ITEM_CLS}
                onClick={() => {
                  fileRef.current?.click();
                  setAbierto(false);
                }}
              >
                {subiendoPdf ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Paperclip size={13} />
                )}
                {row.documento_pdf_url ? 'Reemplazar PDF Escaneado' : 'Adjuntar PDF Escaneado'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onSubirPdf(f);
                  e.target.value = '';
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function GarantiasCliente({ userRol, userEmail }: Props) {
  const soloLectura = esSoloLectura(userRol);
  const [rows, setRows] = useState<GarantiaListaRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  // Selector inicial ("¿Qué querés hacer?") que aparece al hacer +Registrar
  // Garantía -- decide si se abre el alta de siempre (documento físico ya
  // existente) o el camino que encadena directo a Generar Pagaré.
  const [showSelector, setShowSelector] = useState(false);
  // "Emitir Nueva Garantía (Pagaré Oficial)": mismo ModalRegistrarGarantia de
  // siempre, pero con tipo_titulo bloqueado en 'Pagaré' y un onSuccess que
  // encadena a ModalGenerarPagare en vez de sólo cerrar y refrescar.
  const [emitiendoNueva, setEmitiendoNueva] = useState(false);
  // Garantía en edición: abre el mismo modal en modo PATCH.
  const [editando, setEditando] = useState<GarantiaListaRow | null>(null);
  const router = useRouter();
  const ctrl = useGarantiasController();
  // Garantía para la que se está capturando datos del pagaré (modal). Si la
  // garantía ya tiene documento_pagare_generado_en, no se abre este modal --
  // se navega directo a la vista de impresión.
  const [generandoPagare, setGenerandoPagare] = useState<GarantiaListaRow | null>(null);
  // Tras generar el pagaré desde el camino "Emitir Nueva Garantía", se ofrece
  // marcarla como Enviada a Vendedor antes de ir a imprimir (Pre-Flight punto 4
  // del pedido). Sólo tiene sentido si el estado actual es EN_BOVEDA (la
  // transición ENTREGAR sólo parte de ahí) y hay un vendedor resuelto.
  const [confirmandoEnvio, setConfirmandoEnvio] = useState<GarantiaListaRow | null>(null);
  // Garantía a la que se le está pidiendo el código de archivo para confirmar
  // el reingreso a bóveda (ver ModalConfirmarRecepcion).
  const [confirmandoRecepcion, setConfirmandoRecepcion] = useState<GarantiaListaRow | null>(null);
  // Garantía cuyo timeline de garantia_eventos se está mostrando (Ver Historial).
  const [viendoHistorial, setViendoHistorial] = useState<GarantiaListaRow | null>(null);
  // Visibilidad global (Auditoría y Control Legal, jul 2026): por defecto TODOS los
  // analistas y el coordinador ven todas las garantías de la empresa, sin importar
  // a qué cartera esté asignado el contribuyente -- el expediente legal no es de un
  // analista, es de la empresa. "Mi cartera" queda como acotador opcional, sólo
  // tiene sentido para ANALISTA (COORDINADOR ya ve todo en el resto del sistema).
  const [verSoloMiCartera, setVerSoloMiCartera] = useState(false);
  // Tab "Sin Garantía" (Spec 1, ago 2026): dataset aparte, no derivado de `rows`
  // -- null mientras no se ha cargado ni una vez (distinto de [], que es "ya
  // se cargó y no hay ninguno"). Se pide en paralelo con fetchData.
  const [clientesSinGarantia, setClientesSinGarantia] = useState<ClienteSinGarantiaRow[] | null>(
    null,
  );

  // Solicitudes de actualización activas por contribuyente (Spec ago 2026) --
  // fetch directo, sin tocar fn_garantias_clientes_sin_garantia (RLS ya
  // permite SELECT a personal activo, mismo patrón que vendedoresLista).
  // Se excluye EXPIRADA (el índice único parcial de solicitudes_actualizacion
  // sólo cubre ENVIADA/DATOS_RECIBIDOS -- una solicitud EXPIRADA no bloquea
  // reenviar, así que debe tratarse igual que "sin solicitud" y mostrar el
  // botón de nuevo). APROBADA SÍ se trae -- pero sólo importa mientras
  // garantia_id siga null (el analista aprobó los datos pero canceló/no
  // terminó ModalEmitirPagare): sin esto, cancelar ese modal hacía que la fila
  // volviera a mostrar "Solicitar Actualización" como si nada hubiera pasado,
  // perdiendo el rastro de una solicitud ya aprobada y arriesgando un segundo
  // correo al mismo cliente. Una vez que la garantía se crea de verdad, el
  // contribuyente sale solo de clientesSinGarantia (fetchSinGarantia), así que
  // no hace falta filtrar acá las APROBADA que ya tienen garantia_id.
  const [solicitudesPorContribuyente, setSolicitudesPorContribuyente] = useState<
    Map<string, SolicitudActualizacion>
  >(new Map());
  // Mismo fetch, pero incluyendo EXPIRADA -- se guarda aparte (última solicitud
  // por contribuyente, cualquier estado) SOLO para alimentar el sub-filtro
  // "Expiradas / Reenviar" del tab Sin Garantía. No participa en la lógica del
  // botón de Acciones (ver solicitudesPorContribuyente arriba): una EXPIRADA
  // sigue mostrando "Solicitar Actualización" ahí, a propósito, porque el
  // índice único parcial de la BD no bloquea reenviar sobre una expirada.
  const [ultimaSolicitudPorContribuyente, setUltimaSolicitudPorContribuyente] = useState<
    Map<string, SolicitudActualizacion>
  >(new Map());
  const [solicitandoPara, setSolicitandoPara] = useState<ClienteSinGarantiaRow | null>(null);
  // Reenviar/Editar Correo (ago 2026): mismo modal que "Solicitar Actualización",
  // en modo edición -- necesita el cliente Y la solicitud viva (id + último
  // correo usado, para pre-llenarlo).
  const [reenviandoPara, setReenviandoPara] = useState<{
    cliente: ClienteSinGarantiaRow;
    solicitud: SolicitudActualizacion;
  } | null>(null);
  const [revisandoId, setRevisandoId] = useState<number | null>(null);
  const [reanudandoId, setReanudandoId] = useState<number | null>(null);
  const [cancelandoId, setCancelandoId] = useState<number | null>(null);

  const fetchSolicitudes = useCallback(
    async (contribuyentes: string[]) => {
      if (contribuyentes.length === 0) {
        setSolicitudesPorContribuyente(new Map());
        setUltimaSolicitudPorContribuyente(new Map());
        return;
      }
      // El backend ya trae sólo ENVIADA/DATOS_RECIBIDOS/APROBADA/EXPIRADA, ordenadas por enviada_en desc;
      // acá se acota a los contribuyentes del tab (antes .in('contribuyente', ...)).
      const set = new Set(contribuyentes);
      let data: SolicitudActualizacion[] = [];
      try {
        data = await ctrl.cargarSolicitudes();
      } catch {
        data = [];
      }
      const todas = data.filter((s) => set.has(s.contribuyente));
      // La última por contribuyente (la query ya viene ordenada desc, así que la
      // primera vez que aparece cada contribuyente ES la más reciente) -- usar
      // "primero gana" acá, NO `new Map(array)` (que se queda con la ÚLTIMA
      // ocurrencia de cada key, es decir la más VIEJA dado el orden desc).
      const ultima = new Map<string, SolicitudActualizacion>();
      const vivasMap = new Map<string, SolicitudActualizacion>();
      todas.forEach((s) => {
        if (!ultima.has(s.contribuyente)) ultima.set(s.contribuyente, s);
        const esViva = s.estado !== 'EXPIRADA' && (s.estado !== 'APROBADA' || !s.garantia_id);
        if (esViva && !vivasMap.has(s.contribuyente)) vivasMap.set(s.contribuyente, s);
      });
      setUltimaSolicitudPorContribuyente(ultima);
      setSolicitudesPorContribuyente(vivasMap);
    },
    [ctrl],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (clientesSinGarantia) fetchSolicitudes(clientesSinGarantia.map((c) => c.contribuyente));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientesSinGarantia]);

  // Cliente sobre el que se hizo clic en "+ Registrar/Emitir" desde el tab Sin
  // Garantía -- viaja como clientePreseleccionado al modal que se abra después
  // del selector. null cuando se entra por el botón genérico "+ Registrar
  // Garantía" (sin cliente predefinido).
  const [clienteParaRegistrar, setClienteParaRegistrar] = useState<ContribuyenteBusqueda | null>(
    null,
  );
  // Pre-llenado del representante legal al abrir ModalEmitirPagare desde una
  // solicitud de actualización aprobada (persona jurídica) -- ver
  // ModalRevisarActualizacion.onAprobado más abajo.
  const [representantePrellenado, setRepresentantePrellenado] = useState<{
    nombre: string;
    cedula: string;
  } | null>(null);
  // Filtro por vendedor (ago 2026): acota AMBAS listas (garantías activas y
  // tab Sin Garantía) por vendedor_cod -- por eso vive al mismo nivel que
  // busqueda/filtroFiador, no adentro de un solo dataset. '' = Todos.
  const vendedoresLista = ctrl.vendedoresLista;
  const [vendedorFiltro, setVendedorFiltro] = useState('');

  function abrirPagare(row: GarantiaListaRow) {
    if (row.documento_pagare_generado_en) router.push(`/pagare/${row.id}`);
    else setGenerandoPagare(row);
  }

  function alGenerarPagareExitoso(row: GarantiaListaRow) {
    if (row.estado_custodia === 'EN_BOVEDA' && row.vendedor_cod) {
      setGenerandoPagare(null);
      setConfirmandoEnvio(row);
    } else {
      setGenerandoPagare(null);
      router.push(`/pagare/${row.id}`);
    }
  }
  const [busqueda, setBusqueda] = useState('');
  const [tabEstado, setTabEstado] = useState<TabEstado>('TODOS');
  const [filtroFiador, setFiltroFiador] = useState<FiltroFiador>('TODOS');
  // Sub-filtro de seguimiento SOLO dentro del tab "Sin Garantía" (ago 2026).
  const [subFiltroSinGarantia, setSubFiltroSinGarantia] = useState<
    'TODOS' | 'PENDIENTES' | 'DATOS_RECIBIDOS' | 'EXPIRADAS'
  >('TODOS');
  const [procesando, setProcesando] = useState<Set<number>>(new Set());
  const [subiendoPdf, setSubiendoPdf] = useState<Set<number>>(new Set());
  // Errores de acción por fila -- banner inline sobre la tabla (no alert()).
  const [accionError, setAccionError] = useState<string | null>(null);
  const [accionAviso, setAccionAviso] = useState<string | null>(null);
  // Paginación (escalabilidad 500+ registros): puramente de cliente -- el RPC ya
  // trae todas las filas visibles para el usuario en una sola llamada (ordenadas
  // servidor-side), esto sólo recorta cuántas se pintan a la vez.
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState<PorPagina>(25);
  // Ordenamiento interactivo (Spec 4): default Consecutivo ascendente.
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'consecutivo',
    dir: 'asc',
  });

  function handleSort(key: SortKey) {
    setSortConfig((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    );
  }

  // `silent: true` recarga los datos SIN levantar el skeleton -- se usa después
  // de una acción de fila. Sin esto, el `if (loading) return <Skeleton/>`
  // reemplaza toda la tabla en cada transición de custodia y en cada PDF
  // subido: se pierde el "Procesando..." de la fila y se ve un flash de página
  // completa (CLAUDE.md regla 10, optimistic UI).
  const fetchData = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        // Visibilidad global por defecto (Spec 1): sólo se acota por email si el
        // propio analista prendió el toggle "Mi cartera". COORDINADOR nunca acota.
        const data = await ctrl.cargarGarantias(
          userRol === 'ANALISTA' && verSoloMiCartera && !!userEmail,
        );
        setRows(data);
        return data;
      } catch {
        setError('Error al cargar las garantías.');
        return null;
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [userRol, userEmail, verSoloMiCartera, ctrl],
  );

  // Mismo criterio de alcance que fetchData (Mi cartera sólo acota para
  // ANALISTA con el toggle prendido) -- carga aparte porque es un RPC distinto
  // sobre un dataset distinto (clientes sin garantía, no garantías).
  const fetchSinGarantia = useCallback(async () => {
    try {
      const data = await ctrl.cargarSinGarantia(
        userRol === 'ANALISTA' && verSoloMiCartera && !!userEmail,
      );
      setClientesSinGarantia(data);
    } catch {
      // Silencioso a propósito: es un tab secundario -- si falla, el resto del
      // módulo (garantías ya registradas) sigue funcionando con normalidad.
      setClientesSinGarantia([]);
    }
  }, [userRol, userEmail, verSoloMiCartera, ctrl]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    fetchSinGarantia();
  }, [fetchData, fetchSinGarantia]);

  // ── KPIs: siempre sobre el total de la cartera visible, NO sobre el filtro ──
  // Son métricas de riesgo del portafolio; si cambiaran al filtrar dejarían de
  // servir como referencia fija mientras el analista navega.
  const kpis = useMemo(() => {
    const r = rows ?? [];
    return {
      totalGarantizado: r.reduce((s, g) => s + g.monto_garantizado, 0),
      enTransito: r.filter(
        (g) => g.estado_custodia === 'ENVIADO_VENDEDOR' || g.estado_custodia === 'EN_FIRMA',
      ).length,
      porVencer: r.filter(
        (g) => !g.vencido && diasParaVencer(g.fecha_vencimiento) <= DIAS_ALERTA_VENCIMIENTO,
      ).length,
      vencidas: r.filter((g) => g.vencido).length,
      sinAval: r.filter((g) => !g.tiene_fiador && esPersonaJuridica(g.contribuyente)).length,
    };
  }, [rows]);

  // KPI adicional (ago 2026): Campaña de Auditoría -- SUMA, no reemplaza, a las
  // 4 KPIs de arriba (esas se usan en los otros 4 tabs también). Sólo se
  // muestra cuando el tab activo es "Sin Garantía". Sobre TODOS los clientes
  // sin garantía (no el filtro/búsqueda activo de la tabla), igual que kpis.
  const kpiCampaniaAuditoria = useMemo(() => {
    let enviadas = 0,
      datosRecibidos = 0;
    (clientesSinGarantia ?? []).forEach((c) => {
      switch (ultimaSolicitudPorContribuyente.get(c.contribuyente)?.estado) {
        case 'ENVIADA':
          enviadas++;
          break;
        case 'DATOS_RECIBIDOS':
          datosRecibidos++;
          break;
      }
    });
    return { enviadas, datosRecibidos };
  }, [clientesSinGarantia, ultimaSolicitudPorContribuyente]);

  // ── Búsqueda + fiador: se calculan ANTES del tab, para que los contadores de
  // cada tab reflejen los otros filtros activos (patrón estándar de facetas). ──
  const filasPreTab = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (rows ?? []).filter((g) => {
      if (vendedorFiltro && g.vendedor_cod !== vendedorFiltro) return false;
      if (filtroFiador === 'CON' && !g.tiene_fiador) return false;
      if (filtroFiador === 'SIN' && g.tiene_fiador) return false;
      if (!q) return true;
      return (
        g.cliente_nombre.toLowerCase().includes(q) ||
        g.contribuyente.toLowerCase().includes(q) ||
        g.ubicacion_archivero.toLowerCase().includes(q)
      );
    });
  }, [rows, busqueda, filtroFiador, vendedorFiltro]);

  const conteoTabs = useMemo(() => {
    // SIN_GARANTIA no sale de filasPreTab (es un dataset de clientes, no de
    // garantías) -- se suma acá aparte sólo para que el badge del tab lo muestre.
    const c: Record<TabEstado, number> = {
      TODOS: filasPreTab.length,
      EN_BOVEDA: 0,
      EN_TRANSITO: 0,
      POR_VENCER: 0,
      SIN_GARANTIA: clientesSinGarantia?.length ?? 0,
    };
    filasPreTab.forEach((g) => {
      c[tabDeFila(g)]++;
    });
    return c;
  }, [filasPreTab, clientesSinGarantia]);

  const filasTab = useMemo(() => {
    if (tabEstado === 'TODOS') return filasPreTab;
    return filasPreTab.filter((g) => tabDeFila(g) === tabEstado);
  }, [filasPreTab, tabEstado]);

  // Ordenamiento interactivo: se aplica DESPUÉS de filtrar (orden ≠ subconjunto).
  // Ya no depende del order by del RPC (vencidas primero) -- ahora el default es
  // Consecutivo ascendente y el resto lo decide el analista con un clic.
  const rowsFiltradas = useMemo(() => {
    const copia = [...filasTab];
    copia.sort((a, b) => {
      const c = compararFilas(a, b, sortConfig.key);
      return sortConfig.dir === 'asc' ? c : -c;
    });
    return copia;
  }, [filasTab, sortConfig]);

  const hayFiltros =
    busqueda.trim() !== '' ||
    tabEstado !== 'TODOS' ||
    filtroFiador !== 'TODOS' ||
    vendedorFiltro !== '';

  // Cambiar cualquier filtro vuelve a la página 1 -- si no, es fácil quedar
  // parado en una página que ya no existe para el nuevo resultado filtrado.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPagina(1);
  }, [busqueda, tabEstado, filtroFiador, vendedorFiltro, porPagina, subFiltroSinGarantia]);

  const totalPaginas = Math.max(1, Math.ceil(rowsFiltradas.length / porPagina));
  const rowsPagina = useMemo(() => {
    const inicio = (pagina - 1) * porPagina;
    return rowsFiltradas.slice(inicio, inicio + porPagina);
  }, [rowsFiltradas, pagina, porPagina]);

  // ── Dataset del tab "Sin Garantía": misma barra de búsqueda, paginación e
  // idea de "hayFiltros" que la tabla normal, pero sobre clientesSinGarantia
  // en vez de rows -- el RPC ya lo trae ordenado por saldo desc. ──
  // Se calcula ANTES del sub-filtro de seguimiento, igual que filasPreTab, para
  // que los contadores de cada pastilla reflejen búsqueda/vendedor activos.
  const sinGarantiaPreSubFiltro = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (clientesSinGarantia ?? []).filter((c) => {
      if (vendedorFiltro && c.vendedor_cod !== vendedorFiltro) return false;
      if (!q) return true;
      return (
        c.cliente_nombre.toLowerCase().includes(q) || c.contribuyente.toLowerCase().includes(q)
      );
    });
  }, [clientesSinGarantia, busqueda, vendedorFiltro]);

  // Sub-filtro de seguimiento dentro de "Sin Garantía" (ago 2026): se basa en la
  // ÚLTIMA solicitud por contribuyente (cualquier estado, incluida EXPIRADA),
  // no en solicitudesPorContribuyente (que a propósito excluye EXPIRADA -- ver
  // fetchSolicitudes). Un contribuyente sin ninguna solicitud nunca cae en
  // ninguna pastilla salvo "Todos".
  const conteoSubFiltroSinGarantia = useMemo(() => {
    const c = {
      TODOS: sinGarantiaPreSubFiltro.length,
      PENDIENTES: 0,
      DATOS_RECIBIDOS: 0,
      EXPIRADAS: 0,
    };
    sinGarantiaPreSubFiltro.forEach((row) => {
      switch (ultimaSolicitudPorContribuyente.get(row.contribuyente)?.estado) {
        case 'ENVIADA':
          c.PENDIENTES++;
          break;
        case 'DATOS_RECIBIDOS':
          c.DATOS_RECIBIDOS++;
          break;
        case 'EXPIRADA':
          c.EXPIRADAS++;
          break;
      }
    });
    return c;
  }, [sinGarantiaPreSubFiltro, ultimaSolicitudPorContribuyente]);

  const sinGarantiaFiltrado = useMemo(() => {
    if (subFiltroSinGarantia === 'TODOS') return sinGarantiaPreSubFiltro;
    return sinGarantiaPreSubFiltro.filter((row) => {
      const estado = ultimaSolicitudPorContribuyente.get(row.contribuyente)?.estado;
      if (subFiltroSinGarantia === 'PENDIENTES') return estado === 'ENVIADA';
      if (subFiltroSinGarantia === 'DATOS_RECIBIDOS') return estado === 'DATOS_RECIBIDOS';
      return estado === 'EXPIRADA'; // EXPIRADAS
    });
  }, [sinGarantiaPreSubFiltro, subFiltroSinGarantia, ultimaSolicitudPorContribuyente]);
  const totalPaginasSinGarantia = Math.max(1, Math.ceil(sinGarantiaFiltrado.length / porPagina));
  const sinGarantiaPagina = useMemo(() => {
    const inicio = (pagina - 1) * porPagina;
    return sinGarantiaFiltrado.slice(inicio, inicio + porPagina);
  }, [sinGarantiaFiltrado, pagina, porPagina]);

  // ── Botón único dinámico de Acciones, según custodia (CASO A/B del pedido) ──
  // CASO A -- En Bóveda (verde): SIEMPRE "Ver Ficha" como principal (reutiliza el
  // modal de Editar Datos). "Despachar a Vendedor" y "Generar Pagaré" pasan al
  // menú "..." como acciones secundarias (ver MenuFila) -- ya no hay un botón
  // principal distinto según si el pagaré está generado o no: eso generaba un
  // 4to caso ("Emitido/Pendiente") que no corresponde a ningún estado_custodia
  // real (el enum sólo tiene EN_BOVEDA/ENVIADO_VENDEDOR/EN_FIRMA), así que se
  // colapsa en éste único caso.
  // CASO B -- Enviado a Vendedor / En Tránsito (naranja): "Confirmar Recepción".
  function botonPrincipal(
    r: GarantiaListaRow,
  ): { label: string; Icono: typeof Truck; onClick: () => void; primario: boolean } | null {
    // 'Existente (Física)' -- documento físico que ya existía y ya estaba firmado
    // antes de digitalizarse acá. Nunca se despacha para firma ni se le genera un
    // pagaré nuevo, para siempre, sin importar qué pase después con la garantía
    // (decisión explícita del pedido) -- por eso este chequeo va primero, antes
    // de mirar estado_custodia.
    if (r.origen_registro === 'EXISTENTE_FISICA') {
      return { label: 'Ver Ficha', Icono: Eye, onClick: () => setEditando(r), primario: false };
    }
    // Gerencia ve el módulo en solo lectura -- nunca el botón que dispara la
    // acción de custodia, siempre "Ver Ficha".
    if (!soloLectura && ACCION_CUSTODIA_CFG.REINGRESAR.desde.includes(r.estado_custodia)) {
      return {
        label: 'Confirmar Recepción',
        Icono: Undo2,
        onClick: () => setConfirmandoRecepcion(r),
        primario: true,
      };
    }
    // estado_custodia === 'EN_BOVEDA' de acá en adelante.
    // Vencida: no avanza -- se reemplaza con "Registrar sustitución" (ver render).
    if (r.vencido) return null;
    return { label: 'Ver Ficha', Icono: Eye, onClick: () => setEditando(r), primario: false };
  }

  async function ejecutarAccion(row: GarantiaListaRow, accion: AccionCustodia) {
    setProcesando((prev) => new Set(prev).add(row.id));
    setAccionError(null);
    setAccionAviso(null);
    try {
      // El correo al vendedor lo envía el backend con el Gmail del usuario (ya no viaja providerToken).
      const json = await ctrl.cambiarCustodia(row.id, { accion });
      await fetchData({ silent: true });
      // ENTREGAR sí cambió de estado, pero el correo al vendedor puede haber
      // fallado -- el estado se aplicó igual, así que es un aviso, no un error.
      if (accion === 'ENTREGAR' && json.email_error) {
        setAccionAviso(
          `${row.cliente_nombre}: estado actualizado, pero el correo no se pudo enviar — ${json.email_error}`,
        );
      }
    } catch (e) {
      setAccionError(
        `${row.cliente_nombre}: ${(e as ApiError).message ?? 'Error al actualizar custodia'}`,
      );
    } finally {
      setProcesando((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  }

  async function subirPdf(row: GarantiaListaRow, file: File) {
    setAccionError(null);
    setAccionAviso(null);
    if (file.size > MAX_MB * 1024 * 1024) {
      setAccionError(
        `${row.cliente_nombre}: El archivo supera ${MAX_MB}MB. Escaneá en menor resolución.`,
      );
      return;
    }
    setSubiendoPdf((prev) => new Set(prev).add(row.id));
    try {
      await ctrl.subirDocumento(row.id, file);
      await fetchData({ silent: true });
    } catch (e) {
      setAccionError(
        `${row.cliente_nombre}: ${(e as ApiError).message ?? 'Error al subir el PDF'}`,
      );
    } finally {
      setSubiendoPdf((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  }

  if (loading)
    return (
      <div style={{ background: '#EEF2F7', minHeight: '100%' }}>
        <Skeleton />
      </div>
    );
  if (error)
    return (
      <div className="px-5 py-5">
        <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
          <p className="text-red-600 text-sm font-semibold">{error}</p>
          <button
            onClick={() => fetchData()}
            className="mt-3 text-[#009ee3] text-sm font-semibold hover:underline"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  if (!rows) return null;

  // Atajos usados por el bloque de tabla/paginación compartido -- evitan
  // repetir el ternario tabEstado === 'SIN_GARANTIA' en cada punto que
  // necesita "¿cuál es el total/página actual?".
  const esTabSinGarantia = tabEstado === 'SIN_GARANTIA';
  const totalActual = esTabSinGarantia ? sinGarantiaFiltrado.length : rowsFiltradas.length;
  const totalPaginasActual = esTabSinGarantia ? totalPaginasSinGarantia : totalPaginas;
  const totalRowsSinFiltrar = esTabSinGarantia
    ? (clientesSinGarantia?.length ?? 0)
    : (rows ?? []).length;

  function abrirRegistroDesdeSinGarantia(c: ClienteSinGarantiaRow) {
    setClienteParaRegistrar({
      contribuyente: c.contribuyente,
      cliente_nombre: c.cliente_nombre,
      n_codigos: c.n_codigos,
    });
    setShowSelector(true);
  }

  // Reanuda una solicitud que ya quedó APROBADA (datos en personas_legales ya
  // guardados) pero sin garantia_id -- el analista canceló o no terminó
  // ModalEmitirPagare la primera vez. Se salta ModalRevisarActualizacion (los
  // datos ya fueron aprobados) y va directo a re-abrir ModalEmitirPagare con
  // los mismos datos, sin volver a pedir revisión.
  async function reanudarPagareDesdeSolicitud(solicitud: SolicitudActualizacion) {
    setReanudandoId(solicitud.id);
    setAccionError(null);
    try {
      const json = await ctrl.verSolicitud(solicitud.id);
      const datos = json.datos_temporales as { nombre: string; cedula: string } | null;
      setClienteParaRegistrar({
        contribuyente: solicitud.contribuyente,
        cliente_nombre: solicitud.cliente_nombre,
        n_codigos: 1,
      });
      if (solicitud.tipo_persona === 'JURIDICA' && datos)
        setRepresentantePrellenado({ nombre: datos.nombre, cedula: datos.cedula });
      setEmitiendoNueva(true);
    } catch (e) {
      setAccionError(
        `${solicitud.cliente_nombre}: ${(e as ApiError).message ?? 'Error al recuperar la solicitud'}`,
      );
    } finally {
      setReanudandoId(null);
    }
  }

  // Cancela una solicitud ENVIADA o DATOS_RECIBIDOS -- libera al contribuyente
  // (el índice único parcial de la BD sólo bloquea esos 2 estados) para poder
  // enviar una nueva de inmediato, ej. tras un correo mal escrito o una prueba.
  async function cancelarSolicitud(solicitud: SolicitudActualizacion) {
    if (cancelandoId) return;
    if (
      !window.confirm(
        `¿Cancelar la solicitud enviada a ${solicitud.cliente_nombre}? El enlace dejará de funcionar y podrás volver a enviar una nueva.`,
      )
    )
      return;
    setCancelandoId(solicitud.id);
    setAccionError(null);
    try {
      await ctrl.gestionarSolicitud(solicitud.id, { accion: 'CANCELAR' });
      await fetchSolicitudes((clientesSinGarantia ?? []).map((c) => c.contribuyente));
    } catch (e) {
      setAccionError(
        `${solicitud.cliente_nombre}: ${(e as ApiError).message ?? 'Error al cancelar la solicitud'}`,
      );
    } finally {
      setCancelandoId(null);
    }
  }

  return (
    <div style={{ background: '#EEF2F7', minHeight: '100%' }}>
      <div className="px-5 py-5 space-y-4">
        {/* ── KPIs ─────────────────────────────────────────────────────── */}
        <div
          className={`grid grid-cols-2 gap-3 ${esTabSinGarantia ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}
        >
          <KpiCard
            label="Total Garantizado"
            valor={fmtCRC(kpis.totalGarantizado)}
            sub={`${(rows ?? []).length} título${(rows ?? []).length === 1 ? '' : 's'} vigente${(rows ?? []).length === 1 ? '' : 's'}`}
            color="#003B5C"
            icon={<Wallet size={15} />}
          />
          <KpiCard
            label="En Tránsito"
            valor={`${kpis.enTransito}`}
            sub="con vendedor o en firma"
            color="#c2410c"
            icon={<Truck size={15} />}
          />
          <KpiCard
            label="Próximos Vencimientos"
            valor={`${kpis.porVencer}`}
            sub={
              kpis.vencidas > 0
                ? `< ${DIAS_ALERTA_VENCIMIENTO} días · ${kpis.vencidas} ya vencida${kpis.vencidas === 1 ? '' : 's'}`
                : `menos de ${DIAS_ALERTA_VENCIMIENTO} días`
            }
            color={kpis.vencidas > 0 ? '#dc2626' : '#d97706'}
            icon={<CalendarClock size={15} />}
          />
          <KpiCard
            label="Sin Aval Personal"
            valor={`${kpis.sinAval}`}
            sub="sociedades sin fiador"
            color="#7c3aed"
            icon={<ShieldAlert size={15} />}
          />
          {esTabSinGarantia && (
            <KpiCard
              label="Campaña de Auditoría"
              valor={`${kpiCampaniaAuditoria.enviadas + kpiCampaniaAuditoria.datosRecibidos}`}
              sub={`${kpiCampaniaAuditoria.enviadas} enviada${kpiCampaniaAuditoria.enviadas === 1 ? '' : 's'} · ${kpiCampaniaAuditoria.datosRecibidos} con datos recibidos`}
              color="#009ee3"
              icon={<Mail size={15} />}
            />
          )}
        </div>

        {/* ── Filtros + registrar ──────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1" style={{ minWidth: '220px' }}>
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por contribuyente, cédula o ubicación..."
                className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-[12.5px] text-gray-700 focus:outline-none focus:border-blue-400 transition"
              />
            </div>
            {/* Filtro por vendedor (ago 2026): a diferencia del de fiador, éste SÍ
                aplica en los dos tabs -- acota tanto garantías activas como el
                tab Sin Garantía, ambos tienen vendedor_cod. */}
            <div className="relative">
              <User
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <select
                value={vendedorFiltro}
                onChange={(e) => setVendedorFiltro(e.target.value)}
                className={`${SELECT_CLS} pl-8`}
                style={{ minWidth: '190px' }}
              >
                <option value="">Vendedor: Todos</option>
                {vendedoresLista.map((v) => (
                  <option key={v.cod} value={v.cod}>
                    {v.nombre}
                  </option>
                ))}
              </select>
            </div>
            {/* El filtro de fiador no aplica al tab Sin Garantía -- ahí no hay
                garantías (ni fiadores) que filtrar, sólo clientes expuestos. */}
            {tabEstado !== 'SIN_GARANTIA' && (
              <select
                value={filtroFiador}
                onChange={(e) => setFiltroFiador(e.target.value as FiltroFiador)}
                className={SELECT_CLS}
                style={{ minWidth: '150px' }}
              >
                <option value="TODOS">Todo fiador</option>
                <option value="CON">Con fiador (Sí)</option>
                <option value="SIN">Sin fiador (No)</option>
              </select>
            )}
            {hayFiltros && (
              <button
                type="button"
                onClick={() => {
                  setBusqueda('');
                  setTabEstado('TODOS');
                  setFiltroFiador('TODOS');
                  setVendedorFiltro('');
                }}
                className="text-[11px] text-gray-400 hover:text-gray-600 px-1 transition-colors"
              >
                Limpiar
              </button>
            )}
            {/* Visibilidad global: todos los analistas ven todas las garantías por
                defecto (no sólo la suya) -- este toggle es sólo un acotador de
                conveniencia, nunca una restricción real de acceso. No aplica a
                COORDINADOR, que ya ve todo en el resto del sistema. */}
            {userRol === 'ANALISTA' && (
              <div
                className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50"
                role="group"
                aria-label="Alcance de garantías"
              >
                <button
                  type="button"
                  onClick={() => setVerSoloMiCartera(false)}
                  className="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors"
                  style={
                    verSoloMiCartera
                      ? { color: '#64748b' }
                      : { background: '#009ee3', color: '#fff' }
                  }
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setVerSoloMiCartera(true)}
                  className="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors"
                  style={
                    verSoloMiCartera
                      ? { background: '#009ee3', color: '#fff' }
                      : { color: '#64748b' }
                  }
                >
                  Mi cartera
                </button>
              </div>
            )}
            {!soloLectura && (
              <button
                onClick={() => {
                  setClienteParaRegistrar(null);
                  setShowSelector(true);
                }}
                className="ml-auto rounded-lg px-4 py-2 text-sm font-bold text-white shadow-sm hover:shadow-md transition-shadow"
                style={{ background: '#009ee3' }}
              >
                + Registrar Garantía
              </button>
            )}
          </div>
        </div>

        {/* ── Tabs de estado (reemplaza el select de custodia) ─────────── */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-2">
          <div className="flex flex-wrap">
            {TABS_ESTADO.map((t) => {
              const activo = tabEstado === t.key;
              // Tab "Sin Garantía" en rojo (riesgo) tanto activo como inactivo --
              // el resto sigue con el acento cyan estándar de los demás tabs.
              const colorBase = t.alerta ? '#dc2626' : '#009ee3';
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTabEstado(t.key)}
                  className="relative flex items-center gap-1.5 px-3.5 py-2.5 text-[12.5px] font-semibold transition-colors"
                  style={{ color: activo ? colorBase : t.alerta ? '#ef4444' : '#64748b' }}
                >
                  {t.alerta && <ShieldOff size={13} />}
                  {t.label}
                  <span
                    className="rounded-full px-1.5 text-[10.5px] font-bold"
                    style={{
                      background: activo
                        ? t.alerta
                          ? '#fee2e2'
                          : '#e6f4fb'
                        : t.alerta
                          ? '#fef2f2'
                          : '#f1f5f9',
                      color: activo ? colorBase : t.alerta ? '#ef4444' : '#94a3b8',
                    }}
                  >
                    {conteoTabs[t.key]}
                  </span>
                  {activo && (
                    <span
                      className="absolute inset-x-3 bottom-0 h-[2px] rounded-full"
                      style={{ background: colorBase }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sub-filtros de seguimiento (ago 2026): sólo dentro del tab "Sin
            Garantía" -- puntos de color en vez de emoji (SIC no usa emoji en
            su UI, ver ESTADO_SOLICITUD_BADGE) para distinguir Pendientes/Datos
            Recibidos/Expiradas de un vistazo. */}
        {esTabSinGarantia && (
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { key: 'TODOS', label: 'Todos', dot: null },
                { key: 'PENDIENTES', label: 'Pendientes de Respuesta', dot: '#d97706' },
                { key: 'DATOS_RECIBIDOS', label: 'Datos Recibidos', dot: '#1d4ed8' },
                { key: 'EXPIRADAS', label: 'Expiradas / Reenviar', dot: '#dc2626' },
              ] as const
            ).map((f) => {
              const activo = subFiltroSinGarantia === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setSubFiltroSinGarantia(f.key)}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-colors"
                  style={
                    activo
                      ? { background: '#003B5C', color: '#fff' }
                      : { background: '#fff', color: '#64748b', border: '1px solid #e2e8f0' }
                  }
                >
                  {f.dot && (
                    <span
                      className="inline-block rounded-full"
                      style={{ width: '6px', height: '6px', background: f.dot }}
                    />
                  )}
                  {f.label}
                  <span className="opacity-70">({conteoSubFiltroSinGarantia[f.key]})</span>
                </button>
              );
            })}
          </div>
        )}

        {accionError && (
          <div className="flex items-start justify-between gap-3 rounded-lg bg-red-50 px-3 py-2">
            <p className="text-sm text-red-600">{accionError}</p>
            <button
              onClick={() => setAccionError(null)}
              className="text-red-400 hover:text-red-600 shrink-0"
              aria-label="Cerrar"
            >
              <X size={14} />
            </button>
          </div>
        )}
        {accionAviso && (
          <div className="flex items-start justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2">
            <p className="text-sm text-amber-700">{accionAviso}</p>
            <button
              onClick={() => setAccionAviso(null)}
              className="text-amber-400 hover:text-amber-600 shrink-0"
              aria-label="Cerrar"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Sin Garantía NO debe scrollear horizontal (6 columnas, caben en el
            100% del ancho con table-layout:fixed) -- overflow-x-auto se
            reserva para la tabla normal (10 columnas angostas, sí necesita
            scroll en viewports chicos). */}
        <div
          className={`bg-white rounded-xl border border-slate-100 ${esTabSinGarantia ? 'overflow-hidden' : 'overflow-x-auto'}`}
        >
          <div className="px-4 py-2.5 border-b border-gray-100 bg-slate-50 flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              {esTabSinGarantia ? (
                <>
                  {totalActual} cliente{totalActual === 1 ? '' : 's'} sin garantía
                </>
              ) : (
                <>
                  {rowsFiltradas.length} garantía{rowsFiltradas.length === 1 ? '' : 's'}
                </>
              )}
              {hayFiltros && totalRowsSinFiltrar !== totalActual && (
                <span className="font-normal normal-case tracking-normal">
                  {' '}
                  de {totalRowsSinFiltrar}
                </span>
              )}
            </span>
            {esTabSinGarantia ? (
              <span className="text-[11px] text-gray-400">Ordenado por saldo consolidado ↓</span>
            ) : (
              <span className="text-[11px] text-gray-400">
                Ordenado por {COLUMNAS_HEADER.find((c) => c.key === sortConfig.key)?.label}{' '}
                {sortConfig.dir === 'asc' ? '↑' : '↓'}
              </span>
            )}
          </div>

          {esTabSinGarantia ? (
            // Anchos fijos en px para las 4 columnas angostas + 1 columna sin ancho
            // (Razón Social) que absorbe el resto -- con table-layout:fixed, un <col>
            // sin width explícito reparte el espacio restante del contenedor, así
            // que igual no queda franja vacía (a diferencia de fijar TODAS las
            // columnas en px, que si no suman exacto sí deja el hueco -- por eso NO
            // son clases Tailwind w-* sueltas sobre <td>: no aplican con layout fijo,
            // ver regla del CLAUDE.md sobre tablas densas).
            // "Riesgo" (ago 2026): semáforo de mora por tramo, mismo criterio que la
            // Cola del analista (CLAUDE.md §8) -- ver fn_garantias_clientes_sin_garantia.
            // Ancho angosto y centrado porque sólo lleva un badge de 5-6 caracteres.
            // Sin columna de "límite de crédito" (esa nunca existió en este tab).
            // Sin minWidth a propósito (a diferencia de la tabla normal): debe
            // encajar en el 100% del ancho disponible sin scroll horizontal, en
            // cualquier viewport -- table-layout:fixed comprime las columnas
            // proporcionalmente en vez de desbordar.
            <table style={{ tableLayout: 'fixed', width: '100%', borderCollapse: 'collapse' }}>
              <colgroup>
                <col style={{ width: '13%' }} />
                <col />
                <col style={{ width: '16%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '21%' }} />
              </colgroup>
              <thead>
                <tr style={{ background: '#f0f4f8', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: 0 }}>
                    <span className="block px-3 py-2.5" style={HEADER_TEXT_STYLE}>
                      Cédula
                    </span>
                  </th>
                  <th style={{ padding: 0 }}>
                    <span className="block px-3 py-2.5" style={HEADER_TEXT_STYLE}>
                      Razón Social
                    </span>
                  </th>
                  <th style={{ padding: 0, textAlign: 'right' }}>
                    <span className="block px-3 py-2.5 pr-6 text-right" style={HEADER_TEXT_STYLE}>
                      Saldo Consolidado
                    </span>
                  </th>
                  <th style={{ padding: 0, textAlign: 'center' }}>
                    <span className="block px-3 py-2.5 text-center" style={HEADER_TEXT_STYLE}>
                      Riesgo
                    </span>
                  </th>
                  <th style={{ padding: 0 }}>
                    <span className="block px-3 py-2.5" style={HEADER_TEXT_STYLE}>
                      Vendedor Responsable
                    </span>
                  </th>
                  <th style={{ padding: 0, textAlign: 'right' }}>
                    <span className="block px-3 py-2.5 pr-2 text-right" style={HEADER_TEXT_STYLE}>
                      Acciones
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sinGarantiaPagina.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        padding: '32px',
                        textAlign: 'center',
                        fontSize: '12px',
                        color: '#94a3b8',
                      }}
                    >
                      {busqueda.trim() !== ''
                        ? 'Ningún cliente coincide con la búsqueda'
                        : 'Todos los clientes activos tienen garantía registrada'}
                    </td>
                  </tr>
                )}
                {sinGarantiaPagina.map((c) => (
                  <tr
                    key={c.contribuyente}
                    className="transition-colors hover:bg-slate-50/70"
                    style={{ borderTop: '1px solid #f1f5f9' }}
                  >
                    <td
                      style={{
                        ...TD,
                        textAlign: 'left',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        color: '#475569',
                      }}
                    >
                      {c.contribuyente}
                    </td>
                    <td style={{ ...TD, textAlign: 'left' }}>
                      <div
                        className="truncate"
                        style={{ fontWeight: 500, color: '#1a202c', maxWidth: '100%' }}
                        title={c.cliente_nombre}
                      >
                        {c.cliente_nombre}
                      </div>
                      {c.n_codigos > 1 && (
                        <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                          {c.n_codigos} códigos de cliente
                        </div>
                      )}
                    </td>
                    <td
                      style={{
                        ...TD,
                        textAlign: 'right',
                        paddingRight: '24px',
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 700,
                        color: '#dc2626',
                      }}
                    >
                      {fmtCRC(c.saldo_consolidado)}
                    </td>
                    <td style={{ ...TD, textAlign: 'center' }}>
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          padding: '3px 10px',
                          borderRadius: '6px',
                          whiteSpace: 'nowrap',
                          background: SEMAFORO_COLOR[c.riesgo].bg,
                          color: SEMAFORO_COLOR[c.riesgo].text,
                        }}
                      >
                        {RIESGO_LABEL[c.riesgo]}
                      </span>
                    </td>
                    {/* whitespace-normal (SIN truncate): el nombre del vendedor
                        nunca debe cortarse, a costa de que la fila crezca en
                        alto si el nombre es largo -- decisión explícita. */}
                    <td
                      style={{ ...TD, textAlign: 'left', color: '#4b5563', whiteSpace: 'normal' }}
                    >
                      {c.vendedor_nombre}
                    </td>
                    <td style={{ ...TD, textAlign: 'right', padding: '8px 8px 8px 4px' }}>
                      <div className="flex flex-row items-center justify-end gap-1.5 flex-wrap">
                        {(() => {
                          const solicitud = solicitudesPorContribuyente.get(c.contribuyente);

                          // Gerencia ve Sin Garantía en solo lectura, para
                          // supervisión -- solo el estado, sin botones de acción.
                          if (soloLectura) {
                            if (!solicitud) {
                              return (
                                <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                                  Sin solicitud
                                </span>
                              );
                            }
                            const badge = ESTADO_SOLICITUD_BADGE[solicitud.estado];
                            return (
                              <span
                                style={{
                                  fontSize: '10.5px',
                                  fontWeight: 700,
                                  padding: '3px 9px',
                                  borderRadius: '6px',
                                  background: badge.bg,
                                  color: badge.text,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {ESTADO_SOLICITUD_LABEL[solicitud.estado]}
                              </span>
                            );
                          }

                          // Sin solicitud viva (o EXPIRADA/CANCELADA, que no
                          // cuentan como viva -- ver fetchSolicitudes): par de
                          // botones "Emitir" + "Solicitar", fila compacta.
                          if (!solicitud) {
                            return (
                              <>
                                <button
                                  type="button"
                                  onClick={() => abrirRegistroDesdeSinGarantia(c)}
                                  className="inline-flex items-center gap-1 rounded-lg py-1 px-2.5 text-xs font-semibold whitespace-nowrap transition-colors hover:opacity-90"
                                  style={{
                                    background: '#dc2626',
                                    border: '1px solid #dc2626',
                                    color: '#fff',
                                  }}
                                >
                                  <Plus size={12} /> Emitir
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSolicitandoPara(c)}
                                  className="inline-flex items-center gap-1 rounded-lg py-1 px-2.5 text-xs font-semibold whitespace-nowrap transition-colors hover:bg-cyan-50"
                                  style={{
                                    background: '#fff',
                                    border: '1px solid #009ee3',
                                    color: '#009ee3',
                                  }}
                                >
                                  <Mail size={12} /> Solicitar
                                </button>
                              </>
                            );
                          }

                          if (solicitud.estado === 'ENVIADA') {
                            const cancelando = cancelandoId === solicitud.id;
                            return (
                              <>
                                <span
                                  className="whitespace-nowrap"
                                  style={{
                                    fontSize: '10.5px',
                                    fontWeight: 700,
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    background: '#fef3c7',
                                    color: '#d97706',
                                  }}
                                  title={`${solicitud.correo_destino ?? 'correo no registrado'} · enviada ${fmtFechaHora(solicitud.enviada_en)}`}
                                >
                                  Enviada ({fmtFecha(solicitud.enviada_en).slice(0, 5)})
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setReenviandoPara({ cliente: c, solicitud })}
                                  title="Reenviar / Editar Correo"
                                  className="inline-flex items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-slate-100"
                                  style={{ border: '1px solid #cbd5e1', color: '#475569' }}
                                >
                                  <RotateCw size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => cancelarSolicitud(solicitud)}
                                  disabled={cancelando}
                                  title="Cancelar Solicitud"
                                  className="inline-flex items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-red-50 disabled:opacity-60"
                                  style={{ border: '1px solid #fecaca', color: '#dc2626' }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </>
                            );
                          }

                          if (solicitud.estado === 'DATOS_RECIBIDOS') {
                            const cancelando = cancelandoId === solicitud.id;
                            return (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setRevisandoId(solicitud.id)}
                                  className="inline-flex items-center gap-1 rounded-lg py-1 px-2.5 text-xs font-semibold whitespace-nowrap transition-colors hover:opacity-90"
                                  style={{
                                    background: '#009ee3',
                                    border: '1px solid #009ee3',
                                    color: '#fff',
                                  }}
                                >
                                  Revisar Datos
                                </button>
                                <button
                                  type="button"
                                  onClick={() => cancelarSolicitud(solicitud)}
                                  disabled={cancelando}
                                  title="Cancelar Solicitud"
                                  className="inline-flex items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-red-50 disabled:opacity-60"
                                  style={{ border: '1px solid #fecaca', color: '#dc2626' }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </>
                            );
                          }
                          // APROBADA con garantia_id todavía null: los datos ya se
                          // guardaron en personas_legales, pero ModalEmitirPagare se
                          // canceló o no terminó -- se ofrece retomar en vez de
                          // volver a "Solicitar Actualización" (ver comentario en
                          // fetchSolicitudes sobre por qué esto no se filtra afuera).
                          if (solicitud.estado === 'APROBADA') {
                            const reanudando = reanudandoId === solicitud.id;
                            return (
                              <button
                                type="button"
                                onClick={() => reanudarPagareDesdeSolicitud(solicitud)}
                                disabled={reanudando}
                                className="inline-flex items-center gap-1.5 rounded-lg py-1 px-2.5 text-xs font-semibold whitespace-nowrap transition-colors hover:opacity-90 disabled:opacity-60"
                                style={{
                                  background: '#16a34a',
                                  border: '1px solid #16a34a',
                                  color: '#fff',
                                }}
                              >
                                {reanudando ? 'Cargando...' : 'Retomar — Generar Pagaré'}
                              </button>
                            );
                          }
                          const badge = ESTADO_SOLICITUD_BADGE[solicitud.estado];
                          return (
                            <span
                              style={{
                                fontSize: '10.5px',
                                fontWeight: 700,
                                padding: '3px 9px',
                                borderRadius: '6px',
                                background: badge.bg,
                                color: badge.text,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {ESTADO_SOLICITUD_LABEL[solicitud.estado]}
                            </span>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table
              style={{
                tableLayout: 'fixed',
                width: '100%',
                borderCollapse: 'collapse',
                minWidth: TABLE_MIN_WIDTH,
              }}
            >
              <colgroup>
                {COLS.map((w, i) => (
                  <col key={i} style={{ width: `${w}px` }} />
                ))}
              </colgroup>
              <thead>
                <tr style={{ background: '#f0f4f8', borderBottom: '1px solid #e2e8f0' }}>
                  {COLUMNAS_HEADER.map((c, i) => {
                    const activo = sortConfig.key === c.key;
                    const align = c.align ?? 'left';
                    return (
                      <th key={i} style={{ padding: 0, textAlign: align }}>
                        {c.key ? (
                          <button
                            type="button"
                            onClick={() => handleSort(c.key!)}
                            className="inline-flex w-full items-center gap-1 px-3 py-2.5 hover:text-[#009ee3] transition-colors"
                            style={{
                              ...HEADER_TEXT_STYLE,
                              color: activo ? '#009ee3' : HEADER_TEXT_STYLE.color,
                              justifyContent:
                                align === 'right'
                                  ? 'flex-end'
                                  : align === 'center'
                                    ? 'center'
                                    : 'flex-start',
                            }}
                          >
                            {c.label}
                            {activo ? (
                              sortConfig.dir === 'asc' ? (
                                <ArrowUp size={11} />
                              ) : (
                                <ArrowDown size={11} />
                              )
                            ) : (
                              <ArrowUpDown size={11} className="opacity-40" />
                            )}
                          </button>
                        ) : (
                          <span className="block px-3 py-2.5" style={HEADER_TEXT_STYLE}>
                            {c.label}
                          </span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rowsPagina.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      style={{
                        padding: '32px',
                        textAlign: 'center',
                        fontSize: '12px',
                        color: '#94a3b8',
                      }}
                    >
                      {hayFiltros
                        ? 'Ninguna garantía coincide con los filtros'
                        : 'Sin garantías registradas'}
                    </td>
                  </tr>
                )}
                {rowsPagina.map((r) => {
                  const sem = SEMAFORO_COLOR[r.semaforo];
                  const dias = diasParaVencer(r.fecha_vencimiento);
                  const porVencer = !r.vencido && dias <= DIAS_ALERTA_VENCIMIENTO;
                  const badge = r.vencido ? BADGE_VENCIDO : CUSTODIA_BADGE[r.estado_custodia];
                  const btn = botonPrincipal(r);
                  return (
                    <tr
                      key={r.id}
                      className="transition-colors hover:bg-slate-50/70"
                      style={{ borderTop: '1px solid #f1f5f9' }}
                    >
                      <td style={TD}>
                        {/* truncate: 1 sola línea con elipsis -- nombres largos ya no
                          estiran la fila (antes: line-clamp-2 de 2 líneas). */}
                        <div
                          className="truncate"
                          style={{ fontWeight: 600, color: '#1a202c', maxWidth: '20rem' }}
                          title={r.cliente_nombre}
                        >
                          {r.cliente_nombre}
                        </div>
                        <div
                          className="truncate"
                          style={{ fontSize: '10.5px', color: '#94a3b8', maxWidth: '20rem' }}
                        >
                          {r.contribuyente}
                        </div>
                      </td>
                      <td
                        style={{
                          ...TD,
                          fontFamily: 'monospace',
                          fontSize: '11px',
                          color: '#475569',
                        }}
                      >
                        {r.consecutivo}
                      </td>
                      <td style={TD}>{r.tipo_titulo}</td>
                      <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtCRC(r.monto_garantizado)}
                      </td>
                      <td style={{ ...TD, textAlign: 'center' }}>
                        <span
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '20px',
                            background: r.tiene_fiador ? '#e6f4ea' : '#f1f5f9',
                            color: r.tiene_fiador ? '#16a34a' : '#64748b',
                          }}
                        >
                          {r.tiene_fiador ? 'SÍ' : 'NO'}
                        </span>
                      </td>
                      <td
                        style={TD}
                        title={`${EXPLICACION_SEMAFORO[r.semaforo]} — Garantía ${fmtCRC(r.monto_garantizado)} · saldo ${fmtCRC(r.saldo_contribuyente)} · objetivo ${fmtCRC(r.monto_objetivo)}`}
                      >
                        <BarraCobertura pct={r.cobertura_pct} color={sem.text} />
                      </td>
                      <td
                        style={{
                          ...TD,
                          color: r.vencido ? '#dc2626' : porVencer ? '#d97706' : '#334155',
                          fontWeight: r.vencido || porVencer ? 600 : 400,
                        }}
                      >
                        {fmtFecha(r.fecha_vencimiento)}
                        {porVencer && (
                          <div style={{ fontSize: '9.5px', fontWeight: 600, color: '#d97706' }}>
                            {dias <= 0 ? 'vence hoy' : `en ${dias} día${dias === 1 ? '' : 's'}`}
                          </div>
                        )}
                      </td>
                      <td style={TD} title={r.ubicacion_archivero}>
                        <span className="line-clamp-2 leading-snug">{r.ubicacion_archivero}</span>
                      </td>
                      <td style={TD}>
                        <span
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 700,
                            padding: '3px 9px',
                            borderRadius: '6px',
                            background: badge.bg,
                            color: badge.text,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {r.vencido ? 'VENCIDO' : ESTADO_CUSTODIA_LABEL[r.estado_custodia]}
                        </span>
                        {/* Vencido sobrescribe el badge, pero si el papel no está en bóveda
                          hay que seguir viendo dónde está -- son justo los que hay que
                          perseguir. */}
                        {r.vencido && r.estado_custodia !== 'EN_BOVEDA' && (
                          <div
                            style={{
                              fontSize: '9.5px',
                              fontWeight: 600,
                              color: '#94a3b8',
                              marginTop: '3px',
                            }}
                          >
                            {ESTADO_CUSTODIA_LABEL[r.estado_custodia]}
                          </div>
                        )}
                      </td>

                      {/* ── Acciones: 1 botón dinámico + menú "..." de opciones secundarias ── */}
                      <td style={{ ...TD, paddingRight: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {btn ? (
                            <button
                              onClick={btn.onClick}
                              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap transition-colors hover:opacity-90"
                              style={
                                btn.primario
                                  ? {
                                      background: '#009ee3',
                                      border: '1px solid #009ee3',
                                      color: '#fff',
                                    }
                                  : {
                                      background: '#fff',
                                      border: '1px solid #cbd5e1',
                                      color: '#475569',
                                    }
                              }
                              title={btn.label}
                            >
                              <btn.Icono size={12} /> {btn.label}
                            </button>
                          ) : (
                            <span
                              style={{ fontSize: '10.5px', color: '#a0aec0', whiteSpace: 'nowrap' }}
                              title="Una garantía vencida se reemplaza registrando una nueva para el mismo contribuyente"
                            >
                              Registrar sustitución
                            </span>
                          )}

                          <MenuFila
                            row={r}
                            subiendoPdf={subiendoPdf.has(r.id)}
                            despachando={procesando.has(r.id)}
                            soloLectura={soloLectura}
                            onEditar={() => setEditando(r)}
                            onHistorial={() => setViendoHistorial(r)}
                            onVerPagare={() => abrirPagare(r)}
                            onSubirPdf={(file) => subirPdf(r, file)}
                            onDespachar={() => ejecutarAccion(r, 'ENTREGAR')}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* ── Paginación (compartida entre ambas tablas) ──────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-4 py-2.5">
            <span className="text-[11.5px] text-gray-500">
              {totalActual === 0
                ? `Mostrando 0 de 0 ${esTabSinGarantia ? 'clientes' : 'garantías'}`
                : `Mostrando ${(pagina - 1) * porPagina + 1}-${Math.min(pagina * porPagina, totalActual)} de ${totalActual} ${esTabSinGarantia ? `cliente${totalActual === 1 ? '' : 's'}` : `garantía${totalActual === 1 ? '' : 's'}`}`}
            </span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[11.5px] text-gray-500">
                Por página
                <select
                  value={porPagina}
                  onChange={(e) => setPorPagina(Number(e.target.value) as PorPagina)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11.5px] text-gray-700 focus:outline-none focus:border-blue-400"
                >
                  {TAMANOS_PAGINA.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={pagina <= 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11.5px] font-semibold text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                >
                  <ChevronLeft size={13} /> Anterior
                </button>
                <span className="px-1.5 text-[11.5px] text-gray-400">
                  {pagina} / {totalPaginasActual}
                </span>
                <button
                  type="button"
                  onClick={() => setPagina((p) => Math.min(totalPaginasActual, p + 1))}
                  disabled={pagina >= totalPaginasActual}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11.5px] font-semibold text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                >
                  Siguiente <ChevronRight size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showSelector && (
        <ModalSelectorTipoRegistro
          onClose={() => {
            setShowSelector(false);
            setClienteParaRegistrar(null);
          }}
          onSeleccionar={(opcion) => {
            setShowSelector(false);
            if (opcion === 'EXISTENTE') setShowModal(true);
            else setEmitiendoNueva(true);
          }}
        />
      )}

      {showModal && (
        <ModalRegistrarGarantia
          origenRegistro="EXISTENTE_FISICA"
          clientePreseleccionado={clienteParaRegistrar ?? undefined}
          onClose={() => {
            setShowModal(false);
            setClienteParaRegistrar(null);
          }}
          onSuccess={() => {
            setShowModal(false);
            setClienteParaRegistrar(null);
            fetchData();
            fetchSinGarantia();
          }}
        />
      )}

      {/* "Emitir Nuevo Pagaré Oficial" (ago 2026): fusión de 3 pasos en 1 --
          antes encadenaba ModalRegistrarGarantia -> ModalGenerarPagare ->
          ModalConfirmarEnvioVendedor. ModalEmitirPagare hace las 3 llamadas
          (crear garantía, generar pagaré, despachar a vendedor) y sólo llama
          a onExito cuando las 3 terminaron bien -- recién ahí se refresca la
          tabla y se navega a imprimir. clientePreseleccionado viene del tab
          "Sin Garantía" (null si se entró por el botón genérico "+ Registrar
          Garantía"). */}
      {emitiendoNueva && (
        <ModalEmitirPagare
          clientePreseleccionado={clienteParaRegistrar ?? undefined}
          representanteLegalPrellenado={representantePrellenado ?? undefined}
          onClose={() => {
            setEmitiendoNueva(false);
            setClienteParaRegistrar(null);
            setRepresentantePrellenado(null);
          }}
          onExito={async (nuevaId) => {
            setEmitiendoNueva(false);
            setClienteParaRegistrar(null);
            setRepresentantePrellenado(null);
            await fetchData({ silent: true });
            await fetchSinGarantia();
            router.push(`/pagare/${nuevaId}`);
          }}
        />
      )}

      {solicitandoPara && (
        <ModalSolicitarActualizacion
          contribuyente={solicitandoPara.contribuyente}
          clienteNombre={solicitandoPara.cliente_nombre}
          correoSugerido=""
          onClose={() => setSolicitandoPara(null)}
          onEnviado={() => {
            setSolicitandoPara(null);
            fetchSolicitudes((clientesSinGarantia ?? []).map((c) => c.contribuyente));
          }}
        />
      )}

      {reenviandoPara && (
        <ModalSolicitarActualizacion
          solicitudId={reenviandoPara.solicitud.id}
          contribuyente={reenviandoPara.cliente.contribuyente}
          clienteNombre={reenviandoPara.cliente.cliente_nombre}
          correoSugerido={reenviandoPara.solicitud.correo_destino ?? ''}
          onClose={() => setReenviandoPara(null)}
          onEnviado={() => {
            setReenviandoPara(null);
            fetchSolicitudes((clientesSinGarantia ?? []).map((c) => c.contribuyente));
          }}
        />
      )}

      {revisandoId && (
        <ModalRevisarActualizacion
          solicitudId={revisandoId}
          onClose={() => {
            setRevisandoId(null);
            fetchSolicitudes((clientesSinGarantia ?? []).map((c) => c.contribuyente));
          }}
          onAprobado={(datos) => {
            const solicitud = [...solicitudesPorContribuyente.values()].find(
              (s) => s.id === revisandoId,
            );
            setRevisandoId(null);
            if (solicitud) {
              setClienteParaRegistrar({
                contribuyente: solicitud.contribuyente,
                cliente_nombre: solicitud.cliente_nombre,
                n_codigos: 1,
              });
              if (solicitud.tipo_persona === 'JURIDICA')
                setRepresentantePrellenado({ nombre: datos.nombre, cedula: datos.cedula });
              setEmitiendoNueva(true);
            }
            fetchSolicitudes((clientesSinGarantia ?? []).map((c) => c.contribuyente));
          }}
        />
      )}

      {/* Mismo modal en modo edición (PATCH). La `key` fuerza el remonte al
          cambiar de garantía, para que los campos se reinicialicen con los
          valores de la fila nueva en vez de conservar el estado anterior. */}
      {editando && (
        <ModalRegistrarGarantia
          key={editando.id}
          garantia={editando}
          onClose={() => setEditando(null)}
          onSuccess={() => {
            setEditando(null);
            fetchData({ silent: true });
          }}
        />
      )}

      {generandoPagare && (
        <ModalGenerarPagare
          garantia={generandoPagare}
          onClose={() => setGenerandoPagare(null)}
          onSuccess={() => alGenerarPagareExitoso(generandoPagare)}
        />
      )}

      {confirmandoEnvio && (
        <ModalConfirmarEnvioVendedor
          garantia={confirmandoEnvio}
          onOmitir={() => {
            const id = confirmandoEnvio.id;
            setConfirmandoEnvio(null);
            router.push(`/pagare/${id}`);
          }}
          onConfirmado={() => {
            const id = confirmandoEnvio.id;
            setConfirmandoEnvio(null);
            fetchData({ silent: true });
            router.push(`/pagare/${id}`);
          }}
        />
      )}

      {confirmandoRecepcion && (
        <ModalConfirmarRecepcion
          garantia={confirmandoRecepcion}
          onClose={() => setConfirmandoRecepcion(null)}
          onConfirmado={() => {
            setConfirmandoRecepcion(null);
            fetchData({ silent: true });
          }}
        />
      )}

      {viendoHistorial && (
        <ModalHistorialGarantia
          garantia={viendoHistorial}
          onClose={() => setViendoHistorial(null)}
        />
      )}
    </div>
  );
}
