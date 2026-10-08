// src/types/auditoria-legal.ts
import type { PrioridadCola } from './dashboard-analista';

export type TipoTitulo = 'Pagaré' | 'Letra de Cambio';
export type EstadoCustodia = 'EN_BOVEDA' | 'ENVIADO_VENDEDOR' | 'EN_FIRMA';
/**
 * Cómo entró la garantía al sistema -- se fija UNA VEZ al registrar y nunca
 * cambia. 'EXISTENTE_FISICA' (digitalización de un título físico que ya
 * existía y ya está firmado, ver ModalSelectorTipoRegistro) nunca ofrece
 * Despachar/Confirmar Recepción en la tabla (botonPrincipal en
 * garantias-cliente.tsx), sin importar qué pase después con esa garantía --
 * no es un documento que el sistema origina, así que no tiene sentido
 * enviarlo a firma. 'EMITIDO_SISTEMA' es el flujo normal (Pagaré generado
 * desde cero o cualquier otro alta).
 */
export type OrigenRegistroGarantia = 'EMITIDO_SISTEMA' | 'EXISTENTE_FISICA';
export type TipoEventoGarantia =
  | 'APERTURA_EXPEDIENTE'
  | 'ENTREGA_A_VENDEDOR'
  | 'TRAMITE_DE_FIRMA'
  | 'REINGRESO_A_CUSTODIA'
  | 'SUSTITUCION_DE_TITULO'
  | 'ADJUNTO_DOCUMENTO'
  | 'CORRECCION_DATOS'
  | 'GENERACION_PAGARE';

export interface GarantiaListaRow {
  id: number;
  /** Consecutivo único de expediente legal, ej. 'PAG-2026-0001'. Se asigna una sola vez al registrar (fn_siguiente_consecutivo_garantia). */
  consecutivo: string;
  contribuyente: string;
  cliente_nombre: string;
  tipo_titulo: TipoTitulo;
  monto_garantizado: number;
  tiene_fiador: boolean;
  fiador_nombre: string | null;
  fiador_cedula: string | null;
  fiador_telefono: string | null;
  representante_legal: string | null;
  fecha_emision: string;
  fecha_vencimiento: string;
  /** Texto uniforme derivado -- "Archivero 1 · Gaveta A · Carpeta 04" en bóveda, o el auto-texto de custodia ("Con Vendedor: X") fuera de bóveda. Nunca se edita directo, se recalcula server-side. */
  ubicacion_archivero: string;
  // Partes estructuradas -- sólo tienen valor real mientras estado_custodia === 'EN_BOVEDA'
  // (se limpian a null en la transición de salida, ver [id]/custodia/route.ts).
  ubicacion_archivero_mueble: string | null;
  ubicacion_archivero_gaveta: string | null;
  ubicacion_archivero_carpeta: number | null;
  estado_custodia: EstadoCustodia;
  documento_pdf_url: string | null;
  analista_email: string;
  vendedor_cod: string | null;
  saldo_contribuyente: number;
  monto_objetivo: number;
  cobertura_pct: number;
  semaforo: PrioridadCola;
  vencido: boolean;
  documento_pagare_generado_en: string | null;
  origen_registro: OrigenRegistroGarantia;
}

export interface ContribuyenteBusqueda {
  contribuyente: string;
  cliente_nombre: string;
  n_codigos: number;
}

/**
 * Fila del tab "Sin Garantía" (ago 2026, fn_garantias_clientes_sin_garantia) --
 * un contribuyente con saldo activo en cartera (sync vigente) que NO tiene
 * ninguna garantía activa registrada. saldo_consolidado ya suma todos los
 * cliente_cod de esa cédula (multicódigo), no el saldo de un solo código.
 * vendedor_cod/vendedor_nombre son el responsable resuelto por mayor saldo
 * (mismo criterio que fn_resolver_responsables_contribuyente) -- sólo
 * informativos acá, el ajuste manual real ocurre dentro del modal de alta.
 */
