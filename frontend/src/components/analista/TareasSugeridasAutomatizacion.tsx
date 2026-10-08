import Link from 'next/link';
import { Bell } from 'lucide-react';

interface TareaSugerida {
  id: string;
  titulo: string;
  mensaje: string | null;
  link: string | null;
  created_at: string;
}

interface Props {
  eventos: TareaSugerida[];
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const horas = Math.floor(mins / 60);
  if (horas < 24) return `hace ${horas}h`;
  return `hace ${Math.floor(horas / 24)}d`;
}

export default function TareasSugeridasAutomatizacion({ eventos }: Props) {
  if (eventos.length === 0) return null;

  return (
    <div
      className="bg-white border border-slate-200 rounded-lg overflow-hidden"
      style={{ borderTop: '3px solid #003B5C' }}
    >
      <div className="px-4 py-2.5 border-b border-gray-100">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Tareas sugeridas
        </span>
      </div>
      <div className="divide-y divide-gray-50">
        {eventos.map((e) => (
          // link ?? '#' es solo un fallback defensivo: fn_notificar_sin_gestion
          // siempre setea v_link := '/clientes/' || cliente_cod, así que en la
          // práctica esta regla nunca genera un link nulo.
          <Link
            key={e.id}
            href={e.link ?? '#'}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition"
          >
            <Bell size={14} className="text-amber-500 flex-shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-medium text-gray-800 truncate">
                {e.titulo}
              </span>
              {e.mensaje && (
                <span className="block text-[11px] text-gray-400 truncate">{e.mensaje}</span>
              )}
            </span>
            <span className="text-[11px] text-gray-400 flex-shrink-0">{timeAgo(e.created_at)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
