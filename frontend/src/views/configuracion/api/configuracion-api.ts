/** Configuración del sistema (antes /api/configuracion/** + carga con service_role de la página). */
import { browserHttp } from '@/shared/api/browser-http';
import { seg, type HttpClient, type RequestOptions } from '@/shared/api/http-client';
import type { DirectorioRow } from '@/components/configuracion/TabDirectorio';
import type { ParamRow } from '@/components/configuracion/TabParametros';
import type { SemaforoData } from '@/components/configuracion/TabSemaforo';
import type { SupervisorRow } from '@/components/configuracion/TabSupervisores';
import type { UsuarioRow } from '@/components/configuracion/TabUsuarios';
import type { VentaMensualRow } from '@/components/configuracion/TabCierreMes';
import type { RutaGrupo, VendedorRow } from '@/components/configuracion/TabVendedores';
import type {
  Cambios,
  ConfiguracionPantalla,
  ContactoDirectorioActivo,
  DataResponse,
  FeedResponse,
  LogFiltros,
  LogResponse,
  OkResponse,
  ReglaAutomatizacionEstado,
} from '../types';

export function createConfiguracionApi(http: HttpClient) {
  return {
    /** Toda la carga inicial de la pantalla /configuracion (solo coordinador). */
    pantalla: (options?: RequestOptions) =>
      http.get<ConfiguracionPantalla>('/configuracion', options),

    // ── usuarios ──
    usuarios: (options?: RequestOptions) =>
      http.get<DataResponse<UsuarioRow[]>>('/configuracion/usuarios', options),
    crearUsuario: (body: Cambios) =>
      http.post<DataResponse<UsuarioRow>>('/configuracion/usuarios', body),
    actualizarUsuario: (id: string, body: Cambios) =>
      http.put<DataResponse<UsuarioRow>>(`/configuracion/usuarios/${seg(id)}`, body),

    // ── vendedores ──
    vendedores: (options?: RequestOptions) =>
      http.get<DataResponse<VendedorRow[]>>('/configuracion/vendedores', options),
    crearVendedor: (body: Cambios) =>
      http.post<DataResponse<VendedorRow>>('/configuracion/vendedores', body),
    actualizarVendedor: (cod: string, body: Cambios) =>
      http.put<DataResponse<VendedorRow>>(`/configuracion/vendedores/${seg(cod)}`, body),
    desactivarVendedor: (cod: string) =>
      http.delete<OkResponse>(`/configuracion/vendedores/${seg(cod)}`),

    // ── supervisores ──
    supervisores: (options?: RequestOptions) =>
      http.get<DataResponse<SupervisorRow[]>>('/configuracion/supervisores', options),
    crearSupervisor: (body: Cambios) =>
      http.post<DataResponse<SupervisorRow>>('/configuracion/supervisores', body),
    actualizarSupervisor: (cod: string, body: Cambios) =>
      http.put<DataResponse<SupervisorRow>>(`/configuracion/supervisores/${seg(cod)}`, body),
    desactivarSupervisor: (cod: string) =>
      http.delete<OkResponse>(`/configuracion/supervisores/${seg(cod)}`),

    // ── directorio ──
    directorio: (params?: { area?: string; q?: string }, options?: RequestOptions) =>
      http.get<DataResponse<DirectorioRow[]>>('/configuracion/directorio', { ...options, params }),
    crearContacto: (body: Cambios) =>
      http.post<DataResponse<DirectorioRow>>('/configuracion/directorio', body),
    actualizarContacto: (id: string, body: Cambios) =>
      http.put<DataResponse<DirectorioRow>>(`/configuracion/directorio/${seg(id)}`, body),
    desactivarContacto: (id: string) =>
      http.delete<OkResponse>(`/configuracion/directorio/${seg(id)}`),
    /** Contactos activos para el autocomplete (cualquier usuario activo). */
    contactosActivos: (
      params?: { q?: string; area?: string; limit?: number },
      options?: RequestOptions,
    ) =>
      http.get<DataResponse<ContactoDirectorioActivo[]>>('/configuracion/directorio-activo', {
        ...options,
        params,
      }),

    // ── portafolio acotado ──
    rutas: (options?: RequestOptions) =>
      http.get<DataResponse<RutaGrupo[]>>('/configuracion/portafolio-acotado', options),
    crearRuta: (body: Cambios) => http.post<OkResponse>('/configuracion/portafolio-acotado', body),
    actualizarRuta: (principalCod: string, body: Cambios) =>
      http.put<OkResponse>(`/configuracion/portafolio-acotado/${seg(principalCod)}`, body),
    desactivarRuta: (principalCod: string) =>
      http.delete<OkResponse>(`/configuracion/portafolio-acotado/${seg(principalCod)}`),

    // ── config_sistema ──
    parametros: (options?: RequestOptions) =>
      http.get<DataResponse<ParamRow[]>>('/configuracion/parametros', options),
    guardarParametro: (clave: string, valor: string) =>
      http.put<DataResponse<ParamRow>>('/configuracion/parametros', { clave, valor }),
    semaforo: (options?: RequestOptions) =>
      http.get<DataResponse<SemaforoData>>('/configuracion/semaforo', options),
    guardarSemaforo: (body: Record<string, number>) =>
      http.put<OkResponse>('/configuracion/semaforo', body),
    sla: (options?: RequestOptions) =>
      http.get<DataResponse<Record<string, string>>>('/configuracion/sla', options),
    guardarSla: (body: Record<string, string>) => http.put<OkResponse>('/configuracion/sla', body),

    // ── cierre de mes ──
    ventasMensuales: (options?: RequestOptions) =>
      http.get<DataResponse<VentaMensualRow[]>>('/configuracion/cierre-mes', options),
    guardarCierreMes: (body: {
      anio: number;
      mes: number;
      total_ventas_sin_iva: number;
      cartera_total_mes: number | null;
    }) => http.put<DataResponse<VentaMensualRow>>('/configuracion/cierre-mes', body),

    // ── log del sistema ──
    log: (filtros: LogFiltros, options?: RequestOptions) =>
      http.get<LogResponse>('/configuracion/log', { ...options, params: { ...filtros } }),
    /** Todas las filas del filtro (sin paginar) para exportar a CSV. */
    logCompleto: (filtros: LogFiltros, options?: RequestOptions) =>
      http.get<LogResponse>('/configuracion/log', {
        ...options,
        params: { ...filtros, format: 'csv' },
      }),

    // ── automatizaciones ──
    automatizaciones: (options?: RequestOptions) =>
      http.get<DataResponse<ReglaAutomatizacionEstado[]>>(
        '/configuracion/automatizaciones',
        options,
      ),
    toggleAutomatizacion: (id: string, activa: boolean) =>
      http.put<DataResponse<{ id: string; activa: boolean }>>('/configuracion/automatizaciones', {
        id,
        activa,
      }),
    feed: (params?: { regla?: string; dias?: number }, options?: RequestOptions) =>
      http.get<FeedResponse>('/configuracion/automatizaciones/feed', { ...options, params }),
    marcarEventoLeido: (id: string) =>
      http.patch<OkResponse>(`/configuracion/automatizaciones/feed/${seg(id)}`),
  };
}

export type ConfiguracionApi = ReturnType<typeof createConfiguracionApi>;

export const configuracionApi = createConfiguracionApi(browserHttp);
