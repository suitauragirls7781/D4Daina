import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Check, ImagePlus, LoaderCircle, Plus, RefreshCw, X } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { Product, ProductSize } from '../types';
import { useDiscovery } from '../utils/discovery';
import { ELEGANT_PLACEHOLDER_SVG, getCleanImageUrl } from '../utils/imageHelper';
import { isAvailable } from '../utils/smartQuery';
import { trackItem } from '../utils/visitorTracker';
import {
  LookBasis, LookError, LookMatch, MAX_PHOTO_BYTES, Palette, colourLabel, isAbortError, prepareLookPalettes, rankLook, readPhotoPalette,
} from '../utils/colourMatch';

type Phase = 'pick' | 'reading' | 'waiting' | 'matching' | 'done' | 'error';
type Problem = 'too-large' | 'unreadable' | 'no-colours' | 'no-products';

const PAGE = 12;
const PLACEHOLDER_NAMES = new Set(['default', 'standard', 'new color', 'new colour']);
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const PROBLEMS: Record<Problem, string> = {
  'too-large': 'This photo is larger than 15 MB. Please choose a smaller photo or a screenshot.',
  unreadable: 'We couldn’t open this file as a photo. Please try a JPG, PNG or WebP image.',
  'no-colours': 'We couldn’t find clear colours in this photo. Try a brighter photo where the outfit fills more of the frame.',
  'no-products': 'Our styles haven’t loaded yet, so there is nothing to compare your photo with. Check your connection and try again.',
};

// Result label when the product photo could not be compared, saying what the match rests on.
const BASIS_LABEL: Record<LookBasis, string> = {
  photo: '',
  listed: 'Compared by listed colour',
  name: 'Matched by colour name',
  none: 'Colour not checked',
};

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/** Opens "Find this look" (only when the Visual search switch is on in Admin → Discovery). */
export const FindThisLookButton: React.FC<{ variant?: 'pill' | 'chip' | 'icon' | 'link'; className?: string }> = ({ variant = 'pill', className = '' }) => {
  const { features } = useDiscovery();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  if (!features.visualSearch) return null;

  const styles = {
    pill: 'aura-btn aura-btn-line aura-btn-sm gap-2',
    chip: 'sag-chip gap-2',
    icon: 'w-[44px] h-[44px] rounded-full flex items-center justify-center text-ink hover:bg-sunken',
    // The caller's own classes only (the shop page's quiet tool link)
    link: '',
  };
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => { if (buttonRef.current?.isConnected) buttonRef.current.focus(); });
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={variant === 'icon' ? 'Find this look: search by the colours in a photo' : undefined}
        title="Search by the colours in a photo"
        className={`${styles[variant]} cursor-pointer ${className}`}
      >
        <Camera className="w-4 h-4" strokeWidth={1.6} />
        {variant !== 'icon' && 'Find this look'}
      </button>
      {open && <FindThisLookDialog onClose={close} />}
    </>
  );
};

/**
 * "Find this look": the shopper adds a photo and gets real styles with matching colours.
 * Honest colour matching on this device (utils/colourMatch.ts): no AI, and the photo is never uploaded.
 */
