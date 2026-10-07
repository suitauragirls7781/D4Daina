import React, { useState } from 'react';
import { X } from 'lucide-react';
import { SIZE_CHART } from '../utils/sizeChart';

// Garment bust (inches) from the store size chart (see SizeGuideModal). Garments are ~2" larger than the body.
const CHART: Array<[string, number]> = SIZE_CHART.map((row) => [row.size, row.bust]);
const ORDER = CHART.map(([s]) => s);
const EASE: Record<string, number> = { fitted: 1, regular: 2, relaxed: 4 };

/**
 * Estimates a size from the shopper's usual size and/or bust measurement, using the store chart
 * and only the sizes this product is made in. It is an estimate, not a guarantee.
 */
export const FindMySize: React.FC<{ sizes: string[]; onPick: (size: string) => void; onClose: () => void; onOpenChart: () => void }> = ({ sizes, onPick, onClose, onOpenChart }) => {
  const [usual, setUsual] = useState('');
  const [bust, setBust] = useState('');
  const [fit, setFit] = useState<'fitted' | 'regular' | 'relaxed'>('regular');
  const [result, setResult] = useState<{ size: string | null; note: string } | null>(null);
  const offered = sizes.filter((s) => ORDER.includes(s));

  const calculate = (e: React.FormEvent) => {
    e.preventDefault();
    const b = Number(bust);
    let idx = -1;
    if (b >= 26 && b <= 60) {
      const needed = b + EASE[fit];
      idx = CHART.findIndex(([, g]) => g >= needed);
      if (idx < 0) idx = CHART.length; // larger than the chart
    } else if (usual) {
      idx = ORDER.indexOf(usual) + (fit === 'relaxed' ? 1 : 0);
    } else {
      setResult({ size: null, note: 'Enter your usual size or your bust measurement.' });
      return;
    }
    const pick = ORDER.slice(Math.max(0, idx)).find((s) => offered.includes(s));
    if (!pick) {
      setResult({ size: null, note: `This style is made in ${sizes.join(', ')}. None of these is likely to fit — please check the size chart or ask us on WhatsApp.` });
      return;
    }
    const exact = ORDER[idx] === pick;
    setResult({ size: pick, note: exact ? 'Based on the size chart for this style.' : 'The closest larger size this style is made in.' });
  };

  const labelText = 'sag-label';
  return (
    <div className="mt-4 border border-line bg-surface p-4 sag-drop" role="region" aria-label="Find my size">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10.5px] leading-4 font-semibold uppercase tracking-[0.16em] text-sale">Find my size</p>
          <p className="text-[12.5px] leading-[18px] text-ink-muted mt-1.5">Only sizes this style is made in: {offered.join(', ') || sizes.join(', ')}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -mt-3 -mr-3 shrink-0 text-ink hover:text-ink-muted flex items-center justify-center cursor-pointer"><X className="w-5 h-5" strokeWidth={1.5} /></button>
      </div>
      <form onSubmit={calculate} className="mt-3 grid grid-cols-2 gap-3">
        <label className="min-w-0">
          <span className={labelText}>Your usual size</span>
          <select value={usual} onChange={(e) => setUsual(e.target.value)} className="sag-input border border-line focus:border-ink aria-invalid:border-danger">
            <option value="">Not sure</option>
            {ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="min-w-0">
          <span className={labelText}>Bust <span className="text-ink-muted font-normal">(inches)</span></span>
          <input inputMode="decimal" value={bust} onChange={(e) => setBust(e.target.value.replace(/[^\d.]/g, '').slice(0, 4))} placeholder="e.g. 36" className="sag-input border border-line focus:border-ink aria-invalid:border-danger" />
        </label>
        <fieldset className="col-span-2 min-w-0">
          <legend className={labelText}>Preferred fit</legend>
          <div className="grid grid-cols-3 gap-2">
            {(['fitted', 'regular', 'relaxed'] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFit(f)} aria-pressed={fit === f}
                className="h-[38px] sm:h-11 min-w-0 px-2 text-[13px] leading-5 capitalize inline-flex items-center justify-center border border-line bg-surface text-ink cursor-pointer transition-colors hover:border-control aria-pressed:border-ink aria-pressed:font-semibold aria-pressed:shadow-[inset_0_0_0_1px_var(--sag-ink)]">{f}</button>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="col-span-2 sag-btn-outline h-12">Get my size</button>
      </form>
      {result && (
        <div className="mt-4 border-t border-line pt-4 sag-fade" aria-live="polite">
          {result.size && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10.5px] leading-4 font-semibold uppercase tracking-[0.16em] text-sale">Recommended size <strong className="block text-[26px] leading-8 font-medium normal-case tracking-normal text-ink mt-1">{result.size}</strong></p>
              <button type="button" onClick={() => onPick(result.size!)} className="sag-btn-primary h-12 px-6 shrink-0">Select {result.size}</button>
            </div>
          )}
          <p className={`${result.size ? 'mt-3' : ''} text-[12.5px] leading-[18px] text-ink-muted`}>{result.note} This is an estimate — please confirm with the <button type="button" onClick={onOpenChart} className="font-semibold text-ink underline underline-offset-4 decoration-1 cursor-pointer inline-block py-[13px] -my-[13px]">size chart</button>.</p>
        </div>
      )}
    </div>
  );
};
