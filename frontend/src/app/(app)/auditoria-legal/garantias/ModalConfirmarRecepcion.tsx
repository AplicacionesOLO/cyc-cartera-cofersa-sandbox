'use client';

import { useState } from 'react';
import { X, Undo2, Loader2 } from 'lucide-react';
import { ESTADO_CUSTODIA_LABEL } from '@/lib/auditoria-legal/catalogo';
import { MUEBLES_ARCHIVO, GAVETAS_ARCHIVO } from '@/lib/auditoria-legal/ubicacion-archivo';
import type { GarantiaListaRow } from '@/types/auditoria-legal';
import { useGarantiaFormController } from '@/views/auditoria-legal/hooks/use-garantia-form-controller';
import type { ApiError } from '@/shared/api/api-error';

export interface ModalConfirmarRecepcionProps {
  garantia: GarantiaListaRow;
  onClose: () => void;
  /** El PATCH de custodia (accion: REINGRESAR) ya se aplicó -- refrescar la tabla. */
  onConfirmado: () => void;
}

const LABEL = 'block text-[11px] font-bold text-gray-500 uppercase mb-1';
const INPUT =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition';
const INPUT_INVALIDO = 'border-red-300 bg-red-50/40';

// Spec 4 del pedido de Jeffrey: "Confirmar Recepción / Archivar" ya no reingresa
// directo a bóveda dejando la ubicación en blanco -- exige la ubicación
// estructurada (Spec 3, ago 2026) en la misma acción, para que el expediente
// nunca quede "en el limbo" sin saber dónde está guardado el papel. No pide
// providerToken/providerRefreshToken: REINGRESAR no dispara correo (sólo
// ENTREGAR lo hace), así que no hace falta resolver la sesión de Gmail acá.
export default function ModalConfirmarRecepcion({
  garantia,
  onClose,
  onConfirmado,
}: ModalConfirmarRecepcionProps) {
  const [mueble, setMueble] = useState('');
  const [gaveta, setGaveta] = useState('');
  const [carpeta, setCarpeta] = useState('');
  const [invalido, setInvalido] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  const api = useGarantiaFormController();

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    const carpetaNum = Number(carpeta);
    if (!mueble || !gaveta || !carpeta.trim() || !Number.isInteger(carpetaNum) || carpetaNum <= 0) {
      setInvalido(true);
      setError('Completá Mueble/Archivero, Gaveta/Caja y Carpeta N.° (un número entero mayor a 0)');
      return;
    }
    setProcesando(true);
    setError('');
    try {
      await api.custodia(garantia.id, {
        accion: 'REINGRESAR',
        mueble,
        gaveta,
        carpeta: carpetaNum,
      });
      onConfirmado();
    } catch (e) {
      setError((e as ApiError).message ?? 'Error al confirmar la recepción');
      setProcesando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Undo2 size={16} /> Confirmar Recepción · Archivar
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-gray-100"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={confirmar} className="p-5 space-y-3.5">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <p className="text-sm text-gray-700 leading-relaxed">
            El título de <b>{garantia.cliente_nombre}</b> vuelve de{' '}
            <b>{ESTADO_CUSTODIA_LABEL[garantia.estado_custodia]}</b> a{' '}
            <b>{ESTADO_CUSTODIA_LABEL.EN_BOVEDA}</b>. Indicá dónde queda archivado físicamente antes
            de confirmar.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_100px] gap-3">
            <div>
              <label className={LABEL}>Mueble/Archivero *</label>
              <select
                value={mueble}
                autoFocus
                onChange={(e) => {
                  setMueble(e.target.value);
                  setInvalido(false);
                }}
                className={`${INPUT} bg-white ${invalido && !mueble ? INPUT_INVALIDO : ''}`}
              >
                <option value="">Seleccionar...</option>
                {MUEBLES_ARCHIVO.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Gaveta/Caja *</label>
              <select
                value={gaveta}
                onChange={(e) => {
                  setGaveta(e.target.value);
                  setInvalido(false);
                }}
                className={`${INPUT} bg-white ${invalido && !gaveta ? INPUT_INVALIDO : ''}`}
              >
                <option value="">Seleccionar...</option>
                {GAVETAS_ARCHIVO.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Carpeta N.° *</label>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={carpeta}
                onChange={(e) => {
                  setCarpeta(e.target.value);
                  setInvalido(false);
                }}
                className={`${INPUT} ${invalido && !carpeta.trim() ? INPUT_INVALIDO : ''}`}
                placeholder="4"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={procesando}
              className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={procesando}
              className="px-4 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-60 transition inline-flex items-center gap-2"
              style={{ backgroundColor: '#009ee3' }}
            >
              {procesando ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Confirmando...
                </>
              ) : (
                'Confirmar y Archivar'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
