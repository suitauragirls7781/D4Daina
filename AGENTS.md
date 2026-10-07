# Suit Aura Girls - Brand & UI/UX Guidelines

These rules are set for the "Suit Aura Girls" women's fashion storefront. All code, styles, and UI adjustments must adhere to these guidelines. (Updated 2026-10-07, later the same day: the owner chose **deep green + gold on white** and one design for each of 25 sections from numbered previews; sections 1 and 2 describe them and replace the black + amber look. Updated 2026-10-06: the owner picked a new look for the whole site from numbered mockups: look **B · Pastel blocks**, header **3 · Floating pill**, deal of the day **1 · Ticket**, trust cards **5 · Round badges**. It replaces the teal "Bharosa Atelier" system of 2026-10-03. Do not bring the teal, the old plum / lavender palettes, Inter or Playfair Display back. The brand is always "Suit Aura Girls": the mockups were drawn for another store, and none of its name, logo or photos belongs here.)

---

## 🎨 1. Core Color System (two colours on white: deep green and gold)
On 2026-10-07 the owner picked **Green + Gold** for the whole site, to read as a safe, verified, prepaid store. Use the token classes (`bg-brand`, `text-ink-muted`, `bg-peach` …), never raw hex in components. Tokens are defined once in `src/index.css` (`@theme`, mirrored on `:root` as `--sag-*`). The token NAMES are kept from the earlier systems (so `lilac`, `peach`, `mint`, `sky`, `butter` are only names): do not read a colour into a name, and do not add a colour outside these two families.

- **Green** `#0E4A36` — `brand` (primary buttons, links, outlines, focus; hover `#0A382A` `brand-dark`), `dark` (the phone header band, footer, bottom navigation, dark blocks, lightbox) and `ok` (confirmed states, the rating pill, progress). Text is a near-black green: `ink` `#10231C`, `ink-muted` `#55635D`, `ink-faint` `#66736D`. On a dark block text is `on-dark` white or `on-dark-muted` `#CDE2D9`; a softer panel inside a dark block is `bg-white/10`.
- **Gold** `#E9B23A` — `sun` / `highlight` / `star`: "Buy now", "Shop now" and "Grab it" on dark blocks, the pay button, the raised Bag button, the current bottom-nav tab, stars, icon circles on dark blocks. It always carries dark `ink` text, never white. Gold as text on white is the darker `sale` / `accent` `#7D5200` (money saved, "% off", eyebrows, the wishlist heart, the last word of the brand name).
- **White** — `surface` `#FFFFFF` for cards, sheets and inputs; the page is `page` `#FBFBF8`.
- **Pale tints**: pale green `lilac` / `brand-wash` / `ok-tint` `#E8F2ED`, `mint` `#DCEBE3`, `sky` `#EEF4F0`, `sunken` `#EDF3EF` (deeper `#D5E3DB`); pale gold `peach` / `sale-tint` / `accent-tint` `#FFF3D2`, `butter` `#FFF8E3`. Text on a pale green block is green, on a pale gold block `#7D5200`.
- **Lines**: `line` `#DCE5E0`, `control` `#7F8F87`, `brand-line` / `ok-line` `#BFD6CA`, `sale-line` `#EBCB7A`.
- **Outside the two colours, only where meaning needs it**: `danger` red `#B3261E` for errors (with an icon and words), the green inside the WhatsApp glyph, and the product photos.
- **Negative constraint**: no gradients, no coloured glows, no neon, no black, violet, pink or teal fills.

Helper classes live in `src/index.css`: `sag-card`, `sag-btn-primary`, `sag-btn-outline`, `sag-link`, `sag-input`, `sag-label`, `sag-chip`, `sag-badge`, `sag-row`, `sag-bar`, `sag-eyebrow`, `sag-num`, `sag-scroll-x`, plus `sag-float`, `sag-bob` and `sag-ring` for the three gentle loops below. The four trust facts are worded once in `src/components/Assurance.tsx`; reuse that component instead of writing new claims.

---

