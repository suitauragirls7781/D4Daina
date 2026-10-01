import React, { useEffect, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

/** Top-centred notice so it never covers checkout buttons or the bottom navigation. */
export const Toast: React.FC = () => {
  const { toast } = useShop();
  const [hidden, setHidden] = useState(false);

  useEffect(() => { setHidden(false); }, [toast?.message]);

  if (!toast || hidden) return null;

  const tone = toast.type === 'error'
    ? { Icon: AlertCircle, circle: 'bg-rose-50 border-rose-200', icon: 'text-rose-700', bar: 'bg-rose-700' }
    : toast.type === 'info'
      ? { Icon: Info, circle: 'bg-[#F3EEF8] border-[#E6DDF0]', icon: 'text-[#4B1D3F]', bar: 'bg-[#4B1D3F]' }
      : { Icon: CheckCircle2, circle: 'bg-emerald-50 border-emerald-200', icon: 'text-emerald-700', bar: 'bg-emerald-700' };
  const { Icon } = tone;

  return (
    <div
      id="app-toast"
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      className="fixed top-3 sm:top-5 left-1/2 -translate-x-1/2 z-[10000] w-[calc(100%-24px)] sm:w-auto sm:min-w-[340px] max-w-md rounded-2xl bg-white border border-[#4B1D3F]/10 pl-3 pr-2 py-2.5 shadow-[0_18px_40px_-18px_rgba(42,26,38,0.45)] flex items-center gap-3 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300"
    >
      <span aria-hidden="true" className={`absolute left-0 inset-y-0 w-1 ${tone.bar}`} />
      <span className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 ${tone.circle}`}>
        <Icon className={`w-5 h-5 ${tone.icon}`} />
      </span>
      <p className="flex-1 text-sm leading-snug text-[#2A1A26] py-1">{toast.message}</p>
      <button type="button" onClick={() => setHidden(true)} aria-label="Dismiss" className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#F3EEF8] cursor-pointer">
        <X className="w-4 h-4 text-[#2A1A26]/55" />
      </button>
    </div>
  );
};
