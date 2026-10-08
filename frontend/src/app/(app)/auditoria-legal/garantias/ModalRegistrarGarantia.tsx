'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { X, FileSignature, Search, Loader2, Pencil, Save } from 'lucide-react';
import { useGarantiaFormController } from '@/views/auditoria-legal/hooks/use-garantia-form-controller';
import { fmtCRC } from '@/lib/utils/formato';
import {
  MUEBLES_ARCHIVO,
  GAVETAS_ARCHIVO,
  TOPE_GARANTIAS_POR_CARPETA,
} from '@/lib/auditoria-legal/ubicacion-archivo';
import { ESTADO_CUSTODIA_LABEL } from '@/lib/auditoria-legal/catalogo';
import type {
  ContribuyenteBusqueda,
  SaldoContribuyente,
  HaciendaData,
  TipoTitulo,
  GarantiaListaRow,
  OrigenRegistroGarantia,
  RegistrarGarantiaPayload,
  EditarGarantiaPayload,
} from '@/types/auditoria-legal';

export interface ModalRegistrarGarantiaProps {
  onClose: () => void;
  /** En alta, recibe el id de la garantía recién creada (la API ya lo devuelve) -- lo usa el flujo "Emitir Nueva Garantía" para encadenar directo a Generar Pagaré. En edición no se manda id. */
  onSuccess: (nuevaId?: number) => void;
  /** Si viene, el modal trabaja en modo EDICIÓN sobre esa garantía (PATCH). */
  garantia?: GarantiaListaRow;
  /** Si viene, bloquea el Tipo de Título en este valor y oculta el selector -- usado por "Emitir Nueva Garantía (Pagaré Oficial)", que no tiene sentido con Letra de Cambio. */
  tipoTituloFijo?: TipoTitulo;
  /** Sólo en alta -- de qué opción de ModalSelectorTipoRegistro viene. Por defecto 'EMITIDO_SISTEMA'. */
  origenRegistro?: OrigenRegistroGarantia;
  /** Si viene (desde el tab "Sin Garantía"), se salta el buscador -- arranca
   *  directo con este cliente ya elegido, igual que si lo hubiera buscado a mano. */
  clientePreseleccionado?: ContribuyenteBusqueda;
}

// Los dos únicos valores que admite el CHECK garantias_tipo_titulo_check.
// NO agregar Prenda / Hipoteca: la BD los rechaza.
const TIPOS: TipoTitulo[] = ['Pagaré', 'Letra de Cambio'];

const LABEL = 'block text-[11px] font-bold text-gray-500 uppercase mb-1';
const INPUT =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition';
const HINT = 'mt-1 text-[11px] leading-snug text-gray-400';

interface GarantiaActivaPrevia {
  tipo_titulo: string;
  monto_garantizado: number;
}
interface HaciendaResp {
  data: HaciendaData | null;
  notFound: boolean;
  error: boolean;
}

// La API de Hacienda devuelve los flags de situación tributaria como 'SI'/'NO'
// (strings), no como booleanos -- se acepta también boolean por si cambia.
const esSi = (v: unknown): boolean =>
  typeof v === 'string' ? v.trim().toUpperCase() === 'SI' : v === true;

// ── Máscara de monto ──────────────────────────────────────────────────
// El equipo digita montos largos (₡5.500.000) y necesita ver los miles
// separados mientras escribe. Se guarda el texto formateado en el estado y se
// convierte a número sólo al enviar. Punto como separador de miles, igual que
// fmtCRC() -- NUNCA toLocaleString() (produce espacios en algunos browsers).
const MAX_DIGITOS = 15;

function agruparMiles(digitos: string): string {
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** '5.500.000' -> 5500000 · '' -> NaN */
function montoANumero(texto: string): number {
  const d = texto.replace(/\./g, '');
  return d.length ? Number(d) : NaN;
}

/** Normaliza cualquier texto digitado/pegado a '1.234.567'. */
function normalizarMonto(texto: string): string {
  const digitos = texto
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, MAX_DIGITOS);
  return agruparMiles(digitos);
}

/** Fecha de la BD ('2026-07-30' o timestamptz) al value de un <input type="date">. */
function aFechaInput(v: string | null | undefined): string {
  const m = v ? /^(\d{4}-\d{2}-\d{2})/.exec(v) : null;
  return m ? m[1] : '';
}

