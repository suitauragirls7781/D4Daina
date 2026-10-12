import React, { useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { adminDb as db } from '../../lib/firebase';
import { deleteImages } from '../../lib/dataStore';
import { useShop } from '../../context/ShopContext';
import { useProducts } from '../../context/ProductContext';
import { useRouter } from '../../context/RouterContext';
import { ArrowDown, ArrowUp, Check, Clapperboard, Loader2, Pencil, Trash2, Upload, X } from 'lucide-react';
import { Product } from '../../types';
import {
  AuraReel, MAX_CAPTION, MAX_REELS, isCustomPosterImage, isReelVideoUrl, newReelId, normaliseReels, reelPosterSrc, reelVideoSrc,
} from '../../utils/reels';
import { useDiscovery } from '../../utils/discovery';
import { isAvailable } from '../../utils/smartQuery';
import { ELEGANT_PLACEHOLDER_SVG, getCleanImageUrl } from '../../utils/imageHelper';
import { AdminPageHeader } from './adminShared';
import { makeVideoPoster, putMediaFile, uploadImageWithGrant } from '../../lib/media';
import { CheckRow, Empty, Meter, Panel, Pill, Switch, Tile, Tiles, kit } from './AdminPaymentGateways';

// Sizes in decimal MB, as phones show them
const MB = 1000 * 1000;
// The video is stored and played exactly as it is uploaded (nothing re-encodes it), so it must be an MP4
// that phones play, and small enough to start quickly on mobile data.
const MAX_VIDEO_BYTES = 50 * MB;
const MAX_POSTER_BYTES = 10 * MB;
const VIDEO_TYPES = ['video/mp4'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const CANCELLED = 'UPLOAD_CANCELLED';

const mb = (bytes: number) => `${(bytes / MB).toFixed(1)} MB`;
const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

const videoProblem = (file: File) => {
  if (!VIDEO_TYPES.includes(file.type) && !/\.mp4$/i.test(file.name)) return 'Choose an MP4 video (on an iPhone: Settings → Camera → Formats → Most Compatible, or export the clip as MP4).';
  if (file.size === 0) return 'This video file is empty.';
  if (file.size > MAX_VIDEO_BYTES) return `This video is ${mb(file.size)}. The limit is 50 MB — trim it or export it at a lower resolution (720p or 1080p), then choose it again.`;
  return '';
};
const posterProblem = (file: File) => {
  if (!IMAGE_TYPES.includes(file.type)) return 'The thumbnail must be a JPG, PNG or WebP image.';
  if (file.size > MAX_POSTER_BYTES) return `The thumbnail is ${mb(file.size)}. The limit is 10 MB.`;
  return '';
};

interface UploadResult { secure_url: string; width?: number; height?: number }

/**
 * Upload to the store's own storage (folder "reels"), reporting progress. A video goes up as it is, with its
 * first frame as the thumbnail; a thumbnail photo is resized in the browser first (see src/lib/media.ts).
 */
const uploadReelFile = async (
  file: File,
  resourceType: 'video' | 'image',
  onProgress: (fraction: number) => void,
  xhrRef: React.MutableRefObject<XMLHttpRequest | null>,
): Promise<UploadResult> => {
  const response = await fetch('/api/admin-config?action=media-grant', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder: 'reels', kind: resourceType }),
  });
  const grant = await response.json().catch(() => ({}));
  if (!response.ok || !grant.grant) throw new Error(grant.error || 'Could not start the upload. Please sign in again.');
  if (resourceType === 'image') {
    const url = await uploadImageWithGrant(file, grant);
    onProgress(1);
    return { secure_url: url };
  }
  // The first frame is saved beside the video, so the reel has a thumbnail without anything being made later
  await putMediaFile(grant.grant, 'poster.jpg', await makeVideoPoster(file));
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open('PUT', `/api/media?grant=${encodeURIComponent(grant.grant)}&file=play.mp4`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      xhrRef.current = null;
      let body: any = {};
      try { body = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(body?.error || `Upload failed (error ${xhr.status}). Please try again.`));
    };
    xhr.onerror = () => { xhrRef.current = null; reject(new Error('Network error during upload. Check your connection and try again.')); };
    xhr.onabort = () => { xhrRef.current = null; reject(new Error(CANCELLED)); };
    xhr.send(file);
  });
  return { secure_url: grant.url };
};

