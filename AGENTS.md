# Suit Aura Girls - Brand & UI/UX Guidelines

These rules are set for the "Suit Aura Girls" women's fashion storefront. All code, styles, and UI adjustments must adhere to these guidelines. (Updated 2026-10-03: the owner asked for a full redesign of the whole site, colours included, to win trust from first-time shoppers who arrive on a phone from Instagram ads and pay online. The design system is "Bharosa Atelier"; the full spec is `design/DESIGN.md`. It replaces the lavender & plum palette of 2026-09-28. Do not bring the old plum, lavender, blush or champagne colours back.)

---

## 🎨 1. Core Color System (Bharosa Atelier: paper, ink and peacock teal)
Use the token classes (`bg-brand`, `text-ink-muted`, `border-line` …), never raw hex in components. Tokens are defined once in `src/index.css` (`@theme`, mirrored on `:root` as `--sag-*`).

- **Page** `#F5F4F1` (`page`) — page background on bag, checkout, account. **Surface** `#FFFFFF` (`surface` / `white`) — cards, header, bars, sheets, inputs, and the home, shop and product page bands.
- **Sunken** `#ECEAE4` (`sunken`, deeper `#DEDBD3` `sunken-deep`) — photo placeholders, icon tiles, hover fills, disabled fills, skeletons.
- **Ink** `#1B1A17` (`ink`) — text, headings, prices, and the fill of a selected chip. Secondary text is the solid **Ink muted** `#5F5A53` (`ink-muted`); struck MRP and placeholders use **Ink faint** `#6E6961` (`ink-faint`). Do not use opacity steps (`/55`, `/70`) for text; they fail contrast.
- **Line** `#E2DFD8` (`line`) — hairlines and card borders. **Control** `#857F74` (`control`) — borders of inputs, unselected chips.
- **Brand, peacock teal** `#0E4F4F` (`brand`, hover/pressed `#0A3C3C` `brand-dark`) — only for things that move the shopper forward: Buy, Continue, Pay, links, input focus, the active nav tab, a selected payment or address card. One primary button per screen. Tint `#E6F0EE` (`brand-wash`) with border `#BFD8D3` (`brand-line`) for the assurance block and selected cards.
- **Sale, marigold-brown** `#8A5A00` (`sale`; tint `#FBF0D9` `sale-tint`, border `#E3C078` `sale-line`) — only for money saved: "% off", "You save", "Free", offer rows, coupon chips.
- **Accent, rani** `#B0124A` (`accent`, tint `#FCE8EF` `accent-tint`) — only the filled wishlist heart, count badges and the "Bestseller" badge.
- **Star** `#D98E04` (`star`) — star fill only, always next to the real numeric rating. Never text.
- **OK** `#17663F` (`ok`, `ok-tint` `#E9F5EE`, `ok-line` `#B9DEC8`) — confirmed states only (coupon applied, valid, payment verified). **Danger** `#B3261E` (`danger`, `danger-tint` `#FCEDEA`, `danger-line` `#F0B8B2`) — errors only, always with an icon and words.
- **Dark** `#12211F` (`dark`) — footer, announcement bar, lightbox. Text on it: `on-dark` `#F5F4F1`, `on-dark-muted` `#B9C4C1`; highlighted words `highlight` `#F2C14E` (on dark only).
- WhatsApp green stays inside the WhatsApp glyph.
- **Negative constraint**: no gradients anywhere, no coloured glows, no neon, no colours beyond this list.

Helper classes live in `src/index.css`: `sag-card`, `sag-btn-primary`, `sag-btn-outline`, `sag-link`, `sag-input`, `sag-label`, `sag-chip`, `sag-badge`, `sag-row`, `sag-bar`, `sag-eyebrow`, `sag-num`, `sag-scroll-x`. The four trust facts are worded once in `src/components/Assurance.tsx`; reuse that component instead of writing new claims. `design/codemod-colors.cjs` maps any old colour literal to the new tokens and is safe to re-run.

---

## 💎 2. Visual Language
- **Flat, solid surfaces**: white cards on a paper-grey page, solid fills, no gradients. Product cards have no box at all: a photo with details below it.
- **Radius**: badges 6px (`rounded-badge`), chips 10px (`rounded-chip`), buttons, inputs and photos 12px (`rounded-control`), cards 16px (`rounded-card`), bottom sheets 20px on the top corners (`rounded-sheet`). Fully round only for icon buttons, count badges and colour dots. No pill buttons or pill inputs.
- **Borders**: 1px `line` for cards and dividers; 1.5px `control` for inputs, chips and outline buttons; 2px for selected and error states.
- **Shadows**: cards have none. Only fixed bottom bars and sheets (`--sag-shadow-bar`) and toasts and menus (`--sag-shadow-pop`) carry a soft neutral shadow.
- **Typography**: two families only. **Inter** for all text and every number; **DM Serif Display** (`font-display`, one weight) only for page titles ("Your bag", "Checkout", "Sign in") and home headlines, never for prices, product names, forms or buttons. Sentence case everywhere: no uppercase, letter-spaced labels or buttons. Prices use tabular figures (`sag-num`). Body ≥ 14px, labels ≥ 11px, text in fields 16px.
- **Buttons**: primary is teal, 52px high, white 16/600 text; secondary is white with a 1.5px ink border. Tap targets are at least 44×44px. Selected chips are ink-filled (teal is kept for "move forward").
- **Focus**: a visible 2px ink outline on everything (white on dark and teal surfaces).
- **Icons**: outline icons in the colour of the surrounding text (lucide, or `StoreIcons` / `BagIcon`, which draw in `currentColor`). No coloured icon tiles.
- **Bars**: the header is white, 52px on phones, with a hairline below and no change on scroll. At most one fixed bottom bar per screen (bottom navigation, or a page's buy / checkout / pay bar); never blur or hide them.
- **Motion**: page fade, sheet and drawer slide, a small press on buttons, 150ms colour transitions. Nothing loops: no marquees, shimmer, Ken Burns, staggered reveals or animated icons. `prefers-reduced-motion` removes all of it.

---

## 📸 3. Model & Media Treatment
- **Unmasked catalog images**: never cover product photos with gradients, text, badges or absolute buttons. Badges, wishlist hearts and prices sit below the image.
- **No watermark overlaps**: catalog photos already carry the brand watermark; never overlay logos on them.
- Portrait photos use `aspect-[4/5]` with `object-cover object-top`.

---

## 📐 4. Homepage Flow
Default order (admin can reorder/toggle in Admin → Homepage; stored in `storefront_settings/homepageSections`):
1. Announcement bar (in the header; admin text or a real live offer)
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
