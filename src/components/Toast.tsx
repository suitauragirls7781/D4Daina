import React from 'react';
import { useShop } from '../context/ShopContext';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export const Toast: React.FC = () => {
  const { toast, showToast } = useShop();

  if (!toast) return null;

  return (
    <div 
      id="app-toast"
      className="fixed bottom-20 sm:bottom-8 left-1/2 -translate-x-1/2 z-[10000] w-[90%] sm:w-auto max-w-md bg-[#5C0B1B] text-[#FAF6EF] px-4 py-3 rounded-md shadow-2xl border border-[#D7B77A]/40 flex items-center justify-between gap-3 transition-all duration-300 animate-in slide-in-from-bottom-5 fade-in"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {toast.type === 'success' && (
          <CheckCircle2 className="w-5 h-5 text-[#D7B77A] shrink-0" />
        )}
        {toast.type === 'error' && (
          <AlertCircle className="w-5 h-5 text-rose-300 shrink-0" />
        )}
        {toast.type === 'info' && (
          <Info className="w-5 h-5 text-[#F7F0E5] shrink-0" />
        )}
        <p className="text-xs sm:text-sm font-semibold text-[#FAF6EF] leading-snug">
          {toast.message}
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          // Force clear toast
          const el = document.getElementById('app-toast');
          if (el) el.style.display = 'none';
        }}
        className="text-[#FAF6EF]/70 hover:text-[#F7F0E5] p-1 rounded-full transition-colors cursor-pointer shrink-0"
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

