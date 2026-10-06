import { getCleanImageUrl } from './imageHelper';
/**
 * Admin-only helper: guesses the main colour of the GARMENT in a product photo, so the admin does
 * not have to type a colour name and hex by hand. Everything runs in the browser on a small copy
 * of the photo (about 160px); nothing is uploaded or sent anywhere. It is a suggestion the admin
 * can change, never a claim shown to shoppers by itself.
 *
 * How it works
 * 1. Clustering: the photo's colours are grouped with k-means in CIELAB (lightness counts less,
 *    so the folds and shadows of one fabric stay one colour).
 * 2. Background: colours that fill the outer frame but are rare in the middle (studio wall, floor,
 *    collage frame, shop shelves) are flood-filled from the edge and left out.
 * 3. Model: skin tones and dark hair near the top count for much less, unless they are most of
 *    what is left (then the outfit itself is nude / peach / black).
 * 4. The middle of the frame (the torso) counts most. The heaviest colour wins, except that a clear
 *    colour beats white / cream / grey when it is a real part of the outfit (at least 15%): a white
 *    suit with a blue print is sold as "Blue".
 * 5. hex = the real average of the well-lit half of that fabric's pixels (shadows left out);
 *    name = the nearest fashion colour name.
 */

export interface DetectedColour {
  /** Nearest fashion colour name, e.g. "Maroon", "Sky Blue". */
  name: string;
  /** The garment's real average colour (its well-lit half), e.g. "#7A1E2C". */
  hex: string;
  /** 0–1: how clearly one colour dominated the outfit. */
  confidence: number;
}

type Lab = [number, number, number];

const SIDE = 160;

// ---------------------------------------------------------------------------------------------
// Colour maths
// ---------------------------------------------------------------------------------------------

const LINEAR = Array.from({ length: 256 }, (_, i) => {
  const v = i / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});

const labF = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

