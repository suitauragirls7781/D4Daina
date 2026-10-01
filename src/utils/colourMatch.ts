import { Product, ProductColor } from '../types';
import { getCleanImageUrl } from './imageHelper';
import { COLOUR_FAMILIES, isAvailable, productColourFamilies } from './smartQuery';

/**
 * "Find this look": honest colour matching, no AI. A photo is shrunk on a canvas, its main
 * colours are found with k-means in CIELAB, and real products are ranked by how close the colours
 * in their own photos are (CIEDE2000 with the textile lightness weighting). Everything runs in the
 * browser; the shopper's photo is never uploaded anywhere.
 */

export type Lab = [number, number, number];

export interface PaletteColour {
  lab: Lab;
  hex: string;
  /** Share of the photo (after the background is removed); a palette's weights add up to 1. */
  weight: number;
  /** Nearest COLOUR_FAMILIES name, for display chips. */
  family: string;
}

export type Palette = PaletteColour[];

export interface LookMatch {
  product: Product;
  /** Average colour difference (CIEDE2000); lower is closer. */
  distance: number;
  /** True when the colours are genuinely close, not just the nearest we have. */
  close: boolean;
  /** Colour variant whose photo matched best (when the product has per-colour photos). */
  colour?: ProductColor;
  /** Photo the match was made on. */
  image: string;
  /**
   * What the match rests on: 'photo' = the product photo was compared; 'listed' = the photo could
   * not be read, so the listed colour swatches (or names that differ from the photo) were compared;
   * 'name' = no readable photo or swatch, but a listed colour name shares a colour family with the
   * photo; 'none' = nothing about the product's colour could be checked.
   */
  basis: LookBasis;
}

export type LookBasis = 'photo' | 'listed' | 'name' | 'none';

export type LookErrorCode = 'TOO_LARGE' | 'UNREADABLE' | 'NO_COLOURS';
export class LookError extends Error {
  code: LookErrorCode;
  constructor(code: LookErrorCode) { super(code); this.code = code; }
}

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
/** Average CIEDE2000 difference at or below which two outfits read as the same colours. */
export const CLOSE_MATCH = 16;

const PHOTO_SIDE = 160;
const THUMB_WIDTH = 96;
const THUMB_SIDE = 120;
const MAX_THUMBS = 360;
const PARALLEL = 6;
const THUMB_TIMEOUT_MS = 12000;
const FAMILY_BONUS = 2;
const SESSION_KEY = 'sag_look_palettes_v1';

// ---------------------------------------------------------------------------------------------
// Colour maths
// ---------------------------------------------------------------------------------------------

const LINEAR = Array.from({ length: 256 }, (_, i) => {
  const v = i / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});

const labF = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

