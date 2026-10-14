import React, { useEffect, useSyncExternalStore } from 'react';
import { AlertCircle, Check, Info, RotateCcw, X } from 'lucide-react';

/**
 * The admin's own notices, with an optional button ("Undo", "Open"). They stack at the bottom left on a computer
 * and above the bottom bar on a phone, and never cover a page's own save bar for long.
 *
 *   adminToast('Coupon copied');
 *   adminToast('Order SAG-1001 marked packed', { tone: 'success', action: { label: 'Open', run: () => … } });
 *   withUndo({ message: 'Hiding "Anarkali" from the store', commit: () => toggleProductStatus(id) });
 *
 * withUndo is the undo pattern of the whole admin: NOTHING is saved until the few seconds have passed, so "Undo"
 * simply means it never happened (no second write, no extra line in an order's timeline the customer can see).
 */

export type AdminToastTone = 'info' | 'success' | 'error';
export interface AdminToastAction { label: string; run: () => void }
export interface AdminToastItem {
  id: number;
  message: string;
  detail?: string;
  tone: AdminToastTone;
  action?: AdminToastAction;
  /** ms before it closes by itself (0 = stays until closed). */
  duration: number;
  /** Shown as a thin bar that empties: the time left to undo. */
  countdown?: boolean;
}

let items: AdminToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => items;

export const dismissAdminToast = (id: number) => {
  if (!items.some((t) => t.id === id)) return;
  items = items.filter((t) => t.id !== id);
  emit();
};

/** Shows a notice; returns its id (for dismissAdminToast). At most four are on screen. */
export const adminToast = (message: string, options: { tone?: AdminToastTone; detail?: string; action?: AdminToastAction; duration?: number; countdown?: boolean } = {}) => {
  const id = ++seq;
  const tone = options.tone || 'info';
  items = [...items, { id, message, detail: options.detail, tone, action: options.action, duration: options.duration ?? (tone === 'error' ? 7000 : 4500), countdown: options.countdown }].slice(-4);
  emit();
  return id;
};

/**
 * Waits `delay` ms with an "Undo" button before running `commit`. Undo cancels it: nothing was saved.
 * The returned promise resolves to true when it was saved, false when undone.
 */
export const withUndo = (opts: { message: string; detail?: string; commit: () => Promise<unknown> | unknown; done?: string; delay?: number; onUndo?: () => void }): Promise<boolean> =>
  new Promise((resolve) => {
    const delay = opts.delay ?? 5000;
    let settled = false;
    const toastId = adminToast(opts.message, {
      detail: opts.detail,
      duration: delay,
      countdown: true,
      action: {
        label: 'Undo',
        run: () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          dismissAdminToast(toastId);
          opts.onUndo?.();
          adminToast('Undone. Nothing was changed.', { duration: 2500 });
          resolve(false);
        },
      },
    });
    const timer = window.setTimeout(async () => {
      if (settled) return;
      settled = true;
      dismissAdminToast(toastId);
      try {
        await opts.commit();
        if (opts.done) adminToast(opts.done, { tone: 'success' });
        resolve(true);
      } catch (err: any) {
        adminToast(err?.message || 'That could not be saved. Please try again.', { tone: 'error' });
        resolve(false);
      }
    }, delay);
  });

const ToastRow: React.FC<{ item: AdminToastItem }> = ({ item }) => {
  useEffect(() => {
    if (!item.duration) return undefined;
    const t = window.setTimeout(() => dismissAdminToast(item.id), item.duration + 120);
    return () => window.clearTimeout(t);
  }, [item.id, item.duration]);
  const Icon = item.tone === 'error' ? AlertCircle : item.tone === 'success' ? Check : item.action?.label === 'Undo' ? RotateCcw : Info;
  return (
    <div className={`adm-toast ${item.tone === 'error' ? 'is-error' : ''}`} role={item.tone === 'error' ? 'alert' : 'status'}>
      <Icon className="w-[18px] h-[18px] shrink-0 adm-toast-ic" strokeWidth={1.75} aria-hidden="true" />
      <div className="min-w-0 flex-1 py-1">
        <p className="text-sm leading-5 font-semibold break-words">{item.message}</p>
        {item.detail && <p className="text-[13px] leading-[18px] opacity-75 truncate">{item.detail}</p>}
      </div>
      {item.action && (
        <button type="button" onClick={() => { item.action!.run(); if (item.action!.label !== 'Undo') dismissAdminToast(item.id); }} className="adm-toast-act">
          {item.action.label}
        </button>
      )}
      <button type="button" onClick={() => dismissAdminToast(item.id)} aria-label="Close this notice" className="adm-toast-x">
        <X className="w-4 h-4" strokeWidth={1.75} />
      </button>
      {item.countdown && item.duration > 0 && <i className="adm-toast-life" style={{ animationDuration: `${item.duration}ms` }} aria-hidden="true" />}
    </div>
  );
};

/** Put once in the admin shell. */
export const AdminToastHost: React.FC = () => {
  const list = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (!list.length) return null;
  return (
    <div className="adm-toasts" aria-live="polite">
      {list.map((item) => <ToastRow key={item.id} item={item} />)}
    </div>
  );
};
