import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Sparkles, X } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { Product } from '../types';
import { smartSearch, isAvailable } from '../utils/smartQuery';
import { similarProducts } from '../utils/recommend';
import { getCleanImageUrl } from '../utils/imageHelper';
import { VoiceSearchButton } from './VoiceSearchButton';
import { useDiscovery } from '../utils/discovery';
import { trackItem } from '../utils/visitorTracker';

type Message = { from: 'you' | 'aura'; text: string; products?: Product[] };

const SUGGESTIONS = ['Pink suit under ₹999', 'Wedding ke liye heavy suit', 'Daily wear under ₹699', 'XL blue suit', 'Party wear in stock'];
const HIDDEN_ON = new Set(['checkout', 'cart', 'login', 'order-confirmation', 'admin', 'product-detail']);

/**
 * "Ask SuitAura": understands plain requests (English / Hinglish) and answers only with real
 * catalogue products, prices, sizes and stock. It never invents a product.
 */
export const SmartAssistant: React.FC = () => {
  const { products = [], activePage, navigateToProduct, selectedProduct } = useShop();
  const { features } = useDiscovery();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onOpen = (e: Event) => { setOpen(true); const q = (e as CustomEvent).detail; if (typeof q === 'string' && q) ask(q); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('sag-open-assistant', onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('sag-open-assistant', onOpen); };
  });

  const ask = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setInput('');
    trackItem('search', `assistant: ${text}`.slice(0, 60));
    let reply: Message;
    if (/similar|aisa hi|jaisa|like this/i.test(text) && selectedProduct) {
      const list = similarProducts(selectedProduct, products, 6);
      reply = list.length
        ? { from: 'aura', text: `Styles similar to “${selectedProduct.name}”:`, products: list }
        : { from: 'aura', text: 'I could not find a close match in stock right now.' };
    } else {
      const { sq, exact, products: found } = smartSearch(products, text, 6);
      const understood = sq.understood.length ? ` (${sq.understood.join(' · ')})` : '';
      if (found.length === 0) {
        reply = { from: 'aura', text: `No styles match that${understood} right now. Try another colour, size or budget.` };
      } else if (exact) {
        const inStock = found.filter(isAvailable).length;
        reply = { from: 'aura', text: `Found ${found.length} ${found.length === 1 ? 'style' : 'styles'}${understood}${inStock < found.length ? ` — ${inStock} in stock` : ''}:`, products: found };
      } else {
        reply = { from: 'aura', text: `No exact match${understood}. Closest styles available now:`, products: found };
      }
    }
    setMessages((m) => [...m, { from: 'you', text }, reply]);
  };

  if (!features.assistant || (HIDDEN_ON.has(activePage) && !open)) return null;

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Ask SuitAura shopping assistant"
          className="fixed right-3 md:right-5 bottom-[84px] md:bottom-6 z-40 w-12 h-12 md:w-auto md:h-12 md:pl-2 md:pr-5 rounded-full bg-[#4B1D3F] text-white ring-4 ring-white/70 shadow-[0_14px_30px_-12px_rgba(75,29,63,0.65)] inline-flex items-center justify-center gap-2.5 text-sm font-semibold hover:bg-[#3B1532] transition-colors cursor-pointer sag-pop">
          <span className="md:w-8 md:h-8 md:rounded-full md:bg-white/12 flex items-center justify-center"><Sparkles className="w-5 h-5 md:w-4 md:h-4 text-[#E6DDF0]" /></span>
          <span className="hidden md:inline text-white">Ask SuitAura</span>
        </button>
      )}
      {open && <div aria-hidden="true" onClick={() => setOpen(false)} className="md:hidden fixed inset-0 z-[59] bg-[#2A1A26]/35 animate-in fade-in" />}
      {open && (
        <div role="dialog" aria-modal="false" aria-label="SuitAura shopping assistant"
          className="fixed z-[60] inset-x-0 bottom-0 md:inset-auto md:right-6 md:bottom-6 md:w-[400px] h-[80vh] md:h-[620px] md:max-h-[calc(100vh-48px)] bg-[#FBF7F3] md:rounded-3xl rounded-t-3xl border border-[#4B1D3F]/10 shadow-[0_24px_60px_-20px_rgba(42,26,38,0.45)] flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 fade-in">
          <div className="bg-white border-b border-[#4B1D3F]/10 shrink-0">
            <span aria-hidden="true" className="md:hidden block mx-auto mt-2 w-10 h-1 rounded-full bg-[#4B1D3F]/15" />
            <div className="flex items-center justify-between px-5 py-3.5 md:py-4">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-[#4B1D3F] flex items-center justify-center shrink-0"><Sparkles className="w-[18px] h-[18px] text-[#E6DDF0]" /></span>
                <div>
                  <p className="font-serif text-xl text-[#4B1D3F] leading-none">Ask SuitAura</p>
                  <p className="text-[12px] text-[#2A1A26]/60 mt-1">Answers only from our live collection</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close assistant" className="w-10 h-10 rounded-full hover:bg-[#F3EEF8] flex items-center justify-center cursor-pointer"><X className="w-5 h-5 text-[#4B1D3F]" /></button>
            </div>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5" aria-live="polite">
            {messages.length === 0 && (
              <div className="space-y-4">
                <p className="max-w-[88%] rounded-2xl rounded-bl-md bg-white border border-[#4B1D3F]/10 px-4 py-3 text-sm leading-6 text-[#2A1A26]/80">Tell me what you're looking for — colour, occasion, size or budget. Hindi-English mix works too.</p>
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.08em] text-[#9C7A45] mb-2">Try asking</p>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => ask(s)} className="h-9 px-3.5 rounded-full bg-white border border-[#4B1D3F]/12 text-[13px] text-[#4B1D3F] hover:bg-[#F3EEF8] hover:border-[#4B1D3F]/25 transition-colors cursor-pointer">{s}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.from === 'you' ? 'flex justify-end' : ''}>
                <p className={`inline-block max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6 ${m.from === 'you' ? 'bg-[#4B1D3F] text-white rounded-br-md' : 'bg-white border border-[#4B1D3F]/10 text-[#2A1A26] rounded-bl-md'}`}>{m.text}</p>
                {m.products && (
                  <ul className="mt-2 space-y-2">
                    {m.products.map((p) => {
                      const available = isAvailable(p);
                      return (
                        <li key={p.id}>
                          <button onClick={() => { setOpen(false); navigateToProduct(p.id); }} className="group w-full flex items-center gap-3 p-2 pr-3 rounded-2xl bg-white border border-[#4B1D3F]/10 hover:border-[#4B1D3F]/30 text-left transition-colors cursor-pointer">
                            <img src={getCleanImageUrl(p.images?.[0] || p.image || '', 120)} alt="" className="w-14 h-[70px] rounded-xl object-cover object-top shrink-0 bg-[#F3EEF8]" loading="lazy" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm text-[#2A1A26] line-clamp-1">{p.name}</span>
                              <span className="block text-[15px] font-semibold text-[#4B1D3F] mt-0.5">₹{p.price.toLocaleString('en-IN')}</span>
                              <span className={`mt-1 inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium ${available ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>
                                <span className="truncate max-w-[180px]">{available ? `In stock · ${(p.sizes || []).join(', ')}` : 'Sold out'}</span>
                              </span>
                            </span>
                            <span className="text-[13px] font-semibold text-[#4B1D3F] shrink-0 group-hover:underline underline-offset-4">View</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="bg-white p-3 border-t border-[#4B1D3F]/10 flex items-center gap-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shrink-0">
            <div className="relative flex-1">
              <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. Pink suit under ₹999" aria-label="Ask the assistant"
                className="w-full h-12 rounded-full bg-[#FBF7F3] border border-[#4B1D3F]/15 pl-4 pr-11 text-[15px] focus:outline-none focus:border-[#4B1D3F]/50 focus:bg-white transition-colors" maxLength={160} />
              <VoiceSearchButton onResult={ask} className="absolute right-1.5 top-1/2 -translate-y-1/2" />
            </div>
            <button type="submit" aria-label="Send" disabled={!input.trim()} className="w-12 h-12 rounded-full bg-[#4B1D3F] hover:bg-[#3B1532] text-white flex items-center justify-center disabled:opacity-40 transition-colors cursor-pointer"><ArrowUp className="w-5 h-5 text-white" /></button>
          </form>
        </div>
      )}
    </>
  );
};
