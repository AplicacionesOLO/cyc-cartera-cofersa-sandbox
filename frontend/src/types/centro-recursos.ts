export interface MiembroAcotado {
  cod: string;
  nombre: string;
  zona: string | null;
  telefono: string | null;
  analista_nombre: string | null;
}

export interface AgenteDirectorio {
  cod: string;
  nombre: string;
  supervisor_cod: string | null;
  supervisor_nombre: string | null;
  jefe_regional_cod: string | null;
  jefe_regional_nombre: string | null;
  zona: string | null;
  telefono: string | null;
  analista_nombre: string | null;
  tipo_canal: string;
  es_principal_acotado: boolean;
  miembros_acotado: MiembroAcotado[];
}

export interface JefeRegionalNodo {
  cod: string;
  nombre: string;
  supervisores: { cod: string; nombre: string }[];
  canalesEspeciales: { cod: string; nombre: string; tipo_canal: string }[];
  rutasControl: { cod: string; nombre: string }[];
}

export interface Marca {
  id: string;
  nombre: string;
  proveedor: string | null;
  notas: string | null;
}

export interface Comprador {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  marcas: Marca[];
}

export interface DocumentoRecurso {
  id: string;
  titulo: string;
  descripcion: string | null;
  categoria: string;
  tipo_archivo: string;
  url: string;
  subido_por: string;
  created_at: string;
}

export interface AplicacionRecurso {
  id: string;
  nombre: string;
  descripcion: string | null;
  url: string;
  icono: string;
  estado: string;
  orden: number;
  activo: boolean;
  created_at: string;
}
