'use client';

import { useState } from 'react';
import TabVendedores, {
  type VendedorRow,
  type AnalistaBasico,
  type SupervisorBasico,
  type RutaGrupo,
} from './TabVendedores';
import TabSupervisores, { type SupervisorRow } from './TabSupervisores';
import TabUsuarios, { type UsuarioRow } from './TabUsuarios';
import TabParametros, { type ParamRow } from './TabParametros';
import TabSemaforo, { type SemaforoData } from './TabSemaforo';
import TabSLA from './TabSLA';
import TabDirectorio, { type DirectorioRow } from './TabDirectorio';
import TabLog, { type LogRow } from './TabLog';
import TabSincronizacion from './TabSincronizacion';
import TabAutomatizaciones, { type AutomatizacionesData } from './TabAutomatizaciones';
import TabCierreMes, { type VentaMensualRow } from './TabCierreMes';

// ── Tipos de datos de carga inicial ──────────────────────────────────
export interface ConfigTabsData {
  vendedores: VendedorRow[];
  analistas: AnalistaBasico[];
  supervisores: SupervisorRow[];
  usuarios: UsuarioRow[];
  parametros: ParamRow[];
  semaforo: SemaforoData;
  slaOverrides: Record<string, string>;
  directorio: DirectorioRow[];
  logs: LogRow[];
  logsTotal: number;
  rutas: RutaGrupo[];
  automatizaciones: AutomatizacionesData;
  ventasMensuales: VentaMensualRow[];
  mesCierreSugerido: { anio: number; mes: number };
}

// ── Definición de tabs ────────────────────────────────────────────────
const TABS = [
  { id: 'vendedores', label: 'Vendedores' },
  { id: 'supervisores', label: 'Supervisores' },
  { id: 'usuarios', label: 'Usuarios' },
  { id: 'parametros', label: 'Parámetros' },
  { id: 'semaforo', label: 'Semáforo' },
  { id: 'sla', label: 'SLA Solicitudes' },
  { id: 'automatizaciones', label: 'Automatizaciones' },
  { id: 'directorio', label: 'Directorio' },
  { id: 'log', label: 'Log del Sistema' },
  { id: 'cierre-mes', label: 'Cierre de Mes' },
  { id: 'sincronizacion', label: 'Sincronización' },
] as const;

type TabId = (typeof TABS)[number]['id'];

interface Props {
  data: ConfigTabsData;
}

export default function ConfigTabs({ data }: Props) {
  const [active, setActive] = useState<TabId>('vendedores');

  return (
    <div>
      {/* ── Tab nav ── */}
      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className="flex-shrink-0 px-4 py-2 text-[13px] font-semibold transition-all whitespace-nowrap rounded-full"
            style={
              active === tab.id
                ? { backgroundColor: '#009ee3', color: 'white' }
                : { backgroundColor: '#f1f5f9', color: '#64748b' }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Contenido del tab activo ── */}
      <div>
        {active === 'vendedores' && (
          <TabVendedores
            vendedores={data.vendedores}
            analistas={data.analistas}
            supervisores={data.supervisores
              .filter((s) => s.activo)
              .map((s): SupervisorBasico => ({ cod: s.cod, nombre: s.nombre }))}
            rutas={data.rutas}
          />
        )}
        {active === 'supervisores' && <TabSupervisores supervisores={data.supervisores} />}
        {active === 'usuarios' && <TabUsuarios usuarios={data.usuarios} />}
        {active === 'parametros' && <TabParametros parametros={data.parametros} />}
        {active === 'semaforo' && <TabSemaforo semaforo={data.semaforo} />}
        {active === 'sla' && <TabSLA slaOverrides={data.slaOverrides} />}
        {active === 'automatizaciones' && (
          <TabAutomatizaciones automatizaciones={data.automatizaciones} />
        )}
        {active === 'directorio' && (
          <TabDirectorio
            contactos={data.directorio}
            vendedores={data.vendedores}
            usuarios={data.usuarios}
          />
        )}
        {active === 'log' && <TabLog logs={data.logs} total={data.logsTotal} />}
        {active === 'sincronizacion' && <TabSincronizacion />}
        {active === 'cierre-mes' && (
          <TabCierreMes
            ventasMensuales={data.ventasMensuales}
            mesSugerido={data.mesCierreSugerido}
          />
        )}
      </div>
    </div>
  );
}
