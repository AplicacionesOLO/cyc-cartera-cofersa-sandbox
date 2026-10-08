/** Tipos de respuesta del módulo Configuración (mismas formas que las API Routes originales). */
import type { ConfigTabsData } from '@/components/configuracion/ConfigTabs';
import type { EventoActividad, ReglaEstado } from '@/components/configuracion/TabAutomatizaciones';
import type { LogRow } from '@/components/configuracion/TabLog';

export type ConfiguracionPantalla = ConfigTabsData;

export interface DataResponse<T> {
  data: T;
}
export interface OkResponse {
  ok: boolean;
}

export interface LogResponse {
  data: LogRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LogFiltros {
  tabla?: string;
  desde?: string;
  hasta?: string;
  page?: number;
}

export interface UsuarioFeed {
  id: string;
  nombre: string;
  email: string;
}
export type EventoFeed = EventoActividad & { usuario_id: string; usuario: UsuarioFeed | null };

export interface FeedResponse {
  data: EventoFeed[];
  mostrados: number;
  truncado: boolean;
}

export type ReglaAutomatizacionEstado = ReglaEstado;

/** Contacto activo del directorio (autocomplete de correos). */
export interface ContactoDirectorioActivo {
  id: string;
  nombre: string;
  email: string;
  cargo: string | null;
  area: string | null;
}

export type Cambios = Record<string, unknown>;
