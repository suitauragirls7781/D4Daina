# Suit Aura Girls - Brand & UI/UX Guidelines

These rules are set for the "Suit Aura Girls" women's fashion storefront. All code, styles, and UI adjustments must adhere to these guidelines. (Updated 2026-10-07: the colours are jet black, amber and white only, see section 1. Updated 2026-10-06: the owner picked a new look for the whole site from numbered mockups: look **B · Pastel blocks**, header **3 · Floating pill**, deal of the day **1 · Ticket**, trust cards **5 · Round badges**. It replaces the teal "Bharosa Atelier" system of 2026-10-03. Do not bring the teal, the old plum / lavender palettes, Inter or Playfair Display back. The brand is always "Suit Aura Girls": the mockups were drawn for another store, and none of its name, logo or photos belongs here.)

---

## 🎨 1. Core Color System (three colours: jet black, amber and white)
On 2026-10-07 the owner set the whole site to **three colours only: jet black, amber and white**, to read as one big brand. The layout chosen on 2026-10-06 is unchanged; only colour values changed. Use the token classes (`bg-brand`, `text-ink-muted`, `bg-peach` …), never raw hex in components. Tokens are defined once in `src/index.css` (`@theme`, mirrored on `:root` as `--sag-*`). The token NAMES are kept from the earlier systems (so `lilac`, `peach`, `mint`, `sky`, `butter` are now only names): do not read a colour into a name, and do not add a colour outside these three families.

- **Black** `#0A0A0A` — `ink` (all text, headings, prices), `brand` (primary buttons, links, outlines, focus; hover `#2A2A2A` `brand-dark`) and `dark` (the header band on phones, footer, bottom navigation, lightbox, dark pills). Softer black text: `ink-muted` `#555555`, `ink-faint` `#6B6B6B`. A softer black `#262626` is `ok` (confirmed states, the rating pill, progress) and the ink on pale grey blocks.
- **Amber** `#F5A300` — `sun` / `highlight` / `star`: "Buy now", the header's PIN button, the hero "% off" sticker, the current bottom-nav tab, stars, highlighted words on black. It always carries black text, never white. Amber as text on white is the darker `sale` `#8A5200` (money saved: "% off", "You save", "Free", offers) and `accent` `#9A5B00` (the wishlist heart, count badges, the last word of the brand name).
- **White** — `surface` `#FFFFFF` for cards, sheets, inputs and the header pill; the page is the near-white `page` `#FAFAFA`.
- **Pale tints** (section blocks, tiles, placeholders) are tints of the two colours only: pale grey `lilac` `#F2F2F2`, `mint` `#E9E9E9`, `sky` `#EFEFEF`, `sunken` `#F3F3F3` (deeper `#E2E2E2`), `brand-wash` / `ok-tint` `#F2F2F2`; pale amber `peach` `#FFEFC9`, `butter` `#FFF6DE`, `sale-tint` / `accent-tint` `#FFF3D6`. Text on a pale grey block is `#262626` (`lilac-ink`, `mint-ink`, `sky-ink`); on a pale amber block `#8A5200` (`peach-ink`, `butter-ink`).
- **Lines**: `line` `#E3E3E3` for hairlines, `control` `#8A8A8A` for input and chip borders, `brand-line` / `ok-line` `#CFCFCF`, `sale-line` `#F0CF85`.
- **Outside the three colours, only where meaning needs it**: `danger` red `#B3261E` (with its tint and line) for errors, always with an icon and words; the green inside the WhatsApp glyph; and the product photos themselves.
- Where two states used to differ by hue they now differ by family: on the order tracker the stage in progress is pale amber, reached stages pale grey, later ones white-grey; in checkout a finished step is a pale grey row and a later step a white row with a hairline.
- **Negative constraint**: no gradients, no coloured glows, no neon, no violet, pink, green or teal fills.

Helper classes live in `src/index.css`: `sag-card`, `sag-btn-primary`, `sag-btn-outline`, `sag-link`, `sag-input`, `sag-label`, `sag-chip`, `sag-badge`, `sag-row`, `sag-bar`, `sag-eyebrow`, `sag-num`, `sag-scroll-x`, plus `sag-float`, `sag-bob` and `sag-ring` for the three gentle loops below. The four trust facts are worded once in `src/components/Assurance.tsx`; reuse that component instead of writing new claims.

---

