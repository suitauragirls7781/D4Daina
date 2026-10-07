import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Camera, ImagePlus, Loader2, Minus, Plus, RefreshCcw, X } from 'lucide-react';
import { ReturnIcon } from './StoreIcons';
import { useProducts } from '../context/ProductContext';
import { ordersApi } from '../lib/api';
import { getCleanImageUrl } from '../utils/imageHelper';
import { useDialogA11y } from './OrderInvoice';
import { OrderWithRequests, formatWindowEnd, isReturnOpen, returnStatusOf } from './OrderProgress';
import { MediaGrant, makeImageFiles, putMediaFile } from '../lib/media';

// Same lists and limits as the server (api/_lib/orders.js); the server checks everything again.
const REASONS = ["Size doesn't fit", 'Damaged / defective', 'Wrong item received', 'Colour or quality not as expected', 'Other'] as const;
const PHOTO_REASONS: readonly string[] = ['Damaged / defective', 'Wrong item received'];
const MAX_PHOTOS = 4;
const MAX_EDGE = 1600;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type Kind = 'return' | 'exchange';
type Line = { checked: boolean; qty: number; exchangeSize: string };
type Photo = {
  id: string;
  preview: string;
  status: 'uploading' | 'done' | 'error';
  progress: number;
  url?: string;
  error?: string;
  xhr?: XMLHttpRequest;
};

/** Bought at 50% or more off: the return policy allows a size exchange only. */
export const isClearanceItem = (item: { product?: { price?: number; originalPrice?: number } }) => {
  const price = Number(item?.product?.price) || 0;
  const original = Number(item?.product?.originalPrice) || 0;
  return price > 0 && original > 0 && price <= original * 0.5;
};

/** Whether the owner can start a return / exchange (the server's answer when the order carries it). */
export const canStartReturn = (order: OrderWithRequests) => {
  if (order.returnEligibility) return order.returnEligibility.canRequest;
  const state = returnStatusOf(order);
  return order.status === 'Delivered' && order.paymentStatus === 'Paid' && !isReturnOpen(order) && (!state || state === 'rejected');
};

/**
 * Resizes a photo in the browser (longest side 1600px, JPEG) so uploads are quick on mobile data.
 * Formats the browser cannot open (e.g. HEIC on some phones) are sent as they are, up to 10 MB.
 */
const shrinkPhoto = async (file: File): Promise<Blob> => {
  const decode = async (): Promise<{ source: CanvasImageSource; width: number; height: number; done: () => void }> => {
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
        return { source: bitmap, width: bitmap.width, height: bitmap.height, done: () => bitmap.close() };
      } catch {
        // fall through to <img>
      }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('decode'));
        image.src = url;
      });
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  };
  try {
    const { source, width, height, done } = await decode();
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height, 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    done();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (blob) return blob;
  } catch {
    // send the original below
  }
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('This photo is too large. Please choose one under 10 MB.');
  return file;
};

