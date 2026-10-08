'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { X, Printer, Search, Loader2 } from 'lucide-react';
import { useGarantiaFormController } from '@/views/auditoria-legal/hooks/use-garantia-form-controller';
import { fmtCRC } from '@/lib/utils/formato';
import { formatearDireccion } from '@/lib/auditoria-legal/direccion-cr';
import {
  LABEL,
  INPUT,
  INPUT_COMPACTO,
  INPUT_INVALIDO,
  VACIO,
  PersonaFieldset,
  PersonaFieldsetCampos,
  normalizarCedula,
  cedulaValida,
} from './ModalGenerarPagare';
import type { CampoPersona, DatosPersona } from './ModalGenerarPagare';
import type {
  ContribuyenteBusqueda,
  SaldoContribuyente,
  HaciendaData,
  PersonaLegal,
  EstadoCivil,
  RegistrarGarantiaPayload,
  GenerarPagarePayload,
} from '@/types/auditoria-legal';

export interface ModalEmitirPagareProps {
  onClose: () => void;
  /** Se llama SÓLO cuando terminaron las 3 llamadas (garantía creada, pagaré
   *  generado, despachada a vendedor) -- el padre navega a /pagare/[id] y
   *  refresca la tabla. Si algo falla a mitad de camino, el modal se queda
   *  abierto con un botón de reintentar (no se pierde lo ya guardado). */
  onExito: (nuevaId: number) => void;
  /** Si viene (desde el tab "Sin Garantía"), se salta el buscador -- arranca
   *  directo con este cliente ya elegido, igual que si lo hubiera buscado a mano. */
  clientePreseleccionado?: ContribuyenteBusqueda;
  /** Si viene (desde la aprobación del portal de actualización), pre-llena el
   *  nombre y cédula del representante legal y dispara el autocompletado por
   *  cédula contra personas_legales (ya se hizo el UPSERT antes de abrir este
   *  modal). Pensado para el camino jurídico -- la física ya se autocompleta
   *  sola por contribuyente (ver el useEffect existente más abajo) -- pero el
   *  efecto que lo consume NO revalida esFisica/tipoId: es responsabilidad de
   *  quien abre el modal (garantias-cliente.tsx) no pasar este prop para un
   *  contribuyente física. */
  representanteLegalPrellenado?: { nombre: string; cedula: string };
}

interface VendedorContribuyente {
  vendedor_cod: string;
  vendedor_nombre: string;
  saldo: number;
}

const HINT = 'mt-1 text-[11px] leading-snug text-gray-400';

// Fusión de 3 pasos en 1 (ago 2026): antes "Emitir Nueva Garantía" abría
// ModalRegistrarGarantia -> (éxito) ModalGenerarPagare -> (éxito)
// ModalConfirmarEnvioVendedor -> navegación a /pagare/[id]. Este modal junta
// los 3 formularios en una sola pantalla y orquesta las 3 llamadas (POST
// garantias -> POST pagare -> PATCH custodia ENTREGAR) en un solo submit.
// No incluye el Bloque de Ubicación Física: el título nunca llega a estar
// físicamente en bóveda -- se despacha al vendedor en el mismo paso, así que
// un lugar de archivo real nunca aplica (ver relajación de esa validación en
// POST /api/auditoria-legal/garantias/route.ts).
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

/** '2026-03-15' -> '2027-03-15' (+12 meses exactos, sugerencia de vencimiento). */
function sumarUnAnio(fechaISO: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaISO);
  if (!m) return '';
  const [, anio, mes, dia] = m;
  const d = new Date(Number(anio) + 1, Number(mes) - 1, Number(dia));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface GarantiaActivaPrevia {
  tipo_titulo: string;
  monto_garantizado: number;
}
interface HaciendaResp {
  data: HaciendaData | null;
  notFound: boolean;
  error: boolean;
}

const esSi = (v: unknown): boolean =>
  typeof v === 'string' ? v.trim().toUpperCase() === 'SI' : v === true;

type Paso = 'garantia' | 'pagare' | 'despacho' | null;

