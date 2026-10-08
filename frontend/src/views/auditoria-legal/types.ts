/** Tipos de respuesta del API de Auditoría y Control Legal (las filas usan los tipos de src/types). */
import type { AcreedorConfig } from '@/lib/auditoria-legal/pagare-template';
import type { GarantiaPagareRow, TipoTitulo } from '@/types/auditoria-legal';
import type {
  DatosTemporalesSolicitud,
  EstadoSolicitudActualizacion,
  TipoPersonaSolicitud,
} from '@/types/actualizacion-perfil';
import type { PresignedUpload } from '@/shared/api/presigned-upload';

export interface VendedorLista {
  cod: string;
  nombre: string;
}
export interface VendedorContribuyente {
  vendedor_cod: string;
  vendedor_nombre: string;
  saldo: number;
}
export interface GarantiaActivaPrevia {
  tipo_titulo: TipoTitulo | string;
  monto_garantizado: number;
}
export interface ConteoCarpeta {
  conteo: number;
  tope: number;
}

export interface RegistrarGarantiaResponse {
  ok: true;
  id: number;
  sustituyo: boolean;
}
export interface EditarGarantiaResponse {
  ok: true;
  cambios: number;
  sin_cambios?: boolean;
}
export interface CustodiaResponse {
  ok: true;
  nuevo_estado: string;
  email_sent: boolean;
  email_to: string | null;
  email_error: string | null;
}
export interface AdjuntarDocumentoResponse {
  ok: true;
  documento_pdf_url: string | null;
}

export interface PagareImprimibleResponse {
  garantia: GarantiaPagareRow | null;
  acreedor: AcreedorConfig;
}

export interface EnvioSolicitudResponse {
  ok: true;
  id?: number;
  link: string;
  email_to: string;
  email_sent: boolean;
  email_error: string | null;
}

export interface SolicitudDetalle {
  id: number;
  contribuyente: string;
  cliente_nombre: string;
  tipo_persona: TipoPersonaSolicitud;
  estado: EstadoSolicitudActualizacion;
  datos_temporales: DatosTemporalesSolicitud | null;
  nota_revision: string | null;
  respondida_en: string | null;
  url_cedula_firmada: string | null;
  url_personeria_firmada: string | null;
}

export type AccionSolicitud =
  | { accion: 'APROBAR'; garantia_id?: number }
  | { accion: 'RECHAZAR'; nota: string }
  | { accion: 'REENVIAR'; correo_destino: string }
  | { accion: 'CANCELAR' };

export interface ArchivoMeta {
  content_type: string;
  size: number;
}

export interface FormularioActualizacionPayload {
  nombre: string;
  cedula: string;
  estado_civil: string;
  profesion: string;
  domicilio: string;
  telefono: string;
}

export interface UploadsActualizacionResponse {
  cedula: PresignedUpload;
  personeria: PresignedUpload | null;
}