export const rgbToLab = (r: number, g: number, b: number): Lab => {
  const R = LINEAR[Math.max(0, Math.min(255, Math.round(r)))];
  const G = LINEAR[Math.max(0, Math.min(255, Math.round(g)))];
  const B = LINEAR[Math.max(0, Math.min(255, Math.round(b)))];
  const fx = labF((R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047);
  const fy = labF(R * 0.2126729 + G * 0.7151522 + B * 0.072175);
  const fz = labF((R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

export const hexToRgb = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

const chroma = (lab: Lab) => Math.hypot(lab[1], lab[2]);
const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * CIEDE2000 colour difference. `kL = 2` is the textile setting: a shade lighter or darker (photo
 * lighting, fabric sheen) matters half as much as a change of hue or saturation.
 */
export const deltaE = (x: Lab, y: Lab, kL = 2) => {
  const [L1, a1, b1] = x;
  const [L2, a2, b2] = y;
  const Cm = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1 = Math.hypot(a1p, b1);
  const C2 = Math.hypot(a2p, b2);
  const hue = (a: number, b: number) => {
    if (a === 0 && b === 0) return 0;
    const d = (Math.atan2(b, a) * 180) / Math.PI;
    return d < 0 ? d + 360 : d;
  };
  const h1 = hue(a1p, b1);
  const h2 = hue(a2p, b2);
  let dh = 0;
  if (C1 * C2 !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dL = L2 - L1;
  const dC = C2 - C1;
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin(rad(dh / 2));
  const Lm = (L1 + L2) / 2;
  const Cmp = (C1 + C2) / 2;
  let hm = h1 + h2;
  if (C1 * C2 !== 0) {
    if (Math.abs(h1 - h2) > 180) hm += h1 + h2 < 360 ? 360 : -360;
    hm /= 2;
  }
  const T = 1 - 0.17 * Math.cos(rad(hm - 30)) + 0.24 * Math.cos(rad(2 * hm)) + 0.32 * Math.cos(rad(3 * hm + 6)) - 0.2 * Math.cos(rad(4 * hm - 63));
  const dTheta = 30 * Math.exp(-(((hm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const Sc = 1 + 0.045 * Cmp;
  const Sh = 1 + 0.015 * Cmp * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
  const l = dL / (kL * Sl);
  const c = dC / Sc;
  const h = dH / Sh;
  return Math.sqrt(l * l + c * c + h * h + Rt * c * h);
};

// ---------------------------------------------------------------------------------------------
// Colour families (the same names shoppers use in search: see COLOUR_FAMILIES in smartQuery)
// ---------------------------------------------------------------------------------------------

const FAMILY_SWATCHES: Record<string, string[]> = {
  Pink: ['#FFC0CB', '#F4A7B9', '#F7E4EA', '#FF69B4', '#E75480', '#FF1493', '#E0218A', '#C71585', '#FFCBA4'],
  Red: ['#FF0000', '#C8102E', '#B22222', '#8B0000', '#800000', '#800020', '#722F37'],
  Orange: ['#FFA500', '#FF8C00', '#FF7F50', '#FF9933', '#CC5500', '#B7410E'],
  Yellow: ['#FFFF00', '#FFF44F', '#FFDB58', '#F4D03F', '#E1AD01'],
  Gold: ['#D4AF37', '#C5A46D', '#CFB53B', '#B8860B'],
  Green: ['#008000', '#50C878', '#2E8B57', '#006A4E', '#808000', '#556B2F', '#98FF98', '#93C572', '#9CAF88'],
  Blue: ['#0000FF', '#4169E1', '#5F86D1', '#000080', '#1B2138', '#87CEEB', '#79B6E8', '#008080', '#40E0D0', '#00CED1'],
  Purple: ['#800080', '#4B0082', '#8F00FF', '#9966CC', '#C8A2D8', '#C8A2C8', '#E0B0FF', '#E6E6FA', '#8E4585', '#4B1D3F', '#915F6D'],
  White: ['#FFFFFF', '#FFFFF0', '#FFFDD0', '#FAF9F6', '#F8F8FF', '#EAE0C8'],
  Black: ['#000000', '#1C1C1C', '#241D1B', '#101820'],
  Grey: ['#808080', '#A9A9A9', '#C0C0C0', '#D3D3D3', '#5A5A5A', '#36454F'],
  Beige: ['#F5F5DC', '#E3BC9A', '#D2B48C', '#C19A6B', '#C3B091', '#A0785A', '#964B00', '#6F4E37'],
};

let familyAnchors: Array<{ family: string; lab: Lab }> | null = null;

/** Nearest colour-family name for a colour (e.g. "Pink", "Blue", "Beige"). */
export const familyOf = (lab: Lab) => {
  if (chroma(lab) < 5) return lab[0] >= 82 ? 'White' : lab[0] <= 22 ? 'Black' : 'Grey';
  if (!familyAnchors) {
    familyAnchors = Object.entries(FAMILY_SWATCHES).flatMap(([family, hexes]) =>
      hexes.map((hex) => { const [r, g, b] = hexToRgb(hex)!; return { family, lab: rgbToLab(r, g, b) }; }));
  }
  let best = familyAnchors[0];
  let bestD = Infinity;
  for (const anchor of familyAnchors) {
    const d = deltaE(lab, anchor.lab, 1);
    if (d < bestD) { bestD = d; best = anchor; }
  }
  return best.family;
};

const NEUTRAL = new Set(['White', 'Black', 'Grey', 'Beige', 'Gold']);

/** Chip text for a detected colour, e.g. "Light Pink", "Deep Blue", "White". */
export const colourLabel = (c: PaletteColour) => {
  if (NEUTRAL.has(c.family)) return c.family;
  if (c.lab[0] >= 78) return `Light ${c.family.toLowerCase()}`;
  if (c.lab[0] <= 32) return `Deep ${c.family.toLowerCase()}`;
  return c.family;
};

/** Families named in one colour name ("SKY Blue " → ["Blue"]). */
export const familiesOfName = (name: string) => {
  const text = String(name || '').toLowerCase();
  return Object.entries(COLOUR_FAMILIES).filter(([, words]) => words.some((w) => new RegExp(`\\b${w}\\b`).test(text))).map(([f]) => f);
};

// Placeholder swatches the admin form / importer fill in when no real colour was picked.
const PLACEHOLDER_NAMES = new Set(['', 'default', 'standard', 'new color', 'new colour']);
const PLACEHOLDER_HEX = new Set(['#241D1B', '#9A6A3A', '#211C1A', '#D8C8B8']);

/** True when a product colour has a name and swatch the admin actually chose. */
export const isRealColour = (c?: ProductColor) =>
  Boolean(c && !PLACEHOLDER_NAMES.has(String(c.name || '').trim().toLowerCase()) && hexToRgb(c.hex) && !PLACEHOLDER_HEX.has(String(c.hex).trim().toUpperCase()));

// ---------------------------------------------------------------------------------------------
// Palette extraction
// ---------------------------------------------------------------------------------------------

interface Point { lab: Lab; r: number; g: number; b: number; w: number; border: number; inner: number; }

// Skin shows in most model photos; it counts for less so the outfit decides the palette.
// The same rule runs on the shopper's photo and on product photos, so the comparison stays fair.
const isSkinLike = (lab: Lab) => {
  const C = chroma(lab);
  if (lab[0] < 30 || lab[0] > 88 || C < 10 || C > 45) return false;
  const h = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;
  return h >= 20 && h <= 80;
};

// Clustering distance: lightness counts less, so folds and shadows of one fabric stay one colour.
const clusterDist = (x: Lab, y: Lab) => {
  const dL = (x[0] - y[0]) * 0.6;
  const da = x[1] - y[1];
  const db = x[2] - y[2];
  return dL * dL + da * da + db * db;
};

const sq = (x: number) => x * x;

/**
 * Plain backdrop (studio wall, sheet, sky): colours that cover much of the photo's edge are grown
 * inwards over smooth neighbouring pixels and stop at the outline of the outfit. Returns null when
 * nothing looks like a backdrop, or when the "backdrop" would swallow the middle of the photo
 * (a fabric close-up, or an outfit the same colour as the wall).
 */
const findBackdrop = (labs: Float32Array, opaque: Uint8Array, width: number, height: number): Uint8Array | null => {
  const band = Math.max(1, Math.round(Math.min(width, height) * 0.04));
  const groups: Array<{ L: number; a: number; b: number; n: number }> = [];
  const edge: number[] = [];
  const groupOf = new Int16Array(width * height).fill(-1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!(x < band || x >= width - band || y < band || y >= height - band)) continue;
      const p = y * width + x;
      if (!opaque[p]) continue;
      const L = labs[p * 3], a = labs[p * 3 + 1], b = labs[p * 3 + 2];
      let gi = -1;
      let best = Infinity;
      groups.forEach((g, i) => { const d = sq((g.L - L) * 0.5) + sq(g.a - a) + sq(g.b - b); if (d < best) { best = d; gi = i; } });
      if (gi < 0 || (best > 100 && groups.length < 12)) { groups.push({ L, a, b, n: 0 }); gi = groups.length - 1; }
      const g = groups[gi];
      g.L += (L - g.L) / (g.n + 1); g.a += (a - g.a) / (g.n + 1); g.b += (b - g.b) / (g.n + 1); g.n += 1;
      groupOf[p] = gi;
      edge.push(p);
    }
  }
  if (edge.length < 8) return null;
  const backdrop = groups.map((g) => g.n >= edge.length * 0.15);
  if (!backdrop.some(Boolean)) return null;

  const mask = new Uint8Array(width * height);
  const owner = new Int16Array(width * height).fill(-1);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  for (const p of edge) {
    const g = groups[groupOf[p]];
    if (!backdrop[groupOf[p]]) continue;
    if (sq((labs[p * 3] - g.L) * 0.5) + sq(labs[p * 3 + 1] - g.a) + sq(labs[p * 3 + 2] - g.b) > 100) continue;
    mask[p] = 1;
    owner[p] = groupOf[p];
    queue[tail++] = p;
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    const y = (p - x) / width;
    const g = groups[owner[p]];
    const next = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
    for (const q of next) {
      if (q < 0 || mask[q] || !opaque[q]) continue;
      const step = sq(labs[q * 3] - labs[p * 3]) + sq(labs[q * 3 + 1] - labs[p * 3 + 1]) + sq(labs[q * 3 + 2] - labs[p * 3 + 2]);
      if (step > 25) continue; // an edge: the outline of the outfit or the model
      if (sq((labs[q * 3] - g.L) * 0.5) + sq(labs[q * 3 + 1] - g.a) + sq(labs[q * 3 + 2] - g.b) > 196) continue;
      mask[q] = 1;
      owner[q] = owner[p];
      queue[tail++] = q;
    }
  }

  let opaqueCount = 0, removed = 0, inner = 0, innerRemoved = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (!opaque[p]) continue;
      opaqueCount += 1;
      removed += mask[p];
      if (x >= width * 0.25 && x < width * 0.75 && y >= height * 0.2 && y < height * 0.85) { inner += 1; innerRemoved += mask[p]; }
    }
  }
  if (!removed || removed > opaqueCount * 0.8 || (inner && innerRemoved > inner * 0.6)) return null;
  return mask;
};

/**
 * Main colours of an RGBA pixel buffer. A plain backdrop is removed first (see findBackdrop); then
 * the outer frame is compared with the middle of the photo, and a colour that fills the frame but
 * hardly appears in the middle (a busy wall, trees, floor) is left out too, unless it is most of
 * the photo (a fabric close-up).
 */
export const paletteFromPixels = (data: ArrayLike<number>, width: number, height: number, maxColours = 5): Palette => {
  const bx = Math.max(1, Math.round(width * 0.1));
  const by = Math.max(1, Math.round(height * 0.1));
  const ix0 = width * 0.25, ix1 = width * 0.75, iy0 = height * 0.2, iy1 = height * 0.85;
  const bins = new Map<number, { n: number; r: number; g: number; b: number; w: number; border: number; inner: number }>();
  let borderTotal = 0;
  let innerTotal = 0;

  const labs = new Float32Array(width * height * 3);
  const opaque = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) {
    if (data[p * 4 + 3] < 128) continue; // transparent (cut-out PNG backgrounds)
    opaque[p] = 1;
    const lab = rgbToLab(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
    labs[p * 3] = lab[0]; labs[p * 3 + 1] = lab[1]; labs[p * 3 + 2] = lab[2];
  }
  const backdrop = findBackdrop(labs, opaque, width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;
      if (!opaque[p]) continue;
      const border = x < bx || x >= width - bx || y < by || y >= height - by;
      const inner = x >= ix0 && x < ix1 && y >= iy0 && y < iy1;
      if (border) borderTotal += 1;
      if (inner) innerTotal += 1;
      if (backdrop?.[p]) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      let bin = bins.get(key);
      if (!bin) { bin = { n: 0, r: 0, g: 0, b: 0, w: 0, border: 0, inner: 0 }; bins.set(key, bin); }
      bin.n += 1;
      bin.r += r; bin.g += g; bin.b += b;
      bin.w += inner ? 1.4 : border ? 0.6 : 1; // the outfit is usually in the middle of the frame
      if (border) bin.border += 1;
      if (inner) bin.inner += 1;
    }
  }
  if (!bins.size) return [];

  const points: Point[] = [];
  bins.forEach((bin) => {
    const r = bin.r / bin.n, g = bin.g / bin.n, b = bin.b / bin.n;
    const lab = rgbToLab(r, g, b);
    points.push({ lab, r, g, b, w: bin.w * (isSkinLike(lab) ? 0.5 : 1), border: bin.border, inner: bin.inner });
  });

  // Weighted k-means with a deterministic "far and heavy" start, so one photo always gives one answer.
  const k = Math.min(7, points.length);
  const centres: Lab[] = [];
  let first = points[0];
  points.forEach((p) => { if (p.w > first.w) first = p; });
  centres.push([...first.lab] as Lab);
  while (centres.length < k) {
    let pick: Point | null = null;
    let score = -1;
    for (const p of points) {
      let d = Infinity;
      for (const c of centres) d = Math.min(d, clusterDist(p.lab, c));
      if (p.w * d > score) { score = p.w * d; pick = p; }
    }
    if (!pick || score <= 0) break;
    centres.push([...pick.lab] as Lab);
  }

  const assign = new Int32Array(points.length).fill(-1);
  for (let iter = 0; iter < 12; iter++) {
    let changed = false;
    points.forEach((p, idx) => {
      let best = 0;
      let bestD = Infinity;
      centres.forEach((c, ci) => { const d = clusterDist(p.lab, c); if (d < bestD) { bestD = d; best = ci; } });
      if (assign[idx] !== best) { assign[idx] = best; changed = true; }
    });
    if (!changed) break;
    const sums = centres.map(() => [0, 0, 0, 0]);
    points.forEach((p, idx) => { const s = sums[assign[idx]]; s[0] += p.lab[0] * p.w; s[1] += p.lab[1] * p.w; s[2] += p.lab[2] * p.w; s[3] += p.w; });
    sums.forEach((s, ci) => { if (s[3] > 0) centres[ci] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
  }

  let clusters = centres.map(() => ({ w: 0, r: 0, g: 0, b: 0, border: 0, inner: 0 }));
  points.forEach((p, idx) => {
    const c = clusters[assign[idx]];
    c.w += p.w; c.r += p.r * p.w; c.g += p.g * p.w; c.b += p.b * p.w; c.border += p.border; c.inner += p.inner;
  });
  clusters = clusters.filter((c) => c.w > 0);

  const total = clusters.reduce((s, c) => s + c.w, 0);
  const isBackground = (c: typeof clusters[number]) => {
    const borderShare = borderTotal ? c.border / borderTotal : 0;
    const innerShare = innerTotal ? c.inner / innerTotal : 0;
    return borderShare >= 0.25 && innerShare < borderShare * 0.5;
  };
  const kept = clusters.filter((c) => !isBackground(c));
  const keptWeight = kept.reduce((s, c) => s + c.w, 0);
  const chosen = keptWeight >= total * 0.2 ? kept : clusters;

  let colours = chosen.map((c) => {
    const r = c.r / c.w, g = c.g / c.w, b = c.b / c.w;
    return { lab: rgbToLab(r, g, b), r, g, b, w: c.w };
  }).sort((a, b) => b.w - a.w);

  // Merge colours that read as the same (e.g. a fabric and its shadow).
  const merged: typeof colours = [];
  colours.forEach((c) => {
    const twin = merged.find((m) => deltaE(m.lab, c.lab) < 6);
    if (!twin) { merged.push({ ...c }); return; }
    const w = twin.w + c.w;
    twin.r = (twin.r * twin.w + c.r * c.w) / w;
    twin.g = (twin.g * twin.w + c.g * c.w) / w;
    twin.b = (twin.b * twin.w + c.b * c.w) / w;
    twin.w = w;
    twin.lab = rgbToLab(twin.r, twin.g, twin.b);
  });
  colours = merged.sort((a, b) => b.w - a.w);

  const sum = colours.reduce((s, c) => s + c.w, 0) || 1;
  const significant = colours.filter((c) => c.w / sum >= 0.04).slice(0, maxColours);
  const sigSum = significant.reduce((s, c) => s + c.w, 0) || 1;
  return significant.map((c) => ({ lab: c.lab, hex: toHex(c.r, c.g, c.b), weight: c.w / sigSum, family: familyOf(c.lab) }));
};

/**
 * Colour distance between two palettes: a greedy earth mover's distance. Each colour's share is
 * moved to the closest colour of the other palette, so a product that is mostly green with a pink
 * border does not count as a pink match.
 */
export const paletteDistance = (a: Palette, b: Palette) => {
  if (!a.length || !b.length) return 100;
  const pairs: Array<[number, number, number]> = [];
  a.forEach((x, i) => b.forEach((y, j) => pairs.push([deltaE(x.lab, y.lab), i, j])));
  pairs.sort((p, q) => p[0] - q[0]);
  const sa = a.reduce((s, c) => s + c.weight, 0) || 1;
  const sb = b.reduce((s, c) => s + c.weight, 0) || 1;
  const ra = a.map((c) => c.weight / sa);
  const rb = b.map((c) => c.weight / sb);
  let cost = 0;
  let moved = 0;
  for (const [d, i, j] of pairs) {
    const m = Math.min(ra[i], rb[j]);
    if (m <= 1e-9) continue;
    cost += m * d;
    moved += m;
    ra[i] -= m;
    rb[j] -= m;
    if (moved >= 0.9999) break;
  }
  return moved > 0 ? cost / moved : 100;
};

// ---------------------------------------------------------------------------------------------
// Browser helpers (canvas)
// ---------------------------------------------------------------------------------------------

let sharedCanvas: HTMLCanvasElement | null = null;
const pixelsOf = (source: CanvasImageSource, width: number, height: number, maxSide: number) => {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  if (!sharedCanvas) sharedCanvas = document.createElement('canvas');
  sharedCanvas.width = w;
  sharedCanvas.height = h;
  const ctx = sharedCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new LookError('UNREADABLE');
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  try {
    return { data: ctx.getImageData(0, 0, w, h).data, w, h };
  } catch (e) {
    sharedCanvas = null; // SecurityError: the image was not CORS-enabled and tainted this canvas
    throw e;
  }
};

const loadImage = (src: string, crossOrigin: boolean, signal?: AbortSignal, timeoutMs = 0) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    let timer = 0;
    const finish = () => { window.clearTimeout(timer); signal?.removeEventListener('abort', onAbort); img.onload = null; img.onerror = null; };
    const onAbort = () => { finish(); img.src = ''; reject(new DOMException('Aborted', 'AbortError')); };
    img.onload = () => { finish(); resolve(img); };
    img.onerror = () => { finish(); reject(new Error('IMAGE_LOAD_FAILED')); };
    if (signal?.aborted) { onAbort(); return; }
    signal?.addEventListener('abort', onAbort, { once: true });
    if (timeoutMs) timer = window.setTimeout(() => { finish(); img.src = ''; reject(new Error('IMAGE_TIMEOUT')); }, timeoutMs);
    img.src = src;
  });

export const isAbortError = (e: unknown) => (e as { name?: string })?.name === 'AbortError';

/** Reads the shopper's photo on this device only and returns its main colours. */
export const readPhotoPalette = async (file: Blob): Promise<Palette> => {
  if (file.size > MAX_PHOTO_BYTES) throw new LookError('TOO_LARGE');
  if (file.type && !file.type.startsWith('image/')) throw new LookError('UNREADABLE');
  let pixels: { data: ArrayLike<number>; w: number; h: number } | null = null;
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      try { pixels = pixelsOf(bitmap, bitmap.width, bitmap.height, PHOTO_SIDE); } finally { bitmap.close?.(); }
    } catch { pixels = null; }
  }
  if (!pixels) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url, false);
      if (!img.naturalWidth || !img.naturalHeight) throw new LookError('UNREADABLE');
      pixels = pixelsOf(img, img.naturalWidth, img.naturalHeight, PHOTO_SIDE);
    } catch (e) {
      throw e instanceof LookError ? e : new LookError('UNREADABLE');
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const palette = paletteFromPixels(pixels.data, pixels.w, pixels.h);
  if (!palette.length) throw new LookError('NO_COLOURS');
  return palette;
};

// ---------------------------------------------------------------------------------------------
// Product palettes (cached in memory and for the browser session, keyed by image URL)
// ---------------------------------------------------------------------------------------------

type Stored = Array<[number, number, number, number, string]>;
const memory = new Map<string, Palette>();
let sessionRead = false;

const readSession = () => {
  if (sessionRead) return;
  sessionRead = true;
  try {
    const raw = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}') as Record<string, Stored>;
    Object.entries(raw || {}).forEach(([url, list]) => {
      if (!Array.isArray(list) || !list.length || memory.has(url)) return;
      memory.set(url, list.map(([L, a, b, weight, hex]) => ({ lab: [L, a, b] as Lab, weight, hex, family: familyOf([L, a, b]) })));
    });
  } catch {}
};

