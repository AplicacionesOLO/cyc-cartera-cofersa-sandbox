'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import TabDirectorioAgentes from './TabDirectorioAgentes';
import TabDocumentos from './TabDocumentos';
import TabAplicaciones from './TabAplicaciones';
import type {
  AgenteDirectorio,
  DocumentoRecurso,
  AplicacionRecurso,
  JefeRegionalNodo,
  Comprador,
} from '@/types/centro-recursos';

const TABS = [
  { id: 'directorio', label: '📊 Distribución Comercial' },
  { id: 'documentos', label: 'Documentos Oficiales' },
  { id: 'aplicaciones', label: 'Aplicaciones y Herramientas' },
] as const;

type TabId = (typeof TABS)[number]['id'];

interface Props {
  directorio: AgenteDirectorio[];
  arbol: JefeRegionalNodo[];
  compradores: Comprador[];
  documentos: DocumentoRecurso[];
  aplicaciones: AplicacionRecurso[];
  soyCoordinador: boolean;
}

export default function CentroRecursosTabs({
  directorio,
  arbol,
  compradores,
  documentos,
  aplicaciones,
  soyCoordinador,
}: Props) {
  const searchParams = useSearchParams();
  // ?marca=<id> desde el buscador global -- 'directorio' (Distribución Comercial)
  // ya es el tab por defecto, así que solo hace falta pasarlo a TabDirectorioAgentes
  const marcaInicial = searchParams.get('marca') ?? undefined;
  const [active, setActive] = useState<TabId>('directorio');

  return (
    <div>
      {/* ── Tab nav: segment control estilo macOS ── */}
      <div className="inline-flex items-center gap-1 bg-gray-100 p-1 rounded-lg mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className="flex-shrink-0 rounded-md px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-all"
            style={
              active === tab.id
                ? {
                    backgroundColor: 'white',
                    color: '#0f172a',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                  }
                : { color: '#64748b' }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Contenido del tab activo ── */}
      <div>
        {active === 'directorio' && (
          <TabDirectorioAgentes
            agentes={directorio}
            arbol={arbol}
            compradores={compradores}
            soyCoordinador={soyCoordinador}
            marcaInicial={marcaInicial}
          />
        )}
        {active === 'documentos' && (
          <TabDocumentos documentos={documentos} soyCoordinador={soyCoordinador} />
        )}
        {active === 'aplicaciones' && (
          <TabAplicaciones aplicaciones={aplicaciones} soyCoordinador={soyCoordinador} />
        )}
      </div>
    </div>
  );
}
