/**
 * Image helper utility for Suit Aura Girls
 * Ensures image URLs are clean, valid, and properly formatted.
 */

// Elegant Brand SVG Placeholder (Soft Boutique Ivory + Artisan Gold Emblem)
// Used when an image is loading, missing, or broken — NEVER shows stock model photos!
export const ELEGANT_PLACEHOLDER_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000"><rect width="800" height="1000" fill="%23FAF5EB"/><rect x="20" y="20" width="760" height="960" rx="16" fill="none" stroke="%23B8935A" stroke-width="1.5" stroke-dasharray="8 6" opacity="0.3"/><circle cx="400" cy="460" r="90" fill="%233D0F1F" opacity="0.06"/><circle cx="400" cy="460" r="70" fill="none" stroke="%23B8935A" stroke-width="2" opacity="0.35"/><text x="50%" y="468" dominant-baseline="middle" text-anchor="middle" font-family="serif" font-size="22" font-weight="bold" fill="%233D0F1F" letter-spacing="3" opacity="0.4">AURA</text><text x="50%" y="580" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="600" fill="%23B8935A" letter-spacing="4" opacity="0.6">SUIT AURA GIRLS</text></svg>`;

export const getCleanImageUrl = (url: string | undefined | null, targetWidth?: number): string => {
  if (!url || typeof url !== 'string' || url.trim() === '' || url.includes('placeholder.com')) {
    return ELEGANT_PLACEHOLDER_SVG;
  }
  
  let cleanUrl = url.trim();

  // If it's a JSON array string e.g. "[\"https://...\"]", extract first URL
  if (cleanUrl.startsWith('["') || cleanUrl.startsWith("['")) {
    try {
      const parsed = JSON.parse(cleanUrl);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
        cleanUrl = parsed[0].trim();
      }
    } catch {}
  }

  // Handle data URIs or relative paths
  if (cleanUrl.startsWith('data:image/') || cleanUrl.startsWith('/')) {
    return cleanUrl;
  }

  // Serve Cloudinary originals resized, in the best format and quality for the browser.
  const cloudinaryUpload = '/image/upload/';
  if (cleanUrl.startsWith('https://res.cloudinary.com/') && cleanUrl.includes(cloudinaryUpload)) {
    const [base, rest] = cleanUrl.split(cloudinaryUpload);
    const hasTransform = !/^(v\d+\/|suitauragirls\/)/.test(rest);
    if (!hasTransform) {
      return `${base}${cloudinaryUpload}f_auto,q_auto,c_limit,w_${targetWidth || 960}/${rest}`;
    }
    return cleanUrl;
  }

  // Optimize Unsplash image loading speed & cross-browser compatibility (Android, iOS, WebViews)
  if (cleanUrl.includes('images.unsplash.com')) {
    try {
      const urlObj = new URL(cleanUrl);
      urlObj.searchParams.set('auto', 'format');
      urlObj.searchParams.set('fit', 'crop');
      
      urlObj.searchParams.set('w', String(targetWidth || 960));
      urlObj.searchParams.set('q', '75');
      return urlObj.toString();
    } catch (e) {
      return cleanUrl;
    }
  }

  return cleanUrl;
};

/**
 * Returns a publicly shareable URL for WhatsApp, social media, and direct link sharing.
 * Automatically converts private dev editor origins (ais-dev-) to public shared app origins (ais-pre-).
 */
export const getShareableUrl = (productId?: string): string => {
  if (typeof window === 'undefined') return '';
  let origin = window.location.origin;
  if (origin.includes('ais-dev-')) {
    origin = origin.replace('ais-dev-', 'ais-pre-');
  }
  return productId ? `${origin}/?product=${productId}` : origin;
};
