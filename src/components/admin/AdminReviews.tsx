import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { BadgeCheck, Check, Edit2, EyeOff, Loader2, MessageSquare, Plus, Reply, Save, Star, ThumbsUp, Trash2, Upload, X } from 'lucide-react';
import { adminDb } from '../../lib/firebase';
import { apiPost } from '../../lib/api';
import { deleteImages, uploadImage } from '../../lib/dataStore';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { useProducts } from '../../context/ProductContext';
import { getCleanImageUrl } from '../../utils/imageHelper';
import { Review } from '../../types';
import { AdminPageHeader } from './kidsToysShared';

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
  pending: 'bg-sale-tint text-sale border-sale-line',
  approved: 'bg-ok-tint text-ok border-ok-line',
  hidden: 'bg-sunken text-ink-muted border-line',
};

const card = 'sag-card p-4 sm:p-5';
const fieldLabel = 'grid gap-1.5 text-[13px] leading-[18px] font-semibold text-ink';
const input = 'sag-input';
const pill = 'h-11 px-4 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50';

// Same limit as the other admin photo uploads (Cloudinary refuses larger images)
const MAX_UPLOAD_MB = 10;
// Some phones and Windows give HEIC photos no file type, so the file name is checked as well
const isImageFile = (file: File) => file.type ? file.type.startsWith('image/') : /\.(jpe?g|png|webp|heic|heif|avif|gif)$/i.test(file.name);
/**
 * True for a photo uploaded from this page: it sits in the store's review folder and is not one of the
 * customer uploads (those are named rv_… and are only ever deleted by the server, from its own records).
 */
