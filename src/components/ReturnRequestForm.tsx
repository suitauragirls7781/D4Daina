import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Camera, ImagePlus, Loader2, Minus, Plus, RefreshCcw, X } from 'lucide-react';
import { ReturnIcon } from './StoreIcons';
import { useProducts } from '../context/ProductContext';
import { ordersApi } from '../lib/api';
import { getCleanImageUrl } from '../utils/imageHelper';
import { useDialogA11y } from './OrderInvoice';
import { OrderWithRequests, formatWindowEnd, isReturnOpen, returnStatusOf } from './OrderProgress';

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
      const signed = await ordersApi<{ cloudName: string; apiKey: string; signature: string; fields: Record<string, string | number> }>('return-photo-sign', { orderNumber: order.orderNumber });
      if (!photosRef.current.some((photo) => photo.id === id)) return; // removed meanwhile
      const form = new FormData();
      form.append('file', blob, blob === file ? file.name : 'return-photo.jpg');
      form.append('api_key', signed.apiKey);
      Object.entries(signed.fields || {}).forEach(([key, value]) => form.append(key, String(value)));
      form.append('signature', signed.signature);
      const url = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        updatePhoto(id, { xhr });
        xhr.open('POST', `https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/image/upload`);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) updatePhoto(id, { progress: Math.min(99, Math.round((event.loaded / event.total) * 100)) });
        };
        xhr.onload = () => {
          let result: any = {};
          try { result = JSON.parse(xhr.responseText || '{}'); } catch { result = {}; }
          if (xhr.status >= 200 && xhr.status < 300 && typeof result.secure_url === 'string') resolve(result.secure_url);
          else reject(new Error('This photo could not be uploaded. Please try another photo.'));
        };
        xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
        xhr.onabort = () => reject(new Error('aborted'));
        xhr.send(form);
      });
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
        photos: photos.filter((photo) => photo.status === 'done' && photo.url).map((photo) => photo.url),
      });
      onDone(result.message || 'Your request has been sent. Our team will email you.', result.order);
    } catch (err: any) {
      setError(err?.message || 'Could not send your request. Please try again.');
      setSending(false);
    }
  };

  const optionClass = (active: boolean, disabled = false) => `flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#4B1D3F]/40 ${
    disabled ? 'opacity-50 cursor-not-allowed border-[#4B1D3F]/10 bg-white/50' : active ? 'border-[#4B1D3F] bg-white cursor-pointer' : 'border-[#4B1D3F]/15 bg-white/60 hover:bg-white cursor-pointer'
  }`;
  const legendClass = 'flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4B1D3F] mb-3';
  const stepDot = (n: number) => <span className="w-6 h-6 shrink-0 rounded-full bg-[#4B1D3F] text-white text-[11px] font-semibold tracking-normal flex items-center justify-center" aria-hidden="true">{n}</span>;

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-[#2A1A26]/50 flex items-end sm:items-center justify-center sm:p-4 sag-fade" onClick={close}>
      <form
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="return-form-title"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        noValidate
        className="bg-[#FBF7F3] w-full sm:max-w-2xl max-h-[94vh] flex flex-col rounded-t-3xl sm:rounded-3xl shadow-[var(--sag-shadow)] animate-in fade-in slide-in-from-bottom-5"
      >
        <span className="sm:hidden mx-auto mt-2.5 h-1 w-10 rounded-full bg-[#4B1D3F]/15" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-3 sm:pt-6 pb-4 border-b border-[#4B1D3F]/10">
          <div className="flex items-start gap-3 min-w-0">
          <span className="w-11 h-11 shrink-0 rounded-full bg-[#F3EEF8] flex items-center justify-center"><ReturnIcon className="w-6 h-6" /></span>
          <div className="min-w-0">
            <h2 id="return-form-title" className="font-serif text-2xl text-[#4B1D3F] leading-tight">Return or exchange</h2>
            <p className="mt-0.5 text-sm text-[#2A1A26]/65 break-words">
              #{order.orderNumber}{windowEnds ? ` · request by ${windowEnds}` : ''}
            </p>
          </div>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="w-10 h-10 shrink-0 rounded-full hover:bg-[#F3EEF8] flex items-center justify-center text-[#4B1D3F] cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 py-5 space-y-7">
          <fieldset>
            <legend className={legendClass}>{stepDot(1)} What would you like?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                { value: 'return', title: 'Return', text: 'Send it back for a refund to your original payment method.', icon: ReturnIcon },
                { value: 'exchange', title: 'Exchange', text: 'Get a different size, or a replacement piece.', icon: RefreshCcw },
              ] as const).map(({ value, title, text, icon: Icon }, index) => (
                <label key={value} className={optionClass(kind === value)}>
                  <input
                    type="radio"
                    name="return-kind"
                    value={value}
                    checked={kind === value}
                    onChange={() => { setKind(value); setError(''); }}
                    data-autofocus={index === 0 || undefined}
                    className="sr-only"
                  />
                  <span className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${kind === value ? 'bg-[#4B1D3F] text-white' : 'bg-[#F3EEF8] text-[#4B1D3F]'}`}>
                    {Icon === ReturnIcon ? <ReturnIcon className="w-5 h-5" mono live={false} /> : <Icon className="w-5 h-5 text-current" aria-hidden="true" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-[#2A1A26]">{title}</span>
                    <span className="block text-sm text-[#2A1A26]/70 leading-snug">{text}</span>
                  </span>
                </label>
              ))}
            </div>
            {clearanceLines.length > 0 && (
              <p className="mt-2.5 rounded-2xl bg-[#F7E4EA] px-4 py-2.5 text-[13px] text-[#8A2E55]">Clearance pieces (50% or more off) can only be exchanged for another size.</p>
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
                  <li key={item.id || index} className={`rounded-2xl border px-3 py-3 ${settled ? 'bg-white/50 border-[#4B1D3F]/10' : checked ? 'bg-white border-[#4B1D3F]/50' : 'bg-white border-[#4B1D3F]/12'}`}>
                    <label className={`flex items-center gap-3 ${settled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={settled}
                        onChange={(e) => setLine(index, { checked: e.target.checked })}
                        className="w-5 h-5 shrink-0 accent-[#4B1D3F] disabled:opacity-40"
                        aria-label={`Include ${item.product?.name || 'item'}`}
                      />
                      <span className={`w-14 aspect-[4/5] shrink-0 overflow-hidden rounded-xl bg-[#F3EEF8] border border-[#4B1D3F]/10 ${settled ? 'opacity-50' : ''}`}>
                        {item.product?.images?.[0] && <img src={getCleanImageUrl(item.product.images[0], 120)} alt="" className="w-full h-full object-cover object-top" loading="lazy" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block font-serif text-base leading-snug line-clamp-2 ${settled ? 'text-[#2A1A26]/55' : 'text-[#2A1A26]'}`}>{item.product?.name}</span>
                        <span className="block text-[13px] text-[#2A1A26]/65">
                          {item.selectedSize ? `Size ${item.selectedSize}` : 'One size'}{colour} · Qty {bought}
                          {!settled && left < bought ? ` · ${left} can still be returned or exchanged` : ''}
                        </span>
                        {settled && <span className="mt-1 inline-block rounded-full bg-[#F3EEF8] px-2 py-0.5 text-[11px] font-semibold text-[#4B1D3F]">Already returned or exchanged</span>}
                        {!settled && clearance && <span className="mt-1 inline-block rounded-full bg-[#F7E4EA] px-2 py-0.5 text-[11px] font-semibold text-[#8A2E55]">Clearance · exchange only</span>}
                      </span>
                    </label>
                    {checked && (left > 1 || kind === 'exchange') && (
                      <div className="mt-3 pt-3 border-t border-[#4B1D3F]/8 flex flex-wrap items-center gap-3">
                        {left > 1 && (
                          <div className="inline-flex items-center rounded-full border border-[#4B1D3F]/20" role="group" aria-label="Quantity">
                            <button type="button" onClick={() => setLine(index, { qty: Math.max(1, qty - 1) })} disabled={qty <= 1} aria-label="One less" className="w-10 h-10 flex items-center justify-center text-[#4B1D3F] disabled:opacity-40 cursor-pointer">
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-8 text-center text-sm text-[#2A1A26]" aria-live="polite">{qty}</span>
                            <button type="button" onClick={() => setLine(index, { qty: Math.min(left, qty + 1) })} disabled={qty >= left} aria-label="One more" className="w-10 h-10 flex items-center justify-center text-[#4B1D3F] disabled:opacity-40 cursor-pointer">
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        {kind === 'exchange' && (sizes.length > 0 ? (
                          <label className="inline-flex flex-wrap items-center gap-2 text-sm font-medium text-[#2A1A26]/80">
                            New size
                            <select
                              value={line?.exchangeSize || ''}
                              onChange={(e) => setLine(index, { exchangeSize: e.target.value })}
                              className="h-11 max-w-full rounded-full border border-[#4B1D3F]/25 bg-[#FBF7F3] px-4 text-sm text-[#2A1A26] cursor-pointer focus:outline-none focus:border-[#4B1D3F]/70 focus:ring-4 focus:ring-[#F3EEF8]"
                            >
                              <option value="">{clearance ? 'Choose a size' : 'Choose (or add a note)'}</option>
                              {sizes.map((size) => <option key={size} value={size}>{size}{size === item.selectedSize ? ' (same size)' : ''}</option>)}
                            </select>
                          </label>
                        ) : (
                          <span className="text-[13px] text-[#2A1A26]/65">
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
                <label key={option} className={`inline-flex items-center min-h-11 px-4 rounded-full border text-sm cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#4B1D3F]/40 ${reason === option ? 'border-[#4B1D3F] bg-[#4B1D3F] text-white' : 'border-[#4B1D3F]/20 bg-white text-[#2A1A26]/85 hover:bg-[#F3EEF8]'}`}>
                  <input type="radio" name="return-reason" value={option} checked={reason === option} onChange={() => { setReason(option); setError(''); }} className="sr-only" />
                  {option}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block space-y-1.5">
            <span className="block pl-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65">
              {reason === 'Other' ? 'Tell us what is wrong' : kind === 'exchange' ? 'Note (optional) — e.g. the size or colour you would like' : 'More details (optional)'}
            </span>
            <textarea
              rows={3}
              maxLength={1000}
              value={details}
              onChange={(e) => { setDetails(e.target.value); setError(''); }}
              className="w-full rounded-2xl border border-[#4B1D3F]/20 bg-white px-4 py-3 text-sm text-[#2A1A26] resize-none focus:outline-none focus:border-[#4B1D3F]/70 focus:ring-4 focus:ring-[#F3EEF8]"
            />
          </label>

          <div>
            <p className={legendClass}>
              {stepDot(4)} Photos {photoRequired ? <span className="text-[#8A2E55] normal-case tracking-normal">(at least one needed)</span> : <span className="normal-case tracking-normal">(optional)</span>}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {photos.map((photo) => (
                <div key={photo.id} className="space-y-1">
                  <div className="relative aspect-[4/5] rounded-xl overflow-hidden border border-[#4B1D3F]/15 bg-[#F3EEF8] flex items-center justify-center">
                    {photo.preview ? <img src={photo.preview} alt="Your photo" className="w-full h-full object-cover" /> : <Camera className="w-6 h-6 text-[#4B1D3F]/50" aria-hidden="true" />}
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      aria-label="Remove photo"
                      className="absolute top-1 right-1 w-8 h-8 rounded-full bg-white/95 border border-[#4B1D3F]/15 flex items-center justify-center text-[#4B1D3F] cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {photo.status === 'uploading' && (
                    <div className="h-1.5 rounded-full bg-[#E6DDF0] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={photo.progress} aria-label="Uploading">
                      <div className="h-full bg-[#4B1D3F] transition-[width]" style={{ width: `${Math.max(6, photo.progress)}%` }} />
                    </div>
                  )}
                  {photo.status === 'done' && <p className="text-[11px] text-emerald-800">Uploaded</p>}
                  {photo.status === 'error' && <p className="text-[11px] text-rose-700 leading-tight">{photo.error}</p>}
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="aspect-[4/5] rounded-xl border-2 border-dashed border-[#4B1D3F]/25 bg-white hover:bg-[#F3EEF8] hover:border-[#4B1D3F]/45 flex flex-col items-center justify-center gap-1 text-[#4B1D3F] transition-colors cursor-pointer"
                >
                  <ImagePlus className="w-6 h-6" aria-hidden="true" />
                  <span className="text-[11px] font-semibold">Add photo</span>
                </button>
              )}
            </div>
            <input ref={fileInput} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => addPhotos(e.target.files)} />
            <p className="mt-2 text-[13px] text-[#2A1A26]/60">Up to {MAX_PHOTOS} clear photos of the piece, the problem and the tag. They are resized before upload.</p>
          </div>

          <div className="rounded-2xl bg-[#F3EEF8] px-4 py-3 text-sm text-[#2A1A26]/80 leading-relaxed">
            Pieces must be unused and unwashed, with their original tags. Our team reviews every request and emails you the next steps.
            {kind === 'return' && ' Refunds go to your original payment method.'}{' '}
            {onPolicy && <button type="button" onClick={onPolicy} className="underline text-[#4B1D3F] cursor-pointer">Return policy</button>}
          </div>

          {error && (
            <p role="alert" className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> {error}
            </p>
          )}

        </div>
        <div className="grid grid-cols-[auto_1fr] sm:grid-cols-2 gap-2 px-5 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-5 border-t border-[#4B1D3F]/10 bg-[#FBF7F3] sm:rounded-b-3xl">
          <button type="button" onClick={close} disabled={sending} className="sag-btn-outline h-12 px-5 text-xs font-semibold uppercase tracking-[0.12em] cursor-pointer disabled:opacity-60">
            Not now
          </button>
          <button type="submit" disabled={sending} className="sag-btn-primary h-12 px-5 text-xs font-semibold uppercase tracking-[0.12em] inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
            {(sending || uploading) && <Loader2 className="w-4 h-4 animate-spin text-current" />}
            {sending ? 'Sending…' : uploading ? 'Uploading photos…' : 'Send request'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
};