## 💎 2. Visual Language
- **Soft blocks**: white cards on a cream page, and whole sections set on a pastel block with large round corners (28px). Solid fills only.
- **Radius**: badges 8px (`rounded-badge`), small thumbnails 14px (`rounded-chip`), inputs and photos 16px (`rounded-control`), cards 20-22px (`rounded-card`), blocks and sheets 28px (`rounded-sheet`). **Buttons and chips are pills** (the helper classes do this).
- **Typography**: two families only. **Figtree** for all text and every number; **Fraunces** (`font-display`, 600 / 700) for main headings: page titles (h1), section titles (h2), the hero headline, dialog / sheet titles and empty-state titles. Never the display face for prices, product names in lists or on the product page, order numbers, forms, buttons, labels or navigation (an h1/h2 of that kind carries `font-sans`). Sentence case, except the small "DEAL OF THE DAY" ticket label and the brand name in the header. Prices use tabular figures (`sag-num`). Body ≥ 14px, labels ≥ 11px, text in fields 16px.
- **Cards**: no border, a soft shadow (`--sag-shadow`). **Product card** (pick 5-2): at every width a white card with the photo on top (the heart in a white circle on it), the name in two lines, the rating pill and badge when real, the price, and a small outline "Add to bag". Product grids are **two columns on phones**; a rail gives each card about 158px.
- **Buttons**: primary is a green pill, white 16/700 text; secondary is a white pill with a 1.5px green border and green text; on dark blocks and for "Buy now" / pay the button is gold with dark text (`sag-btn-buy`, `bg-sun text-ink`). Tap targets are at least 44×44px from tablet width up (36-40px on phones, see Phone scale).
- **Header (phones and tablets)** (pick 1-2): the whole header is a green band with round bottom corners: the round logo in a gold ring that turns, the waving name with "GIRLS" in gold, the line "Ethnic wear · Delivery across India", wishlist and bag; below it the menu button, a search field whose hint types the store's collections and a gold round search button. Under the band sit three small trust chips (Secure UPI, 7-day returns, All India). The search row and the chips slide away while the shopper scrolls down and return on scrolling up. Desktop keeps a white bar with the wide logo, a search field and the menu row.
- **Search** (pick 16-3): with an empty field the panel shows "Trending now" (real product photos with prices) and "Collections" tiles with real counts.
- **Bottom navigation (phones)** (pick 13-3): a green bar flush with the bottom edge with Home, Shop, Wishlist and Account (the current one in gold) and a raised round gold Bag button in the middle with the real count. At most one fixed bottom bar per screen.
- **Hero (phones and tablets)** (pick 2-3): one green block per slide: the title, the price with the real "% off" as text, the store's facts line, one or two photos, a gold "Shop now", "Explore collection", and a real verified-purchase review as a small quote (left out when there is none).
- **Trust on the homepage** (pick 3-2): a green block with the four facts as rows (gold icon circle, the fact, a tick) and the white "How your order works" card with three steps (pay by UPI, confirmed at once with the receipt on email, tracked in My orders).
- **Featured collection** (pick 6-3): a pale green block: the first style as one wide card with "Shop now", the next in a two-column grid. **New arrivals** (pick 7-3): a green block "Just in" with a gold "View all" and a swipe row of larger photos. **Newsletter** (pick 11-2): a green block "Questions before you buy?" with a gold WhatsApp button and the email field under it.
- **Deal of the day** (pick 8-2): a green block with the photo on the left, the name, price, "You save ₹X" in gold and a gold "Grab it". The clock shows only for a deal with a real end time set in Admin.
- **Customer reviews** (pick 9-3): a green block with one real review as a large quote (verified purchases first, more by swipe), then the real average and count and "Read all reviews". **Reels** (pick 10-3): a pale green block with three 9:16 tiles side by side.
- **Phone menu** (pick 14-2): a green top block with the logo, name and a gold Sign in / My account button, then a plain list of rows with round pale icons and chevrons, the collections as chips, and a pale gold trust line.
- **Shop page** (pick 15-2): a two-column grid with one Filter / Sort bar that sticks under the header.
- **Product page (phones and tablets)** (picks 17-3 and 18-1): two photos side by side on top with the small photo row under them; one white card with the name, wishlist and share, the price and rating pill, round colour swatches and size chips; then "Buy now" (gold) over "Add to bag", the four facts in a green 2×2 block, and the PIN code check on a pale green block. The fixed buy bar stays.
- **Bag** (pick 19-2): a pale gold "You save ₹X on this order" strip on top, each line as its own white card, and a total bar with a gold "Checkout".
- **Checkout** (picks 20-3 and 21-3): a small order summary card on top, the title "Where should we deliver?", the same fields, a green "Continue to secure payment" with a lock; finished steps are pale green rows with a tick and "Edit". The pay step is one green block: "Secure payment by <gateway>", the amount very large, "You saved ₹X", three ticked facts, the gold pay button and "Trouble paying? Chat with us". Email stays required. **Cash on delivery** (owner, 2026-10-07; Admin → Settings switches it and sets the charge): when on, the pay step offers two ways to pay, "Pay online now" (the online payment discount, 15% today) and "Cash on delivery" (the charge, ₹99 today, is paid by UPI through Razorpay to confirm the order and the rest is collected in cash at delivery; no online discount). With cash on delivery chosen, a pale gold box shows the prepaid saving and a button back to online payment. The order stores `payMode`, `codAdvance` and `codDue`; order pages, emails and Admin always show what was paid online and what is still to be collected. PayU is never used for the advance.
- **Order placed** (pick 22-3): a green block with a gold tick, "It's yours!", the real order number and a gold "Track order"; details and suggestions follow.
- **Order tracking** (pick 25-3): a green block with the current state in words and one four-part progress strip (reached parts gold), the real time of each reached stage under it, the item card, then "Courier tracking" (only with a real link) and "Help".
- **Wishlist** (pick 26-3): a green block with the number of saved styles, their real total and "Move all to bag", then one white card per style. There is no per-style price-drop switch (the store has no such setting).
- **Help and policy pages** (pick 27-3): a gold "Policy" eyebrow, the title, a pale green "In short" box whose points are taken from that policy's own text, then the full text. Contact leads with a green WhatsApp card.
- **Shop by category**: "story circles" (owner's pick 2, 2026-10-07): round photos in a swipeable row, each inside the thin ring that turns slowly (`sag-ring`), the name under it.
- **Sign in** (not re-picked on 2026-10-07; kept): "lilac logo": a lilac page, the round logo with its turning ring, Google first, then the email code with a white pill field and a dark pill button.
- **Footer**: "slim" (pick 4): one dark block with the logo and name, three round buttons (Instagram, WhatsApp, email), every help and policy link as a chip (Track order is the mint one), the address and one line of small print.
- **My account** (not re-picked on 2026-10-07; kept): "order first": the latest order leads on a mint block (photo, number, status, a progress strip, "Track order"); the sections follow as a list with round pastel icons.
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
1. Header (the green band; there is no announcement bar)
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
