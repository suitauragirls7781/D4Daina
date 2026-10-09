import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, ChevronRight, MessageCircleQuestion, X } from 'lucide-react';
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
// Info and policy pages are included: there the button sat on body text and crowded the "Track order" button,
// and those pages already end with their own "Still have a question?" help card (Contact is the help page itself).
const HIDDEN_ON = new Set([
  'checkout', 'cart', 'login', 'order-confirmation', 'admin', 'product-detail',
  'about', 'contact', 'size-guide', 'shipping-policy', 'return-policy', 'privacy-policy', 'terms-policy', 'terms-conditions', 'cancellation-policy',
]);
// Everywhere else (home, shop, wishlist, account…) it floats only on wide screens, in the empty margin outside
// the 1280px content column; below that the home page offers the same assistant as a row in the page.

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
      {/* A quiet round white button with the line */}
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Ask SuitAura shopping assistant"
          className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] md:bottom-6 z-40 sag-glass-bar rounded-full! h-12 text-brand items-center justify-center gap-2 text-sm font-semibold hover:text-brand-dark transition-colors cursor-pointer hidden min-[1440px]:inline-flex right-3 w-12">
          <MessageCircleQuestion className="w-[22px] h-[22px]" strokeWidth={1.5} />
        </button>
      )}
      {open && <div aria-hidden="true" onClick={() => setOpen(false)} className="md:hidden fixed inset-0 z-[59] bg-[color:var(--sag-scrim)] sag-fade" />}
      {open && (
        <div role="dialog" aria-modal="false" aria-label="SuitAura shopping assistant"
          className="fixed z-[60] inset-x-0 bottom-0 md:inset-auto md:right-6 md:bottom-6 md:w-[400px] h-[85dvh] md:h-[620px] md:max-h-[calc(100vh-48px)] bg-surface text-ink border-t border-x md:border-b border-line rounded-t-[10px] rounded-b-none md:rounded-[10px] shadow-[var(--sag-shadow-bar)] md:shadow-[var(--sag-shadow-pop)] flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 fade-in">
          <div className="border-b border-line shrink-0">
            <span aria-hidden="true" className="md:hidden block mx-auto mt-2 w-10 h-1 rounded-full bg-control" />
            <div className="flex items-center justify-between pl-4 pr-2 min-h-[64px]">
              <div className="min-w-0">
                <p className="font-display text-[24px] leading-7 text-ink">Ask SuitAura</p>
                <p className="text-[13px] leading-[18px] text-ink-muted">Answers come only from styles in our store</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close assistant" className="w-11 h-11 shrink-0 rounded-full text-ink hover:text-ink-muted flex items-center justify-center cursor-pointer"><X className="w-[22px] h-[22px]" strokeWidth={1.5} /></button>
            </div>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-3" aria-live="polite">
            {messages.length === 0 && (
              <div className="space-y-4">
                <p className="max-w-[88%] rounded-[10px] rounded-bl-[2px] bg-sunken px-3.5 py-2.5 text-sm leading-5 text-ink">Tell me what you're looking for — colour, occasion, size or budget. Hindi-English mix works too.</p>
                <div>
                  <p className="sag-eyebrow mb-2">Try asking</p>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => ask(s)} className="sag-chip h-11 min-w-0 px-3.5 text-sm">{s}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.from === 'you' ? 'flex justify-end' : ''}>
                <p className={`inline-block max-w-[85%] rounded-[10px] px-3.5 py-2.5 text-sm leading-5 ${m.from === 'you' ? 'bg-brand text-[color:var(--sag-on-gold)] rounded-br-[2px]' : 'bg-sunken text-ink rounded-bl-[2px]'}`}>{m.text}</p>
                {m.products && (
                  <ul className="mt-2 space-y-2">
                    {m.products.map((p) => {
                      const available = isAvailable(p);
                      return (
                        <li key={p.id}>
                          <button onClick={() => { setOpen(false); navigateToProduct(p.id); }} aria-label={`View ${p.name}`} className="w-full flex items-center gap-3 p-2 rounded-[10px] bg-surface border border-line hover:border-brand text-left transition-colors cursor-pointer">
                            <img src={getCleanImageUrl(p.images?.[0] || p.image || '', 120)} alt="" className="w-14 h-[70px] rounded-lg object-cover object-top shrink-0 bg-sunken" loading="lazy" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm leading-5 font-medium text-ink line-clamp-1">{p.name}</span>
                              <span className="sag-num block text-[15px] leading-5 font-semibold text-ink mt-0.5">₹{p.price.toLocaleString('en-IN')}</span>
                              <span className={`block mt-0.5 text-[13px] leading-[18px] truncate ${available ? 'text-ink-muted' : 'text-ink-muted font-semibold'}`}>
                                {available ? `In stock · ${(p.sizes || []).join(', ')}` : 'Sold out'}
                              </span>
                            </span>
                            <ChevronRight className="w-5 h-5 shrink-0 text-ink-muted" strokeWidth={1.5} aria-hidden="true" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="px-3 pt-2.5 border-t border-line flex items-center gap-2 pb-[calc(0.625rem+env(safe-area-inset-bottom))] shrink-0">
            <div className="relative flex-1">
              <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. Pink suit under ₹999" aria-label="Ask the assistant" enterKeyHint="send"
                className="sag-input h-12 pr-12" maxLength={160} />
              <VoiceSearchButton onResult={ask} className="absolute right-1.5 top-1/2 -translate-y-1/2" />
            </div>
            <button type="submit" aria-label="Send" disabled={!input.trim()} className="w-12 h-12 shrink-0 rounded-lg bg-brand text-[color:var(--sag-on-gold)] flex items-center justify-center hover:bg-brand-dark disabled:bg-sunken-deep disabled:text-ink-faint transition-colors cursor-pointer disabled:cursor-not-allowed"><ArrowUp className="w-5 h-5" strokeWidth={1.5} /></button>
          </form>
        </div>
      )}
    </>
  );
};
