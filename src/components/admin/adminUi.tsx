import React from 'react';
import { getCleanImageUrl } from '../../utils/imageHelper';

/**
 * Shared pieces of the admin pages in the admin's "Command" look: white cards with a hairline ring on the paper
 * page, ink for the main action and the main series. Also the shared kit for loading (skeletons), errors, keys,
 * trends (sparklines, change against before) and a calm "are you sure?" dialog.
 */

export const adminText = {
  eyebrow: 'text-[11px] leading-4 font-bold uppercase tracking-[0.12em] text-ink-muted',
  title: 'text-[17px] leading-6 font-extrabold tracking-[-0.015em] text-ink',
  note: 'text-[13px] leading-[18px] text-ink-muted',
  link: 'inline-flex items-center gap-0.5 min-h-9 text-[13px] leading-[18px] font-bold text-brand underline underline-offset-[3px] hover:text-brand-dark cursor-pointer shrink-0',
  row: 'w-full min-h-[52px] px-4 sm:px-5 py-2.5 flex items-center gap-3 text-left hover:bg-[color:var(--adm-hover)] transition-colors cursor-pointer',
};

interface PanelProps {
  id?: string;
  title: React.ReactNode;
  note?: React.ReactNode;
  /** Sits at the right of the title (a link, a switch). */
  action?: React.ReactNode;
  strong?: boolean;
  /** No inner padding: for lists whose rows carry their own. */
  flush?: boolean;
  className?: string;
  /** A small icon before the title. */
  icon?: React.ReactNode;
  /** Shows placeholders instead of the content while it loads. */
  loading?: boolean;
  children: React.ReactNode;
}

/** One white card with a plain title. */
export const Panel: React.FC<PanelProps> = ({ id, title, note, action, strong, flush, className = '', icon, loading, children }) => (
  <section aria-labelledby={id ? `${id}-title` : undefined} id={id} aria-busy={loading || undefined} className={`sag-glass ${strong ? 'sag-glass-strong' : ''} min-w-0 overflow-hidden ${className}`}>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 sm:px-5 pt-4 pb-3">
      <div className="min-w-0 flex items-start gap-2.5">
        {icon && <span className="mt-0.5 w-7 h-7 shrink-0 rounded-full bg-[color:var(--adm-hover)] text-ink flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4" aria-hidden="true">{icon}</span>}
        <div className="min-w-0">
          <h3 id={id ? `${id}-title` : undefined} className={adminText.title}>{title}</h3>
          {note && <p className={`mt-0.5 ${adminText.note}`}>{note}</p>}
        </div>
      </div>
      {action}
    </div>
    <div className={flush ? 'border-t border-[color:var(--adm-line)] rounded-none' : 'px-4 sm:px-5 pb-4 sm:pb-5'}>
      {loading ? <SkeletonRows rows={4} /> : children}
    </div>
  </section>
);

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<{ id: NoInfer<T>; label: string }>;
  onChange: (id: NoInfer<T>) => void;
}

/** A row of chips where one is chosen (an ink pill with paper text). */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>): React.ReactElement {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={o.id === value} onClick={() => onChange(o.id)} className="sag-chip !h-9 !min-w-0 !px-3.5 !text-[13px] cursor-pointer">
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const EmptyNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="px-4 py-8 text-sm leading-5 text-ink-muted text-center">{children}</p>
);

/** A small product photo (4:5), or a quiet placeholder when the product has none. */
export const Thumb: React.FC<{ url?: string }> = ({ url }) => (url && url.trim()
  ? <img src={getCleanImageUrl(url, 160)} alt="" loading="lazy" className="w-10 aspect-[4/5] shrink-0 rounded-[12px] object-cover object-top bg-sunken" />
  : <span className="w-10 aspect-[4/5] shrink-0 rounded-[12px] bg-sunken" aria-hidden="true" />);

/** A share of a whole as a thin ink bar on a hairline track, with its label and number. */
export const ShareRow: React.FC<{ label: string; count: number; total: number }> = ({ label, count, total }) => {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-3 text-sm leading-5">
        <span className="min-w-0 truncate text-ink">{label}</span>
        <span className="shrink-0 sag-num text-ink">{count.toLocaleString('en-IN')} <span className="text-ink-muted">· {Math.round(pct)}%</span></span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-[color:var(--adm-hover)] overflow-hidden" aria-hidden="true">
        <div className="h-full rounded-full bg-brand origin-left" style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }} />
      </div>
    </li>
  );
};

// ---------------------------------------------------------------- the shared kit, 2026-10-14

/** A key on the keyboard, drawn as a small keycap ("Ctrl", "K", "/"). */
export const Kbd: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <kbd className={`adm-kbd ${className}`}>{children}</kbd>
);

/** A quiet placeholder block while something loads. Size it with classes (h-4 w-32, aspect-[4/5]…). */
export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`adm-sk ${className}`} aria-hidden="true" />
);

/** A list that is still loading: rows of placeholders with an honest label for screen readers. */
export const SkeletonRows: React.FC<{ rows?: number; label?: string; photo?: boolean }> = ({ rows = 5, label = 'Loading', photo }) => (
  <div role="status" aria-label={label} className="divide-y divide-[color:var(--adm-line)]">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="flex items-center gap-3 px-4 sm:px-5 py-3">
        {photo && <Skeleton className="w-10 aspect-[4/5] !rounded-[12px] shrink-0" />}
        <span className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-3.5" />
          <Skeleton className="h-3 !w-2/5" />
        </span>
        <Skeleton className="h-3.5 w-14 shrink-0" />
      </div>
    ))}
  </div>
);

