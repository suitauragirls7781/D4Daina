import React from 'react';
import { getCleanImageUrl } from '../../utils/imageHelper';

/** Shared pieces of the admin dashboard and reports in the "Emerald Heritage" look. */

export const adminText = {
  eyebrow: 'text-[11px] leading-4 font-medium uppercase tracking-[0.12em] text-ink-muted',
  title: 'text-[17px] leading-6 font-semibold text-ink',
  note: 'text-[13px] leading-[18px] text-ink-muted',
  link: 'inline-flex items-center gap-0.5 min-h-9 text-[13px] leading-[18px] font-medium text-brand underline underline-offset-[3px] hover:text-brand-dark cursor-pointer shrink-0',
  row: 'w-full min-h-[52px] px-4 sm:px-5 py-2.5 flex items-center gap-3 text-left hover:bg-sunken transition-colors cursor-pointer',
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
  children: React.ReactNode;
}

/** One glass panel with a plain title. */
export const Panel: React.FC<PanelProps> = ({ id, title, note, action, strong, flush, className = '', children }) => (
  <section aria-labelledby={id ? `${id}-title` : undefined} id={id} className={`sag-glass ${strong ? 'sag-glass-strong' : ''} min-w-0 overflow-hidden ${className}`}>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 sm:px-5 pt-4 pb-3">
      <div className="min-w-0">
        <h3 id={id ? `${id}-title` : undefined} className={adminText.title}>{title}</h3>
        {note && <p className={`mt-0.5 ${adminText.note}`}>{note}</p>}
      </div>
      {action}
    </div>
    <div className={flush ? 'border-t border-line rounded-none' : 'px-4 sm:px-5 pb-4 sm:pb-5'}>{children}</div>
  </section>
);

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<{ id: NoInfer<T>; label: string }>;
  onChange: (id: NoInfer<T>) => void;
}

/** A row of chips where one is chosen (gold with dark text). */
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
  ? <img src={getCleanImageUrl(url, 160)} alt="" loading="lazy" className="w-10 aspect-[4/5] shrink-0 object-cover object-top bg-sunken" />
  : <span className="w-10 aspect-[4/5] shrink-0 rounded-[10px] bg-sunken" aria-hidden="true" />);

/** A share of a whole as a thin gold bar with its label and number. */
export const ShareRow: React.FC<{ label: string; count: number; total: number }> = ({ label, count, total }) => {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-3 text-sm leading-5">
        <span className="min-w-0 truncate text-ink">{label}</span>
        <span className="shrink-0 sag-num text-ink">{count.toLocaleString('en-IN')} <span className="text-ink-muted">· {Math.round(pct)}%</span></span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-sunken-deep overflow-hidden" aria-hidden="true">
        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }} />
      </div>
    </li>
  );
};
