'use client';

import { useMemo } from 'react';
import { useHaciendaController } from '@/views/notificaciones/hooks/use-hacienda-controller';
import type {
  EditarGarantiaPayload,
  GenerarPagarePayload,
  PersonaLegal,
  RegistrarGarantiaPayload,
} from '@/types/auditoria-legal';
import { auditoriaLegalApi, type CustodiaPayload } from '../api/auditoria-legal-api';

/**
 * Consultas y escrituras de los modales de alta/edición de garantía, generación/emisión de pagaré y
 * confirmación de despacho. Mismas operaciones que antes hacían con el SDK anterior + fetch.
 */
export function useGarantiaFormController() {
  const { consultarContribuyente } = useHaciendaController();
  return useMemo(
    () => ({
      hacienda: consultarContribuyente,
      buscarContribuyentes: (q: string) => auditoriaLegalApi.buscarContribuyentes(q),
      saldoContribuyente: (c: string) => auditoriaLegalApi.saldoContribuyente(c),
      garantiaActiva: (c: string) => auditoriaLegalApi.garantiaActiva(c),
      vendedoresContribuyente: (c: string) => auditoriaLegalApi.vendedoresContribuyente(c),
      personasLegales: (cedulas: string[]) => auditoriaLegalApi.personasLegales(cedulas),
      personaLegal: async (cedula: string): Promise<PersonaLegal | null> =>
        (await auditoriaLegalApi.personasLegales([cedula])).find((p) => p.cedula === cedula) ??
        null,
      configPagare: () => auditoriaLegalApi.configPagare(),
      conteoCarpeta: (mueble: string, gaveta: string, carpeta: number, excluirId: number | null) =>
        auditoriaLegalApi.conteoCarpeta(mueble, gaveta, carpeta, excluirId),
      siguienteCarpeta: (mueble: string, gaveta: string, desde: number) =>
        auditoriaLegalApi.siguienteCarpeta(mueble, gaveta, desde),
      vendedorDeGarantia: (id: number) => auditoriaLegalApi.vendedorDeGarantia(id),
      registrar: (payload: RegistrarGarantiaPayload) => auditoriaLegalApi.registrar(payload),
      editar: (id: number, payload: EditarGarantiaPayload) => auditoriaLegalApi.editar(id, payload),
      generarPagare: (id: number, payload: GenerarPagarePayload) =>
        auditoriaLegalApi.generarPagare(id, payload),
      custodia: (id: number, payload: CustodiaPayload) => auditoriaLegalApi.custodia(id, payload),
    }),
    [consultarContribuyente],
  );
}
