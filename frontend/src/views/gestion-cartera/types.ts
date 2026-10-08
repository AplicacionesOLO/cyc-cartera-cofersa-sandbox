/** Tipos del módulo Gestión de Cartera (pedidos retenidos, saldos a favor, reporte de pagos). */
import type { PedidoRetenido } from '@/types/pedidos-retenidos';
import type { MatchSaldo } from '@/components/saldos-favor/saldos-favor-tabla';
import type { PresignedUpload } from '@/shared/api/presigned-upload';

export type { PedidosRetenidosResult } from '@/types/pedidos-retenidos';
export type { SaldoFavor, MatchSaldo } from '@/components/saldos-favor/saldos-favor-tabla';

/** Body de PUT /pedidos-retenidos/{id} (mismo que la API Route original). */
export interface ActualizarPedidoBody {
  estado_sic?: string;
  comentario_analista?: string;
  motivo_retencion?: string;
}

export interface ActualizarPedidoResponse {
  data: PedidoRetenido;
}

export interface MatchingListResponse {
  matches: MatchSaldo[];
}

export interface MatchingResumenResponse {
  total_clientes_con_match: number;
  total_matches: number;
  monto_total_matcheable: number;
}

/** Body de POST /clientes/pagos/reportar (antes `ReportarPagoBody` de la API Route). */
export interface ReportarPagoBody {
  cliente_cod: string;
  contribuyente: string;
  banco_origen: string;
  referencia: string;
  monto_transferido: number;
  fecha_transferencia: string;
  detalles: { factura_id: number; documento: string; monto_aplicado: number }[];
  notas?: string;
  /** Key S3 del comprobante en el bucket privado `comprobantes-pago` (antes URL pública). */
  url_comprobante?: string;
}

export interface ReportarPagoResponse {
  ok: boolean;
  reporte_id: string;
}

export interface ComprobanteUploadRequest {
  cliente_cod: string;
  filename: string;
  content_type: string;
}

export type ComprobanteUpload = PresignedUpload;
