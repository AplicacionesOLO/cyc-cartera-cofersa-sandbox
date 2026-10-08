'use client';

import { useState } from 'react';
import { X, Mail, Loader2, Copy, Check } from 'lucide-react';
import { useSolicitudActualizacionController } from '@/views/auditoria-legal/hooks/use-solicitud-actualizacion-controller';
import type { ApiError } from '@/shared/api/api-error';
import { asuntoAuditoriaAnual } from '@/lib/auditoria-legal/email-actualizacion-perfil';

export interface ModalSolicitarActualizacionProps {
  contribuyente: string;
  clienteNombre: string;
  correoSugerido: string;
  onClose: () => void;
  onEnviado: () => void;
  // Presente = modo "Reenviar / Editar Correo" sobre una solicitud ya ENVIADA
  // (PATCH que rota el token) en vez de crear una nueva (POST). El link
  // anterior queda inválido de inmediato en cuanto se reenvía.
  solicitudId?: number;
}

export default function ModalSolicitarActualizacion({
  contribuyente,
  clienteNombre,
  correoSugerido,
  onClose,
  onEnviado,
  solicitudId,
}: ModalSolicitarActualizacionProps) {
  const esReenvio = solicitudId != null;
  const solicitudes = useSolicitudActualizacionController();
  const [correo, setCorreo] = useState(correoSugerido);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function enviar() {
    // Guard de reentrada al inicio de la función (no sólo el `disabled` del
    // botón): el estado de React se actualiza async, así que un doble clic
    // rápido puede disparar dos llamadas antes de que `enviando` pase a true.
    if (enviando) return;
    if (!correo.trim()) {
      setError('Indicá un correo de destino');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      // El correo lo envía el backend con el Gmail del usuario (ya no viaja providerToken).
      const json = esReenvio
        ? await solicitudes.reenviar(solicitudId, correo.trim())
        : await solicitudes.crear({
            contribuyente,
            cliente_nombre: clienteNombre,
            correo_destino: correo.trim(),
          });
      setLink(json.link);
      if (!json.email_sent)
        setError(
          `El link se generó, pero el correo no se pudo enviar — ${json.email_error ?? ''}. Podés copiar el link y enviarlo manualmente.`,
        );
    } catch (e) {
      setError(
        (e as ApiError).message ?? `Error al ${esReenvio ? 'reenviar' : 'crear'} la solicitud`,
      );
    } finally {
      setEnviando(false);
    }
  }

  function copiarLink() {
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
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
            <Mail size={16} /> {esReenvio ? 'Reenviar Solicitud' : 'Solicitar Actualización'}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <p className="text-[12.5px] text-gray-600">
            {esReenvio ? (
              <>
                Se generará un <b>enlace nuevo</b> y el anterior dejará de funcionar de inmediato.
                Podés cambiar el correo de destino antes de reenviar.
              </>
            ) : (
              <>
                Se enviará el correo <b>&ldquo;{asuntoAuditoriaAnual()}&rdquo;</b> a{' '}
                <b>{clienteNombre}</b> con un enlace válido por 7 días para completar su expediente.
              </>
            )}
          </p>
          <div>
            <label
              htmlFor="correo-destino"
              className="block text-[11px] font-bold text-gray-500 uppercase mb-1"
            >
              Correo de destino
            </label>
            <input
              id="correo-destino"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              disabled={!!link}
              placeholder="cliente@ejemplo.com"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
            />
          </div>
          {link && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-gray-500 truncate">{link}</span>
              <button
                type="button"
                onClick={copiarLink}
                className="shrink-0 text-[11px] font-semibold text-[#009ee3] hover:underline inline-flex items-center gap-1"
              >
                {copiado ? (
                  <>
                    <Check size={12} /> Copiado
                  </>
                ) : (
                  <>
                    <Copy size={12} /> Copiar
                  </>
                )}
              </button>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            {link ? (
              <button
                onClick={onEnviado}
                className="px-4 py-2 text-sm font-bold text-white rounded-lg"
                style={{ background: '#009ee3' }}
              >
                Listo
              </button>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  onClick={enviar}
                  disabled={enviando}
                  className="px-4 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-60 inline-flex items-center gap-2"
                  style={{ background: '#009ee3' }}
                >
                  {enviando ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}{' '}
                  {esReenvio ? 'Reenviar' : 'Enviar Solicitud'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
