export type Rol = 'COORDINADOR' | 'ANALISTA' | 'ANALISTA_RIESGO' | 'GERENCIA';
export type EstadoPromesa =
  'PENDIENTE' | 'CUMPLIDA' | 'INCUMPLIDA' | 'ABONO_PARCIAL' | 'REPROGRAMADA';

// Evento del mini-timeline de una promesa (guardado en promesas.eventos JSONB)
export interface EventoPromesa {
  fecha: string; // YYYY-MM-DD
  tipo: 'creada' | 'cumplida' | 'incumplida' | 'abono' | 'reprogramada' | 'nota';
  descripcion: string;
  por: string; // email del usuario que generó el evento
}
export type NivelScore = 'ROJO' | 'AMARILLO' | 'VERDE';

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  iniciales: string;
  color: string;
  activo: boolean;
  meta_individual: number;
  tiene_cartera_asignada: boolean;
  created_at: string;
}

export interface Cartera {
  id: number;
  contribuyente: string;
  cliente_cod: string;
  cliente_nombre: string;
  vendedor_nombre: string;
  no_vencido: number;
  mora_1_30: number;
  mora_31_60: number;
  mora_61_90: number;
  mora_91_120: number;
  mora_120_plus: number;
  total: number;
  dias_mora: number;
  estado: string;
  sync_id: string;
  fecha_corte: string;
  updated_at: string;
}

export interface Factura {
  id: number;
  contribuyente: string;
  cliente_nombre: string;
  documento: string;
  fecha_documento: string;
  fecha_vencimiento: string;
  monto: number;
  saldo: number;
  sync_id: string;
}

export interface MaestroCliente {
  id: number;
  contribuyente: string;
  cliente_cod: string;
  cliente_nombre: string;
  vendedor_nombre: string;
  analista_email: string;
  analista_nombre: string;
  vendedor_cod: string;
  nombre_cxp: string;
  telefono: string;
  telefono2: string;
  correo: string;
  limite_credito: number;
  condicion_pago: string;
  estado_manual: string;
  agrupacion: string;
  dimension: string;
  updated_at: string;
  // Logística y Cobro — sincronizadas desde el ERP (GAS)
  latitud: number | null;
  longitud: number | null;
  cantidad_impresiones: number;
  cliente_tramita: string;
  nivel_precio?: string | null;
  // Logística y Cobro — exclusivas del SIC (protegidas del sync)
  dia_visita: string[] | null;
  dia_pago: string[] | null;
  metodo_pago: string[] | null;
  observaciones_logistica: string | null;
  hora_recibo_inicio: string | null;
  hora_recibo_fin: string | null;
  persona_recibe: string | null;
}

export interface Gestion {
  id: string;
  cliente_cod: string;
  contribuyente: string;
  analista_email: string; // quién registró la gestión
  fecha: string;
  hora: string;
  tipo: string;
  resultado: string;
  nota: string;
  // ── campos legacy (mantener para compatibilidad) ──────────────────
  promesa_fecha: string | null;
  promesa_monto: number | null;
  // ── campos nuevos Sprint Gestiones v2 ─────────────────────────────
  proxima_accion: string | null; // 'esperar_pago' | 'recontactar' | 'escalar' | 'crear_solicitud' | 'sin_seguimiento'
  proxima_accion_fecha: string | null; // DATE en America/Costa_Rica
  promesa_id: string | null; // FK a promesas.id
  metadata: Record<string, unknown> | null; // JSONB libre por resultado
  archived: boolean; // para sprint de archivado futuro
  legacy: boolean; // marca registros pre-v2
  created_at: string;
  activo?: boolean;
}

export interface Promesa {
  id: string;
  cliente_cod: string;
  cliente_nombre: string | null; // desnormalizado para la bandeja
  contribuyente: string;
  analista_email: string;
  fecha_creacion: string;
  monto: number;
  fecha_promesa: string;
  estado: EstadoPromesa;
  notas: string;
  updated_at: string;
  activo?: boolean;
  // ── Sprint Centro de Seguimiento ──────────────────────────────────
  gestion_id: string | null; // FK a gestiones.id (trazabilidad)
  reprogramada_de_id: string | null; // FK a promesas.id (auto-ref)
  fecha_validacion: string | null; // DATE
  validado_por: string | null; // email validador
  comentario_validacion: string | null;
  monto_abono_parcial: number | null;
  eventos: EventoPromesa[] | null; // mini-timeline JSONB
}

export interface ConfigSistema {
  clave: string;
  valor: string;
  descripcion: string;
}

export type EstadoSolicitud = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
export type TipoSolicitud = 'AUMENTO_LIMITE' | 'EXCEPCION_CREDITO' | 'NOTA_CREDITO';
export type TipoNotif =
  'SOLICITUD' | 'PROMESA' | 'ALERTA' | 'SYNC' | 'PEDIDO_RETENIDO' | 'GARANTIA';

