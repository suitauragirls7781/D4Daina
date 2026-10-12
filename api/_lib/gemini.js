// Admin-only product helper: Google Gemini reads the product photos and drafts the listing text
// (name, description, category, colours, fabric, occasion, care, SEO). Price, MRP, sizes and stock are
// never guessed; the admin fills those. The API key lives only in private_settings/ai_assistant.
import { mediaImage, mediaVariant } from './media.js';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
// Per key, while this server instance is warm: the ordered list of models to try, and models whose
// free daily limit ran out (skipped for a while; Google's free tier is counted per model per day)
const ladders = new Map();
const exhausted = new Map();
const PREFERRED = 'gemini-3.1-flash-lite';
const LADDER_TTL = 6 * 60 * 60 * 1000;
const EXHAUSTED_TTL = 60 * 60 * 1000;
// When every attempt fails, the most useful reason is shown (quota and busy before "model missing")
const ERROR_RANK = ['GEMINI_QUOTA', 'GEMINI_BUSY', 'GEMINI_TIMEOUT', 'GEMINI_EMPTY', 'GEMINI_MODEL_MISSING'];
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export const aiDoc = (db) => db.collection('private_settings').doc('ai_assistant');

/**
 * The key saved from the admin panel, otherwise the GEMINI_API_KEY secret on the Cloudflare Worker.
 * If the database cannot be read (quota, outage) the Worker secret still works.
 */
export const readAi = async (db) => {
  let data = {};
  try {
    const snap = await Promise.race([
      aiDoc(db).get(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AI_SETTINGS_TIMEOUT')), 1500)),
    ]);
    data = snap.exists ? snap.data() : {};
  } catch (error) {
    console.warn('AI settings unavailable, using the server setting:', error?.message || error);
  }
  const saved = String(data.geminiKey || '');
  return { geminiKey: saved || String(process.env.GEMINI_API_KEY || '').trim(), model: String(data.model || ''), fromServer: !saved && Boolean(process.env.GEMINI_API_KEY) };
};

/** What the admin panel may see: never the key itself, only whether one is saved and its last characters. */
export const aiAdminView = ({ geminiKey, model, fromServer = false }) => ({
  fromServer,
  configured: Boolean(geminiKey),
  keyHint: geminiKey ? `…${geminiKey.slice(-4)}` : '',
  model,
});

const withTimeout = (ms) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
};

const googleError = (status, data) => {
  const reason = String(data?.error?.status || '');
  const text = String(data?.error?.message || '');
  if (status === 429 || reason === 'RESOURCE_EXHAUSTED') return new Error('GEMINI_QUOTA');
  if (/API key not valid|API_KEY_INVALID/i.test(text) || reason === 'INVALID_ARGUMENT' && /key/i.test(text)) return new Error('GEMINI_KEY_INVALID');
  if (status === 403 || reason === 'PERMISSION_DENIED') return new Error('GEMINI_KEY_DENIED');
  if (status === 404 || reason === 'NOT_FOUND') return new Error('GEMINI_MODEL_MISSING');
  if (/no longer available|is not found for API version|not supported for generateContent/i.test(text)) return new Error('GEMINI_MODEL_MISSING');
  if (status === 503 || status === 500 || reason === 'UNAVAILABLE' || reason === 'INTERNAL') return new Error('GEMINI_BUSY');
  return new Error(`GEMINI_FAILED:${status}:${text.slice(0, 160)}`);
};

/**
 * The models to try for this key, best first: the newest stable Flash models, Google's Flash alias, then the
 * Lite models. Each has its own free daily limit, so together they give many more free products a day.
 * Throws GEMINI_KEY_INVALID / GEMINI_KEY_DENIED for a bad key.
 */
