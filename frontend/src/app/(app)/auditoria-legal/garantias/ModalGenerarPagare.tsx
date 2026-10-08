'use client';

import { useState, useEffect, useRef } from 'react';
import { X, FileSignature, Loader2 } from 'lucide-react';
import { useGarantiaFormController } from '@/views/auditoria-legal/hooks/use-garantia-form-controller';
import { esPersonaJuridica } from '@/lib/auditoria-legal/persona';
import {
  PROVINCIAS_CR,
  cantonesDe,
  distritosDe,
  formatearDireccion,
} from '@/lib/auditoria-legal/direccion-cr';
import { ESTADO_CIVIL_OPCIONES } from '@/types/auditoria-legal';
import type {
  EstadoCivil,
  GarantiaListaRow,
  GenerarPagarePayload,
  PersonaLegal,
} from '@/types/auditoria-legal';

export interface ModalGenerarPagareProps {
  garantia: GarantiaListaRow;
  onClose: () => void;
  onSuccess: () => void;
}

// Exportados: los reusa ModalEmitirPagare.tsx (flujo fusionado "Emitir Nuevo
// Pagaré Oficial") para no duplicar el fieldset de persona ni el selector de
// dirección en 2 archivos distintos.
export const LABEL = 'block text-[11px] font-bold text-gray-500 uppercase mb-1';
export const INPUT =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition';
// Variante compacta (modal panorámico ModalEmitirPagare, ago 2026) -- misma
// forma que INPUT pero con padding/tipografía reducidos. No sustituye a INPUT:
// ModalGenerarPagare (max-w-xl, más angosto) sigue usando el tamaño normal.
export const INPUT_COMPACTO =
  'w-full rounded-lg border border-gray-200 py-1 px-2.5 text-xs focus:outline-none focus:border-blue-400 transition';
// Pre-Flight: borde rojo sobre el campo que falta, en vez de sólo un mensaje
// genérico arriba -- se agrega ENCIMA de INPUT, no lo reemplaza.
export const INPUT_INVALIDO = 'border-red-300 bg-red-50/40';

export type CampoPersona =
  'estadoCivil' | 'profesion' | 'provincia' | 'canton' | 'distrito' | 'senas';

export interface DatosPersona {
  estadoCivil: EstadoCivil | '';
  profesion: string;
  provincia: string;
  canton: string;
  distrito: string;
  senas: string;
}

export const VACIO: DatosPersona = {
  estadoCivil: '',
  profesion: '',
  provincia: '',
  canton: '',
  distrito: '',
  senas: '',
};

// Cédula del representante: se acepta con o sin guiones/espacios (el analista
// puede digitar "3-101-123456"), pero debe quedar en uno de los 3 formatos
// reales de identificación en Costa Rica al quitarlos: física (9), jurídica
// (10) o DIMEX (12) -- todos dígitos. Sin esto, cualquier texto no vacío
// pasaba y terminaba como llave en personas_legales e impreso en el pagaré.
export function normalizarCedula(texto: string): string {
  return texto.replace(/[\s-]/g, '');
}

export function cedulaValida(texto: string): boolean {
  const d = normalizarCedula(texto);
  return /^\d+$/.test(d) && (d.length === 9 || d.length === 10 || d.length === 12);
}

