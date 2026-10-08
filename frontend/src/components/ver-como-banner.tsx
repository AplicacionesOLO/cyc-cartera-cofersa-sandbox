'use client';

import { Eye, Loader2 } from 'lucide-react';
import { useVerComoController } from '@/views/identidad/hooks/use-ver-como-controller';
import { displayRol } from '@/lib/utils/roles';

interface Props {
  rolPreview: string;
}

// Franja fija arriba de todo el contenido (no del Sidebar) mientras Coordinador
// está previsualizando otro rol -- siempre visible, sin importar cuán reducido
// sea el menú de ese rol, para nunca depender de llegar a Configuración para salir.
export default function VerComoBanner({ rolPreview }: Props) {
  const { loading: saliendo, cambiar } = useVerComoController();

  async function salir() {
    await cambiar(null);
  }

  return (
    <div
      className="flex items-center gap-2.5 px-5 flex-shrink-0"
      style={{
        height: '34px',
        background: '#fffbeb',
        borderBottom: '1px solid #fde68a',
        color: '#78350f',
        fontSize: '12.5px',
      }}
    >
      <Eye size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
      <span>
        Estás viendo el SIC como <strong>{displayRol(rolPreview)}</strong> — así ven ellos el
        sistema.
      </span>
      <button
        onClick={salir}
        disabled={saliendo}
        className="ml-auto flex items-center gap-1.5 rounded-lg font-bold transition hover:opacity-90 disabled:opacity-60"
        style={{
          background: '#fff',
          border: '1px solid #fcd34d',
          color: '#78350f',
          fontSize: '11.5px',
          padding: '5px 12px',
        }}
      >
        {saliendo ? <Loader2 size={12} className="animate-spin" /> : null}
        Salir de vista previa
      </button>
    </div>
  );
}
