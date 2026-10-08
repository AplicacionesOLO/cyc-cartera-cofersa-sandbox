/** Tipos del módulo Solicitudes (respuestas del API /solicitudes/*). */
import type {
  Cartera,
  Factura,
  MaestroCliente,
  Solicitud,
  SolicitudComentario,
  SolicitudHistorialEstado,
} from '@/types/database';

export interface ComentarioConAutor extends SolicitudComentario {
  autor_nombre: string;
}

export interface HistorialConAutor extends SolicitudHistorialEstado {
  autor_nombre: string;
}

export interface GestionOrigenLink {
  id: string;
  resultado: string;
  tipo: string;
  fecha: string;
  cliente_cod: string;
}

export interface GestionOrigenPreload {
  id: string;
  resultado: string;
  nota: string;
  tipo: string;
  fecha: string;
}

/** Cliente enriquecido que recibe el formulario de /solicitudes/nueva. */
export interface ClienteConDatos {
  cliente_cod: string;
  cliente_nombre: string;
  contribuyente: string;
  vendedor_nombre: string;
  analista_email: string;
  analista_nombre: string;
  limite_credito: number;
  estado_manual: string;
  mora_total: number;
  tramo_peor: string;
}

/** GET /solicitudes */
export interface ListaSolicitudesResponse {
  solicitudes: Solicitud[];
  solicitante_map: Record<string, string>;
}

/** GET /solicitudes/{id} */
export interface DetalleSolicitudResponse {
  solicitud: Solicitud;
  comentarios: ComentarioConAutor[];
  historial: HistorialConAutor[];
  gestion_origen: GestionOrigenLink | null;
  solicitante_nombre: string;
}

export type CarteraResumen = Pick<
  Cartera,
  | 'cliente_cod'
  | 'cliente_nombre'
  | 'contribuyente'
  | 'vendedor_nombre'
  | 'mora_1_30'
  | 'mora_31_60'
  | 'mora_61_90'
  | 'mora_91_120'
  | 'mora_120_plus'
>;

export type MaestroResumen = Pick<
  MaestroCliente,
  'cliente_cod' | 'analista_email' | 'limite_credito' | 'estado_manual'
>;

/** GET /solicitudes/nueva-clientes */
export interface NuevaSolicitudClientesResponse {
  cartera: CarteraResumen[];
  maestro: MaestroResumen[];
  analista_nombres: Record<string, string>;
  solo_mi_cartera: boolean;
  gestion_origen: GestionOrigenPreload | null;
}

/** GET /solicitudes/nueva-contexto?cod= */
export interface NuevaSolicitudContextoResponse {
  cartera: Cartera;
  maestro: MaestroCliente | null;
  facturas: Factura[];
}

/** POST /solicitudes (ambas ramas: catálogo y legacy). */
export interface CrearSolicitudResponse {
  ok: boolean;
  id: string;
  numero?: string;
  numero_consecutivo?: number;
  email_sent: boolean;
  email_to: string | null;
  email_error: string | null;
}

export interface CambiarEstadoResponse {
  ok: boolean;
  estado_anterior: string;
  estado_nuevo: string;
}

export interface ComentarioCreado {
  id: string;
  contenido: string;
  created_at: string;
  usuario_id: string;
  usuario_nombre: string;
}

export interface AdjuntoUploadUrl {
  url: string;
  key: string;
  method?: string;
  headers?: Record<string, string>;
}
