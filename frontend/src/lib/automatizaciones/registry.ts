/**
 * Tipos del registro de automatizaciones.
 *
 * El catálogo (REGLAS, DEFAULTS_AUTOMATIZACIONES) y el cálculo de corridas programadas (antes
 * `cron.ts` + `obtener-datos.ts`) viven ahora en el backend (`domain/entities/configuracion.py`),
 * que los usa para GET/PUT /configuracion/automatizaciones y para la pantalla de Configuración.
 */
export type ReglaId =
  | 'promesas_hoy'
  | 'conciliacion_promesas'
  | 'sync_salud'
  | 'sin_gestion'
  | 'sla_solicitudes'
  | 'pedido_retenido_en_regla';

export interface ReglaAutomatizacion {
  id: ReglaId;
  categoria: 'cobranza' | 'mantenimiento' | 'sistema';
  nombre: string;
  descripcion: string;
  rpc: string;
  cronJobName: string;
  toggleable: boolean;
  configKey: string | null;
  cron: string; // expresión pg_cron real, UTC, 5 campos
  cronLegible: string;
}
