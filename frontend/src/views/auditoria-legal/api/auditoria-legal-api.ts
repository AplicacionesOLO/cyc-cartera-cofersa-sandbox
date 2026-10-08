/**
 * Auditoría y Control Legal: garantías, pagarés, custodia y solicitudes de actualización de perfil.
 * Reemplaza las API Routes /api/auditoria-legal/** y /api/actualizar-perfil/[token], y las consultas
 * directas de el SDK anterior de la pantalla de Garantías y sus modales.
 */
import { browserHttp } from '@/shared/api/browser-http';
import { seg, type HttpClient, type RequestOptions } from '@/shared/api/http-client';
import type { PresignedUpload } from '@/shared/api/presigned-upload';
import type {
  ClienteSinGarantiaRow,
  ContribuyenteBusqueda,
  EditarGarantiaPayload,
  GarantiaEventoRow,
  GarantiaListaRow,
  GenerarPagarePayload,
  PersonaLegal,
  RegistrarGarantiaPayload,
  SaldoContribuyente,
  AccionCustodia,
} from '@/types/auditoria-legal';
import type {
  CrearSolicitudPayload,
  SolicitudActualizacion,
  TokenValidoResponse,
} from '@/types/actualizacion-perfil';
import type {
  AccionSolicitud,
  AdjuntarDocumentoResponse,
  ArchivoMeta,
  ConteoCarpeta,
  CustodiaResponse,
  EditarGarantiaResponse,
  EnvioSolicitudResponse,
  FormularioActualizacionPayload,
  GarantiaActivaPrevia,
  PagareImprimibleResponse,
  RegistrarGarantiaResponse,
  SolicitudDetalle,
  UploadsActualizacionResponse,
  VendedorContribuyente,
  VendedorLista,
} from '../types';

export interface CustodiaPayload {
  accion: AccionCustodia;
  mueble?: string;
  gaveta?: string;
  carpeta?: number;
}

