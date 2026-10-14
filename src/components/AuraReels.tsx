import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronUp, Heart, Loader2, Play, Share2, Volume2, VolumeX, X } from 'lucide-react';
import { AuraTitle, Icon, useReducedMotion, useScrollFx } from '../aura';
import { useShop } from '../context/ShopContext';
import { Product, ProductColor, ProductSize } from '../types';
import { useDiscovery } from '../utils/discovery';
import { AuraReel, isReelVideoUrl, reelPosterSrc, reelVideoSrc, useAuraReels } from '../utils/reels';
import { isAvailable } from '../utils/smartQuery';
import { ELEGANT_PLACEHOLDER_SVG, getCleanImageUrl } from '../utils/imageHelper';
import { trackItem } from '../utils/visitorTracker';
import { useAdmin } from '../context/AdminContext';
import { STORE_INSTAGRAM_URL } from '../utils/storeContact';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const PLACEHOLDER_COLOURS = new Set(['default', 'standard']);
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const onPosterError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  if (!e.currentTarget.src.startsWith('data:')) e.currentTarget.src = ELEGANT_PLACEHOLDER_SVG;
};

/** Only facts entered for the product: price, real discount, colours, sizes, stock. */
const productFacts = (p: Product) => {
  const price = Number(p.price) || 0;
  const mrp = Math.max(price, Number(p.originalPrice) || price);
  return {
    price,
    mrp,
    discount: mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0,
    colours: (p.colors || []).filter((c) => c && c.name && !PLACEHOLDER_COLOURS.has(c.name.trim().toLowerCase())),
    sizes: (p.sizes || []).map(String).filter(Boolean) as ProductSize[],
    available: isAvailable(p),
  };
};

