/** Tipos del API del Centro de Recursos (filas crudas que antes leía el Server Component). */
import type { AplicacionRecurso, DocumentoRecurso } from '@/types/centro-recursos';

/** `type` (no interface) para que el page.tsx lo pueda tratar como Record<string, unknown>. */
export type VendedorFila = {
  cod: string;
  nombre: string;
  zona: string | null;
  telefono: string | null;
  supervisor_cod: string | null;
  analista_email: string | null;
  tipo_canal: string | null;
};

export interface SupervisorFila {
  cod: string;
  nombre: string;
  es_jefe_regional: boolean;
  jefe_regional_cod: string | null;
}

export interface DirectorioFila {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  es_comprador: boolean;
}

export interface MarcaFila {
  id: string;
  nombre: string;
  proveedor: string | null;
  comprador_id: string;
  notas: string | null;
}

/** GET /centro-recursos: mismo contenido que las 9 consultas en paralelo del page.tsx original. */
export interface CentroRecursosPaginaResponse {
  vendedores: VendedorFila[];
  supervisores: SupervisorFila[];
  usuarios: Array<{ email: string; nombre: string }>;
  documentos: DocumentoRecurso[];
  aplicaciones: AplicacionRecurso[];
  grupos: Array<{ principal_cod: string; activo: boolean }>;
  miembros: Array<{ principal_cod: string; vendedor_cod: string; activo: boolean }>;
  directorio: DirectorioFila[];
  marcas: MarcaFila[];
}

export interface DataResponse<T> {
  data: T;
}

export interface NuevaAplicacion {
  nombre: string;
  descripcion: string;
  url: string;
  icono: string;
  estado: string;
}

export interface CambiosAplicacion {
  nombre?: string;
  url?: string;
  descripcion?: string;
  orden?: number;
}

export interface NuevaMarca {
  nombre: string;
  proveedor: string;
  comprador_id: string;
  notas: string;
}

export interface NuevoDocumento {
  titulo: string;
  descripcion: string;
  categoria: string;
  file: File;
}

export interface UrlCargaDocumento {
  url: string;
  key: string;
  method?: string;
  headers?: Record<string, string>;
}
