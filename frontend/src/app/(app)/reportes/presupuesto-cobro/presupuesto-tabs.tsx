'use client';

import { useState } from 'react';
import { Target, TrendingUp, CalendarRange } from 'lucide-react';
import TabPresupuesto from './tab-presupuesto';
import TabRecuperacion from './tab-recuperacion';
import TabProyeccion from './tab-proyeccion';
import type { RemitenteCorreo } from '@/lib/reportes/email-vendedor';

interface Props {
  userEmail: string;
  generadoPor: string;
  remitente: RemitenteCorreo;
}

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export default function PresupuestoTabs({ userEmail, generadoPor, remitente }: Props) {
  // Mes por defecto = mes actual (hora CR)
  const hoy = new Date(Date.now() - 6 * 3600_000);
  const [anio, setAnio] = useState(hoy.getUTCFullYear());
  const [mes, setMes] = useState(hoy.getUTCMonth() + 1);
  const [tab, setTab] = useState(0);

  const tabs = [
    { id: 0, label: 'Presupuesto del mes', icon: <Target size={14} /> },
    { id: 1, label: 'Recuperación', icon: <TrendingUp size={14} /> },
    { id: 2, label: 'Proyección (Tesorería)', icon: <CalendarRange size={14} /> },
  ];

  // Selector de mes: 12 meses hacia atrás desde el actual
  const opciones: { anio: number; mes: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
    opciones.push({ anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 });
  }

  return (
    <div style={{ background: '#EEF2F7', minHeight: '100%' }}>
      <div className="px-5 py-5 space-y-4">
        {/* Selector de período (tabs 0 y 1 usan mes; tab 2 es horizonte fijo) */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-0.5 bg-white rounded-xl border border-slate-100 p-1 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all whitespace-nowrap flex-shrink-0"
                style={{
                  background: tab === t.id ? '#003B5C' : 'transparent',
                  color: tab === t.id ? 'white' : '#64748b',
                }}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {tab !== 2 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
                Mes
              </span>
              <select
                value={`${anio}-${mes}`}
                onChange={(e) => {
                  const [a, m] = e.target.value.split('-').map(Number);
                  setAnio(a);
                  setMes(m);
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] bg-white text-gray-700 focus:outline-none"
              >
                {opciones.map((o) => (
                  <option key={`${o.anio}-${o.mes}`} value={`${o.anio}-${o.mes}`}>
                    {MESES[o.mes - 1]} {o.anio}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {tab === 0 && (
          <TabPresupuesto
            anio={anio}
            mes={mes}
            userEmail={userEmail}
            generadoPor={generadoPor}
            mesLabel={`${MESES[mes - 1]} ${anio}`}
            remitente={remitente}
          />
        )}
        {tab === 1 && (
          <TabRecuperacion
            anio={anio}
            mes={mes}
            mesLabel={`${MESES[mes - 1]} ${anio}`}
            remitente={remitente}
          />
        )}
        {tab === 2 && <TabProyeccion generadoPor={generadoPor} />}
      </div>
    </div>
  );
}
