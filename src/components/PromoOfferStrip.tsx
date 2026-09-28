import React, { useState } from 'react';
import { Tag, Sparkles, Copy, Check, ShieldCheck, Flame } from 'lucide-react';
import { useShop } from '../context/ShopContext';

export const PromoOfferStrip: React.FC = () => {
  const { showToast } = useShop();
  const [copied, setCopied] = useState(false);

  const handleCopyCode = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText('BLISS10');
      setCopied(true);
      showToast('Coupon code "BLISS10" copied! Paste at checkout for 10% off.', 'success');
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div id="promo-offer-strip" className="bg-gradient-to-r from-[#5C0B1B] via-[#5C0B1B] to-[#5C0B1B] text-[#F7F0E5] py-3 px-4 shadow-sm border-y border-[#D7B77A]/30">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        
        {/* Offer Text */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#D7B77A] text-[#F7F0E5] flex items-center justify-center shrink-0 shadow-xs">
            <Flame className="w-4 h-4 text-[#F7F0E5]" />
          </div>
          <div>
            <p className="text-xs sm:text-sm font-bold tracking-wide">
              Festive Season Offer: <span className="text-[#F7F0E5]">Flat 10% OFF</span> on Prepaid Orders
            </p>
            <p className="text-[10px] sm:text-[11px] text-rose-200/90 font-light">
              Complimentary Priority Express Dispatch Across India
            </p>
          </div>
        </div>

        {/* Copy Coupon Action */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center bg-\[#FAF7F2\]/15 backdrop-blur-xs border border-[#D7B77A]/15 rounded px-3 py-1.5 gap-2">
            <span className="text-[10px] uppercase font-bold text-rose-200">Use Code:</span>
            <span className="font-mono font-black text-xs text-[#F7F0E5] tracking-wider">BLISS10</span>
          </div>

          <button
            type="button"
            onClick={handleCopyCode}
            className="px-3.5 py-1.5 bg-[#D7B77A] hover:bg-[#D7B77A] text-[#F7F0E5] rounded text-xs font-bold tracking-wide transition transform active:scale-95 flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Code</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