const rgbToLab = (r: number, g: number, b: number): Lab => {
  const R = LINEAR[Math.max(0, Math.min(255, Math.round(r)))];
  const G = LINEAR[Math.max(0, Math.min(255, Math.round(g)))];
  const B = LINEAR[Math.max(0, Math.min(255, Math.round(b)))];
  const fx = labF((R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047);
  const fy = labF(R * 0.2126729 + G * 0.7151522 + B * 0.072175);
  const fz = labF((R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

const chromaOf = (lab: Lab) => Math.hypot(lab[1], lab[2]);
const hueOf = (lab: Lab) => {
  const h = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;
  return h < 0 ? h + 360 : h;
};
const rad = (deg: number) => (deg * Math.PI) / 180;

/** CIEDE2000 colour difference. */
const deltaE00 = (x: Lab, y: Lab, kL = 1) => {
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
// Fashion colour names (the names Indian ethnic-wear shoppers search for)
// ---------------------------------------------------------------------------------------------

// Several swatches per name: how the colour looks on real fabric in a photo, not just the paint
// chip. White, cream, grey and black are named by the rules in `nameFor` instead.
const COLOUR_NAMES: Array<[string, string[]]> = [
  ['Beige', ['#D8C3A5', '#CDB594']],
  ['Gold', ['#C8A04E', '#B8923F']],
  ['Mustard', ['#D29B1C', '#C08A18', '#D9A51A']],
  ['Yellow', ['#F1CB2B', '#EAB94C', '#F2D46A']],
  ['Lemon', ['#F2E77A', '#EEE89A']],
  ['Orange', ['#EF7A22', '#F47721', '#E3813F']],
  ['Peach', ['#F4B69A', '#EFBFA6']],
  ['Coral', ['#EE6F5E', '#E0776A']],
  ['Rust', ['#A9461F', '#B5532B']],
  ['Brown', ['#6B4429', '#80583A']],
  ['Maroon', ['#6B1A26', '#5C0F14']],
  ['Wine', ['#5E1C3A', '#6E2440']],
  ['Red', ['#C4142C', '#C51F2D', '#A5101E', '#E0232E']],
  ['Pink', ['#EDA1B7', '#EFA0B8', '#E8A9B8', '#D9829A', '#E3A2A6']],
  ['Rani Pink', ['#D3196F', '#E0347E']],
  ['Baby Pink', ['#F5CCD8', '#F4D3DC']],
  ['Magenta', ['#BE2A86', '#C0158E']],
  ['Purple', ['#5B2A86', '#4B0082', '#3A0F5C', '#6B3A96']],
  ['Lavender', ['#B8A2D9', '#C8A2D8', '#9B7BC4', '#C6ADD6']],
  ['Lilac', ['#CBA6D3', '#D8B4D8']],
  ['Navy Blue', ['#1C2548', '#1B2138', '#232E55']],
  ['Royal Blue', ['#2B50B2', '#2346A0']],
  ['Blue', ['#4F7BD0', '#5F86D1']],
  ['Sky Blue', ['#85BBE7', '#79B6E8', '#72A9DC', '#9DC7E8', '#A4C4E6']],
  ['Teal', ['#137A7A', '#1D6F74']],
  ['Turquoise', ['#3CC4C0', '#40D0C8']],
  ['Firozi', ['#1EAFB5', '#15A3B0']],
  ['Mint', ['#A8DDC4', '#B5E3CC']],
  ['Sea Green', ['#2E8B69', '#3A9477']],
  ['Green', ['#2F9946', '#3E8E4B']],
  ['Bottle Green', ['#104C32', '#0E3B28']],
  ['Sage Green', ['#A3B89A', '#A8BFA0', '#9C9F74', '#B3B892']],
  ['Olive', ['#6F7932', '#62662E']],
  ['Mehendi Green', ['#879A3B', '#8C9440']],
];

let nameAnchors: Array<{ name: string; lab: Lab }> | null = null;

/** Name for a colour: near-neutrals by lightness and warmth, everything else by nearest swatch. */
const nameFor = (lab: Lab) => {
  const [L, , b] = lab;
  const C = chromaOf(lab);
  const warm = hueOf(lab) >= 45 && hueOf(lab) <= 100;
  // Near-neutral: white, cream, grey and black fabric (the warm light of a photo tints it slightly).
  if (C < 9 || (warm && L >= 84 && C < 20)) {
    if (L < 24) return 'Black';
    if (L < 62) return 'Grey';
    if (L < 78) return warm && C >= 6 ? 'Beige' : 'Silver';
    if (b >= 10) return 'Cream';
    if (b >= 5) return 'Ivory';
    if (L >= 92 && C < 4) return 'White';
    return 'Off White';
  }
  if (!nameAnchors) {
    nameAnchors = COLOUR_NAMES.flatMap(([name, hexes]) => hexes.map((hex) => {
      const [r, g, bl] = hexToRgb(hex);
      return { name, lab: rgbToLab(r, g, bl) };
    }));
  }
  let best = nameAnchors[0];
  let bestD = Infinity;
  for (const anchor of nameAnchors) {
    const d = deltaE00(lab, anchor.lab, 1.5);
    if (d < bestD) { bestD = d; best = anchor; }
  }
  return best.name;
};

/** Fashion colour name for a hex colour, e.g. '#7A1E2C' → 'Maroon'. */
export const nearestColourName = (hex: string): string => {
  const [r, g, b] = hexToRgb(hex);
  return nameFor(rgbToLab(r, g, b));
};

// ---------------------------------------------------------------------------------------------
// Pixel analysis
// ---------------------------------------------------------------------------------------------

/** Typical skin tone (YCbCr range, narrowed with CIELAB so white or cream fabric is not skin). */
const isSkin = (r: number, g: number, b: number, lab: Lab) => {
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  if (cb < 77 || cb > 127 || cr < 133 || cr > 173) return false;
  const C = chromaOf(lab);
  if (lab[0] < 25 || lab[0] > 90 || C < 13 || C > 50) return false;
  const h = hueOf(lab);
  return h >= 20 && h <= 75;
};

// Clustering distance: lightness counts less, so folds and shadows of one fabric stay one colour.
const clusterDist = (l1: number, a1: number, b1: number, l2: number, a2: number, b2: number) => {
  const dL = (l1 - l2) * 0.6;
  const da = a1 - a2;
  const db = b1 - b2;
  return dL * dL + da * da + db * db;
};

export interface ColourGroup {
  /** Average colour of the group's non-background pixels. */
  lab: Lab;
  hex: string;
  /** Garment weight: position in the frame × not skin × not hair, background left out. */
  weight: number;
  pixels: number;
  /** Share of the group's pixels that look like skin. */
  skinShare: number;
}

export interface ColourAnalysis {
  groups: ColourGroup[];
  pick: ColourGroup | null;
  /** Share of the middle of the photo treated as background. */
  backgroundShare: number;
  result: DetectedColour | null;
}

const K = 8;
const NEUTRAL_CHROMA = 12;

/** Cream, beige, gold and tan: the warm near-neutrals of embroidery, zari and lace. */
const isWarmNeutral = (lab: Lab) => {
  const C = chromaOf(lab);
  const h = hueOf(lab);
  return C < 28 && h >= 45 && h <= 105;
};

const hueGap = (x: Lab, y: Lab) => {
  const d = Math.abs(hueOf(x) - hueOf(y));
  return d > 180 ? 360 - d : d;
};

/** Full analysis of an RGBA pixel buffer (exported for testing). */
export const analysePixels = (data: ArrayLike<number>, width: number, height: number): ColourAnalysis => {
  const empty: ColourAnalysis = { groups: [], pick: null, backgroundShare: 0, result: null };
  const n = width * height;
  const Ls = new Float32Array(n);
  const As = new Float32Array(n);
  const Bs = new Float32Array(n);
  const valid = new Uint8Array(n);
  const border = new Uint8Array(n);
  const centre = new Uint8Array(n);
  const weight = new Float32Array(n);
  const skin = new Uint8Array(n);
  const hair = new Uint8Array(n);

  const bx = Math.max(1, Math.round(width * 0.05));
  const by = Math.max(1, Math.round(height * 0.04));
  const cx0 = width * 0.2, cx1 = width * 0.8, cy0 = height * 0.25, cy1 = height * 0.85;

  // Quantised bins (4 bits per channel) seed k-means quickly and deterministically.
  const bins = new Map<number, { n: number; l: number; a: number; b: number }>();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;
      if (data[i + 3] < 128) continue; // transparent (cut-out PNG background)
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const lab = rgbToLab(r, g, b);
      valid[p] = 1;
      Ls[p] = lab[0]; As[p] = lab[1]; Bs[p] = lab[2];
      const isBorder = x < bx || x >= width - bx || y < by || y >= height - by;
      const isCentre = x >= cx0 && x < cx1 && y >= cy0 && y < cy1;
      border[p] = isBorder ? 1 : 0;
      centre[p] = isCentre ? 1 : 0;
      weight[p] = isBorder ? 0 : isCentre ? 1 : 0.35; // the outfit is usually in the middle
      if (isSkin(r, g, b, lab)) skin[p] = 1;
      else if (lab[0] < 22 && chromaOf(lab) < 14 && y < height * 0.5) hair[p] = 1; // dark hair near the top
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      let bin = bins.get(key);
      if (!bin) { bin = { n: 0, l: 0, a: 0, b: 0 }; bins.set(key, bin); }
      bin.n += 1; bin.l += lab[0]; bin.a += lab[1]; bin.b += lab[2];
    }
  }

  const binList = Array.from(bins.values()).map((bin) => ({ n: bin.n, l: bin.l / bin.n, a: bin.a / bin.n, b: bin.b / bin.n }));
  if (binList.length === 0) return empty;

  // --- k-means in Lab: deterministic "far and heavy" start, Lloyd iterations on the bins -------
  const k = Math.min(K, binList.length);
  const centres: Lab[] = [];
  let first = binList[0];
  binList.forEach((bin) => { if (bin.n > first.n) first = bin; });
  centres.push([first.l, first.a, first.b]);
  while (centres.length < k) {
    let pick: typeof first | null = null;
    let score = -1;
    for (const bin of binList) {
      let d = Infinity;
      for (const c of centres) d = Math.min(d, clusterDist(bin.l, bin.a, bin.b, c[0], c[1], c[2]));
      if (bin.n * d > score) { score = bin.n * d; pick = bin; }
    }
    if (!pick || score <= 0) break;
    centres.push([pick.l, pick.a, pick.b]);
  }
  const nearest = (l: number, a: number, b: number) => {
    let best = 0;
    let bestD = Infinity;
    for (let c = 0; c < centres.length; c++) {
      const d = clusterDist(l, a, b, centres[c][0], centres[c][1], centres[c][2]);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  };
  for (let iter = 0; iter < 15; iter++) {
    const sums = centres.map(() => [0, 0, 0, 0]);
    for (const bin of binList) {
      const s = sums[nearest(bin.l, bin.a, bin.b)];
      s[0] += bin.l * bin.n; s[1] += bin.a * bin.n; s[2] += bin.b * bin.n; s[3] += bin.n;
    }
    let moved = 0;
    sums.forEach((s, c) => {
      if (s[3] === 0) return;
      const next: Lab = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
      moved = Math.max(moved, clusterDist(next[0], next[1], next[2], centres[c][0], centres[c][1], centres[c][2]));
      centres[c] = next;
    });
    if (moved < 0.25) break;
  }

  const assign = new Int16Array(n).fill(-1);
  const borderCount = new Float64Array(centres.length);
  const centreCount = new Float64Array(centres.length);
  let borderTotal = 0;
  let centreTotal = 0;
  for (let p = 0; p < n; p++) {
    if (!valid[p]) continue;
    const c = nearest(Ls[p], As[p], Bs[p]);
    assign[p] = c;
    if (border[p]) { borderCount[c] += 1; borderTotal += 1; }
    if (centre[p]) { centreCount[c] += 1; centreTotal += 1; }
  }

  // --- Background ------------------------------------------------------------------------------
  // A colour that fills the outer frame but is rare in the middle is background (wall, floor,
  // collage frame). Its region is flood-filled from the frame, following smooth shading too, so
  // a gradient or blurred backdrop goes with it; the same colour inside the outfit stays.
  const bgColour = centres.map((_, c) => {
    const bS = borderTotal ? borderCount[c] / borderTotal : 0;
    const cS = centreTotal ? centreCount[c] / centreTotal : 0;
    return bS >= 0.08 && cS < bS * 0.6;
  });
  const bgCentres = centres.filter((_, c) => bgColour[c]);
  const nearBackground = (q: number) => bgCentres.some((c) => {
    const dl = Ls[q] - c[0], da = As[q] - c[1], db = Bs[q] - c[2];
    return dl * dl + da * da + db * db < 144;
  });
  const bg = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let p = 0; p < n; p++) {
    if (valid[p] && border[p] && bgColour[assign[p]]) { bg[p] = 1; queue[tail++] = p; }
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    const y = (p - x) / width;
    const next = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
    for (const q of next) {
      if (q < 0 || bg[q] || !valid[q]) continue;
      const dl = Ls[p] - Ls[q], da = As[p] - As[q], db = Bs[p] - Bs[q];
      if (bgColour[assign[q]] || (dl * dl + da * da + db * db < 16 && nearBackground(q))) { bg[q] = 1; queue[tail++] = q; }
    }
  }
  let bgCentre = 0;
  for (let p = 0; p < n; p++) if (bg[p] && centre[p]) bgCentre += 1;
  let backgroundShare = centreTotal ? bgCentre / centreTotal : 0;
  // When the "background" would swallow most of the middle, the photo is a fabric close-up.
  if (backgroundShare > 0.75) { bg.fill(0); backgroundShare = 0; }

  // --- The model: skin and dark hair count for less, but only while enough of the outfit is left.
  // A nude / peach outfit (or ivory in warm light) reads as "skin", a black one as "hair".
  let seen = 0, skinSeen = 0, hairSeen = 0;
  for (let p = 0; p < n; p++) {
    if (!valid[p] || bg[p]) continue;
    seen += weight[p];
    if (skin[p]) skinSeen += weight[p];
    if (hair[p]) hairSeen += weight[p];
  }
  const skinFactor = seen && skinSeen / seen > 0.4 ? 1 : 0.25;
  const hairFactor = seen && hairSeen / seen > 0.35 ? 1 : 0.4;
  const skinCounts = skinFactor < 1;
  for (let p = 0; p < n; p++) {
    if (skin[p]) weight[p] *= skinFactor;
    else if (hair[p]) weight[p] *= hairFactor;
  }

  // --- Colour groups (the same fabric in light and shade) -----------------------------------------
  const acc = centres.map(() => ({ w: 0, r: 0, g: 0, b: 0, pixels: 0, skin: 0 }));
  for (let p = 0; p < n; p++) {
    if (!valid[p] || bg[p]) continue;
    const s = acc[assign[p]];
    const i = p * 4;
    const w = weight[p];
    s.pixels += 1;
    if (skin[p]) s.skin += 1;
    s.w += w;
    s.r += data[i] * w; s.g += data[i + 1] * w; s.b += data[i + 2] * w;
  }
  const groupOf = centres.map((_, c) => c);
  const root = (c: number): number => (groupOf[c] === c ? c : (groupOf[c] = root(groupOf[c])));
  const labOfAcc = (s: { w: number; r: number; g: number; b: number }) => rgbToLab(s.r / s.w, s.g / s.w, s.b / s.w);
  const live = acc.map((s, c) => (s.w > 0 ? c : -1)).filter((c) => c >= 0);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if (root(a) === root(b)) continue;
      const la = labOfAcc(acc[a]);
      const lb = labOfAcc(acc[b]);
      const neutralA = chromaOf(la) < 10;
      if (neutralA !== chromaOf(lb) < 10) continue;
      if (!neutralA && hueGap(la, lb) > 20) continue;
      if (deltaE00(la, lb, 2) < 7) groupOf[root(b)] = root(a);
    }
  }
  const groupMap = new Map<number, { w: number; r: number; g: number; b: number; pixels: number; skin: number; members: number[] }>();
  live.forEach((c) => {
    const g = root(c);
    let m = groupMap.get(g);
    if (!m) { m = { w: 0, r: 0, g: 0, b: 0, pixels: 0, skin: 0, members: [] }; groupMap.set(g, m); }
    const s = acc[c];
    m.w += s.w; m.r += s.r; m.g += s.g; m.b += s.b; m.pixels += s.pixels; m.skin += s.skin;
    m.members.push(c);
  });
  const members = new Map<ColourGroup, number[]>();
  const groups: ColourGroup[] = Array.from(groupMap.values()).map((m) => {
    const r = m.r / m.w, g = m.g / m.w, b = m.b / m.w;
    const group: ColourGroup = { lab: rgbToLab(r, g, b), hex: toHex(r, g, b), weight: m.w, pixels: m.pixels, skinShare: m.skin / m.pixels };
    members.set(group, m.members);
    return group;
  }).sort((a, b) => b.weight - a.weight);

  const total = groups.reduce((s, g) => s + g.weight, 0);
  if (!groups.length || total <= 0) return { groups, pick: null, backgroundShare, result: null };

  // --- Pick ------------------------------------------------------------------------------------
  // The heaviest group wins, except that a clear colour beats white / grey / black / cream when
  // it is a real part of the outfit: a white suit with a blue print is sold as "Blue".
  const top = groups[0];
  let pickSet: ColourGroup[] = [top];
  let print = false;
  if (chromaOf(top.lab) < NEUTRAL_CHROMA || (isWarmNeutral(top.lab) && chromaOf(top.lab) < 18)) {
    const colourful = groups.filter((g) => chromaOf(g.lab) >= 14 && g.skinShare < 0.5 && !isWarmNeutral(g.lab));
    if (colourful.length) {
      const lead = colourful[0];
      const family = colourful.filter((g) => hueGap(g.lab, lead.lab) <= 30);
      const familyWeight = family.reduce((s, g) => s + g.weight, 0);
      if (familyWeight >= total * 0.15) { pickSet = family; print = true; }
    }
  }
  const pick = pickSet[0];
  const pickWeight = pickSet.reduce((s, g) => s + g.weight, 0);

  // --- Representative colour --------------------------------------------------------------------
  // A plain fabric: its well-lit half (shadows left out). A print on white: its most saturated half
  // (the edges of a print blend into the white around it).
  const chosen = new Uint8Array(centres.length);
  pickSet.forEach((g) => (members.get(g) || []).forEach((c) => { chosen[c] = 1; }));
  const lit: number[] = [];
  for (let p = 0; p < n; p++) {
    if (valid[p] && !bg[p] && weight[p] > 0 && chosen[assign[p]]) lit.push(p);
  }
  const pool = skinCounts && lit.some((p) => !skin[p]) ? lit.filter((p) => !skin[p]) : lit;
  if (print) pool.sort((a, b) => Math.hypot(As[b], Bs[b]) - Math.hypot(As[a], Bs[a]));
  else pool.sort((a, b) => Ls[b] - Ls[a]);
  const half = pool.slice(0, Math.max(1, Math.ceil(pool.length / 2)));
  let sw = 0, sr = 0, sg = 0, sb = 0;
  half.forEach((p) => {
    const w = weight[p];
    const i = p * 4;
    sw += w; sr += data[i] * w; sg += data[i + 1] * w; sb += data[i + 2] * w;
  });
  const rgb: [number, number, number] = sw > 0 ? [sr / sw, sg / sw, sb / sw] : hexToRgb(pick.hex);
  const repLab = rgbToLab(rgb[0], rgb[1], rgb[2]);

  return {
    groups,
    pick,
    backgroundShare,
    result: {
      name: nameFor(repLab),
      hex: toHex(rgb[0], rgb[1], rgb[2]),
      confidence: Math.round(Math.max(0, Math.min(1, pickWeight / total)) * 100) / 100,
    },
  };
};

/** Main garment colour of an RGBA pixel buffer. */
export const detectColourFromPixels = (data: ArrayLike<number>, width: number, height: number): DetectedColour | null =>
  analysePixels(data, width, height).result;

// ---------------------------------------------------------------------------------------------
// Loading photos
// ---------------------------------------------------------------------------------------------

type Drawable = ImageBitmap | HTMLImageElement;

const pixelsOf = (source: Drawable, srcWidth: number, srcHeight: number) => {
  if (!srcWidth || !srcHeight) return null;
  const scale = Math.min(1, SIDE / Math.max(srcWidth, srcHeight));
  const width = Math.max(1, Math.round(srcWidth * scale));
  const height = Math.max(1, Math.round(srcHeight * scale));
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  if (typeof OffscreenCanvas !== 'undefined') {
    ctx = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true });
  }
  if (!ctx && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return { data: ctx.getImageData(0, 0, width, height).data, width, height };
};