const saveReels = async (reels: AuraReel[]) => {
  const response = await fetch('/api/admin-config', {
    method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings: { auraReels: reels } }),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Could not save. Please try again.');
};

// Loads the thumbnail once, so it is in Cloudflare's cache before the first shopper asks for it
const warmUp = (reel: AuraReel) => {
  const img = new Image();
  img.src = reelPosterSrc(reel, 400);
};

const input = kit.field;
const fileInput = 'block w-full text-sm text-ink-muted file:mr-3 file:h-11 file:px-4 file:rounded-full file:border file:border-solid file:border-line file:bg-sunken-deep file:text-ink file:text-sm file:font-medium file:cursor-pointer';
const iconBtn = kit.iconBtn;
const fieldLabel = 'block text-[13px] leading-[18px] font-semibold text-ink-muted';
const textArea = 'sag-input h-auto py-3 resize-none';

const ProgressBar: React.FC<{ label: string; fraction: number; onCancel?: () => void }> = ({ label, fraction, onCancel }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between text-[13px] text-ink-muted sag-num">
      <span>{label}… {Math.round(fraction * 100)}%</span>
      {onCancel && <button type="button" onClick={onCancel} className="min-h-11 px-2 text-danger font-medium hover:underline cursor-pointer">Cancel upload</button>}
    </div>
    <Meter label={label} percent={fraction * 100} />
  </div>
);

