import type { EstadoCivil } from './auditoria-legal';

export type EstadoSolicitudActualizacion =
  'ENVIADA' | 'DATOS_RECIBIDOS' | 'APROBADA' | 'EXPIRADA' | 'CANCELADA';
export type TipoPersonaSolicitud = 'FISICA' | 'JURIDICA';

/** Fila de la tabla solicitudes_actualizacion (select completo). */
export interface SolicitudActualizacion {
  id: number;
  contribuyente: string;
  cliente_nombre: string;
  tipo_persona: TipoPersonaSolicitud;
  estado: EstadoSolicitudActualizacion;
  token_expira_en: string;
  datos_temporales: DatosTemporalesSolicitud | null;
  url_cedula: string | null;
  url_personeria: string | null;
  enviada_en: string;
  respondida_en: string | null;
  aprobada_en: string | null;
  garantia_id: number | null;
  nota_revision: string | null;
  correo_destino: string | null;
}

/** Lo que el cliente completa en el formulario público. */
export interface DatosTemporalesSolicitud {
  nombre: string;
  cedula: string;
  estado_civil: EstadoCivil;
  profesion: string;
  domicilio: string;
  telefono?: string;
}

/** Body de POST /api/auditoria-legal/solicitudes-actualizacion (crear + enviar). */
export interface CrearSolicitudPayload {
  contribuyente: string;
  cliente_nombre: string;
  correo_destino: string;
}

/** Body de POST /api/actualizar-perfil/[token] (el cliente envía el formulario).
 *  Los archivos van en FormData aparte (cedula, personeria), no en este JSON --
 *  por eso es un alias y no una interfaz con miembros propios. */
export type EnviarFormularioPayload = DatosTemporalesSolicitud;

/** Respuesta de GET /api/actualizar-perfil/[token]. */
export interface TokenValidoResponse {
  valido: true;
  tipo_persona: TipoPersonaSolicitud;
  cliente_nombre: string;
  nota_revision: string | null;
  datos_previos: DatosTemporalesSolicitud | null;
}
export interface TokenInvalidoResponse {
  valido: false;
}
