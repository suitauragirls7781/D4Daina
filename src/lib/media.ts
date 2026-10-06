// The store's photos and reel videos (Cloudflare R2, read from https://media.suitauragirls.in).
// Nothing is resized on the fly: the browser that uploads a photo makes every size first, so each upload is
// small and every shopper gets a file that fits their screen. The server side is api/_lib/media.js.
//
//   photo  …/i/<folder>/<id>/w160.webp … w1600.webp, j480.jpg, j1200.jpg   (saved address: …/w1100.webp)
//   reel   …/v/<folder>/<id>/play.mp4, poster.jpg                           (saved address: …/play.mp4)

export const MEDIA_BASE = 'https://media.suitauragirls.in/';
export const IMAGE_WIDTHS = [160, 320, 480, 640, 828, 1100, 1600] as const;
const MAX_SIDE = 8000;

export interface MediaGrant {
  grant: string;
  kind: 'image' | 'video';
  folder: string;
  id: string;
  files: string[];
  /** The address to save once every file is uploaded. */
  url: string;
}

const MEDIA_PATH = /^(i|v)\/([a-z-]+)\/([A-Za-z0-9_-]{6,48})\/([a-z0-9]+\.(?:webp|jpg|mp4|mov|webm))$/;
// A link saved while the photos were on the old image host: …/image/upload/[sizes/][v123/]suitauragirls/<folder>/<id>.<ext>
const OLD_HOST_LINK = /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\/(?:[^/]+\/)*?(?:suitauragirls\/([a-z-]+)\/)?([A-Za-z0-9_-]{6,48})\.[a-z0-9]+(?:\?.*)?$/i;

/**
 * The store's own address of a photo or reel. Links saved before the move (in an old order, a bag kept on
 * a phone) are turned into the same file's new address; anything else comes back unchanged.
 */
export const toMediaUrl = (value: string): string => {
  const url = String(value || '').trim();
  if (!url.startsWith('https://res.cloudinary.com/')) return url;
  const match = url.match(OLD_HOST_LINK);
  if (!match) return url;
  const folder = match[2] || 'misc';
  return match[1].toLowerCase() === 'video' ? `${MEDIA_BASE}v/${folder}/${match[3]}/play.mp4` : `${MEDIA_BASE}i/${folder}/${match[3]}/w1100.webp`;
};

/** The parts of one of the store's media addresses, or null. */
export const parseMediaUrl = (value: string) => {
  const url = toMediaUrl(value);
  if (!url.startsWith(MEDIA_BASE)) return null;
  const match = url.slice(MEDIA_BASE.length).match(MEDIA_PATH);
  return match ? { kind: match[1] === 'v' ? 'video' as const : 'image' as const, folder: match[2], id: match[3], file: match[4] } : null;
};

export const isStoreMediaUrl = (value: string) => parseMediaUrl(value) !== null;
export const isStoreVideoUrl = (value: string) => { const parsed = parseMediaUrl(value); return Boolean(parsed && parsed.kind === 'video' && parsed.file === 'play.mp4'); };
export const isStoreImageUrl = (value: string) => { const parsed = parseMediaUrl(value); return Boolean(parsed && parsed.kind === 'image'); };

/** Another stored file of the same photo or reel (mediaFile(url, 'poster.jpg')). Other URLs come back unchanged. */
export const mediaFile = (value: string, file: string) => {
  const parsed = parseMediaUrl(value);
  return parsed ? `${MEDIA_BASE}${parsed.kind === 'video' ? 'v' : 'i'}/${parsed.folder}/${parsed.id}/${file}` : value;
};

/** The stored photo that is at least `width` wide (the widest one when none is). Other URLs come back unchanged. */
export const mediaImage = (value: string, width = 828) => {
  const parsed = parseMediaUrl(value);
  if (!parsed || parsed.kind !== 'image') return toMediaUrl(value);
  const fit = IMAGE_WIDTHS.find((stored) => stored >= width) || IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1];
  return `${MEDIA_BASE}i/${parsed.folder}/${parsed.id}/w${fit}.webp`;
};

// ---- Making the sizes in the browser ------------------------------------------------------------------------

