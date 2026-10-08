'use client';

import { useState, useEffect } from 'react';
import { X, FileText, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { ESTADO_CIVIL_OPCIONES } from '@/types/auditoria-legal';
import type { DatosTemporalesSolicitud } from '@/types/actualizacion-perfil';
import { useSolicitudActualizacionController } from '@/views/auditoria-legal/hooks/use-solicitud-actualizacion-controller';
import type { ApiError } from '@/shared/api/api-error';

export interface ModalRevisarActualizacionProps {
  solicitudId: number;
  onClose: () => void;
  /** Se llama con los datos aprobados -- el padre abre ModalEmitirPagare pre-llenado. */
  onAprobado: (datos: DatosTemporalesSolicitud) => void;
}

interface SolicitudDetalle {
  id: number;
  cliente_nombre: string;
  tipo_persona: 'FISICA' | 'JURIDICA';
  datos_temporales: DatosTemporalesSolicitud | null;
  url_cedula_firmada: string | null;
  url_personeria_firmada: string | null;
}

export default function ModalRevisarActualizacion({
  solicitudId,
  onClose,
  onAprobado,
}: ModalRevisarActualizacionProps) {
  const [data, setData] = useState<SolicitudDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [imgError, setImgError] = useState(false);
  const solicitudes = useSolicitudActualizacionController();

  useEffect(() => {
    const controller = new AbortController();
    solicitudes
      .detalle(solicitudId, controller.signal)
      .then((json) => setData(json as SolicitudDetalle))
      .catch((e: ApiError) => {
        if (e.isCanceled) return;
        setError(e.message ?? 'Error al cargar la solicitud');
        setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargando(false);
      });
    return () => controller.abort();
  }, [solicitudId, solicitudes]);

  async function aprobar() {
    // Guard de reentrada al inicio de la función -- el estado de React se
    // actualiza async, así que un doble clic rápido puede disparar dos
    // llamadas antes de que `procesando` pase a true.
    if (procesando) return;
    if (!data?.datos_temporales) return;
    setProcesando(true);
    setError('');
    try {
      await solicitudes.gestionar(solicitudId, { accion: 'APROBAR' });
      onAprobado(data.datos_temporales);
      // No reseteamos `procesando` en éxito: el padre reemplaza/cierra este modal
      // vía onAprobado en breve; reactivar el botón permitiría un doble envío.
    } catch (e) {
      setError((e as ApiError).message ?? 'Error al aprobar');
      setProcesando(false);
    }
  }

  async function rechazar() {
    if (procesando) return;
    if (!nota.trim()) {
      setError('Indicá el motivo del rechazo');
      return;
    }
    setProcesando(true);
    setError('');
    try {
      await solicitudes.gestionar(solicitudId, { accion: 'RECHAZAR', nota: nota.trim() });
      onClose();
      // No reseteamos `procesando` en éxito: el modal se cierra, no hace falta reactivar el botón.
    } catch (e) {
      setError((e as ApiError).message ?? 'Error al rechazar');
      setProcesando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !procesando) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h3 className="font-bold text-gray-900">Revisar Datos Recibidos</h3>
          <button
            onClick={onClose}
            disabled={procesando}
            className="rounded-lg p-1.5 hover:bg-gray-100 disabled:opacity-60"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {cargando ? (
            <div className="flex justify-center py-8">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : !data?.datos_temporales ? (
            <p className="text-sm text-red-600">{error || 'No se pudo cargar la solicitud.'}</p>
          ) : (
            <>
              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                <Campo label="Nombre" valor={data.datos_temporales.nombre} />
                <Campo label="Cédula" valor={data.datos_temporales.cedula} />
                <Campo label="Estado Civil" valor={data.datos_temporales.estado_civil} />
                <Campo label="Profesión" valor={data.datos_temporales.profesion} />
                <Campo label="Domicilio" valor={data.datos_temporales.domicilio} />
                {data.datos_temporales.telefono && (
                  <Campo label="Teléfono" valor={data.datos_temporales.telefono} />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                {data.url_cedula_firmada &&
                  (imgError ? (
                    <div className="rounded-lg border border-slate-200 flex items-center justify-center h-32 p-2">
                      <p className="text-[11px] text-center text-gray-500">
                        El enlace de la imagen venció — cerrá y volvé a abrir esta revisión para
                        generar uno nuevo.
                      </p>
                    </div>
                  ) : (
                    <a
                      href={data.url_cedula_firmada}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-slate-200 overflow-hidden block"
                    >
                      <img
                        src={data.url_cedula_firmada}
                        alt="Cédula"
                        className="w-full h-32 object-cover"
                        onError={() => setImgError(true)}
                      />
                      <p className="text-[10px] text-center py-1 text-gray-500">
                        Ver cédula completa
                      </p>
                    </a>
                  ))}
                {data.url_personeria_firmada && (
                  <a
                    href={data.url_personeria_firmada}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-slate-200 flex flex-col items-center justify-center h-32 gap-2 text-gray-500 hover:bg-slate-50"
                  >
                    <FileText size={24} />
                    <span className="text-[11px]">Ver personería (PDF)</span>
                  </a>
                )}
              </div>

              {!rechazando ? (
                <div className="flex justify-end gap-2 pt-3">
                  <button
                    onClick={() => setRechazando(true)}
                    disabled={procesando}
                    className="px-4 py-2 text-sm font-semibold text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-60 inline-flex items-center gap-1.5"
                  >
                    <XCircle size={14} /> Rechazar
                  </button>
                  <button
                    onClick={aprobar}
                    disabled={procesando}
                    className="px-4 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-60 inline-flex items-center gap-1.5"
                    style={{ background: '#16a34a' }}
                  >
                    {procesando ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}{' '}
                    Aprobar y Generar Pagaré
                  </button>
                </div>
              ) : (
                <div className="space-y-2 pt-2">
                  <label
                    htmlFor="motivo-rechazo"
                    className="block text-[11px] font-bold text-gray-500 uppercase"
                  >
                    Motivo del rechazo
                  </label>
                  <textarea
                    id="motivo-rechazo"
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    placeholder="Ej: la foto de la cédula no es legible"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setRechazando(false)}
                      disabled={procesando}
                      className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-60"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={rechazar}
                      disabled={procesando}
                      className="px-4 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-60"
                      style={{ background: '#dc2626' }}
                    >
                      Confirmar Rechazo
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-gray-700">
        {valor}
        {label === 'Estado Civil' && !(ESTADO_CIVIL_OPCIONES as readonly string[]).includes(valor)
          ? ' (valor inesperado)'
          : ''}
      </p>
    </div>
  );
}
