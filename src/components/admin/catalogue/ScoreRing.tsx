import React from 'react';

/** A listing-quality score (0-100) as a thin ink ring with the number inside. */
export const ScoreRing: React.FC<{ score: number; size?: number }> = ({ score, size = 48 }) => {
  const stroke = size >= 40 ? 4 : 3;
  const r = (size - stroke) / 2;
  const length = 2 * Math.PI * r;
  const tone = score >= 70 ? 'var(--color-ok)' : score >= 50 ? 'var(--color-ink)' : 'var(--color-danger)';
  return (
    <span className="relative shrink-0 inline-flex items-center justify-center" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-sunken-deep)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={length} strokeDashoffset={length * (1 - Math.max(0, Math.min(100, score)) / 100)}
          className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-500" />
      </svg>
      <span className={`absolute font-extrabold sag-num text-ink ${size >= 40 ? 'text-[14px]' : 'text-[11px]'}`}>{score}</span>
    </span>
  );
};
