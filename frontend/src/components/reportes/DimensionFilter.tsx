'use client';

import { useDimensionOpciones } from '@/views/reportes/hooks/use-envio-reporte-controller';

interface Props {
  tipo: 'dimension' | 'agrupacion';
  value: string;
  onChange: (v: string) => void;
}

export default function DimensionFilter({ tipo, value, onChange }: Props) {
  const opciones = useDimensionOpciones(tipo);

  const label = tipo === 'dimension' ? 'Dimensión' : 'Agrupación';

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] bg-white text-gray-700 focus:outline-none"
      >
        <option value="">Todas</option>
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
