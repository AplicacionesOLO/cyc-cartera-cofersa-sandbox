/** Centro de Recursos (antes /api/centro-recursos/* y consultas directas al origen del page.tsx). */
import { browserHttp } from '@/shared/api/browser-http';
import { seg, type HttpClient, type RequestOptions } from '@/shared/api/http-client';
import type { AplicacionRecurso, DocumentoRecurso } from '@/types/centro-recursos';
import type {
  CambiosAplicacion,
  CentroRecursosPaginaResponse,
  DataResponse,
  MarcaFila,
  NuevaAplicacion,
  NuevaMarca,
  UrlCargaDocumento,
} from '../types';

export function createCentroRecursosApi(http: HttpClient) {
  return {
    pagina: (options?: RequestOptions) =>
      http.get<CentroRecursosPaginaResponse>('/centro-recursos', options),
    aplicaciones: (options?: RequestOptions) =>
      http.get<DataResponse<AplicacionRecurso[]>>('/centro-recursos/aplicaciones', options),
    crearAplicacion: (body: NuevaAplicacion, options?: RequestOptions) =>
      http.post<DataResponse<AplicacionRecurso>>('/centro-recursos/aplicaciones', body, options),
    actualizarAplicacion: (id: string, body: CambiosAplicacion, options?: RequestOptions) =>
      http.put<DataResponse<AplicacionRecurso>>(
        `/centro-recursos/aplicaciones/${seg(id)}`,
        body,
        options,
      ),
    documentos: (options?: RequestOptions) =>
      http.get<DataResponse<DocumentoRecurso[]>>('/centro-recursos/documentos', options),
    urlCargaDocumento: (filename: string, contentType: string, options?: RequestOptions) =>
      http.post<UrlCargaDocumento>(
        '/centro-recursos/documentos/upload-url',
        { filename, content_type: contentType },
        options,
      ),
    registrarDocumento: (
      body: { key: string; titulo: string; descripcion: string; categoria: string },
      options?: RequestOptions,
    ) => http.post<DataResponse<DocumentoRecurso>>('/centro-recursos/documentos', body, options),
    crearMarca: (body: NuevaMarca, options?: RequestOptions) =>
      http.post<DataResponse<MarcaFila>>('/centro-recursos/marcas', body, options),
    actualizarMarca: (
      id: string,
      body: { nombre?: string; comprador_id?: string },
      options?: RequestOptions,
    ) => http.put<DataResponse<MarcaFila>>(`/centro-recursos/marcas/${seg(id)}`, body, options),
  };
}

export const centroRecursosApi = createCentroRecursosApi(browserHttp);
