import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { BadgeCheck, Camera, CircleAlert, Loader2, Star, ThumbsUp, X } from 'lucide-react';
import { db } from '../lib/firebase';
import { apiPost } from '../lib/api';
import { useAdmin } from '../context/AdminContext';
import { useAuth } from '../context/AuthContext';
import { useShop } from '../context/ShopContext';
import { useDiscovery } from '../utils/discovery';
import { getCleanImageUrl } from '../utils/imageHelper';
import { Product } from '../types';
import { MediaGrant, uploadImageWithGrant } from '../lib/media';

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

/**
 * The one star row of the product page. It is filled to exactly the number printed beside it (one decimal):
 * 4.5 is four and a half stars, 4.3 is four and three tenths, never rounded up to five.
 */
export const Stars: React.FC<{ rating: number; size?: string }> = ({ rating, size = 'w-4 h-4' }) => {
  const shown = Math.max(0, Math.min(5, Math.round((Number(rating) || 0) * 10) / 10));
  return (
    <span className="flex shrink-0" role="img" aria-label={`Rated ${shown} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, shown - (i - 1)));
        return (
          <span key={i} aria-hidden="true" className={`relative block shrink-0 ${size}`}>
            <Star className={`block ${size} fill-sunken-deep text-sunken-deep`} />
            {fill > 0 && (
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className={`block max-w-none ${size} fill-star text-star`} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
};

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
    <div className="fixed inset-0 z-[80] bg-[color:var(--sag-glass-sheet)] backdrop-blur-xl flex items-center justify-center p-4 sag-fade" role="dialog" aria-modal="true" aria-label={`Photo from ${name}'s review`} onClick={onClose}>
      <button ref={closeRef} type="button" onClick={onClose} aria-label="Close photo" className="absolute top-3 right-3 z-10 w-11 h-11 rounded-full border border-[color:var(--sag-edge)] bg-white/[0.08] text-ink hover:bg-white/[0.14] flex items-center justify-center cursor-pointer transition-colors">
        <X className="w-[22px] h-[22px]" strokeWidth={1.5} />
      </button>
      <img src={getCleanImageUrl(url, 1400)} alt={`Photo shared by ${name}`} className="max-h-[88vh] max-w-full rounded-[22px] object-contain" onClick={(e) => e.stopPropagation()} />
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

  // Approved reviews of this product (with helpful counts), read once when the page opens; the shared
  // review list is the fallback. No live listener: a new review waits for approval anyway, and a helpful
  // vote shows the count the server returns.
  const [live, setLive] = useState<ReviewRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLive(null);
    getDocs(query(collection(db, 'reviews'), where('productId', '==', productId), where('status', '==', 'approved')))
      .then((snap) => { if (!cancelled) setLive(snap.docs.map((d) => toRow(d.id, d.data(), true))); })
      .catch(() => { if (!cancelled) setLive(null); });
    return () => { cancelled = true; };
  }, [productId]);

  const rows = useMemo(() => {
    const source = live ?? reviewsList
      .filter((r) => String(r.productId) === productId && r.status === 'approved')
      .map((r) => toRow(r.id, r as unknown as Record<string, any>, false));
    // Order of the list: reviews with a customer photo first, then verified purchases, then the rest;
    // newest first inside each group. Which reviews are shown does not change.
    const group = (r: ReviewRow) => (r.imageUrl ? 0 : r.verifiedPurchase ? 1 : 2);
    return source.filter((r) => r.comment).sort((a, b) => group(a) - group(b) || b.time - a.time);
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
  // Photos that failed to load (e.g. removed from storage) are left out instead of showing a broken image
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

  // Upload of this one photo to the store's storage (folder "reviews"); the same photo is not uploaded twice
  // after a failed submit. The server issues the permission for exactly one photo under an id it chose.
  const uploadPhoto = async (photoFile: File) => {
    if (uploaded.current?.file === photoFile) return uploaded.current.url;
    const grant = await apiPost<MediaGrant>('/api/reviews', { action: 'photo-sign' });
    let url: string;
    try {
      url = await uploadImageWithGrant(photoFile, grant);
    } catch {
      throw new Error('The photo could not be uploaded. Please try another photo, or post your review without one.');
    }
    uploaded.current = { file: photoFile, url };
    return url;
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
  // Customer photos lead the section (only photos that still load)
  const photoRows = rows.filter((r) => r.imageUrl && !brokenPhotos.includes(r.imageUrl));

  return (
    <section id="pdp-reviews" aria-labelledby="pdp-reviews-title" className="sag-glass mt-3 lg:mt-8 p-4 lg:p-6 scroll-mt-20 lg:scroll-mt-36">
      <div className="flex items-center justify-between gap-4 min-h-11">
        <h2 id="pdp-reviews-title" className="font-display text-[19px] leading-6 font-medium text-ink">Reviews</h2>
        {(summary.count > 0 || formOpen) && (
          <button type="button" onClick={openForm} aria-expanded={formOpen} aria-controls="pdp-review-form" className="sag-link text-[12.5px] underline-offset-4 decoration-1 shrink-0">
            {formOpen ? 'Close' : 'Write a review'}
          </button>
        )}
      </div>

      {done && (
        <div role="status" className="sag-glass rounded-[16px]! shadow-none! mt-2 mb-4 max-w-2xl p-3 text-[13.5px] leading-5 text-ink sag-drop">
          <p className="font-medium">Thanks — your review will appear after approval.</p>
          {done.updated && <p className="mt-1">It replaces your earlier review of this style.</p>}
          {done.verified && <p className="mt-1">It will carry a “Verified purchase” badge — this style is in your paid orders.</p>}
        </div>
      )}

      {formOpen && (
        <form id="pdp-review-form" onSubmit={submit} noValidate className="sag-card p-4 sm:p-5 mt-2 mb-6 grid gap-4 max-w-2xl sag-drop">
          <fieldset>
            <legend className="sag-label">Your rating</legend>
            <div className="flex items-center gap-1 -ml-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <label key={i} className="w-10 h-11 rounded-full flex items-center justify-center cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand">
                  <input type="radio" name="review-rating" value={i} checked={rating === i} onChange={() => setRating(i)} className="sr-only" />
                  <span className="sr-only">{i} {i === 1 ? 'star' : 'stars'}</span>
                  <Star aria-hidden="true" className={`w-6 h-6 ${i <= rating ? 'fill-star text-star' : 'text-control'}`} strokeWidth={1.25} />
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="pdp-review-name" className="sag-label">Your name</label>
            <input id="pdp-review-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" autoCapitalize="words" className="sag-input" />
          </div>

          <div>
            <label htmlFor="pdp-review-text" className="sag-label">Your review</label>
            <textarea id="pdp-review-text" value={comment} onChange={(e) => setComment(e.target.value)} rows={4} maxLength={1000} aria-describedby="pdp-review-hint"
              placeholder="How were the fit, fabric, colour and finish?"
              className="sag-input" />
            <span id="pdp-review-hint" className="mt-1.5 block text-[13px] leading-[18px] text-ink-muted">{comment.trim().length < 10 ? 'At least 10 characters' : `${comment.length} / 1000`}</span>
          </div>

          {canAddPhoto && (
            <div>
              <span className="sag-label">Add a photo <span className="font-normal text-ink-muted">(optional, up to 8 MB)</span></span>
              {file ? (
                <div className="flex items-center gap-3">
                  {preview && <img src={preview} alt="Selected photo" className="w-16 aspect-[4/5] rounded-[14px] object-cover object-top bg-sunken" onError={() => setPreview('')} />}
                  <span className="min-w-0 flex-1 text-sm text-ink-muted break-all">{file.name}</span>
                  <button type="button" onClick={removeFile} disabled={busy} className="sag-link text-[12.5px] underline-offset-4 decoration-1 disabled:opacity-50">Remove</button>
                </div>
              ) : (
                <label className="inline-flex w-fit items-center gap-2 h-11 px-4 rounded-full! border border-dashed border-control bg-white/[0.06] text-[13px] font-medium text-ink hover:border-brand cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand">
                  <Camera className="w-4 h-4 text-sale" strokeWidth={1.5} aria-hidden="true" /> Choose a photo
                  <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} />
                </label>
              )}
            </div>
          )}
          {!user && features.reviewPhotos && (
            <p className="text-sm leading-5 text-ink-muted">
              Want to add a photo?{' '}
              <button type="button" onClick={() => setActivePage('login')} className="sag-link text-[12.5px] underline-offset-4 decoration-1">Sign in</button>{' '}
              first.
            </p>
          )}

          <p className="text-[13px] leading-[18px] text-ink-muted">
            {user ? 'Reviews show a “Verified purchase” badge when this style is in your paid orders.' : 'Signed-in customers whose paid order includes this style get a “Verified purchase” badge.'}
            {' '}Every review is checked by our team before it appears.
          </p>

          {error && (
            <p role="alert" className="flex items-start gap-2 border border-danger-line px-3 py-2.5 text-[13.5px] leading-5 text-danger">
              <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} aria-hidden="true" /> {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="sag-btn-primary h-12 w-full sm:w-auto sm:justify-self-end px-7 gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {stage === 'uploading' ? 'Uploading photo…' : stage === 'sending' ? 'Sending…' : 'Submit review'}
          </button>
        </form>
      )}

      {summary.count === 0 ? (
        <p className="mt-1 text-[13.5px] leading-5 text-ink-muted">
          No reviews yet. Bought this?{' '}
          {formOpen ? 'Write the first review.' : <button type="button" onClick={openForm} aria-controls="pdp-review-form" className="sag-link text-[12.5px] underline-offset-4 decoration-1">Write the first review.</button>}
        </p>
      ) : (
        <div className="mt-2 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-12">
          <aside className="grid gap-5 content-start min-w-0">
            <div className="flex items-center gap-4">
              <div className="shrink-0">
                <p className="sag-num text-[28px] leading-8 font-medium text-ink">{summary.average.toFixed(1)}</p>
                <Stars rating={summary.average} size="w-3 h-3" />
                <p className="sag-num mt-1.5 text-xs leading-[18px] text-ink-muted">{summary.count} {summary.count === 1 ? 'review' : 'reviews'}</p>
              </div>
              <ul className="flex-1 min-w-0 grid gap-1.5">
                {summary.byStar.map(({ star, count }) => (
                  <li key={star} className="sag-num flex items-center gap-2 text-xs leading-4 text-ink-muted">
                    <span className="sr-only">{star} {star === 1 ? 'star' : 'stars'}: {count} {count === 1 ? 'review' : 'reviews'}</span>
                    <span aria-hidden="true" className="w-3 shrink-0 text-right">{star}</span>
                    <span aria-hidden="true" className="flex-1 h-[3px] rounded-full bg-line overflow-hidden">
                      <span className="block h-full rounded-full bg-brand" style={{ width: `${(count / summary.count) * 100}%` }} />
                    </span>
                    <span aria-hidden="true" className="w-5 shrink-0 text-right">{count}</span>
                  </li>
                ))}
              </ul>
            </div>

            {photoRows.length > 0 && (
              <div className="min-w-0">
                <p className="text-[10.5px] leading-4 font-semibold uppercase tracking-[0.16em] text-sale">Customer photos</p>
                <div className="sag-scroll-x scroll-px-4 sm:scroll-px-0 mt-2 -mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto">
                  {photoRows.map((r) => (
                    <button key={r.id} type="button" onClick={() => setPhoto(r)} aria-label={`View the photo from ${r.userName}'s review`}
                      className="shrink-0 w-[72px] aspect-[4/5] overflow-hidden rounded-[14px] bg-sunken cursor-zoom-in">
                      <img src={getCleanImageUrl(r.imageUrl, 240)} alt="" loading="lazy" onError={() => setBrokenPhotos((list) => [...list, r.imageUrl])}
                        className="w-full h-full object-cover object-top" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {summary.mentions.length > 0 && (
              <div className="min-w-0">
                <p className="text-[10.5px] leading-4 font-semibold uppercase tracking-[0.16em] text-sale">What customers mention</p>
                <p className="mt-1.5 text-[12.5px] leading-[18px] text-ink-muted">Counted from the words used in approved reviews. Tap one to read those reviews.</p>
                <ul className="mt-2.5 flex flex-wrap gap-2">
                  {summary.mentions.map((m) => (
                    <li key={m.key}>
                      <button type="button" onClick={() => { setAspect(aspect === m.key ? null : m.key); setVisible(PAGE_SIZE); }} aria-pressed={aspect === m.key}
                        aria-label={`${m.label}: mentioned in ${m.count} of ${summary.count} reviews`}
                        className="sag-chip sag-num h-[38px] sm:h-11 px-3.5 text-[13px] leading-5">
                        {m.label} · {m.count}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>

          <div className="min-w-0">
            {activeAspect && (
              <p className="flex flex-wrap items-center gap-x-3 text-[13px] leading-5 text-ink-muted" aria-live="polite">
                <span>{listed.length} {listed.length === 1 ? 'review mentions' : 'reviews mention'} {activeAspect.label.toLowerCase()}</span>
                <button type="button" onClick={() => setAspect(null)} className="sag-link text-[12.5px] underline-offset-4 decoration-1">Show all reviews</button>
              </p>
            )}
            <div className="grid lg:grid-cols-2 lg:gap-x-10 border-b border-line">
              {listed.slice(0, visible).map((r) => {
                const hasVoted = voted.includes(r.id);
                const helpful = counts[r.id] !== undefined ? Math.max(counts[r.id], r.helpfulCount ?? 0) : r.helpfulCount;
                return (
                  <article key={r.id} className="border-t border-line py-5 flex flex-col min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5">
                        <Stars rating={r.rating} size="w-3 h-3" />
                        <span className="sag-num text-xs leading-[18px] text-ink-muted" aria-hidden="true">{r.rating}.0</span>
                      </span>
                      {r.dateLabel && <p className="text-xs leading-[18px] text-ink-muted">{r.dateLabel}</p>}
                    </div>
                    <p className="mt-2.5 text-sm leading-[22px] text-ink whitespace-pre-line break-words">{r.comment}</p>
                    {r.imageUrl && !brokenPhotos.includes(r.imageUrl) && (
                      <button type="button" onClick={() => setPhoto(r)} aria-label={`View the photo from ${r.userName}'s review`}
                        className="mt-3 block w-20 aspect-[4/5] overflow-hidden rounded-[14px] bg-sunken cursor-zoom-in">
                        <img src={getCleanImageUrl(r.imageUrl, 240)} alt="" loading="lazy" onError={() => setBrokenPhotos((list) => [...list, r.imageUrl])}
                          className="w-full h-full object-cover object-top" />
                      </button>
                    )}
                    <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] leading-[18px] text-ink-muted">
                      <span className="font-medium text-ink break-words">{r.userName}</span>
                      {r.verifiedPurchase && (
                        <span className="inline-flex items-center gap-1 text-ink-muted">
                          <BadgeCheck className="w-3.5 h-3.5 text-sale" strokeWidth={1.5} aria-hidden="true" /> Verified purchase
                        </span>
                      )}
                      {r.verifiedPurchase && r.sizePurchased && <span>Size bought: {r.sizePurchased}</span>}
                    </p>
                    {r.adminReply && (
                      <p className="mt-3 border-l-2 border-brand pl-3 text-[13.5px] leading-5 text-ink-muted whitespace-pre-line break-words">
                        <span className="font-medium text-ink">Suit Aura Girls:</span> {r.adminReply}
                      </p>
                    )}
                    <div className="mt-auto pt-2">
                      <button type="button" onClick={() => markHelpful(r)} disabled={hasVoted || voting === r.id} aria-pressed={hasVoted}
                        className={`sag-num h-11 text-[12.5px] inline-flex items-center gap-2 cursor-pointer disabled:cursor-default ${hasVoted ? 'font-medium text-sale' : 'text-ink-muted hover:text-ink'}`}>
                        {voting === r.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <ThumbsUp className={`w-[15px] h-[15px] ${hasVoted ? 'fill-current' : ''}`} strokeWidth={1.5} aria-hidden="true" />}
                        Helpful{helpful !== null ? ` (${helpful})` : ''}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            {listed.length > visible && (
              <button type="button" onClick={() => setVisible((v) => v + PAGE_SIZE)} className="sag-btn-outline sag-num mt-5 h-12 w-full sm:w-auto px-6">
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