/** Search the real catalogue and link one product (or none). */
const ProductPicker: React.FC<{ products: Product[]; byId: Map<string, Product>; value: string; onChange: (id: string) => void }> = ({ products, byId, value, onChange }) => {
  const [query, setQuery] = useState('');
  const selected = value ? byId.get(value) : undefined;
  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    const pool = products.filter((p) => p.productType !== 'accessory');
    const list = term
      ? pool.filter((p) => [p.name, p.sku, p.id, p.category].some((v) => String(v || '').toLowerCase().includes(term)))
      : pool;
    return list.slice(0, 30);
  }, [products, query]);

  return (
    <div className="space-y-2">
      {selected ? (
        <div className="flex items-center gap-2 rounded-[16px] border border-brand-line bg-brand-wash p-2">
          <img src={getCleanImageUrl(selected.images?.[0] || selected.image, 120)} alt="" className="w-9 h-11 rounded-md object-cover object-top bg-sunken" />
          <span className="flex-1 min-w-0 text-sm">
            <span className="block font-medium text-ink line-clamp-1">{selected.name}</span>
            <span className="block text-[13px] text-ink-muted sag-num">{inr(selected.price)}{selected.hidden ? ' · Hidden on store' : isAvailable(selected) ? '' : ' · Sold out'}</span>
          </span>
          <button type="button" onClick={() => onChange('')} aria-label="Remove linked product" className={iconBtn}><X className="w-4 h-4 text-current" /></button>
        </div>
      ) : (
        <p className={kit.hint}>{value ? 'The linked product no longer exists. Pick another or leave empty.' : 'No product linked — the reel plays without shop buttons.'}</p>
      )}
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products by name or SKU" aria-label="Search products" className={input} />
      <ul className="max-h-52 overflow-y-auto grid gap-1">
        {results.length === 0 && <li className="text-[13px] text-ink-muted p-1.5">No products match.</li>}
        {results.map((p) => {
          const on = String(p.id) === value;
          return (
            <li key={p.id}>
              <button type="button" onClick={() => onChange(on ? '' : String(p.id))} aria-pressed={on}
                className={`w-full flex items-center gap-2 text-left text-sm text-ink p-1.5 rounded-full cursor-pointer ${on ? 'bg-brand-wash' : 'hover:bg-sunken-deep'}`}>
                <img src={getCleanImageUrl(p.images?.[0] || p.image, 80)} alt="" loading="lazy" className="w-7 h-9 rounded object-cover object-top bg-sunken" />
                <span className="flex-1 min-w-0 line-clamp-1">{p.name}</span>
                {!isAvailable(p) && <span className="text-[13px] text-danger">Sold out</span>}
                <span className="text-[13px] text-ink-muted sag-num">{inr(p.price)}</span>
                {on && <Check className="w-4 h-4 text-brand" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export const AdminReels: React.FC = () => {
  const { showToast } = useShop();
  const { allProducts = [] } = useProducts();
  const { features } = useDiscovery();
  const { openAdminTab } = useRouter();

  const [list, setList] = useState<AuraReel[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const serverRef = useRef<AuraReel[]>([]);
  const listRef = useRef(list);
  listRef.current = list;

  // New reel form
  const [formKey, setFormKey] = useState(0);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState('');
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [productId, setProductId] = useState('');
  const [showNow, setShowNow] = useState(true);
  const [progress, setProgress] = useState<{ label: string; fraction: number } | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploadNote, setUploadNote] = useState('');
  const [unsaved, setUnsaved] = useState<AuraReel | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  // Editing an existing reel
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ caption: string; productId: string; posterUrl: string }>({ caption: '', productId: '', posterUrl: '' });
  const [posterProgress, setPosterProgress] = useState<number | null>(null);
  const draftPosterRef = useRef('');
  const posterXhrRef = useRef<XMLHttpRequest | null>(null);

  useEffect(() => onSnapshot(doc(db, 'storefront_settings', 'auraReels'), (snap) => {
    let reels: AuraReel[] = [];
    try { reels = normaliseReels(snap.exists() ? JSON.parse(snap.data().value_json || '[]') : []); } catch {}
    serverRef.current = reels;
    if (!savingRef.current) setList(reels);
    setLoadError('');
    setLoaded(true);
  }, (err) => {
    setLoadError(err?.message || 'Could not load reels.');
    setLoaded(true);
  }), []);

  // Local preview of the chosen video
  useEffect(() => {
    if (!videoFile) { setVideoPreview(''); return; }
    const url = URL.createObjectURL(videoFile);
    setVideoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [videoFile]);

  // Leaving the page: stop uploads and delete a thumbnail uploaded in an unsaved edit
  useEffect(() => () => {
    xhrRef.current?.abort();
    posterXhrRef.current?.abort();
    if (draftPosterRef.current) deleteImages([draftPosterRef.current]).catch(() => {});
  }, []);
  const busyUploading = Boolean(progress) || posterProgress !== null;
  useEffect(() => {
    if (!busyUploading) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busyUploading]);

  const productById = useMemo(() => new Map(allProducts.map((p) => [String(p.id), p])), [allProducts]);
  const visibleProducts = useMemo(() => allProducts.filter((p) => !p.hidden), [allProducts]);

  /** Saves the whole list; on failure the list goes back to what the store has. */
  const persist = async (next: AuraReel[], message: string) => {
    const clean = normaliseReels(next);
    savingRef.current = true;
    setSaving(true);
    setList(clean);
    try {
      await saveReels(clean);
      showToast(message, 'success');
      return true;
    } catch (err: any) {
      setList(serverRef.current);
      showToast(err?.message || 'Could not save. Please try again.', 'error');
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  /** Deletes stored files that no reel uses any more. */
  const removeAssets = async (urls: string[], remaining: AuraReel[]) => {
    const inUse = new Set(remaining.flatMap((r) => [r.videoUrl, r.posterUrl]));
    const targets = Array.from(new Set(urls.filter((u) => u && !inUse.has(u))));
    if (targets.length === 0) return;
    try {
      await deleteImages(targets);
    } catch (err: any) {
      showToast(`Saved, but the old file could not be deleted from storage (${err?.message || 'unknown error'}).`, 'info');
    }
  };

  const resetForm = () => {
    setVideoFile(null);
    setPosterFile(null);
    setCaption('');
    setProductId('');
    setShowNow(true);
    setFormKey((k) => k + 1);
  };

  const upload = async () => {
    setUploadError('');
    setUploadNote('');
    if (!videoFile) { setUploadError('Choose a video first.'); return; }
    const problem = videoProblem(videoFile) || (posterFile ? posterProblem(posterFile) : '');
    if (problem) { setUploadError(problem); return; }
    if (listRef.current.length >= MAX_REELS) { setUploadError(`You can have up to ${MAX_REELS} reels. Delete one first.`); return; }

    let videoUrl = '';
    let posterUrl = '';
    try {
      setProgress({ label: 'Uploading video', fraction: 0 });
      const video = await uploadReelFile(videoFile, 'video', (f) => setProgress({ label: 'Uploading video', fraction: f }), xhrRef);
      if (!isReelVideoUrl(video.secure_url)) throw new Error('The video was not saved. Please try again.');
      videoUrl = video.secure_url;
      if (video.width && video.height && video.width > video.height) {
        setUploadNote('This video is landscape. Reels look best filmed vertically (9:16); it will show with bars above and below.');
      }
      if (posterFile) {
        try {
          setProgress({ label: 'Uploading thumbnail', fraction: 0 });
          const image = await uploadReelFile(posterFile, 'image', (f) => setProgress({ label: 'Uploading thumbnail', fraction: f }), xhrRef);
          if (isCustomPosterImage(image.secure_url)) posterUrl = image.secure_url;
        } catch (err: any) {
          if (err?.message === CANCELLED) throw err;
          showToast(`The video uploaded, but the thumbnail failed (${err?.message || 'unknown error'}). Add it later with Edit.`, 'error');
        }
      }
      const reel: AuraReel = { id: newReelId(), videoUrl, posterUrl, caption: caption.trim().slice(0, MAX_CAPTION), productId, enabled: showNow };
      warmUp(reel);
      setProgress({ label: 'Saving', fraction: 1 });
      const ok = await persist([reel, ...listRef.current], showNow ? 'Reel uploaded and live on the store.' : 'Reel uploaded. It stays hidden until you switch it on.');
      if (ok) resetForm();
      else setUnsaved(reel);
    } catch (err: any) {
      if (err?.message === CANCELLED) {
        setUploadError('Upload cancelled.');
        // Don't leave a half-finished reel's files behind
        if (videoUrl || posterUrl) deleteImages([videoUrl, posterUrl].filter(Boolean)).catch(() => {});
      } else {
        setUploadError(err?.message || 'Upload failed. Please try again.');
      }
    } finally {
      setProgress(null);
    }
  };

  const retryUnsaved = async () => {
    if (!unsaved) return;
    if (await persist([unsaved, ...listRef.current], 'Reel saved.')) {
      setUnsaved(null);
      resetForm();
    }
  };
  const discardUnsaved = () => {
    if (!unsaved) return;
    deleteImages([unsaved.videoUrl, unsaved.posterUrl].filter(Boolean)).catch(() => {});
    setUnsaved(null);
  };

  const toggle = (index: number) => {
    const reel = list[index];
    persist(list.map((r, i) => (i === index ? { ...r, enabled: !r.enabled } : r)), reel.enabled ? 'Reel hidden from the store.' : 'Reel is live on the store.');
  };
  const move = (index: number, delta: number) => {
    const j = index + delta;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[index], next[j]] = [next[j], next[index]];
    persist(next, 'Order saved.');
  };
  const remove = async (index: number) => {
    const reel = list[index];
    const customPoster = isCustomPosterImage(reel.posterUrl) ? reel.posterUrl : '';
    if (!window.confirm(`Delete this reel? Its video${customPoster ? ' and thumbnail' : ''} will be permanently deleted. This cannot be undone.`)) return;
    const next = list.filter((_, i) => i !== index);
    if (await persist(next, 'Reel deleted.')) {
      if (editingId === reel.id) closeEditor(false);
      removeAssets([reel.videoUrl, customPoster], next);
    }
  };

  const openEditor = (reel: AuraReel) => {
    if (editingId) closeEditor(false);
    draftPosterRef.current = '';
    setDraft({ caption: reel.caption, productId: reel.productId, posterUrl: reel.posterUrl });
    setEditingId(reel.id);
  };
  /** Closes the editor; a thumbnail uploaded in it but not saved is deleted. */
  const closeEditor = (keepDraftPoster: boolean) => {
    posterXhrRef.current?.abort();
    const uploaded = draftPosterRef.current;
    if (uploaded && !keepDraftPoster) removeAssets([uploaded], listRef.current);
    draftPosterRef.current = '';
    setPosterProgress(null);
    setEditingId(null);
  };
  const replacePoster = async (file: File | undefined) => {
    if (!file) return;
    const problem = posterProblem(file);
    if (problem) { showToast(problem, 'error'); return; }
    try {
      setPosterProgress(0);
      const image = await uploadReelFile(file, 'image', (f) => setPosterProgress(f), posterXhrRef);
      if (!isCustomPosterImage(image.secure_url)) throw new Error('The thumbnail was not saved. Please try again.');
      const previous = draftPosterRef.current;
      draftPosterRef.current = image.secure_url;
      setDraft((d) => ({ ...d, posterUrl: image.secure_url }));
      if (previous) removeAssets([previous], listRef.current);
    } catch (err: any) {
      if (err?.message !== CANCELLED) showToast(err?.message || 'Thumbnail upload failed.', 'error');
    } finally {
      setPosterProgress(null);
    }
  };
  const saveEdit = async (reel: AuraReel) => {
    const next = list.map((r) => (r.id === reel.id ? { ...r, caption: draft.caption.trim().slice(0, MAX_CAPTION), productId: draft.productId, posterUrl: draft.posterUrl } : r));
    if (!(await persist(next, 'Reel updated.'))) return;
    const oldPoster = reel.posterUrl !== draft.posterUrl && isCustomPosterImage(reel.posterUrl) ? reel.posterUrl : '';
    // Keep the thumbnail uploaded here only if it was the one saved
    closeEditor(draftPosterRef.current === draft.posterUrl);
    if (oldPoster) removeAssets([oldPoster], next);
  };

  if (!loaded) return <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-ink" /></div>;

  const liveCount = list.filter((r) => r.enabled).length;
  const linkedCount = list.filter((r) => r.productId && productById.has(r.productId)).length;
  const uploading = Boolean(progress);

  const productStatus = (reel: AuraReel) => {
    if (!reel.productId) return <span className="text-ink-muted">No product linked</span>;
    const p = productById.get(reel.productId);
    if (!p) return <span className="text-danger">Linked product was deleted — plays without shop buttons</span>;
    if (p.hidden) return <span className="text-danger">{p.name} is hidden — plays without shop buttons</span>;
    return <span className="text-ink-muted">{p.name} · {inr(p.price)}{isAvailable(p) ? '' : <span className="text-danger"> · Sold out</span>}</span>;
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Storefront · Video"
        title="Aura Reels"
        icon={<Clapperboard className="text-current" />}
        description="Short vertical videos on the homepage. Link a reel to a product so shoppers can buy straight from it. Changes save and go live immediately."
        actions={
          <Pill role="status" tone={!features.reels ? 'off' : liveCount > 0 ? 'live' : 'off'}>
            {!features.reels ? 'Off in Discovery settings' : liveCount > 0 ? 'Live on the site' : 'No reel switched on'}
          </Pill>
        }
      />

      <Tiles className="lg:!grid-cols-3">
        <Tile label="Reels" value={<>{list.length} <span className="text-base font-medium text-ink-muted">of {MAX_REELS}</span></>} note="The most you can keep" />
        <Tile label="Switched on" value={liveCount} note="Shown to shoppers" />
        <Tile label="Linked to a product" value={linkedCount} note="These show shop buttons" />
      </Tiles>

      {!features.reels && (
        <div className={`${kit.note} flex flex-wrap items-center justify-between gap-3 !text-ink`}>
          <span className="min-w-0 flex-1 basis-60">Aura Reels are switched off in the Discovery settings, so the store is not showing them.</span>
          <button type="button" onClick={() => openAdminTab('discovery')} className={kit.small}>Open Discovery settings</button>
        </div>
      )}
      {loadError && <p role="alert" className={kit.alert}>Could not load reels: {loadError}</p>}

      <Panel
        titleId="add-reel-title"
        title="Add a reel"
        hint="MP4 only, up to 50 MB. The video is shown exactly as you upload it, so export it at 720p for a quick start on mobile data. Film vertically (9:16); for a longer clip, export it at 720p or 1080p. Shoppers get an automatically compressed copy."
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className={fieldLabel}>1. Video</span>
              <input key={`video-${formKey}`} type="file" accept="video/mp4,.mp4" disabled={uploading}
                onChange={(e) => { setVideoFile(e.target.files?.[0] || null); setUploadError(''); setUploadNote(''); }} className={fileInput} />
            </label>
            {videoFile && (
              <div className="flex gap-3 items-start">
                {videoPreview && <video src={videoPreview} muted playsInline controls preload="metadata" className="w-28 aspect-[9/16] rounded-[16px] bg-dark object-contain" />}
                <p className={`text-[13px] leading-[18px] sag-num ${videoProblem(videoFile) ? 'text-danger' : 'text-ink-muted'}`}>{videoFile.name} · {mb(videoFile.size)}{videoProblem(videoFile) ? ` — ${videoProblem(videoFile)}` : ''}</p>
              </div>
            )}
            <label className="block space-y-1.5">
              <span className={fieldLabel}>2. Thumbnail (optional)</span>
              <input key={`poster-${formKey}`} type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading}
                onChange={(e) => setPosterFile(e.target.files?.[0] || null)} className={fileInput} />
              <span className={`block ${kit.hint}`}>Without one, the first frame of the video is used.</span>
            </label>
          </div>
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className={`flex justify-between ${fieldLabel}`}><span>3. Caption (optional)</span><span className="font-normal sag-num">{caption.length}/{MAX_CAPTION}</span></span>
              <textarea value={caption} maxLength={MAX_CAPTION} rows={3} disabled={uploading} onChange={(e) => setCaption(e.target.value)}
                className={textArea} />
            </label>
            <div className="space-y-1.5">
              <span className={fieldLabel}>4. Linked product (optional)</span>
              <ProductPicker products={visibleProducts} byId={productById} value={productId} onChange={setProductId} />
            </div>
            <CheckRow
              label="Show on the store right away"
              hint="Off: the reel is uploaded but stays hidden until you switch it on."
              checked={showNow}
              onChange={setShowNow}
              disabled={uploading}
              onText="Live after upload"
              offText="Hidden after upload"
            />
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {uploadError && <p role="alert" className={kit.alert}>{uploadError}</p>}
          {uploadNote && <p className={kit.note}>{uploadNote}</p>}
          {unsaved && (
            <div role="alert" className={`${kit.alert} flex flex-wrap items-center gap-2`}>
              <span className="flex-1 basis-52">The video uploaded, but the reel list could not be saved.</span>
              <button type="button" onClick={retryUnsaved} disabled={saving} className="sag-btn-primary h-11 px-4 text-sm">Try saving again</button>
              <button type="button" onClick={discardUnsaved} disabled={saving} className={kit.small}>Discard upload</button>
            </div>
          )}
          {progress && <ProgressBar label={progress.label} fraction={progress.fraction} onCancel={progress.label === 'Saving' ? undefined : () => xhrRef.current?.abort()} />}
          <button type="button" onClick={upload} disabled={uploading || saving || !videoFile || Boolean(unsaved)}
            className={`${kit.primary} w-full sm:w-auto`}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin text-current" /> : <Upload className="w-4 h-4 text-current" />} Upload reel
          </button>
        </div>
      </Panel>

      <Panel
        titleId="reel-list-title"
        title="Your reels"
        hint="Shown on the store in this order, top first. Every change here saves by itself."
        action={saving ? <span className="text-[13px] text-ink-muted inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin text-current" /> Saving…</span> : undefined}
      >
        {list.length === 0 ? (
          <Empty icon={<Clapperboard />} title="No reels yet">Upload your first one above — the homepage section appears once at least one reel is switched on.</Empty>
        ) : (
          <ul className="space-y-2">
            {list.map((reel, i) => {
              const open = editingId === reel.id;
              return (
                <li key={`${reel.id}-${i}`} className="rounded-[16px] bg-page">
                  <div className="flex gap-3 p-3">
                    <img src={reelPosterSrc(reel, 160)} alt="" loading="lazy"
                      onError={(e) => { if (!e.currentTarget.src.startsWith('data:')) e.currentTarget.src = ELEGANT_PLACEHOLDER_SVG; }}
                      className="w-16 aspect-[9/16] shrink-0 rounded-[12px] object-cover object-top bg-sunken" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="text-xs leading-4 font-bold uppercase tracking-[0.08em] text-brand sag-num">Reel {i + 1}</span>
                        <Pill tone={reel.enabled ? 'live' : 'off'}>{reel.enabled ? 'Live on the site' : 'Off'}</Pill>
                      </p>
                      <p className="text-sm leading-5 text-ink line-clamp-2">{reel.caption || <span className="text-ink-faint">No caption</span>}</p>
                      <p className="text-[13px] leading-[18px] line-clamp-1 sag-num">{productStatus(reel)}</p>
                      <div className="flex flex-wrap items-center gap-1 pt-1">
                        <span className="inline-flex items-center gap-2 mr-2 text-[13px] text-ink-muted">
                          <Switch checked={reel.enabled} disabled={saving} onChange={() => toggle(i)} label="Show on store" />
                          Show on store
                        </span>
                        <button type="button" onClick={() => move(i, -1)} disabled={saving || i === 0} aria-label="Move up" className={iconBtn}><ArrowUp className="w-4 h-4 text-current" /></button>
                        <button type="button" onClick={() => move(i, 1)} disabled={saving || i === list.length - 1} aria-label="Move down" className={iconBtn}><ArrowDown className="w-4 h-4 text-current" /></button>
                        <button type="button" onClick={() => (open ? closeEditor(false) : openEditor(reel))} disabled={saving} aria-expanded={open} aria-label="Edit reel" className={iconBtn}><Pencil className="w-4 h-4 text-current" /></button>
                        <button type="button" onClick={() => remove(i)} disabled={saving} aria-label="Delete reel" className={kit.iconBtnDanger}><Trash2 className="w-4 h-4 text-current" /></button>
                      </div>
                    </div>
                  </div>

                  {open && (
                    <div className="border-t border-line p-3 sm:p-4 grid gap-4 md:grid-cols-[auto_1fr]">
                      <div className="space-y-2">
                        <video src={reelVideoSrc(reel.videoUrl)} poster={reelPosterSrc({ videoUrl: reel.videoUrl, posterUrl: draft.posterUrl }, 480)} controls playsInline preload="metadata"
                          onError={(e) => { if (e.currentTarget.src !== reel.videoUrl) e.currentTarget.src = reel.videoUrl; }}
                          className="w-40 aspect-[9/16] rounded-[16px] bg-dark object-contain" />
                        <p className={`${kit.hint} w-40`}>Poster shown before the video plays.</p>
                      </div>
                      <div className="space-y-4">
                        <label className="block space-y-1.5">
                          <span className={`flex justify-between ${fieldLabel}`}><span>Caption</span><span className="font-normal sag-num">{draft.caption.length}/{MAX_CAPTION}</span></span>
                          <textarea value={draft.caption} maxLength={MAX_CAPTION} rows={3} onChange={(e) => setDraft((d) => ({ ...d, caption: e.target.value }))}
                            className={textArea} />
                        </label>
                        <div className="space-y-1.5">
                          <span className={fieldLabel}>Thumbnail</span>
                          {posterProgress !== null ? (
                            <ProgressBar label="Uploading thumbnail" fraction={posterProgress} onCancel={() => posterXhrRef.current?.abort()} />
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <label className={`${kit.small} cursor-pointer focus-within:ring-2 focus-within:ring-brand`}>
                                <Upload className="w-4 h-4 text-current" /> Upload new thumbnail
                                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { replacePoster(e.target.files?.[0]); e.target.value = ''; }} />
                              </label>
                              {draft.posterUrl && (
                                <button type="button" onClick={() => setDraft((d) => ({ ...d, posterUrl: '' }))} className={kit.small}>
                                  Use the first frame instead
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <span className={fieldLabel}>Linked product</span>
                          <ProductPicker products={visibleProducts} byId={productById} value={draft.productId} onChange={(id) => setDraft((d) => ({ ...d, productId: id }))} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => saveEdit(reel)} disabled={saving || posterProgress !== null}
                            className="sag-btn-primary h-11 px-5 text-sm gap-2">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin text-current" /> : <Check className="w-4 h-4 text-current" />} Save reel
                          </button>
                          <button type="button" onClick={() => closeEditor(false)} className="sag-btn-outline h-11 px-5 text-sm">Cancel</button>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
};