export interface ClienteSinGarantiaRow {
  contribuyente: string;
  cliente_nombre: string;
  saldo_consolidado: number;
  n_codigos: number;
  vendedor_cod: string | null;
  vendedor_nombre: string;
  analista_email: string;
  // Semáforo de riesgo (ago 2026): mismo criterio de mora por tramo que el
  // semáforo de urgencia de la Cola del analista (CLAUDE.md §8) --
  // ROJO = mora 61-90/91-120/+120, AMBAR = mora 31-60, VERDE = resto.
  riesgo: 'ROJO' | 'AMBAR' | 'VERDE';
}

export interface SaldoContribuyente {
  saldo_actual: number;
  monto_objetivo: number;
}

// Shape real de https://api.hacienda.go.cr/fe/ae (verificado jul 2026 contra el
// contribuyente 3101295956): moroso/omiso vienen como los STRINGS 'SI'/'NO' --
// no booleanos --, regimen es un objeto, y tipoIdentificacion es un código
// numérico, no el texto 'Jurídica'/'Física'.
export interface HaciendaData {
  nombre?: string;
  tipoIdentificacion?: string; // código: '01' física, '02' jurídica, '03' DIMEX, '04' NITE
  regimen?: { codigo?: number; descripcion?: string } | string | null;
  situacion?: {
    moroso?: string | boolean; // la API devuelve 'SI' / 'NO'
    omiso?: string | boolean;
    estado?: string;
    administracionTributaria?: string;
  };
  actividades?: Array<{ codigo?: string; descripcion: string; estado: string; tipo?: string }>;
}

export interface RegistrarGarantiaPayload {
  contribuyente: string;
  cliente_nombre: string;
  tipo_titulo: TipoTitulo;
  monto_garantizado: number;
  tiene_fiador: boolean;
  fiador_nombre?: string;
  fiador_cedula?: string;
  fiador_telefono?: string;
  representante_legal?: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  // Ubicación estructurada (Spec 3, ago 2026) -- reemplaza el texto libre que
  // había antes. El servidor arma el texto uniforme de ubicacion_archivero a
  // partir de estos 3 valores (ver formatearUbicacionArchivo), no se manda
  // directo. Ver src/lib/auditoria-legal/ubicacion-archivo.ts para el catálogo.
  // Opcionales (las 3 juntas o ninguna): ModalEmitirPagare las omite del todo
  // -- el título nunca llega a estar físicamente en bóveda, se orquesta un
  // despacho a vendedor en el mismo paso.
  ubicacion_mueble?: string;
  ubicacion_gaveta?: string;
  ubicacion_carpeta?: number;
  /**
   * Estado inicial de custodia. Opcional: por defecto 'EN_BOVEDA'. Ya no lo
   * ofrece ningún flujo de la UI (ModalRegistrarGarantia sacó el selector) --
   * se deja el campo por si hace falta un alta programática distinta en el
   * futuro, pero hoy siempre llega undefined. No dispara correo al vendedor
   * -- eso lo hace la ruta /custodia.
   */
  estado_custodia?: EstadoCustodia;
  /** Quién origina el registro (ver OrigenRegistroGarantia). Opcional: por defecto 'EMITIDO_SISTEMA'. */
  origen_registro?: OrigenRegistroGarantia;
  /**
   * Ajuste manual del "Vendedor Responsable de Trámite" (Spec 2, ago 2026) --
   * por defecto se resuelve solo (el de mayor saldo entre los códigos de
   * cliente de la cédula, fn_resolver_responsables_contribuyente). Si se
   * manda, el servidor valida que esté realmente vinculado a esa cédula
   * (fn_vendedores_por_contribuyente) antes de usarlo. Nunca cambia
   * analista_email -- sólo a quién se despacha el título físico.
   */
  vendedor_cod_override?: string;
}