export const FindThisLookDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { products = [], isLoading, navigateToProduct, setIsSearchOpen } = useShop();
  const [phase, setPhase] = useState<Phase>('pick');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [preview, setPreview] = useState('');
  const [palette, setPalette] = useState<Palette>([]);
  const [focus, setFocus] = useState<number | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [dragging, setDragging] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [ready, setReady] = useState(0);

  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runRef = useRef(0);
  const dragDepth = useRef(0);
  const productsRef = useRef(products);
  const loadingRef = useRef(isLoading);
  const onCloseRef = useRef(onClose);
  const handleFileRef = useRef<(file?: File | null) => void>(() => {});
  productsRef.current = products;
  loadingRef.current = isLoading;
  onCloseRef.current = onClose;

  const fail = (p: Problem) => { setProblem(p); setPhase('error'); };

  // Compare the shopper's colours with every style (photo palettes are cached for the session).
  const match = async (run: number) => {
    const pool = productsRef.current.filter((p) => !p.hidden);
    if (!pool.length) {
      if (loadingRef.current) setPhase('waiting');
      else fail('no-products');
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setProblem(null);
    setProgress({ done: 0, total: 0 });
    setPhase('matching');
    try {
      await prepareLookPalettes(pool, { signal: ctrl.signal, onProgress: (done, total) => { if (run === runRef.current) setProgress({ done, total }); } });
    } catch (e) {
      if (isAbortError(e)) return;
    }
    if (run !== runRef.current) return;
    setReady((n) => n + 1);
    setPhase('done');
  };

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    const run = ++runRef.current;
    abortRef.current?.abort();
    setProblem(null);
    setFocus(null);
    setShown(PAGE);
    setPalette([]);
    setPreview('');
    if (file.size > MAX_PHOTO_BYTES) { fail('too-large'); return; }
    if (file.type && !file.type.startsWith('image/')) { fail('unreadable'); return; }
    setPreview(URL.createObjectURL(file));
    setPhase('reading');
    // The "Choose a photo" button just disappeared; keep keyboard focus inside the dialog.
    requestAnimationFrame(() => { if (!dialogRef.current?.contains(document.activeElement)) dialogRef.current?.focus(); });
    try {
      const colours = await readPhotoPalette(file);
      if (run !== runRef.current) return;
      setPalette(colours);
      trackItem('feature_use', 'visual_search');
      await match(run);
    } catch (e) {
      if (run !== runRef.current) return;
      const code = e instanceof LookError ? e.code : 'UNREADABLE';
      fail(code === 'TOO_LARGE' ? 'too-large' : code === 'NO_COLOURS' ? 'no-colours' : 'unreadable');
    }
  };
  handleFileRef.current = handleFile;

  const retry = () => {
    if (problem === 'no-products' && palette.length) { void match(runRef.current); return; }
    galleryRef.current?.click();
  };

  // The catalogue was still loading (or failed to load) when the photo was read: carry on once it arrives.
  useEffect(() => {
    const stuck = phase === 'waiting' || (phase === 'error' && problem === 'no-products' && palette.length > 0);
    if (!stuck) return;
    if (products.length) void match(runRef.current);
    else if (!isLoading && phase === 'waiting') fail('no-products');
  }, [phase, problem, palette.length, products.length, isLoading]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current(); return; }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    // Desktop: a copied image can be pasted straight in.
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files || []).find((f) => f.type.startsWith('image/'));
      if (file) { e.preventDefault(); handleFileRef.current(file); }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    const frame = requestAnimationFrame(() => {
      (dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]') || dialogRef.current)?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
      document.body.style.overflow = previousOverflow;
      runRef.current += 1;
      abortRef.current?.abort();
    };
  }, []);

  const query = useMemo<Palette>(() => (focus !== null && palette[focus] ? [{ ...palette[focus], weight: 1 }] : palette), [palette, focus]);
  // `ready` changes when newly read product photos are cached, so the ranking uses them.
  const ranked = useMemo(() => (phase === 'done' ? rankLook(query, products) : []), [phase, query, products, ready]);
  const inStock = ranked.filter((m) => isAvailable(m.product));
  const soldOut = ranked.filter((m) => !isAvailable(m.product));
  const closeCount = inStock.filter((m) => m.close).length;
  const soldOutShown = (inStock.length ? soldOut.filter((m) => m.close) : soldOut).slice(0, 4);

  const view = (p: Product) => {
    onClose();
    setIsSearchOpen(false);
    navigateToProduct(p.id);
  };

  // Drops anywhere on the overlay are caught, so a missed drop never opens the image in the tab.
  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); dragDepth.current += 1; setDragging(true); };
  const onDragLeave = () => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = Array.from(e.dataTransfer?.files || []).find((f) => !f.type || f.type.startsWith('image/')) || e.dataTransfer?.files?.[0];
    if (file) void handleFile(file);
  };

  const busy = phase === 'reading' || phase === 'waiting' || phase === 'matching';
  const hasPhoto = Boolean(preview) || palette.length > 0;
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  const summary = phase !== 'done' ? '' : !ranked.length ? 'No styles to show right now.'
    : !inStock.length ? 'Every style is sold out right now. The nearest colours are below.'
      : closeCount ? `${closeCount} ${closeCount === 1 ? 'style' : 'styles'} in stock with close colours.`
        : inStock.every((m) => m.basis === 'none') ? 'We couldn’t check the colours of our styles just now, so these are not sorted by colour.'
          : 'No close colour match — here are the nearest styles in stock.';

  return createPortal(
    <div
      data-aura
      className="fixed inset-0 z-[70] bg-[color:var(--sag-scrim)] flex items-end md:items-center justify-center sag-fade"
      onClick={onClose}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface text-ink rounded-t-[28px] md:rounded-[28px] w-full md:max-w-4xl max-h-[92dvh] flex flex-col overflow-hidden outline-none animate-in slide-in-from-bottom-5 fade-in"
      >
        <span aria-hidden="true" className="md:hidden mx-auto mt-2.5 block h-1 w-10 shrink-0 rounded-full bg-sunken-deep" />
        <div className="flex items-center justify-between gap-3 px-5 sm:px-7 pt-3 md:pt-5 pb-2">
          <h2 id={titleId} className="aura-h2 aura-h-sm">Find this <em>look</em></h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-[44px] h-[44px] shrink-0 rounded-full bg-sunken text-ink hover:bg-sunken-deep flex items-center justify-center cursor-pointer transition-colors"><X className="w-5 h-5" strokeWidth={1.6} /></button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-5 sm:px-7 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <p id={descId} className="text-[14px] leading-[22px] text-ink-muted">
            We match the colours in your photo with real styles in our store. It’s colour matching, not AI, so the print and cut may differ.
            {' '}<span className="text-ink">Your photo stays on this device — it is never uploaded.</span>
          </p>

          <input ref={galleryRef} type="file" accept="image/*" aria-label="Choose a photo" className="hidden" tabIndex={-1}
            onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" aria-label="Take a photo" className="hidden" tabIndex={-1}
            onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = ''; }} />

          {!hasPhoto && (
            <div className={`mt-5 rounded-[22px] border border-dashed px-5 py-8 sm:py-10 text-center transition-colors duration-300 ${dragging ? 'border-brand bg-surface' : 'border-control bg-sunken'}`}>
              <ImagePlus className="w-8 h-8 mx-auto text-ink" strokeWidth={1.4} aria-hidden="true" />
              <p className="aura-h2 aura-h-sm mt-4">Add a photo of a look you <em>love</em></p>
              <p className="mt-2 text-[14px] leading-5 text-ink-muted">A screenshot, a saved picture or a photo you take now.</p>
              <div className="mt-5 flex flex-col sm:flex-row gap-2.5 justify-center">
                <button type="button" data-autofocus onClick={() => galleryRef.current?.click()}
                  className="aura-btn gap-2">
                  <ImagePlus className="w-4 h-4" strokeWidth={1.6} /> Choose a photo
                </button>
                <button type="button" onClick={() => cameraRef.current?.click()}
                  className="md:hidden aura-btn aura-btn-line gap-2">
                  <Camera className="w-4 h-4" strokeWidth={1.6} /> Take a photo
                </button>
              </div>
              <p className="hidden md:block mt-4 text-[14px] text-ink-muted">or drag a photo here, or paste one with Ctrl+V</p>
              <p className="mt-2 text-[13px] text-ink-muted">JPG, PNG or WebP · up to 15 MB</p>
            </div>
          )}

          {hasPhoto && (
            <div className={`mt-5 flex gap-4 items-start rounded-[22px] border p-4 transition-colors duration-300 ${dragging ? 'bg-surface border-brand' : 'bg-sunken border-transparent'}`}>
              {preview && (
                <img src={preview} alt="Your photo" onError={() => setPreview('')}
                  className="w-20 sm:w-28 aspect-[4/5] object-cover rounded-[17px] bg-surface shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="aura-lbl">Colours in your photo</p>
                {palette.length > 0 ? (
                  <>
                    <div role="group" aria-label="Match these colours" className="mt-3 flex flex-wrap gap-2">
                      <button type="button" aria-pressed={focus === null} onClick={() => { setFocus(null); setShown(PAGE); }}
                        className="sag-chip cursor-pointer">
                        All colours
                      </button>
                      {palette.map((c, i) => (
                        <button key={`${c.hex}-${i}`} type="button" aria-pressed={focus === i} onClick={() => { setFocus(focus === i ? null : i); setShown(PAGE); }}
                          title={`${colourLabel(c)} (${c.hex})`}
                          className="sag-chip pl-3 gap-2 cursor-pointer">
                          <span className="w-5 h-5 rounded-full border border-control" style={{ backgroundColor: c.hex }} aria-hidden="true" />
                          {colourLabel(c)}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2.5 text-[13.5px] text-ink-muted">Tap a colour to match only that one.</p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-ink-muted">{phase === 'reading' ? 'Reading the colours…' : 'No colours yet.'}</p>
                )}
                <button type="button" onClick={() => galleryRef.current?.click()} disabled={phase === 'reading'}
                  className="sag-link mt-2 gap-2 text-[14px] disabled:opacity-60">
                  <RefreshCw className="w-4 h-4" strokeWidth={1.6} /> Use another photo
                </button>
              </div>
            </div>
          )}

          <div className="mt-4">
            {busy && (
              <div className="rounded-[22px] bg-sunken p-5">
                <p className="aura-num text-[14.5px] font-medium text-ink flex flex-wrap items-center gap-2">
                  <LoaderCircle className="w-[18px] h-[18px] animate-spin text-ink" aria-hidden="true" />
                  <span role="status">
                    {phase === 'reading' ? 'Reading the colours in your photo…' : phase === 'waiting' ? 'Loading our styles…' : 'Comparing with our styles…'}
                  </span>
                  {phase === 'matching' && progress.total > 0 && <span aria-hidden="true" className="text-ink-muted">{progress.done} of {progress.total} photos</span>}
                </p>
                {phase === 'matching' && progress.total > 0 && (
                  <div className="mt-4 h-1.5 rounded-full bg-sunken-deep overflow-hidden" role="progressbar" aria-label="Comparing with our styles"
                    aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                    <div className="h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            )}
            {problem && (
              <div role="alert" className="rounded-[22px] border border-danger p-5">
                <p className="text-[14px] leading-[21px] text-danger">{PROBLEMS[problem]}</p>
                <button type="button" onClick={retry}
                  className="aura-btn aura-btn-line aura-btn-sm mt-4 gap-2">
                  <RefreshCw className="w-4 h-4" strokeWidth={1.6} /> {problem === 'no-products' ? 'Try again' : 'Choose another photo'}
                </button>
              </div>
            )}
            <p aria-live="polite" className="aura-num text-[18px] leading-6 font-extrabold tracking-[-0.02em] text-ink empty:hidden">{summary}</p>
          </div>

          {phase === 'done' && inStock.length > 0 && (
            <>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {inStock.slice(0, shown).map((m) => <LookResult key={m.product.id} match={m} onView={view} />)}
              </div>
              {inStock.length > shown && (
                <div className="mt-4 text-center">
                  <button type="button" onClick={() => setShown((n) => n + PAGE)}
                    className="aura-btn aura-btn-line aura-btn-sm">
                    Show more styles
                  </button>
                </div>
              )}
            </>
          )}

          {phase === 'done' && soldOutShown.length > 0 && (
            <div className="mt-6">
              <p className="aura-lbl">Sold out right now</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {soldOutShown.map((m) => <LookResult key={m.product.id} match={m} onView={view} />)}
              </div>
            </div>
          )}

          {phase === 'done' && ranked.length > 0 && (
            <p className="mt-6 text-[13.5px] leading-[21px] text-ink-muted">
              Colours look different in different light and on different screens, so please check the product photos before you buy.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

/** One matching style: photo, price, colours, sizes, stock, and real View / Add to bag actions. */
const LookResult: React.FC<{ match: LookMatch; onView: (p: Product) => void }> = ({ match, onView }) => {
  const { addToCart } = useShop();
  const [picking, setPicking] = useState(false);
  const [added, setAdded] = useState(false);
  const p = match.product;
  const available = isAvailable(p);
  const price = Number(p.price) || 0;
  const mrp = Math.max(price, Number(p.originalPrice) || price);
  const stock = Number(p.stockQuantity ?? 0);
  const sizes = (p.sizes || []) as ProductSize[];
  const colours = (p.colors || []).filter((c) => c?.name?.trim() && !PLACEHOLDER_NAMES.has(c.name.trim().toLowerCase()));
  const matched = match.colour && colours.includes(match.colour) ? match.colour : undefined;
  const image = match.image || p.images?.[0] || p.image || '';

  const add = (size: ProductSize) => {
    addToCart(p, size, match.colour || p.colors?.[0], 1, false);
    setPicking(false);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  };
  const onAdd = () => {
    if (!available) return;
    if (sizes.length <= 1) add(sizes[0] || ('Free Size' as ProductSize));
    else setPicking((v) => !v);
  };

  return (
    <article className="rounded-[22px] bg-sunken p-3.5 flex flex-col gap-3.5">
      <div className="flex gap-3.5">
        <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => onView(p)}
          className="shrink-0 w-24 sm:w-28 self-start rounded-[17px] overflow-hidden bg-surface cursor-pointer group">
          <img src={getCleanImageUrl(image, 280)} alt="" loading="lazy" decoding="async"
            onError={(e) => { if (!e.currentTarget.src.startsWith('data:')) e.currentTarget.src = ELEGANT_PLACEHOLDER_SVG; }}
            className={`w-full aspect-[4/5] rounded-none object-cover object-top transition-transform duration-500 group-hover:scale-[1.03] ${available ? '' : 'opacity-70'}`} />
        </button>

        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
          <span className={`aura-lbl self-start text-[12px] ${
            match.close ? 'text-ink' : 'text-ink-muted'}`}>
            {BASIS_LABEL[match.basis] || (match.close ? 'Close colour match' : 'Nearest tone')}
          </span>
          <h3 className="text-[15px] sm:text-[16px] font-bold leading-snug text-ink line-clamp-2">
            <button type="button" onClick={() => onView(p)} className="text-left hover:underline underline-offset-2 focus-visible:underline cursor-pointer">{p.name}</button>
          </h3>
          <p className="aura-num flex items-baseline gap-2 flex-wrap">
            <span className="text-[15.5px] font-bold text-ink">{inr(price)}</span>
            {mrp > price && <span className="text-[13px] text-ink-muted line-through">{inr(mrp)}</span>}
          </p>
          {colours.length > 0 && (
            <p className="text-sm text-ink-muted break-words">
              <span className="text-ink-muted">Colours: </span>
              {colours.map((c, i) => (
                <React.Fragment key={`${c.name}-${i}`}>
                  {i > 0 && ', '}
                  {c === matched ? <strong className="font-bold text-ink">{c.name.trim()}<span className="sr-only"> (closest to your photo)</span></strong> : c.name.trim()}
                </React.Fragment>
              ))}
            </p>
          )}
          {sizes.length > 0 && <p className="text-sm text-ink-muted"><span className="text-ink-muted">Sizes: </span>{sizes.join(', ')}</p>}
          <p className={`aura-num text-[13px] font-bold ${available ? 'text-ok' : 'text-ink-muted'}`}>
            {!available ? 'Sold out' : stock <= 5 ? `Only ${stock} left` : 'In stock'}
          </p>
        </div>
      </div>

      {picking ? (
        <div role="group" aria-label={`Choose a size for ${p.name}`}>
          <p className="text-[13px] text-ink-muted mb-2">Choose a size</p>
          <div className="flex flex-wrap gap-1.5">
            {sizes.map((size) => (
              <button key={size} type="button" onClick={() => add(size)}
                className="sag-chip min-w-[46px] px-3.5 text-[13.5px] cursor-pointer">
                {size}
              </button>
            ))}
            <button type="button" onClick={() => setPicking(false)} aria-label="Cancel size choice"
              className="w-[46px] h-[46px] rounded-full flex items-center justify-center text-ink-muted hover:text-ink cursor-pointer">
              <X className="w-[18px] h-[18px]" strokeWidth={1.6} />
            </button>
          </div>
        </div>
      ) : (
        <div className={`grid gap-2 ${available ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <button type="button" onClick={() => onView(p)}
            className="aura-btn aura-btn-line aura-btn-sm px-2">
            View product
          </button>
          {available && (
            <button type="button" onClick={onAdd}
              className={`aura-btn aura-btn-sm px-2 gap-1 ${added ? 'aura-btn-line' : ''}`}>
              {added ? <><Check className="w-4 h-4" strokeWidth={1.8} /> Added</> : <><Plus className="w-4 h-4" strokeWidth={1.8} /> Add to bag</>}

            </button>
          )}
        </div>
      )}
    </article>
  );
};