export const modelLadder = async (key) => {
  const cached = ladders.get(key);
  if (cached && Date.now() - cached.at < LADDER_TTL) return cached.list;
  const t = withTimeout(8000);
  try {
    const response = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': key }, signal: t.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw googleError(response.status, data);
    const usable = (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => String(m.name || '').replace(/^models\//, ''));
    const version = (id) => Number((id.match(/^gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
    const newestFirst = (list) => list.sort((a, b) => version(b) - version(a));
    const flash = newestFirst(usable.filter((id) => /^gemini-\d+(\.\d+)?-flash$/.test(id))).slice(0, 5);
    // gemini-3.1-flash-lite first: the largest free daily limit, fast, and good enough for listings
    const lite = newestFirst(usable.filter((id) => /^gemini-\d+(\.\d+)?-flash-lite$/.test(id)))
      .sort((a, b) => Number(b === PREFERRED) - Number(a === PREFERRED)).slice(0, 4);
    const aliases = FALLBACK_MODELS.filter((id) => usable.includes(id));
    // Lite models first (much larger free limits), then the Flash models as a backup
    const list = [...new Set([...lite, aliases[1], ...flash, aliases[0]].filter(Boolean))];
    const result = list.length ? list : [...FALLBACK_MODELS];
    ladders.set(key, { at: Date.now(), list: result });
    return result;
  } finally {
    t.done();
  }
};

/** Checks the key with Google; returns the best model for it. */
export const pickModel = async (key) => (await modelLadder(key))[0];

/** Only this store's own photos are read, in the stored 1200px JPEG (a quick upload to Gemini). */
const photoUrl = (url) => (mediaImage(url) ? mediaVariant(url, 'j1200.jpg') : null);

const loadPhoto = async (url) => {
  const t = withTimeout(10000);
  try {
    const response = await fetch(url, { signal: t.signal });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null;
    return { inline_data: { mime_type: 'image/jpeg', data: buffer.toString('base64') } };
  } catch {
    return null;
  } finally {
    t.done();
  }
};

const clean = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const HEX = /^#[0-9A-Fa-f]{6}$/;
// Google's schema enums cannot hold an empty string, so a single garment comes back as this word
const SINGLE = 'Single piece';

const COLOURS_RULE = '- colors: the main colours of the item itself (not the background), 1 to 4, each with a shopper-friendly name and a matching hex like #1A2B3C.';
const HONEST_RULE = '- Describe only what the photos show. Never invent a brand, a pure/handloom/handmade claim, a certification, a discount, a price, a delivery promise or a rating.';
const NOTES_RULE = '- checkNotes: one short sentence telling the store owner what to double-check. Empty if nothing.';
// Enum stand-ins (Google's schema enums cannot hold an empty string)
const NOT_LISTED = 'Other';
const NOT_SURE = 'Not sure';

const colourSchema = { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, hex: { type: 'STRING' } }, required: ['name', 'hex'] } };
const hint = (name) => (name ? `The owner has typed this working name, use it only as a hint: "${clean(name, 120)}".` : '');

/** Prompt and answer format for each store section. */
const SPECS = {
  women: ({ categories, setTypes, name }) => ({
    prompt: [
      'You write product listings for "Suit Aura Girls", an Indian online boutique of women\'s ethnic wear (suits, kurtis, anarkalis, co-ord sets, dupatta sets, festive wear).',
      'Look carefully at every photo of ONE product (front, back, close-ups) and fill the JSON fields. Write in simple, elegant Indian English.',
      'Rules:',
      HONEST_RULE,
      '- name: 5 to 11 words, shoppers\' search words first, e.g. "Floral Embroidered Georgette Anarkali Kurta with Palazzo & Dupatta". No emojis, no ALL CAPS, no size, no price.',
      `- category: exactly one of: ${categories.join(', ')}.`,
      `- setType: "${SINGLE}" if only one garment is sold, otherwise exactly one of: ${setTypes.join(', ')} (count the garments sold together, e.g. kurta + palazzo + dupatta = "3 piece").`,
      '- subcategory: a short collection tag, e.g. "Embroidered Anarkali Sets".',
      '- description: 45 to 80 words, 2 or 3 sentences: silhouette, work (embroidery, print, mirror, lace...), what the set includes, and where to wear it.',
      '- fabric: the most likely fabric as a shopper would say it (e.g. "Georgette with net dupatta"). If the photo cannot show it for sure, still give your best guess and mention it in checkNotes.',
      '- fit: e.g. "Regular fit, flared silhouette". occasion: comma separated, e.g. "Festive wear, Wedding guest, Party".',
      '- washCare: sensible care for that fabric, e.g. "Dry clean recommended / gentle hand wash".',
      COLOURS_RULE,
      '- seoTitle: under 60 characters. seoDescription: under 155 characters. searchKeywords: 8 to 15 comma separated words and phrases Indian shoppers type (English and common Hindi-English words like "kurti set", "anarkali suit").',
      NOTES_RULE + ' (fabric, colour shade, pieces in the set)',
      hint(name),
    ],
    schema: {
      name: { type: 'STRING' },
      category: { type: 'STRING', enum: categories },
      setType: { type: 'STRING', enum: [SINGLE, ...setTypes] },
      subcategory: { type: 'STRING' },
      description: { type: 'STRING' },
      fabric: { type: 'STRING' },
      fit: { type: 'STRING' },
      occasion: { type: 'STRING' },
      washCare: { type: 'STRING' },
      colors: colourSchema,
      seoTitle: { type: 'STRING' },
      seoDescription: { type: 'STRING' },
      searchKeywords: { type: 'STRING' },
      checkNotes: { type: 'STRING' },
    },
    required: ['name', 'category', 'setType', 'description', 'fabric', 'fit', 'occasion', 'washCare', 'colors', 'seoTitle', 'seoDescription', 'searchKeywords'],
  }),
};

const callModel = async (key, model, parts, responseSchema) => {
  const t = withTimeout(20000);
  try {
    const response = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      signal: t.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json', responseSchema },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw googleError(response.status, data);
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    if (!text) throw new Error('GEMINI_EMPTY');
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('GEMINI_TIMEOUT');
    if (error instanceof SyntaxError) throw new Error('GEMINI_EMPTY');
    throw error;
  } finally {
    t.done();
  }
};

const list = (values, max = 40) => [...new Set((Array.isArray(values) ? values : []).map((c) => clean(c, 40)).filter(Boolean))].slice(0, max);

/**
 * Drafts the listing from the product photos.
 * Returns only text fields; never price, MRP, sizes or stock.
 */
export const describeProduct = async ({ key, model, images, categories, setTypes, name }) => {
  const urls = [...new Set((Array.isArray(images) ? images : []).map(photoUrl).filter(Boolean))].slice(0, MAX_IMAGES);
  if (!urls.length) throw new Error('GEMINI_NO_PHOTOS');
  const photos = (await Promise.all(urls.map(loadPhoto))).filter(Boolean);
  if (!photos.length) throw new Error('GEMINI_NO_PHOTOS');
  const cats = list(categories);
  const sets = list(setTypes, 12);
  if (!cats.length) throw new Error('GEMINI_NO_CATEGORIES');
  const spec = SPECS.women({ categories: cats, setTypes: sets, name });
  const responseSchema = { type: 'OBJECT', properties: spec.schema, required: spec.required };
  const parts = [{ text: spec.prompt.filter(Boolean).join('\n') }, ...photos];

  // Try the models best first. Busy or slow: one more try on the same model. Daily limit used up or model
  // gone: the next model. Everything stays inside the server's 60 second limit.
  let ladder;
  try { ladder = await modelLadder(key); } catch { ladder = [...FALLBACK_MODELS]; }
  const now = Date.now();
  const tired = exhausted.get(key) || new Map();
  exhausted.set(key, tired);
  const fresh = ladder.filter((m) => !(tired.get(m) > now - EXHAUSTED_TTL));
  const order = fresh.length ? fresh : ladder;
  const started = Date.now();
  const errors = [];
  let raw;
  let used = order[0];
  for (const candidate of order) {
    if (raw) break;
    for (let attempt = 0; attempt < 2 && !raw; attempt++) {
      if (Date.now() - started > 34000) break;
      if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, 1500));
      try {
        used = candidate;
        raw = await callModel(key, candidate, parts, responseSchema);
      } catch (error) {
        const code = String(error?.message || '').split(':')[0];
        if (!['GEMINI_BUSY', 'GEMINI_MODEL_MISSING', 'GEMINI_TIMEOUT', 'GEMINI_QUOTA', 'GEMINI_EMPTY'].includes(code)) throw error;
        errors.push(code);
        // used up today, or closed by Google: skipped for a while
        if (code === 'GEMINI_QUOTA' || code === 'GEMINI_MODEL_MISSING') tired.set(candidate, Date.now());
        // only a busy / slow / empty answer is worth a second try on the same model
        if (!['GEMINI_BUSY', 'GEMINI_TIMEOUT', 'GEMINI_EMPTY'].includes(code)) break;
      }
    }
  }
  if (!raw) throw new Error(ERROR_RANK.find((code) => errors.includes(code)) || 'GEMINI_EMPTY');

  const colors = (Array.isArray(raw.colors) ? raw.colors : [])
    .map((c) => ({ name: clean(c?.name, 40), hex: HEX.test(String(c?.hex || '').trim()) ? String(c.hex).trim().toUpperCase() : '' }))
    .filter((c) => c.name && c.hex)
    .slice(0, 4);
  const pick = (value, options, max = 40) => (options.includes(clean(value, max)) ? clean(value, max) : '');
  return {
    model: used,
    // save a new model only when the old one no longer exists
    saveModel: '',
    photosRead: photos.length,
    draft: {
      name: clean(raw.name, 120),
      category: pick(raw.category, cats),
      setType: pick(raw.setType, sets),
      subcategory: clean(raw.subcategory, 80),
      description: clean(raw.description, 900),
      fabric: clean(raw.fabric, 80),
      fit: clean(raw.fit, 80),
      occasion: clean(raw.occasion, 120),
      washCare: clean(raw.washCare, 120),
      colors,
      seoTitle: clean(raw.seoTitle, 70),
      seoDescription: clean(raw.seoDescription, 170),
      searchKeywords: clean(raw.searchKeywords, 300),
      checkNotes: clean(raw.checkNotes, 240),
    },
  };
};

export const GEMINI_MESSAGES = {
  GEMINI_QUOTA: "Today's free Gemini limit is used up on every model. It resets daily (around 12:30 PM IST); fill this product by hand until then.",
  GEMINI_KEY_INVALID: 'Google did not accept this API key. Copy it again from aistudio.google.com → Get API key.',
  GEMINI_KEY_DENIED: 'This API key is not allowed to use Gemini. Create a new key in aistudio.google.com → Get API key.',
  GEMINI_MODEL_MISSING: 'Gemini could not find a working model right now. Please try again in a minute.',
  GEMINI_NO_PHOTOS: 'Upload the product photos first (they must finish uploading).',
  GEMINI_NO_CATEGORIES: 'No categories to choose from.',
  GEMINI_TIMEOUT: 'Gemini took too long. Please try again.',
  GEMINI_BUSY: 'Gemini is very busy right now. Please try again in a minute.',
  GEMINI_EMPTY: 'Gemini did not return details this time. Please try again.',
  GEMINI_NOT_SET: 'Add your free Gemini API key first.',
};
