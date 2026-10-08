'use client';

import {
  X,
  Loader2,
  FolderOpen,
  Truck,
  FileSignature,
  Undo2,
  RefreshCw,
  Paperclip,
  Pencil,
  FileCheck2,
  History,
} from 'lucide-react';
import { useHistorialGarantiaController } from '@/views/auditoria-legal/hooks/use-historial-garantia-controller';
import { TIPO_EVENTO_LABEL } from '@/lib/auditoria-legal/catalogo';
import type { GarantiaListaRow, TipoEventoGarantia } from '@/types/auditoria-legal';

export interface ModalHistorialGarantiaProps {
  garantia: GarantiaListaRow;
  onClose: () => void;
}

// Un ícono por tipo_evento -- ayuda a escanear el timeline sin leer cada nota.
const ICONO_EVENTO: Record<TipoEventoGarantia, React.ComponentType<{ size?: number }>> = {
  APERTURA_EXPEDIENTE: FolderOpen,
  ENTREGA_A_VENDEDOR: Truck,
  TRAMITE_DE_FIRMA: FileSignature,
  REINGRESO_A_CUSTODIA: Undo2,
  SUSTITUCION_DE_TITULO: RefreshCw,
  ADJUNTO_DOCUMENTO: Paperclip,
  CORRECCION_DATOS: Pencil,
  GENERACION_PAGARE: FileCheck2,
};

function fmtFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CR', {
    timeZone: 'America/Costa_Rica',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// "Ver Historial" del menú de fila: la garantía ya tenía toda su cadena de
// custodia registrada en garantia_eventos desde el principio (cada acción de
// custodia, corrección, sustitución y generación de pagaré inserta una fila
// ahí) -- pero hasta ahora no existía ningún lugar en la UI que la mostrara.
export default function ModalHistorialGarantia({ garantia, onClose }: ModalHistorialGarantiaProps) {
  const { eventos, error } = useHistorialGarantiaController(garantia.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <History size={16} /> Historial — {garantia.cliente_nombre}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-gray-100"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</p>
          )}

          {!eventos && !error && (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}

          {eventos && eventos.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">
              Sin eventos registrados todavía.
            </p>
          )}

          {eventos && eventos.length > 0 && (
            <ol className="space-y-0">
              {eventos.map((ev, i) => {
                const Icono = ICONO_EVENTO[ev.tipo_evento] ?? FolderOpen;
                const esUltimo = i === eventos.length - 1;
                return (
                  <li key={ev.id} className="relative pl-9 pb-5">
                    {/* línea vertical que conecta los íconos, salvo en el último */}
                    {!esUltimo && (
                      <span className="absolute left-[13px] top-6 bottom-0 w-px bg-gray-200" />
                    )}
                    <span
                      className="absolute left-0 top-0 flex h-[26px] w-[26px] items-center justify-center rounded-full"
                      style={{ background: '#e6f4fb', color: '#009ee3' }}
                    >
                      <Icono size={13} />
                    </span>
                    <p className="text-[13px] font-bold text-gray-800">
                      {TIPO_EVENTO_LABEL[ev.tipo_evento] ?? ev.tipo_evento}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {fmtFechaHora(ev.created_at)}
                      {ev.usuarios?.nombre ? ` · ${ev.usuarios.nombre}` : ''}
                    </p>
                    {ev.nota && (
                      <p className="mt-1 text-[12px] text-gray-600 leading-snug">{ev.nota}</p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
