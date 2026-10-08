// src/lib/auditoria-legal/catalogo.ts
import type { AccionCustodia, EstadoCustodia, TipoEventoGarantia } from '@/types/auditoria-legal';
import type { PrioridadCola } from '@/types/dashboard-analista';
import type { EstadoSolicitudActualizacion } from '@/types/actualizacion-perfil';

/**
 * `desde` es una LISTA de estados válidos de origen, no uno solo: el papel puede
 * volver a bóveda tanto desde el vendedor (lo devolvió sin firmar) como desde
 * trámite de firma (el cliente ya firmó). Modelarlo con un único estado dejaba
 * trabada cualquier garantía en 'ENVIADO_VENDEDOR' que se venciera, sin forma de
 * cerrar la custodia del documento físico.
 */
export const ACCION_CUSTODIA_CFG: Record<
  AccionCustodia,
  { label: string; desde: EstadoCustodia[]; hacia: EstadoCustodia; evento: TipoEventoGarantia }
> = {
  ENTREGAR: {
    label: 'Despachar a Vendedor',
    desde: ['EN_BOVEDA'],
    hacia: 'ENVIADO_VENDEDOR',
    evento: 'ENTREGA_A_VENDEDOR',
  },
  TRAMITE_FIRMA: {
    label: 'Enviar a Trámite de Firma',
    desde: ['ENVIADO_VENDEDOR'],
    hacia: 'EN_FIRMA',
    evento: 'TRAMITE_DE_FIRMA',
  },
  REINGRESAR: {
    label: 'Reingresar a Custodia',
    desde: ['ENVIADO_VENDEDOR', 'EN_FIRMA'],
    hacia: 'EN_BOVEDA',
    evento: 'REINGRESO_A_CUSTODIA',
  },
};

export const ESTADO_CUSTODIA_LABEL: Record<EstadoCustodia, string> = {
  EN_BOVEDA: 'En Bóveda',
  ENVIADO_VENDEDOR: 'Enviado a Vendedor',
  EN_FIRMA: 'En Firma',
};

// Etiquetas humanas para el timeline de Ver Historial (Modal de Historial).
// Cubre los 8 valores del CHECK garantia_eventos_tipo_evento_check.
export const TIPO_EVENTO_LABEL: Record<TipoEventoGarantia, string> = {
  APERTURA_EXPEDIENTE: 'Apertura de Expediente',
  ENTREGA_A_VENDEDOR: 'Entrega a Vendedor',
  TRAMITE_DE_FIRMA: 'Envío a Trámite de Firma',
  REINGRESO_A_CUSTODIA: 'Reingreso a Custodia',
  SUSTITUCION_DE_TITULO: 'Sustitución de Título',
  ADJUNTO_DOCUMENTO: 'Documento Adjuntado',
  CORRECCION_DATOS: 'Corrección de Datos',
  GENERACION_PAGARE: 'Generación del Pagaré',
};

export const SEMAFORO_COLOR: Record<PrioridadCola, { bg: string; text: string }> = {
  ROJO: { bg: '#fee2e2', text: '#dc2626' },
  AMBAR: { bg: '#fef3c7', text: '#d97706' },
  VERDE: { bg: '#e6f4ea', text: '#16a34a' },
};

// Etiqueta legible del badge de Riesgo en "Sin Garantía" (ago 2026) -- mismo
// semáforo/colores que SEMAFORO_COLOR, sólo cambia el texto (más descriptivo
// que el código crudo ROJO/AMBAR/VERDE para un badge de tabla).
export const RIESGO_LABEL: Record<PrioridadCola, string> = {
  ROJO: 'Alto Riesgo',
  AMBAR: 'Riesgo Medio',
  VERDE: 'Bajo Riesgo',
};

// Badges del portal de actualización (Sin Garantía) -- mismo estilo de color
// plano que CUSTODIA_BADGE, sin emoji (CLAUDE.md §4, sistema de diseño).
export const ESTADO_SOLICITUD_LABEL: Record<EstadoSolicitudActualizacion, string> = {
  ENVIADA: 'Actualización Enviada',
  DATOS_RECIBIDOS: 'Datos Recibidos — Pendiente de Revisión',
  APROBADA: 'Aprobada',
  EXPIRADA: 'Enlace Vencido',
  // No debería llegar a pintarse -- fetchSolicitudes en garantias-cliente.tsx
  // ni siquiera trae CANCELADA (una vez cancelada, la fila vuelve a "sin
  // solicitud"). Se completa igual para que el Record quede exhaustivo.
  CANCELADA: 'Cancelada',
};
export const ESTADO_SOLICITUD_BADGE: Record<
  EstadoSolicitudActualizacion,
  { bg: string; text: string }
> = {
  ENVIADA: { bg: '#fef3c7', text: '#d97706' },
  DATOS_RECIBIDOS: { bg: '#dbeafe', text: '#1d4ed8' },
  APROBADA: { bg: '#dcfce7', text: '#15803d' },
  EXPIRADA: { bg: '#f1f5f9', text: '#64748b' },
  CANCELADA: { bg: '#f1f5f9', text: '#64748b' },
};