const writeSession = () => {
  try {
    const out: Record<string, Stored> = {};
    let n = 0;
    memory.forEach((palette, url) => {
      if (n++ >= 800) return;
      out[url] = palette.map((c) => [+c.lab[0].toFixed(1), +c.lab[1].toFixed(1), +c.lab[2].toFixed(1), +c.weight.toFixed(3), c.hex]);
    });
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(out));
  } catch {}
};

const paletteFromUrl = async (url: string, signal?: AbortSignal) => {
  const img = await loadImage(getCleanImageUrl(url, THUMB_WIDTH), true, signal, THUMB_TIMEOUT_MS);
  const { data, w, h } = pixelsOf(img, img.naturalWidth || THUMB_WIDTH, img.naturalHeight || THUMB_SIDE, THUMB_SIDE);
  return paletteFromPixels(data, w, h);
};

const cleanUrl = (u?: string) => (typeof u === 'string' ? u.trim() : '');

interface Candidate { image: string; colour?: ProductColor; }

/**
 * Photos compared for a product: its main photo, plus one photo per colour variant for styles
 * that can be bought (a lavender kurti that also comes in sky blue matches a sky-blue photo).
 */
const candidatesFor = (p: Product): Candidate[] => {
  const colours = (p.colors || []).filter((c) => c && typeof c.name === 'string');
  const main = cleanUrl((p.images || []).find((u) => cleanUrl(u))) || cleanUrl(p.image);
  const list: Candidate[] = [];
  if (main) list.push({ image: main, colour: colours.find((c) => cleanUrl(c.imageUrl) === main) });
  if (isAvailable(p)) {
    colours.forEach((c) => {
      const img = cleanUrl(c.imageUrl);
      if (img && list.length < 4 && !list.some((x) => x.image === img)) list.push({ image: img, colour: c });
    });
  }
  return list;
};

