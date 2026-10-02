#!/usr/bin/env node
/**
 * Colour codemod: lavender & plum palette  ->  "Bharosa Atelier" tokens (design/DESIGN.md, section 7).
 *
 *   node design/codemod-colors.cjs          rewrite src/**\/*.ts(x) and src/index.css
 *   node design/codemod-colors.cjs --dry    report only, write nothing
 *
 * Safe to re-run: it only matches the OLD literals, so a second run changes nothing.
 *
 * Passes, in order, per line:
 *   1. gradients     bg-gradient-to-* is removed; its from-* colour becomes a solid bg-*, via-* / to-* go.
 *   2. classes       (variants:)utility-[#OLDHEX](/N)  ->  token class, by utility and opacity (tables below).
 *   3. rgba()        rgba(old plum / ink / blush, a)   ->  rgba(new ink / sale, a)   (arbitrary shadows etc.)
 *   4. inline hex    '#OLDHEX' in style props, SVG attributes, canvas / confetti colours -> new hex.
 *                    Skipped in the files listed in INLINE_SKIP: there the hex is product colour DATA
 *                    (placeholder swatches, colour-matching tables), not UI colour.
 *   5. type floor    text-[8px] / [9px] / [10px] / [10.5px] -> text-[11px]  (labels are never below 11px).
 *   6. card radius   an !important rounded-* on a sag-card is dropped (the card radius is 16px).
 *
 * Deliberate deviations from the spec table, all on the safe side:
 *   - Translucent lavender / ivory fills (bg-[#F3EEF8]/N, bg-[#FBF7F3]/N) always become bg-sunken, never
 *     "removed": several are skeleton blocks or hover states that would vanish.
 *   - A plum ring that is NOT a focus ring (ring-1 ring-[#4B1D3F]/10 used as a hairline around tiles) becomes
 *     ring-line / ring-control / ring-ink like a border. Focus rings become ring-brand, and a 4px focus ring
 *     on the same line is thinned to 2px so it reads as an outline, not a glow.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DRY = process.argv.includes('--dry');

const INLINE_SKIP = new Set([
  'src/utils/colourMatch.ts',
  'src/context/ProductContext.tsx',
  'src/context/ShopContext.tsx',
  'src/components/admin/AdminLooks.tsx',
  'src/components/admin/AdminProductForm.tsx',
  'src/components/admin/kidsToysShared.tsx',
]);

const NAMES = {
  '4B1D3F': 'deep plum', '3B1532': 'plum hover', '2A1A26': 'ink', 'F3EEF8': 'soft lavender', 'E6DDF0': 'deeper lavender',
  'F7E4EA': 'blush', '8A2E55': 'text on blush', 'FBF7F3': 'ivory page', 'C5A46D': 'champagne gold', '9C7A45': 'gold text',
  '7E5F33': 'gold text (dark)', '7A5B2E': 'gold text (dark 2)', 'C2477A': 'pink accent', '241D1B': 'admin dark', '211C1A': 'admin ink',
  '3D0F1F': 'old wine', 'E8D2A4': 'pale gold on dark', 'FAF5EB': 'cream on dark', 'FAF7F2': 'cream on dark 2', 'D9CCE6': 'scrollbar lavender',
  'FDF8F9': 'admin page', 'F3D5DF': 'blush hover', 'FFFFFF': 'white literal',
};

const INLINE_HEX = {
  '4B1D3F': '#0E4F4F', '3B1532': '#0A3C3C', '2A1A26': '#1B1A17', 'F3EEF8': '#ECEAE4', 'E6DDF0': '#DEDBD3',
  'F7E4EA': '#FBF0D9', '8A2E55': '#8A5A00', 'FBF7F3': '#F5F4F1', 'C5A46D': '#D98E04', '9C7A45': '#5F5A53',
  '7E5F33': '#5F5A53', '7A5B2E': '#5F5A53', 'C2477A': '#B0124A', '241D1B': '#1B1A17', '211C1A': '#1B1A17',
  '3D0F1F': '#1B1A17', 'E8D2A4': '#F2C14E', 'FAF5EB': '#F5F4F1', 'FAF7F2': '#F5F4F1', 'D9CCE6': '#857F74',
  'FDF8F9': '#F5F4F1', 'F3D5DF': '#E3C078',
};

const REMOVE = Symbol('remove');
const INK_FAMILY = new Set(['2A1A26', '241D1B', '211C1A', '3D0F1F']);
const isBorderish = (u) => u === 'divide' || u === 'border' || /^border-[tblrxyse]$/.test(u);

/** Returns the new colour token ("brand", "ink/50", "current"), or REMOVE, or null when the hex is not an old colour. */
function tokenFor(util, hex, op, variants, line) {
  const hover = /hover:/.test(variants);
  const focus = /focus/.test(variants);
  const placeholder = /placeholder:/.test(variants);
  const wish = /wishlist|fav|heart/i.test(line);
  const bg = util === 'bg' || util === 'from';
  const text = util === 'text';
  const border = isBorderish(util);
  const ring = util === 'ring';
  const paint = util === 'fill' || util === 'stroke';

  if (util === 'shadow' && (hex === '4B1D3F' || INK_FAMILY.has(hex))) return REMOVE;

  const inkText = () => (placeholder ? 'ink-faint' : op === null || op >= 85 ? 'ink' : op >= 55 ? 'ink-muted' : 'ink-faint');
  const inkBorder = () => (op === null ? 'ink' : op <= 20 ? 'line' : op <= 60 ? 'control' : 'ink');

  if (hex === '4B1D3F') {
    if (bg) {
      if (op === null) return hover ? 'brand-dark' : 'brand';
      if (hover && op <= 15) return 'sunken';
      if (op <= 12) return 'sunken';
      if (op <= 30) return 'sunken-deep';
      if (op <= 70) return 'ink/50';
      return 'brand';
    }
    if (text) return inkText();
    if (border) return inkBorder();
    if (ring) return focus ? 'brand' : inkBorder();
    if (util === 'decoration') return op === null ? 'ink' : 'control';
    if (paint) return 'current';
    return 'brand'; // outline, accent, caret, ring-offset, via, to
  }
  if (hex === '3B1532') return 'brand-dark';
  if (INK_FAMILY.has(hex)) {
    if (bg) {
      if (op === null) return 'ink';
      if (op <= 12) return 'sunken';
      if (op <= 25) return 'sunken-deep';
      if (op <= 80) return 'ink/50';
      return 'ink';
    }
    if (text) return inkText();
    if (border) return inkBorder();
    if (ring) return focus ? 'brand' : inkBorder();
    return 'ink';
  }
  if (hex === 'F3EEF8') {
    if (bg) return 'sunken';
    if (border) return 'line';
    if (text) return 'on-dark';
    if (ring && focus) return 'brand';
    return 'sunken';
  }
  if (hex === 'E6DDF0') {
    if (bg) return 'sunken-deep';
    if (border) return 'line';
    if (text) return 'on-dark-muted';
    if (ring && focus) return 'brand';
    return 'sunken-deep';
  }
  if (hex === 'F7E4EA') {
    if (bg) return wish ? 'accent-tint' : 'sale-tint';
    if (border) return 'sale-line';
    if (paint) return 'accent-tint';
    return 'sale-tint';
  }
  if (hex === 'F3D5DF') return wish ? 'accent-tint' : 'sale-line';
  if (hex === '8A2E55') {
    if (text) return wish ? 'accent' : 'sale';
    if (bg) return 'sale';
    if (ring && focus) return 'brand';
    if (border || ring || util === 'decoration') return op === null ? 'sale' : 'sale-line';
    if (paint) return 'accent';
    return 'sale';
  }
  if (hex === 'FBF7F3' || hex === 'FDF8F9') {
    if (bg) return op === null ? 'page' : 'sunken';
    if (text) return op === null || op >= 85 ? 'on-dark' : 'on-dark-muted';
    if (ring && focus) return 'brand';
    return 'page';
  }
  if (hex === 'C5A46D') {
    if (util === 'fill') return 'star';
    if (text) return /\bStar\b/.test(line) ? 'star' : 'ink-muted';
    if (bg) return op === null ? 'line' : 'sale-tint';
    return 'line';
  }
  if (hex === '9C7A45' || hex === '7E5F33' || hex === '7A5B2E') return border ? 'line' : 'ink-muted';
  if (hex === 'C2477A') return 'accent';
  if (hex === 'E8D2A4') {
    if (text) return 'highlight';
    if (border) return 'on-dark-muted';
    if (bg) return 'sale-tint';
    return 'highlight';
  }
  if (hex === 'FAF5EB' || hex === 'FAF7F2') return 'on-dark';
  if (hex === 'D9CCE6') return 'control';
  if (hex === 'FFFFFF') return bg ? 'surface' : 'white';
  return null;
}

