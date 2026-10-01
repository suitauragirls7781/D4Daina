import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getCleanImageUrl } from './imageHelper';
import { fromCatalogOrLive } from '../lib/catalog';

/** One Aura Reel (storefront_settings/auraReels is an ordered array of these). */
export interface AuraReel {
  id: string;
  /** Cloudinary delivery URL: https://res.cloudinary.com/<cloud>/video/upload/... */
  videoUrl: string;
  /** Custom thumbnail (Cloudinary image or video URL). Empty = first frame of the video. */
  posterUrl: string;
  caption: string;
  /** Linked product id; empty = no product. */
  productId: string;
  enabled: boolean;
}

// Same rules as sanitizeAuraReels in api/admin-config.js
export const CLOUDINARY_VIDEO = /^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/video\/upload\/[^\s"'<>]+$/;
const CLOUDINARY_ASSET = /^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/(image|video)\/upload\/[^\s"'<>]+$/;
const PRODUCT_ID = /^[A-Za-z0-9_-]{1,60}$/;
export const MAX_REELS = 50;
export const MAX_CAPTION = 200;

export const isReelVideoUrl = (url: unknown): url is string => typeof url === 'string' && CLOUDINARY_VIDEO.test(url);
export const isCustomPosterImage = (url: string) => /^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/image\/upload\//.test(url || '');

/** Reel ids are lowercase letters, digits and hyphens (the server strips anything else). */
export const newReelId = () => `reel-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');

/** Keeps only well-formed reels with a Cloudinary video, in the saved order. */
export const normaliseReels = (raw: unknown): AuraReel[] => (Array.isArray(raw) ? raw : []).slice(0, MAX_REELS).map((r: any, i: number) => ({
  id: clean(r?.id, 40).replace(/[^a-z0-9-]/gi, '').toLowerCase() || `reel-${i + 1}`,
  videoUrl: isReelVideoUrl(r?.videoUrl) ? r.videoUrl : '',
  posterUrl: CLOUDINARY_ASSET.test(String(r?.posterUrl || '')) ? String(r.posterUrl) : '',
  caption: clean(r?.caption, MAX_CAPTION),
  productId: PRODUCT_ID.test(String(r?.productId || '')) ? String(r.productId) : '',
  enabled: Boolean(r?.enabled),
})).filter((r) => r.videoUrl);

/**
 * Inserts a Cloudinary transformation right after /video/upload/ and swaps the file extension.
 * URLs that already carry a transformation keep it (ours is chained in front of it).
 */
const transformVideoUrl = (url: string, transformation: string, extension: string) => {
  const marker = '/video/upload/';
  const [path, query] = url.split('?');
  const at = path.indexOf(marker);
  if (at === -1) return url;
  const base = path.slice(0, at + marker.length);
  const rest = path.slice(at + marker.length);
  const slash = rest.lastIndexOf('/');
  const file = rest.slice(slash + 1);
  const renamed = file.includes('.') ? file.replace(/\.[^.]+$/, `.${extension}`) : `${file}.${extension}`;
  return `${base}${transformation}/${rest.slice(0, slash + 1)}${renamed}${query ? `?${query}` : ''}`;
};

const hasTransformation = (url: string) => {
  const rest = url.split('/video/upload/')[1] || '';
  return !/^(v\d+\/|suitauragirls\/)/.test(rest);
};

/**
 * Phone-friendly delivery: automatic quality and codec, at most 720px wide, as MP4 so
 * .mov and .webm uploads play in every browser. A URL that already has a transformation
 * is used as it is. (The viewer falls back to the original upload if this copy fails.)
 * Made on the fly, which Cloudinary's Free plan allows only up to 40 MB, so AdminReels caps uploads there.
 */
export const reelVideoSrc = (videoUrl: string, width = 720) =>
  hasTransformation(videoUrl) ? videoUrl : transformVideoUrl(videoUrl, `q_auto,vc_auto,c_limit,w_${width}`, 'mp4');

/** Thumbnail: the custom poster, or the first frame of the video (so_0) as an image. */
export const reelPosterSrc = (reel: Pick<AuraReel, 'videoUrl' | 'posterUrl'>, width = 480) => {
  if (reel.posterUrl) {
    return isCustomPosterImage(reel.posterUrl) ? getCleanImageUrl(reel.posterUrl, width) : reel.posterUrl;
  }
  return transformVideoUrl(reel.videoUrl, `so_0,f_auto,q_auto,c_limit,w_${width}`, 'jpg');
};

// One shared live listener for the storefront (like useDiscovery)
let cache: AuraReel[] = [];
let loadedOnce = false;
const listeners = new Set<(reels: AuraReel[]) => void>();
let started = false;
const start = () => {
  if (started) return;
  started = true;
  fromCatalogOrLive(
    (catalog) => {
      try { cache = normaliseReels(catalog.settings.auraReels || []); } catch { cache = []; }
      loadedOnce = true;
      listeners.forEach((fn) => fn(cache));
    },
    () => onSnapshot(doc(db, 'storefront_settings', 'auraReels'), (snap) => {
      try { cache = normaliseReels(snap.exists() ? JSON.parse(snap.data().value_json || '[]') : []); } catch { cache = []; }
      loadedOnce = true;
      listeners.forEach((fn) => fn(cache));
    }, () => {
      loadedOnce = true;
      listeners.forEach((fn) => fn(cache));
    }),
  );
};

/** Live list of all saved reels (enabled or not), in the admin's order. */
export const useAuraReels = () => {
  const [value, setValue] = useState<{ reels: AuraReel[]; loaded: boolean }>({ reels: cache, loaded: loadedOnce });
  useEffect(() => {
    const update = (reels: AuraReel[]) => setValue({ reels, loaded: true });
    start();
    listeners.add(update);
    if (loadedOnce) update(cache);
    return () => { listeners.delete(update); };
  }, []);
  return value;
};
