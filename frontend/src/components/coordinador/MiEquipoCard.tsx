'use client';

import { useState, useMemo } from 'react';
import { Users } from 'lucide-react';

// ── Tipos ─────────────────────────────────────────────────────────────
export interface AnalistaEquipo {
  id: string;
  nombre: string;
  iniciales: string;
  color: string;
  gHoy: number;
  gSemana: number;
  gMes: number;
}

type Periodo = 'hoy' | 'semana' | 'mes';

const CHIPS: { id: Periodo; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
];

// ── Componente ────────────────────────────────────────────────────────
export default function MiEquipoCard({ analistas }: { analistas: AnalistaEquipo[] }) {
  const [periodo, setPeriodo] = useState<Periodo>('hoy');

  const sorted = useMemo(
    () =>
      [...analistas].sort((a, b) => {
        const va = periodo === 'hoy' ? a.gHoy : periodo === 'semana' ? a.gSemana : a.gMes;
        const vb = periodo === 'hoy' ? b.gHoy : periodo === 'semana' ? b.gSemana : b.gMes;
        return vb - va;
      }),
    [analistas, periodo],
  );

  const getVal = (a: AnalistaEquipo) =>
    periodo === 'hoy' ? a.gHoy : periodo === 'semana' ? a.gSemana : a.gMes;

  const maxVal = Math.max(...sorted.map((a) => getVal(a)), 1);
  const total = sorted.reduce((s, a) => s + getVal(a), 0);
  const avgVal = sorted.length ? total / sorted.length : 0;

  const periodoLabel =
    periodo === 'hoy' ? 'hoy' : periodo === 'semana' ? 'esta semana' : 'este mes';

  return (
    <div
      style={{
        background: 'white',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        borderTop: '3px solid #003B5C',
        boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
        overflow: 'hidden',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid #F1F5F9' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(0,59,92,0.08)' }}
          >
            <Users size={15} style={{ color: '#003B5C' }} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Mi Equipo</h2>
            <p className="text-xs text-gray-400">Gestiones por analista</p>
          </div>
        </div>

        {/* Chips Hoy / Semana / Mes */}
        <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ background: '#F1F5F9' }}>
          {CHIPS.map((c) => (
            <button
              key={c.id}
              onClick={() => setPeriodo(c.id)}
              className="text-[11px] font-bold px-2.5 py-1 rounded-md transition-all"
              style={{
                background: periodo === c.id ? 'white' : 'transparent',
                color: periodo === c.id ? '#003B5C' : '#94a3b8',
                boxShadow: periodo === c.id ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Barras por analista ─────────────────────────────────────── */}
      <div className="p-4 space-y-3" style={{ flex: 1 }}>
        {sorted.map((a) => {
          const val = getVal(a);
          const barW = maxVal > 0 ? Math.round((val / maxVal) * 100) : 0;
          const sobreAvg = avgVal > 0 && val >= avgVal;
          return (
            <div key={a.id} className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-xs"
                style={{ backgroundColor: a.color }}
              >
                {a.iniciales}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold text-gray-800 truncate">
                    {a.nombre.split(' ').slice(0, 2).join(' ')}
                  </p>
                  <span
                    className={`text-xs font-black ml-2 flex-shrink-0 ${
                      sobreAvg ? 'text-green-600' : val === 0 ? 'text-gray-300' : 'text-amber-600'
                    }`}
                  >
                    {val}
                  </span>
                </div>
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ background: '#F1F5F9' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.max(barW, val > 0 ? 4 : 0)}%`,
                      background: sobreAvg ? '#16a34a' : val === 0 ? '#E2E8F0' : '#f59e0b',
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}

        {sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm font-semibold text-gray-300">Sin analistas activos</p>
          </div>
        )}
      </div>

      {/* ── Footer total ────────────────────────────────────────────── */}
      <div
        className="px-6 py-3 flex items-center justify-between"
        style={{ background: '#F8FAFC', borderTop: '1px solid #F1F5F9' }}
      >
        <span className="text-xs text-gray-400">Total gestiones · {periodoLabel}</span>
        <span className="text-sm font-black text-gray-900">{total}</span>
      </div>
    </div>
  );
}
