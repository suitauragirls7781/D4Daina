import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { BadgeCheck, Check, Edit2, EyeOff, MessageSquare, Plus, Reply, Save, Star, ThumbsUp, Trash2, X } from 'lucide-react';
import { adminDb } from '../../lib/firebase';
import { apiPost } from '../../lib/api';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { useProducts } from '../../context/ProductContext';
import { getCleanImageUrl } from '../../utils/imageHelper';
import { Review } from '../../types';

/** Fields the review API stores that the shared review list does not carry. */
interface ReviewExtras {
  helpfulCount: number;
  /** 'storefront' = written by /api/reviews (verified purchase decided by the server). */
  source: string;
  createdAt: string;
}

type Status = 'approved' | 'pending' | 'hidden';
type Filter = 'all' | Status;
type FormData = Omit<Review, 'id'>;

// The shared review list fills this in when a review has no location, so it is not shown as one
const PLACEHOLDER_LOCATION = 'Artisan, India';
const STATUS_LABEL: Record<Status, string> = { pending: 'Pending', approved: 'Approved', hidden: 'Hidden' };
const STATUS_STYLE: Record<Status, string> = {
  pending: 'bg-[#FBF7F3] text-[#2A1A26]/85 border-[#C5A46D]/60',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  hidden: 'bg-[#F3EEF8] text-[#4B1D3F]/75 border-[#4B1D3F]/10',
};

const card = 'bg-white rounded-3xl border border-[#4B1D3F]/10 p-5 sm:p-6';
const input = 'w-full h-11 px-4 rounded-full border border-[#4B1D3F]/15 bg-white text-sm font-normal text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition';
const pill = 'h-10 px-4 rounded-full text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50';

const todayLabel = () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const emptyForm = (): FormData => ({
  userName: '', rating: 5, comment: '', productId: '', productName: '', location: '', date: todayLabel(),
  status: 'approved', verifiedPurchase: false, imageUrl: '', adminReply: '',
});

/** ISO dates (storefront reviews) are shown in local time; dates typed in the admin panel as entered. */
const showDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value || '')) return value || '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const sortTime = (review: Review, extra?: ReviewExtras) => Date.parse(extra?.createdAt || '') || Date.parse(review.date || '') || 0;

