import React, { useEffect, useId, useMemo, useState } from 'react';

/**
 * The admin's own charts, drawn with plain SVG and HTML (no chart package). Every chart takes real numbers
 * only: a value of `null` means "no data" and is drawn as a gap, never as 0. Ink is the main series, a quiet
 * dashed line the period before, rose the one highlighted mark. Motion is a single draw-in of the line, left
 * out with reduced motion. Each chart carries its numbers in words too (title, tooltip, aria-live line).
 */

// ---------------------------------------------------------------- shared bits

/** The one animation the charts use (the line drawing in once), with reduced motion respected. */
const ChartStyle = () => (
  <style>{`
    @media (prefers-reduced-motion: no-preference) {
      .a2-draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: a2-draw 900ms cubic-bezier(.2,.7,.2,1) forwards; }
      .a2-fade { opacity: 0; animation: a2-fade 700ms ease-out 200ms forwards; }
      .a2-grow { transform-origin: left center; transform: scaleX(0); animation: a2-grow 700ms cubic-bezier(.2,.7,.2,1) forwards; }
    }
    @keyframes a2-draw { to { stroke-dashoffset: 0; } }
    @keyframes a2-fade { to { opacity: 1; } }
    @keyframes a2-grow { to { transform: scaleX(1); } }
  `}</style>
);

/** A round top for the y axis: 1, 2, 2.5 or 5 times a power of ten. */
const niceMax = (value: number) => {
  if (!(value > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * power >= value) || 10;
  return step * power;
};

const useIsWide = (query = '(min-width: 640px)') => {
  const [wide, setWide] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : true));
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const list = window.matchMedia(query);
    const on = () => setWide(list.matches);
    list.addEventListener?.('change', on);
    return () => list.removeEventListener?.('change', on);
  }, [query]);
  return wide;
};
export { useIsWide };

// ---------------------------------------------------------------- change against the period before

export type DeltaTone = 'good' | 'bad' | 'flat';

/**
 * "▲ 12% vs the 7 days before" in words. Up is good unless `upIsBad`. Nothing is drawn when there is
 * nothing to compare with (`before` null); "Up from 0" when the earlier figure was 0.
 */
export const Delta: React.FC<{ now: number | null; before: number | null; than: string; upIsBad?: boolean; className?: string; points?: boolean }> = ({ now, before, than, upIsBad, className = '', points }) => {
  if (now === null || before === null) return <span className={`text-xs leading-4 text-ink-muted ${className}`}>No earlier figure to compare</span>;
  const gap = now - before;
  const flat = Math.abs(gap) < 1e-9 || (before > 0 && Math.abs(gap / before) < 0.005);
  let words: string;
  if (flat) words = `Same as ${than}`;
  else if (points) {
    const pts = Math.abs(gap * 100);
    words = `${gap > 0 ? '▲' : '▼'} ${pts.toFixed(pts >= 10 ? 0 : pts >= 1 ? 1 : 2)} pts vs ${than}`;
  }
  else if (before === 0) words = `▲ Up from 0 ${than}`;
  else {
    const pct = Math.abs(gap / before) * 100;
    words = `${gap > 0 ? '▲' : '▼'} ${pct >= 10 ? Math.round(pct) : pct.toFixed(1)}% vs ${than}`;
  }
  const tone: DeltaTone = flat ? 'flat' : (gap > 0) !== Boolean(upIsBad) ? 'good' : 'bad';
  return <span className={`text-xs leading-4 ${tone === 'good' ? 'text-ok font-semibold' : tone === 'bad' ? 'text-sale font-semibold' : 'text-ink-muted'} ${className}`}>{words}</span>;
};

// ---------------------------------------------------------------- sparkline

