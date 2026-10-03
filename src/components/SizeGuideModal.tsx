import React, { useState, useEffect } from 'react';
import { useShop } from '../context/ShopContext';
import { X, Check, Info } from 'lucide-react';
import { SIZE_CHART, inchesToCm, sizeForBust } from '../utils/sizeChart';

// One store chart (src/utils/sizeChart.ts) shared with the Size Guide page and "Find my size"
const SIZE_CHART_INCHES = SIZE_CHART.map((row) => ({ size: row.size, bust: String(row.bust), waist: String(row.waist), hips: String(row.hips), length: String(row.kurtaLength), shoulder: row.shoulder.toFixed(1) }));
const SIZE_CHART_CM = SIZE_CHART.map((row) => ({ size: row.size, bust: String(inchesToCm(row.bust)), waist: String(inchesToCm(row.waist)), hips: String(inchesToCm(row.hips)), length: String(inchesToCm(row.kurtaLength)), shoulder: String(inchesToCm(row.shoulder)) }));

const HOW_TO_MEASURE: Array<[string, string]> = [
  ['Bust / chest', 'Wrap the tape gently under both arms, around the fullest part of your chest.'],
  ['Waist', 'Measure around your natural waistline, the narrowest part of your waist.'],
  ['Hips', 'Stand with your feet together and measure around the widest part of your hips.'],
  ['Length', 'Measure straight down from the highest point of the shoulder.'],
];

