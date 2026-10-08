'use client';

// src/components/analista/AgendaCompacta.tsx
// Agenda compacta hoy+mañana. Reemplaza el calendario mensual.

import { fmtCRC } from '@/lib/utils/formato';
import type { AgendaGestion, AgendaPromesa } from '@/types/dashboard-analista';

interface Props {
  gestiones: AgendaGestion[];
  promesas: AgendaPromesa[];
  hoyStr: string;
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

function labelDia(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const fecha = new Date(y, m - 1, d);
  return `${DIAS[fecha.getDay()]} ${d} ${MESES[m - 1]}`;
}

type ItemAgenda =
  | {
      tipo: 'gestion';
      id: string;
      cliente_cod: string;
      clienteNombre: string;
      accionLabel: string;
      proxima_accion: string;
      fecha: string;
    }
  | { tipo: 'promesa'; id: string; cliente: string; monto: number; fecha: string };

export default function AgendaCompacta({ gestiones, promesas, hoyStr }: Props) {
  const mananaStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  function buildItems(fecha: string): ItemAgenda[] {
    const items: ItemAgenda[] = [];
    for (const g of gestiones.filter((x) => x.proxima_accion_fecha === fecha)) {
      items.push({
        tipo: 'gestion',
        id: g.id,
        cliente_cod: g.cliente_cod,
        clienteNombre: g.cliente_nombre ?? g.cliente_cod,
        accionLabel: g.accion_label ?? g.proxima_accion,
        proxima_accion: g.proxima_accion,
        fecha,
      });
    }
    for (const p of promesas.filter((x) => x.fecha_promesa === fecha)) {
      items.push({
        tipo: 'promesa',
        id: p.id,
        cliente: p.cliente_nombre || p.cliente_cod,
        monto: p.monto,
        fecha,
      });
    }
    return items;
  }

  const itemsHoy = buildItems(hoyStr);
  const itemsManana = buildItems(mananaStr);

  return (
    <div
      className="bg-white border border-slate-200 rounded-lg p-3"
      style={{ borderTop: '3px solid #003B5C' }}
    >
      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-3">Agenda</p>

      {/* Hoy */}
      <div className="mb-3">
        <p className="text-[10px] font-semibold text-[#009EE3] uppercase tracking-wider mb-2">
          Hoy — {labelDia(hoyStr)}
        </p>
        {itemsHoy.length === 0 ? (
          <p className="text-[10px] text-slate-400 italic">Sin eventos para este período.</p>
        ) : (
          <div className="space-y-1.5">
            {itemsHoy.map((item) => (
              <AgendaItem key={`${item.tipo}-${item.id}`} item={item} />
            ))}
          </div>
        )}
      </div>

      <hr className="border-slate-100 my-2" />

      {/* Mañana */}
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
          {labelDia(mananaStr)}
        </p>
        {itemsManana.length === 0 ? (
          <p className="text-[10px] text-slate-400 italic">Sin eventos para este período.</p>
        ) : (
          <div className="space-y-1.5">
            {itemsManana.map((item) => (
              <AgendaItem key={`${item.tipo}-${item.id}`} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const DOT_ACCION: Record<string, string> = {
  escalar: '#dc2626', // rojo
  esperar_pago: '#f59e0b', // amber
  recontactar: '#f59e0b', // amber
  crear_solicitud: '#009EE3', // cyan
  sin_seguimiento: '#94a3b8', // slate
};

function AgendaItem({ item }: { item: ItemAgenda }) {
  if (item.tipo === 'promesa') {
    return (
      <div className="flex items-start gap-2 px-1 py-1 rounded hover:bg-slate-50">
        <div
          className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
          style={{ background: '#f59e0b' }}
        />
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-slate-700 truncate">{item.cliente}</p>
          <p className="text-[9px] text-slate-400">{fmtCRC(item.monto)}</p>
        </div>
      </div>
    );
  }

  const dotColor = DOT_ACCION[item.proxima_accion] ?? '#94a3b8';
  return (
    <div className="flex items-start gap-2 px-1 py-1 rounded hover:bg-slate-50">
      <div
        className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
        style={{ background: dotColor }}
      />
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-slate-700 truncate">{item.clienteNombre}</p>
        <p className="text-[9px] text-slate-400">{item.accionLabel}</p>
      </div>
    </div>
  );
}