/** Homepage rail of reel posters; tapping one opens the full-screen vertical viewer. */
export const AuraReelsSection: React.FC = () => {
  const { features } = useDiscovery();
  const { reels } = useAuraReels();
  const { allProducts = [] } = useShop();
  const { storeSettings } = useAdmin();
  const instagramUrl = storeSettings?.instagramUrl || STORE_INSTAGRAM_URL;
  const [viewer, setViewer] = useState<{ reels: AuraReel[]; start: number } | null>(null);
  const tokenRef = useRef<string | null>(null);
  const closingRef = useRef(false);
  const afterCloseRef = useRef<(() => void) | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const live = useMemo(() => reels.filter((r) => r.enabled && isReelVideoUrl(r.videoUrl)), [reels]);
  // allProducts already excludes hidden products, so a hidden/missing product shows no shop actions
  const productById = useMemo(() => new Map(allProducts.map((p) => [String(p.id), p])), [allProducts]);
  const visible = features.reels && live.length > 0;

  // The row leans like a fan: each card turns a little away from the middle of the screen and the whole row
  // drifts sideways as the section passes. Only transforms are written, from the scroll engine's frame (page
  // scroll) and from the row's own sideways scroll; sizes are read when the engine measures, never per frame.
  const sectionRef = useRef<HTMLElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLUListElement>(null);
  const still = useReducedMotion();
  const fan = useRef({ lefts: [] as number[], width: 1, scrolled: 0, shift: 0, vw: 0, frame: 0 });
  const paintFan = () => {
    const row = rowRef.current;
    const f = fan.current;
    if (!row || !f.vw) return;
    for (let i = 0; i < row.children.length; i += 1) {
      const card = row.children[i].firstElementChild as HTMLElement | null;
      if (!card || f.lefts[i] == null) continue;
      const d = (f.lefts[i] + f.width / 2 - f.scrolled + f.shift - f.vw / 2) / f.vw;
      if (Math.abs(d) > 1.3) continue;
      const turn = (-d * 13).toFixed(2);
      const size = (1 - Math.min(Math.abs(d), 1) * 0.1).toFixed(3);
      const next = `perspective(1100px) rotateY(${turn}deg) scale(${size})`;
      if (card.dataset.fan !== next) { card.dataset.fan = next; card.style.transform = next; }
    }
  };
  useScrollFx(sectionRef, ({ enter, vw }) => {
    const f = fan.current;
    const row = rowRef.current;
    if (!row || still) return;
    f.vw = vw;
    const shift = Math.round((0.5 - enter) * Math.min(110, vw * 0.2) * 10) / 10;
    if (shift !== f.shift || !row.style.transform) { f.shift = shift; row.style.transform = `translate3d(${shift}px,0,0)`; }
    paintFan();
  }, [visible, still], {
    measure: () => {
      const row = rowRef.current;
      const f = fan.current;
      if (!row) return;
      f.lefts = Array.from(row.children, (li) => (li as HTMLElement).offsetLeft);
      f.width = (row.children[0] as HTMLElement | undefined)?.offsetWidth || 1;
      f.scrolled = viewRef.current?.scrollLeft || 0;
    },
  });
  const onRowScroll = () => {
    const f = fan.current;
    f.scrolled = viewRef.current?.scrollLeft || 0;
    if (still) return;
    cancelAnimationFrame(f.frame);
    f.frame = requestAnimationFrame(paintFan);
  };
  useEffect(() => () => cancelAnimationFrame(fan.current.frame), []);

  const finishClose = useCallback(() => {
    tokenRef.current = null;
    closingRef.current = false;
    setViewer(null);
    const after = afterCloseRef.current;
    afterCloseRef.current = null;
    if (after) after();
    else openerRef.current?.focus({ preventScroll: true });
  }, []);

  /** Closes the viewer by leaving its history entry, then runs `after` (e.g. open a product page). */
  const close = useCallback((after?: () => void) => {
    // A second tap while closing must not go back one more page
    if (closingRef.current) return;
    closingRef.current = true;
    afterCloseRef.current = after || null;
    const token = tokenRef.current;
    if (!token || window.history.state?.sagReels !== token) {
      finishClose();
      return;
    }
    window.history.back(); // the popstate listener below finishes closing
    // Safety net for browsers that ignore history.back() (some in-app browsers)
    window.setTimeout(() => {
      if (tokenRef.current !== token) return;
      if (window.history.state?.sagReels === token) {
        try { window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`); } catch {}
      }
      finishClose();
    }, 800);
  }, [finishClose]);

  const open = (start: number, opener: HTMLElement) => {
    if (viewer) return;
    openerRef.current = opener;
    const token = `r${Date.now().toString(36)}`;
    tokenRef.current = null;
    closingRef.current = false;
    try {
      // Same page plus #reels, so the phone's Back button closes the viewer instead of leaving the page
      window.history.pushState({ sagReels: token }, '', `${window.location.pathname}${window.location.search}#reels`);
      tokenRef.current = token;
    } catch {}
    setViewer({ reels: live, start });
  };

  // Back button: our history entry was left, so close
  useEffect(() => {
    if (!viewer) return;
    const onPop = () => {
      if (tokenRef.current && window.history.state?.sagReels !== tokenRef.current) finishClose();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [viewer, finishClose]);

  // Reels switched off while someone is watching
  useEffect(() => {
    if (viewer && !features.reels) close();
  }, [features.reels]);

  // A reload while the viewer was open leaves a stale #reels in the address bar
  useEffect(() => {
    if (window.location.hash === '#reels' && !tokenRef.current) {
      try { window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`); } catch {}
    }
  }, []);

  if (!visible) return null;
  const anyProduct = live.some((r) => r.productId && productById.has(r.productId));

  const viewerPortal = viewer && createPortal(
    <ReelsViewer reels={viewer.reels} start={viewer.start} productById={productById} onClose={close} />,
    document.body,
  );

  // The same section at every width, on sand: the title, then a swipe row of ink cards. In each card the 9:16
  // poster and, under it, a row with the round rose play button and the caption. Nothing is drawn on a poster.
  // Only the still poster is shown here; a video loads when a reel is opened.
  return (
    <section ref={sectionRef} id="aura-reels" aria-labelledby="aura-reels-title" data-th="sand" className="aura-rl">
      <AuraTitle
        id="aura-reels-title"
        label="Watch"
        title="Our"
        accent="reels"
        sub={<>Tap a reel to watch{anyProduct ? ' — styles linked to a reel can be shopped right from the video.' : '.'}</>}
        className="aura-rl-hd"
      />
      <div ref={viewRef} onScroll={onRowScroll} className="aura-rl-vp">
        <ul ref={rowRef} className="aura-rl-tr">
          {live.map((reel, i) => {
            const product = reel.productId ? productById.get(reel.productId) : undefined;
            return (
              <li key={`${reel.id}-${i}`} className="aura-rc-li">
                <button
                  type="button"
                  onClick={(e) => open(i, e.currentTarget)}
                  aria-label={`Watch reel${reel.caption ? `: ${reel.caption}` : ''}${product ? ` (${product.name})` : ''}`}
                  className="aura-rc group"
                >
                  {/* Nothing sits on the poster; the play button, caption and product are below it */}
                  <span className="aura-rc-ph aura-sk">
                    <img
                      src={reelPosterSrc(reel, 400)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      onError={onPosterError}
                    />
                  </span>
                  <span aria-hidden="true" className="aura-rc-b">
                    <span className="aura-rc-pl"><Icon name="play" size={12} filled strokeWidth={0} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold leading-[18px]">{reel.caption || 'Watch'}</span>
                      {product && (
                        <span className="aura-num aura-mu block truncate text-[13px] leading-[17px]">
                          {product.name} · {inr(Number(product.price) || 0)}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {instagramUrl && (
        <div className="aura-rl-hd mt-2">
          <a href={instagramUrl} target="_blank" rel="noopener noreferrer" aria-label="View all reels on Instagram" className="aura-lk">
            View all
            <Icon name="arrow" />
          </a>
        </div>
      )}
      {viewerPortal}
    </section>
  );
};

interface ViewerProps {
  reels: AuraReel[];
  start: number;
  productById: Map<string, Product>;
  onClose: (after?: () => void) => void;
}

/** Full-screen vertical reels: swipe or arrow keys; only the reel in view plays. */
const ReelsViewer: React.FC<ViewerProps> = ({ reels, start, productById, onClose }) => {
  const [active, setActive] = useState(start);
  const [muted, setMuted] = useState(true);
  const [picker, setPicker] = useState<string | null>(null);
  const reduced = useMemo(prefersReducedMotion, []);
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const pickerRef = useRef(picker);
  pickerRef.current = picker;

  // Open at the reel that was tapped
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = start * el.clientHeight;
    closeRef.current?.focus({ preventScroll: true });
  }, []);

  // Lock the page behind the viewer
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  // The reel that is at least 60% in view becomes the active (playing) one
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) setActive(Number((entry.target as HTMLElement).dataset.index) || 0);
      });
    }, { root, threshold: [0.6] });
    root.querySelectorAll('[data-reel-slide]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [reels.length]);
  const onScrollFallback = () => {
    const el = scrollerRef.current;
    if (!el || typeof IntersectionObserver !== 'undefined' || !el.clientHeight) return;
    setActive(Math.min(reels.length - 1, Math.max(0, Math.round(el.scrollTop / el.clientHeight))));
  };

  useEffect(() => {
    const reel = reels[active];
    if (reel) trackItem('reel_view', reel.id);
    setPicker(null);
    // Keyboard focus left in a reel that scrolled away moves to the reel now in view
    const focused = document.activeElement as HTMLElement | null;
    const slide = focused?.closest<HTMLElement>('[data-reel-slide]');
    if (slide && Number(slide.dataset.index) !== active) {
      scrollerRef.current?.querySelector<HTMLElement>(`[data-reel-slide][data-index="${active}"] button`)?.focus({ preventScroll: true });
    }
  }, [active]);

  const go = useCallback((index: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const target = Math.max(0, Math.min(reels.length - 1, index));
    el.scrollTo({ top: target * el.clientHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [reels.length, reduced]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (pickerRef.current) setPicker(null);
        else onClose();
        return;
      }
      if (e.key === 'Tab') {
        // Keep keyboard focus inside the viewer (only the reel in view is focusable)
        const dialog = dialogRef.current;
        if (!dialog) return;
        const items = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, textarea'))
          .filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const current = document.activeElement;
        if (e.shiftKey && (current === first || !dialog.contains(current))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (current === last || !dialog.contains(current))) { e.preventDefault(); first.focus(); }
        return;
      }
      if (e.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); go(activeRef.current + 1); }
      else if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); go(activeRef.current - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    // Change the playing video inside the tap itself, so phones allow sound
    const video = scrollerRef.current?.querySelector<HTMLVideoElement>(`video[data-index="${activeRef.current}"]`);
    if (video) video.muted = next;
  };

  // Viewer controls sit over the video: round paper buttons with ink icons
  const iconButton = 'aura-lt w-11 h-11 rounded-full bg-page text-ink flex items-center justify-center cursor-pointer transition-transform duration-300 active:scale-90 motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Aura Reels" className="fixed inset-0 z-[1000] bg-dark sag-fade">
      <div
        ref={scrollerRef}
        onScroll={onScrollFallback}
        className="h-full w-full overflow-y-auto overscroll-contain snap-y snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {reels.map((reel, i) => (
          <ReelSlide
            key={`${reel.id}-${i}`}
            reel={reel}
            index={i}
            total={reels.length}
            isActive={i === active}
            isNear={Math.abs(i - active) <= 1}
            muted={muted}
            autoplay={!reduced}
            product={reel.productId ? productById.get(reel.productId) : undefined}
            pickerOpen={picker === reel.id && i === active}
            onPicker={setPicker}
            onClose={onClose}
          />
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto flex items-center gap-2">
          <button type="button" onClick={toggleMute} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} className={iconButton}>
            {muted ? <VolumeX className="w-5 h-5" strokeWidth={1.6} /> : <Volume2 className="w-5 h-5" strokeWidth={1.6} />}
          </button>
          <span className="aura-num aura-lt flex h-11 items-center rounded-full bg-page px-4 text-[13px] leading-4 font-bold text-ink">
            {active + 1} / {reels.length}
          </span>
        </div>
        <button ref={closeRef} type="button" onClick={() => onClose()} aria-label="Close reels" className={`pointer-events-auto ${iconButton}`}>
          <X className="w-5 h-5" strokeWidth={1.6} />
        </button>
      </div>

      {reels.length > 1 && (
        <div className="hidden md:flex absolute right-6 top-1/2 -translate-y-1/2 flex-col gap-3">
          <button type="button" onClick={() => go(active - 1)} disabled={active === 0} aria-label="Previous reel" className={iconButton}>
            <ChevronUp className="w-5 h-5" strokeWidth={1.6} />
          </button>
          <button type="button" onClick={() => go(active + 1)} disabled={active === reels.length - 1} aria-label="Next reel" className={iconButton}>
            <ChevronDown className="w-5 h-5" strokeWidth={1.6} />
          </button>
        </div>
      )}
    </div>
  );
};

interface SlideProps {
  reel: AuraReel;
  index: number;
  total: number;
  isActive: boolean;
  /** The reel in view and its neighbours get a video element (metadata only); the rest show the poster. */
  isNear: boolean;
  muted: boolean;
  autoplay: boolean;
  product?: Product;
  pickerOpen: boolean;
  onPicker: (reelId: string | null) => void;
  onClose: (after?: () => void) => void;
}

const ReelSlide: React.FC<SlideProps> = ({ reel, index, total, isActive, isNear, muted, autoplay, product, pickerOpen, onPicker, onClose }) => {
  const { addToCart, toggleWishlist, isInWishlist, navigateToProduct, setIsCartDrawerOpen } = useShop();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState(() => reelVideoSrc(reel.videoUrl));
  const [failed, setFailed] = useState(false);
  const [wantPlay, setWantPlay] = useState(autoplay);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const poster = useMemo(() => reelPosterSrc(reel, 720), [reel.videoUrl, reel.posterUrl]);
  const facts = product ? productFacts(product) : null;
  const [pickedColour, setColour] = useState<ProductColor | undefined>();
  // The shopper's pick while it still exists on the product, otherwise its first colour
  const colour = facts?.colours.find((c) => c.name === pickedColour?.name) || facts?.colours[0];
  const tab = isActive ? 0 : -1;

  // The source is set here (not as a prop) so it can be dropped when the reel scrolls away
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isNear) return;
    video.src = src;
    return () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      setPlaying(false);
    };
  }, [isNear, src]);

  // Only the reel in view plays; the others pause and rewind
  useEffect(() => {
    const video = videoRef.current;
    if (!isActive) {
      setWantPlay(autoplay);
      setJustAdded(false);
      if (video) {
        video.pause();
        try { video.currentTime = 0; } catch {}
      }
      return;
    }
    if (!video || failed) return;
    video.muted = muted;
    if (wantPlay) video.play().catch((err) => { if (err?.name !== 'AbortError') setWantPlay(false); });
    else video.pause();
  }, [isActive, isNear, wantPlay, src, failed]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted, isNear]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!isActive || failed || !video) return;
    if (video.paused) {
      setWantPlay(true);
      video.play().catch((err) => { if (err?.name !== 'AbortError') setWantPlay(false); });
    } else {
      setWantPlay(false);
      video.pause();
    }
  };

  const onVideoError = () => {
    // The optimised copy failed (e.g. still processing): try the original upload once
    if (src !== reel.videoUrl) setSrc(reel.videoUrl);
    else setFailed(true);
  };

  const share = async () => {
    const url = product ? `${window.location.origin}/product/${product.id}` : `${window.location.origin}/`;
    const title = product ? product.name : 'Suit Aura Girls';
    const text = product ? `${product.name} on Suit Aura Girls` : reel.caption || 'Suit Aura Girls';
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`, '_blank', 'noopener');
  };

  const sizeOptions = facts ? (facts.sizes.length > 0 ? facts.sizes : ['Free Size' as ProductSize]) : [];
  const needsChoice = Boolean(facts && (facts.sizes.length > 1 || facts.colours.length > 1));

  const add = (size: ProductSize) => {
    if (!product || !facts?.available) return;
    trackItem('reel_click', reel.id);
    addToCart(product, size, colour || product.colors?.[0], 1, false);
    onPicker(null);
    setJustAdded(true);
  };
  const onAdd = () => {
    if (!facts?.available) return;
    if (needsChoice) onPicker(pickerOpen ? null : reel.id);
    else add(sizeOptions[0]);
  };
  const shopNow = () => {
    if (!product) return;
    trackItem('reel_click', reel.id);
    onClose(() => navigateToProduct(product));
  };

  const showSpinner = isActive && wantPlay && !failed && (!playing || buffering);
  const showPlayButton = isActive && !wantPlay && !failed;
  const fav = product ? isInWishlist(product.id) : false;
  const roundButton = 'w-12 h-12 shrink-0 rounded-full bg-sunken text-ink flex items-center justify-center transition-transform duration-300 active:scale-90 motion-reduce:transition-none cursor-pointer';
  const legend = 'mb-2 text-[13px] leading-[18px] font-bold text-ink';

  return (
    <section
      data-reel-slide
      data-index={index}
      aria-roledescription="slide"
      aria-label={`Reel ${index + 1} of ${total}`}
      aria-hidden={isActive ? undefined : true}
      className="h-full w-full snap-start snap-always flex justify-center"
    >
      <div className="h-full w-full md:max-w-[460px] flex flex-col">
        <button
          type="button"
          onClick={togglePlay}
          tabIndex={tab}
          aria-label={failed ? 'This video cannot play right now' : wantPlay ? 'Pause reel' : 'Play reel'}
          className="relative flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden cursor-pointer"
        >
          {isNear ? (
            <video
              ref={videoRef}
              data-index={index}
              poster={poster}
              muted={muted}
              playsInline
              loop
              preload={isActive ? 'auto' : 'metadata'}
              disablePictureInPicture
              onPlaying={() => { setPlaying(true); setBuffering(false); }}
              onPause={() => setPlaying(false)}
              onWaiting={() => setBuffering(true)}
              onCanPlay={() => setBuffering(false)}
              onError={onVideoError}
              className="h-full w-full object-contain"
            />
          ) : (
            <img src={poster} alt="" loading="lazy" decoding="async" onError={onPosterError} className="h-full w-full object-contain" />
          )}
          {showSpinner && (
            <span className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
              <Loader2 className="w-8 h-8 text-on-dark animate-spin" />
            </span>
          )}
          {showPlayButton && (
            <span className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
              <span className="aura-on-rose w-16 h-16 rounded-full bg-accent text-ink flex items-center justify-center">
                <Play className="w-7 h-7 fill-current translate-x-0.5" />
              </span>
            </span>
          )}
          {failed && (
            <span className="absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-[22px] bg-surface px-5 py-4 text-[15px] leading-[1.4] font-semibold text-ink text-center">
              This video can’t play right now. Please try again later.
            </span>
          )}
        </button>

        <div className="shrink-0 bg-surface text-ink rounded-t-[28px] rounded-b-none md:rounded-b-[28px] md:mb-4 px-5 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3.5">
          {reel.caption && <p className="text-[15px] leading-[1.45] text-ink-muted line-clamp-3">{reel.caption}</p>}

          {product && facts ? (
            <>
              <div className="flex gap-3">
                <img
                  src={getCleanImageUrl(product.images?.[0] || product.image, 160)}
                  alt=""
                  loading="lazy"
                  onError={onPosterError}
                  className="w-14 h-[74px] shrink-0 rounded-[14px]! object-cover object-top bg-sunken"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] leading-5 font-bold text-ink line-clamp-1">{product.name}</p>
                  <p className="sag-num mt-0.5 flex flex-wrap items-baseline gap-x-2">
                    <span className="text-base leading-5 font-extrabold text-ink">{inr(facts.price)}</span>
                    {facts.mrp > facts.price && <span className="text-[13px] text-ink-faint line-through">{inr(facts.mrp)}</span>}
                    {facts.discount > 0 && <span className="text-[13px] font-bold text-sale">{facts.discount}% off</span>}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] leading-4 text-ink-muted">
                    {facts.colours.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        {facts.colours.slice(0, 4).map((c) => (
                          <span key={c.name} aria-hidden="true" title={c.name} className="w-3.5 h-3.5 rounded-full border border-line" style={{ background: c.hex || 'var(--color-sunken-deep)' }} />
                        ))}
                        <span className="ml-0.5">
                          {facts.colours.slice(0, 2).map((c) => c.name).join(', ')}{facts.colours.length > 2 ? ` +${facts.colours.length - 2}` : ''}
                        </span>
                      </span>
                    )}
                    {facts.sizes.length > 0 && <span>{facts.sizes.length === 1 ? 'Size' : 'Sizes'}: {facts.sizes.join(', ')}</span>}
                    <span className={facts.available ? 'text-ok font-semibold' : 'text-ink-muted font-semibold'}>{facts.available ? 'In stock' : 'Sold out'}</span>
                  </p>
                </div>
              </div>

              {pickerOpen && (
                <div id={`reel-options-${index}`} className="rounded-[18px] bg-sunken p-3.5 space-y-3 sag-pop">
                  {facts.colours.length > 1 && (
                    <fieldset>
                      <legend className={legend}>Colour: {colour?.name}</legend>
                      <div className="flex flex-wrap gap-2">
                        {facts.colours.map((c) => (
                          <button
                            key={c.name}
                            type="button"
                            tabIndex={tab}
                            onClick={() => setColour(c)}
                            aria-pressed={colour?.name === c.name}
                            className="sag-chip h-11 min-w-0 px-3.5 gap-2 text-[14px] font-semibold"
                          >
                            <span className="w-4 h-4 rounded-full border border-line" style={{ background: c.hex || 'var(--color-sunken-deep)' }} aria-hidden="true" />
                            {c.name}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  <fieldset>
                    <legend className={legend}>Tap a size to add</legend>
                    <div className="flex flex-wrap gap-2">
                      {sizeOptions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          tabIndex={tab}
                          onClick={() => add(s)}
                          className="sag-chip h-11 min-w-11 px-3.5 text-[14px] font-semibold"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </div>
              )}

              {justAdded && (
                <p role="status" className="flex items-center gap-2 text-[14px] leading-5 font-bold text-ok">
                  <Check className="w-[18px] h-[18px] text-ok" aria-hidden="true" /> Added to your bag.
                  <button type="button" tabIndex={tab} onClick={() => onClose(() => setIsCartDrawerOpen(true))} className="sag-link px-1">
                    View bag
                  </button>
                </p>
              )}

              <div className="flex items-center gap-1.5">
                <button type="button" tabIndex={tab} onClick={shopNow} className="sag-btn-primary h-12 flex-1 px-3 whitespace-nowrap">
                  Shop now
                </button>
                <button
                  type="button"
                  tabIndex={tab}
                  onClick={onAdd}
                  disabled={!facts.available}
                  aria-expanded={needsChoice ? pickerOpen : undefined}
                  aria-controls={needsChoice && pickerOpen ? `reel-options-${index}` : undefined}
                  className="sag-btn-outline h-12 flex-1 px-3 whitespace-nowrap"
                >
                  {facts.available ? 'Add to bag' : 'Sold out'}
                </button>
                <button
                  type="button"
                  tabIndex={tab}
                  onClick={() => toggleWishlist(product)}
                  aria-pressed={fav}
                  aria-label={fav ? 'Remove from wishlist' : 'Add to wishlist'}
                  className={roundButton}
                >
                  <Heart className={`w-[21px] h-[21px] ${fav ? 'fill-accent text-accent' : ''}`} strokeWidth={1.6} />
                </button>
                <button type="button" tabIndex={tab} onClick={share} aria-label="Share this style" className={roundButton}>
                  <Share2 className="w-[21px] h-[21px]" strokeWidth={1.6} />
                </button>
              </div>
            </>
          ) : (
            <div className="flex justify-end">
              <button type="button" tabIndex={tab} onClick={share} className="sag-btn-outline h-11 px-5 gap-2 text-sm">
                <Share2 className="w-[18px] h-[18px]" strokeWidth={1.75} aria-hidden="true" /> Share
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
