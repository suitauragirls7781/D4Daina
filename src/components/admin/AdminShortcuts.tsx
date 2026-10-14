import React, { useEffect, useRef } from 'react';
import { Keyboard, X } from 'lucide-react';
import { NAV_SPECS, dialogOpen, isTypingTarget } from './adminNav';

/**
 * Keyboard shortcuts of the admin, and the "?" sheet that lists them. Single keys work only while the owner is not
 * typing in a field and no dialog is open, so a shortcut can never fire by accident in the middle of a form.
 *   G then a letter    go to a page (G O = Orders, G P = Products…)
 *   N then P / C       new product / new coupon
 *   / or Ctrl+K        search and actions
 *   I                  notifications
 *   [                  fold or unfold the sidebar
 *   ?                  this list
 */

export interface ShortcutHandlers {
  goTo: (navId: string) => void;
  newProduct: () => void;
  newCoupon: () => void;
  notifications: () => void;
  toggleSidebar: () => void;
  help: () => void;
}

const CHORD_MS = 1200;

export const useAdminShortcuts = (handlers: ShortcutHandlers) => {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    let lead: 'g' | 'n' | null = null;
    let timer = 0;
    const clear = () => { lead = null; window.clearTimeout(timer); };
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (isTypingTarget(e.target) || dialogOpen()) { clear(); return; }
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const h = ref.current;
      if (lead === 'g') {
        clear();
        const spec = NAV_SPECS.find((n) => n.key === key);
        if (spec) { e.preventDefault(); h.goTo(spec.id); }
        return;
      }
      if (lead === 'n') {
        clear();
        if (key === 'p') { e.preventDefault(); h.newProduct(); }
        else if (key === 'c') { e.preventDefault(); h.newCoupon(); }
        return;
      }
      if (key === 'g' || key === 'n') {
        lead = key;
        window.clearTimeout(timer);
        timer = window.setTimeout(clear, CHORD_MS);
        return;
      }
      if (e.key === '?') { e.preventDefault(); h.help(); return; }
      if (key === 'i') { e.preventDefault(); h.notifications(); return; }
      if (e.key === '[') { e.preventDefault(); h.toggleSidebar(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); window.clearTimeout(timer); };
  }, []);
};

const Keys: React.FC<{ keys: string[] }> = ({ keys }) => (
  <span className="flex items-center gap-1 shrink-0">
    {keys.map((k, i) => (
      <React.Fragment key={`${k}-${i}`}>
        {i > 0 && k !== '+' && keys[i - 1] !== '+' && <span className="text-[11px] text-ink-muted">then</span>}
        {k === '+' ? <span className="text-[11px] text-ink-muted">+</span> : <kbd className="adm-kbd">{k}</kbd>}
      </React.Fragment>
    ))}
  </span>
);

export const ShortcutSheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  const isMac = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
  const general: Array<{ label: string; keys: string[] }> = [
    { label: 'Search everything and run actions', keys: [isMac ? '⌘' : 'Ctrl', '+', 'K'] },
    { label: 'Search (when not typing)', keys: ['/'] },
    { label: 'Notifications', keys: ['I'] },
    { label: 'New product', keys: ['N', 'P'] },
    { label: 'New coupon (opens Coupons)', keys: ['N', 'C'] },
    { label: 'Fold or unfold the sidebar', keys: ['['] },
    { label: 'This list', keys: ['?'] },
  ];
  const inPalette: Array<{ label: string; keys: string[] }> = [
    { label: 'Move through the results', keys: ['↑ ↓'] },
    { label: 'Open the result', keys: ['Enter'] },
    { label: 'More actions for a result', keys: ['→'] },
    { label: 'Back, or close', keys: ['Esc'] },
    { label: 'Only actions', keys: ['>'] },
  ];
  return (
    <div className="fixed inset-0 z-[66] bg-[color:var(--sag-scrim)] flex items-end sm:items-center justify-center sm:p-4 adm-fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="adm-keys-title" id="admin-shortcut-sheet" className="adm-dialog adm-sheet-in sm-pop w-full sm:max-w-3xl max-h-[88dvh] rounded-t-[24px] sm:rounded-[24px] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 pl-5 pr-2 py-3 border-b border-[color:var(--adm-line)] shrink-0">
          <span className="w-9 h-9 rounded-full bg-[color:var(--adm-hover)] flex items-center justify-center text-ink" aria-hidden="true"><Keyboard className="w-[18px] h-[18px]" strokeWidth={1.75} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="adm-keys-title" className="text-[19px] leading-6 font-extrabold tracking-[-0.02em] text-ink">Keyboard shortcuts</h2>
            <p className="text-[13px] leading-[18px] text-ink-muted">On a computer. They never fire while you type in a box.</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close keyboard shortcuts" className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-ink hover:bg-[color:var(--adm-hover)] cursor-pointer"><X className="w-5 h-5" strokeWidth={1.75} /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] grid gap-6 md:grid-cols-2">
          <section aria-labelledby="adm-keys-go">
            <h3 id="adm-keys-go" className="text-[11px] leading-4 font-bold uppercase tracking-[0.13em] text-ink-muted mb-2">Go to a page</h3>
            <ul className="divide-y divide-[color:var(--adm-line)]">
              {NAV_SPECS.filter((n) => n.key).map((n) => (
                <li key={n.id} className="flex items-center justify-between gap-3 py-2 text-sm leading-5 text-ink">
                  <span className="min-w-0 truncate">{n.label}</span>
                  <Keys keys={['G', n.key!.toUpperCase()]} />
                </li>
              ))}
            </ul>
          </section>
          <div className="space-y-6">
            <section aria-labelledby="adm-keys-all">
              <h3 id="adm-keys-all" className="text-[11px] leading-4 font-bold uppercase tracking-[0.13em] text-ink-muted mb-2">Everywhere</h3>
              <ul className="divide-y divide-[color:var(--adm-line)]">
                {general.map((s) => (
                  <li key={s.label} className="flex items-center justify-between gap-3 py-2 text-sm leading-5 text-ink"><span className="min-w-0">{s.label}</span><Keys keys={s.keys} /></li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="adm-keys-pal">
              <h3 id="adm-keys-pal" className="text-[11px] leading-4 font-bold uppercase tracking-[0.13em] text-ink-muted mb-2">In the search</h3>
              <ul className="divide-y divide-[color:var(--adm-line)]">
                {inPalette.map((s) => (
                  <li key={s.label} className="flex items-center justify-between gap-3 py-2 text-sm leading-5 text-ink"><span className="min-w-0">{s.label}</span><Keys keys={s.keys} /></li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