const loadBitmap = async (file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> => {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Falls through to an <img> (some browsers cannot make a bitmap from every format)
    }
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('This photo could not be opened. Please use a JPG, PNG or WebP photo.'));
      el.src = objectUrl;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(objectUrl) };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
};

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('This photo could not be prepared.'))), type, quality);
});

/**
 * Every stored file of one photo, made from the picked file: seven WebP widths and two JPEGs. A photo
 * narrower than a width is never stretched (that file is simply the photo at its own size).
 */
export const makeImageFiles = async (file: Blob, files: string[]): Promise<Array<{ name: string; blob: Blob }>> => {
  const picture = await loadBitmap(file);
  try {
    if (!picture.width || !picture.height) throw new Error('This photo could not be opened.');
    const out: Array<{ name: string; blob: Blob }> = [];
    for (const name of files) {
      const match = name.match(/^([wj])(\d+)\.(webp|jpg)$/);
      if (!match) continue;
      const jpeg = match[3] === 'jpg';
      const scale = Math.min(1, Number(match[2]) / picture.width, MAX_SIDE / picture.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(picture.width * scale));
      canvas.height = Math.max(1, Math.round(picture.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This photo could not be prepared.');
      if (jpeg) { context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); }
      context.imageSmoothingQuality = 'high';
      context.drawImage(picture.source, 0, 0, canvas.width, canvas.height);
      let blob = await toBlob(canvas, jpeg ? 'image/jpeg' : 'image/webp', jpeg ? 0.82 : Number(match[2]) <= 320 ? 0.74 : 0.8);
      // A browser that cannot write WebP answers with a PNG: send a JPEG instead (the server accepts it under the same name)
      if (!jpeg && blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.82);
      out.push({ name, blob });
      canvas.width = 0;
    }
    return out;
  } finally {
    picture.close();
  }
};

/** Sends one prepared file. `onProgress` gets the bytes sent so far (used for the reel video bar). */
export const putMediaFile = (grant: string, name: string, blob: Blob, onProgress?: (sent: number) => void) => new Promise<void>((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  xhr.open('PUT', `/api/media?grant=${encodeURIComponent(grant)}&file=${encodeURIComponent(name)}`);
  xhr.timeout = 10 * 60 * 1000;
  xhr.upload.onprogress = (event) => onProgress?.(event.loaded);
  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) { resolve(); return; }
    let message = 'The upload failed. Please try again.';
    try { message = JSON.parse(xhr.responseText).error || message; } catch { /* keep the default */ }
    reject(new Error(message));
  };
  xhr.onerror = () => reject(new Error('The upload failed. Please check your connection and try again.'));
  xhr.ontimeout = () => reject(new Error('The upload took too long. Please try again.'));
  xhr.send(blob);
});

/** Makes every size of a photo and uploads them with the grant. Returns the address to save. */
export const uploadImageWithGrant = async (file: Blob, grant: MediaGrant): Promise<string> => {
  const prepared = await makeImageFiles(file, grant.files);
  // Three at a time keeps a phone connection steady
  const queue = [...prepared];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) await putMediaFile(grant.grant, next.name, next.blob);
  };
  await Promise.all([worker(), worker(), worker()]);
  return grant.url;
};

/** First frame of a video as a JPEG, at most 720px wide (the reel's poster). */
export const makeVideoPoster = (file: Blob) => new Promise<Blob>((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  const done = (result: Blob | Error) => { URL.revokeObjectURL(objectUrl); video.removeAttribute('src'); video.load(); if (result instanceof Error) reject(result); else resolve(result); };
  const timer = window.setTimeout(() => done(new Error('The video could not be read. Please use an MP4 video.')), 20000);
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.onerror = () => { window.clearTimeout(timer); done(new Error('The video could not be read. Please use an MP4 video.')); };
  video.onloadeddata = () => { video.currentTime = Math.min(0.1, (video.duration || 1) / 2); };
  video.onseeked = () => {
    window.clearTimeout(timer);
    const scale = Math.min(1, 720 / (video.videoWidth || 720));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((video.videoWidth || 720) * scale));
    canvas.height = Math.max(1, Math.round((video.videoHeight || 1280) * scale));
    const context = canvas.getContext('2d');
    if (!context) { done(new Error('The video could not be read.')); return; }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => done(blob || new Error('The video could not be read.')), 'image/jpeg', 0.82);
  };
  video.src = objectUrl;
});