## 💎 2. Visual Language
- **Soft blocks**: white cards on a cream page, and whole sections set on a pastel block with large round corners (28px). Solid fills only.
- **Radius**: badges 8px (`rounded-badge`), small thumbnails 14px (`rounded-chip`), inputs and photos 16px (`rounded-control`), cards 20-22px (`rounded-card`), blocks and sheets 28px (`rounded-sheet`). **Buttons and chips are pills** (the helper classes do this).
- **Cards**: no border, a soft shadow (`--sag-shadow`). **Product card**: on phones a "list row" (owner's pick 5, 2026-10-07): one product per line, photo on the left (42%), and on the right the badge, the whole name (not cut), rating pill, price and an outline "Add to bag" pill, with the heart at the row's top-right corner; product grids are one column on phones and rails show one row card at a time. From tablet width it is the white photo-on-top card in the usual columns.
- **Typography**: two families only. **Figtree** for all text and every number; **Fraunces** (`font-display`, 600 / 700) for main headings: page titles (h1), section titles (h2), the hero headline, dialog / sheet titles and empty-state titles. Never the display face for prices, product names in lists or on the product page, order numbers, forms, buttons, labels or navigation (an h1/h2 of that kind carries `font-sans`). Sentence case, except the small "DEAL OF THE DAY" ticket label and the brand name in the header. Prices use tabular figures (`sag-num`). Body ≥ 14px, labels ≥ 11px, text in fields 16px.
- **Buttons**: primary is a black pill, 52px high, white 16/700 text; secondary is a white pill with a 1.5px black border and black text. **Buy now on the product page** is amber with black text (`sag-btn-buy`). Tap targets are at least 44×44px from tablet width up (36-40px on phones, see Phone scale).
- **Header (phones and tablets)**: "all black" (owner's pick 2, 2026-10-07): the whole header is black with round bottom corners and no white pill. The round logo sits in an amber ring that turns (`sag-ring-amber`); the name is white with "GIRLS" in amber and its letters wave; under it the line "Ethnic wear · Delivery across India"; wishlist and bag are round translucent buttons with amber count badges. Below: the menu button, a dark search field whose hint types the store's collections, and an amber round search button that pulses softly (`sag-glow`). There is no PIN button (the PIN code check is on the product page). The row with the menu and the search slides away while the shopper scrolls down and returns as soon as they scroll up or are near the top, so the header is one line while reading (owner, 2026-10-07). Desktop keeps a white bar with the wide logo, a search field and the menu row.
- **Bottom navigation (phones)**: a black bar flush with the bottom edge of the screen, full width (owner, 2026-10-07); the current tab is an amber tile with black text. At most one fixed bottom bar per screen.
- **Deal of the day**: one butter "ticket" (photo, name, price, a dashed tear line, the time left and "Grab it") that opens the product. The clock shows only for a deal with a real end time set in Admin.
- **Shop by category**: "story circles" (owner's pick 2, 2026-10-07): round photos in a swipeable row, each inside the thin ring that turns slowly (`sag-ring`), the name under it.
- **Trust facts on the homepage**: four white round badges on a lilac block (`Assurance` variant `grid`).
- **Hero (phones and tablets)**: one peach block per slide, words on the left, the photo in an arch on the right, and a round yellow sticker with the style's real "% off" (hidden when there is no discount).
- **Product page (phones and tablets)**: "side by side" (owner's pick 5, 2026-10-06): the photo in the left half; beside it the badge, name, rating pill, price, a size picker and a colour picker (plain selects shaped as pills), wishlist and share. Under the photos: the small photo row, offers, "Buy now" and "Add to bag" stacked, the four store facts in one dark strip (mint icon circles), then the PIN code check on a sky block. The fixed buy bar stays.
- **Bag**: "steps" (pick 4): a Bag → Address → Pay strip on top, the lines, the price details, and "Continue to address".
- **Checkout**: "blocks" (pick 2): no stepper row. A finished step is a mint row with a tick and "Edit", the open step's sections sit on lilac blocks under a numbered title, later steps are closed sky rows. Email stays required and payment stays online only.
- **Sign in**: "lilac logo" (pick 3): a lilac page, the round logo with its turning ring, Google first, then the email code with a white pill field and a dark pill button.
- **Footer**: "slim" (pick 4): one dark block with the logo and name, three round buttons (Instagram, WhatsApp, email), every help and policy link as a chip (Track order is the mint one), the address and one line of small print.
- **Phone menu**: "pastel tiles" (owner's pick 2, 2026-10-06): a lilac Sign in / My account card, four coloured tiles (Shop all, New arrivals, Offers, Kids & Toys) with real counts, the collections as chips, then WhatsApp and Track order.
- **My account**: "order first" (pick 3): the latest order leads on a mint block (photo, number, status, a progress strip, "Track order"); the sections follow as a list with round pastel icons.
- **Order tracking**: "step cards" (pick 4): each stage is a card with a round icon; reached stages are mint with a tick, the current one lilac with the turning ring, later ones quiet. Times shown are the order's real ones.
- **Phone scale** (owner, 2026-10-07: "everything looked too big"): on phones (below 640px) the whole layout sits one size smaller. `src/index.css` sets the root size to 90.6% (Tailwind's rem spacing and type shrink together), body text 14px, display h1 21px and h2 18px, buttons and fields 46px high, chips 40px; text inside fields stays 16px so a phone does not zoom on focus. The phone header is small: about 100px at the top of a page and about 55px once its search row has slid away. Do not size phone elements up again; tap targets may be 36-40px on phones.
- **Focus**: a visible 2px ink outline on everything (white on dark and violet surfaces).
- **Icons**: outline icons in the colour of the surrounding text (lucide, or `StoreIcons` / `BagIcon`).
- **Motion**: page fade, sheet and drawer slide, a small press on buttons, 150ms colour transitions. A few gentle loops came with the chosen designs and are the only ones allowed: the header logo floats (`sag-float`), the brand name's letters rise in and a slow wave passes through them (`sag-wave`), the search hint types the store's collection names with a blinking caret (`sag-type`), the trust badges carry a thin ring that turns slowly (`sag-ring`), and the hero sticker bobs (`sag-bob`). No marquees, shimmer or blinking; `prefers-reduced-motion` removes all motion.

---

## 📸 3. Model & Media Treatment
- **Clear catalog images**: never cover product photos with gradients, text or badges. The one thing allowed on a product card photo is the wishlist heart in a white circle in the top-right corner (the brand watermark sits top-left). Badges and prices sit below the image.
- **No watermark overlaps**: catalog photos already carry the brand watermark; never overlay logos on them.
- Portrait photos use `aspect-[4/5]` with `object-cover object-top`.
- `public/cropped_circle_image.png` is another store's logo and must never be shown; the round mark in the header is `public/suit-aura-mark-132.webp`, cut from this store's own logo.

- **Where photos and reels live** (owner, 2026-10-07: moved off Cloudinary, which is gone from this project and must not come back): the Cloudflare R2 bucket `suitauragirls-media`, read straight from `https://media.suitauragirls.in` (Cloudflare's CDN; a photo costs no Worker request and no bandwidth fee). Nothing is resized on the fly. Every photo is stored in ready-made files: `i/<folder>/<id>/w160|w320|w480|w640|w828|w1100|w1600.webp` plus `j480.jpg` (emails) and `j1200.jpg` (link previews, the AI photo reader); a reel is `v/<folder>/<id>/play.mp4` and `poster.jpg`. The address saved in the database is `…/w1100.webp` or `…/play.mp4`.
  - Show a photo only through `getCleanImageUrl(url, width)` (`src/utils/imageHelper.ts`), which picks the stored size that fits; never write a size into a URL by hand. Links saved before the move are translated by `toMediaUrl` in `src/lib/media.ts`.
  - Uploads: the browser makes every size first (`makeImageFiles` in `src/lib/media.ts`), then sends each file to `PUT /api/media` with a grant the server signed for that one photo (`createMediaGrant` in `api/_lib/media.js`; admin via `/api/admin-config?action=media-grant`, customers via the review and return forms). A 5 MB phone photo goes up as about 0.3-1 MB in all. Reel videos are stored as uploaded: MP4 only, 50 MB at most.
  - Deleting a photo deletes every stored size of it (`deleteMedia`).
  - Admin → Usage & limits shows the bucket's storage and requests against R2's free amounts (10 GB, 1 million writes and 10 million reads a month) and an estimate of how many visits the free plan can carry, from measured numbers only.

---

## 📐 4. Homepage Flow
Default order (admin can reorder/toggle in Admin → Homepage; stored in `storefront_settings/homepageSections`):
1. Header (the floating pill; there is no announcement bar)
2. Hero (image + headline, "Shop now" and "Explore collection")
3. Shop by category (only categories that have products)
4. Featured collection
5. New arrivals (horizontal scroll)
6. Deal of the day / Offer banner (built only from offers that are actually live)
7. Why shop with us
8. Customer reviews
9. Instagram reels
10. Newsletter
11. Footer

---

## ✅ 5. Honesty Rules
- Never show fake coupons, fake ratings/reviews, invented delivery dates, countdowns that reset, stock numbers that are not real, or service claims the owner has not confirmed.
- Every price, discount, coupon and total shown in the browser is only a preview; the server (`api/orders.js`) recalculates everything before payment.
