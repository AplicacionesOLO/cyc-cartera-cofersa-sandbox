'use client';

import { useState } from 'react';
import { Trophy, Users, AlertTriangle, Target } from 'lucide-react';
import TabRankingClientes from './TabRankingClientes';
import TabPerfilVendedor from './TabPerfilVendedor';
import TabAlertasDeterioro from './TabAlertasDeterioro';
import TabConcentracion from './TabConcentracion';

interface Props {
  userEmail: string;
  esAnalista: boolean;
}

export default function AnalisisPagosTabs({ userEmail, esAnalista }: Props) {
  const [activeTab, setActiveTab] = useState(0);
  const [alertasCount, setAlertasCount] = useState<number | null>(null);
  // ICP fijo a 9 meses (ventana ponderada que define el índice). Selector de período eliminado
  // para que el ICP sea una sola verdad en todo el módulo y en la Ficha.
  const periodo = 9;

  const tabs = [
    { id: 0, label: 'Ranking de clientes', icon: <Trophy size={14} /> },
    { id: 1, label: 'Perfil por vendedor', icon: <Users size={14} /> },
    {
      id: 2,
      label: 'Alertas de deterioro',
      icon: <AlertTriangle size={14} />,
      badge: alertasCount,
    },
    { id: 3, label: 'Concentración de riesgo', icon: <Target size={14} /> },
  ];

  return (
    <div style={{ background: '#EEF2F7', minHeight: '100%' }}>
      <div className="px-5 py-5 space-y-4">
        {/* ── Tab navigation ──────────────────────────────────────────── */}
        <div className="flex gap-0.5 bg-white rounded-xl border border-slate-100 p-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all whitespace-nowrap flex-shrink-0"
              style={{
                background: activeTab === tab.id ? '#003B5C' : 'transparent',
                color: activeTab === tab.id ? 'white' : '#64748b',
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.badge !== null && tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className="text-[9px] font-black rounded-full px-1.5 py-0.5 leading-none"
                  style={{
                    background: activeTab === tab.id ? 'rgba(255,255,255,0.25)' : '#fee2e2',
                    color: activeTab === tab.id ? 'white' : '#dc2626',
                  }}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Contenido activo ────────────────────────────────────────── */}
        {activeTab === 0 && (
          <TabRankingClientes periodo={periodo} userEmail={esAnalista ? userEmail : null} />
        )}
        {activeTab === 1 && (
          <TabPerfilVendedor periodo={periodo} userEmail={esAnalista ? userEmail : null} />
        )}
        {activeTab === 2 && (
          <TabAlertasDeterioro
            userEmail={esAnalista ? userEmail : null}
            onDataLoaded={(count) => setAlertasCount(count)}
          />
        )}
        {activeTab === 3 && <TabConcentracion esAnalista={esAnalista} />}
      </div>
    </div>
  );
}
