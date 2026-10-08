/** Tipos del módulo Promesas (centro de seguimiento). */
import type { EventoPromesa, Promesa } from '@/types/database';

/** Datos de la gestión origen que enriquecen cada card. */
export interface GestionOrigen {
  id: string;
  resultado: string;
  nota: string;
  tipo: string;
  fecha: string;
}

/** GET /promesas — bandeja + gestión origen de cada promesa (antes 2 consultas al origen). */
export interface PromesasPagina {
  promesas: Promesa[];
  gestionesMap: Record<string, GestionOrigen>;
}

/** PATCH /clientes/promesas */
export interface ValidarPromesaBody {
  id: string;
  estado: 'CUMPLIDA' | 'INCUMPLIDA' | 'ABONO_PARCIAL';
  comentario?: string;
  monto_abono_parcial?: number;
}

export interface ValidarPromesaResponse {
  ok: boolean;
  estado: string;
  evento: EventoPromesa;
}

/** POST /clientes/promesas/reprogramar */
export interface ReprogramarPromesaBody {
  id: string;
  nueva_fecha: string;
  nuevo_monto: number;
  motivo: string;
}

export interface ReprogramarPromesaResponse {
  ok: boolean;
  nueva_promesa_id: string;
}
