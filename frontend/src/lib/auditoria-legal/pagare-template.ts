// src/lib/auditoria-legal/pagare-template.ts
import { numeroALetras } from '@/lib/utils/numero-a-letras';
import { fmtCRC } from '@/lib/utils/formato';
import { esPersonaJuridica } from '@/lib/auditoria-legal/persona';
import type { GarantiaPagareRow } from '@/types/auditoria-legal';

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** '2026-07-30' -> '30 de julio de 2026' */
export function fechaLegal(fechaISO: string): string {
  const [anio, mes, dia] = fechaISO.slice(0, 10).split('-').map(Number);
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}

export interface AcreedorConfig {
  razonSocial: string;
  cedulaJuridica: string;
}

export interface ContenidoPagare {
  esFisica: boolean;
  montoTexto: string;
  montoLetras: string;
  fechaEmisionTexto: string;
  fechaVencimientoTexto: string;
}

export function construirContenido(g: GarantiaPagareRow): ContenidoPagare {
  return {
    esFisica: !esPersonaJuridica(g.contribuyente),
    montoTexto: fmtCRC(g.monto_garantizado),
    montoLetras: numeroALetras(g.monto_garantizado),
    fechaEmisionTexto: fechaLegal(g.fecha_emision),
    fechaVencimientoTexto: fechaLegal(g.fecha_vencimiento),
  };
}
