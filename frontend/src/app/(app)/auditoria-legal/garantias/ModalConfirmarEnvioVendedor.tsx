'use client';

import { useEffect, useState } from 'react';
import { X, Truck, Loader2 } from 'lucide-react';
import { useGarantiaFormController } from '@/views/auditoria-legal/hooks/use-garantia-form-controller';
import type { ApiError } from '@/shared/api/api-error';
import type { GarantiaListaRow } from '@/types/auditoria-legal';

export interface ModalConfirmarEnvioVendedorProps {
  garantia: GarantiaListaRow;
  /** El usuario decidió no transicionar el estado todavía -- sigue a imprimir igual. */
  onOmitir: () => void;
  /** El PATCH de custodia (accion: ENTREGAR) ya se aplicó -- sigue a imprimir. */
  onConfirmado: () => void;
}

// Paso 4 del pedido de Jeffrey: después de imprimir el pagaré, ofrecer marcar
// la garantía como "Enviada a Vendedor" de una vez, sin que el analista tenga
// que volver a la tabla y buscar el botón "Entregar a Vendedor" por separado.
// El vendedor NUNCA se elige a mano en este sistema (se resuelve
// automáticamente por mayor saldo, fn_resolver_responsables_contribuyente) --
// acá sólo se confirma o se omite, reutilizando el mismo PATCH /custodia que
// ya usa la tabla de Garantías (mismo endpoint, mismo email al vendedor).
export default function ModalConfirmarEnvioVendedor({
  garantia,
  onOmitir,
  onConfirmado,
}: ModalConfirmarEnvioVendedorProps) {
  const [nombreVendedor, setNombreVendedor] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  const api = useGarantiaFormController();

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      if (!garantia.vendedor_cod) {
        setCargando(false);
        return;
      }
      let nombre: string | null = null;
      try {
        nombre = (await api.vendedorDeGarantia(garantia.id)).nombre;
      } catch {
        nombre = null;
      }
      if (cancelado) return;
      setNombreVendedor(nombre);
      setCargando(false);
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, [garantia.vendedor_cod, garantia.id, api]);

  async function confirmar() {
    setProcesando(true);
    setError('');
    try {
      await api.custodia(garantia.id, { accion: 'ENTREGAR' });
      // El correo al vendedor puede fallar sin que eso bloquee la transición de
      // estado -- mismo criterio no-fatal que ejecutarAccion en la tabla.
      onConfirmado();
    } catch (e) {
      setError((e as ApiError).message ?? 'Error al actualizar la custodia');
      setProcesando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Truck size={16} /> Pagaré Generado
          </h3>
          <button
            onClick={onOmitir}
            className="rounded-lg p-1.5 hover:bg-gray-100"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-3.5">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          {cargando ? (
            <div className="flex items-center justify-center py-4 text-gray-400">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : (
            <p className="text-sm text-gray-700 leading-relaxed">
              El pagaré de <b>{garantia.cliente_nombre}</b> ya quedó generado. ¿Marcar esta garantía
              como <b>Enviada a Vendedor</b>
              {nombreVendedor ? (
                <>
                  {' '}
                  — <b style={{ color: '#009ee3' }}>{nombreVendedor}</b>
                </>
              ) : (
                ''
              )}
              ?
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onOmitir}
              disabled={procesando}
              className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-60"
            >
              Omitir por ahora
            </button>
            <button
              type="button"
              onClick={confirmar}
              disabled={cargando || procesando}
              className="px-4 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-60 transition"
              style={{ backgroundColor: '#009ee3' }}
            >
              {procesando ? 'Actualizando...' : 'Confirmar y Continuar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
