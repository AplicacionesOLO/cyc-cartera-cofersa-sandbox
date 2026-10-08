'use client';

import { useRouter } from 'next/navigation';
import { useNotificacionesController } from '@/views/notificaciones/hooks/use-notificaciones-controller';
import {
  X,
  Bell,
  CheckCheck,
  ClipboardList,
  Handshake,
  AlertTriangle,
  RefreshCw,
  Info,
  PackageSearch,
  Scale,
} from 'lucide-react';
import type { Notificacion, TipoNotif } from '@/types/database';

// ── Config visual por tipo ──────────────────────────────────────────────
const TIPO_CFG: Record<TipoNotif, { icon: React.ReactNode; color: string; bg: string }> = {
  SOLICITUD: { icon: <ClipboardList size={14} />, color: '#009ee3', bg: '#e0f2fe' },
  PROMESA: { icon: <Handshake size={14} />, color: '#f59e0b', bg: '#fef9c3' },
  ALERTA: { icon: <AlertTriangle size={14} />, color: '#dc2626', bg: '#fee2e2' },
  SYNC: { icon: <RefreshCw size={14} />, color: '#22c55e', bg: '#dcfce7' },
  PEDIDO_RETENIDO: { icon: <PackageSearch size={14} />, color: '#ea580c', bg: '#ffedd5' },
  GARANTIA: { icon: <Scale size={14} />, color: '#003B5C', bg: '#e2e8f0' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

// ── Props ──────────────────────────────────────────────────────────────
interface Props {
  notificaciones: Notificacion[];
  usuarioId: string;
  onClose: () => void;
}

// ══════════════════════════════════════════════════════════════════════
// COMPONENTE
// ══════════════════════════════════════════════════════════════════════
export default function PanelNotificaciones({ notificaciones: init, usuarioId, onClose }: Props) {
  const router = useRouter();
  // Lista recibida por props (sin polling propio); las acciones marcan como leída vía API
  const { notis, marcarLeida, marcarTodas } = useNotificacionesController(usuarioId, {
    initial: init,
    poll: false,
  });

  const noLeidas = notis.filter((n) => !n.leida).length;

  // ── Click en notificación ────────────────────────────────────────
  async function handleClick(n: Notificacion) {
    if (!n.leida) await marcarLeida(n.id);
    if (n.link) {
      onClose();
      router.push(n.link);
    }
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <>
      {/* Overlay semitransparente */}
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}
        onClick={onClose}
      />

      {/* Panel lateral */}
      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col bg-white shadow-2xl"
        style={{ width: '360px', borderLeft: '1px solid #e2e8f0' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid #e2e8f0' }}
        >
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-gray-500" />
            <h2 className="text-[14px] font-bold text-gray-800">Notificaciones</h2>
            {noLeidas > 0 && (
              <span
                className="text-[10px] font-black rounded-full px-2 py-0.5"
                style={{ backgroundColor: '#dc2626', color: 'white' }}
              >
                {noLeidas}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {noLeidas > 0 && (
              <button
                onClick={marcarTodas}
                className="flex items-center gap-1 text-[11px] font-semibold text-gray-400 hover:text-gray-600 transition"
              >
                <CheckCheck size={13} /> Marcar todo
              </button>
            )}
            <button
              onClick={onClose}
              className="flex items-center justify-center rounded-lg hover:bg-gray-100 transition"
              style={{ width: '28px', height: '28px', color: '#94a3b8' }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {notis.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <Bell size={20} className="text-gray-300" />
              </div>
              <p className="text-[13px] font-semibold text-gray-500">Sin notificaciones</p>
              <p className="text-[11px] text-gray-400 mt-1">Todo al día por ahora.</p>
            </div>
          ) : (
            <div>
              {notis.map((n, i) => {
                const cfg = TIPO_CFG[n.tipo] ?? {
                  icon: <Info size={14} />,
                  color: '#64748b',
                  bg: '#f1f5f9',
                };
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className="w-full flex items-start gap-3 px-5 py-3.5 text-left transition hover:bg-gray-50"
                    style={{
                      borderBottom: i < notis.length - 1 ? '1px solid #f1f5f9' : 'none',
                      backgroundColor: n.leida ? 'transparent' : '#f8fbff',
                    }}
                  >
                    {/* Ícono tipo */}
                    <div
                      className="flex items-center justify-center rounded-lg flex-shrink-0 mt-0.5"
                      style={{
                        width: '30px',
                        height: '30px',
                        backgroundColor: cfg.bg,
                        color: cfg.color,
                      }}
                    >
                      {cfg.icon}
                    </div>

                    {/* Contenido */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-[12px] leading-snug"
                        style={{
                          fontWeight: n.leida ? 500 : 700,
                          color: n.leida ? '#64748b' : '#1e293b',
                        }}
                      >
                        {n.titulo}
                      </p>
                      {n.mensaje && (
                        <p className="text-[11px] text-gray-400 mt-0.5 leading-snug line-clamp-2">
                          {n.mensaje}
                        </p>
                      )}
                      <p className="text-[10px] text-gray-300 mt-1 font-medium">
                        {timeAgo(n.created_at)}
                      </p>
                    </div>

                    {/* Punto no leído */}
                    {!n.leida && (
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                        style={{ backgroundColor: '#009ee3' }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
