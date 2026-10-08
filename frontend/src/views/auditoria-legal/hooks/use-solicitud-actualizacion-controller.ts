'use client';

import { useMemo } from 'react';
import type { CrearSolicitudPayload } from '@/types/actualizacion-perfil';
import { auditoriaLegalApi } from '../api/auditoria-legal-api';
import type { AccionSolicitud, EnvioSolicitudResponse } from '../types';

/** Envío/reenvío y revisión de solicitudes de actualización (ModalSolicitar/ModalRevisarActualizacion). */
export function useSolicitudActualizacionController() {
  return useMemo(
    () => ({
      crear: (payload: CrearSolicitudPayload) => auditoriaLegalApi.crearSolicitud(payload),
      reenviar: (id: number, correoDestino: string) =>
        auditoriaLegalApi.gestionarSolicitud<EnvioSolicitudResponse>(id, {
          accion: 'REENVIAR',
          correo_destino: correoDestino,
        }),
      detalle: (id: number, signal?: AbortSignal) => auditoriaLegalApi.solicitud(id, { signal }),
      gestionar: (id: number, accion: AccionSolicitud) =>
        auditoriaLegalApi.gestionarSolicitud(id, accion),
    }),
    [],
  );
}
