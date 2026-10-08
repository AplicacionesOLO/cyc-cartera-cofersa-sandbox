/** Tipos del módulo Gestiones (bandeja, registro, notas rápidas y bitácora con IA). */

/** Solicitud ligada a una gestión (badge en la bandeja). */
export interface SolicitudGestionRef {
  gestion_id: string | null;
  estado: string;
}

/** GET /gestiones/referencias — datos que enriquecen la bandeja (antes 4 consultas al origen). */
export interface ReferenciasGestiones {
  solicitudes: SolicitudGestionRef[];
  /** promesa_id → estado */
  promesa_estados: Record<string, string>;
  /** cliente_cod → cliente_nombre (maestro_clientes) */
  nombres_cliente: Record<string, string>;
  /** Códigos con fila en cartera — determina si el link /clientes/[id] es válido */
  cods_con_cartera: string[];
}

/** Body de POST /clientes/gestiones/nueva (antes exportado desde la API Route). */
export interface NuevaGestionBody {
  // Identificación
  cliente_cod: string;
  contribuyente: string;

  // Gestión
  tipo: string;
  resultado: string;
  nota: string;
  fecha: string; // YYYY-MM-DD en America/Costa_Rica
  hora: string; // HH:MM:SS en America/Costa_Rica

  // Próxima acción
  proxima_accion?: string | null;
  proxima_accion_fecha?: string | null;

  // Metadata estructurada por resultado
  metadata?: Record<string, unknown> | null;

  // Promesa (solo si resultado = "Compromiso de pago confirmado")
  promesa?: {
    monto: number;
    fecha_promesa: string; // YYYY-MM-DD en America/Costa_Rica
    facturas_ids?: number[];
  } | null;
}

export interface NuevaGestionResponse {
  ok: boolean;
  gestion_id: string;
}

/** PATCH /clientes/gestiones */
export interface ActualizarGestionBody {
  id: string;
  tipo?: string;
  resultado?: string;
  nota?: string;
  promesa_fecha?: string;
  promesa_monto?: number;
}

/** POST /gestiones/rapida (registro simple de modal-gestion). */
export interface GestionRapidaBody {
  cliente_cod: string;
  contribuyente: string;
  analista_email: string;
  fecha: string;
  hora: string;
  tipo: string;
  resultado: string;
  nota: string;
  promesa_fecha?: string;
  promesa_monto?: number;
}

export interface CodigoContribuyente {
  cliente_cod: string;
  cliente_nombre: string;
}

export interface NotaRapidaResponse {
  contenido: string;
  updated_at: string | null;
}

export interface FormalizarBitacoraBody {
  nota: string;
  tipo: string;
  resultado: string;
  clienteNombre: string;
}

export interface OkResponse {
  ok: boolean;
}