export interface Solicitud {
  id: string;
  tipo: string; // acepta slugs nuevos + legacy uppercase
  destinatario: string | null; // 'coordinador' | 'comercial' | 'logistica' | 'otro'
  cliente_id: number | null;
  cliente_cod: string | null;
  cliente_nombre: string | null;
  solicitante_id: string | null;
  revisor_id: string | null;
  monto_actual: number | null;
  monto_solicitado: number | null;
  monto: number | null;
  justificacion: string;
  comentario_revisor: string | null;
  motivo_nota: string | null;
  documento_ref: string | null;
  fecha_limite: string | null;
  para_email: string | null; // correo principal al que se envió
  cc_emails: string[] | null; // correos en copia
  estado: string; // legacy MAYÚSCULA o estados oficiales nuevos
  created_at: string;
  updated_at: string;
  // ── Sprint Centro Operativo de Solicitudes ────────────────────────
  gestion_id: string | null; // FK a gestiones.id (trazabilidad)
  area: string | null; // AreaKey del catálogo nuevo
  prioridad: 'Alta' | 'Media' | 'Baja' | null;
  sla_horas: number | null;
  sla_vencimiento: string | null; // TIMESTAMPTZ
  responsable_nombre: string | null;
  responsable_email: string | null;
  descripcion: string | null;
  observaciones_internas: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  datos: Record<string, any> | null; // jsonb (facturas, adjuntos, etc.)
  numero_consecutivo: number | null; // SIC-XXXXX (auto-incrementado en BD)
}

// Comentario interno de una solicitud
export interface SolicitudComentario {
  id: string;
  solicitud_id: string;
  usuario_id: string;
  contenido: string;
  created_at: string;
}

// Cambio de estado registrado en el historial
export interface SolicitudHistorialEstado {
  id: string;
  solicitud_id: string;
  estado_anterior: string | null;
  estado_nuevo: string;
  usuario_id: string;
  nota: string | null;
  created_at: string;
}

export interface Notificacion {
  id: string;
  usuario_id: string;
  tipo: TipoNotif;
  titulo: string;
  mensaje: string | null;
  leida: boolean;
  link: string | null;
  created_at: string;
}

// ── Chat interno ──────────────────────────────────────────────────────

export interface MensajeChat {
  id: string;
  usuario_id: string;
  mensaje: string;
  created_at: string;
}

/** MensajeChat con los datos del remitente ya incluidos (resultado del join) */
export interface MensajeChatConUsuario extends MensajeChat {
  usuario: Pick<Usuario, 'nombre' | 'iniciales' | 'color'> | null;
}

/** Estado de presencia de un miembro en el canal de chat */
export interface PresenciaChat {
  usuario_id: string;
  nombre: string;
  iniciales: string;
  color: string;
  online_at: string;
}

export interface NotaRapida {
  id: string;
  usuario_id: string;
  fecha: string; // YYYY-MM-DD
  contenido: string | null;
  sincronizado_google: boolean;
  created_at: string;
  updated_at: string;
}

// Tipo para la base de datos completa (para el cliente el origen tipado)
export type Database = {
  public: {
    Tables: {
      usuarios: { Row: Usuario; Insert: Partial<Usuario>; Update: Partial<Usuario> };
      cartera: { Row: Cartera; Insert: Partial<Cartera>; Update: Partial<Cartera> };
      facturas: { Row: Factura; Insert: Partial<Factura>; Update: Partial<Factura> };
      maestro_clientes: {
        Row: MaestroCliente;
        Insert: Partial<MaestroCliente>;
        Update: Partial<MaestroCliente>;
      };
      gestiones: { Row: Gestion; Insert: Partial<Gestion>; Update: Partial<Gestion> };
      promesas: { Row: Promesa; Insert: Partial<Promesa>; Update: Partial<Promesa> };
      config_sistema: {
        Row: ConfigSistema;
        Insert: Partial<ConfigSistema>;
        Update: Partial<ConfigSistema>;
      };
      solicitudes: { Row: Solicitud; Insert: Partial<Solicitud>; Update: Partial<Solicitud> };
      notificaciones: {
        Row: Notificacion;
        Insert: Partial<Notificacion>;
        Update: Partial<Notificacion>;
      };
      notas_rapidas: { Row: NotaRapida; Insert: Partial<NotaRapida>; Update: Partial<NotaRapida> };
      mensajes_chat: {
        Row: MensajeChat;
        Insert: Partial<MensajeChat>;
        Update: Partial<MensajeChat>;
      };
      solicitud_comentarios: {
        Row: SolicitudComentario;
        Insert: Partial<SolicitudComentario>;
        Update: Partial<SolicitudComentario>;
      };
      solicitud_historial_estados: {
        Row: SolicitudHistorialEstado;
        Insert: Partial<SolicitudHistorialEstado>;
        Update: Partial<SolicitudHistorialEstado>;
      };
    };
  };
};