const loadImage = (src: string, crossOrigin: boolean) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image could not be loaded'));
    img.src = src;
  });

/** Main garment colour of a local image file (no network, no CORS). Null when it cannot be read. */
export const detectColourFromFile = async (file: Blob): Promise<DetectedColour | null> => {
  try {
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file);
        try {
          const px = pixelsOf(bitmap, bitmap.width, bitmap.height);
          return px ? detectColourFromPixels(px.data, px.width, px.height) : null;
        } finally {
          bitmap.close();
        }
      } catch {
        // Fall through to <img> decoding (older Safari).
      }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url, false);
      const px = pixelsOf(img, img.naturalWidth, img.naturalHeight);
      return px ? detectColourFromPixels(px.data, px.width, px.height) : null;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
};

/** A small stored copy of one of the store's photos (the detector only needs a few hundred pixels). Other URLs are left as they are. */
const smallCopyOf = (url: string) => getCleanImageUrl(url, 480);

/**
 * Main garment colour of an image URL. The image is loaded with CORS (the store's media address allows it);
 * null when it cannot be loaded or read.
 */
export const detectColourFromUrl = async (url: string): Promise<DetectedColour | null> => {
  try {
    if (!url) return null;
    const img = await loadImage(smallCopyOf(url), !url.startsWith('data:') && !url.startsWith('blob:'));
    const px = pixelsOf(img, img.naturalWidth, img.naturalHeight);
    return px ? detectColourFromPixels(px.data, px.width, px.height) : null;
  } catch {
    return null;
  }
};