export const AdminReviews: React.FC = () => {
  const { reviewsList = [], updateReviewStatus, updateReview, replyToReview, deleteReview, addReview } = useAdmin();
  const { allProducts = [] } = useProducts();
  const { showToast } = useShop();

  // Helpful votes and source come straight from the reviews collection
  const [extras, setExtras] = useState<Record<string, ReviewExtras> | null>(null);
  useEffect(() => onSnapshot(collection(adminDb, 'reviews'), (snap) => {
    const next: Record<string, ReviewExtras> = {};
    snap.docs.forEach((d) => {
      const x = d.data();
      next[d.id] = { helpfulCount: Math.max(0, Number(x.helpfulCount) || 0), source: String(x.source || ''), createdAt: String(x.createdAt || '') };
    });
    setExtras(next);
  }, () => setExtras(null)), []);

  const [filter, setFilter] = useState<Filter>('all');
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ id: string | null } | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  const statusOf = (r: Review): Status => r.status || 'approved';
  const counts = useMemo(() => {
    const c = { all: reviewsList.length, pending: 0, approved: 0, hidden: 0 };
    reviewsList.forEach((r) => { c[statusOf(r)] += 1; });
    return c;
  }, [reviewsList]);

  const shown = useMemo(() => reviewsList
    .filter((r) => filter === 'all' || statusOf(r) === filter)
    .sort((a, b) => sortTime(b, extras?.[b.id]) - sortTime(a, extras?.[a.id])), [reviewsList, filter, extras]);

  const products = useMemo(() => [...allProducts].sort((a, b) => String(a.name).localeCompare(String(b.name))), [allProducts]);
  const editing = editor?.id ? reviewsList.find((r) => r.id === editor.id) : undefined;
  const editingFromStore = Boolean(editing && extras?.[editing.id]?.source === 'storefront');

  useEffect(() => {
    if (!editor) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setEditor(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor]);

  const setStatus = async (review: Review, status: Status) => {
    setBusyId(review.id);
    try {
      await updateReviewStatus(review.id, status);
      showToast(status === 'approved' ? 'Review approved and product rating updated.' : status === 'hidden' ? 'Review hidden from the store.' : 'Review moved to pending.', status === 'approved' ? 'success' : 'info');
    } catch (err: any) {
      showToast(err?.message || 'Could not update the review. Please try again.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const saveReply = async (id: string) => {
    if (!replyText.trim()) { showToast('Reply text cannot be empty.', 'error'); return; }
    setBusyId(id);
    try {
      await replyToReview(id, replyText.trim());
      setReplyingId(null);
      showToast('Reply published.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not save. Please try again.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (review: Review) => {
    if (!window.confirm(`Delete the review by ${review.userName}? This cannot be undone.`)) return;
    setBusyId(review.id);
    try {
      await deleteReview(review.id);
      showToast('Review deleted.', 'info');
    } catch {
      showToast('Could not delete the review.', 'error');
    } finally {
      setBusyId(null);
    }
    // A photo the customer uploaded goes with the review. The server finds it in its own upload records,
    // never from the review's fields (a review's image URL could point at any image, even a catalog one).
    // Also tried after an error (the review may be gone even if the rating update failed); the server
    // refuses while the review still exists.
    apiPost('/api/reviews', { action: 'remove-photos', reviewId: review.id }).catch((error) => console.warn('Review photo not deleted:', error?.message));
  };

  const openNew = () => {
    setFormData(emptyForm());
    setEditor({ id: null });
  };

  const openEdit = (review: Review) => {
    setFormData({
      userName: review.userName,
      rating: review.rating,
      comment: review.comment,
      productId: review.productId && review.productId !== '0' ? review.productId : '',
      productName: review.productName || '',
      location: review.location === PLACEHOLDER_LOCATION ? '' : review.location || '',
      date: review.date || '',
      status: statusOf(review),
      verifiedPurchase: Boolean(review.verifiedPurchase),
      imageUrl: review.imageUrl || '',
      adminReply: review.adminReply || '',
    });
    setEditor({ id: review.id });
  };

  const saveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.userName.trim().length < 2 || formData.comment.trim().length < 3) {
      showToast('Customer name and review text are required.', 'error');
      return;
    }
    const data: FormData = { ...formData, userName: formData.userName.trim(), comment: formData.comment.trim(), imageUrl: (formData.imageUrl || '').trim() };
    // On store reviews, the product (the one the customer reviewed and maybe bought), "verified purchase"
    // (from paid orders) and the date (when it was sent) stay as the server set them
    if (editingFromStore && editing) {
      data.productId = editing.productId;
      data.productName = editing.productName;
      data.verifiedPurchase = Boolean(editing.verifiedPurchase);
      data.date = editing.date;
    }
    setSaving(true);
    try {
      if (editor?.id) await updateReview(editor.id, data);
      else await addReview(data);
      showToast(editor?.id ? 'Review updated.' : 'Review added.', 'success');
      setEditor(null);
    } catch (err: any) {
      showToast(err?.message || 'Could not save. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const tabs: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'hidden', label: 'Hidden' },
  ];

  return (
    <div id="admin-reviews-page" className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9C7A45]">Storefront</p>
          <h2 className="mt-1 font-serif text-3xl sm:text-4xl font-semibold text-[#4B1D3F] leading-tight">Customer reviews</h2>
          <p className="mt-1 text-sm text-[#2A1A26]/60 leading-relaxed">Reviews from the store wait here until you approve them. “Verified purchase” is set automatically when the customer’s paid order contains the product.</p>
        </div>
        <button type="button" onClick={openNew} className={`${pill} self-start lg:self-auto bg-[#4B1D3F] text-white hover:bg-[#3B1532] shrink-0`}>
          <Plus className="w-4 h-4" /> Add a review you received
        </button>
      </div>

      <div role="group" aria-label="Filter reviews by status" className="flex gap-2 overflow-x-auto sag-scroll-x -mx-1 px-1 pb-0.5">
        {tabs.map((t) => (
          <button key={t.key} type="button" aria-pressed={filter === t.key} onClick={() => setFilter(t.key)}
            className={`${pill} shrink-0 border ${filter === t.key ? 'bg-[#4B1D3F] border-[#4B1D3F] text-white' : 'bg-white border-[#4B1D3F]/15 text-[#2A1A26] hover:bg-[#F3EEF8]'}`}>
            {t.label}
            <span className={`min-w-5 px-1.5 rounded-full text-[11px] ${filter === t.key ? 'bg-white/20' : t.key === 'pending' && counts.pending ? 'bg-[#F7E4EA] text-[#8A2E55]' : 'bg-[#F3EEF8]'}`}>{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {editor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#2A1A26]/50 p-0 sm:p-4 sag-fade" onClick={() => setEditor(null)}>
          <form role="dialog" aria-modal="true" aria-labelledby="review-editor-title" onSubmit={saveForm} onClick={(e) => e.stopPropagation()}
            className="bg-[#FBF7F3] w-full sm:max-w-2xl max-h-[92vh] rounded-t-3xl sm:rounded-3xl flex flex-col animate-in slide-in-from-bottom-5 fade-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#4B1D3F]/10">
              <h3 id="review-editor-title" className="font-serif text-xl text-[#4B1D3F]">{editor.id ? 'Edit review' : 'Add a review you received'}</h3>
              <button type="button" onClick={() => setEditor(null)} aria-label="Close" autoFocus className="w-10 h-10 rounded-full hover:bg-[#F3EEF8] flex items-center justify-center cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto p-5 grid gap-4">
              {!editor.id && <p className="text-sm text-[#2A1A26]/70">Only add real reviews a customer sent you (for example on WhatsApp or Instagram).</p>}
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="grid gap-1.5 text-[12px] font-semibold text-[#2A1A26]/70">Customer name *
                  <input value={formData.userName} onChange={(e) => setFormData({ ...formData, userName: e.target.value })} maxLength={60} className={input} />
                </label>
                <label className="grid gap-1.5 text-[12px] font-semibold text-[#2A1A26]/70">City (optional)
                  <input value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} maxLength={80} placeholder="e.g. Jaipur" className={input} />
                </label>
                {editingFromStore ? (
                  <div className="grid gap-1.5 text-[12px] font-semibold text-[#2A1A26]/70">Product
                    <p className="min-h-10 flex items-center text-sm font-normal text-[#2A1A26]/80 break-words">{formData.productName || 'Deleted product'} (the style the customer reviewed)</p>
                  </div>
                ) : (
                  <label className="grid gap-1.5 text-[12px] font-semibold text-[#2A1A26]/70">Product
                    <select value={formData.productId || ''} className={input}
                      onChange={(e) => {
                        const p = products.find((x) => String(x.id) === e.target.value);
                        setFormData({ ...formData, productId: e.target.value, productName: p ? p.name : formData.productName });
                      }}>
                      <option value="">Not linked to a product</option>
                      {formData.productId && !products.some((p) => String(p.id) === formData.productId) && <option value={formData.productId}>{formData.productName || 'Deleted product'}</option>}
                      {products.map((p) => <option key={p.id} value={String(p.id)}>{p.name}{p.hidden ? ' (hidden)' : ''}</option>)}
                    </select>
                  </label>
                )}
                {editingFromStore ? (
                  <div className="grid gap-1.5 text-[12px] font-semibold text-[#2A1A26]/70">Review date
                    <p className="min-h-10 flex items-center text-sm font-normal text-[#2A1A26]/80">{showDate(formData.date)} (when the customer sent it)</p>
                  </div>
                ) : (
                  <label className="grid gap-1.5 text-[12px] font-semibold text-[#2A1A26]/70">Review date
                    <input value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} placeholder="e.g. 15 Sep 2026" className={input} />
                  </label>
                )}
                <label className="grid gap-1.5 text-[12px] font-semibold text-[#2A1A26]/70">Rating
                  <select value={formData.rating} onChange={(e) => setFormData({ ...formData, rating: Number(e.target.value) })} className={input}>
                    {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'star' : 'stars'}</option>)}
                  </select>
                </label>
                {editingFromStore ? (
                  <div className="grid gap-1.5 text-[12px] font-semibold text-[#2A1A26]/70">Verified purchase
                    <p className="min-h-10 flex items-center text-sm font-normal text-[#2A1A26]/80">{editing?.verifiedPurchase ? 'Yes — found in the customer’s paid orders' : 'No — no paid order with this product'}</p>
                  </div>
                ) : (
                  <label className="grid gap-1.5 text-[12px] font-semibold text-[#2A1A26]/70">Verified purchase
                    <select value={formData.verifiedPurchase ? 'yes' : 'no'} onChange={(e) => setFormData({ ...formData, verifiedPurchase: e.target.value === 'yes' })} className={input}>
                      <option value="no">Not verified</option>
                      <option value="yes">Verified — only if you confirmed the order</option>
                    </select>
                  </label>
                )}
              </div>
              <label className="grid gap-1.5 text-[12px] font-semibold text-[#2A1A26]/70">Photo URL (optional)
                <input value={formData.imageUrl} onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })} placeholder="https://res.cloudinary.com/…" className={input} />
              </label>
              {formData.imageUrl && <img src={getCleanImageUrl(formData.imageUrl, 200)} alt="Photo preview" className="w-20 aspect-[4/5] rounded-xl object-cover object-top border border-[#4B1D3F]/10 bg-[#F3EEF8]" />}
              <label className="grid gap-1.5 text-[12px] font-semibold text-[#2A1A26]/70">Review text *
                <textarea rows={4} value={formData.comment} onChange={(e) => setFormData({ ...formData, comment: e.target.value })} maxLength={2000}
                  className="w-full px-4 py-3 rounded-2xl border border-[#4B1D3F]/15 bg-white text-sm text-[#2A1A26] focus:ring-4 focus:ring-[#4B1D3F]/10 font-normal focus:outline-none focus:border-[#4B1D3F]/50" />
              </label>
            </div>
            <div className="px-5 py-4 border-t border-[#4B1D3F]/10 flex justify-end gap-2">
              <button type="button" onClick={() => setEditor(null)} className={`${pill} border border-[#4B1D3F]/15 bg-white text-[#2A1A26] hover:bg-[#F3EEF8]`}>Cancel</button>
              <button type="submit" disabled={saving} className={`${pill} bg-[#4B1D3F] text-white hover:bg-[#3B1532]`}>
                <Save className="w-4 h-4" /> {saving ? 'Saving…' : editor.id ? 'Save changes' : 'Add review'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {shown.length === 0 ? (
          <div className={`${card} text-center text-sm text-[#2A1A26]/65 py-14`}>
            <span className="mx-auto w-14 h-14 rounded-full bg-[#F3EEF8] text-[#4B1D3F] flex items-center justify-center mb-3"><MessageSquare className="w-6 h-6" /></span>
            {filter === 'pending' ? 'No reviews waiting for approval.' : 'No reviews here yet.'}
          </div>
        ) : shown.map((review) => {
          const status = statusOf(review);
          const extra = extras?.[review.id];
          const busy = busyId === review.id;
          const location = review.location && review.location !== PLACEHOLDER_LOCATION ? review.location : '';
          return (
            <article key={review.id} className={`${card} space-y-3`}>
              <div className="flex items-start justify-between gap-3">
                <span className="hidden sm:flex w-10 h-10 shrink-0 rounded-full bg-[#F3EEF8] text-[#4B1D3F] font-serif font-semibold text-lg items-center justify-center" aria-hidden="true">{(review.userName || '?').trim().charAt(0).toUpperCase()}</span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-sans text-sm font-semibold text-[#2A1A26] break-words">{review.userName}</h4>
                    <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
                    {review.verifiedPurchase && (
                      <span className="px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 text-[11px] font-semibold inline-flex items-center gap-1">
                        <BadgeCheck className="w-3.5 h-3.5" /> Verified purchase
                      </span>
                    )}
                    {extra && <span className="text-[11px] text-[#2A1A26]/55">{extra.source === 'storefront' ? 'From the store' : 'Added in admin'}</span>}
                  </div>
                  <p className="text-xs text-[#2A1A26]/60 break-words">
                    {[review.productName || 'Not linked to a product', showDate(review.date), location, review.verifiedPurchase && review.sizePurchased && extra?.source === 'storefront' ? `Size bought: ${review.sizePurchased}` : '']
                      .filter(Boolean).join(' · ')}
                  </p>
                  <span className="flex" role="img" aria-label={`Rated ${review.rating} out of 5`}>
                    {[1, 2, 3, 4, 5].map((i) => <Star key={i} aria-hidden="true" className={`w-3.5 h-3.5 ${i <= review.rating ? 'fill-[#C5A46D] text-[#C5A46D]' : 'text-[#C5A46D]/35'}`} />)}
                  </span>
                </div>
                {review.imageUrl && (
                  <a href={review.imageUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open the photo from ${review.userName}'s review`}
                    className="shrink-0 w-16 aspect-[4/5] rounded-xl overflow-hidden border border-[#4B1D3F]/10 bg-[#F3EEF8]">
                    <img src={getCleanImageUrl(review.imageUrl, 160)} alt="" loading="lazy" className="w-full h-full object-cover object-top" />
                  </a>
                )}
              </div>

              <p className="text-sm leading-relaxed text-[#2A1A26]/80 whitespace-pre-line break-words">{review.comment}</p>
              {extra && (status === 'approved' || extra.helpfulCount > 0) && (
                <p className="text-xs text-[#2A1A26]/60 inline-flex items-center gap-1.5">
                  <ThumbsUp className="w-3.5 h-3.5" /> {extra.helpfulCount === 1 ? '1 shopper found this helpful' : `${extra.helpfulCount} shoppers found this helpful`}
                </p>
              )}

              {review.adminReply && replyingId !== review.id && (
                <div className="rounded-2xl bg-[#F3EEF8] p-4 text-sm text-[#2A1A26]/80">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4B1D3F] flex items-center gap-1.5"><Reply className="w-3.5 h-3.5" /> Your reply</p>
                  <p className="mt-1 whitespace-pre-line break-words">{review.adminReply}</p>
                </div>
              )}

              {replyingId === review.id && (
                <div className="rounded-2xl border border-[#4B1D3F]/10 bg-[#FBF7F3] p-4 space-y-2">
                  <label htmlFor={`reply-${review.id}`} className="text-xs font-semibold text-[#2A1A26]/70">Reply shown under the review</label>
                  <textarea id={`reply-${review.id}`} rows={2} value={replyText} onChange={(e) => setReplyText(e.target.value)} maxLength={1000}
                    placeholder="Thank the customer or answer their question…"
                    className="w-full px-4 py-3 rounded-2xl border border-[#4B1D3F]/15 bg-white text-sm text-[#2A1A26] focus:ring-4 focus:ring-[#4B1D3F]/10 focus:outline-none focus:border-[#4B1D3F]/50" />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setReplyingId(null)} className={`${pill} border border-[#4B1D3F]/15 bg-white text-[#2A1A26] hover:bg-[#F3EEF8]`}>Cancel</button>
                    <button type="button" onClick={() => saveReply(review.id)} disabled={busy} className={`${pill} bg-[#4B1D3F] text-white hover:bg-[#3B1532]`}><Save className="w-3.5 h-3.5" /> Publish reply</button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#4B1D3F]/10">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => { setReplyingId(review.id); setReplyText(review.adminReply || ''); }} className={`${pill} border border-[#4B1D3F]/15 bg-white text-[#2A1A26] hover:bg-[#F3EEF8]`}>
                    <Reply className="w-3.5 h-3.5" /> {review.adminReply ? 'Edit reply' : 'Reply'}
                  </button>
                  <button type="button" onClick={() => openEdit(review)} className={`${pill} border border-[#4B1D3F]/15 bg-white text-[#2A1A26] hover:bg-[#F3EEF8]`}>
                    <Edit2 className="w-3.5 h-3.5" /> Edit
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {status !== 'approved' && (
                    <button type="button" onClick={() => setStatus(review, 'approved')} disabled={busy} className={`${pill} bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100`}>
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                  )}
                  {status !== 'hidden' && (
                    <button type="button" onClick={() => setStatus(review, 'hidden')} disabled={busy} className={`${pill} border border-[#4B1D3F]/15 bg-white text-[#2A1A26] hover:bg-[#F3EEF8]`}>
                      <EyeOff className="w-3.5 h-3.5" /> {status === 'pending' ? 'Reject' : 'Hide'}
                    </button>
                  )}
                  <button type="button" onClick={() => remove(review)} disabled={busy} aria-label={`Delete the review by ${review.userName}`}
                    className={`${pill} border border-rose-200 bg-white text-rose-700 hover:bg-rose-50`}>
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};