export default function ModalGenerarPagare({
  garantia,
  onClose,
  onSuccess,
}: ModalGenerarPagareProps) {
  const esFisica = !esPersonaJuridica(garantia.contribuyente);

  const [tasa, setTasa] = useState('');
  const [lugar, setLugar] = useState('');
  const [deudor, setDeudor] = useState<DatosPersona>(VACIO);
  const [deudorAutocompletado, setDeudorAutocompletado] = useState(false);
  const [representanteCedula, setRepresentanteCedula] = useState('');
  const [representante, setRepresentante] = useState<DatosPersona>(VACIO);
  const [representanteAutocompletado, setRepresentanteAutocompletado] = useState(false);
  const [fiador, setFiador] = useState<DatosPersona>(VACIO);
  const [fiadorAutocompletado, setFiadorAutocompletado] = useState(false);
  const [cargandoDefaults, setCargandoDefaults] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Pre-Flight: qué campos faltaron en el último intento de submit -- se
  // resaltan en rojo hasta el próximo intento (o hasta que el bloque entero se
  // edite, ver cambiarDeudor/cambiarRepresentante/cambiarFiador).
  const [tasaInvalida, setTasaInvalida] = useState(false);
  const [lugarInvalido, setLugarInvalido] = useState(false);
  const [representanteCedulaInvalida, setRepresentanteCedulaInvalida] = useState(false);
  const [deudorInvalidos, setDeudorInvalidos] = useState<Set<CampoPersona>>(new Set());
  const [representanteInvalidos, setRepresentanteInvalidos] = useState<Set<CampoPersona>>(
    new Set(),
  );
  const [fiadorInvalidos, setFiadorInvalidos] = useState<Set<CampoPersona>>(new Set());
  // Descarta respuestas de fetch viejas de buscarRepresentantePorCedula: si el
  // analista corrige la cédula y sale del campo dos veces seguidas, dos
  // requests quedan en vuelo y no hay garantía de que la primera resuelva
  // primero -- sin esto, una respuesta desordenada podía sobreescribir con
  // datos de una cédula distinta a la que quedó en el input.
  const representanteSeqRef = useRef(0);
  const api = useGarantiaFormController();

  // Precarga: tasa/lugar sugeridos desde config_sistema, y si la cédula que
  // corresponda (deudor física, representante, o fiador) ya está en
  // personas_legales, se autocompleta -- así no se vuelve a digitar entre
  // garantías distintas de la misma persona.
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

      const cedulaDeudorORepresentante = esFisica ? garantia.contribuyente : null;
      const cedulas = [
        cedulaDeudorORepresentante,
        garantia.tiene_fiador ? garantia.fiador_cedula : null,
      ].filter((c): c is string => !!c);
      if (cedulas.length > 0) {
        let personas: PersonaLegal[] = [];
        try {
          personas = await api.personasLegales(cedulas);
        } catch {
          personas = [];
        }
        if (cancelado) return;
        const porCedula = new Map(personas.map((p: PersonaLegal) => [p.cedula, p]));
        if (esFisica) {
          const p = porCedula.get(garantia.contribuyente);
          if (p) {
            // El domicilio guardado de una garantía anterior es texto ya
            // concatenado (provincia+cantón+distrito+señas) -- no hay forma de
            // separarlo de vuelta, así que se vuelca completo en "Otras Señas" y
            // el analista re-elige provincia/cantón/distrito una vez.
            setDeudor({
              estadoCivil: p.estado_civil ?? '',
              profesion: p.profesion ?? '',
              provincia: '',
              canton: '',
              distrito: '',
              senas: p.domicilio ?? '',
            });
            setDeudorAutocompletado(true);
          }
        }
        if (garantia.tiene_fiador && garantia.fiador_cedula) {
          const p = porCedula.get(garantia.fiador_cedula);
          if (p) {
            setFiador({
              estadoCivil: p.estado_civil ?? '',
              profesion: p.profesion ?? '',
              provincia: '',
              canton: '',
              distrito: '',
              senas: p.domicilio ?? '',
            });
            setFiadorAutocompletado(true);
          }
        }
      }
      setCargandoDefaults(false);
    }
    cargar();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cuando el analista termina de escribir la cédula del representante legal
  // (puede repetirse en distintas sociedades que representa), buscar si ya
  // está en personas_legales y autocompletar -- mismo espíritu que el
  // useEffect de arriba, pero disparado on-blur porque acá la cédula no se
  // conoce de antemano (a diferencia del deudor física o el fiador, que ya
  // vienen en la garantía).
  async function buscarRepresentantePorCedula() {
    // El seq se incrementa en TODO blur, válido o no -- si sólo se moviera
    // dentro del camino que dispara la consulta, un blur con cédula inválida
    // (ej. el analista corrigiendo a mano) no invalidaba una búsqueda anterior
    // todavía en vuelo: esa respuesta vieja pasaba igual el chequeo de abajo
    // (el ref nunca se había movido) y sobreescribía el bloque con los datos
    // de la cédula anterior mientras el input ya mostraba otra cosa.
    const seq = ++representanteSeqRef.current;
    const cedula = representanteCedula.trim();
    // Formato claramente inválido (ni 9, 10 ni 12 dígitos) -- no vale la pena
    // ni disparar la consulta; handleSubmit igual lo rechaza con un mensaje.
    if (!cedula || !cedulaValida(cedula)) return;
    // La llave real en personas_legales es sólo dígitos -- si acá se buscara
    // con los guiones tal cual se escribieron, la misma persona guardada sin
    // guiones (por otra garantía) no matchearía y el autocompletado fallaría
    // en silencio justo para el caso que esta función existe para resolver.
    const cedulaNormalizada = normalizarCedula(cedula);
    let p: PersonaLegal | null = null;
    try {
      p = await api.personaLegal(cedulaNormalizada);
    } catch {
      p = null;
    }
    if (seq !== representanteSeqRef.current) return; // respuesta de un fetch viejo -- se descarta en silencio
    if (p) {
      const persona = p as PersonaLegal;
      setRepresentante({
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

  // Wrappers de los onChange de cada bloque de persona: además de actualizar el
  // valor, apagan la marca de "autocompletado" en cuanto el analista edita a
  // mano -- si no, quedaría el check puesto sobre un dato que ya cambió. También
  // limpia el resaltado de Pre-Flight de ese bloque -- no tiene sentido dejar un
  // campo marcado en rojo si el analista ya lo está corrigiendo.
  function cambiarDeudor(v: DatosPersona) {
    setDeudor(v);
    setDeudorAutocompletado(false);
    setDeudorInvalidos(new Set());
  }
  function cambiarRepresentante(v: DatosPersona) {
    setRepresentante(v);
    setRepresentanteAutocompletado(false);
    setRepresentanteInvalidos(new Set());
  }
  function cambiarFiador(v: DatosPersona) {
    setFiador(v);
    setFiadorAutocompletado(false);
    setFiadorInvalidos(new Set());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Pre-Flight: se acumulan TODOS los campos faltantes (no se corta en el
    // primero) para poder resaltarlos todos de una vez -- el analista ve de
    // entrada todo lo que falta en vez de corregir uno por uno a las trompadas.
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
      if (!deudor.estadoCivil) {
        faltantes.push('estado civil del deudor');
        deudorInv.add('estadoCivil');
      }
      if (!deudor.profesion.trim()) {
        faltantes.push('profesión del deudor');
        deudorInv.add('profesion');
      }
      if (!deudor.provincia) {
        faltantes.push('provincia del deudor');
        deudorInv.add('provincia');
      }
      if (!deudor.canton) {
        faltantes.push('cantón del deudor');
        deudorInv.add('canton');
      }
      if (!deudor.distrito) {
        faltantes.push('distrito del deudor');
        deudorInv.add('distrito');
      }
      if (!deudor.senas.trim()) {
        faltantes.push('señas del deudor');
        deudorInv.add('senas');
      }
    } else {
      if (!garantia.representante_legal) {
        setError('Esta garantía no tiene representante legal registrado -- editala primero');
        return;
      }
      if (!representanteCedula.trim()) {
        faltantes.push('cédula del representante legal');
        cedulaInv = true;
      } else if (!cedulaValida(representanteCedula)) {
        faltantes.push(
          'cédula del representante legal (formato inválido -- deben ser 9, 10 o 12 dígitos)',
        );
        cedulaInv = true;
      }
      if (!representante.estadoCivil) {
        faltantes.push('estado civil del representante legal');
        representanteInv.add('estadoCivil');
      }
      if (!representante.profesion.trim()) {
        faltantes.push('profesión del representante legal');
        representanteInv.add('profesion');
      }
      if (!representante.provincia) {
        faltantes.push('provincia del representante legal');
        representanteInv.add('provincia');
      }
      if (!representante.canton) {
        faltantes.push('cantón del representante legal');
        representanteInv.add('canton');
      }
      if (!representante.distrito) {
        faltantes.push('distrito del representante legal');
        representanteInv.add('distrito');
      }
      if (!representante.senas.trim()) {
        faltantes.push('señas del representante legal');
        representanteInv.add('senas');
      }
    }
    if (garantia.tiene_fiador) {
      if (!fiador.estadoCivil) {
        faltantes.push('estado civil del fiador');
        fiadorInv.add('estadoCivil');
      }
      if (!fiador.profesion.trim()) {
        faltantes.push('profesión del fiador');
        fiadorInv.add('profesion');
      }
      if (!fiador.provincia) {
        faltantes.push('provincia del fiador');
        fiadorInv.add('provincia');
      }
      if (!fiador.canton) {
        faltantes.push('cantón del fiador');
        fiadorInv.add('canton');
      }
      if (!fiador.distrito) {
        faltantes.push('distrito del fiador');
        fiadorInv.add('distrito');
      }
      if (!fiador.senas.trim()) {
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
      const payload: GenerarPagarePayload = {
        tasa_interes_moratorio: tasaNum,
        lugar_emision: lugar.trim(),
      };
      if (esFisica) {
        payload.deudor_estado_civil = deudor.estadoCivil as EstadoCivil;
        payload.deudor_profesion = deudor.profesion.trim();
        payload.deudor_domicilio = formatearDireccion(deudor);
      } else {
        // Sólo dígitos: la misma persona no debe quedar guardada en
        // personas_legales bajo dos claves distintas según si esta garantía
        // (u otra, de otro analista) se tecleó con guiones o sin ellos.
        payload.representante_cedula = normalizarCedula(representanteCedula);
        payload.representante_estado_civil = representante.estadoCivil as EstadoCivil;
        payload.representante_profesion = representante.profesion.trim();
        payload.representante_domicilio = formatearDireccion(representante);
      }
      if (garantia.tiene_fiador) {
        payload.fiador_estado_civil = fiador.estadoCivil as EstadoCivil;
        payload.fiador_profesion = fiador.profesion.trim();
        payload.fiador_domicilio = formatearDireccion(fiador);
      }

      await api.generarPagare(garantia.id, payload);
      onSuccess();
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <FileSignature size={16} /> Generar Pagaré — {garantia.cliente_nombre}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        {cargandoDefaults ? (
          <div className="p-8 flex items-center justify-center text-gray-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}
            <p className="text-[11px] text-gray-400 -mt-1">
              Plantilla:{' '}
              <b className="text-gray-600">{esFisica ? 'Persona Física' : 'Persona Jurídica'}</b>{' '}
              (según el formato de la cédula {garantia.contribuyente})
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  className={`${INPUT} ${tasaInvalida ? INPUT_INVALIDO : ''}`}
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
                  className={`${INPUT} ${lugarInvalido ? INPUT_INVALIDO : ''}`}
                />
              </div>
            </div>

            {esFisica ? (
              <PersonaFieldset
                titulo="Datos del Deudor (persona física)"
                valor={deudor}
                onChange={cambiarDeudor}
                autocompletado={deudorAutocompletado}
                invalidos={deudorInvalidos}
              />
            ) : (
              <div className="space-y-2.5 pl-3" style={{ borderLeft: '2px solid #009ee3' }}>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  Datos del Representante Legal
                  {garantia.representante_legal ? ` — ${garantia.representante_legal}` : ''}
                </p>
                {representanteAutocompletado && (
                  <p className="text-[11px] text-green-600">
                    ✓ Autocompletado desde una garantía anterior -- verificá que los datos sigan
                    vigentes
                  </p>
                )}
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
                    className={`${INPUT} ${representanteCedulaInvalida ? INPUT_INVALIDO : ''}`}
                  />
                </div>
                <PersonaFieldsetCampos
                  valor={representante}
                  onChange={cambiarRepresentante}
                  invalidos={representanteInvalidos}
                />
              </div>
            )}

            {garantia.tiene_fiador && (
              <PersonaFieldset
                titulo={`Datos del Fiador — ${garantia.fiador_nombre ?? ''}`}
                valor={fiador}
                onChange={cambiarFiador}
                autocompletado={fiadorAutocompletado}
                invalidos={fiadorInvalidos}
              />
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
                disabled={loading}
                className="px-4 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-60 transition"
                style={{ backgroundColor: '#009ee3' }}
              >
                {loading ? 'Generando...' : 'Guardar y Generar PDF'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function PersonaFieldset({
  titulo,
  valor,
  onChange,
  autocompletado,
  invalidos,
  compacto,
}: {
  titulo: string;
  valor: DatosPersona;
  onChange: (v: DatosPersona) => void;
  autocompletado?: boolean;
  invalidos: Set<CampoPersona>;
  compacto?: boolean;
}) {
  return (
    <div
      className={compacto ? 'space-y-2 pl-3' : 'space-y-2.5 pl-3'}
      style={{ borderLeft: '2px solid #009ee3' }}
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{titulo}</p>
      {autocompletado && (
        <p className="text-[11px] text-green-600">
          ✓ Autocompletado desde una garantía anterior -- verificá que los datos sigan vigentes
        </p>
      )}
      <PersonaFieldsetCampos
        valor={valor}
        onChange={onChange}
        invalidos={invalidos}
        compacto={compacto}
      />
    </div>
  );
}

export function PersonaFieldsetCampos({
  valor,
  onChange,
  invalidos,
  compacto,
}: {
  valor: DatosPersona;
  onChange: (v: DatosPersona) => void;
  invalidos: Set<CampoPersona>;
  compacto?: boolean;
}) {
  const input = compacto ? INPUT_COMPACTO : INPUT;
  return (
    <div className={compacto ? 'space-y-2' : 'space-y-3'}>
      <div
        className={
          compacto ? 'grid grid-cols-2 gap-x-4 gap-y-2' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'
        }
      >
        <div>
          <label className={LABEL}>Estado Civil *</label>
          <select
            value={valor.estadoCivil}
            onChange={(e) => onChange({ ...valor, estadoCivil: e.target.value as EstadoCivil })}
            className={`${input} bg-white ${invalidos.has('estadoCivil') ? INPUT_INVALIDO : ''}`}
          >
            <option value="">Seleccionar...</option>
            {ESTADO_CIVIL_OPCIONES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>Profesión / Oficio *</label>
          <input
            value={valor.profesion}
            onChange={(e) => onChange({ ...valor, profesion: e.target.value })}
            className={`${input} ${invalidos.has('profesion') ? INPUT_INVALIDO : ''}`}
          />
        </div>
      </div>
      <SelectorDireccion
        valor={valor}
        onChange={onChange}
        invalidos={invalidos}
        compacto={compacto}
      />
    </div>
  );
}

export function SelectorDireccion({
  valor,
  onChange,
  invalidos,
  compacto,
}: {
  valor: DatosPersona;
  onChange: (v: DatosPersona) => void;
  invalidos: Set<CampoPersona>;
  compacto?: boolean;
}) {
  const cantones = cantonesDe(valor.provincia);
  const distritos = distritosDe(valor.canton);
  const input = compacto ? INPUT_COMPACTO : INPUT;
  // Compacto (ModalEmitirPagare, modal panorámico): Provincia/Cantón/Distrito
  // en una sola fila de 3 columnas y Dirección Exacta abajo a todo el ancho --
  // pedido explícito para que la ubicación no consuma tantas filas verticales.
  if (compacto) {
    return (
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={LABEL}>Provincia *</label>
          <select
            value={valor.provincia}
            onChange={(e) =>
              onChange({ ...valor, provincia: e.target.value, canton: '', distrito: '' })
            }
            className={`${input} bg-white ${invalidos.has('provincia') ? INPUT_INVALIDO : ''}`}
          >
            <option value="">Seleccionar...</option>
            {PROVINCIAS_CR.map((p) => (
              <option key={p.nombre} value={p.nombre}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>Cantón *</label>
          <select
            value={valor.canton}
            onChange={(e) => onChange({ ...valor, canton: e.target.value, distrito: '' })}
            disabled={!valor.provincia}
            className={`${input} bg-white disabled:opacity-50 disabled:cursor-not-allowed ${invalidos.has('canton') ? INPUT_INVALIDO : ''}`}
          >
            <option value="">
              {valor.provincia ? 'Seleccionar...' : 'Elegí primero la provincia'}
            </option>
            {cantones.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>Distrito *</label>
          <select
            value={valor.distrito}
            onChange={(e) => onChange({ ...valor, distrito: e.target.value })}
            disabled={!valor.canton}
            className={`${input} bg-white disabled:opacity-50 disabled:cursor-not-allowed ${invalidos.has('distrito') ? INPUT_INVALIDO : ''}`}
          >
            <option value="">{valor.canton ? 'Seleccionar...' : 'Elegí primero el cantón'}</option>
            {distritos.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-3">
          <label className={LABEL}>Otras Señas / Barrio / Dirección Exacta *</label>
          <input
            value={valor.senas}
            onChange={(e) => onChange({ ...valor, senas: e.target.value })}
            className={`${input} ${invalidos.has('senas') ? INPUT_INVALIDO : ''}`}
            placeholder="Ej: 200m norte del parque, casa portón café"
          />
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label className={LABEL}>Provincia *</label>
        <select
          value={valor.provincia}
          onChange={(e) =>
            onChange({ ...valor, provincia: e.target.value, canton: '', distrito: '' })
          }
          className={`${INPUT} bg-white ${invalidos.has('provincia') ? INPUT_INVALIDO : ''}`}
        >
          <option value="">Seleccionar...</option>
          {PROVINCIAS_CR.map((p) => (
            <option key={p.nombre} value={p.nombre}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={LABEL}>Cantón *</label>
        <select
          value={valor.canton}
          onChange={(e) => onChange({ ...valor, canton: e.target.value, distrito: '' })}
          disabled={!valor.provincia}
          className={`${INPUT} bg-white disabled:opacity-50 disabled:cursor-not-allowed ${invalidos.has('canton') ? INPUT_INVALIDO : ''}`}
        >
          <option value="">
            {valor.provincia ? 'Seleccionar...' : 'Elegí primero la provincia'}
          </option>
          {cantones.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={LABEL}>Distrito *</label>
        <select
          value={valor.distrito}
          onChange={(e) => onChange({ ...valor, distrito: e.target.value })}
          disabled={!valor.canton}
          className={`${INPUT} bg-white disabled:opacity-50 disabled:cursor-not-allowed ${invalidos.has('distrito') ? INPUT_INVALIDO : ''}`}
        >
          <option value="">{valor.canton ? 'Seleccionar...' : 'Elegí primero el cantón'}</option>
          {distritos.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={LABEL}>Otras Señas / Barrio / Dirección Exacta *</label>
        <input
          value={valor.senas}
          onChange={(e) => onChange({ ...valor, senas: e.target.value })}
          className={`${INPUT} ${invalidos.has('senas') ? INPUT_INVALIDO : ''}`}
          placeholder="Ej: 200m norte del parque, casa portón café"
        />
      </div>
    </div>
  );
}
