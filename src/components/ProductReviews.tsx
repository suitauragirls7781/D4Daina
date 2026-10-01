import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { BadgeCheck, Camera, Loader2, Star, ThumbsUp, X } from 'lucide-react';
import { db } from '../lib/firebase';
import { apiPost } from '../lib/api';
import { useAdmin } from '../context/AdminContext';
import { useAuth } from '../context/AuthContext';
import { useShop } from '../context/ShopContext';
import { useDiscovery } from '../utils/discovery';
import { getCleanImageUrl } from '../utils/imageHelper';
import { Product } from '../types';

// Product reviews: rating summary, what customers mention, the approved reviews and the review form.
// Everything shown comes from approved reviews; new reviews go to /api/reviews and wait for approval.

interface ReviewRow {
  id: string;
  userName: string;
  rating: number;
  comment: string;
  time: number;
  dateLabel: string;
  verifiedPurchase: boolean;
  /** Size from the customer's paid order (set by the server for verified reviews only). */
  sizePurchased: string;
  imageUrl: string;
  adminReply: string;
  /** null when the live count is not known (fallback data). */
  helpfulCount: number | null;
}

const PAGE_SIZE = 6;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const VOTED_KEY = 'sag_helpful_reviews';

// "What customers mention": words (English, Hinglish and Hindi) that point to an aspect of the product.
// Only counts are shown ("mentioned in 4 of 6 reviews"), never a verdict the reviews did not give.
const ASPECTS: Array<{ key: string; label: string; words: string[]; phrases?: string[] }> = [
  {
    key: 'fit', label: 'Fit & size', phrases: ['true to size'],
    words: ['fit', 'fits', 'fitted', 'fitting', 'size', 'sizes', 'sizing', 'length', 'loose', 'tight', 'measurement', 'measurements', 'waist', 'bust', 'chest', 'shoulder', 'shoulders', 'sleeve', 'sleeves', 'dheela', 'dheeli', 'dhila', 'dhili', 'lambai', 'फिट', 'फिटिंग', 'साइज़', 'साइज', 'नाप', 'लंबाई', 'ढीला', 'ढीली', 'टाइट'],
  },
  {
    key: 'fabric', label: 'Fabric & quality',
    words: ['fabric', 'fabrics', 'material', 'materials', 'cloth', 'cotton', 'silk', 'rayon', 'georgette', 'chiffon', 'linen', 'crepe', 'velvet', 'quality', 'kapda', 'kapde', 'kapra', 'kapre', 'कपड़ा', 'कपड़े', 'कपडा', 'कपडे', 'फैब्रिक', 'मटेरियल', 'क्वालिटी', 'गुणवत्ता'],
  },
  {
    key: 'colour', label: 'Colour',
    words: ['colour', 'colours', 'color', 'colors', 'coloured', 'colored', 'shade', 'shades', 'rang', 'fade', 'faded', 'fading', 'रंग', 'कलर'],
  },
  {
    key: 'comfort', label: 'Comfort', phrases: ['light weight'],
    words: ['comfort', 'comfortable', 'comfy', 'soft', 'breathable', 'lightweight', 'itchy', 'itching', 'aaram', 'aram', 'aaramdayak', 'आराम', 'आरामदायक', 'मुलायम', 'सॉफ्ट'],
  },
  {
    key: 'stitching', label: 'Stitching & finish',
    words: ['stitching', 'stitched', 'stitch', 'stitches', 'silai', 'finishing', 'finish', 'seam', 'seams', 'embroidery', 'embroidered', 'kadhai', 'threads', 'सिलाई', 'फिनिशिंग', 'कढ़ाई'],
  },
  {
    key: 'value', label: 'Value for money', phrases: ['paisa vasool', 'paisa wasool'],
    words: ['price', 'priced', 'pricing', 'value', 'worth', 'money', 'affordable', 'reasonable', 'budget', 'cheap', 'costly', 'expensive', 'overpriced', 'keemat', 'kimat', 'daam', 'sasta', 'sasti', 'mehenga', 'mehnga', 'कीमत', 'दाम', 'सस्ता', 'महंगा', 'वसूल'],
  },
  {
    key: 'delivery', label: 'Delivery & packaging', phrases: ['on time'],
    words: ['delivery', 'delivered', 'deliver', 'shipping', 'shipped', 'courier', 'packaging', 'packing', 'packed', 'package', 'parcel', 'dispatch', 'dispatched', 'arrived', 'pahuncha', 'pahucha', 'डिलीवरी', 'पैकिंग', 'पार्सल', 'पहुंचा', 'पहुँचा'],
  },
].map((aspect) => ({ ...aspect, words: aspect.words.map((w) => w.normalize('NFC')) }));

