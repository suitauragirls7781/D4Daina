import type { InstagramReel } from '../types';

// Mirrors the server-side check in api/admin-config.js (sanitizeInstagramReels).
const INSTAGRAM_LINK = /^https?:\/\/(?:www\.)?instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(reel|reels|p|tv)\/([A-Za-z0-9_-]{5,40})/;

/** Returns the canonical reel/post link, or null when the text is not an Instagram reel or post link. */
export const normalizeInstagramUrl = (value: string): { url: string; code: string } | null => {
  const match = value.trim().match(INSTAGRAM_LINK);
  if (!match) return null;
  const type = match[1] === 'reels' ? 'reel' : match[1];
  return { url: `https://www.instagram.com/${type}/${match[2]}/`, code: match[2] };
};

/** Instagram's official, token-free embed player for a reel or post. */
export const instagramEmbedUrl = (reel: InstagramReel) => `${reel.url.replace(/\/?$/, '/')}embed/`;

/** "@handle" and profile link from the store's Instagram URL. */
export const instagramProfile = (instagramUrl?: string) => {
  const match = (instagramUrl || '').match(/instagram\.com\/([A-Za-z0-9_.]+)/);
  // falls back to the store's real handle (same as STORE_INSTAGRAM_URL) when the admin has not set a link
  const handle = match ? match[1] : 'suit_aura_girls';
  return { handle: `@${handle}`, url: `https://www.instagram.com/${handle}/` };
};