export default function ModalEmitirPagare({
  onClose,
  onExito,
  clientePreseleccionado,
  representanteLegalPrellenado,
}: ModalEmitirPagareProps) {
  // ── Selección de cliente (igual que ModalRegistrarGarantia) ──────────
  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState<ContribuyenteBusqueda[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [sel, setSel] = useState<ContribuyenteBusqueda | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);
  const ctxSeqRef = useRef(0);
  const api = useGarantiaFormController();

  const [hacienda, setHacienda] = useState<HaciendaData | null>(null);
  const [saldo, setSaldo] = useState<SaldoContribuyente | null>(null);
  const [previa, setPrevia] = useState<GarantiaActivaPrevia | null>(null);

  // ── Vendedor Responsable de Trámite (Spec 2) ─────────────────────────
  // fn_vendedores_por_contribuyente ya viene ordenado por saldo desc -- el
  // primero es el mismo que fn_resolver_responsables_contribuyente
  // preseleccionaría solo en el servidor (mismo criterio, no un cálculo
  // nuevo). Sólo se muestra como <select> editable si hay más de uno --
  // con uno solo no hay nada que "ajustar manualmente".
  const [vendedores, setVendedores] = useState<VendedorContribuyente[] | null>(null);
  const [vendedorCodElegido, setVendedorCodElegido] = useState('');

  // ── Datos básicos ─────────────────────────────────────────────────────
  const [monto, setMonto] = useState('');
  const [fechaEmision, setFechaEmision] = useState('');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [tieneFiador, setTieneFiador] = useState(false);
  const [fiadorNombre, setFiadorNombre] = useState('');
  const [fiadorCedula, setFiadorCedula] = useState('');
  const [fiadorTelefono, setFiadorTelefono] = useState('');
  const [representanteNombre, setRepresentanteNombre] = useState('');

  // ── Datos legales del pagaré (fusionados desde ModalGenerarPagare) ───
  const [tasa, setTasa] = useState('');
  const [lugar, setLugar] = useState('');
  const [deudorDatos, setDeudorDatos] = useState<DatosPersona>(VACIO);
  const [deudorAutocompletado, setDeudorAutocompletado] = useState(false);
  const [representanteCedula, setRepresentanteCedula] = useState('');
  const [representanteDatos, setRepresentanteDatos] = useState<DatosPersona>(VACIO);
  const [representanteAutocompletado, setRepresentanteAutocompletado] = useState(false);
  const [fiadorDatos, setFiadorDatos] = useState<DatosPersona>(VACIO);
  const [fiadorDatosAutocompletado, setFiadorDatosAutocompletado] = useState(false);
  const representanteSeqRef = useRef(0);
  const fiadorSeqRef = useRef(0);
  // Guard de una sola aplicación para el pre-llenado de representanteLegalPrellenado
  // (ver el useEffect más abajo) -- por si el llamador pasa un objeto literal nuevo
  // en cada render en vez de una referencia estable, esto evita pisar lo que el
  // analista ya haya editado a mano después del primer pre-llenado.
  const prellenadoAplicadoRef = useRef(false);

  // ── Pre-Flight (resaltado en rojo de lo que falta) ───────────────────
  const [tasaInvalida, setTasaInvalida] = useState(false);
  const [lugarInvalido, setLugarInvalido] = useState(false);
  const [representanteCedulaInvalida, setRepresentanteCedulaInvalida] = useState(false);
  const [deudorInvalidos, setDeudorInvalidos] = useState<Set<CampoPersona>>(new Set());
  const [representanteInvalidos, setRepresentanteInvalidos] = useState<Set<CampoPersona>>(
    new Set(),
  );
  const [fiadorInvalidos, setFiadorInvalidos] = useState<Set<CampoPersona>>(new Set());

  // ── Orquestación resumible: si un paso falla, el siguiente intento no
  // repite lo que ya se guardó (no se crea la garantía dos veces). ───────
  const [nuevaIdCreada, setNuevaIdCreada] = useState<number | null>(null);
  const [pagareGenerado, setPagareGenerado] = useState(false);
  const [pasoActual, setPasoActual] = useState<Paso>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const montoRef = useRef<HTMLInputElement | null>(null);
  const caretRef = useRef<number | null>(null);
  const [caretTick, setCaretTick] = useState(0);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  useLayoutEffect(() => {
    if (caretRef.current === null || !montoRef.current) return;
    const pos = caretRef.current;
    caretRef.current = null;
    montoRef.current.setSelectionRange(pos, pos);
  }, [caretTick]);

  // Tasa/lugar sugeridos desde config_sistema -- independiente del cliente elegido.
  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      let config: Record<string, string> = {};
      try {
        config = await api.configPagare();
      } catch {
        config = {};
      }
      if (cancelado) return;
      const cfg = new Map(Object.entries(config));
      setTasa(cfg.get('TASA_INTERES_MORATORIO_DEFAULT') || '');
      setLugar(cfg.get('PAGARE_LUGAR_EMISION_DEFAULT') || '');
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, [api]);

  function handleMonto(e: React.ChangeEvent<HTMLInputElement>) {
    const crudo = e.target.value;
    const caret = e.target.selectionStart ?? crudo.length;
    const digitosCrudos = crudo.replace(/\D/g, '');
    let digitosAntes = crudo.slice(0, caret).replace(/\D/g, '').length;
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
        if (seq !== seqRef.current) return;
        setResultados(data ?? []);
      } catch {
        if (seq === seqRef.current) setResultados([]);
      } finally {
        if (seq === seqRef.current) setBuscando(false);
      }
    }, 300);
  }

  async function seleccionar(c: ContribuyenteBusqueda) {
    setSel(c);
    setResultados([]);
    setQuery('');
    setError('');
    setHacienda(null);
    setSaldo(null);
    setPrevia(null);
    setVendedores(null);
    setVendedorCodElegido('');

    const seq = ++ctxSeqRef.current;

    api
      .hacienda(c.contribuyente)
      .then((j: HaciendaResp) => {
        if (seq === ctxSeqRef.current && !j.error && !j.notFound && j.data) setHacienda(j.data);
      })
      .catch(() => {
        /* Hacienda caída -- se ignora a propósito */
      });

    api
      .saldoContribuyente(c.contribuyente)
      .then((data: SaldoContribuyente | null) => {
        if (seq === ctxSeqRef.current && data) setSaldo(data);
      })
      .catch(() => {
        /* sin saldo -- simplemente no se muestra la sugerencia */
      });

    api
      .garantiaActiva(c.contribuyente)
      .then((data) => {
        if (seq === ctxSeqRef.current && data) setPrevia(data as GarantiaActivaPrevia);
      })
      .catch(() => {
        /* no crítico -- el API igual maneja la sustitución */
      });

    api
      .vendedoresContribuyente(c.contribuyente)
      .then((data: VendedorContribuyente[] | null) => {
        if (seq !== ctxSeqRef.current) return;
        const lista = data ?? [];
        setVendedores(lista);
        // Ya viene ordenado por saldo desc -- el primero es el que el servidor
        // preseleccionaría solo (fn_resolver_responsables_contribuyente).
        if (lista.length > 0) setVendedorCodElegido(lista[0].vendedor_cod);
      })
      .catch(() => {
        /* sin lista -- el servidor resuelve solo, sin selector */
      });
  }

  // Cliente ya elegido desde el tab "Sin Garantía" -- se salta el buscador.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (clientePreseleccionado) seleccionar(clientePreseleccionado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-llenado desde la aprobación del portal de actualización (Spec ago
  // 2026): dispara cuando ya hay un cliente resuelto (sel) y el llamador pasó
  // representanteLegalPrellenado -- el llamador es quien decide que esto sólo
  // aplica al camino jurídico (esta condición NO revalida esFisica/tipoId acá,
  // sólo confía en que quien invoca el modal ya lo filtró). prellenadoAplicadoRef
  // asegura que se aplique una sola vez por apertura del modal, aunque el
  // llamador pase un objeto literal nuevo en cada render en vez de una
  // referencia estable -- si no, cada re-render pisaría lo que el analista ya
  // haya corregido a mano después del primer pre-llenado.
  useEffect(() => {
    if (!representanteLegalPrellenado || !sel || prellenadoAplicadoRef.current) return;
    prellenadoAplicadoRef.current = true;
    setRepresentanteNombre(representanteLegalPrellenado.nombre);
    setRepresentanteCedula(representanteLegalPrellenado.cedula);
    buscarRepresentantePorCedulaDirecta(representanteLegalPrellenado.cedula);
  }, [sel, representanteLegalPrellenado]);

  const haciendaBadge = (() => {
    if (!hacienda) return null;
    const s = hacienda.situacion;
    const moroso = esSi(s?.moroso);
    const omiso = esSi(s?.omiso);
    const estado = moroso ? 'Moroso' : omiso ? 'Omiso' : 'Al día';
    const color = moroso ? '#dc2626' : omiso ? '#d97706' : '#16a34a';
    const regimen =
      typeof hacienda.regimen === 'string'
        ? hacienda.regimen
        : (hacienda.regimen?.descripcion ?? null);
    return { estado, color, regimen };
  })();

  const tipoId = (hacienda?.tipoIdentificacion ?? '').trim();
  const esJuridica = tipoId === '02';
  const esFisica = tipoId === '01' || tipoId === '03';
  const mostrarRepresentante = !esFisica;

  // Autocompletar Datos del Deudor (persona física) en cuanto se confirma que
  // el contribuyente elegido es física -- misma cédula que el contribuyente,
  // ya conocida desde la selección (a diferencia del representante, cuya
  // cédula es otra persona y no se sabe de antemano).
  useEffect(() => {
    if (!sel || !esFisica) return;
    let cancelado = false;
    api
      .personaLegal(sel.contribuyente)
      .then((data) => {
        if (cancelado || !data) return;
        const p = data as PersonaLegal;
        setDeudorDatos({
          estadoCivil: p.estado_civil ?? '',
          profesion: p.profesion ?? '',
          provincia: '',
          canton: '',
          distrito: '',
          senas: p.domicilio ?? '',
        });
        setDeudorAutocompletado(true);
      })
      .catch(() => {
        /* sin autocompletado -- no bloquea */
      });
    return () => {
      cancelado = true;
    };
  }, [sel, esFisica, api]);

  async function buscarRepresentantePorCedulaDirecta(cedulaCruda: string) {
    const seq = ++representanteSeqRef.current;
    const cedula = cedulaCruda.trim();
    if (!cedula || !cedulaValida(cedula)) return;
    const cedulaNormalizada = normalizarCedula(cedula);
    let p: PersonaLegal | null = null;
    try {
      p = await api.personaLegal(cedulaNormalizada);
    } catch {
      p = null;
    }
    if (seq !== representanteSeqRef.current) return;
    if (p) {
      const persona = p as PersonaLegal;
      setRepresentanteDatos({
        estadoCivil: persona.estado_civil ?? '',
        profesion: persona.profesion ?? '',
        provincia: '',
        canton: '',
        distrito: '',
        senas: persona.domicilio ?? '',
      });
      setRepresentanteAutocompletado(true);
    }
  }

  async function buscarRepresentantePorCedula() {
    return buscarRepresentantePorCedulaDirecta(representanteCedula);
  }

  async function buscarFiadorPorCedula() {
    const seq = ++fiadorSeqRef.current;
    const cedula = fiadorCedula.trim();
    if (!cedula || !cedulaValida(cedula)) return;
    const cedulaNormalizada = normalizarCedula(cedula);
    let p: PersonaLegal | null = null;
    try {
      p = await api.personaLegal(cedulaNormalizada);
    } catch {
      p = null;
    }
    if (seq !== fiadorSeqRef.current) return;
    if (p) {
      const persona = p as PersonaLegal;
      setFiadorDatos({
        estadoCivil: persona.estado_civil ?? '',
        profesion: persona.profesion ?? '',
        provincia: '',
        canton: '',
        distrito: '',
        senas: persona.domicilio ?? '',
      });
      setFiadorDatosAutocompletado(true);
    }
  }

  function cambiarDeudor(v: DatosPersona) {
    setDeudorDatos(v);
    setDeudorAutocompletado(false);
    setDeudorInvalidos(new Set());
  }
  function cambiarRepresentante(v: DatosPersona) {
    setRepresentanteDatos(v);
    setRepresentanteAutocompletado(false);
    setRepresentanteInvalidos(new Set());
  }
  function cambiarFiadorDatos(v: DatosPersona) {
    setFiadorDatos(v);
    setFiadorDatosAutocompletado(false);
    setFiadorInvalidos(new Set());
  }

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
    if (fechaVencimiento <= fechaEmision) {
      setError('El vencimiento debe ser posterior a la fecha de emisión');
      return;
    }
    if (tieneFiador && !fiadorNombre.trim()) {
      setError('El nombre del fiador es requerido');
      return;
    }
    if (mostrarRepresentante && !representanteNombre.trim()) {
      setError('El nombre del representante legal es requerido');
      return;
    }

    // Pre-Flight de los datos legales -- se acumulan TODOS los campos
    // faltantes para resaltarlos de una vez (mismo criterio que ModalGenerarPagare).
    const faltantes: string[] = [];
    let tasaInv = false,
      lugarInv = false,
      cedulaInv = false;
    const deudorInv = new Set<CampoPersona>();
    const representanteInv = new Set<CampoPersona>();
    const fiadorInv = new Set<CampoPersona>();

    const tasaNum = Number(tasa);
    if (!Number.isFinite(tasaNum) || tasaNum <= 0 || tasaNum > 100) {
      faltantes.push('tasa de interés moratorio válida (0-100%)');
      tasaInv = true;
    }
    if (!lugar.trim()) {
      faltantes.push('lugar de emisión');
      lugarInv = true;
    }

    if (esFisica) {
      if (!deudorDatos.estadoCivil) {
        faltantes.push('estado civil del deudor');
        deudorInv.add('estadoCivil');
      }
      if (!deudorDatos.profesion.trim()) {
        faltantes.push('profesión del deudor');
        deudorInv.add('profesion');
      }
      if (!deudorDatos.provincia) {
        faltantes.push('provincia del deudor');
        deudorInv.add('provincia');
      }
      if (!deudorDatos.canton) {
        faltantes.push('cantón del deudor');
        deudorInv.add('canton');
      }
      if (!deudorDatos.distrito) {
        faltantes.push('distrito del deudor');
        deudorInv.add('distrito');
      }
      if (!deudorDatos.senas.trim()) {
        faltantes.push('señas del deudor');
        deudorInv.add('senas');
      }
    } else {
      if (!representanteCedula.trim()) {
        faltantes.push('cédula del representante legal');
        cedulaInv = true;
      } else if (!cedulaValida(representanteCedula)) {
        faltantes.push(
          'cédula del representante legal (formato inválido -- deben ser 9, 10 o 12 dígitos)',
        );
        cedulaInv = true;
      }
      if (!representanteDatos.estadoCivil) {
        faltantes.push('estado civil del representante legal');
        representanteInv.add('estadoCivil');
      }
      if (!representanteDatos.profesion.trim()) {
        faltantes.push('profesión del representante legal');
        representanteInv.add('profesion');
      }
      if (!representanteDatos.provincia) {
        faltantes.push('provincia del representante legal');
        representanteInv.add('provincia');
      }
      if (!representanteDatos.canton) {
        faltantes.push('cantón del representante legal');
        representanteInv.add('canton');
      }
      if (!representanteDatos.distrito) {
        faltantes.push('distrito del representante legal');
        representanteInv.add('distrito');
      }
      if (!representanteDatos.senas.trim()) {
        faltantes.push('señas del representante legal');
        representanteInv.add('senas');
      }
    }
    if (tieneFiador) {
      if (!fiadorDatos.estadoCivil) {
        faltantes.push('estado civil del fiador');
        fiadorInv.add('estadoCivil');
      }
      if (!fiadorDatos.profesion.trim()) {
        faltantes.push('profesión del fiador');
        fiadorInv.add('profesion');
      }
      if (!fiadorDatos.provincia) {
        faltantes.push('provincia del fiador');
        fiadorInv.add('provincia');
      }
      if (!fiadorDatos.canton) {
        faltantes.push('cantón del fiador');
        fiadorInv.add('canton');
      }
      if (!fiadorDatos.distrito) {
        faltantes.push('distrito del fiador');
        fiadorInv.add('distrito');
      }
      if (!fiadorDatos.senas.trim()) {
        faltantes.push('señas del fiador');
        fiadorInv.add('senas');
      }
    }

    setTasaInvalida(tasaInv);
    setLugarInvalido(lugarInv);
    setRepresentanteCedulaInvalida(cedulaInv);
    setDeudorInvalidos(deudorInv);
    setRepresentanteInvalidos(representanteInv);
    setFiadorInvalidos(fiadorInv);

    if (faltantes.length > 0) {
      setError(`Completá: ${faltantes.join(', ')}`);
      return;
    }

    setLoading(true);
    setError('');
    try {
      // ── Paso 1: crear la garantía (se saltea si ya se creó en un intento anterior) ──
      let idGarantia = nuevaIdCreada;
      if (!idGarantia) {
        setPasoActual('garantia');
        const payload: RegistrarGarantiaPayload = {
          contribuyente: sel.contribuyente,
          cliente_nombre: sel.cliente_nombre,
          tipo_titulo: 'Pagaré',
          monto_garantizado: montoNum,
          tiene_fiador: tieneFiador,
          fiador_nombre: tieneFiador ? fiadorNombre.trim() : undefined,
          fiador_cedula: tieneFiador ? fiadorCedula.trim() : undefined,
          fiador_telefono: tieneFiador ? fiadorTelefono.trim() : undefined,
          representante_legal: mostrarRepresentante
            ? representanteNombre.trim() || undefined
            : undefined,
          fecha_emision: fechaEmision,
          fecha_vencimiento: fechaVencimiento,
          vendedor_cod_override: vendedorCodElegido || undefined,
          // Sin ubicacion_mueble/gaveta/carpeta a propósito -- ver comentario arriba.
        };
        const json = await api.registrar(payload);
        idGarantia = json.id;
        setNuevaIdCreada(idGarantia);
      }

      // ── Paso 2: generar el pagaré (se saltea si ya se generó) ──
      if (!pagareGenerado) {
        setPasoActual('pagare');
        const payloadPagare: GenerarPagarePayload = {
          tasa_interes_moratorio: tasaNum,
          lugar_emision: lugar.trim(),
        };
        if (esFisica) {
          payloadPagare.deudor_estado_civil = deudorDatos.estadoCivil as EstadoCivil;
          payloadPagare.deudor_profesion = deudorDatos.profesion.trim();
          payloadPagare.deudor_domicilio = formatearDireccion(deudorDatos);
        } else {
          payloadPagare.representante_cedula = normalizarCedula(representanteCedula);
          payloadPagare.representante_estado_civil = representanteDatos.estadoCivil as EstadoCivil;
          payloadPagare.representante_profesion = representanteDatos.profesion.trim();
          payloadPagare.representante_domicilio = formatearDireccion(representanteDatos);
        }
        if (tieneFiador) {
          payloadPagare.fiador_estado_civil = fiadorDatos.estadoCivil as EstadoCivil;
          payloadPagare.fiador_profesion = fiadorDatos.profesion.trim();
          payloadPagare.fiador_domicilio = formatearDireccion(fiadorDatos);
        }
        await api.generarPagare(idGarantia, payloadPagare);
        setPagareGenerado(true);
      }

      // ── Paso 3: despachar a vendedor (En Tránsito / Enviado a Vendedor) ──
      // Correo al vendedor no fatal (mismo criterio que ejecutarAccion en
      // garantias-cliente.tsx): si falla, el estado ya se aplicó igual.
      setPasoActual('despacho');
      // El correo al vendedor lo envía el backend con el Gmail del usuario (ya no viaja providerToken).
      await api.custodia(idGarantia, { accion: 'ENTREGAR' });

      onExito(idGarantia);
    } catch (e) {
      const yaCreada = nuevaIdCreada
        ? ' La garantía ya quedó registrada -- "Reintentar" continúa desde donde quedó, sin duplicarla.'
        : '';
      setError(`${(e as Error).message}${yaCreada}`);
    } finally {
      setLoading(false);
      setPasoActual(null);
    }
  }

  const labelBoton =
    pasoActual === 'garantia'
      ? 'Guardando garantía...'
      : pasoActual === 'pagare'
        ? 'Generando pagaré...'
        : pasoActual === 'despacho'
          ? 'Despachando a vendedor...'
          : nuevaIdCreada
            ? 'Reintentar'
            : 'Guardar e Imprimir Pagaré';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Printer size={16} /> Emitir Nuevo Pagaré Oficial
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-2">
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
                <button
                  type="button"
                  onClick={() => {
                    ctxSeqRef.current++;
                    setSel(null);
                    setHacienda(null);
                    setSaldo(null);
                    setPrevia(null);
                    setVendedores(null);
                    setVendedorCodElegido('');
                  }}
                  className="text-[12px] font-semibold text-[#009ee3] hover:underline shrink-0"
                >
                  Cambiar
                </button>
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
                  className={`${INPUT_COMPACTO} pl-9`}
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

          {previa && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              Este contribuyente ya tiene una garantía activa ({previa.tipo_titulo},{' '}
              {fmtCRC(previa.monto_garantizado)}). Registrar una nueva la marcará como{' '}
              <b>sustituida</b>.
            </div>
          )}

          {/* Vendedor Responsable de Trámite (Spec 2): sólo aparece como selector
              editable cuando la cédula tiene más de un vendedor vinculado (varios
              códigos de cliente en Softland) -- con uno solo no hay nada que ajustar. */}
          {vendedores && vendedores.length > 1 && (
            <div>
              <label className={LABEL}>Vendedor Responsable de Trámite *</label>
              <select
                value={vendedorCodElegido}
                onChange={(e) => setVendedorCodElegido(e.target.value)}
                className={`${INPUT_COMPACTO} bg-white`}
              >
                {vendedores.map((v) => (
                  <option key={v.vendedor_cod} value={v.vendedor_cod}>
                    {v.vendedor_nombre} — {fmtCRC(v.saldo)}
                  </option>
                ))}
              </select>
              <p className={HINT}>
                Esta cédula tiene {vendedores.length} vendedores vinculados (varios códigos de
                cliente) -- preseleccionado el de mayor saldo. Cambialo si el trámite corresponde a
                otro.
              </p>
            </div>
          )}
          {vendedores && vendedores.length === 1 && (
            <p className="text-[11px] text-gray-400">
              Vendedor Responsable de Trámite:{' '}
              <b className="text-gray-600">{vendedores[0].vendedor_nombre}</b>
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <label className={LABEL}>Tipo de Título</label>
              <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-600">
                Pagaré
              </div>
            </div>
            <div>
              <label className={LABEL}>Monto Garantizado *</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
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
                  className={`${INPUT_COMPACTO} pl-6 tabular-nums`}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <label className={LABEL}>Fecha de Emisión *</label>
              <input
                type="date"
                value={fechaEmision}
                onChange={(e) => {
                  const v = e.target.value;
                  setFechaEmision(v);
                  setFechaVencimiento(sumarUnAnio(v));
                }}
                className={INPUT_COMPACTO}
              />
            </div>
            <div>
              <label className={LABEL}>Fecha de Vencimiento *</label>
              <input
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
                className={INPUT_COMPACTO}
              />
              <p className={HINT}>
                Se sugiere automáticamente a 12 meses de la emisión — cambiala si el plazo es
                distinto.
              </p>
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

          <div
            aria-hidden={!tieneFiador}
            className={`overflow-hidden transition-all duration-300 ease-in-out ${tieneFiador ? 'max-h-[280px] opacity-100' : 'max-h-0 opacity-0'}`}
          >
            <div className="space-y-2 pl-3" style={{ borderLeft: '2px solid #009ee3' }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <label className={LABEL}>Nombre del Fiador *</label>
                  <input
                    value={fiadorNombre}
                    onChange={(e) => setFiadorNombre(e.target.value)}
                    disabled={!tieneFiador}
                    className={INPUT_COMPACTO}
                    placeholder="Nombre completo"
                  />
                </div>
                <div>
                  <label className={LABEL}>Cédula del Fiador</label>
                  <input
                    value={fiadorCedula}
                    onChange={(e) => {
                      setFiadorCedula(e.target.value);
                      setFiadorDatosAutocompletado(false);
                    }}
                    onBlur={buscarFiadorPorCedula}
                    disabled={!tieneFiador}
                    className={INPUT_COMPACTO}
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
                  className={INPUT_COMPACTO}
                  placeholder="8888-8888"
                />
              </div>
            </div>
          </div>

          {/* ═══ BLOQUE 3 — DATOS LEGALES DEL PAGARÉ ════════════════ */}
          <SeccionTitulo n={3} titulo="Datos Legales del Pagaré" />
          {sel && (
            <p className="text-[11px] text-gray-400 -mt-2">
              Plantilla:{' '}
              <b className="text-gray-600">{esFisica ? 'Persona Física' : 'Persona Jurídica'}</b>{' '}
              (según el formato de la cédula {sel.contribuyente})
            </p>
          )}

          {/* Contenedor principal del Bloque 3 (Spec ago 2026, modal panorámico):
              1 sola grilla de 2 columnas para Tasa/Lugar -- el resto (Representante,
              Deudor, Fiador) se maqueta con la variante `compacto` de los fieldsets
              compartidos con ModalGenerarPagare.tsx (misma idea, sin duplicar código). */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <label className={LABEL}>Tasa de Interés Moratorio (% mensual) *</label>
              <input
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={tasa}
                onChange={(e) => {
                  setTasa(e.target.value);
                  setTasaInvalida(false);
                }}
                className={`${INPUT_COMPACTO} ${tasaInvalida ? INPUT_INVALIDO : ''}`}
              />
            </div>
            <div>
              <label className={LABEL}>Lugar de Emisión *</label>
              <input
                value={lugar}
                onChange={(e) => {
                  setLugar(e.target.value);
                  setLugarInvalido(false);
                }}
                className={`${INPUT_COMPACTO} ${lugarInvalido ? INPUT_INVALIDO : ''}`}
              />
            </div>
          </div>

          {!sel ? (
            <p className="text-[12px] text-gray-400 italic">
              Seleccioná un cliente en el Bloque 1 para completar sus datos legales.
            </p>
          ) : esFisica ? (
            <PersonaFieldset
              titulo="Datos del Deudor (persona física)"
              valor={deudorDatos}
              onChange={cambiarDeudor}
              autocompletado={deudorAutocompletado}
              invalidos={deudorInvalidos}
              compacto
            />
          ) : (
            // Sección única "Datos del Representante Legal" (ago 2026): antes el
            // nombre vivía suelto en el Bloque 1 y acá sólo aparecían cédula +
            // estado civil/profesión/dirección -- quedaba partido en 2 lugares
            // con el mismo concepto (y el encabezado repetía el nombre como eco).
            // Ahora todo el bloque de la persona que firma vive en un solo lugar.
            <div className="space-y-2 pl-3" style={{ borderLeft: '2px solid #009ee3' }}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Datos del Representante Legal
              </p>
              {representanteAutocompletado && (
                <p className="text-[11px] text-green-600">
                  ✓ Autocompletado desde una garantía anterior -- verificá que los datos sigan
                  vigentes
                </p>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <label className={LABEL}>Nombre Completo {esJuridica ? '*' : '(opcional)'}</label>
                  <input
                    value={representanteNombre}
                    // Máscara a mayúsculas sostenidas al digitar (Spec 4, ago 2026) --
                    // el mismo nombre se imprime en negrita+mayúsculas en el pagaré
                    // (PagareImprimible.tsx), esto asegura que ya llegue así guardado.
                    onChange={(e) => setRepresentanteNombre(e.target.value.toUpperCase())}
                    className={`${INPUT_COMPACTO} uppercase`}
                    placeholder={
                      esJuridica ? 'Quien firma en nombre de la persona jurídica' : 'Solo si aplica'
                    }
                  />
                </div>
                <div>
                  <label className={LABEL}>Cédula del Representante Legal *</label>
                  <input
                    value={representanteCedula}
                    onChange={(e) => {
                      setRepresentanteCedula(e.target.value);
                      setRepresentanteAutocompletado(false);
                      setRepresentanteCedulaInvalida(false);
                    }}
                    onBlur={buscarRepresentantePorCedula}
                    className={`${INPUT_COMPACTO} ${representanteCedulaInvalida ? INPUT_INVALIDO : ''}`}
                  />
                </div>
              </div>
              <PersonaFieldsetCampos
                valor={representanteDatos}
                onChange={cambiarRepresentante}
                invalidos={representanteInvalidos}
                compacto
              />
            </div>
          )}

          {sel && tieneFiador && (
            <PersonaFieldset
              titulo={`Datos del Fiador — ${fiadorNombre || ''}`}
              valor={fiadorDatos}
              onChange={cambiarFiadorDatos}
              autocompletado={fiadorDatosAutocompletado}
              invalidos={fiadorInvalidos}
              compacto
            />
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !sel}
              className="px-4 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-60 transition inline-flex items-center gap-2"
              style={{ backgroundColor: '#009ee3' }}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
              {labelBoton}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
