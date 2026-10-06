import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getCleanImageUrl } from './imageHelper';
import { isStoreImageUrl, isStoreVideoUrl, mediaFile, parseMediaUrl, toMediaUrl } from '../lib/media';
import { fromCatalogOrLive } from '../lib/catalog';

/** One Aura Reel (storefront_settings/auraReels is an ordered array of these). */
export interface AuraReel {
  id: string;
  /** The reel's video in the store's storage: https://media.suitauragirls.in/v/reels/<id>/play.mp4 */
  videoUrl: string;
  /** Custom thumbnail (one of the store's photos). Empty = first frame of the video. */
  posterUrl: string;
  caption: string;
  /** Linked product id; empty = no product. */
  productId: string;
  enabled: boolean;
}

// Same rules as sanitizeAuraReels in api/admin-config.js
const PRODUCT_ID = /^[A-Za-z0-9_-]{1,60}$/;
export const MAX_REELS = 50;
export const MAX_CAPTION = 200;

export const isReelVideoUrl = (url: unknown): url is string => typeof url === 'string' && isStoreVideoUrl(url);
export const isCustomPosterImage = (url: string) => isStoreImageUrl(url || '');
const isPosterUrl = (url: string) => isCustomPosterImage(url) || parseMediaUrl(url)?.file === 'poster.jpg';

/** Reel ids are lowercase letters, digits and hyphens (the server strips anything else). */
export const newReelId = () => `reel-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');

/** Keeps only well-formed reels with one of the store's videos, in the saved order. */
export const normaliseReels = (raw: unknown): AuraReel[] => (Array.isArray(raw) ? raw : []).slice(0, MAX_REELS).map((r: any, i: number) => ({
  id: clean(r?.id, 40).replace(/[^a-z0-9-]/gi, '').toLowerCase() || `reel-${i + 1}`,
  videoUrl: isReelVideoUrl(r?.videoUrl) ? toMediaUrl(r.videoUrl) : '',
  posterUrl: isPosterUrl(String(r?.posterUrl || '')) ? toMediaUrl(String(r.posterUrl)) : '',
  caption: clean(r?.caption, MAX_CAPTION),
  productId: PRODUCT_ID.test(String(r?.productId || '')) ? String(r.productId) : '',
  enabled: Boolean(r?.enabled),
})).filter((r) => r.videoUrl);

/** The video a shopper plays: the stored MP4. */
export const reelVideoSrc = (videoUrl: string) => toMediaUrl(videoUrl);

/** Thumbnail: the custom poster, or the first frame stored beside the video when it was uploaded. */
export const reelPosterSrc = (reel: Pick<AuraReel, 'videoUrl' | 'posterUrl'>, width = 480) => {
  if (reel.posterUrl) return isCustomPosterImage(reel.posterUrl) ? getCleanImageUrl(reel.posterUrl, width) : toMediaUrl(reel.posterUrl);
  return mediaFile(reel.videoUrl, 'poster.jpg');
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
