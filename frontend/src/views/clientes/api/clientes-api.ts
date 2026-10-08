/** Clientes: lista, buscador global, ficha 360°, contacto/logística, estado y correos (ClientesApi). */
import { browserHttp } from '@/shared/api/browser-http';
import { seg, type HttpClient, type RequestOptions } from '@/shared/api/http-client';
import type {
  BuscarResponse,
  CambiarEstadoBody,
  ClientesListaResult,
  ContactoBody,
  EmailCobroBody,
  EstadoCuentaBody,
  EstadoCuentaData,
  EstadoCuentaEnvioResponse,
  FichaClienteResponse,
  FiltrosClientes,
  GenerarEmailBody,
  LogisticaBody,
  OkResponse,
  RecordatorioBody,
} from '../types';

type FiltrosLista = Omit<FiltrosClientes, 'page'>;

function listaParams(filtros: FiltrosLista) {
  return {
    q: filtros.q,
    analista: filtros.analista,
    vendedor: filtros.vendedor,
    plazo: filtros.plazo,
    nivelPrecio: filtros.nivelPrecio,
    dimension: filtros.dimension,
    sort: filtros.sort,
    dir: filtros.dir,
  };
}

export function createClientesApi(http: HttpClient) {
  return {
    /** Página de la lista (fn_clientes_lista: filtra, ordena y pagina en la base). */
    lista: (filtros: FiltrosLista, page: number, pageSize: number, options?: RequestOptions) =>
      http.get<ClientesListaResult>('/clientes', {
        ...options,
        params: { ...listaParams(filtros), page, page_size: pageSize },
      }),
    /** Todas las filas filtradas, sin paginar (botón "Descargar Excel"). */
    listaCompleta: (filtros: FiltrosLista, options?: RequestOptions) =>
      http.get<ClientesListaResult>('/clientes', {
        ...options,
        params: { ...listaParams(filtros), page: 1, todos: true },
      }),
    buscar: (q: string, options?: RequestOptions) =>
      http.get<BuscarResponse>('/clientes/buscar', { ...options, params: { q } }),
    /** Todo lo que necesita la Ficha 360°; `volver` habilita Anterior/Siguiente del listado. */
    ficha: (cod: string, volver: string | null, options?: RequestOptions) =>
      http.get<FichaClienteResponse>(`/clientes/${seg(cod)}/ficha`, {
        ...options,
        params: { volver },
      }),
    actualizarContacto: (body: ContactoBody, options?: RequestOptions) =>
      http.patch<OkResponse>('/clientes/contacto', body, options),
    actualizarLogistica: (body: LogisticaBody, options?: RequestOptions) =>
      http.patch<OkResponse>('/clientes/logistica', body, options),
    cambiarEstado: (body: CambiarEstadoBody, options?: RequestOptions) =>
      http.post<OkResponse & { estado: string }>('/clientes/estado', body, options),
    registrarRecordatorio: (body: RecordatorioBody, options?: RequestOptions) =>
      http.post<OkResponse>('/clientes/recordatorio', body, options),
    estadoCuentaData: (cod: string, options?: RequestOptions) =>
      http.get<EstadoCuentaData>('/clientes/estado-cuenta/data', { ...options, params: { cod } }),
    /** Envía el email y registra la gestión CORREO en el servidor. */
    enviarEmailCobro: (body: EmailCobroBody, options?: RequestOptions) =>
      http.post<{ email_sent: boolean }>('/clientes/email-cobro', body, options),
    enviarEstadoCuenta: (body: EstadoCuentaBody, options?: RequestOptions) =>
      http.post<EstadoCuentaEnvioResponse>('/clientes/estado-cuenta', body, options),
    generarEmailIA: (body: GenerarEmailBody, options?: RequestOptions) =>
      http.post<{ ok: boolean; texto: string }>('/ai/generate-email', body, options),
  };
}

export const clientesApi = createClientesApi(browserHttp);