// Body de PATCH /api/auditoria-legal/garantias/[id]. Todos los campos son
// opcionales (es un PATCH: se manda sólo lo que se corrige). Los campos que NO
// aparecen acá no son editables por esa ruta y la rechaza con 400 si vienen:
// contribuyente/cliente_nombre (identidad de la garantía), estado_custodia
// ([id]/custodia), documento_pdf_url ([id]/documento), activo/reemplazada_por_id
// (flujo de sustitución del POST), analista_email/vendedor_cod (se resuelven
// automáticamente), registrado_por e id.
export interface EditarGarantiaPayload {
  tipo_titulo?: TipoTitulo;
  monto_garantizado?: number;
  tiene_fiador?: boolean;
  fiador_nombre?: string | null;
  fiador_cedula?: string | null;
  fiador_telefono?: string | null;
  representante_legal?: string | null;
  fecha_emision?: string;
  fecha_vencimiento?: string;
  // Ubicación estructurada -- los 3 vienen juntos o no viene ninguno (ver
  // validación en [id]/route.ts); igual que en el alta, el texto uniforme lo
  // arma el servidor, no se edita directo.
  ubicacion_mueble?: string;
  ubicacion_gaveta?: string;
  ubicacion_carpeta?: number;
}

export type AccionCustodia = 'ENTREGAR' | 'TRAMITE_FIRMA' | 'REINGRESAR';

export type EstadoCivil = 'Soltero' | 'Casado' | 'Divorciado' | 'Unión Libre';
export const ESTADO_CIVIL_OPCIONES: EstadoCivil[] = [
  'Soltero',
  'Casado',
  'Divorciado',
  'Unión Libre',
];

export interface PersonaLegal {
  cedula: string;
  nombre: string;
  estado_civil: EstadoCivil | null;
  profesion: string | null;
  domicilio: string | null;
  telefono: string | null;
}

/**
 * Body de POST /api/auditoria-legal/garantias/[id]/pagare. Los campos de
 * deudor/representante/fiador son condicionales según la plantilla:
 * - Física (garantia.contribuyente NO es jurídica): deudor_*
 * - Jurídica: representante_*
 * - Fiador: solo si garantia.tiene_fiador
 * La ruta valida cuáles corresponden según el contribuyente real, no confía
 * en que el cliente mande exactamente los correctos.
 */
export interface GenerarPagarePayload {
  tasa_interes_moratorio: number;
  lugar_emision: string;
  deudor_estado_civil?: EstadoCivil;
  deudor_profesion?: string;
  deudor_domicilio?: string;
  representante_cedula?: string;
  representante_estado_civil?: EstadoCivil;
  representante_profesion?: string;
  representante_domicilio?: string;
  fiador_estado_civil?: EstadoCivil;
  fiador_profesion?: string;
  fiador_domicilio?: string;
}

/** Fila de `garantia_eventos` para el modal de Historial (Ver Historial). */
export interface GarantiaEventoRow {
  id: number;
  tipo_evento: TipoEventoGarantia;
  nota: string | null;
  created_at: string;
  // el origen embed (FK garantia_eventos.usuario_id -> usuarios.id) -- null si el
  // usuario que registró el evento fue borrado después (no debería pasar, pero
  // el join left-join lo permite).
  usuarios: { nombre: string } | null;
}

/** Fila completa de `garantias` que necesita la vista de impresión del pagaré. */
export interface GarantiaPagareRow {
  id: number;
  consecutivo: string;
  contribuyente: string;
  cliente_nombre: string;
  tipo_titulo: TipoTitulo;
  monto_garantizado: number;
  fecha_emision: string;
  fecha_vencimiento: string;
  tiene_fiador: boolean;
  fiador_nombre: string | null;
  fiador_cedula: string | null;
  fiador_telefono: string | null;
  fiador_estado_civil: EstadoCivil | null;
  fiador_profesion: string | null;
  fiador_domicilio: string | null;
  representante_legal: string | null;
  representante_cedula: string | null;
  representante_estado_civil: EstadoCivil | null;
  representante_profesion: string | null;
  representante_domicilio: string | null;
  deudor_estado_civil: EstadoCivil | null;
  deudor_profesion: string | null;
  deudor_domicilio: string | null;
  tasa_interes_moratorio: number | null;
  lugar_emision: string | null;
  documento_pagare_generado_en: string | null;
}
