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
    `sag-chip min-w-[76px] ${active ? 'is-selected' : ''}`;

  return (
    <div
      id="size-guide-modal-overlay"
      data-aura
      onClick={() => setIsSizeGuideOpen(false)}
      className="fixed inset-0 z-[999] bg-[color:var(--sag-scrim)] flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in"
    >
      <div
        id="size-guide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="size-guide-title"
        onClick={(event) => event.stopPropagation()}
        className="rounded-t-[28px] sm:rounded-[28px] bg-surface text-ink max-w-3xl w-full max-h-[85dvh] sm:max-h-[90dvh] overflow-y-auto overscroll-contain relative animate-in slide-in-from-bottom-5 fade-in"
      >
        {/* Header */}
        <div className="sticky top-0 z-20 rounded-t-[28px] bg-surface px-5 sm:px-7 pt-2.5 sm:pt-5 pb-3">
          <span aria-hidden="true" className="sm:hidden mx-auto mb-2.5 block h-1 w-10 rounded-full bg-sunken-deep" />
          <div className="flex items-center justify-between gap-3">
            <h3 id="size-guide-title" className="aura-h2 aura-h-sm">Size &amp; fitting <em>guide</em></h3>
            <button
              id="close-size-guide-btn"
              type="button"
              onClick={() => setIsSizeGuideOpen(false)}
              className="shrink-0 w-[44px] h-[44px] rounded-full bg-sunken flex items-center justify-center text-ink hover:bg-sunken-deep transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" strokeWidth={1.6} />
            </button>
          </div>
        </div>

        <div className="px-5 sm:px-7 pt-1 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-7 space-y-6">
          <p className="aura-sub max-w-2xl">
            These are the finished garment measurements. For a comfortable fit, choose a size about 2 inches larger than your body measurement.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Size finder */}
            <div className="lg:col-span-4 rounded-[22px] bg-sunken p-5">
              <p className="aura-lbl">Find your size</p>
              <p className="text-[13.5px] leading-5 text-ink-muted mt-2">Enter your bust measurement and we will suggest a size from this chart.</p>

              <label htmlFor="size-guide-bust" className="aura-lbl mt-5 mb-2 block">
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
                  className="sag-input aria-invalid:border-danger! pr-14"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-medium text-ink-muted pointer-events-none">
                  {unit === 'inches' ? 'in' : 'cm'}
                </span>
              </div>

              <div aria-live="polite">
                {suggestedSize ? (
                  <div className="mt-5 border-t border-line pt-5">
                    <p className="aura-lbl">Suggested size</p>
                    <p className="sag-settle aura-num text-[44px] leading-none font-extrabold tracking-[-0.035em] text-ink mt-2" key={suggestedSize}>{suggestedSize}</p>
                    <p className="text-[13px] leading-[19px] text-ink-muted mt-2">Includes the 2" comfort margin. This is an estimate.</p>
                    <button
                      type="button"
                      onClick={() => setSelectedRowSize(suggestedSize)}
                      className="aura-btn aura-btn-line aura-btn-sm mt-4 gap-2"
                    >
                      <Check className="w-4 h-4" strokeWidth={1.6} aria-hidden="true" /> Show in chart
                    </button>
                  </div>
                ) : bodyBustInput ? (
                  <p className="mt-2.5 flex items-center gap-1.5 text-[13.5px] leading-[18px] text-danger">
                    <Info className="w-4 h-4 shrink-0" strokeWidth={1.6} aria-hidden="true" /> Please enter a valid measurement.
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

              <div className="rounded-[22px] border border-line bg-surface overflow-x-auto">
                <table className="w-full min-w-[460px] text-left text-[14px] text-ink">
                  <thead className="aura-lbl border-b border-line text-[12px]">
                    <tr>
                      <th scope="col" className="py-3 px-3 text-center sticky left-0 bg-surface border-r border-line">Size</th>
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
                          className={`transition-colors cursor-pointer sag-num whitespace-nowrap ${isRowHighlighted ? 'bg-sunken text-ink font-medium' : 'hover:bg-sunken text-ink'}`}
                        >
                          <td className="py-1.5 px-3 text-center sticky left-0 border-r border-line bg-surface">
                            <span className={`inline-flex items-center justify-center min-w-[44px] h-9 px-2.5 rounded-full text-[13.5px] transition-colors duration-300 ${isRowHighlighted ? 'bg-brand font-bold text-[color:var(--sag-on-gold)]' : 'font-bold text-ink'}`}>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6 border-t border-line pt-6">
            <div>
              <p className="aura-lbl">How to measure</p>
              <dl className="mt-3 space-y-2.5">
                {HOW_TO_MEASURE.map(([k, v]) => (
                  <div key={k} className="text-[13.5px] leading-5">
                    <dt className="inline font-bold text-ink">{k}: </dt>
                    <dd className="inline text-ink-muted">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="self-start rounded-[22px] bg-blush p-5">
              <p className="aura-lbl">A note on fit</p>
              <p className="text-[13.5px] leading-5 text-ink mt-2.5">

                Fit can vary slightly with fabric and style. Check the size details on each product, and if you are between two sizes, choose the larger one.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