export function createAuditoriaLegalApi(http: HttpClient) {
  return {
    // ── Garantías: lecturas ────────────────────────────────────────────
    garantias: (miCartera: boolean, options?: RequestOptions) =>
      http.get<GarantiaListaRow[]>('/garantias', {
        ...options,
        params: { mi_cartera: miCartera || undefined },
      }),
    sinGarantia: (miCartera: boolean, options?: RequestOptions) =>
      http.get<ClienteSinGarantiaRow[]>('/garantias/sin-garantia', {
        ...options,
        params: { mi_cartera: miCartera || undefined },
      }),
    vendedores: (options?: RequestOptions) =>
      http.get<VendedorLista[]>('/garantias/vendedores', options),
    vendedorDeGarantia: (id: number, options?: RequestOptions) =>
      http.get<{ nombre: string | null }>(`/garantias/${seg(id)}/vendedor`, options),
    eventos: (id: number, options?: RequestOptions) =>
      http.get<GarantiaEventoRow[]>(`/garantias/${seg(id)}/eventos`, options),
    buscarContribuyentes: (q: string, options?: RequestOptions) =>
      http.get<ContribuyenteBusqueda[]>('/garantias/contribuyentes', { ...options, params: { q } }),
    saldoContribuyente: (contribuyente: string, options?: RequestOptions) =>
      http.get<SaldoContribuyente | null>('/garantias/contribuyentes/saldo', {
        ...options,
        params: { contribuyente },
      }),
    garantiaActiva: (contribuyente: string, options?: RequestOptions) =>
      http.get<GarantiaActivaPrevia | null>('/garantias/contribuyentes/garantia-activa', {
        ...options,
        params: { contribuyente },
      }),
    vendedoresContribuyente: (contribuyente: string, options?: RequestOptions) =>
      http.get<VendedorContribuyente[]>('/garantias/contribuyentes/vendedores', {
        ...options,
        params: { contribuyente },
      }),
    personasLegales: (cedulas: string[], options?: RequestOptions) =>
      http.get<PersonaLegal[]>('/garantias/personas-legales', {
        ...options,
        params: { cedulas: cedulas.join(',') },
      }),
    configPagare: (options?: RequestOptions) =>
      http.get<Record<string, string>>('/garantias/config-pagare', options),
    conteoCarpeta: (
      mueble: string,
      gaveta: string,
      carpeta: number,
      excluirId: number | null,
      options?: RequestOptions,
    ) =>
      http.get<ConteoCarpeta>('/garantias/carpetas/conteo', {
        ...options,
        params: { mueble, gaveta, carpeta, excluir_id: excluirId },
      }),
    siguienteCarpeta: (mueble: string, gaveta: string, desde: number, options?: RequestOptions) =>
      http.get<{ carpeta: number }>('/garantias/carpetas/siguiente', {
        ...options,
        params: { mueble, gaveta, desde },
      }),
    pagareImprimible: (id: number, options?: RequestOptions) =>
      http.get<PagareImprimibleResponse>(`/garantias/${seg(id)}/pagare`, options),

    // ── Garantías: escrituras ──────────────────────────────────────────
    registrar: (payload: RegistrarGarantiaPayload, options?: RequestOptions) =>
      http.post<RegistrarGarantiaResponse>('/garantias', payload, options),
    editar: (id: number, payload: EditarGarantiaPayload, options?: RequestOptions) =>
      http.patch<EditarGarantiaResponse>(`/garantias/${seg(id)}`, payload, options),
    custodia: (id: number, payload: CustodiaPayload, options?: RequestOptions) =>
      http.patch<CustodiaResponse>(`/garantias/${seg(id)}/custodia`, payload, options),
    documentoUploadUrl: (id: number, file: ArchivoMeta, options?: RequestOptions) =>
      http.post<PresignedUpload>(`/garantias/${seg(id)}/documento/upload-url`, file, options),
    adjuntarDocumento: (id: number, key: string, options?: RequestOptions) =>
      http.post<AdjuntarDocumentoResponse>(`/garantias/${seg(id)}/documento`, { key }, options),
    generarPagare: (id: number, payload: GenerarPagarePayload, options?: RequestOptions) =>
      http.post<{ ok: true }>(`/garantias/${seg(id)}/pagare`, payload, options),

    // ── Solicitudes de actualización ───────────────────────────────────
    solicitudes: (options?: RequestOptions) =>
      http.get<SolicitudActualizacion[]>('/solicitudes-actualizacion', options),
    crearSolicitud: (payload: CrearSolicitudPayload, options?: RequestOptions) =>
      http.post<EnvioSolicitudResponse>('/solicitudes-actualizacion', payload, options),
    solicitud: (id: number, options?: RequestOptions) =>
      http.get<SolicitudDetalle>(`/solicitudes-actualizacion/${seg(id)}`, options),
    gestionarSolicitud: <T = { ok: true }>(
      id: number,
      accion: AccionSolicitud,
      options?: RequestOptions,
    ) => http.patch<T>(`/solicitudes-actualizacion/${seg(id)}`, accion, options),

    // ── Portal público (sin sesión, token de un solo uso) ──────────────
    validarToken: (token: string, options?: RequestOptions) =>
      http.get<TokenValidoResponse>(`/actualizar-perfil/${seg(token)}`, options),
    uploadsActualizacion: (
      token: string,
      body: FormularioActualizacionPayload & {
        cedula_file: ArchivoMeta;
        personeria_file?: ArchivoMeta;
      },
      options?: RequestOptions,
    ) =>
      http.post<UploadsActualizacionResponse>(
        `/actualizar-perfil/${seg(token)}/archivos`,
        body,
        options,
      ),
    enviarActualizacion: (
      token: string,
      body: FormularioActualizacionPayload & { cedula_key: string; personeria_key?: string | null },
      options?: RequestOptions,
    ) => http.post<{ ok: true }>(`/actualizar-perfil/${seg(token)}`, body, options),
  };
}

export const auditoriaLegalApi = createAuditoriaLegalApi(browserHttp);
