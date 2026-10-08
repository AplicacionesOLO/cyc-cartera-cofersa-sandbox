'use client';

import { Loader2, ArrowLeftRight } from 'lucide-react';
import SaldosFavorTabla from './saldos-favor-tabla';
import { useSaldosFavorClienteController } from '@/views/gestion-cartera/hooks/use-saldos-favor-cliente-controller';
import { useSaldosFavorMatchingController } from '@/views/gestion-cartera/hooks/use-saldos-favor-matching-controller';

interface Props {
  clienteCod: string;
  esCoordinador: boolean;
  soloLectura?: boolean;
  userEmail: string;
}

export default function TabSaldosFavor({
  clienteCod,
  esCoordinador,
  soloLectura = false,
  userEmail,
}: Props) {
  const { rows, setRows, loading, error } = useSaldosFavorClienteController(clienteCod);

  // Matching del cliente (no bloqueante, para el banner)
  const { matches } = useSaldosFavorMatchingController(clienteCod);
  const nMatches = (matches ?? []).length;

  function onAplicado(id: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              estado_manual: 'aplicado',
              aplicado_por: userEmail,
              aplicado_en: new Date().toISOString(),
            }
          : r,
      ),
    );
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 size={18} className="animate-spin mr-2" /> Cargando…
      </div>
    );
  if (error)
    return (
      <div className="bg-white rounded-xl border border-red-100 p-8 text-center text-[13px] text-red-600 font-semibold">
        {error}
      </div>
    );

  return (
    <div className="space-y-4">
      {nMatches > 0 && (
        <div
          style={{
            background: '#E6F1FB',
            borderLeft: '3px solid #009ee3',
            borderRadius: '0 8px 8px 0',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <ArrowLeftRight size={16} style={{ color: '#009ee3', flexShrink: 0 }} />
          <p style={{ fontSize: '12px', color: '#185FA5' }}>
            {nMatches === 1
              ? 'Se detectó 1 aplicación posible para este cliente. Revisá el detalle abajo.'
              : `Se detectaron ${nMatches} aplicaciones posibles para este cliente. Revisá el detalle abajo.`}
          </p>
        </div>
      )}
      <SaldosFavorTabla
        filas={rows}
        esCoordinador={esCoordinador}
        soloLectura={soloLectura}
        userEmail={userEmail}
        dentroFicha
        onAplicado={onAplicado}
      />
    </div>
  );
}
