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

  const input = 'h-12 w-full rounded-full border border-[#4B1D3F]/15 bg-[#FBF7F3] px-4 text-[15px] text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:bg-white transition-colors';
  const labelText = 'block text-[13px] font-medium text-[#2A1A26]/75 mb-1.5';
  return (
    <div className="mt-3 rounded-3xl border border-[#4B1D3F]/12 bg-white p-4 sm:p-5 shadow-[var(--sag-shadow)] sag-drop" role="region" aria-label="Find my size">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-serif text-[22px] leading-tight text-[#4B1D3F]">Find my size</p>
          <p className="text-[13px] text-[#2A1A26]/60 mt-0.5">Only sizes this style is made in: {offered.join(', ') || sizes.join(', ')}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 shrink-0 rounded-full hover:bg-[#F3EEF8] flex items-center justify-center cursor-pointer"><X className="w-4 h-4 text-[#4B1D3F]" /></button>
      </div>
      <form onSubmit={calculate} className="mt-4 grid grid-cols-2 gap-3">
        <label className="min-w-0">
          <span className={labelText}>Your usual size</span>
          <select value={usual} onChange={(e) => setUsual(e.target.value)} className={input}>
            <option value="">Not sure</option>
            {ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="min-w-0">
          <span className={labelText}>Bust <span className="text-[#2A1A26]/50 font-normal">(inches)</span></span>
          <input inputMode="decimal" value={bust} onChange={(e) => setBust(e.target.value.replace(/[^\d.]/g, '').slice(0, 4))} placeholder="e.g. 36" className={input} />
        </label>
        <fieldset className="col-span-2">
          <legend className={labelText}>Preferred fit</legend>
          <div className="flex gap-1 p-1 rounded-full bg-[#F3EEF8]">
            {(['fitted', 'regular', 'relaxed'] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFit(f)} aria-pressed={fit === f}
                className={`h-10 flex-1 rounded-full text-sm capitalize transition-colors cursor-pointer ${fit === f ? 'bg-white text-[#4B1D3F] font-semibold shadow-sm' : 'text-[#2A1A26]/70 hover:text-[#4B1D3F]'}`}>{f}</button>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="col-span-2 sag-btn-primary h-12 text-sm font-semibold cursor-pointer">Get my size</button>
      </form>
      {result && (
        <div className={`mt-4 rounded-2xl p-4 sag-fade border ${result.size ? 'bg-emerald-50 border-emerald-200' : 'bg-[#F3EEF8] border-[#E6DDF0]'}`} aria-live="polite">
          {result.size && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[#2A1A26]">Recommended size <strong className="block font-serif text-4xl leading-none font-medium text-emerald-800 mt-1">{result.size}</strong></p>
              <button type="button" onClick={() => onPick(result.size!)} className="sag-btn-primary h-11 px-5 text-sm font-semibold shrink-0 cursor-pointer">Select {result.size}</button>
            </div>
          )}
          <p className={`${result.size ? 'mt-3' : ''} text-[13px] leading-5 text-[#2A1A26]/70`}>{result.note} This is an estimate — please confirm with the <button type="button" onClick={onOpenChart} className="font-semibold text-[#4B1D3F] underline underline-offset-2 cursor-pointer">size chart</button>.</p>
        </div>
      )}
    </div>
  );
};