/** Image URLs to analyse, styles that can be bought first, capped so a big catalogue stays light. */
const lookImageUrls = (products: Product[]) => {
  const ordered = [...products].sort((a, b) => Number(isAvailable(b)) - Number(isAvailable(a)));
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const p of ordered) {
    for (const c of candidatesFor(p)) {
      if (seen.has(c.image)) continue;
      seen.add(c.image);
      urls.push(c.image);
      if (urls.length >= MAX_THUMBS) return urls;
    }
  }
  return urls;
};

/**
 * Makes sure the product photos have palettes, loading small thumbnails (6 at a time). Photos that
 * cannot be read fall back to the product's colour names and swatches when ranking.
 */
export const prepareLookPalettes = async (
  products: Product[],
  opts: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
) => {
  readSession();
  const urls = lookImageUrls(products);
  const todo = urls.filter((u) => !memory.has(u));
  let done = urls.length - todo.length;
  opts.onProgress?.(done, urls.length);
  if (!todo.length) return;
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const url = todo[next++];
      try {
        const palette = await paletteFromUrl(url, opts.signal);
        if (palette.length) memory.set(url, palette);
      } catch (e) {
        if (isAbortError(e)) throw e;
      }
      done += 1;
      opts.onProgress?.(done, urls.length);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(PARALLEL, todo.length) }, worker));
  } finally {
    writeSession();
  }
};

