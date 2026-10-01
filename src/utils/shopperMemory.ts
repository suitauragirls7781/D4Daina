import { useEffect, useState } from 'react';

// Per-device shopping memory (no personal data): recently viewed, compare list, recently compared.
const KEYS = { viewed: 'sag_recently_browsed', compare: 'sag_compare_v1', compared: 'sag_compared_history_v1', searches: 'sag_recent_searches_v1' } as const;
const EVENT = 'sag-memory-change';
export const MAX_COMPARE = 4;

const read = (key: string): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
const write = (key: string, value: string[]) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  window.dispatchEvent(new Event(EVENT));
};

export const rememberViewed = (id: string) => write(KEYS.viewed, [id, ...read(KEYS.viewed).filter((x) => x !== id)].slice(0, 16));
export const rememberSearch = (q: string) => {
  const t = q.trim().toLowerCase();
  if (t.length < 2) return;
  write(KEYS.searches, [t, ...read(KEYS.searches).filter((x) => x !== t)].slice(0, 10));
};

export const toggleCompare = (id: string): { added: boolean; full: boolean } => {
  const list = read(KEYS.compare);
  if (list.includes(id)) { write(KEYS.compare, list.filter((x) => x !== id)); return { added: false, full: false }; }
  if (list.length >= MAX_COMPARE) return { added: false, full: true };
  write(KEYS.compare, [...list, id]);
  return { added: true, full: false };
};
export const clearCompare = () => write(KEYS.compare, []);
export const setCompare = (ids: string[]) => write(KEYS.compare, ids.slice(0, MAX_COMPARE));
/** Saves the current comparison (as a set) so it can be reopened later. */
export const rememberComparison = (ids: string[]) => {
  if (ids.length < 2) return;
  const key = [...ids].sort().join('|');
  write(KEYS.compared, [key, ...read(KEYS.compared).filter((x) => x !== key)].slice(0, 5));
};

export const useShopperMemory = () => {
  const snapshot = () => ({ viewed: read(KEYS.viewed), compare: read(KEYS.compare), compared: read(KEYS.compared).map((k) => k.split('|')), searches: read(KEYS.searches) });
  const [state, setState] = useState(snapshot);
  useEffect(() => {
    const update = () => setState(snapshot());
    window.addEventListener(EVENT, update);
    window.addEventListener('storage', update);
    return () => { window.removeEventListener(EVENT, update); window.removeEventListener('storage', update); };
  }, []);
  return state;
};
