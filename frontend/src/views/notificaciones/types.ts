/** Tipos del API de notificaciones, chat del equipo, tipo de cambio y Hacienda. */

export interface TipoCambioData {
  compra: number | null;
  venta: number | null;
  fecha: string | null;
  error: boolean;
}

export interface HaciendaData {
  nombre?: string;
  tipoIdentificacion?: string;
  regimen?: string;
  situacion?: { moroso?: boolean; omiso?: boolean; estado?: string };
  actividades?: Array<{ descripcion: string; estado: string }>;
}

/** GET /hacienda: siempre 200; el front decide según `error`/`notFound`. */
export interface HaciendaResponse {
  data: HaciendaData | null;
  notFound: boolean;
  error: boolean;
}

export interface CabysItem {
  codigo: string;
  descripcion: string;
  impuesto: number;
}

export interface CabysResponse {
  data: CabysItem[];
  error: boolean;
}

export interface EnviarMensajeResponse {
  ok: boolean;
  id: string;
  created_at: string;
}
