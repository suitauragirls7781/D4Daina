import React, { useEffect, useState } from 'react';
import { Check, ExternalLink, ImagePlus, KeyRound, RefreshCw, Sparkles, X } from 'lucide-react';

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
  const input = 'w-full h-11 px-4 border border-[#4B1D3F]/15 rounded-full text-base sm:text-sm bg-white focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 text-[#2A1A26]';
  const showKeyForm = status && (!status.configured || editingKey);

  return (
    <section aria-labelledby="ai-fill-title" className="rounded-3xl border border-[#4B1D3F]/12 bg-[#F3EEF8] p-5 sm:p-7">
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 shrink-0 rounded-2xl bg-white border border-[#4B1D3F]/10 flex items-center justify-center text-[#4B1D3F]">
          <Sparkles className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="ai-fill-title" className="font-serif text-xl font-semibold text-[#2A1A26]">Fill details from photos</h3>
          <p className="mt-0.5 text-sm text-[#2A1A26]/70">
            Upload the photos and Gemini writes {writes}. You add {ownFields.replace(/^P/, 'p')}.
          </p>
        </div>
      </div>

      {!status && <p className="mt-4 text-sm text-[#2A1A26]/60 inline-flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Checking…</p>}

      {showKeyForm && (
        <div className="mt-4 rounded-2xl bg-white border border-[#4B1D3F]/10 p-4">
          <p className="text-sm font-semibold text-[#2A1A26] inline-flex items-center gap-2"><KeyRound className="w-4 h-4 text-[#9C7A45]" /> {status?.configured ? 'Change your Gemini API key' : 'One-time setup: your free Gemini API key'}</p>
          <ol className="mt-2 text-[13px] text-[#2A1A26]/70 list-decimal pl-5 space-y-0.5">
            <li>Open <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-[#4B1D3F] font-semibold underline underline-offset-2 inline-flex items-center gap-0.5">aistudio.google.com <ExternalLink className="w-3 h-3" /></a> and sign in with your Google account.</li>
            <li>Tap <b>Create API key</b> and copy it.</li>
            <li>Paste it here. It is kept on the server only and is never shown on the website.</li>
          </ol>
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <input type="password" autoComplete="off" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="Paste your API key" aria-label="Gemini API key" className={input} />
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={() => saveKey()} disabled={savingKey || keyInput.trim().length < 20} className="h-11 px-5 rounded-full bg-[#4B1D3F] hover:bg-[#3B1532] text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                {savingKey ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {savingKey ? 'Checking…' : 'Save key'}
              </button>
              {status?.configured && (
                <button type="button" onClick={() => { setEditingKey(false); setKeyInput(''); setError(''); }} className="h-11 px-4 rounded-full border border-[#4B1D3F]/20 bg-white text-sm font-semibold text-[#4B1D3F] cursor-pointer">Cancel</button>
              )}
            </div>
          </div>
        </div>
      )}

      {status?.configured && !editingKey && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="h-11 px-5 rounded-full border border-[#4B1D3F]/20 bg-white hover:bg-[#FBF7F3] text-sm font-semibold text-[#4B1D3F] inline-flex items-center gap-2 cursor-pointer">
              {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
              {uploading ? 'Uploading…' : images.length ? 'Add more photos' : 'Upload photos'}
              <input type="file" accept="image/*" multiple onChange={onUpload} className="sr-only" disabled={uploading} />
            </label>
            <button type="button" onClick={fill} disabled={!images.length || working || uploading} className="h-11 px-6 rounded-full bg-[#4B1D3F] hover:bg-[#3B1532] text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
              {working ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {working ? 'Gemini is reading the photos…' : 'Fill with Gemini'}
            </button>
            <span className="text-[12px] text-[#2A1A26]/60">{images.length ? `${Math.min(images.length, 6)} photo${images.length === 1 ? '' : 's'} will be read` : 'Upload front, back and close-up photos for the best result'}</span>
          </div>
          {images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto sag-scroll-x pb-1">
              {images.slice(0, 6).map((url) => <img key={url} src={url} alt="" className="w-12 h-15 shrink-0 rounded-lg object-cover object-top border border-[#4B1D3F]/10 bg-white" />)}
            </div>
          )}
          {done && (
            <div className="rounded-2xl bg-white border border-emerald-200 p-3.5 text-sm text-emerald-800">
              <p className="font-semibold inline-flex items-center gap-1.5"><Check className="w-4 h-4" /> Details filled from {done.photos} photo{done.photos === 1 ? '' : 's'}.</p>
              <p className="mt-1 text-[#2A1A26]/75">Now add <b>{ownFields.replace(/^P/, 'p')}</b>, check the text once and save.{done.notes ? ` Please check: ${done.notes}` : checkHint}</p>
            </div>
          )}
          <p className="text-[12px] text-[#2A1A26]/55">
            Uses your free Gemini key {status.keyHint}{status.model ? ` · ${status.model}` : ''} ·{' '}
            <button type="button" onClick={() => { setEditingKey(true); setError(''); }} className="underline underline-offset-2 hover:text-[#4B1D3F] cursor-pointer">Change key</button>
            {/* a key kept in the server settings (Vercel) cannot be removed from here */}
            {!status.fromServer && <>{' · '}<button type="button" onClick={() => { if (window.confirm('Remove the Gemini key from the store?')) saveKey(true); }} className="underline underline-offset-2 hover:text-[#4B1D3F] cursor-pointer">Remove</button></>}
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-2xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-sm text-rose-700 flex items-start gap-2">
          <X className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
        </p>
      )}
    </section>
  );
};
