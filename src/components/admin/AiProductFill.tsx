import React, { useEffect, useState } from 'react';
import { Check, ExternalLink, ImagePlus, KeyRound, RefreshCw, Sparkles, X } from 'lucide-react';
import { getCleanImageUrl } from '../../utils/imageHelper';

/** Text fields Gemini drafts from the photos. Price, MRP, sizes and stock are never part of it. */
export interface AiDraft {
  name: string;
  category: string;
  setType: string;
  subcategory: string;
  description: string;
  fabric: string;
  fit: string;
  occasion: string;
  washCare: string;
  colors: Array<{ name: string; hex: string }>;
  seoTitle: string;
  seoDescription: string;
  searchKeywords: string;
  checkNotes: string;
  /** Kids wear / toys: a listed kind ('' if none fits), or the kind Gemini wrote itself. */
  kind: string;
  customKind: string;
  /** Toys: only when an age is printed on the toy or its box. */
  ageRange: string;
}

interface Props {
  /** Which store section the form is for; decides what Gemini fills in. */
  department?: 'women' | 'kids' | 'toys';
  images: string[];
  uploading: boolean;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  categories?: readonly string[];
  setTypes?: readonly string[];
  kinds?: readonly string[];
  ages?: readonly string[];
  currentName: string;
  hasDetails: boolean;
  onApply: (draft: AiDraft) => void;
}

type AiStatus = { configured: boolean; keyHint: string; model: string; fromServer?: boolean };

/**
 * Admin → Add product: "Fill with Gemini". The owner uploads the photos, Gemini (with the store's own free
 * API key, kept on the server) drafts the listing text, and the owner adds price, MRP, sizes and stock.
 */
