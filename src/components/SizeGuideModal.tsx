import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useShop } from '../context/ShopContext';
import { X, Ruler, HelpCircle, Sparkles, Check, Info } from 'lucide-react';

export const SizeGuideModal: React.FC = () => {
  const { isSizeGuideOpen, setIsSizeGuideOpen } = useShop();
  const [unit, setUnit] = useState<'inches' | 'cm'>('inches');
  const [selectedRowSize, setSelectedRowSize] = useState<string | null>(null);
  const [bodyBustInput, setBodyBustInput] = useState<string>('');
  const [suggestedSize, setSuggestedSize] = useState<string | null>(null);

  if (!isSizeGuideOpen) return null;

  const sizeChartInches = [
    { size: 'XS', bust: '34', waist: '28', hips: '38', length: '44', shoulder: '13.5' },
    { size: 'S', bust: '36', waist: '30', hips: '40', length: '45', shoulder: '14.0' },
    { size: 'M', bust: '38', waist: '32', hips: '42', length: '45', shoulder: '14.5' },
    { size: 'L', bust: '40', waist: '34', hips: '44', length: '46', shoulder: '15.0' },
    { size: 'XL', bust: '42', waist: '36', hips: '46', length: '46', shoulder: '15.5' },
    { size: 'XXL', bust: '44', waist: '38', hips: '48', length: '47', shoulder: '16.0' },
    { size: '3XL', bust: '46', waist: '40', hips: '50', length: '47', shoulder: '16.5' },
  ];

  const sizeChartCm = [
    { size: 'XS', bust: '86', waist: '71', hips: '96', length: '112', shoulder: '34' },
    { size: 'S', bust: '91', waist: '76', hips: '101', length: '114', shoulder: '35' },
    { size: 'M', bust: '96', waist: '81', hips: '106', length: '114', shoulder: '37' },
    { size: 'L', bust: '101', waist: '86', hips: '111', length: '117', shoulder: '38' },
    { size: 'XL', bust: '106', waist: '91', hips: '117', length: '117', shoulder: '39' },
    { size: 'XXL', bust: '112', waist: '96', hips: '122', length: '119', shoulder: '41' },
    { size: '3XL', bust: '117', waist: '101', hips: '127', length: '119', shoulder: '42' },
  ];

  const chart = unit === 'inches' ? sizeChartInches : sizeChartCm;

  // Auto-suggest size based on Bust entry
  const handleBustInputChange = (val: string) => {
    setBodyBustInput(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0) {
      const bustInInches = unit === 'cm' ? parsed / 2.54 : parsed;
      // Dress Bust should be body bust + 2 inches for comfortable wear
      const targetDressBust = bustInInches + 2;

      if (targetDressBust <= 34.5) {
        setSuggestedSize('XS');
      } else if (targetDressBust <= 36.5) {
        setSuggestedSize('S');
      } else if (targetDressBust <= 38.5) {
        setSuggestedSize('M');
      } else if (targetDressBust <= 40.5) {
        setSuggestedSize('L');
      } else if (targetDressBust <= 42.5) {
        setSuggestedSize('XL');
      } else {
        setSuggestedSize('XXL');
      }
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
        const targetDressBust = bustInInches + 2;
        if (targetDressBust <= 34.5) setSuggestedSize('XS');
        else if (targetDressBust <= 36.5) setSuggestedSize('S');
        else if (targetDressBust <= 38.5) setSuggestedSize('M');
        else if (targetDressBust <= 40.5) setSuggestedSize('L');
        else if (targetDressBust <= 42.5) setSuggestedSize('XL');
        else setSuggestedSize('XXL');
      }
    }
    setUnit(newUnit);
  };

  return (
    <div 
      id="size-guide-modal-overlay" 
      onClick={() => setIsSizeGuideOpen(false)} 
      className="fixed inset-0 z-[999] bg-[#5C0B1B]/60 backdrop-blur-xs flex items-center justify-center p-4 transition-all"
    >
      <div 
        id="size-guide-modal" 
        onClick={(event) => event.stopPropagation()}
        className="bg-[#120205] rounded-md max-w-3xl w-full p-5 sm:p-8 max-h-[92vh] overflow-y-auto shadow-2xl relative border border-[#D7B77A]/15 animate-in fade-in zoom-in-95 duration-250"
      >
        {/* Close Button */}
        <button 
          id="close-size-guide-btn"
          onClick={() => setIsSizeGuideOpen(false)}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 text-[#F7F0E5]/55 hover:text-[#E8D2A4] p-2 rounded-full hover:bg-[#2A0710]/20 transition-colors cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-1.5 text-[#E8D2A4] mb-1">
          <Ruler className="w-5 h-5 text-[#E8D2A4]" />
          <span className="text-[10px] sm:text-xs uppercase tracking-widest font-bold">Measurements Chart</span>
        </div>
        <h3 className="font-serif text-2xl sm:text-3xl font-black text-[#F7F0E5] mb-2 tracking-wide">
          Women's Size & Fitting Guide
        </h3>
        <p className="text-xs sm:text-sm text-[#F7F0E5]/75 mb-6 max-w-2xl">
          Ye measurements seedhe garment ke taiyar dimension ko represent karti hain. Perfect fitting ke liye, aisi size chune jo aapki body measurement se 2 inch badi ho.
        </p>

        {/* Main Content Split: Smart Finder & Table */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mb-6">
          
          {/* Left Column: Smart Size Finder Calculator */}
          <div className="lg:col-span-4 bg-[#180306] border border-[#D7B77A]/15 rounded p-4 sm:p-5">
            <div className="flex items-center gap-1.5 text-[#E8D2A4] mb-3">
              <Sparkles className="w-4 h-4 text-[#E8D2A4] animate-pulse" />
              <h4 className="text-xs uppercase font-bold tracking-wider">Aapki Perfect Size Khoje</h4>
            </div>
            <p className="text-[11px] text-[#F7F0E5]/75 mb-4 leading-relaxed">
              Apna actual chest/bust measurements enter karein, hamara algorithm instantly aapke liye sahi size batayega.
            </p>
            
            <div className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold text-[#F7F0E5]/75 uppercase mb-1">
                  Apna Chest/Bust Size dalo ({unit === 'inches' ? 'Inches' : 'CM'}):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={bodyBustInput}
                    onChange={(e) => handleBustInputChange(e.target.value)}
                    placeholder={unit === 'inches' ? 'e.g. 36' : 'e.g. 91'}
                    className="w-full bg-\[#FAF7F2\] border border-[#D7B77A]/15 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-1 focus:ring-[#D7B77A]/40 focus:border-[#D7B77A]/40 font-bold text-[#F7F0E5]"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-[#F7F0E5]/55 font-bold uppercase">
                    {unit === 'inches' ? 'In' : 'CM'}
                  </span>
                </div>
              </div>

              {suggestedSize ? (
                <div className="bg-\[#FAF7F2\] border border-emerald-100 rounded-lg p-3 text-center animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-0.5">Recommended Size:</p>
                  <p className="text-3xl font-black text-emerald-400 tracking-wide">{suggestedSize}</p>
                  <p className="text-[10px] text-[#F7F0E5]/55 mt-1">
                    (Perfect fit with standard 2" comfort margin)
                  </p>
                  <button
                    onClick={() => {
                      setSelectedRowSize(suggestedSize);
                      // Auto highlights size in size table
                    }}
                    className="mt-2 text-[10px] text-[#E8D2A4] hover:underline font-bold flex items-center justify-center gap-1 w-full"
                  >
                    <Check className="w-3 h-3 text-emerald-400" /> Highlight inside chart
                  </button>
                </div>
              ) : bodyBustInput ? (
                <div className="bg-[#2A0710]/50 border border-[#D7B77A]/15 rounded-lg p-2.5 text-center text-[10px] text-rose-300 font-bold">
                  Invalid measurement! Please input correct numbers.
                </div>
              ) : null}
            </div>
          </div>

          {/* Right Column: Size Chart Table */}
          <div className="lg:col-span-8 space-y-4">
            {/* Unit Toggle Banner */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#F7F0E5]/55 font-medium italic">
                💡 Size row select karke measurement check karein
              </span>
              <div className="inline-flex rounded-lg border border-[#D7B77A]/15 p-0.5 bg-[#2A0710]/50 shrink-0">
                <button
                  id="unit-inches-btn"
                  onClick={() => handleUnitSwitch('inches')}
                  className={`px-3 py-1 text-[10px] sm:text-xs font-bold rounded-md transition-all cursor-pointer ${
                    unit === 'inches'
                      ? 'bg-[#D7B77A] text-[#F7F0E5] shadow-sm'
                      : 'text-[#F7F0E5]/75 hover:text-[#E8D2A4]'
                  }`}
                >
                  Inches (in)
                </button>
                <button
                  id="unit-cm-btn"
                  onClick={() => handleUnitSwitch('cm')}
                  className={`px-3 py-1 text-[10px] sm:text-xs font-bold rounded-md transition-all cursor-pointer ${
                    unit === 'cm'
                      ? 'bg-[#D7B77A] text-[#F7F0E5] shadow-sm'
                      : 'text-[#F7F0E5]/75 hover:text-[#E8D2A4]'
                  }`}
                >
                  CM (cm)
                </button>
              </div>
            </div>

            {/* Table wrapper */}
            <div className="overflow-x-auto border border-[#D7B77A]/15 rounded bg-\[#FAF7F2\] shadow-xs">
              <table className="w-full text-left text-xs sm:text-sm text-[#F7F0E5]">
                <thead className="bg-[#180306] text-[10px] uppercase tracking-wider text-[#E8D2A4] font-black border-b border-[#D7B77A]/15">
                  <tr>
                    <th className="py-3 px-3 sm:px-4 text-center">Size</th>
                    <th className="py-3 px-3 sm:px-4">Bust (Chest)</th>
                    <th className="py-3 px-3 sm:px-4">Waist</th>
                    <th className="py-3 px-3 sm:px-4">Hip</th>
                    <th className="py-3 px-3 sm:px-4">Length</th>
                    <th className="py-3 px-3 sm:px-4">Shoulder</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D7B77A]/15 font-medium">
                  {chart.map((row) => {
                    const isRowHighlighted = selectedRowSize === row.size;
                    const suffix = unit === 'inches' ? '"' : ' cm';
                    
                    return (
                      <tr 
                        key={row.size} 
                        onClick={() => setSelectedRowSize(isRowHighlighted ? null : row.size)}
                        className={`transition-all cursor-pointer duration-150 ${
                          isRowHighlighted 
                            ? 'bg-[#D8C8B8]/40/50 text-[#E8D2A4] font-bold' 
                            : 'hover:bg-[#2A0710]/30 text-[#F7F0E5]/75'
                        }`}
                      >
                        <td className="py-3 px-3 sm:px-4 font-black text-center text-[#E8D2A4]">
                          <span className={`inline-block w-7 h-7 leading-7 rounded-full text-center ${
                            isRowHighlighted ? 'bg-[#D7B77A] text-[#F7F0E5]' : ''
                          }`}>
                            {row.size}
                          </span>
                        </td>
                        <td className="py-3 px-3 sm:px-4">{row.bust}{suffix}</td>
                        <td className="py-3 px-3 sm:px-4">{row.waist}{suffix}</td>
                        <td className="py-3 px-3 sm:px-4">{row.hips}{suffix}</td>
                        <td className="py-3 px-3 sm:px-4">{row.length}{suffix}</td>
                        <td className="py-3 px-3 sm:px-4">{row.shoulder}{suffix}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Bottom Panel: Visual Tips */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          
          {/* Instructions Box */}
          <div className="bg-[#120205] border border-[#D7B77A]/15 rounded p-4 text-[11px] sm:text-xs text-[#F7F0E5]/75">
            <div className="flex items-center gap-1.5 font-bold text-[#E8D2A4] mb-2">
              <HelpCircle className="w-4 h-4 text-[#E8D2A4]" />
              <span>Sahi Measurement Kaise Lein?</span>
            </div>
            <ul className="list-disc pl-4 space-y-1.5 text-[#F7F0E5]/75">
              <li><strong>Bust/Chest:</strong> Apne dono arms ke niche se chest ke fullest part tak tape ko halke se wrap karein.</li>
              <li><strong>Waist:</strong> Apni natural waistline (pait ka sabse patla hissa) par measurement tape se napen.</li>
              <li><strong>Hips:</strong> Dono pairon ko sath khada karke hips ke sabse widest part ko napen.</li>
              <li><strong>Length:</strong> Shoulder ke sabse unche point se lekar niche feet tak vertical length check karein.</li>
            </ul>
          </div>

          {/* Size Warning / Note */}
          <div className="bg-[#2A0710]/20 border border-[#D7B77A]/15 rounded p-4 flex gap-2.5 items-start">
            <Info className="w-4.5 h-4.5 text-[#E8D2A4] shrink-0 mt-0.5" />
            <div>
              <h5 className="font-bold text-[#E8D2A4] text-[11px] sm:text-xs uppercase tracking-wide mb-1">Earthy/Handcrafted Garment Note</h5>
              <p className="text-[10px] sm:text-[11px] text-[#F7F0E5]/75 leading-relaxed">
                Hamare sabhi Heritage and Gota Patti suits premium handloom cotton fabrics se banaye jate hain. Thode thode shrink hone ki natural tendency ko dhyaan me rakhte hue, standard sizes comfortable fit ke liye optimal loose alignment me design kiye gaye hain.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
