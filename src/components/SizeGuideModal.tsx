import React, { useState, useEffect } from 'react';
import { useShop } from '../context/ShopContext';
import { X, Ruler, Check, Info } from 'lucide-react';
import { HelpIcon } from './StoreIcons';
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
    `h-9 px-4 text-[13px] font-semibold rounded-full transition-colors cursor-pointer ${active ? 'bg-[#4B1D3F] text-white shadow-sm' : 'text-[#2A1A26]/70 hover:text-[#4B1D3F]'}`;

  return (
    <div
      id="size-guide-modal-overlay"
      onClick={() => setIsSizeGuideOpen(false)}
      className="fixed inset-0 z-[999] bg-[#2A1A26]/45 flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in"
    >
      <div
        id="size-guide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="size-guide-title"
        onClick={(event) => event.stopPropagation()}
        className="bg-[#FBF7F3] rounded-t-3xl sm:rounded-3xl max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-[0_24px_60px_-20px_rgba(42,26,38,0.5)] relative border border-[#4B1D3F]/10 animate-in fade-in slide-in-from-bottom-5 sm:zoom-in-95 duration-250"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#FBF7F3] border-b border-[#4B1D3F]/10 px-5 sm:px-8 pt-3 sm:pt-6 pb-4">
          <span aria-hidden="true" className="sm:hidden block mx-auto mb-3 w-10 h-1 rounded-full bg-[#4B1D3F]/15" />
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0">
              <span className="w-11 h-11 rounded-full bg-[#F3EEF8] flex items-center justify-center shrink-0"><Ruler className="w-5 h-5 text-[#4B1D3F]" strokeWidth={1.7} /></span>
              <div className="min-w-0">
                <p className="sag-eyebrow">Measurements chart</p>
                <h3 id="size-guide-title" className="font-serif text-[28px] sm:text-[32px] leading-tight text-[#4B1D3F] mt-0.5">Size &amp; fitting guide</h3>
              </div>
            </div>
            <button
              id="close-size-guide-btn"
              onClick={() => setIsSizeGuideOpen(false)}
              className="shrink-0 w-10 h-10 rounded-full bg-white border border-[#4B1D3F]/10 flex items-center justify-center hover:bg-[#F3EEF8] transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-5 h-5 text-[#4B1D3F]" />
            </button>
          </div>
        </div>

        <div className="px-5 sm:px-8 pt-5 pb-6 sm:pb-8 space-y-5">
          <p className="text-[15px] leading-7 text-[#2A1A26]/75 max-w-2xl">
            These are the finished garment measurements. For a comfortable fit, choose a size about 2 inches larger than your body measurement.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Size finder */}
            <div className="lg:col-span-4 sag-card rounded-3xl p-5">
              <p className="font-serif text-xl text-[#4B1D3F]">Find your size</p>
              <p className="text-sm leading-6 text-[#2A1A26]/70 mt-1">Enter your bust measurement and we will suggest a size from this chart.</p>

              <label htmlFor="size-guide-bust" className="block text-[13px] font-medium text-[#2A1A26]/80 mt-4 mb-1.5">
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
                  className="w-full h-12 bg-[#FBF7F3] border border-[#4B1D3F]/15 rounded-full pl-4 pr-14 text-[15px] font-semibold text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:bg-white transition-colors"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-[#2A1A26]/55">
                  {unit === 'inches' ? 'in' : 'cm'}
                </span>
              </div>

              {suggestedSize ? (
                <div className="mt-4 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-center animate-in fade-in slide-in-from-bottom-2 duration-200" aria-live="polite">
                  <p className="text-[12px] font-semibold text-emerald-800">Suggested size</p>
                  <p className="font-serif text-5xl leading-none text-emerald-800 mt-1">{suggestedSize}</p>
                  <p className="text-[12px] text-[#2A1A26]/65 mt-2">Includes the 2" comfort margin. This is an estimate.</p>
                  <button
                    onClick={() => setSelectedRowSize(suggestedSize)}
                    className="mt-3 inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-full bg-white border border-emerald-200 text-[13px] font-semibold text-emerald-800 hover:bg-emerald-100/60 transition-colors cursor-pointer"
                  >
                    <Check className="w-4 h-4 text-emerald-700" /> Show in chart
                  </button>
                </div>
              ) : bodyBustInput ? (
                <div className="mt-4 rounded-2xl bg-rose-50 border border-rose-200 p-3 text-center text-[13px] font-medium text-rose-700">
                  Please enter a valid measurement.
                </div>
              ) : null}
            </div>

            {/* Chart */}
            <div className="lg:col-span-8 space-y-3 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] text-[#2A1A26]/60">Tap a size to highlight it</p>
                <div className="inline-flex rounded-full border border-[#4B1D3F]/12 p-1 bg-white shrink-0" role="group" aria-label="Units">
                  <button id="unit-inches-btn" onClick={() => handleUnitSwitch('inches')} aria-pressed={unit === 'inches'} className={unitBtn(unit === 'inches')}>Inches</button>
                  <button id="unit-cm-btn" onClick={() => handleUnitSwitch('cm')} aria-pressed={unit === 'cm'} className={unitBtn(unit === 'cm')}>CM</button>
                </div>
              </div>

              <div className="overflow-x-auto sag-scroll-x rounded-2xl border border-[#4B1D3F]/12 bg-white">
                <table className="w-full min-w-[460px] text-left text-sm text-[#2A1A26]">
                  <thead className="bg-[#F3EEF8] text-[12px] font-semibold text-[#4B1D3F]">
                    <tr>
                      <th scope="col" className="py-3 px-3 text-center sticky left-0 bg-[#F3EEF8]">Size</th>
                      <th scope="col" className="py-3 px-3">Bust</th>
                      <th scope="col" className="py-3 px-3">Waist</th>
                      <th scope="col" className="py-3 px-3">Hip</th>
                      <th scope="col" className="py-3 px-3">Length</th>
                      <th scope="col" className="py-3 px-3">Shoulder</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#4B1D3F]/8">
                    {chart.map((row) => {
                      const isRowHighlighted = selectedRowSize === row.size;
                      const suffix = unit === 'inches' ? '"' : ' cm';
                      return (
                        <tr
                          key={row.size}
                          onClick={() => setSelectedRowSize(isRowHighlighted ? null : row.size)}
                          aria-selected={isRowHighlighted}
                          className={`transition-colors cursor-pointer tabular-nums ${isRowHighlighted ? 'bg-[#F3EEF8] text-[#4B1D3F] font-semibold' : 'hover:bg-[#FBF7F3] text-[#2A1A26]/80'}`}
                        >
                          <td className={`py-2.5 px-3 text-center sticky left-0 ${isRowHighlighted ? 'bg-[#F3EEF8]' : 'bg-white'}`}>
                            <span className={`inline-flex items-center justify-center min-w-9 h-9 px-2 rounded-full text-[13px] font-semibold ${isRowHighlighted ? 'bg-[#4B1D3F] text-white' : 'bg-[#FBF7F3] text-[#4B1D3F]'}`}>
                              {row.size}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">{row.bust}{suffix}</td>
                          <td className="py-2.5 px-3">{row.waist}{suffix}</td>
                          <td className="py-2.5 px-3">{row.hips}{suffix}</td>
                          <td className="py-2.5 px-3">{row.length}{suffix}</td>
                          <td className="py-2.5 px-3">{row.shoulder}{suffix}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* How to measure + note */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="sag-card rounded-3xl p-5">
              <div className="flex items-center gap-2.5">
                <HelpIcon className="w-6 h-6" />
                <p className="font-serif text-xl text-[#4B1D3F]">How to measure</p>
              </div>
              <dl className="mt-3 space-y-2.5">
                {HOW_TO_MEASURE.map(([k, v]) => (
                  <div key={k} className="text-sm leading-6">
                    <dt className="inline font-semibold text-[#2A1A26]">{k}: </dt>
                    <dd className="inline text-[#2A1A26]/70">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="rounded-3xl bg-[#F3EEF8] p-5 flex gap-3 items-start">
              <Info className="w-5 h-5 text-[#4B1D3F] shrink-0 mt-0.5" />
              <div>
                <p className="font-serif text-xl text-[#4B1D3F]">A note on fit</p>
                <p className="text-sm leading-6 text-[#2A1A26]/75 mt-1">
                  Fit can vary slightly with fabric and style. Check the size details on each product, and if you are between two sizes, choose the larger one.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
