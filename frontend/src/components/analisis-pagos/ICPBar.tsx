'use client';

import { icpColorPrimary } from './ICPBadge';

interface Props {
  score: number;
  showLabel?: boolean;
  height?: number;
}

export default function ICPBar({ score, showLabel = true, height = 6 }: Props) {
  const color = icpColorPrimary(score);
  const width = `${Math.min(100, Math.max(0, score))}%`;

  return (
    <div className="flex items-center gap-2 w-full">
      <div
        className="flex-1 rounded-full overflow-hidden"
        style={{ height: `${height}px`, background: '#f1f5f9' }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width, backgroundColor: color }}
        />
      </div>
      {showLabel && (
        <span
          className="text-[11px] font-black tabular-nums flex-shrink-0 w-7 text-right"
          style={{ color }}
        >
          {score}
        </span>
      )}
    </div>
  );
}
