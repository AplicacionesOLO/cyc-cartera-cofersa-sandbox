'use client';

import { X } from 'lucide-react';

export type TipoRegistroGarantia = 'EXISTENTE' | 'NUEVA';

export interface ModalSelectorTipoRegistroProps {
  onClose: () => void;
  onSeleccionar: (opcion: TipoRegistroGarantia) => void;
}

// Primer paso de "+ Registrar Garantía": separa el caso de digitalizar un
// título físico que ya existe en el archivero (flujo de siempre, sin cambios)
// del caso de emitir un Pagaré nuevo desde cero (encadena directo al asistente
// de Generar Pagaré una vez creada la garantía -- ver garantias-cliente.tsx).
export default function ModalSelectorTipoRegistro({
  onClose,
  onSeleccionar,
}: ModalSelectorTipoRegistroProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">¿Qué querés hacer?</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TarjetaOpcion
            emoji="📦"
            titulo="Registrar Garantía Existente (Física)"
            descripcion="Para digitalizar un título físico que ya está en el archivero -- pagaré o letra de cambio ya firmado."
            onClick={() => onSeleccionar('EXISTENTE')}
          />
          <TarjetaOpcion
            emoji="📄"
            titulo="Emitir Nueva Garantía (Pagaré Oficial)"
            descripcion="Genera e imprime un pagaré nuevo desde cero -- activa el asistente con la plantilla jurídica o física según el cliente."
            onClick={() => onSeleccionar('NUEVA')}
          />
        </div>
      </div>
    </div>
  );
}

function TarjetaOpcion({
  emoji,
  titulo,
  descripcion,
  onClick,
}: {
  emoji: string;
  titulo: string;
  descripcion: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-xl border border-gray-200 p-4 transition-all hover:shadow-md hover:-translate-y-0.5"
      style={{ borderColor: '#e2e8f0' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#009ee3';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#e2e8f0';
      }}
    >
      <div className="text-2xl mb-2">{emoji}</div>
      <p className="font-bold text-gray-900 text-sm">{titulo}</p>
      <p className="mt-1 text-[12px] leading-snug text-gray-500">{descripcion}</p>
    </button>
  );
}
