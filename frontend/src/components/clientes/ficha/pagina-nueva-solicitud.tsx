'use client';

/**
 * PaginaNuevaSolicitud
 *
 * Wrapper de página completa para el wizard de nueva solicitud.
 * Se usa desde /clientes/[cod]/solicitudes/nueva
 *
 * Muestra:
 *   - Breadcrumb (Clientes → [nombre] → Nueva solicitud)
 *   - StepIndicator de 3 pasos
 *   - Card centrada max-w-[700px] con WizardNuevaSolicitud
 */

import { useRouter } from 'next/navigation';
import WizardNuevaSolicitud, {
  StepIndicator,
} from '@/components/solicitudes/wizard-nueva-solicitud';
import type { Factura } from '@/types/database';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface Props {
  clienteCod: string;
  clienteNombre: string;
  limiteActual: number;
  moraTotal: number;
  diasAtraso: string;
  creditoDisponible: number | null;
  condicionPago: string;
  facturas: Factura[];
}

export default function PaginaNuevaSolicitud({
  clienteCod,
  clienteNombre,
  limiteActual,
  moraTotal,
  diasAtraso,
  creditoDisponible,
  condicionPago,
  facturas,
}: Props) {
  const router = useRouter();

  // Paso actual para el indicador (1-3, empieza en 1)
  const [pasoIndicador, setPasoIndicador] = useState(1);

  function handleSuccess() {
    router.push(`/clientes/${clienteCod}?tab=Solicitudes`);
  }

  function handleCancel() {
    router.push(`/clientes/${clienteCod}`);
  }

  return (
    <div style={{ backgroundColor: '#f0f4f8', minHeight: '100vh' }}>
      {/* ── Topbar de contexto ─────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-5 py-3 sticky top-0 z-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-[12px] text-gray-400 mb-0.5">
          <button
            type="button"
            onClick={() => router.push('/clientes')}
            className="hover:text-gray-600 transition"
          >
            Clientes
          </button>
          <ChevronRight size={12} />
          <button
            type="button"
            onClick={handleCancel}
            className="hover:text-gray-600 transition truncate max-w-[200px]"
          >
            {clienteNombre}
          </button>
          <ChevronRight size={12} />
          <span className="font-semibold text-gray-700">Nueva solicitud</span>
        </nav>
        <h1 className="text-[16px] font-semibold text-gray-800">Nueva solicitud</h1>
      </div>

      {/* ── Contenido ─────────────────────────────────────────────────── */}
      <div className="px-5 py-6 flex flex-col items-center">
        {/* Step indicator */}
        <div className="w-full max-w-[700px] mb-6">
          <StepIndicator paso={pasoIndicador} totalPasos={3} />
        </div>

        {/* Info del cliente */}
        <div className="w-full max-w-[700px] mb-4">
          <div className="rounded-xl bg-white border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: '#e0f2fe',
                color: '#0369a1',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              {clienteNombre.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-gray-800 truncate">{clienteNombre}</p>
              <p className="text-[11px] text-gray-400">{clienteCod}</p>
            </div>
          </div>
        </div>

        {/* Wizard card */}
        <div className="w-full max-w-[700px]">
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-6 py-6">
            <WizardNuevaSolicitud
              clienteCod={clienteCod}
              clienteNombre={clienteNombre}
              limiteActual={limiteActual}
              moraTotal={moraTotal}
              diasAtraso={diasAtraso}
              creditoDisponible={creditoDisponible}
              condicionPago={condicionPago}
              facturas={facturas}
              onCancel={handleCancel}
              onSuccess={handleSuccess}
              onPasoChange={setPasoIndicador}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
