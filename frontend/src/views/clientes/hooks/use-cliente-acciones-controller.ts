'use client';

import { useMemo } from 'react';
import { clientesApi } from '../api/clientes-api';
import { gestionesApi } from '@/views/gestiones/api/gestiones-api';
import type { ActualizarGestionBody } from '@/views/gestiones/types';
import type {
  ContactoBody,
  EmailCobroBody,
  EstadoCuentaBody,
  GenerarEmailBody,
  LogisticaBody,
  RecordatorioBody,
} from '../types';

/**
 * Acciones de la Ficha 360° (antes llamadas directas a las API Routes de clientes y un insert de gestiones desde el navegador).
 * Cada componente conserva su propio estado de carga/error y muestra `ApiError.message` con los
 * mismos textos que devolvían las API Routes.
 */
export function useClienteAccionesController() {
  return useMemo(
    () => ({
      actualizarContacto: (body: ContactoBody) => clientesApi.actualizarContacto(body),
      actualizarLogistica: (body: LogisticaBody) => clientesApi.actualizarLogistica(body),
      generarEmailIA: (body: GenerarEmailBody) => clientesApi.generarEmailIA(body),
      /** Envía el email de cobro y registra la gestión CORREO (todo en el servidor). */
      enviarEmailCobro: (body: EmailCobroBody) => clientesApi.enviarEmailCobro(body),
      enviarEstadoCuenta: (body: EstadoCuentaBody) => clientesApi.enviarEstadoCuenta(body),
      registrarRecordatorio: (body: RecordatorioBody) => clientesApi.registrarRecordatorio(body),
      /** Edición de una gestión desde la ficha (endpoint del módulo Gestiones). */
      actualizarGestion: (body: ActualizarGestionBody) => gestionesApi.actualizar(body),
    }),
    [],
  );
}
