# Suit Aura Girls - Brand & UI/UX Guidelines

These rules are set for the "Suit Aura Girls" women's fashion storefront. All code, styles, and UI adjustments must adhere to these guidelines. (Updated 2026-10-06: the owner picked a new look for the whole site from numbered mockups: look **B · Pastel blocks**, header **3 · Floating pill**, deal of the day **1 · Ticket**, trust cards **5 · Round badges**. It replaces the teal "Bharosa Atelier" system of 2026-10-03. Do not bring the teal, the old plum / lavender palettes, Inter or Playfair Display back. The brand is always "Suit Aura Girls": the mockups were drawn for another store, and none of its name, logo or photos belongs here.)

---

## 🎨 1. Core Color System (Pastel blocks: cream, plum ink, violet and soft blocks)
Use the token classes (`bg-brand`, `text-ink-muted`, `bg-peach` …), never raw hex in components. Tokens are defined once in `src/index.css` (`@theme`, mirrored on `:root` as `--sag-*`). The token names are the same as in the earlier system, so a component written with tokens needs no change.

- **Page** `#FFFDFB` (`page`) — the cream page background. **Surface** `#FFFFFF` (`surface` / `white`) — cards, sheets, inputs, the header pill.
- **Sunken** `#F3EEFF` (`sunken`, deeper `#E3DAF7` `sunken-deep`) — photo placeholders, icon buttons, hover fills, disabled fills, skeletons.
- **Ink** `#221B33` (`ink`) — text, headings, prices, dark pills ("Shop now", "Grab it", "PIN") and a selected chip. Secondary text is **Ink muted** `#5F5970` (`ink-muted`); struck MRP and placeholders use **Ink faint** `#6F6A7D` (`ink-faint`). No opacity steps for text.
- **Line** `#E6E0F0` (`line`) — hairlines. **Control** `#8A83A3` (`control`) — borders of inputs and unselected chips.
- **Brand, violet** `#5B3FD1` (`brand`, hover/pressed `#4930B8` `brand-dark`) — Buy, Continue, Pay, links, input focus, "Add to bag" outline, the search icon. Tint `#EDE6FF` (`brand-wash`) with border `#CFC3F7` (`brand-line`).
- **Pastel blocks** — section backgrounds and tiles, each with an ink for text on it: lilac `#EDE6FF` (`lilac` / `lilac-ink` `#3B2A99`), peach `#FFE1D2` (`peach` / `peach-ink` `#9A3412`), mint `#DDF5E6` (`mint` / `mint-ink` `#14603B`), sky `#CFE9FF` (`sky` / `sky-ink` `#0F4C81`), butter `#FFF1B8` (`butter` / `butter-ink` `#7A5200`), and sun `#FFE14D` (`sun`) for the round "% off" sticker and the product page's Buy now.
- **Sale, green** `#167A4A` (`sale`; tint `#FFF1B8` `sale-tint`, border `#E0C766` `sale-line`) — only for money saved: "% off", "You save", "Free", offer rows, coupon chips.
- **Accent, pink** `#CC2354` (`accent`, tint `#FDE7EE` `accent-tint`) — the wishlist heart, count badges and the "Bestseller" badge.
- **Star** `#F0A30A` (`star`) — star fill only, next to the real numeric rating. A product card shows the rating as a green pill ("4.7 ★").
- **OK** `#14603B` (`ok`, `ok-tint` `#DDF5E6`, `ok-line` `#A9DDBD`) — confirmed states. **Danger** `#B3261E` (`danger`, `danger-tint`, `danger-line`) — errors only, always with an icon and words.
- **Dark** `#221B33` (`dark`) — footer, the floating bottom navigation, lightbox. Text on it: `on-dark` `#FFFFFF`, `on-dark-muted` `#B9B3CC`; the current tab and highlighted words use mint `highlight` `#C9F2DC`.
- WhatsApp green stays inside the WhatsApp glyph.
- **Negative constraint**: no gradients, no coloured glows, no neon, no colours beyond this list.