/** Key-number tiles that are still loading. */
export const SkeletonTiles: React.FC<{ count?: number; label?: string }> = ({ count = 4, label = 'Loading the numbers' }) => (
  <div role="status" aria-label={label} className={`grid grid-cols-2 gap-2.5 sm:gap-3 ${count >= 4 ? 'lg:grid-cols-4' : count === 3 ? 'sm:grid-cols-3' : ''}`}>
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="sag-glass px-4 py-3.5 space-y-2.5">
        <Skeleton className="h-3 !w-1/2" />
        <Skeleton className="h-7 !w-2/3" />
      </div>
    ))}
  </div>
);

/** Something could not be loaded or saved: what happened in plain words, and a way to try again. */
export const ErrorNote: React.FC<{ title?: React.ReactNode; children?: React.ReactNode; onRetry?: () => void; retryLabel?: string; className?: string }> = ({ title = 'This could not be loaded', children, onRetry, retryLabel = 'Try again', className = '' }) => (
  <div role="alert" className={`rounded-[16px] border border-danger-line bg-danger-tint px-4 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 ${className}`}>
    <div className="min-w-0 flex-1">
      <p className="text-sm leading-5 font-bold text-danger">{title}</p>
      {children && <p className="mt-0.5 text-[13px] leading-[18px] text-ink">{children}</p>}
    </div>
    {onRetry && (
      <button type="button" onClick={onRetry} className="sag-btn-outline h-10 px-4 text-[13px] gap-1.5 shrink-0">{retryLabel}</button>
    )}
  </div>
);

const SPARK_TONE = { ink: '#111013', rose: '#B76E79', forest: '#1E3A34', sale: '#8E4C58' } as const;

/**
 * A small line of real values in order (oldest first): sales of the last days, orders per hour. Draws once.
 * `label` says in words what the line shows (it is all a screen reader hears).
 */
export const Sparkline: React.FC<{ values: number[]; label: string; width?: number; height?: number; tone?: keyof typeof SPARK_TONE; area?: boolean; className?: string }> = ({ values, label, width = 96, height = 28, tone = 'ink', area = true, className = '' }) => {
  const clean = values.map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0));
  if (clean.length < 2) return null;
  const max = Math.max(...clean);
  const min = Math.min(0, ...clean);
  const span = max - min || 1;
  const pad = 2.5;
  const pts = clean.map((v, i) => [pad + (i / (clean.length - 1)) * (width - pad * 2), pad + (1 - (v - min) / span) * (height - pad * 2)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const colour = SPARK_TONE[tone];
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={label} className={`shrink-0 overflow-visible ${className}`}>
      {area && <path d={`${line} L${lx.toFixed(1)} ${height} L${pts[0][0].toFixed(1)} ${height} Z`} fill={colour} opacity={0.08} />}
      <path d={line} pathLength={1} className="adm-spark-line" fill="none" stroke={colour} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={2.4} fill={colour} />
    </svg>
  );
};

/** A change against an earlier real period ("↑ +12%" in forest, "↓ −8%" in dark rose). Draws nothing when there is nothing to compare. */
export const Delta: React.FC<{ now: number; before: number | null | undefined; suffix?: string; className?: string }> = ({ now, before, suffix = 'vs before', className = '' }) => {
  if (before === null || before === undefined || !Number.isFinite(before) || before <= 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs leading-4 font-semibold sag-num ${up ? 'text-ok' : 'text-sale'} ${className}`}>
      <span aria-hidden="true">{up ? '↑' : '↓'}</span>{up ? '+' : '−'}{Math.abs(pct)}%{suffix && <span className="font-normal text-ink-muted">{suffix}</span>}
    </span>
  );
};

interface ConfirmOptions {
  title: string;
  line?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for deleting or cancelling. */
  danger?: boolean;
}

/**
 * A calm "are you sure?" in the admin's own look (instead of the browser's grey box):
 *   const { confirm, confirmDialog } = useConfirm();
 *   if (await confirm({ title: 'Delete this coupon?', danger: true })) …
 *   return <>{…}{confirmDialog}</>;
 */
export const useConfirm = () => {
  const [ask, setAsk] = React.useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const okRef = React.useRef<HTMLButtonElement>(null);
  const confirm = React.useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setAsk({ ...options, resolve })), []);
  const close = React.useCallback((ok: boolean) => {
    setAsk((current) => { current?.resolve(ok); return null; });
  }, []);
  React.useEffect(() => {
    if (!ask) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(false); } };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); previous?.focus?.(); };
  }, [ask, close]);
  const confirmDialog = ask ? (
    <div className="fixed inset-0 z-[90] bg-[color:var(--sag-scrim)] flex items-end sm:items-center justify-center sm:p-4 adm-fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) close(false); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="adm-confirm-title" aria-describedby={ask.line ? 'adm-confirm-line' : undefined} className="adm-dialog adm-sheet-in sm-pop w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-5">
        <p id="adm-confirm-title" className="text-[19px] leading-6 font-extrabold tracking-[-0.015em] text-ink">{ask.title}</p>
        {ask.line && <p id="adm-confirm-line" className="mt-1.5 text-sm leading-5 text-ink-muted">{ask.line}</p>}
        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" onClick={() => close(false)} className="sag-btn-outline h-11 px-5 text-sm">{ask.cancelLabel || 'Cancel'}</button>
          <button ref={okRef} type="button" onClick={() => close(true)} className={ask.danger ? 'h-11 px-5 rounded-full bg-danger text-white text-sm font-bold cursor-pointer' : 'sag-btn-primary h-11 px-5 text-sm'}>{ask.confirmLabel || 'Yes, go ahead'}</button>
        </div>
      </div>
    </div>
  ) : null;
  return { confirm, confirmDialog };
};