const swatchPalette = (colours: ProductColor[]): Palette => {
  const real = colours.filter(isRealColour);
  return real.map((c) => {
    const [r, g, b] = hexToRgb(c.hex)!;
    const lab = rgbToLab(r, g, b);
    return { lab, hex: toHex(r, g, b), weight: 1 / real.length, family: familyOf(lab) };
  });
};

// Distance given to a style whose colour was not measured. Such styles also sort after every
// measured one: first those whose listed colour names differ from the photo (tier 1), then those
// whose colour could not be checked at all (tier 2).
const NOT_MEASURED = 100;

/**
 * Ranks products by colour closeness to the shopper's palette (closest first). Uses cached photo
 * palettes; a product whose photo could not be read is compared by its colour swatches, or failing
 * that by colour names only, and is then never called a close match. A product with no readable
 * photo and no colour information goes to the end, marked 'none'.
 */
export const rankLook = (query: Palette, products: Product[]): LookMatch[] => {
  if (!query.length) return [];
  readSession();
  const queryFamilies = new Set(query.filter((c) => c.weight >= 0.15).map((c) => c.family));
  const shares = (families: string[]) => families.some((f) => queryFamilies.has(f));

  const out: Array<LookMatch & { tier: number }> = [];
  for (const p of products) {
    if (!p || p.hidden) continue;
    const candidates = candidatesFor(p);
    const productFamilies = productColourFamilies(p);
    let best: LookMatch | undefined;

    for (const c of candidates) {
      const palette = memory.get(c.image);
      if (!palette) continue;
      const named = c.colour ? familiesOfName(c.colour.name) : [];
      const d = paletteDistance(query, palette) - (shares(named.length ? named : productFamilies) ? FAMILY_BONUS : 0);
      if (!best || d < best.distance) {
        best = { product: p, distance: Math.max(0, d), close: d <= CLOSE_MATCH, colour: c.colour, image: c.image, basis: 'photo' };
      }
    }

    let tier = 0;
    if (!best) {
      // No readable photo: compare the admin's colour swatches, or failing that the colour names.
      const image = candidates[0]?.image || '';
      const floor = CLOSE_MATCH + 5; // never "close" without a photo to back it up
      const real = (p.colors || []).filter(isRealColour);
      if (real.length) {
        const swatches = swatchPalette(real);
        // The listed colour nearest to the photo is the one shown in bold and added to the bag.
        const each = swatches.map((s) => paletteDistance(query, [s]));
        const nearest = each.indexOf(Math.min(...each));
        const d = paletteDistance(query, swatches) - (shares(productFamilies) ? FAMILY_BONUS : 0);
        best = { product: p, distance: Math.max(floor, d), close: false, colour: real[nearest], image, basis: 'listed' };
      } else if (shares(productFamilies)) {
        const colour = (p.colors || []).find((c) => c && shares(familiesOfName(c.name)));
        best = { product: p, distance: floor + 2, close: false, colour, image, basis: 'name' };
      } else if (productFamilies.length) {
        // Colour names that differ from the photo: known to be different, by an unmeasured amount.
        best = { product: p, distance: NOT_MEASURED, close: false, image, basis: 'listed' };
        tier = 1;
      } else {
        best = { product: p, distance: NOT_MEASURED, close: false, image, basis: 'none' };
        tier = 2;
      }
    }
    out.push({ ...best, tier });
  }

  return out
    .sort((a, b) => a.tier - b.tier || a.distance - b.distance || Number(isAvailable(b.product)) - Number(isAvailable(a.product)) || a.product.price - b.product.price)
    .map(({ tier: _tier, ...match }) => match);
};