/** '2026-03-15' -> '2027-03-15' (+12 meses exactos, sugerencia de vencimiento). */
function sumarUnAnio(fechaISO: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaISO);
  if (!m) return '';
  const [, anio, mes, dia] = m;
  const d = new Date(Number(anio) + 1, Number(mes) - 1, Number(dia));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ModalRegistrarGarantia({
  onClose,
  onSuccess,
  garantia,
  tipoTituloFijo,
  origenRegistro,
  clientePreseleccionado,
}: ModalRegistrarGarantiaProps) {
  const esEdicion = !!garantia;
  // La ubicación estructurada sólo se puede capturar/editar mientras el título
  // está físicamente en bóveda -- en alta siempre es el caso (ya no hay forma
  // de arrancar en otro estado desde la UI); en edición depende del estado
  // REAL de la garantía, no de un estado local (antes este modal usaba un
  // estado local que siempre arrancaba en 'EN_BOVEDA' aunque se estuviera
  // editando una garantía Enviada a Vendedor -- este chequeo lo corrige de paso).
  const puedeEditarUbicacion = !esEdicion || garantia?.estado_custodia === 'EN_BOVEDA';

  // ── Selección de cliente ────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState<ContribuyenteBusqueda[]>([]);
  const [buscando, setBuscando] = useState(false);
  // En edición el contribuyente es la identidad de la garantía: se precarga y
  // queda bloqueado (cambiarlo sería otra garantía y choca con el índice único
  // parcial garantias_contribuyente_idx).
  const [sel, setSel] = useState<ContribuyenteBusqueda | null>(
    garantia
      ? {
          contribuyente: garantia.contribuyente,
          cliente_nombre: garantia.cliente_nombre,
          n_codigos: 1,
        }
      : null,
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);
  // Secuencia de las 3 consultas de contexto: si el usuario cambia de cliente
  // antes de que respondan, las respuestas viejas se descartan (si no, podría
  // quedar el estado de Hacienda o la garantía previa del cliente anterior).
  const ctxSeqRef = useRef(0);
  const api = useGarantiaFormController();

  // ── Contexto que se carga al seleccionar el cliente ──────────────────
  const [hacienda, setHacienda] = useState<HaciendaData | null>(null);
  // En edición el saldo/objetivo ya vienen en la fila -> no hace falta el RPC.
  const [saldo, setSaldo] = useState<SaldoContribuyente | null>(
    garantia
      ? { saldo_actual: garantia.saldo_contribuyente, monto_objetivo: garantia.monto_objetivo }
      : null,
  );
  const [previa, setPrevia] = useState<GarantiaActivaPrevia | null>(null);

  // ── Campos del formulario ───────────────────────────────────────────
  const [tipoTitulo, setTipoTitulo] = useState<TipoTitulo>(
    tipoTituloFijo ?? garantia?.tipo_titulo ?? 'Pagaré',
  );
  const [monto, setMonto] = useState(
    garantia ? agruparMiles(String(Math.round(garantia.monto_garantizado))) : '',
  );
  const [tieneFiador, setTieneFiador] = useState(garantia?.tiene_fiador ?? false);
  const [fiadorNombre, setFiadorNombre] = useState(garantia?.fiador_nombre ?? '');
  const [fiadorCedula, setFiadorCedula] = useState(garantia?.fiador_cedula ?? '');
  const [fiadorTelefono, setFiadorTelefono] = useState(garantia?.fiador_telefono ?? '');
  const [representante, setRepresentante] = useState(garantia?.representante_legal ?? '');
  const [fechaEmision, setFechaEmision] = useState(aFechaInput(garantia?.fecha_emision));
  const [fechaVencimiento, setFechaVencimiento] = useState(
    aFechaInput(garantia?.fecha_vencimiento),
  );
  // Ubicación estructurada (Spec 3): mueble/gaveta se precargan del valor guardado
  // en edición; en alta arrancan vacíos (select placeholder).
  const [mueble, setMueble] = useState(garantia?.ubicacion_archivero_mueble ?? '');
  const [gaveta, setGaveta] = useState(garantia?.ubicacion_archivero_gaveta ?? '');
  const [carpeta, setCarpeta] = useState(
    garantia?.ubicacion_archivero_carpeta ? String(garantia.ubicacion_archivero_carpeta) : '',
  );
  // Tope de 25 garantías por carpeta (Spec, ago 2026): se consulta en vivo
  // (debounce 300ms, mismo patrón que Hacienda/saldo) apenas los 3 campos de
  // ubicación están completos. null = todavía no se consultó o el RPC falló
  // (no bloquea la captura -- el submit igual valida server-side).
  const [conteoCarpeta, setConteoCarpeta] = useState<number | null>(null);
  const [buscandoSiguienteCarpeta, setBuscandoSiguienteCarpeta] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Caret del input de monto: al reformatear con puntos el string cambia de
  // largo, así que hay que reponer el cursor donde estaba el mismo dígito.
  const montoRef = useRef<HTMLInputElement | null>(null);
  const caretRef = useRef<number | null>(null);
  // El efecto NO puede depender de `monto`: si el texto formateado queda igual
  // al que ya había (caso típico: Backspace sobre un separador de miles, que
  // borra el punto y al reformatear vuelve a quedar idéntico), React hace
  // bailout y el efecto no corre -- pero sí reescribe node.value para
  // sincronizar el input controlado, y asignar .value manda el caret al final.
  // El usuario quedaba con el cursor al final y el siguiente Backspace le
  // borraba el último dígito del monto. Este contador fuerza que el efecto
  // corra en cada tecleo, cambie o no el string.
  const [caretTick, setCaretTick] = useState(0);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  // useLayoutEffect y no useEffect: reposiciona el caret antes del paint, para
  // que no se vea el salto al final.
  useLayoutEffect(() => {
    if (caretRef.current === null || !montoRef.current) return;
    const pos = caretRef.current;
    caretRef.current = null;
    montoRef.current.setSelectionRange(pos, pos);
  }, [caretTick]);

  // En edición no hay buscador (el contribuyente está fijo), así que la consulta
  // a Hacienda -- útil como contexto de riesgo -- se dispara al abrir el modal.
  useEffect(() => {
    if (!garantia) return;
    const seq = ++ctxSeqRef.current;
    api
      .hacienda(garantia.contribuyente)
      .then((j: HaciendaResp) => {
        if (seq === ctxSeqRef.current && !j.error && !j.notFound && j.data) setHacienda(j.data);
      })
      .catch(() => {
        /* Hacienda caída -- nunca bloquea la edición */
      });
  }, [garantia, api]);

  // Conteo en vivo de la carpeta elegida -- se recalcula cada vez que cambia
  // cualquiera de los 3 campos. p_excluir_id excluye esta misma garantía en
  // edición (si no, se contaría a sí misma al re-guardar sin mover nada).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!puedeEditarUbicacion || !mueble || !gaveta || !carpeta.trim()) {
      setConteoCarpeta(null);
      return;
    }
    const carpetaNum = Number(carpeta);
    if (!Number.isInteger(carpetaNum) || carpetaNum <= 0) {
      setConteoCarpeta(null);
      return;
    }
    let cancelado = false;
    const t = setTimeout(async () => {
      try {
        const data = await api.conteoCarpeta(mueble, gaveta, carpetaNum, garantia?.id ?? null);
        if (!cancelado) setConteoCarpeta(data.conteo);
      } catch {
        /* silencioso -- el submit igual valida server-side */
      }
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [mueble, gaveta, carpeta, puedeEditarUbicacion, garantia?.id, api]);

  const carpetaLlena = conteoCarpeta !== null && conteoCarpeta >= TOPE_GARANTIAS_POR_CARPETA;

  // "Usar Carpeta N.° siguiente disponible" -- busca la primera carpeta libre
  // desde la actual (o desde 1 si aún no hay número) en el mismo Mueble+Gaveta.
  async function usarSiguienteCarpetaDisponible() {
    if (!mueble || !gaveta) return;
    setBuscandoSiguienteCarpeta(true);
    try {
      const desde = Number(carpeta) || 1;
      const data = await api.siguienteCarpeta(mueble, gaveta, desde).catch(() => null);
      if (data?.carpeta) {
        setCarpeta(String(data.carpeta));
        setConteoCarpeta(null);
      }
    } finally {
      setBuscandoSiguienteCarpeta(false);
    }
  }

  // ── Monto con máscara de miles ──────────────────────────────────────
  function handleMonto(e: React.ChangeEvent<HTMLInputElement>) {
    const crudo = e.target.value;
    const caret = e.target.selectionStart ?? crudo.length;
    const digitosCrudos = crudo.replace(/\D/g, '');
    // Cuántos dígitos quedaban a la izquierda del cursor en lo que se digitó/pegó.
    let digitosAntes = crudo.slice(0, caret).replace(/\D/g, '').length;
    // Los ceros a la izquierda y el excedente de largo se descartan: el cursor
    // se corre en consecuencia para no quedar apuntando a un dígito que ya no está.
    const sinCeros = digitosCrudos.replace(/^0+(?=\d)/, '');
    digitosAntes = Math.max(0, digitosAntes - (digitosCrudos.length - sinCeros.length));
    const digitos = sinCeros.slice(0, MAX_DIGITOS);
    digitosAntes = Math.min(digitosAntes, digitos.length);

    const formateado = agruparMiles(digitos);
    let pos = formateado.length;
    if (digitosAntes === 0) {
      pos = 0;
    } else {
      let vistos = 0;
      for (let i = 0; i < formateado.length; i++) {
        if (formateado[i] !== '.') vistos++;
        if (vistos === digitosAntes) {
          pos = i + 1;
          break;
        }
      }
    }
    caretRef.current = pos;
    setCaretTick((t) => t + 1);
    setMonto(formateado);
  }

  // ── Búsqueda de contribuyentes (debounce 300ms, mínimo 2 caracteres) ──
  function handleQuery(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const texto = v.trim();
    if (texto.length < 2) {
      setResultados([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    debounceRef.current = setTimeout(async () => {
      const seq = ++seqRef.current;
      try {
        const data = await api.buscarContribuyentes(texto);
        if (seq !== seqRef.current) return; // respuesta vieja -- ya hay una búsqueda más nueva
        setResultados(data ?? []);
      } catch {
        if (seq === seqRef.current) setResultados([]);
      } finally {
        if (seq === seqRef.current) setBuscando(false);
      }
    }, 300);
  }

  // ── Al seleccionar: Hacienda + saldo + garantía activa previa, en paralelo ──
  async function seleccionar(c: ContribuyenteBusqueda) {
    setSel(c);
    setResultados([]);
    setQuery('');
    setError('');
    setHacienda(null);
    setSaldo(null);
    setPrevia(null);

    const seq = ++ctxSeqRef.current;

    // Hacienda -- nunca bloquea el registro: si falla o no encuentra, no se muestra nada.
    api
      .hacienda(c.contribuyente)
      .then((j: HaciendaResp) => {
        if (seq === ctxSeqRef.current && !j.error && !j.notFound && j.data) setHacienda(j.data);
      })
      .catch(() => {
        /* Hacienda caída -- se ignora a propósito */
      });

    // Saldo del contribuyente -- alimenta el texto de monto sugerido.
    api
      .saldoContribuyente(c.contribuyente)
      .then((data: SaldoContribuyente | null) => {
        if (seq === ctxSeqRef.current && data) setSaldo(data);
      })
      .catch(() => {
        /* sin saldo -- simplemente no se muestra la sugerencia */
      });

    // ¿Ya tiene una garantía activa? -> aviso de sustitución.
    api
      .garantiaActiva(c.contribuyente)
      .then((data) => {
        if (seq === ctxSeqRef.current && data) setPrevia(data as GarantiaActivaPrevia);
      })
      .catch(() => {
        /* no crítico -- el API igual maneja la sustitución */
      });
  }

  // Cliente ya elegido desde el tab "Sin Garantía" -- se salta el buscador.
  // Sólo tiene sentido en alta (en edición el cliente ya viene de `garantia`).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!esEdicion && clientePreseleccionado) seleccionar(clientePreseleccionado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Estado tributario (badge) ───────────────────────────────────────
  const haciendaBadge = (() => {
    if (!hacienda) return null;
    const s = hacienda.situacion;
    // OJO: la API devuelve los STRINGS 'SI'/'NO', no booleanos. Un `if (s.moroso)`
    // directo da siempre true ('NO' es un string no vacío) y marcaría a todo
    // contribuyente como moroso.
    const moroso = esSi(s?.moroso);
    const omiso = esSi(s?.omiso);
    const estado = moroso ? 'Moroso' : omiso ? 'Omiso' : 'Al día';
    const color = moroso ? '#dc2626' : omiso ? '#d97706' : '#16a34a';
    // `regimen` llega como objeto { codigo, descripcion }. Se deja el caso string
    // como respaldo defensivo por si una respuesta futura lo devuelve plano.
    const regimen =
      typeof hacienda.regimen === 'string'
        ? hacienda.regimen
        : (hacienda.regimen?.descripcion ?? null);
    return { estado, color, regimen };
  })();

  // Representante legal: se muestra siempre EXCEPTO cuando Hacienda confirma
  // que es persona física. Si Hacienda está caída o no devolvió nada, el campo
  // sigue visible (opcional) -- una caída de Hacienda no debe esconderlo.
  // tipoIdentificacion es un CÓDIGO, no texto: '01' física, '02' jurídica,
  // '03' DIMEX, '04' NITE.
  const tipoId = (hacienda?.tipoIdentificacion ?? '').trim();
  const esJuridica = tipoId === '02';
  const esFisica = tipoId === '01' || tipoId === '03';
  const mostrarRepresentante = !esFisica;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sel) {
      setError('Seleccioná un cliente');
      return;
    }
    const montoNum = montoANumero(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      setError('El monto garantizado debe ser mayor a cero');
      return;
    }
    if (!fechaEmision || !fechaVencimiento) {
      setError('Indicá la fecha de emisión y la de vencimiento');
      return;
    }
    // La BD tiene un CHECK (fecha_vencimiento > fecha_emision) -- se valida acá
    // para no mostrarle al usuario el error crudo de Postgres.
    if (fechaVencimiento <= fechaEmision) {
      setError('El vencimiento debe ser posterior a la fecha de emisión');
      return;
    }
    const carpetaNum = Number(carpeta);
    if (
      puedeEditarUbicacion &&
      (!mueble || !gaveta || !carpeta.trim() || !Number.isInteger(carpetaNum) || carpetaNum <= 0)
    ) {
      setError('Completá Mueble/Archivero, Gaveta/Caja y Carpeta N.° (un número entero mayor a 0)');
      return;
    }
    if (puedeEditarUbicacion && carpetaLlena) {
      setError(
        `Esa carpeta ya tiene ${TOPE_GARANTIAS_POR_CARPETA} garantías -- elegí otra carpeta o usá "Siguiente disponible".`,
      );
      return;
    }
    if (tieneFiador && !fiadorNombre.trim()) {
      setError('El nombre del fiador es requerido');
      return;
    }

    setLoading(true);
    setError('');
    try {
      if (garantia) {
        // ── Edición: PATCH sólo con los campos editables de esa ruta. Mandar
        // contribuyente/cliente_nombre/estado_custodia haría que responda 400.
        const payload: EditarGarantiaPayload = {
          tipo_titulo: tipoTitulo,
          monto_garantizado: montoNum,
          tiene_fiador: tieneFiador,
          fiador_nombre: tieneFiador ? fiadorNombre.trim() : null,
          fiador_cedula: tieneFiador ? fiadorCedula.trim() || null : null,
          fiador_telefono: tieneFiador ? fiadorTelefono.trim() || null : null,
          fecha_emision: fechaEmision,
          fecha_vencimiento: fechaVencimiento,
        };
        // Sólo se manda si es editable -- la ruta PATCH rechaza estos 3 campos
        // (409) cuando la garantía no está actualmente en bóveda.
        if (puedeEditarUbicacion) {
          payload.ubicacion_mueble = mueble;
          payload.ubicacion_gaveta = gaveta;
          payload.ubicacion_carpeta = carpetaNum;
        }
        // Si el campo está oculto (Hacienda confirmó persona física) no se manda:
        // enviar null borraría en silencio un representante ya guardado.
        if (mostrarRepresentante) payload.representante_legal = representante.trim() || null;

        await api.editar(garantia.id, payload);
        onSuccess();
        return;
      } else {
        const payload: RegistrarGarantiaPayload = {
          contribuyente: sel.contribuyente,
          cliente_nombre: sel.cliente_nombre,
          tipo_titulo: tipoTitulo,
          monto_garantizado: montoNum,
          tiene_fiador: tieneFiador,
          fiador_nombre: tieneFiador ? fiadorNombre.trim() : undefined,
          fiador_cedula: tieneFiador ? fiadorCedula.trim() : undefined,
          fiador_telefono: tieneFiador ? fiadorTelefono.trim() : undefined,
          representante_legal: mostrarRepresentante ? representante.trim() || undefined : undefined,
          fecha_emision: fechaEmision,
          fecha_vencimiento: fechaVencimiento,
          ubicacion_mueble: mueble,
          ubicacion_gaveta: gaveta,
          ubicacion_carpeta: carpetaNum,
          origen_registro: origenRegistro,
        };
        const json = await api.registrar(payload);
        onSuccess(json.id);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            {esEdicion ? <Pencil size={16} /> : <FileSignature size={16} />}
            {esEdicion
              ? 'Editar Garantía'
              : tipoTituloFijo
                ? 'Emitir Nueva Garantía (Pagaré Oficial)'
                : 'Registrar Garantía Existente (Física)'}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          {/* ═══ BLOQUE 1 — DATOS DEL CLIENTE ═══════════════════════ */}
          <SeccionTitulo n={1} titulo="Datos del Cliente" />

          <div>
            <label className={LABEL}>Cliente *</label>
            {sel ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">
                    {sel.cliente_nombre}
                  </p>
                  <p className="text-[11px] text-gray-400">{sel.contribuyente}</p>
                </div>
                {esEdicion ? (
                  // El contribuyente es la identidad del expediente: no se cambia
                  // desde acá (sería otra garantía).
                  <span className="text-[11px] font-semibold text-gray-400 shrink-0">
                    No editable
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      ctxSeqRef.current++; // invalida respuestas en vuelo del cliente anterior
                      setSel(null);
                      setHacienda(null);
                      setSaldo(null);
                      setPrevia(null);
                    }}
                    className="text-[12px] font-semibold text-[#009ee3] hover:underline shrink-0"
                  >
                    Cambiar
                  </button>
                )}
              </div>
            ) : (
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
                <input
                  value={query}
                  onChange={(e) => handleQuery(e.target.value)}
                  className={`${INPUT} pl-9`}
                  placeholder="Buscar por nombre o cédula (mínimo 2 caracteres)..."
                  autoComplete="off"
                />
                {buscando && (
                  <Loader2
                    size={13}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin"
                  />
                )}
                {resultados.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg py-1 max-h-56 overflow-y-auto">
                    {resultados.map((c) => (
                      <button
                        key={c.contribuyente}
                        type="button"
                        onClick={() => seleccionar(c)}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50"
                      >
                        <p className="text-[13px] font-semibold text-gray-800">
                          {c.cliente_nombre}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          {c.contribuyente}
                          {c.n_codigos > 1 ? ` · ${c.n_codigos} códigos` : ''}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
                {!buscando && query.trim().length >= 2 && resultados.length === 0 && (
                  <p className="mt-1 text-[11px] text-gray-400">
                    Sin resultados para “{query.trim()}”.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Contexto: situación tributaria + garantía activa previa */}
          {haciendaBadge && (
            <div className="flex items-center gap-2 text-[12px] text-gray-600">
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: haciendaBadge.color,
                  display: 'inline-block',
                }}
              />
              <span>
                Hacienda: <b style={{ color: haciendaBadge.color }}>{haciendaBadge.estado}</b>
                {haciendaBadge.regimen ? ` — ${haciendaBadge.regimen}` : ''}
              </span>
            </div>
          )}

          {/* Aviso de sustitución: sólo en alta -- en edición es el mismo registro. */}
          {!esEdicion && previa && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              Este contribuyente ya tiene una garantía activa ({previa.tipo_titulo},{' '}
              {fmtCRC(previa.monto_garantizado)}). Registrar una nueva la marcará como{' '}
              <b>sustituida</b>.
            </div>
          )}

          {mostrarRepresentante && (
            <div>
              <label className={LABEL}>Representante Legal {esJuridica ? '' : '(opcional)'}</label>
              <input
                value={representante}
                // Máscara a mayúsculas sostenidas al digitar (Spec 4, ago 2026) --
                // se imprime en negrita+mayúsculas en el pagaré (PagareImprimible.tsx).
                onChange={(e) => setRepresentante(e.target.value.toUpperCase())}
                className={`${INPUT} uppercase`}
                placeholder={
                  esJuridica ? 'Quien firma en nombre de la persona jurídica' : 'Solo si aplica'
                }
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Tipo de Título *</label>
              {tipoTituloFijo ? (
                // Emitir Nueva Garantía (Pagaré Oficial) sólo tiene sentido con
                // Pagaré -- se bloquea en vez de dejar elegir Letra de Cambio.
                <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                  {tipoTituloFijo}
                </div>
              ) : (
                <select
                  value={tipoTitulo}
                  onChange={(e) => setTipoTitulo(e.target.value as TipoTitulo)}
                  className={`${INPUT} bg-white`}
                >
                  {TIPOS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className={LABEL}>Monto Garantizado *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">
                  ₡
                </span>
                <input
                  ref={montoRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={monto}
                  onChange={handleMonto}
                  onBlur={() => setMonto((m) => normalizarMonto(m))}
                  className={`${INPUT} pl-7 tabular-nums`}
                  placeholder="0"
                />
              </div>
              {saldo && (
                <p className={HINT}>
                  Sugerido: <b className="text-gray-500">{fmtCRC(saldo.monto_objetivo)}</b> (saldo
                  actual + holgura configurada) — no bloquea el monto que digites
                </p>
              )}
            </div>
          </div>

          {/* ═══ BLOQUE 2 — FIADOR / AVAL PERSONAL ══════════════════ */}
          <SeccionTitulo n={2} titulo="Fiador / Aval Personal" />

          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={tieneFiador}
              onClick={() => setTieneFiador((v) => !v)}
              className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#009ee3]"
              style={{ backgroundColor: tieneFiador ? '#009ee3' : '#cbd5e1' }}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200 ${tieneFiador ? 'translate-x-[18px]' : 'translate-x-[2px]'}`}
              />
            </button>
            <span
              className="text-[12px] font-semibold text-gray-600 cursor-pointer select-none"
              onClick={() => setTieneFiador((v) => !v)}
            >
              Tiene Aval Persona Física (Fiador)
            </span>
          </div>

          {/* Se mantiene montado para poder animar el despliegue; los inputs van
              deshabilitados cuando está cerrado (así tampoco entran al tab order). */}
          <div
            aria-hidden={!tieneFiador}
            className={`overflow-hidden transition-all duration-300 ease-in-out ${tieneFiador ? 'max-h-[280px] opacity-100' : 'max-h-0 opacity-0'}`}
          >
            <div className="space-y-2.5 pl-3" style={{ borderLeft: '2px solid #009ee3' }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Nombre del Fiador *</label>
                  <input
                    value={fiadorNombre}
                    onChange={(e) => setFiadorNombre(e.target.value)}
                    disabled={!tieneFiador}
                    className={INPUT}
                    placeholder="Nombre completo"
                  />
                </div>
                <div>
                  <label className={LABEL}>Cédula del Fiador</label>
                  <input
                    value={fiadorCedula}
                    onChange={(e) => setFiadorCedula(e.target.value)}
                    disabled={!tieneFiador}
                    className={INPUT}
                    placeholder="1-0000-0000"
                  />
                </div>
              </div>
              <div>
                <label className={LABEL}>Teléfono del Fiador</label>
                <input
                  value={fiadorTelefono}
                  onChange={(e) => setFiadorTelefono(e.target.value)}
                  disabled={!tieneFiador}
                  className={INPUT}
                  placeholder="8888-8888"
                />
              </div>
            </div>
          </div>

          {/* ═══ BLOQUE 3 — CUSTODIA Y UBICACIÓN ════════════════════ */}
          <SeccionTitulo n={3} titulo="Custodia y Ubicación" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Fecha de Emisión *</label>
              <input
                type="date"
                value={fechaEmision}
                onChange={(e) => {
                  const v = e.target.value;
                  setFechaEmision(v);
                  // Sugerencia +12 meses -- el campo de Vencimiento sigue 100%
                  // editable después, esto sólo evita el cálculo manual del caso
                  // más común (línea de crédito a 1 año).
                  setFechaVencimiento(sumarUnAnio(v));
                }}
                className={INPUT}
              />
            </div>
            <div>
              <label className={LABEL}>Fecha de Vencimiento *</label>
              <input
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
                className={INPUT}
              />
              <p className={HINT}>
                Se sugiere automáticamente a 12 meses de la emisión — cambiala si el plazo es
                distinto.
              </p>
            </div>
          </div>

          {/* Ubicación estructurada (Spec 3): reemplaza el código de archivo de texto
              libre por 3 controles delimitados -- se concatenan server-side en el
              texto uniforme que se ve en la columna Ubicación de la tabla. Toda alta
              nueva arranca en bóveda (ya no hay selector de estado inicial: no tiene
              sentido despachar/enviar a firma algo que el sistema recién está
              creando), así que siempre son editables acá. En edición, sólo si la
              garantía sigue físicamente en bóveda -- si no, la ubicación la define el
              estado de custodia (ver [id]/custodia/route.ts) y se muestra de sólo lectura. */}
          {puedeEditarUbicacion ? (
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_110px] gap-3">
              <div>
                <label className={LABEL}>Mueble/Archivero *</label>
                <select
                  value={mueble}
                  onChange={(e) => setMueble(e.target.value)}
                  className={`${INPUT} bg-white`}
                >
                  <option value="">Seleccionar...</option>
                  {MUEBLES_ARCHIVO.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL}>Gaveta/Caja *</label>
                <select
                  value={gaveta}
                  onChange={(e) => setGaveta(e.target.value)}
                  className={`${INPUT} bg-white`}
                >
                  <option value="">Seleccionar...</option>
                  {GAVETAS_ARCHIVO.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL}>Carpeta N.° *</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={carpeta}
                  onChange={(e) => setCarpeta(e.target.value)}
                  className={INPUT}
                  placeholder="4"
                />
                {/* Contador en vivo (Spec, ago 2026): sólo se muestra una vez que
                    el RPC respondió -- null mientras no hay ubicación completa
                    o mientras el RPC todavía no contesta. */}
                {conteoCarpeta !== null && !carpetaLlena && (
                  <p className={HINT}>
                    {conteoCarpeta}/{TOPE_GARANTIAS_POR_CARPETA} garantías en esa carpeta
                  </p>
                )}
                {carpetaLlena && (
                  <div className="mt-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2">
                    <p className="text-[11px] text-red-700">
                      Carpeta llena ({conteoCarpeta}/{TOPE_GARANTIAS_POR_CARPETA})
                    </p>
                    <button
                      type="button"
                      onClick={usarSiguienteCarpetaDisponible}
                      disabled={buscandoSiguienteCarpeta}
                      className="mt-1 text-[11px] font-semibold text-[#009ee3] hover:underline disabled:opacity-60"
                    >
                      {buscandoSiguienteCarpeta
                        ? 'Buscando...'
                        : 'Usar Carpeta N.° siguiente disponible'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <label className={LABEL}>Ubicación Física</label>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                {garantia?.ubicacion_archivero}
              </div>
              <p className={HINT}>
                La define el estado de custodia actual (
                {garantia && ESTADO_CUSTODIA_LABEL[garantia.estado_custodia]}) -- no es editable
                mientras el título no esté en bóveda.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !sel}
              className="px-4 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-60 transition inline-flex items-center gap-2"
              style={{ backgroundColor: '#009ee3' }}
            >
              {/* Flujo "Registrar Garantía Existente (Física)": botón con label e ícono
                  propios ("Guardar en Bóveda") -- el título queda EN_BOVEDA de una vez,
                  a diferencia de "Emitir Nuevo Pagaré Oficial" (ModalEmitirPagare), que
                  termina despachado. Sólo aplica en alta, nunca en edición. */}
              {!esEdicion && origenRegistro === 'EXISTENTE_FISICA' && !loading && (
                <Save size={14} />
              )}
              {loading
                ? esEdicion
                  ? 'Guardando...'
                  : origenRegistro === 'EXISTENTE_FISICA'
                    ? 'Guardando en Bóveda...'
                    : 'Registrando...'
                : esEdicion
                  ? 'Guardar Cambios'
                  : origenRegistro === 'EXISTENTE_FISICA'
                    ? 'Guardar en Bóveda'
                    : 'Registrar garantía'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Encabezado de bloque: label chico en mayúsculas + divisoria, el mismo patrón
// de labels de sección que usa el resto del SIC.
function SeccionTitulo({ n, titulo }: { n: number; titulo: string }) {
  return (
    <div className="flex items-center gap-2 pt-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">
        Bloque {n} · {titulo}
      </span>
      <span className="h-px flex-1 bg-gray-100" />
    </div>
  );
}
