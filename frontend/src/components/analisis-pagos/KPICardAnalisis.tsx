'use client';

interface Props {
  label: string;
  valor: string | number;
  sub?: string;
  color: string;
  icon?: React.ReactNode;
  muted?: boolean;
  compact?: boolean; // true → padding reducido para grids de 5 columnas
}

export default function KPICardAnalisis({ label, valor, sub, color, icon, muted, compact }: Props) {
  const displayColor = muted ? '#94a3b8' : color;
  return (
    <div
      className={`bg-white rounded-xl border border-slate-100 flex flex-col items-center text-center ${compact ? 'p-3' : 'p-4'}`}
      style={{ borderTop: `3px solid ${displayColor}` }}
    >
      {icon && (
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center mb-2 flex-shrink-0"
          style={{ background: `${displayColor}18` }}
        >
          <span style={{ color: displayColor }}>{icon}</span>
        </div>
      )}
      <p
        className={`font-bold text-gray-400 uppercase tracking-wider mb-1 leading-tight ${compact ? 'text-[9px]' : 'text-[10px]'}`}
      >
        {label}
      </p>
      <p
        className="font-black tabular-nums leading-tight"
        style={{ fontSize: compact ? '1.35rem' : '1.6rem', color: muted ? '#94a3b8' : '#1e293b' }}
      >
        {valor}
      </p>
      {sub && (
        <p className={`text-gray-400 mt-1 leading-snug ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
          {sub}
        </p>
      )}
    </div>
  );
}