Helper classes live in `src/index.css`: `sag-card`, `sag-btn-primary`, `sag-btn-outline`, `sag-link`, `sag-input`, `sag-label`, `sag-chip`, `sag-badge`, `sag-row`, `sag-bar`, `sag-eyebrow`, `sag-num`, `sag-scroll-x`, plus `sag-float`, `sag-bob` and `sag-ring` for the three gentle loops below. The four trust facts are worded once in `src/components/Assurance.tsx`; reuse that component instead of writing new claims.

---

## 💎 2. Visual Language
- **Soft blocks**: white cards on a cream page, and whole sections set on a pastel block with large round corners (28px). Solid fills only.
- **Radius**: badges 8px (`rounded-badge`), small thumbnails 14px (`rounded-chip`), inputs and photos 16px (`rounded-control`), cards 20-22px (`rounded-card`), blocks and sheets 28px (`rounded-sheet`). **Buttons and chips are pills** (the helper classes do this).
- **Cards**: no border, a soft shadow (`--sag-shadow`). A product card is a white card: photo on top, then badge, name, rating pill, price and an outline "Add to bag" pill.
- **Typography**: two families only. **Figtree** for all text and every number; **Fraunces** (`font-display`, 600 / 700) for main headings: page titles (h1), section titles (h2), the hero headline, dialog / sheet titles and empty-state titles. Never the display face for prices, product names in lists or on the product page, order numbers, forms, buttons, labels or navigation (an h1/h2 of that kind carries `font-sans`). Sentence case, except the small "DEAL OF THE DAY" ticket label and the brand name in the header. Prices use tabular figures (`sag-num`). Body ≥ 14px, labels ≥ 11px, text in fields 16px.
- **Buttons**: primary is a violet pill, 52px high, white 16/700 text; secondary is a white pill with a 1.5px violet border and violet text. Dark ink pills are used inside pastel blocks. **Buy now on the product page** is yellow (`sag-btn-buy`, sun). Tap targets are at least 44×44px.
- **Header (phones and tablets)**: the "floating pill" on a lilac band: a white pill with the round logo mark, "SUIT AURA GIRLS" and the line "Delivery across India", the wishlist and the bag; under it the menu button, the search field and a dark "PIN" button that checks a PIN code (India Post lookup, the same one the product page uses). Desktop keeps a white bar with the wide logo, a search field and the menu row.
- **Bottom navigation (phones)**: a dark pill floating above the bottom edge; the current tab is a mint tile with dark text. At most one fixed bottom bar per screen.
- **Deal of the day**: one butter "ticket" (photo, name, price, a dashed tear line, the time left and "Grab it") that opens the product. The clock shows only for a deal with a real end time set in Admin.
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
- **Focus**: a visible 2px ink outline on everything (white on dark and violet surfaces).
- **Icons**: outline icons in the colour of the surrounding text (lucide, or `StoreIcons` / `BagIcon`).
- **Motion**: page fade, sheet and drawer slide, a small press on buttons, 150ms colour transitions. Three gentle loops came with the chosen designs and are the only ones allowed: the header logo floats (`sag-float`), the trust badges carry a thin ring that turns slowly (`sag-ring`), and the hero sticker bobs (`sag-bob`). No marquees, shimmer or blinking; `prefers-reduced-motion` removes all motion.

---

## 📸 3. Model & Media Treatment
- **Clear catalog images**: never cover product photos with gradients, text or badges. The one thing allowed on a product card photo is the wishlist heart in a white circle in the top-right corner (the brand watermark sits top-left). Badges and prices sit below the image.
- **No watermark overlaps**: catalog photos already carry the brand watermark; never overlay logos on them.
- Portrait photos use `aspect-[4/5]` with `object-cover object-top`.
- `public/cropped_circle_image.png` is another store's logo and must never be shown; the round mark in the header is `public/suit-aura-mark-132.webp`, cut from this store's own logo.

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