export const AiProductFill: React.FC<Props> = ({ department = 'women', images, uploading, onUpload, categories = [], setTypes = [], kinds = [], ages = [], currentName, hasDetails, onApply }) => {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [editingKey, setEditingKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ notes: string; photos: number } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/admin-config?action=ai-assistant', { credentials: 'same-origin' })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => { if (alive) setStatus(ok && data.ai ? data.ai : { configured: false, keyHint: '', model: '' }); })
      .catch(() => { if (alive) setStatus({ configured: false, keyHint: '', model: '' }); });
    return () => { alive = false; };
  }, []);

  const saveKey = async (clear = false) => {
    setSavingKey(true);
    setError('');
    try {
      const response = await fetch('/api/admin-config', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ aiAssistant: clear ? { clear: true } : { geminiKey: keyInput.trim() } }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save the key.');
      setStatus(data.ai);
      setKeyInput('');
      setEditingKey(false);
    } catch (e: any) {
      setError(e?.message || 'Could not save the key.');
    } finally {
      setSavingKey(false);
    }
  };

  const fill = async () => {
    if (!images.length || working) return;
    if (hasDetails && !window.confirm(`Gemini will replace the name, description and other text already filled in. ${ownFields} stay as they are. Continue?`)) return;
    setWorking(true);
    setError('');
    setDone(null);
    try {
      const response = await fetch('/api/admin-config?action=ai-describe', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ department, images, categories, setTypes, kinds, ages, name: currentName }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.draft) {
        if (data.code === 'GEMINI_NOT_SET') setStatus({ configured: false, keyHint: '', model: '' });
        throw new Error(data.error || 'Gemini could not read these photos right now. Please try again.');
      }
      onApply(data.draft as AiDraft);
      setDone({ notes: data.draft.checkNotes || '', photos: data.photosRead || images.length });
    } catch (e: any) {
      setError(e?.message || 'Gemini could not read these photos right now. Please try again.');
    } finally {
      setWorking(false);
    }
  };

  const writes = department === 'kids'
    ? 'the name, type, description, colours, fabric and wash care'
    : department === 'toys'
      ? 'the name, kind of toy, description, colours and material (and the age, if it is printed on the box)'
      : 'the name, description, category, colours, fabric, occasion, care and SEO';
  const ownFields = department === 'kids' ? 'Price, MRP, stock and age sizes' : department === 'toys' ? 'Price, MRP and stock' : 'Price, MRP, sizes and stock';
  const checkHint = department === 'toys' ? ' Please check the suitable age and batteries on the box.' : ' Please check the fabric once.';
  const input = 'sag-input';
  const showKeyForm = status && (!status.configured || editingKey);

  return (
    <section aria-labelledby="ai-fill-title" className="sag-glass sag-glass-strong !border-brand-line p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 shrink-0 rounded-full bg-brand-wash flex items-center justify-center text-brand">
          <Sparkles className="w-[18px] h-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] leading-4 font-medium uppercase tracking-[0.08em] text-brand">Quick start</p>
          <h3 id="ai-fill-title" className="text-[17px] leading-6 font-semibold text-ink">Fill details from photos</h3>
          <p className="mt-0.5 text-sm text-ink-muted">
            Upload the photos and Gemini writes {writes}. You add {ownFields.replace(/^P/, 'p')}.
          </p>
        </div>
      </div>

      {!status && <p className="mt-4 text-sm text-ink-muted inline-flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Checking…</p>}

      {showKeyForm && (
        <div className="mt-4 rounded-[10px] bg-sunken border border-line p-4">
          <p className="text-sm font-semibold text-ink inline-flex items-center gap-2"><KeyRound className="w-4 h-4 text-ink-muted" /> {status?.configured ? 'Change your Gemini API key' : 'One-time setup: your free Gemini API key'}</p>
          <ol className="mt-2 text-[13px] text-ink-muted list-decimal pl-5 space-y-1">
            <li>Open <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-brand font-semibold underline underline-offset-[3px] inline-flex items-center gap-0.5">aistudio.google.com <ExternalLink className="w-3 h-3" /></a> and sign in with your Google account.</li>
            <li>Tap <b>Create API key</b> and copy it.</li>
            <li>Paste it here. It is kept on the server only and is never shown on the website.</li>
          </ol>
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <input type="password" autoComplete="off" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="Paste your API key" aria-label="Gemini API key" className={input} />
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={() => saveKey()} disabled={savingKey || keyInput.trim().length < 20} className="sag-btn-primary h-12 sm:h-[52px] px-5 text-sm gap-2 flex-1 sm:flex-none">
                {savingKey ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {savingKey ? 'Checking…' : 'Save key'}
              </button>
              {status?.configured && (
                <button type="button" onClick={() => { setEditingKey(false); setKeyInput(''); setError(''); }} className="sag-btn-outline h-12 sm:h-[52px] px-4 text-sm">Cancel</button>
              )}
            </div>
          </div>
        </div>
      )}

      {status?.configured && !editingKey && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2.5">
            <label className={`sag-btn-outline h-12 px-4 text-sm gap-2 ${uploading ? 'opacity-60 cursor-wait' : ''}`}>
              {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
              {uploading ? 'Uploading…' : images.length ? 'Add more photos' : 'Upload photos'}
              <input type="file" accept="image/*" multiple onChange={onUpload} className="sr-only" disabled={uploading} />
            </label>
            <button type="button" onClick={fill} disabled={!images.length || working || uploading} className="sag-btn-primary h-12 px-5 text-sm gap-2">
              {working ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {working ? 'Gemini is reading the photos…' : 'Fill with Gemini'}
            </button>
            <span className="min-[420px]:col-span-2 text-[13px] text-ink-muted">{images.length ? `${Math.min(images.length, 6)} photo${images.length === 1 ? '' : 's'} will be read` : 'Upload front, back and close-up photos for the best result'}</span>
          </div>
          {images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto sag-scroll-x pb-1">
              {images.slice(0, 6).map((url) => <img key={url} src={getCleanImageUrl(url, 160)} alt="" className="w-12 aspect-[4/5] shrink-0 rounded-lg object-cover object-top bg-sunken" />)}
            </div>
          )}
          {done && (
            <div className="rounded-[10px] bg-ok-tint border border-ok-line p-3.5 text-sm text-ok">
              <p className="font-semibold inline-flex items-center gap-1.5"><Check className="w-4 h-4" /> Details filled from {done.photos} photo{done.photos === 1 ? '' : 's'}.</p>
              <p className="mt-1 text-ink-muted">Now add <b>{ownFields.replace(/^P/, 'p')}</b>, check the text once and save.{done.notes ? ` Please check: ${done.notes}` : checkHint}</p>
            </div>
          )}
          <p className="text-[13px] text-ink-muted">
            Uses your free Gemini key {status.keyHint}{status.model ? ` · ${status.model}` : ''} ·{' '}
            <button type="button" onClick={() => { setEditingKey(true); setError(''); }} className="sag-link text-[13px]">Change key</button>
            {/* a key kept as a Cloudflare Worker secret cannot be removed from here */}
            {!status.fromServer && <>{' · '}<button type="button" onClick={() => { if (window.confirm('Remove the Gemini key from the store?')) saveKey(true); }} className="sag-link text-[13px]">Remove</button></>}
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-[10px] bg-danger-tint border border-danger-line px-3.5 py-2.5 text-sm text-danger flex items-start gap-2">
          <X className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
        </p>
      )}
    </section>
  );
};