const isAdminReviewUpload = (url: string) => {
  const match = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:v\d+\/)?suitauragirls\/reviews\/([^/.]+)\.[a-z0-9]+$/i.exec(url || '');
  return match !== null && !/^rv_[a-f0-9]{24}$/.test(match[1]);
};

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
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Photos uploaded while the editor is open; the ones that are not saved on the review are deleted again
  const sessionUploads = useRef<string[]>([]);
  // Changes every time the editor opens or closes, so an upload that finishes late is not put on another review
  const editorRun = useRef(0);
  // True while a save is on its way: the editor stays open so the photo being saved is not deleted
  const savingRef = useRef(false);
  const mounted = useRef(true);

  const deleteUploads = (urls: string[]) => {
    if (urls.length) deleteImages(urls).catch((error) => console.warn('Review photo not deleted:', error?.message));
  };
  const closeEditor = (keep = '', afterSave = false) => {
    if (savingRef.current && !afterSave) return;
    editorRun.current += 1;
    const unused = sessionUploads.current.filter((url) => url !== keep);
    sessionUploads.current = [];
    deleteUploads(unused);
    setUploading(false);
    setEditor(null);
  };

  // Leaving the Reviews page with the editor open: photos uploaded but not saved are deleted.
  // While a save is running this is left to the save, which keeps the saved photo and deletes the rest.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (savingRef.current) return;
      editorRun.current += 1;
      deleteUploads(sessionUploads.current);
      sessionUploads.current = [];
    };
  }, []);

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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeEditor(); };
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
      // A photo uploaded from this page goes with the review, unless another review shows it too
      const photo = review.imageUrl || '';
      if (isAdminReviewUpload(photo) && !reviewsList.some((r) => r.id !== review.id && r.imageUrl === photo)) deleteUploads([photo]);
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
    editorRun.current += 1;
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
    editorRun.current += 1;
    setEditor({ id: review.id });
  };

  // Uploads the customer's photo with the same signed admin upload the product photos use
  const handlePhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isImageFile(file)) {
      showToast('Only image files can be uploaded.', 'error');
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      showToast(`Photo is larger than ${MAX_UPLOAD_MB} MB. Please choose a smaller one.`, 'error');
      return;
    }
    const run = editorRun.current;
    setUploading(true);
    try {
      const url = await uploadImage(file, 'reviews');
      // The editor was closed (or another review opened) meanwhile, so this photo is not used
      if (run !== editorRun.current) { deleteUploads([url]); return; }
      sessionUploads.current.push(url);
      // No toast here: the preview and the line under the buttons say it, and a toast would hide the one after saving
      setFormData((prev) => ({ ...prev, imageUrl: url }));
    } catch (err: any) {
      if (run === editorRun.current) showToast(`Upload failed: ${err?.message || 'Please try again.'}`, 'error');
    } finally {
      if (run === editorRun.current) setUploading(false);
    }
  };

  const saveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploading) return;
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
    savingRef.current = true;
    try {
      if (editor?.id) await updateReview(editor.id, data);
      else await addReview(data);
      showToast(editor?.id ? 'Review updated.' : 'Review added.', 'success');
      // The photo that was on the review before goes only if it was uploaded from this page and no other review shows it
      const previous = editing?.imageUrl || '';
      if (previous && previous !== data.imageUrl && isAdminReviewUpload(previous) && !reviewsList.some((r) => r.id !== editing?.id && r.imageUrl === previous)) {
        deleteUploads([previous]);
      }
      closeEditor(data.imageUrl, true);
    } catch (err: any) {
      showToast(err?.message || 'Could not save. Please try again.', 'error');
      // The page was left while saving and the save failed: the uploaded photos are not used
      if (!mounted.current) { deleteUploads(sessionUploads.current); sessionUploads.current = []; }
    } finally {
      savingRef.current = false;
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
      <AdminPageHeader
        eyebrow="Storefront"
        title="Customer reviews"
        icon={<MessageSquare className="text-current" />}
        description="Reviews from the store wait here until you approve them. “Verified purchase” is set automatically when the customer’s paid order contains the product."
        actions={
          <button type="button" onClick={openNew} className="sag-btn-primary h-12 px-5 text-[15px] gap-2 w-full sm:w-auto">
            <Plus className="w-4 h-4" /> Add a review you received
          </button>
        }
      />

      <div role="group" aria-label="Filter reviews by status" className="flex gap-2 overflow-x-auto sag-scroll-x -mx-1 px-1 pb-0.5">
        {tabs.map((t) => (
          <button key={t.key} type="button" aria-pressed={filter === t.key} onClick={() => setFilter(t.key)}
            className={`${pill} shrink-0 border ${filter === t.key ? 'bg-ink border-ink text-white' : 'bg-white border-control text-ink hover:bg-sunken'}`}>
            {t.label}
            <span className={`min-w-5 px-1.5 rounded-md text-[11px] font-bold ${filter === t.key ? 'bg-white/20' : t.key === 'pending' && counts.pending ? 'bg-sale-tint text-sale' : 'bg-sunken'}`}>{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {editor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/50 p-0 sm:p-4 sag-fade" onClick={() => closeEditor()}>
          <form role="dialog" aria-modal="true" aria-labelledby="review-editor-title" onSubmit={saveForm} onClick={(e) => e.stopPropagation()}
            className="bg-white w-full sm:max-w-2xl max-h-[92dvh] rounded-t-[20px] sm:rounded-2xl flex flex-col overflow-hidden shadow-[var(--sag-shadow-pop)] animate-in slide-in-from-bottom-5 fade-in">
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-line">
              <h3 id="review-editor-title" className="text-[17px] leading-6 font-semibold text-ink">{editor.id ? 'Edit review' : 'Add a review you received'}</h3>
              <button type="button" onClick={() => closeEditor()} disabled={saving} aria-label="Close" autoFocus className="w-11 h-11 rounded-full hover:bg-sunken flex items-center justify-center cursor-pointer disabled:opacity-50"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto overscroll-contain p-5 grid gap-4">
              {!editor.id && <p className="text-sm text-ink-muted">Only add real reviews a customer sent you (for example on WhatsApp or Instagram).</p>}
              <div className="grid sm:grid-cols-2 gap-4">
                <label className={fieldLabel}>Customer name *
                  <input value={formData.userName} onChange={(e) => setFormData({ ...formData, userName: e.target.value })} maxLength={60} className={input} />
                </label>
                <label className={fieldLabel}>City (optional)
                  <input value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} maxLength={80} placeholder="e.g. Jaipur" className={input} />
                </label>
                {editingFromStore ? (
                  <div className={fieldLabel}>Product
                    <p className="min-h-10 flex items-center text-sm font-normal text-ink-muted break-words">{formData.productName || 'Deleted product'} (the style the customer reviewed)</p>
                  </div>
                ) : (
                  <label className={fieldLabel}>Product
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
                  <div className={fieldLabel}>Review date
                    <p className="min-h-10 flex items-center text-sm font-normal text-ink-muted">{showDate(formData.date)} (when the customer sent it)</p>
                  </div>
                ) : (
                  <label className={fieldLabel}>Review date
                    <input value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} placeholder="e.g. 15 Sep 2026" className={input} />
                  </label>
                )}
                <label className={fieldLabel}>Rating
                  <select value={formData.rating} onChange={(e) => setFormData({ ...formData, rating: Number(e.target.value) })} className={input}>
                    {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'star' : 'stars'}</option>)}
                  </select>
                </label>
                {editingFromStore ? (
                  <div className={fieldLabel}>Verified purchase
                    <p className="min-h-10 flex items-center text-sm font-normal text-ink-muted">{editing?.verifiedPurchase ? 'Yes — found in the customer’s paid orders' : 'No — no paid order with this product'}</p>
                  </div>
                ) : (
                  <label className={fieldLabel}>Verified purchase
                    <select value={formData.verifiedPurchase ? 'yes' : 'no'} onChange={(e) => setFormData({ ...formData, verifiedPurchase: e.target.value === 'yes' })} className={input}>
                      <option value="no">Not verified</option>
                      <option value="yes">Verified — only if you confirmed the order</option>
                    </select>
                  </label>
                )}
              </div>
              <div className="grid gap-2 min-w-0">
                <p className="text-[13px] leading-[18px] font-semibold text-ink">Customer’s photo <span className="font-normal text-ink-muted">(optional)</span></p>
                <div className="flex items-start gap-3 min-w-0">
                  {formData.imageUrl && (
                    <img src={getCleanImageUrl(formData.imageUrl, 240)} alt="Photo preview"
                      className="shrink-0 w-28 aspect-[4/5] rounded-xl object-contain border border-line bg-sunken" />
                  )}
                  <div className="min-w-0 flex-1 grid gap-2">
                    <div className="flex flex-wrap gap-2">
                      <input ref={fileInput} type="file" accept="image/*" onChange={handlePhotoFile} className="sr-only" tabIndex={-1} aria-label="Choose the customer’s photo" />
                      <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} aria-busy={uploading}
                        className={`${pill} border-[1.5px] border-control bg-white text-ink hover:bg-sunken`}>
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {uploading ? 'Uploading…' : formData.imageUrl ? 'Change photo' : 'Upload photo'}
                      </button>
                      {formData.imageUrl && (
                        <button type="button" onClick={() => setFormData({ ...formData, imageUrl: '' })} disabled={uploading}
                          className={`${pill} border-[1.5px] border-danger-line bg-white text-danger hover:bg-danger-tint`}>
                          <Trash2 className="w-3.5 h-3.5" /> Remove photo
                        </button>
                      )}
                    </div>
                    <p className="text-xs font-normal text-ink-muted " role="status">
                      {uploading ? 'Uploading the photo, please wait…'
                        : formData.imageUrl && sessionUploads.current.includes(formData.imageUrl) ? `Photo uploaded. Tap “${editor.id ? 'Save changes' : 'Add review'}” to publish it.`
                        : `Only a photo this customer sent with the review. From your phone or computer, up to ${MAX_UPLOAD_MB} MB.`}
                    </p>
                  </div>
                </div>
                <label className={fieldLabel}>Or paste a photo link
                  <input value={formData.imageUrl} onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })} placeholder="https://res.cloudinary.com/…" disabled={uploading} className={input} />
                </label>
              </div>
              <label className={fieldLabel}>Review text *
                <textarea rows={4} value={formData.comment} onChange={(e) => setFormData({ ...formData, comment: e.target.value })} maxLength={2000}
                  className="sag-input" />
              </label>
            </div>
            <div className="px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-line bg-white shadow-[var(--sag-shadow-bar)] flex sm:justify-end gap-3">
              <button type="button" onClick={() => closeEditor()} disabled={saving} className="sag-btn-outline h-12 flex-1 sm:flex-none sm:px-6 text-[15px]">Cancel</button>
              <button type="submit" disabled={saving || uploading} className="sag-btn-primary h-12 flex-[2] sm:flex-none sm:px-8 gap-2">
                <Save className="w-4 h-4" /> {saving ? 'Saving…' : editor.id ? 'Save changes' : 'Add review'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {shown.length === 0 ? (
          <div className={`${card} text-center text-sm text-ink-muted py-14`}>
            <span className="mx-auto w-12 h-12 rounded-xl bg-sunken text-ink flex items-center justify-center mb-3"><MessageSquare className="w-6 h-6" /></span>
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
                <span className="hidden sm:flex w-10 h-10 shrink-0 rounded-full bg-sunken text-ink font-semibold text-lg items-center justify-center" aria-hidden="true">{(review.userName || '?').trim().charAt(0).toUpperCase()}</span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-sans text-sm font-semibold text-ink break-words">{review.userName}</h4>
                    <span className={`sag-badge border ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
                    {review.verifiedPurchase && (
                      <span className="sag-badge border border-ok-line bg-ok-tint text-ok gap-1">
                        <BadgeCheck className="w-3.5 h-3.5" /> Verified purchase
                      </span>
                    )}
                    {extra && <span className="text-xs text-ink-muted">{extra.source === 'storefront' ? 'From the store' : 'Added in admin'}</span>}
                  </div>
                  <p className="text-[13px] text-ink-muted break-words">
                    {[review.productName || 'Not linked to a product', showDate(review.date), location, review.verifiedPurchase && review.sizePurchased && extra?.source === 'storefront' ? `Size bought: ${review.sizePurchased}` : '']
                      .filter(Boolean).join(' · ')}
                  </p>
                  <span className="flex items-center gap-0.5" role="img" aria-label={`Rated ${review.rating} out of 5`}>
                    {[1, 2, 3, 4, 5].map((i) => <Star key={i} aria-hidden="true" className={`w-4 h-4 ${i <= review.rating ? 'fill-star text-star' : 'text-control'}`} />)}
                    <span className="ml-1.5 text-[13px] font-semibold text-ink sag-num" aria-hidden="true">{review.rating}/5</span>
                  </span>
                </div>
                {review.imageUrl && (
                  <a href={review.imageUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open the photo from ${review.userName}'s review`}
                    className="shrink-0 w-16 aspect-[4/5] rounded-xl overflow-hidden border border-line bg-sunken">
                    <img src={getCleanImageUrl(review.imageUrl, 160)} alt="" loading="lazy" className="w-full h-full object-cover object-top" />
                  </a>
                )}
              </div>

              <p className="text-[15px] leading-[22px] text-ink whitespace-pre-line break-words">{review.comment}</p>
              {extra && (status === 'approved' || extra.helpfulCount > 0) && (
                <p className="text-[13px] text-ink-muted inline-flex items-center gap-1.5">
                  <ThumbsUp className="w-3.5 h-3.5" /> {extra.helpfulCount === 1 ? '1 shopper found this helpful' : `${extra.helpfulCount} shoppers found this helpful`}
                </p>
              )}

              {review.adminReply && replyingId !== review.id && (
                <div className="rounded-xl bg-sunken p-3.5 text-sm text-ink-muted">
                  <p className="text-[13px] font-semibold text-ink flex items-center gap-1.5"><Reply className="w-3.5 h-3.5" /> Your reply</p>
                  <p className="mt-1 whitespace-pre-line break-words">{review.adminReply}</p>
                </div>
              )}

              {replyingId === review.id && (
                <div className="rounded-xl border border-line bg-page p-3.5 space-y-2">
                  <label htmlFor={`reply-${review.id}`} className="text-xs font-semibold text-ink-muted">Reply shown under the review</label>
                  <textarea id={`reply-${review.id}`} rows={2} value={replyText} onChange={(e) => setReplyText(e.target.value)} maxLength={1000}
                    placeholder="Thank the customer or answer their question…"
                    className="sag-input" />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setReplyingId(null)} className={`${pill} border-[1.5px] border-control bg-white text-ink hover:bg-sunken`}>Cancel</button>
                    <button type="button" onClick={() => saveReply(review.id)} disabled={busy} className="sag-btn-primary h-11 px-4 text-sm gap-1.5"><Save className="w-4 h-4" /> Publish reply</button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-line">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => { setReplyingId(review.id); setReplyText(review.adminReply || ''); }} className={`${pill} border-[1.5px] border-control bg-white text-ink hover:bg-sunken`}>
                    <Reply className="w-3.5 h-3.5" /> {review.adminReply ? 'Edit reply' : 'Reply'}
                  </button>
                  <button type="button" onClick={() => openEdit(review)} className={`${pill} border-[1.5px] border-control bg-white text-ink hover:bg-sunken`}>
                    <Edit2 className="w-3.5 h-3.5" /> Edit
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {status !== 'approved' && (
                    <button type="button" onClick={() => setStatus(review, 'approved')} disabled={busy} className={`${pill} bg-ok-tint text-ok border border-ok-line hover:bg-ok-tint`}>
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                  )}
                  {status !== 'hidden' && (
                    <button type="button" onClick={() => setStatus(review, 'hidden')} disabled={busy} className={`${pill} border-[1.5px] border-control bg-white text-ink hover:bg-sunken`}>
                      <EyeOff className="w-3.5 h-3.5" /> {status === 'pending' ? 'Reject' : 'Hide'}
                    </button>
                  )}
                  <button type="button" onClick={() => remove(review)} disabled={busy} aria-label={`Delete the review by ${review.userName}`}
                    className={`${pill} border-[1.5px] border-danger-line bg-white text-danger hover:bg-danger-tint`}>
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