const counts = {};       // hex -> { classes, inline, rgba }
const extra = { gradients: 0, tinyText: 0, cardRadius: 0, focusRingThinned: 0 };
const bump = (hex, kind) => {
  counts[hex] = counts[hex] || { classes: 0, inline: 0, rgba: 0 };
  counts[hex][kind] += 1;
};

const VARIANTS = '((?:[A-Za-z0-9\\-\\/\\[\\]&>_.*=]+:)*)';
const CLASS_RE = new RegExp(`( ?)${VARIANTS}(!?)([a-z]+(?:-[a-z]+)*)-\\[#([0-9a-fA-F]{6})\\](?:\\/(\\d+|\\[[0-9.]+\\]))?(!?)`, 'g');
const opacityOf = (raw) => (raw === undefined ? null : raw.startsWith('[') ? Math.round(parseFloat(raw.slice(1, -1)) * 100) : Number(raw));

const RGB_MAP = { '75,29,63': '27,26,23', '42,26,38': '27,26,23', '61,15,31': '27,26,23', '138,46,85': '138,90,0' };
const RGB_HEX = { '75,29,63': '4B1D3F', '42,26,38': '2A1A26', '61,15,31': '3D0F1F', '138,46,85': '8A2E55' };

function rewriteLine(line, rel) {
  let out = line;

  // 1. gradients
  if (/bg-gradient-to-[a-z]+/.test(out)) {
    out = out.replace(/(^|[\s"'`])((?:[\w\-\/]+:)*)bg-gradient-to-[a-z]+ ?/g, '$1');
    out = out.replace(/(^|[\s"'`])((?:[\w\-\/]+:)*)(?:via|to)-(?:\[[^\]\s]+\]|[a-z]+(?:-\d+)?)(?:\/\d+)? ?/g, '$1');
    out = out.replace(/(^|[\s"'`])((?:[\w\-\/]+:)*)from-transparent ?/g, '$1');
    out = out.replace(/(^|[\s"'`])((?:[\w\-\/]+:)*)from-(white|black)\b/g, '$1$2bg-$3');
    extra.gradients += 1;
  }

  // 2. classes
  let thinFocusRing = false;
  out = out.replace(CLASS_RE, (match, lead, variants, bang1, util, hexRaw, opRaw, bang2) => {
    const hex = hexRaw.toUpperCase();
    const token = tokenFor(util, hex, opacityOf(opRaw), variants, out);
    if (token === null) return match;
    bump(hex, 'classes');
    if (token === REMOVE) return '';
    if (util === 'ring' && /focus/.test(variants)) thinFocusRing = true;
    const name = util === 'from' ? 'bg' : util;
    return `${lead}${variants}${bang1}${name}-${token}${bang2}`;
  });
  if (thinFocusRing) {
    out = out.replace(/((?:peer-|group-)?focus(?:-visible|-within)?:)ring-4\b/g, (m, v) => { extra.focusRingThinned += 1; return `${v}ring-2`; });
  }

  // 3. rgba()
  out = out.replace(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,/g, (match, r, g, b) => {
    const key = `${r},${g},${b}`;
    if (!RGB_MAP[key]) return match;
    bump(RGB_HEX[key], 'rgba');
    const [nr, ng, nb] = RGB_MAP[key].split(',');
    return match.replace(r, '\u0000').replace(g, '\u0001').replace(b, '\u0002').replace('\u0000', nr).replace('\u0001', ng).replace('\u0002', nb);
  });

  // 4. inline hex
  if (!INLINE_SKIP.has(rel)) {
    out = out.replace(/(^|[^\[\w])#([0-9a-fA-F]{6})\b/g, (match, lead, hexRaw) => {
      const next = INLINE_HEX[hexRaw.toUpperCase()];
      if (!next) return match;
      bump(hexRaw.toUpperCase(), 'inline');
      return `${lead}${next}`;
    });
  }

  // 5. type floor
  out = out.replace(/\btext-\[(?:8|9|10|10\.5)px\]/g, () => { extra.tinyText += 1; return 'text-[11px]'; });

  // 6. card radius
  if (out.includes('sag-card')) {
    let previous;
    do {
      previous = out;
      out = out.replace(/(sag-card[^"'`]*?) (?:[a-z]+:)*rounded-(?:[a-z0-9]+|\[[^\]\s]+\])!/, (m, head) => { extra.cardRadius += 1; return head; });
    } while (out !== previous);
  }

  return out;
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(tsx|ts)$/.test(entry.name) || full === path.join(SRC, 'index.css')) files.push(full);
  }
  return files;
}

let changedFiles = 0;
for (const file of walk(SRC)) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const before = fs.readFileSync(file, 'utf8');
  const after = before.split('\n').map((line) => rewriteLine(line, rel)).join('\n');
  if (after !== before) {
    changedFiles += 1;
    if (!DRY) fs.writeFileSync(file, after);
  }
}

const rows = Object.entries(counts)
  .map(([hex, c]) => ({ hex, ...c, total: c.classes + c.inline + c.rgba }))
  .sort((a, b) => b.total - a.total);
console.log(`${DRY ? 'DRY RUN, nothing written. ' : ''}Files changed: ${changedFiles}`);
console.log('colour    was                     classes  inline   rgba  total');
for (const r of rows) {
  console.log(`#${r.hex}   ${(NAMES[r.hex] || '').padEnd(22)} ${String(r.classes).padStart(7)} ${String(r.inline).padStart(7)} ${String(r.rgba).padStart(6)} ${String(r.total).padStart(6)}`);
}
console.log(`total colour rewrites: ${rows.reduce((sum, r) => sum + r.total, 0)}`);
console.log(`gradient lines flattened: ${extra.gradients} · tiny text raised to 11px: ${extra.tinyText} · card radius overrides dropped: ${extra.cardRadius} · 4px focus rings thinned: ${extra.focusRingThinned}`);
