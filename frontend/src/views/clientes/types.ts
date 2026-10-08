/** Tipos del módulo Clientes (lista, buscador global, ficha 360°, correos). */
import type { Cartera, MaestroCliente, Factura, Gestion, Promesa } from '@/types/database';
import type { TendenciaPagoPunto } from '@/types/analisis-pagos';
import type { ICPData } from '@/components/clientes/ficha/ficha-cliente';

// ── Lista de clientes (antes exportados desde app/(app)/clientes/page.tsx) ──
export interface ClienteRow {
  cliente_cod: string;
  cliente_nombre: string;
  contribuyente: string;
  vendedor_nombre: string;
  analista_email: string;
  analista_nombre: string;
  condicion_pago: string; // de maestro_clientes
  dimension: string; // de maestro_clientes
  nivel_precio: string | null;
  icp_score: number | null;
  icp_clasificacion: string | null;
  no_vencido: number;
  mora_1_30: number;
  mora_31_60: number;
  mora_61_90: number;
  mora_91_120: number;
  mora_120_plus: number;
  mora_total: number;
  total: number;
  dias_mora: number; // dias_mora no existe en cartera — siempre 0 (ver tabla-clientes.tsx)
  ultima_gestion_fecha: string | null;
  dias_sin_gestion: number;
}

export interface KPIsClientes {
  carteraFiltrada: number;
  moraFiltrada: number;
  pctMorosidad: number | null;
  totalClientes: number;
}

export interface AnalistaOpt {
  email: string;
  nombre: string;
}
export interface VendedorOpt {
  nombre: string;
}

export interface FiltrosClientes {
  q: string;
  analista: string;
  vendedor: string;
  plazo: string;
  nivelPrecio: string;
  dimension: string;
  sort: string; // 'mora_total' | 'total' | 'dias_sin_gestion' | 'cliente_nombre'
  dir: 'asc' | 'desc';
  page: number;
}

/** Forma del JSON de GET /clientes (fn_clientes_lista). */
export interface ClientesListaResult {
  rows: Omit<ClienteRow, 'dias_mora'>[];
  total_rows: number;
  kpi_cartera: number;
  kpi_mora: number;
  vendedores: string[];
  analistas: AnalistaOpt[];
  plazos: string[];
  niveles_precio: string[];
  dimensiones: string[];
}

// ── Buscador global (antes exportados desde app/api/clientes/buscar/route.ts) ──
export interface ClienteResultado {
  tipo: 'cliente';
  cliente_cod: string;
  cliente_nombre: string;
  vendedor_nombre: string | null;
}
export interface FacturaResultado {
  tipo: 'factura';
  documento: string;
  cliente_cod: string;
  cliente_nombre: string;
  saldo: number;
}
export interface MarcaResultado {
  tipo: 'marca';
  id: string;
  nombre: string;
  proveedor: string | null;
  comprador_id: string;
  comprador_nombre: string;
}
export interface BuscarResponse {
  clientes: ClienteResultado[];
  facturas: FacturaResultado[];
  marcas: MarcaResultado[];
}

// ── Ficha 360° (GET /clientes/{cod}/ficha) ──
export interface PedidoRetenidoFicha {
  id_pedido: string;
  estado_sic: string;
  total_mercaderia: number;
  motivo_retencion: string | null;
}

export interface FichaClienteResponse {
  cartera: Cartera;
  maestro: MaestroCliente | null;
  facturas: Factura[];
  gestiones: Gestion[];
  promesas: Promesa[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  solicitudes: any[];
  solicitante_map: Record<string, string>;
  icp: ICPData | null;
  tendencia_pago: TendenciaPagoPunto[];
  pedidos_retenidos: PedidoRetenidoFicha[];
  analista_email: string;
  analista_nombre: string;
  analista_telefono: string | null;
  analista_whatsapp: string | null;
  prev_cod: string | null;
  next_cod: string | null;
  posicion_en_lista: number | null;
  total_en_lista: number | null;
}

// ── Escrituras / correos ──
export interface OkResponse {
  ok: boolean;
}

export interface ContactoBody {
  cliente_cod: string;
  nombre_cxp?: string;
  telefono?: string;
  telefono2?: string;
  correo?: string;
}

export interface LogisticaBody {
  cliente_cod: string;
  dia_visita?: string[];
  dia_pago?: string[];
  metodo_pago?: string[];
  observaciones_logistica?: string;
  persona_recibe?: string;
  hora_recibo_inicio?: string;
  hora_recibo_fin?: string;
}

export interface AdjuntoBase64 {
  base64: string;
  mimeType: string;
  filename: string;
}

export interface EmailCobroBody {
  to: string;
  cc: string[];
  asunto: string;
  mensaje: string;
  adjunto: AdjuntoBase64 | null;
  clienteNombre: string;
  clienteCod: string;
  contribuyente: string;
}

export interface EstadoCuentaBody {
  cliente_cod: string;
  cliente_nombre: string;
  contribuyente: string;
  to_email: string;
  cc_emails?: string[];
  observaciones?: string;
  adjunto: AdjuntoBase64 | null;
}

export interface EstadoCuentaEnvioResponse {
  ok: boolean;
  email_sent: boolean;
  email_to: string;
  email_error: string | null;
  facturas_count: number;
  saldo_total: number;
}

export interface GenerarEmailBody {
  clienteNombre: string;
  condicionPago: string | null;
  saldoVencido: number;
  saldoTotal: number;
  maxDiasMora: number;
  nFacturasVenc: number;
  analistaNombre: string;
  asunto: string;
}

export interface CambiarEstadoBody {
  cliente_cod: string;
  estado: string;
  estado_anterior?: string;
}

export interface RecordatorioBody {
  cliente_cod: string;
  documento: string;
  nota: string;
}

/** GET /clientes/estado-cuenta/data */
export interface EstadoCuentaData {
  clienteNombre: string;
  contribuyente: string;
  clienteCod: string;
  correo: string;
  condicionPago: string | null;
  analistaNombre: string;
  analistaEmail: string;
  analistaTelefono: string | null;
  analistaWhatsapp: string | null;
  cuentas: {
    banco: string;
    moneda: string;
    tipo: string;
    numero: string;
    iban: string | null;
    orden: number;
  }[];
  facturas: {
    documento: string;
    fecha_documento: string;
    fecha_vencimiento: string;
    monto: number;
    saldo: number;
  }[];
  fechaCorte: string;
}