export const ReturnRequestForm: React.FC<{
  order: OrderWithRequests;
  onClose: () => void;
  onDone: (message: string, updated?: OrderWithRequests) => void;
  onPolicy?: () => void;
}> = ({ order, onClose, onDone, onPolicy }) => {
  // The whole catalogue (accessories and unpublished products too), like the server's size check.
  const { allProducts: catalogue = [], isLoading: catalogueLoading } = useProducts();
  const panelRef = useRef<HTMLFormElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const photosRef = useRef<Photo[]>([]);
  // Pieces of each line that can still be asked for (the server's count; pieces already returned or exchanged are left out).
  const leftOf = (index: number) => {
    const bought = Math.max(1, order.items[index]?.quantity || 1);
    const remaining = order.returnEligibility?.remaining?.[index];
    return typeof remaining === 'number' ? Math.max(0, Math.min(bought, remaining)) : bought;
  };
  const openLines = order.items.map((_, index) => index).filter((index) => leftOf(index) > 0);
  const [kind, setKind] = useState<Kind | ''>('');
  const [lines, setLines] = useState<Record<number, Line>>(() => (
    openLines.length === 1 ? { [openLines[0]]: { checked: true, qty: leftOf(openLines[0]), exchangeSize: '' } } : {}
  ));
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  // A cash-on-delivery order was paid in cash: its refund goes to the UPI ID the customer gives here
  const [refundUpi, setRefundUpi] = useState('');
  const needsUpi = order.payMode === 'cod' && kind === 'return';
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  photosRef.current = photos;

  const close = () => { if (!sending) onClose(); };
  useDialogA11y(panelRef, close);
  // Stop unfinished uploads and free previews when the form closes
  useEffect(() => () => {
    photosRef.current.forEach((photo) => {
      photo.xhr?.abort();
      if (photo.preview) URL.revokeObjectURL(photo.preview);
    });
  }, []);

  const byId = useMemo(() => new Map(catalogue.map((p) => [String(p.id), p])), [catalogue]);
  const sizesFor = (productId?: string) => {
    const sizes = byId.get(String(productId || ''))?.sizes;
    return Array.isArray(sizes) ? sizes.map(String) : [];
  };
  // Only a product that is really gone from the catalogue has no sizes to offer (not one still loading).
  const productGone = (productId?: string) => !catalogueLoading && !byId.has(String(productId || ''));

  const clearanceLines = order.items.map((item, line) => (isClearanceItem(item) ? line : -1)).filter((line) => line >= 0);
  const selected = Object.entries(lines).filter(([index, line]) => line.checked && leftOf(Number(index)) > 0).map(([index, line]) => ({ index: Number(index), ...line }));
  const selectedClearance = selected.some((line) => clearanceLines.includes(line.index));
  const photoRequired = PHOTO_REASONS.includes(reason);
  const uploading = photos.some((photo) => photo.status === 'uploading');
  const windowEnds = formatWindowEnd(order.returnEligibility?.windowEndsAt);

  const setLine = (index: number, patch: Partial<Line>) => {
    setError('');
    setLines((prev) => {
      const current = prev[index] || { checked: false, qty: leftOf(index), exchangeSize: '' };
      return { ...prev, [index]: { ...current, ...patch } };
    });
  };

  const updatePhoto = (id: string, patch: Partial<Photo>) => setPhotos((prev) => prev.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo)));

  const uploadPhoto = async (id: string, file: File) => {
    try {
      const blob = await shrinkPhoto(file);
      if (blob !== file) {
        // Preview the resized JPEG (this also shows HEIC photos the browser could open)
        const existing = photosRef.current.find((photo) => photo.id === id);
        if (!existing) return;
        if (existing.preview) URL.revokeObjectURL(existing.preview);
        updatePhoto(id, { preview: URL.createObjectURL(blob) });
      }
      const grant = await ordersApi<MediaGrant>('return-photo-sign', { orderNumber: order.orderNumber });
      if (!photosRef.current.some((photo) => photo.id === id)) return; // removed meanwhile
      // Every size is made here and sent to the store's storage; the bar moves as each one arrives
      const prepared = await makeImageFiles(blob, grant.files);
      let sent = 0;
      for (const part of prepared) {
        if (!photosRef.current.some((photo) => photo.id === id)) throw new Error('aborted');
        try {
          await putMediaFile(grant.grant, part.name, part.blob);
        } catch {
          throw new Error('This photo could not be uploaded. Please try another photo.');
        }
        sent += 1;
        updatePhoto(id, { progress: Math.min(99, Math.round((sent / prepared.length) * 100)) });
      }
      const url = grant.url;
      updatePhoto(id, { status: 'done', progress: 100, url, xhr: undefined });
    } catch (err: any) {
      if (err?.message === 'aborted') return;
      updatePhoto(id, { status: 'error', xhr: undefined, error: err?.message || 'This photo could not be uploaded.' });
    }
  };

  const addPhotos = (files: FileList | null) => {
    setError('');
    const list = Array.from(files || []);
    if (fileInput.current) fileInput.current.value = '';
    const room = MAX_PHOTOS - photosRef.current.length;
    if (!list.length) return;
    if (room <= 0) {
      setError(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const accepted = list.filter((file) => file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)).slice(0, room);
    if (accepted.length < Math.min(list.length, room)) setError('Please choose photos (JPG, PNG, WebP or HEIC).');
    if (list.length > room) setError(`Only ${MAX_PHOTOS} photos can be added; the extra ones were left out.`);
    const added = accepted.map((file) => ({
      file,
      photo: {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        preview: /^image\/(jpeg|png|webp|gif)$/.test(file.type) ? URL.createObjectURL(file) : '',
        status: 'uploading' as const,
        progress: 0,
      },
    }));
    setPhotos((prev) => [...prev, ...added.map((entry) => entry.photo)]);
    photosRef.current = [...photosRef.current, ...added.map((entry) => entry.photo)];
    added.forEach((entry) => uploadPhoto(entry.photo.id, entry.file));
  };

  const removePhoto = (id: string) => {
    const photo = photosRef.current.find((entry) => entry.id === id);
    photo?.xhr?.abort();
    if (photo?.preview) URL.revokeObjectURL(photo.preview);
    setPhotos((prev) => prev.filter((entry) => entry.id !== id));
    setError('');
  };

  const problem = (): string => {
    if (!kind) return 'Please choose return or exchange.';
    if (!selected.length) return 'Please choose at least one item.';
    if (kind === 'return' && selectedClearance) return 'Clearance pieces (50% or more off) can only be exchanged for another size. Choose Exchange, or untick them.';
    if (!reason) return 'Please choose a reason.';
    if (needsUpi && !/^[A-Za-z0-9._-]{2,80}@[A-Za-z][A-Za-z0-9]{1,30}$/.test(refundUpi.trim())) return 'Please enter the UPI ID your refund should be sent to (for example name@upi).';
    const note = details.trim();
    if (reason === 'Other' && note.length < 5) return 'Please tell us a little more about the problem.';
    if (kind === 'exchange') {
      for (const line of selected) {
        const item = order.items[line.index];
        if (line.exchangeSize) continue;
        if (clearanceLines.includes(line.index) && productGone(item.product?.id)) {
          return `${item.product?.name || 'This piece'} is no longer in our catalogue, so its exchange has to be arranged with us on WhatsApp. Please untick it here.`;
        }
        if (clearanceLines.includes(line.index) && !sizesFor(item.product?.id).length) return 'Sizes are still loading. Please wait a moment and try again.';
        if (clearanceLines.includes(line.index)) return `Please choose the size you want for ${item.product?.name || 'this item'}.`;
        if (note.length < 3) return `Please choose the size you want for ${item.product?.name || 'this item'}, or tell us in the note what you would like instead.`;
      }
    }
    if (uploading) return 'Please wait for the photos to finish uploading.';
    if (photos.some((photo) => photo.status === 'error')) return 'One photo could not be uploaded. Remove it and try again.';
    if (photoRequired && !photos.some((photo) => photo.status === 'done')) return 'Please add at least one photo that shows the problem.';
    return '';
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const issue = problem();
    if (issue) {
      setError(issue);
      return;
    }
    setSending(true);
    setError('');
    try {
      const result = await ordersApi<{ message?: string; order?: OrderWithRequests }>('return-request', {
        orderNumber: order.orderNumber,
        type: kind,
        items: selected.map((line) => ({ line: line.index, qty: Math.min(line.qty, leftOf(line.index)), ...(kind === 'exchange' ? { exchangeSize: line.exchangeSize } : {}) })),
        reason,
        details: details.trim(),
        ...(needsUpi ? { refundUpi: refundUpi.trim() } : {}),
        photos: photos.filter((photo) => photo.status === 'done' && photo.url).map((photo) => photo.url),
      });
      onDone(result.message || 'Your request has been sent. Our team will email you.', result.order);
    } catch (err: any) {
      setError(err?.message || 'Could not send your request. Please try again.');
      setSending(false);
    }
  };

  const legendClass = 'flex items-center gap-2 mb-3 text-base leading-[22px] font-semibold text-ink';
  const stepDot = (n: number) => <span className="sag-num w-6 h-6 shrink-0 rounded-full bg-ink text-white text-xs font-bold flex items-center justify-center" aria-hidden="true">{n}</span>;
  const focusRing = 'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink';
  const noteText = 'text-[13px] leading-[18px] text-ink-muted';

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-ink/50 flex items-end sm:items-center justify-center sm:p-4 sag-fade" onClick={close}>
      <form
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="return-form-title"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        noValidate
        className="bg-white text-ink w-full sm:max-w-2xl max-h-[92dvh] flex flex-col rounded-t-sheet sm:rounded-card shadow-[var(--sag-shadow-pop)] animate-in fade-in slide-in-from-bottom-5"
      >
        <span className="sm:hidden mx-auto mt-2 h-1 w-9 rounded-full bg-sunken-deep" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3 pl-4 pr-2 sm:pl-6 sm:pr-4 pt-2 sm:pt-4 pb-3 border-b border-line">
          <div className="min-w-0 pt-2">
            <h2 id="return-form-title" className="text-base leading-[22px] font-semibold text-ink">Return or exchange</h2>
            <p className="mt-0.5 text-sm leading-5 text-ink-muted break-words">
              #{order.orderNumber}{windowEnds ? ` · request by ${windowEnds}` : ''}
            </p>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="w-11 h-11 shrink-0 rounded-full hover:bg-sunken flex items-center justify-center text-ink cursor-pointer">
            <X className="w-[22px] h-[22px]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-5 space-y-7">
          <fieldset>
            <legend className={legendClass}>{stepDot(1)} What would you like?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                { value: 'return', title: 'Return', text: 'Send it back for a refund to your original payment method.', icon: ReturnIcon },
                { value: 'exchange', title: 'Exchange', text: 'Get a different size, or a replacement piece.', icon: RefreshCcw },
              ] as const).map(({ value, title, text, icon: Icon }, index) => (
                <label key={value} data-selected={kind === value} className={`sag-card flex items-start gap-3 px-3.5 py-3 text-left cursor-pointer ${focusRing}`}>
                  <input
                    type="radio"
                    name="return-kind"
                    value={value}
                    checked={kind === value}
                    onChange={() => { setKind(value); setError(''); }}
                    data-autofocus={index === 0 || undefined}
                    className="sr-only"
                  />
                  <span className={`shrink-0 flex mt-0.5 ${kind === value ? 'text-brand' : 'text-ink-muted'}`}>
                    {Icon === ReturnIcon ? <ReturnIcon className="w-5 h-5" mono live={false} /> : <Icon className="w-5 h-5" aria-hidden="true" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] leading-[22px] font-semibold text-ink">{title}</span>
                    <span className="block text-sm leading-5 text-ink-muted">{text}</span>
                  </span>
                </label>
              ))}
            </div>
            {clearanceLines.length > 0 && (
              <p className="mt-2.5 rounded-control bg-sale-tint border-l-4 border-sale-line px-3.5 py-2.5 text-sm leading-5 text-ink">Clearance pieces (50% or more off) can only be exchanged for another size.</p>
            )}
          </fieldset>

          <fieldset>
            <legend className={legendClass}>{stepDot(2)} Which items?</legend>
            <ul className="space-y-2">
              {order.items.map((item, index) => {
                const line = lines[index];
                const bought = Math.max(1, item.quantity || 1);
                const left = leftOf(index);
                const settled = left <= 0;
                const checked = Boolean(line?.checked) && !settled;
                const qty = Math.min(line?.qty || left, left);
                const clearance = clearanceLines.includes(index);
                const sizes = sizesFor(item.product?.id);
                const colour = item.selectedColor?.name && !['Default', 'Standard'].includes(item.selectedColor.name) ? ` · ${item.selectedColor.name}` : '';
                return (
                  <li key={item.id || index} data-selected={checked} className={`sag-card px-3 py-3 ${settled ? 'bg-page' : ''}`}>
                    <label className={`flex items-center gap-3 min-h-11 ${settled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={settled}
                        onChange={(e) => setLine(index, { checked: e.target.checked })}
                        className="w-[22px] h-[22px] shrink-0 accent-brand disabled:opacity-40"
                        aria-label={`Include ${item.product?.name || 'item'}`}
                      />
                      <span className={`w-14 aspect-[4/5] shrink-0 overflow-hidden rounded-chip bg-sunken ${settled ? 'opacity-50' : ''}`}>
                        {item.product?.images?.[0] && <img src={getCleanImageUrl(item.product.images[0], 120)} alt="" className="w-full h-full object-cover object-top" loading="lazy" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm leading-5 font-medium line-clamp-2 ${settled ? 'text-ink-muted' : 'text-ink'}`}>{item.product?.name}</span>
                        <span className={`block ${noteText}`}>
                          {item.selectedSize ? `Size ${item.selectedSize}` : 'One size'}{colour} · Qty {bought}
                          {!settled && left < bought ? ` · ${left} can still be returned or exchanged` : ''}
                        </span>
                        {settled && <span className="sag-badge mt-1 bg-sunken text-ink-muted">Already returned or exchanged</span>}
                        {!settled && clearance && <span className="sag-badge mt-1 bg-sale-tint text-sale">Clearance · exchange only</span>}
                      </span>
                    </label>
                    {checked && (left > 1 || kind === 'exchange') && (
                      <div className="mt-3 pt-3 border-t border-brand-line flex flex-wrap items-center gap-3">
                        {left > 1 && (
                          <div className="inline-flex items-center rounded-chip border-[1.5px] border-control bg-white" role="group" aria-label="Quantity">
                            <button type="button" onClick={() => setLine(index, { qty: Math.max(1, qty - 1) })} disabled={qty <= 1} aria-label="One less" className="w-11 h-11 flex items-center justify-center text-ink disabled:text-ink-faint disabled:opacity-50 cursor-pointer">
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="sag-num w-8 text-center text-[15px] font-semibold text-ink" aria-live="polite">{qty}</span>
                            <button type="button" onClick={() => setLine(index, { qty: Math.min(left, qty + 1) })} disabled={qty >= left} aria-label="One more" className="w-11 h-11 flex items-center justify-center text-ink disabled:text-ink-faint disabled:opacity-50 cursor-pointer">
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        {kind === 'exchange' && (sizes.length > 0 ? (
                          <label className="inline-flex flex-wrap items-center gap-2 text-[13px] leading-[18px] font-semibold text-ink">
                            New size
                            <select
                              value={line?.exchangeSize || ''}
                              onChange={(e) => setLine(index, { exchangeSize: e.target.value })}
                              className="h-11 max-w-full rounded-chip border-[1.5px] border-control bg-white px-3 text-base font-normal text-ink cursor-pointer focus:border-brand"
                            >
                              <option value="">{clearance ? 'Choose a size' : 'Choose (or add a note)'}</option>
                              {sizes.map((size) => <option key={size} value={size}>{size}{size === item.selectedSize ? ' (same size)' : ''}</option>)}
                            </select>
                          </label>
                        ) : (
                          <span className={noteText}>
                            {!productGone(item.product?.id)
                              ? 'Loading sizes…'
                              : clearance
                                ? 'This piece is no longer in our catalogue; please arrange its exchange with us on WhatsApp.'
                                : 'Tell us in the note what you would like instead.'}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </fieldset>

          <fieldset>
            <legend className={legendClass}>{stepDot(3)} Why?</legend>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((option) => (
                <label key={option} data-selected={reason === option} className={`sag-chip h-11 min-w-0 text-sm ${focusRing}`}>
                  <input type="radio" name="return-reason" value={option} checked={reason === option} onChange={() => { setReason(option); setError(''); }} className="sr-only" />
                  {option}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="return-details" className="sag-label">
              {reason === 'Other' ? 'Tell us what is wrong' : kind === 'exchange' ? 'Note (optional) — e.g. the size or colour you would like' : 'More details (optional)'}
            </label>
            <textarea
              id="return-details"
              rows={3}
              maxLength={1000}
              value={details}
              onChange={(e) => { setDetails(e.target.value); setError(''); }}
              className="sag-input resize-none"
            />
          </div>

          {needsUpi && (
            <div>
              <label htmlFor="return-refund-upi" className="sag-label">UPI ID for your refund</label>
              <input
                id="return-refund-upi"
                type="text"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={100}
                placeholder="name@upi"
                value={refundUpi}
                onChange={(e) => { setRefundUpi(e.target.value); setError(''); }}
                className="sag-input"
              />
              <p className="mt-1.5 text-[13px] leading-[18px] text-ink-muted">This order was cash on delivery, so the refund is sent to this UPI ID after our quality check.</p>
            </div>
          )}

          <div>
            <p className={legendClass}>
              {stepDot(4)} Photos {photoRequired ? <span className="text-sm font-semibold text-sale">(at least one needed)</span> : <span className="text-sm font-normal text-ink-muted">(optional)</span>}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {photos.map((photo) => (
                <div key={photo.id} className="min-w-0">
                  <div className="aspect-[4/5] rounded-chip overflow-hidden bg-sunken flex items-center justify-center">
                    {photo.preview ? <img src={photo.preview} alt="Your photo" className="w-full h-full object-cover" /> : <Camera className="w-6 h-6 text-ink-muted" aria-hidden="true" />}
                  </div>
                  {photo.status === 'uploading' && (
                    <div className="mt-1.5 h-1 rounded-full bg-line overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={photo.progress} aria-label="Uploading">
                      <div className="h-full bg-brand transition-[width]" style={{ width: `${Math.max(6, photo.progress)}%` }} />
                    </div>
                  )}
                  {photo.status === 'done' && <p className="mt-1 text-[11px] leading-[14px] font-semibold text-ok">Uploaded</p>}
                  {photo.status === 'error' && <p className="mt-1 text-[11px] leading-[14px] font-medium text-danger">{photo.error}</p>}
                  <button type="button" onClick={() => removePhoto(photo.id)} aria-label="Remove photo" className="w-full min-h-11 text-[13px] font-semibold text-brand underline underline-offset-[3px] cursor-pointer">
                    Remove
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="aspect-[4/5] rounded-chip border-[1.5px] border-dashed border-control bg-white hover:bg-sunken flex flex-col items-center justify-center gap-1 text-ink transition-colors cursor-pointer"
                >
                  <ImagePlus className="w-6 h-6" aria-hidden="true" />
                  <span className="text-[11px] leading-[14px] font-semibold">Add photo</span>
                </button>
              )}
            </div>
            <input ref={fileInput} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => addPhotos(e.target.files)} />
            <p className={`mt-2 ${noteText}`}>Up to {MAX_PHOTOS} clear photos of the piece, the problem and the tag. They are resized before upload.</p>
          </div>

          <div className="rounded-control bg-brand-wash border border-brand-line px-3.5 py-3 text-sm leading-5 text-ink">
            Pieces must be unused and unwashed, with their original tags. Our team reviews every request and emails you the next steps.
            {kind === 'return' && ' Refunds go to your original payment method.'}{' '}
            {onPolicy && <button type="button" onClick={onPolicy} className="font-semibold text-brand underline underline-offset-[3px] cursor-pointer">Return policy</button>}
          </div>

          {error && (
            <p role="alert" className="rounded-control bg-danger-tint border border-danger-line px-3.5 py-3 text-sm leading-5 font-medium text-danger flex items-start gap-2">
              <AlertCircle className="w-[18px] h-[18px] mt-px shrink-0" aria-hidden="true" /> {error}
            </p>
          )}

        </div>
        <div className="grid grid-cols-[auto_1fr] sm:grid-cols-2 gap-2 px-4 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-line">
          <button type="button" onClick={close} disabled={sending} className="sag-btn-outline h-12 px-4 text-[15px]">
            Not now
          </button>
          <button type="submit" disabled={sending} className="sag-btn-primary h-12 px-4 gap-2 text-[15px]">
            {(sending || uploading) && <Loader2 className="w-[18px] h-[18px] animate-spin" aria-hidden="true" />}
            {sending ? 'Sending…' : uploading ? 'Uploading photos…' : 'Send request'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
};