const tokensOf = (text: string) => text.toLowerCase().normalize('NFC').split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);

/** Which aspects a review's text mentions. */
const mentionedAspects = (comment: string) => {
  const tokens = tokensOf(comment);
  const set = new Set(tokens);
  const joined = ` ${tokens.join(' ')} `;
  return new Set(ASPECTS
    .filter((a) => a.words.some((w) => set.has(w)) || (a.phrases || []).some((p) => joined.includes(` ${p} `)))
    .map((a) => a.key));
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** ISO dates from the server, or "15 Sep 2026" style dates entered in the admin panel. 0 = unknown. */
const parseReviewDate = (value: unknown) => {
  const text = String(value || '').trim();
  if (!text) return 0;
  const named = text.match(/^(\d{1,2})[\s-]+([A-Za-z]{3})[A-Za-z]*,?[\s-]+(\d{4})$/);
  if (named) {
    const month = MONTHS.indexOf(named[2].toLowerCase());
    return month >= 0 ? new Date(Number(named[3]), month, Number(named[1])).getTime() : 0;
  }
  const time = Date.parse(text);
  return Number.isNaN(time) ? 0 : time;
};

const toRow = (id: string, data: Record<string, any>, liveCounts: boolean): ReviewRow => {
  const time = parseReviewDate(data.date) || parseReviewDate(data.createdAt);
  const verifiedPurchase = data.verifiedPurchase === true;
  return {
    id,
    userName: String(data.userName || '').trim() || 'Customer',
    rating: Math.min(5, Math.max(1, Math.round(Number(data.rating) || 0))),
    comment: String(data.comment || '').trim(),
    time,
    dateLabel: time ? new Date(time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : String(data.date || ''),
    verifiedPurchase,
    sizePurchased: verifiedPurchase && data.source === 'storefront' ? String(data.sizePurchased || '') : '',
    imageUrl: typeof data.imageUrl === 'string' && data.imageUrl.startsWith('https://') ? data.imageUrl : '',
    adminReply: String(data.adminReply || '').trim(),
    helpfulCount: liveCounts ? Math.max(0, Number(data.helpfulCount) || 0) : null,
  };
};

const readVoted = (): string[] => {
  try {
    const list = JSON.parse(localStorage.getItem(VOTED_KEY) || '[]');
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

const Stars: React.FC<{ rating: number; size?: string }> = ({ rating, size = 'w-4 h-4' }) => (
  <span className="flex shrink-0" role="img" aria-label={`Rated ${Number(rating.toFixed(1))} out of 5`}>
    {[1, 2, 3, 4, 5].map((i) => <Star key={i} aria-hidden="true" className={`${size} ${i <= Math.round(rating) ? 'fill-[#C5A46D] text-[#C5A46D]' : 'text-[#C5A46D]/40'}`} />)}
  </span>
);

/** Full-size view of a customer's photo. */
const PhotoViewer: React.FC<{ url: string; name: string; onClose: () => void }> = ({ url, name, onClose }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      // The close button is the only control, so focus stays on it
      if (e.key === 'Tab') { e.preventDefault(); closeRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-[80] bg-[#2A1A26]/95 flex items-center justify-center p-4 sag-fade" role="dialog" aria-modal="true" aria-label={`Photo from ${name}'s review`} onClick={onClose}>
      <button ref={closeRef} type="button" onClick={onClose} aria-label="Close photo" className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer">
        <X className="w-5 h-5" />
      </button>
      <img src={getCleanImageUrl(url, 1400)} alt={`Photo shared by ${name}`} className="max-h-[88vh] max-w-full rounded-2xl object-contain" onClick={(e) => e.stopPropagation()} />
    </div>
  );
};

const WRITE_REVIEW_KEY = 'sag_write_review';

/** Asks the product page to open "Write a review" when it next shows this product (see "Rate product"). */
export const requestReviewFor = (productId: string) => {
  try { sessionStorage.setItem(WRITE_REVIEW_KEY, String(productId)); } catch {}
};

export const ProductReviews: React.FC<{ product: Product }> = ({ product }) => {
  const { reviewsList = [] } = useAdmin();
  const { user } = useAuth();
  const { showToast, setActivePage } = useShop();
  const { features } = useDiscovery();
  const productId = String(product.id);

  // Live approved reviews of this product (with helpful counts); the shared review list is the fallback
  const [live, setLive] = useState<ReviewRow[] | null>(null);
  useEffect(() => {
    setLive(null);
    return onSnapshot(
      query(collection(db, 'reviews'), where('productId', '==', productId), where('status', '==', 'approved')),
      (snap) => setLive(snap.docs.map((d) => toRow(d.id, d.data(), true))),
      () => setLive(null),
    );
  }, [productId]);

  const rows = useMemo(() => {
    const source = live ?? reviewsList
      .filter((r) => String(r.productId) === productId && r.status === 'approved')
      .map((r) => toRow(r.id, r as unknown as Record<string, any>, false));
    return source.filter((r) => r.comment).sort((a, b) => b.time - a.time);
  }, [live, reviewsList, productId]);

  const summary = useMemo(() => {
    const count = rows.length;
    const average = count ? rows.reduce((sum, r) => sum + r.rating, 0) / count : 0;
    const byStar = [5, 4, 3, 2, 1].map((star) => ({ star, count: rows.filter((r) => r.rating === star).length }));
    const mentionsById = new Map(rows.map((r) => [r.id, mentionedAspects(r.comment)]));
    const mentions = count >= 3
      ? ASPECTS
        .map((a) => ({ key: a.key, label: a.label, count: rows.filter((r) => mentionsById.get(r.id)?.has(a.key)).length }))
        .filter((a) => a.count >= 2)
        .sort((a, b) => b.count - a.count)
      : [];
    return { count, average, byStar, mentions, mentionsById };
  }, [rows]);

  const [aspect, setAspect] = useState<string | null>(null);
  const activeAspect = summary.mentions.find((m) => m.key === aspect) || null;
  const listed = activeAspect ? rows.filter((r) => summary.mentionsById.get(r.id)?.has(activeAspect.key)) : rows;
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [photo, setPhoto] = useState<ReviewRow | null>(null);
  // Photos that failed to load (e.g. removed from Cloudinary) are left out instead of showing a broken image
  const [brokenPhotos, setBrokenPhotos] = useState<string[]>([]);

  // Helpful votes: one per review per browser (the server also counts each visitor once)
  const [voted, setVoted] = useState<string[]>(readVoted);
  const [voting, setVoting] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const markHelpful = async (review: ReviewRow) => {
    if (voted.includes(review.id) || voting) return;
    setVoting(review.id);
    try {
      const result = await apiPost<{ counted: boolean; helpfulCount: number }>('/api/reviews', { action: 'helpful', reviewId: review.id });
      const next = [review.id, ...voted.filter((id) => id !== review.id)].slice(0, 300);
      setVoted(next);
      try { localStorage.setItem(VOTED_KEY, JSON.stringify(next)); } catch {}
      setCounts((c) => ({ ...c, [review.id]: Number(result.helpfulCount) || 0 }));
      if (!result.counted) showToast('Your vote on this review was already counted.', 'info');
    } catch (err: any) {
      showToast(err?.message || 'Could not record your vote. Please try again.', 'error');
    } finally {
      setVoting(null);
    }
  };

  // Write a review
  const canAddPhoto = Boolean(user) && features.reviewPhotos;
  const [formOpen, setFormOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [stage, setStage] = useState<'idle' | 'uploading' | 'sending'>('idle');
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ verified: boolean; updated: boolean } | null>(null);
  const uploaded = useRef<{ file: File; url: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const openForm = () => {
    setDone(null);
    setError('');
    if (!name && user?.name) setName(user.name);
    setFormOpen((v) => !v);
  };

  // "Rate product" from Account → Orders: open the form and bring it into view
  useEffect(() => {
    let wanted = '';
    try { wanted = sessionStorage.getItem(WRITE_REVIEW_KEY) || ''; } catch {}
    if (wanted !== productId) return;
    try { sessionStorage.removeItem(WRITE_REVIEW_KEY); } catch {}
    setDone(null);
    setFormOpen(true);
    if (user?.name) setName((current) => current || user.name || '');
    const timer = window.setTimeout(() => document.getElementById('pdp-reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
    return () => window.clearTimeout(timer);
  }, [productId]);

  const pickFile = (picked?: File) => {
    setError('');
    if (!picked) return;
    const typeOk = PHOTO_TYPES.includes(picked.type) || (!picked.type && /\.(jpe?g|png|webp|heic|heif)$/i.test(picked.name));
    if (!typeOk) { setError('Please choose a JPG, PNG or WebP photo.'); return; }
    if (picked.size > MAX_PHOTO_BYTES) { setError('Please choose a photo under 8 MB.'); return; }
    setFile(picked);
  };

  const removeFile = () => {
    setFile(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  // Signed direct upload of this one photo to suitauragirls/reviews; the same photo is not uploaded twice
  // after a failed submit. The server signs the public id, folder and formats, and all of them must be sent.
  const uploadPhoto = async (photoFile: File) => {
    if (uploaded.current?.file === photoFile) return uploaded.current.url;
    const signed = await apiPost<{ cloudName: string; apiKey: string; signature: string; fields: Record<string, string | number> }>('/api/reviews', { action: 'photo-sign' });
    const form = new FormData();
    form.append('file', photoFile);
    form.append('api_key', signed.apiKey);
    Object.entries(signed.fields || {}).forEach(([key, value]) => form.append(key, String(value)));
    form.append('signature', signed.signature);
    let response: Response;
    try {
      response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/image/upload`, { method: 'POST', body: form });
    } catch {
      throw new Error('The photo could not be uploaded. Check your connection, or post your review without a photo.');
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.secure_url) throw new Error('The photo could not be uploaded. Please try another photo, or post your review without one.');
    uploaded.current = { file: photoFile, url: result.secure_url };
    return result.secure_url as string;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!rating) { setError('Please choose a star rating.'); return; }
    if (name.trim().length < 2) { setError('Please enter your name (at least 2 characters).'); return; }
    if (comment.trim().length < 10) { setError('Please write at least 10 characters about the product.'); return; }
    try {
      let photoUrl = '';
      if (file && canAddPhoto) {
        setStage('uploading');
        photoUrl = await uploadPhoto(file);
      }
      setStage('sending');
      const result = await apiPost<{ verifiedPurchase: boolean; updated: boolean }>('/api/reviews', {
        action: 'submit',
        productId,
        rating,
        userName: name.trim(),
        comment: comment.trim(),
        ...(photoUrl ? { photoUrl } : {}),
      });
      setDone({ verified: Boolean(result.verifiedPurchase), updated: Boolean(result.updated) });
      setFormOpen(false);
      setRating(0);
      setComment('');
      removeFile();
      uploaded.current = null;
    } catch (err: any) {
      setError(err?.message || 'Could not submit your review. Please try again.');
    } finally {
      setStage('idle');
    }
  };

  const busy = stage !== 'idle';
  const field = 'w-full rounded-full border border-[#4B1D3F]/15 bg-white px-4 h-11 text-sm text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50';

  return (
    <section id="pdp-reviews" aria-labelledby="pdp-reviews-title" className="mt-16 sm:mt-20 scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <p className="sag-eyebrow">Reviews</p>
          <h2 id="pdp-reviews-title" className="mt-2 font-serif text-3xl text-[#4B1D3F]">Customer reviews</h2>
        </div>
        <button type="button" onClick={openForm} aria-expanded={formOpen} aria-controls="pdp-review-form"
          className="sag-btn-outline h-11 px-6 text-xs font-semibold uppercase tracking-[0.14em] cursor-pointer">
          {formOpen ? 'Close' : 'Write a review'}
        </button>
      </div>

      {done && (
        <div role="status" className="mb-6 max-w-2xl rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 sag-drop">
          <p className="font-semibold">Thanks — your review will appear after approval.</p>
          {done.updated && <p className="mt-1">It replaces your earlier review of this style.</p>}
          {done.verified && <p className="mt-1">It will carry a “Verified purchase” badge — this style is in your paid orders.</p>}
        </div>
      )}

      {formOpen && (
        <form id="pdp-review-form" onSubmit={submit} noValidate className="sag-card p-5 sm:p-6 mb-8 grid gap-4 max-w-2xl sag-drop">
          <fieldset>
            <legend className="text-sm text-[#2A1A26]">Your rating</legend>
            <div className="mt-1.5 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <label key={i} className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer hover:bg-[#F3EEF8] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#4B1D3F]/40">
                  <input type="radio" name="review-rating" value={i} checked={rating === i} onChange={() => setRating(i)} className="sr-only" />
                  <span className="sr-only">{i} {i === 1 ? 'star' : 'stars'}</span>
                  <Star aria-hidden="true" className={`w-7 h-7 ${i <= rating ? 'fill-[#C5A46D] text-[#C5A46D]' : 'text-[#C5A46D]/45'}`} />
                </label>
              ))}
            </div>
          </fieldset>

          <label className="grid gap-1.5 text-sm text-[#2A1A26]">
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" className={field} />
          </label>

          <label className="grid gap-1.5 text-sm text-[#2A1A26]">
            Your review
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} maxLength={1000} aria-describedby="pdp-review-hint"
              placeholder="How were the fit, fabric, colour and finish?"
              className="rounded-2xl border border-[#4B1D3F]/15 bg-white p-4 text-sm text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50" />
            <span id="pdp-review-hint" className="text-xs text-[#2A1A26]/60">{comment.trim().length < 10 ? 'At least 10 characters' : `${comment.length} / 1000`}</span>
          </label>

          {canAddPhoto && (
            <div className="grid gap-2">
              <span className="text-sm text-[#2A1A26]">Add a photo <span className="text-[#2A1A26]/60">(optional, up to 8 MB)</span></span>
              {file ? (
                <div className="flex items-center gap-3">
                  {preview && <img src={preview} alt="Selected photo" className="w-16 aspect-[4/5] rounded-xl object-cover object-top bg-[#F3EEF8]" onError={() => setPreview('')} />}
                  <span className="min-w-0 flex-1 text-sm text-[#2A1A26]/75 break-all">{file.name}</span>
                  <button type="button" onClick={removeFile} disabled={busy} className="h-10 px-4 rounded-full border border-[#4B1D3F]/15 text-sm text-[#2A1A26] hover:bg-[#F3EEF8] cursor-pointer disabled:opacity-50">Remove</button>
                </div>
              ) : (
                <label className="inline-flex w-fit items-center gap-2 h-11 px-5 rounded-full border border-dashed border-[#4B1D3F]/30 text-sm text-[#4B1D3F] hover:bg-[#F3EEF8] cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#4B1D3F]/40">
                  <Camera className="w-4 h-4" aria-hidden="true" /> Choose a photo
                  <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} />
                </label>
              )}
            </div>
          )}
          {!user && features.reviewPhotos && (
            <p className="text-sm text-[#2A1A26]/70">
              Want to add a photo?{' '}
              <button type="button" onClick={() => setActivePage('login')} className="text-[#4B1D3F] font-semibold underline underline-offset-2 cursor-pointer">Sign in</button>{' '}
              first.
            </p>
          )}

          <p className="text-xs text-[#2A1A26]/60">
            {user ? 'Reviews show a “Verified purchase” badge when this style is in your paid orders.' : 'Signed-in customers whose paid order includes this style get a “Verified purchase” badge.'}
            {' '}Every review is checked by our team before it appears.
          </p>

          {error && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

          <div className="flex justify-end">
            <button type="submit" disabled={busy} className="sag-btn-primary h-11 px-6 text-xs font-semibold uppercase tracking-[0.14em] inline-flex items-center gap-2 cursor-pointer disabled:opacity-60">
              {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {stage === 'uploading' ? 'Uploading photo…' : stage === 'sending' ? 'Sending…' : 'Submit review'}
            </button>
          </div>
        </form>
      )}

      {summary.count === 0 ? (
        <p className="text-sm text-[#2A1A26]/70">No reviews yet. Bought this style? Be the first to share how it fits.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-10">
          <aside className="grid gap-4 content-start">
            <div className="sag-card p-5">
              <div className="flex items-end gap-3">
                <p className="font-serif text-5xl leading-none text-[#4B1D3F]">{summary.average.toFixed(1)}</p>
                <div className="pb-1">
                  <Stars rating={summary.average} />
                  <p className="mt-1 text-sm text-[#2A1A26]/70">{summary.count} {summary.count === 1 ? 'review' : 'reviews'}</p>
                </div>
              </div>
              <ul className="mt-4 grid gap-1.5">
                {summary.byStar.map(({ star, count }) => (
                  <li key={star} className="flex items-center gap-2 text-sm text-[#2A1A26]/75">
                    <span className="sr-only">{star} {star === 1 ? 'star' : 'stars'}: {count} {count === 1 ? 'review' : 'reviews'}</span>
                    <span aria-hidden="true" className="w-7 shrink-0 inline-flex items-center gap-0.5 tabular-nums">{star}<Star className="w-3.5 h-3.5 fill-[#C5A46D] text-[#C5A46D]" /></span>
                    <span aria-hidden="true" className="flex-1 h-2 rounded-full bg-[#F3EEF8] overflow-hidden">
                      <span className="block h-full rounded-full bg-[#4B1D3F]" style={{ width: `${(count / summary.count) * 100}%` }} />
                    </span>
                    <span aria-hidden="true" className="w-7 shrink-0 text-right tabular-nums text-[#2A1A26]/60">{count}</span>
                  </li>
                ))}
              </ul>
            </div>

            {summary.mentions.length > 0 && (
              <div className="sag-card p-5">
                <p className="font-serif text-xl text-[#4B1D3F]">What customers mention</p>
                <p className="mt-1 text-xs text-[#2A1A26]/60">Counted from the words used in approved reviews. Tap one to read those reviews.</p>
                <ul className="mt-3 grid gap-2">
                  {summary.mentions.map((m) => (
                    <li key={m.key}>
                      <button type="button" onClick={() => { setAspect(aspect === m.key ? null : m.key); setVisible(PAGE_SIZE); }} aria-pressed={aspect === m.key}
                        className={`w-full min-h-10 rounded-2xl border px-3.5 py-2 text-left text-sm transition-colors cursor-pointer ${aspect === m.key ? 'border-[#4B1D3F] bg-[#4B1D3F] text-white' : 'border-[#4B1D3F]/10 bg-[#F3EEF8] text-[#2A1A26] hover:bg-[#E6DDF0]'}`}>
                        <span className="font-semibold">{m.label}</span>
                        <span className={aspect === m.key ? 'text-white/80' : 'text-[#2A1A26]/70'}> — mentioned in {m.count} of {summary.count} reviews</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>

          <div className="min-w-0">
            {activeAspect && (
              <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#2A1A26]/75" aria-live="polite">
                <span>{listed.length} {listed.length === 1 ? 'review mentions' : 'reviews mention'} {activeAspect.label.toLowerCase()}</span>
                <button type="button" onClick={() => setAspect(null)} className="min-h-10 text-[#4B1D3F] font-semibold underline underline-offset-2 cursor-pointer">Show all reviews</button>
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {listed.slice(0, visible).map((r) => {
                const hasVoted = voted.includes(r.id);
                const helpful = counts[r.id] !== undefined ? Math.max(counts[r.id], r.helpfulCount ?? 0) : r.helpfulCount;
                return (
                  <article key={r.id} className="sag-card p-5 flex flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#2A1A26] break-words">{r.userName}</p>
                        {r.dateLabel && <p className="text-xs text-[#2A1A26]/60">{r.dateLabel}</p>}
                      </div>
                      <Stars rating={r.rating} size="w-3.5 h-3.5" />
                    </div>
                    {r.verifiedPurchase && (
                      <p className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                          <BadgeCheck className="w-3.5 h-3.5" aria-hidden="true" /> Verified purchase
                        </span>
                        {r.sizePurchased && <span className="text-[11px] text-[#2A1A26]/65">Size bought: {r.sizePurchased}</span>}
                      </p>
                    )}
                    <p className="mt-3 text-sm leading-relaxed text-[#2A1A26]/80 whitespace-pre-line break-words">{r.comment}</p>
                    {r.imageUrl && !brokenPhotos.includes(r.imageUrl) && (
                      <button type="button" onClick={() => setPhoto(r)} aria-label={`View the photo from ${r.userName}'s review`}
                        className="mt-3 block w-24 aspect-[4/5] rounded-xl overflow-hidden border border-[#4B1D3F]/10 bg-[#F3EEF8] cursor-zoom-in">
                        <img src={getCleanImageUrl(r.imageUrl, 240)} alt="" loading="lazy" onError={() => setBrokenPhotos((list) => [...list, r.imageUrl])}
                          className="w-full h-full object-cover object-top transition-transform duration-300 hover:scale-105" />
                      </button>
                    )}
                    {r.adminReply && (
                      <p className="mt-3 rounded-xl bg-[#F3EEF8] p-3 text-sm text-[#2A1A26]/75 whitespace-pre-line break-words">
                        <span className="text-[#4B1D3F] font-semibold">Suit Aura Girls:</span> {r.adminReply}
                      </p>
                    )}
                    <div className="mt-auto pt-4">
                      <button type="button" onClick={() => markHelpful(r)} disabled={hasVoted || voting === r.id} aria-pressed={hasVoted}
                        className={`h-10 px-4 rounded-full border text-sm inline-flex items-center gap-2 transition-colors cursor-pointer disabled:cursor-default ${hasVoted ? 'border-[#4B1D3F]/20 bg-[#F3EEF8] text-[#4B1D3F]' : 'border-[#4B1D3F]/15 bg-white text-[#2A1A26] hover:bg-[#F3EEF8]'}`}>
                        {voting === r.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <ThumbsUp className={`w-4 h-4 ${hasVoted ? 'fill-[#4B1D3F]/15' : ''}`} aria-hidden="true" />}
                        Helpful{helpful !== null ? ` (${helpful})` : ''}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            {listed.length > visible && (
              <button type="button" onClick={() => setVisible((v) => v + PAGE_SIZE)} className="sag-btn-outline mt-6 h-11 px-6 text-xs font-semibold uppercase tracking-[0.14em] cursor-pointer">
                Show more reviews ({listed.length - visible})
              </button>
            )}
          </div>
        </div>
      )}

      {photo && <PhotoViewer url={photo.imageUrl} name={photo.userName} onClose={() => setPhoto(null)} />}
    </section>
  );
};