export const SizeGuideModal: React.FC = () => {
  const { isSizeGuideOpen, setIsSizeGuideOpen } = useShop();
  const [unit, setUnit] = useState<'inches' | 'cm'>('inches');
  const [selectedRowSize, setSelectedRowSize] = useState<string | null>(null);
  const [bodyBustInput, setBodyBustInput] = useState<string>('');
  const [suggestedSize, setSuggestedSize] = useState<string | null>(null);

  useEffect(() => {
    if (!isSizeGuideOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsSizeGuideOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isSizeGuideOpen]);

  if (!isSizeGuideOpen) return null;

  const chart = unit === 'inches' ? SIZE_CHART_INCHES : SIZE_CHART_CM;

  // Auto-suggest size based on Bust entry
  const handleBustInputChange = (val: string) => {
    setBodyBustInput(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0) {
      setSuggestedSize(sizeForBust(unit === 'cm' ? parsed / 2.54 : parsed));
    } else {
      setSuggestedSize(null);
    }
  };

  // Sync recommendation if unit switches
  const handleUnitSwitch = (newUnit: 'inches' | 'cm') => {
    if (bodyBustInput) {
      const parsed = parseFloat(bodyBustInput);
      if (!isNaN(parsed)) {
        const converted = newUnit === 'cm' ? (parsed * 2.54).toFixed(1) : (parsed / 2.54).toFixed(1);
        setBodyBustInput(converted);
        const bustInInches = newUnit === 'cm' ? parseFloat(converted) / 2.54 : parseFloat(converted);
        setSuggestedSize(sizeForBust(bustInInches));
      }
    }
    setUnit(newUnit);
  };

  const unitBtn = (active: boolean) =>
    `h-11 min-w-[72px] px-4 text-sm rounded-chip border-[1.5px] transition-colors cursor-pointer ${active ? 'bg-ink border-ink text-white font-semibold' : 'bg-surface border-control text-ink font-medium hover:bg-sunken'}`;

  return (
    <div
      id="size-guide-modal-overlay"
      onClick={() => setIsSizeGuideOpen(false)}
      className="fixed inset-0 z-[999] bg-ink/50 flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in"
    >
      <div
        id="size-guide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="size-guide-title"
        onClick={(event) => event.stopPropagation()}
        className="bg-surface rounded-t-sheet sm:rounded-card max-w-3xl w-full max-h-[85dvh] sm:max-h-[90dvh] overflow-y-auto overscroll-contain shadow-[var(--sag-shadow-bar)] sm:shadow-[var(--sag-shadow-pop)] relative animate-in slide-in-from-bottom-5 fade-in"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-surface border-b border-line pl-4 pr-2 sm:pl-6 sm:pr-4 pt-2 sm:pt-3 pb-2">
          <span aria-hidden="true" className="sm:hidden block mx-auto mb-1 w-9 h-1 rounded-full bg-sunken-deep" />
          <div className="flex items-center justify-between gap-3">
            <h3 id="size-guide-title" className="font-display text-base leading-[22px] font-semibold text-ink">Size &amp; fitting guide</h3>
            <button
              id="close-size-guide-btn"
              type="button"
              onClick={() => setIsSizeGuideOpen(false)}
              className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-ink hover:bg-sunken transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-[22px] h-[22px]" />
            </button>
          </div>
        </div>

        <div className="px-4 sm:px-6 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6 space-y-5">
          <p className="text-[15px] leading-[22px] text-ink max-w-2xl">
            These are the finished garment measurements. For a comfortable fit, choose a size about 2 inches larger than your body measurement.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Size finder */}
            <div className="lg:col-span-4 rounded-card border border-brand-line bg-brand-wash p-4">
              <p className="text-base leading-[22px] font-semibold text-ink">Find your size</p>
              <p className="text-sm leading-5 text-ink-muted mt-1">Enter your bust measurement and we will suggest a size from this chart.</p>

              <label htmlFor="size-guide-bust" className="sag-label mt-4">
                Your bust ({unit === 'inches' ? 'inches' : 'cm'})
              </label>
              <div className="relative">
                <input
                  id="size-guide-bust"
                  type="number"
                  inputMode="decimal"
                  value={bodyBustInput}
                  onChange={(e) => handleBustInputChange(e.target.value)}
                  placeholder={unit === 'inches' ? 'e.g. 36' : 'e.g. 91'}
                  className="sag-input pr-14"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ink-muted pointer-events-none">
                  {unit === 'inches' ? 'in' : 'cm'}
                </span>
              </div>

              <div aria-live="polite">
                {suggestedSize ? (
                  <div className="mt-3 rounded-control bg-ok-tint border border-ok-line p-4">
                    <p className="text-[13px] leading-[18px] font-semibold text-ok">Suggested size</p>
                    <p className="text-[28px] leading-8 font-bold text-ink mt-0.5">{suggestedSize}</p>
                    <p className="text-[13px] leading-[18px] text-ink-muted mt-1">Includes the 2" comfort margin. This is an estimate.</p>
                    <button
                      type="button"
                      onClick={() => setSelectedRowSize(suggestedSize)}
                      className="sag-btn-outline mt-3 h-11 px-4 gap-1.5 text-sm"
                    >
                      <Check className="w-4 h-4" aria-hidden="true" /> Show in chart
                    </button>
                  </div>
                ) : bodyBustInput ? (
                  <p className="mt-2 flex items-center gap-1.5 text-[13px] leading-[18px] font-medium text-danger">
                    <Info className="w-4 h-4 shrink-0" aria-hidden="true" /> Please enter a valid measurement.
                  </p>
                ) : null}
              </div>
            </div>

            {/* Chart */}
            <div className="lg:col-span-8 space-y-3 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] leading-[18px] text-ink-muted">Tap a size to highlight it</p>
                <div className="inline-flex gap-2 shrink-0" role="group" aria-label="Units">
                  <button id="unit-inches-btn" type="button" onClick={() => handleUnitSwitch('inches')} aria-pressed={unit === 'inches'} className={unitBtn(unit === 'inches')}>Inches</button>
                  <button id="unit-cm-btn" type="button" onClick={() => handleUnitSwitch('cm')} aria-pressed={unit === 'cm'} className={unitBtn(unit === 'cm')}>CM</button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-control border border-line bg-surface">
                <table className="w-full min-w-[460px] text-left text-sm text-ink">
                  <thead className="bg-sunken text-[13px] leading-[18px] font-semibold text-ink">
                    <tr>
                      <th scope="col" className="py-3 px-3 text-center sticky left-0 bg-sunken border-r border-line">Size</th>
                      <th scope="col" className="py-3 px-3">Bust</th>
                      <th scope="col" className="py-3 px-3">Waist</th>
                      <th scope="col" className="py-3 px-3">Hip</th>
                      <th scope="col" className="py-3 px-3">Length</th>
                      <th scope="col" className="py-3 px-3">Shoulder</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {chart.map((row) => {
                      const isRowHighlighted = selectedRowSize === row.size;
                      const suffix = unit === 'inches' ? '"' : ' cm';
                      return (
                        <tr
                          key={row.size}
                          onClick={() => setSelectedRowSize(isRowHighlighted ? null : row.size)}
                          aria-selected={isRowHighlighted}
                          className={`transition-colors cursor-pointer sag-num whitespace-nowrap ${isRowHighlighted ? 'bg-brand-wash text-ink font-semibold' : 'hover:bg-page text-ink'}`}
                        >
                          <td className={`py-1.5 px-3 text-center sticky left-0 border-r border-line ${isRowHighlighted ? 'bg-brand-wash' : 'bg-surface'}`}>
                            <span className={`inline-flex items-center justify-center min-w-11 h-9 px-2 rounded-chip text-sm font-semibold ${isRowHighlighted ? 'bg-ink text-white' : 'bg-sunken text-ink'}`}>
                              {row.size}
                            </span>
                          </td>
                          <td className="py-1.5 px-3">{row.bust}{suffix}</td>
                          <td className="py-1.5 px-3">{row.waist}{suffix}</td>
                          <td className="py-1.5 px-3">{row.hips}{suffix}</td>
                          <td className="py-1.5 px-3">{row.length}{suffix}</td>
                          <td className="py-1.5 px-3">{row.shoulder}{suffix}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* How to measure + note */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6 border-t border-line pt-5">
            <div>
              <p className="text-base leading-[22px] font-semibold text-ink">How to measure</p>
              <dl className="mt-2 space-y-2">
                {HOW_TO_MEASURE.map(([k, v]) => (
                  <div key={k} className="text-sm leading-5">
                    <dt className="inline font-semibold text-ink">{k}: </dt>
                    <dd className="inline text-ink-muted">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="rounded-control bg-sale-tint border-l-4 border-sale-line p-4 self-start">
              <p className="text-base leading-[22px] font-semibold text-ink">A note on fit</p>
              <p className="text-sm leading-5 text-ink mt-1">
                Fit can vary slightly with fabric and style. Check the size details on each product, and if you are between two sizes, choose the larger one.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