/** A tiny trend line for a tile (decoration: the tile carries the number in words). Null values break the line. */
export const Sparkline: React.FC<{ values: Array<number | null>; className?: string }> = ({ values, className = '' }) => {
  const counted = values.filter((v): v is number => v !== null);
  if (values.length < 2 || counted.length < 2) return <span className={`block h-7 ${className}`} aria-hidden="true" />;
  const top = Math.max(...counted, 0) || 1;
  const segments: string[] = [];
  let current = '';
  values.forEach((v, i) => {
    if (v === null) { if (current) segments.push(current); current = ''; return; }
    const x = (i / (values.length - 1)) * 100;
    const y = 26 - (v / top) * 24;
    current += `${current ? ' L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  if (current) segments.push(current);
  const lastIndex = values.length - 1;
  const last = values[lastIndex];
  return (
    <span className={`relative block h-7 ${className}`} aria-hidden="true">
      <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
        {segments.map((d, i) => <path key={i} d={d} fill="none" stroke="var(--color-ink)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="a2-fade" />)}
      </svg>
      {last !== null && <span className="absolute w-1.5 h-1.5 -mr-[3px] -mt-[3px] rounded-full bg-accent" style={{ right: 0, top: `${((26 - (last / top) * 24) / 28) * 100}%` }} />}
      <ChartStyle />
    </span>
  );
};

// ---------------------------------------------------------------- trend chart

export interface TrendPoint {
  key: string;
  /** Short label for the axis and the tooltip ("Mon 12 Oct"). */
  label: string;
  value: number | null;
  /** The same position in the period before (drawn dashed). */
  before?: number | null;
  /** The label of that earlier position, for the tooltip. */
  beforeLabel?: string;
  /** e.g. "so far" for today. */
  note?: string;
}

interface TrendChartProps {
  points: TrendPoint[];
  format: (value: number) => string;
  /** What the chart shows, for screen readers: "Sales per day, 12 Sep to 11 Oct". */
  label: string;
  /** Name of the dashed line in the legend ("The 30 days before"); no dashed line when not given. */
  beforeName?: string;
  /** Name of the main line in the legend. */
  name: string;
  height?: number;
  /** A clearly labelled straight trend line through the main series (least squares). */
  showTrend?: boolean;
}

const H = 100;

/** A line chart with an optional dashed line for the period before, a crosshair and a tooltip on hover, tap or arrow keys. */
export const TrendChart: React.FC<TrendChartProps> = ({ points, format, label, beforeName, name, height = 190, showTrend }) => {
  const [active, setActive] = useState<number | null>(null);
  const id = useId();
  const n = points.length;
  const hasBefore = Boolean(beforeName) && points.some((p) => p.before !== null && p.before !== undefined);
  const counted = points.filter((p) => p.value !== null).length;

  const top = useMemo(() => niceMax(Math.max(0, ...points.map((p) => p.value ?? 0), ...(hasBefore ? points.map((p) => p.before ?? 0) : []))), [points, hasBefore]);
  const xOf = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const yOf = (v: number) => H - (v / top) * H;

  const pathOf = (pick: (p: TrendPoint) => number | null | undefined) => {
    const parts: string[] = [];
    let run = '';
    points.forEach((p, i) => {
      const v = pick(p);
      if (v === null || v === undefined) { if (run) parts.push(run); run = ''; return; }
      run += `${run ? ' L' : 'M'}${xOf(i).toFixed(3)} ${yOf(v).toFixed(3)}`;
    });
    if (run) parts.push(run);
    return parts;
  };
  const main = pathOf((p) => p.value);
  const before = hasBefore ? pathOf((p) => p.before) : [];
  // The area under the main line, one shape per unbroken run
  const areas = main.map((d) => {
    const xs = [...d.matchAll(/[ML]([\d.]+) /g)].map((m) => m[1]);
    return `${d} L${xs[xs.length - 1]} ${H} L${xs[0]} ${H} Z`;
  });

  // Least-squares line through the counted points (labelled "Simple trend line" in the legend)
  const trend = useMemo(() => {
    if (!showTrend) return null;
    const pts = points.map((p, i) => [i, p.value] as const).filter((p): p is readonly [number, number] => p[1] !== null);
    if (pts.length < 4) return null;
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
    if (!sxx) return null;
    const slope = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / sxx;
    const at = (i: number) => Math.max(0, Math.min(top, my + slope * (i - mx)));
    return { d: `M${xOf(pts[0][0])} ${yOf(at(pts[0][0]))} L${xOf(pts[pts.length - 1][0])} ${yOf(at(pts[pts.length - 1][0]))}`, up: slope > 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, showTrend, top]);

  const pick = (clientX: number, box: DOMRect) => {
    if (!n) return;
    const ratio = Math.min(1, Math.max(0, (clientX - box.left) / Math.max(1, box.width)));
    setActive(Math.round(ratio * (n - 1)));
  };
  const focus = active !== null ? points[active] : null;
  const lastCounted = [...points].reverse().find((p) => p.value !== null);
  const shown = focus || lastCounted || null;

  const tickLabels = n > 0 ? [points[0], points[Math.floor((n - 1) / 2)], points[n - 1]].filter((p, i, all) => all.indexOf(p) === i) : [];

  return (
    <div className="min-w-0">
      <ChartStyle />
      <p className="min-h-[44px] text-sm leading-5 text-ink-muted" aria-live="polite" id={`${id}-now`}>
        {shown ? (
          <>
            <span className="text-ink">{shown.label}{shown.note ? ` (${shown.note})` : ''}: </span>
            <span className="sag-num text-lg leading-6 font-semibold text-ink">{shown.value === null ? 'No data' : format(shown.value)}</span>
            {hasBefore && shown.before !== undefined && (
              <span className="block sag-num text-xs leading-4">
                {shown.beforeLabel || 'Before'}: {shown.before === null ? 'No data' : format(shown.before)}
              </span>
            )}
          </>
        ) : 'No data'}
      </p>
      <div className="mt-2 flex gap-2">
        <div className="shrink-0 flex flex-col justify-between text-right text-[11px] leading-4 text-ink-muted sag-num" style={{ height }} aria-hidden="true">
          <span className="-mt-2">{format(top)}</span>
          <span>{format(top / 2)}</span>
          <span className="-mb-2">0</span>
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="relative touch-pan-y cursor-crosshair outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-[6px]"
            style={{ height }}
            role="group"
            tabIndex={0}
            aria-label={`${label}. Use the left and right arrow keys to read each point.`}
            aria-describedby={`${id}-now`}
            onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerLeave={(e) => { if (e.pointerType === 'mouse') setActive(null); }}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
              e.preventDefault();
              setActive((old) => {
                const at = old ?? n - 1;
                if (e.key === 'Home') return 0;
                if (e.key === 'End') return n - 1;
                return Math.min(n - 1, Math.max(0, at + (e.key === 'ArrowRight' ? 1 : -1)));
              });
            }}
            onBlur={() => setActive(null)}
          >
            {/* grid: three hairlines */}
            {[0, 50, 100].map((y) => <span key={y} className="absolute left-0 right-0 border-t border-line rounded-none" style={{ top: `${y}%` }} aria-hidden="true" />)}
            {counted === 0 ? (
              <p className="absolute inset-0 flex items-center justify-center text-sm leading-5 text-ink-muted">No data for these days</p>
            ) : (
              <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible" aria-hidden="true">
                {areas.map((d, i) => <path key={`a${i}`} d={d} fill="var(--color-ink)" fillOpacity="0.06" className="a2-fade" />)}
                {before.map((d, i) => <path key={`b${i}`} d={d} fill="none" stroke="var(--color-control)" strokeWidth="1.75" strokeDasharray="5 4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
                {trend && <path d={trend.d} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeDasharray="2 4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
                {main.map((d, i) => <path key={`m${i}`} d={d} fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="a2-fade" />)}
              </svg>
            )}
            {/* a lone counted point between gaps still shows as a dot */}
            {points.map((p, i) => (p.value !== null && (i === 0 || points[i - 1].value === null) && (i === n - 1 || points[i + 1].value === null)
              ? <span key={p.key} className="absolute w-2 h-2 -ml-1 -mt-1 rounded-full bg-brand" style={{ left: `${xOf(i)}%`, top: `${yOf(p.value)}%` }} aria-hidden="true" />
              : null))}
            {focus && (
              <>
                <span className="absolute top-0 bottom-0 w-px bg-ink/30 pointer-events-none" style={{ left: `${xOf(active!)}%` }} aria-hidden="true" />
                {hasBefore && focus.before !== null && focus.before !== undefined && (
                  <span className="absolute w-2 h-2 -ml-1 -mt-1 rounded-full bg-control ring-2 ring-surface pointer-events-none" style={{ left: `${xOf(active!)}%`, top: `${yOf(focus.before)}%` }} aria-hidden="true" />
                )}
                {focus.value !== null && (
                  <span className="absolute w-2.5 h-2.5 -ml-[5px] -mt-[5px] rounded-full bg-accent ring-2 ring-surface pointer-events-none" style={{ left: `${xOf(active!)}%`, top: `${yOf(focus.value)}%` }} aria-hidden="true" />
                )}
              </>
            )}
          </div>
          <div className="mt-1.5 flex justify-between gap-2 text-[11px] leading-4 text-ink-muted" aria-hidden="true">
            {tickLabels.map((p) => <span key={p.key} className="truncate">{p.label}</span>)}
          </div>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-4 text-ink-muted" aria-label="Legend">
        <li className="inline-flex items-center gap-1.5"><span className="w-4 h-0.5 rounded-full bg-brand" aria-hidden="true" />{name}</li>
        {hasBefore && <li className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-control rounded-none" aria-hidden="true" />{beforeName}</li>}
        {trend && <li className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dotted border-accent rounded-none" aria-hidden="true" />Simple trend line ({trend.up ? 'rising' : 'falling'}), a guide, not a forecast</li>}
      </ul>
    </div>
  );
};

// ---------------------------------------------------------------- a whole split into parts

export type PartTone = 'ink' | 'rose' | 'sand' | 'forest' | 'blush';
const toneClass: Record<PartTone, string> = { ink: 'bg-brand', rose: 'bg-accent', sand: 'bg-sunken-deep', forest: 'bg-ok', blush: 'bg-highlight' };

export interface Part { label: string; value: number; tone: PartTone; detail?: string }

/** One bar split into its parts (2px gaps), with a legend that names each part and its share. */
export const SplitBar: React.FC<{ parts: Part[]; format?: (v: number) => string; label: string; empty?: string }> = ({ parts, format = (v) => Math.round(v).toLocaleString('en-IN'), label, empty = 'No data' }) => {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!(total > 0)) return <p className="py-3 text-sm leading-5 text-ink-muted">{empty}</p>;
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full a2-grow" role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${format(p.value)} (${Math.round((p.value / total) * 100)}%)`).join(', ')}`}>
        {parts.filter((p) => p.value > 0).map((p) => <span key={p.label} className={`h-full ${toneClass[p.tone]}`} style={{ width: `${(p.value / total) * 100}%`, minWidth: 4 }} />)}
      </div>
      <ul className="mt-2.5 space-y-1.5">
        {parts.map((p) => (
          <li key={p.label} className="flex items-baseline gap-2 text-[13px] leading-[18px]">
            <span className={`w-2.5 h-2.5 shrink-0 self-center rounded-full ${toneClass[p.tone]}`} aria-hidden="true" />
            <span className="min-w-0 flex-1 text-ink">{p.label}{p.detail ? <span className="text-ink-muted"> · {p.detail}</span> : null}</span>
            <span className="shrink-0 sag-num text-ink">{format(p.value)} <span className="text-ink-muted">· {Math.round((p.value / total) * 100)}%</span></span>
          </li>
        ))}
      </ul>
      <ChartStyle />
    </div>
  );
};

// ---------------------------------------------------------------- ranked bars

export interface BarRow { key: string; label: React.ReactNode; value: number; text: string; sub?: React.ReactNode; onOpen?: () => void; highlight?: boolean }

/** Ranked horizontal bars: a label, its figure and a thin bar on a hairline track. */
export const RankBars: React.FC<{ rows: BarRow[]; empty: string }> = ({ rows, empty }) => {
  const top = Math.max(0, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-5 text-sm leading-5 text-ink-muted">{empty}</p>;
  return (
    <ol className="divide-y divide-line">
      {rows.map((r) => {
        const body = (
          <>
            <span className="flex items-baseline justify-between gap-3 text-sm leading-5">
              <span className="min-w-0 truncate text-ink">{r.label}</span>
              <span className="shrink-0 sag-num font-semibold text-ink">{r.text}</span>
            </span>
            {r.sub && <span className="block text-xs leading-4 text-ink-muted">{r.sub}</span>}
            <span className="mt-1.5 block h-1.5 rounded-full bg-line overflow-hidden" aria-hidden="true">
              <span className={`block h-full rounded-full a2-grow ${r.highlight ? 'bg-accent' : 'bg-brand'}`} style={{ width: `${top > 0 ? Math.max((r.value / top) * 100, r.value > 0 ? 2 : 0) : 0}%` }} />
            </span>
          </>
        );
        return (
          <li key={r.key}>
            {r.onOpen
              ? <button type="button" onClick={r.onOpen} className="w-full py-2.5 text-left hover:bg-sunken transition-colors cursor-pointer">{body}</button>
              : <div className="py-2.5">{body}</div>}
          </li>
        );
      })}
      <ChartStyle />
    </ol>
  );
};

// ---------------------------------------------------------------- weekday × hour heatmap

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const hourWords = (hour: number) => `${hour % 12 || 12} ${hour % 24 < 12 ? 'am' : 'pm'}`;

/**
 * A grid of 7 weekdays by the hours of the day; the darker the cell, the more. `grid[weekday][hour]` holds
 * 24 hours; on phones two hours share a cell. Tap or hover a cell for its figure.
 */
export const Heatmap: React.FC<{ grid: number[][]; unit: (n: number) => string; label: string }> = ({ grid, unit, label }) => {
  const wide = useIsWide();
  const per = wide ? 1 : 2;
  const cells = useMemo(() => grid.map((row) => Array.from({ length: 24 / per }, (_, i) => row.slice(i * per, i * per + per).reduce((s, v) => s + v, 0))), [grid, per]);
  const top = Math.max(0, ...cells.flat());
  const [picked, setPicked] = useState<{ d: number; c: number } | null>(null);
  const span = (c: number) => `${hourWords(c * per)} to ${hourWords(c * per + per)}`;
  const pickedText = picked ? `${WEEKDAY_NAMES[picked.d]}, ${span(picked.c)}: ${unit(cells[picked.d][picked.c])}` : 'Tap a square for its figure.';
  const shade = (v: number) => (v <= 0 || top <= 0 ? undefined : `color-mix(in srgb, var(--color-sale) ${Math.round(18 + (v / top) * 82)}%, var(--color-surface))`);

  return (
    <div>
      <p className="min-h-5 text-sm leading-5 text-ink" aria-live="polite">{pickedText}</p>
      <div className="mt-2 grid gap-[2px]" style={{ gridTemplateColumns: `2.25rem repeat(${24 / per}, minmax(0, 1fr))` }} role="group" aria-label={label}>
        {cells.map((row, d) => (
          <React.Fragment key={d}>
            <span className="text-[11px] leading-4 text-ink-muted self-center">{WEEKDAYS[d]}</span>
            {row.map((v, c) => {
              const on = picked?.d === d && picked?.c === c;
              const words = `${WEEKDAY_NAMES[d]}, ${span(c)}: ${unit(v)}`;
              return (
                <button key={c} type="button" title={words} aria-label={words} aria-pressed={on}
                  onClick={() => setPicked({ d, c })} onMouseEnter={() => setPicked({ d, c })} onFocus={() => setPicked({ d, c })}
                  className={`h-5 sm:h-6 min-w-0 rounded-[3px] cursor-pointer ${v > 0 ? '' : 'bg-sunken'} ${on ? 'ring-2 ring-brand ring-offset-1 ring-offset-surface' : ''}`}
                  style={{ background: shade(v) }} />
              );
            })}
          </React.Fragment>
        ))}
        <span />
        {Array.from({ length: 24 / per }, (_, c) => (
          <span key={c} className="text-[10px] leading-4 text-ink-muted text-center overflow-visible whitespace-nowrap" aria-hidden="true">
            {(c * per) % 6 === 0 ? `${(c * per) % 12 || 12}${c * per < 12 ? 'a' : 'p'}` : ''}
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] leading-4 text-ink-muted" aria-hidden="true">
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((r) => <span key={r} className={`w-4 h-3 rounded-[3px] ${r === 0 ? 'bg-sunken' : ''}`} style={{ background: r === 0 ? undefined : `color-mix(in srgb, var(--color-sale) ${Math.round(18 + r * 82)}%, var(--color-surface))` }} />)}
        <span>More</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- funnel

export interface FunnelStep { label: string; value: number | null; note?: string }

/** A funnel as bars that narrow step by step, with the share that moved on from the step before. */
export const FunnelBars: React.FC<{ steps: FunnelStep[]; ready: boolean }> = ({ steps, ready }) => {
  const peak = steps.reduce((max, s) => Math.max(max, s.value ?? 0), 0);
  return (
    <ol className="space-y-2.5">
      {steps.map((step, i) => {
        const before = i > 0 ? steps[i - 1].value : null;
        const moved = step.value !== null && before !== null && before > 0 && step.value <= before ? (step.value / before) * 100 : null;
        const width = step.value !== null && peak > 0 ? Math.max((step.value / peak) * 100, step.value > 0 ? 1.5 : 0) : 0;
        return (
          <li key={step.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm leading-5 text-ink">{step.label}{step.note ? <span className="text-xs text-ink-muted"> · {step.note}</span> : null}</span>
              <span className="shrink-0 text-right">
                <span className={`sag-num ${step.value === null ? 'text-sm text-ink-muted' : 'text-base font-semibold text-ink'}`}>{!ready ? '…' : step.value === null ? 'No data' : Math.round(step.value).toLocaleString('en-IN')}</span>
                {ready && moved !== null && <span className="ml-2 sag-num text-xs leading-4 text-ink-muted">{moved >= 10 ? Math.round(moved) : moved.toFixed(1)}% moved on</span>}
              </span>
            </div>
            <div className="mt-1 h-3 rounded-full bg-line overflow-hidden" aria-hidden="true">
              <div className={`h-full rounded-full a2-grow ${i === steps.length - 1 ? 'bg-accent' : 'bg-brand'}`} style={{ width: `${ready ? width : 0}%` }} />
            </div>
          </li>
        );
      })}
      <ChartStyle />
    </ol>
  );
};

// ---------------------------------------------------------------- CSV

/** Downloads rows as a CSV file (UTF-8 with a BOM, so Excel shows the rupee sign). */
export const downloadCsv = (fileName: string, rows: Array<Array<string | number>>) => {
  const csv = rows.map((line) => line.map((value) => {
    const v = String(value);
    return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
