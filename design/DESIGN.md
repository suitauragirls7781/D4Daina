# Suit Aura Girls — Design System "Bharosa Atelier"

Status: final spec for the full storefront redesign (branch `redesign`). Written 2026-10-03.
This replaces the lavender and plum system. `AGENTS.md` sections 1-4 must be rewritten to match this file in the same change that lands the tokens, otherwise later work will revert the design.

Scope: markup, layout, styling, copy and component structure only. No change to pricing, coupons, validation rules, order or payment calls, tracking, abandoned-checkout saving, routing, admin session, `api/**` or `worker/**`.

---

## 0. Decision record

### Scores (1-10)

| Criterion | Rani & Ink | Peacock Atelier | Bharosa |
|---|---|---|---|
| (a) Effect on product page -> bag and checkout -> paid | 9 | 8 | 8 |
| (b) Trust for an unknown prepaid-only brand | 8 | 8 | 10 |
| (c) Distinct, premium, clearly not the old site | 6 | 9 | 7 |
| (d) Buildable without touching business logic | 6 | 6 | 9 |
| (e) Speed on mid-range Android | 9 | 8 | 8 |
| Total | 38 | 39 | 42 |

Base: **Bharosa** (trust-first structure, three checkout states kept, e2e-safe). It is the only proposal that read the e2e test in `worker/test/e2e/`, which cannot be edited in this work and which clicks "Deliver here" and then "Continue to payment" as two separate steps.

### Grafts and resolved conflicts

| Question | Decision | From |
|---|---|---|
| Primary colour | Peacock teal `#0E4F4F`, not bottle green and not rani. Rani is the same hue family as the old plum; bottle green reads as utility. Teal stands apart from a red and pink catalogue and gives 9.3:1 with white text. | Peacock |
| Money-saved colour | Marigold-brown `#8A5A00` for every "% off", "You save" and "Free". Emerald is kept for confirmed states only, so teal buttons and green success never blur. | Peacock |
| Accent | Rani `#B0124A`, only for the filled wishlist heart and count badges. | Bharosa |
| Merge Review and Pay into one screen | No. Three states stay (`details`, `summary`, `payment`). The e2e test needs both buttons in sequence and `worker/**` cannot change. | Bharosa |
| Sticky bar on the Address step | Yes, new. One visible button per name: the sticky bar is `lg:hidden`, the inline button is `hidden lg:flex`. | Bharosa |
| Hide sticky bars while typing | No. Focus and viewport events are unreliable in Instagram's browser and hiding would need a duplicate visible button, which breaks the e2e test. Bars stay; inputs get `scroll-margin-bottom: 96px`. | Lead |
| Gallery | Native scroll-snap strip, each slide 84% of the width so the next photo peeks in. Full-bleed puts the price below the fold inside Instagram. | Rani / Peacock |
| Price in the sticky buy bar | Yes, price block on the left of a single-row bar, so the amount is always on screen. | Rani |
| Size not chosen | Bottom sheet with explicit confirm button (no auto-proceed, to avoid wrong-size orders). `onAdd` / `onBuy` take an optional size argument. | Rani + Peacock |
| Selected size chip | Ink fill, white text. Teal is reserved for "move forward". | Rani / Peacock |
| Per-size "unavailable" chip | Not built. No real per-size stock data exists. | Peacock |
| Fonts | Inter (text, all numbers) + DM Serif Display (page titles and home headlines only). | Peacock / Bharosa |
| Product title | Inter 18/24 600, not serif, to keep the first screen short. | Rani / Bharosa |
| `font-serif` sweep | `--font-serif` is re-pointed to Inter in `@theme`, so the 252 existing `font-serif` usages become Inter with no edits. Titles that should be serif get `font-display` by hand. | Rani (method) |
| Product cards | No border, no box; photo radius 12 on a white band. | Peacock |
| Cards elsewhere | White cards on paper for bag, checkout, account. | Bharosa |
| Trust block | One reusable `Assurance` component (four true facts), full version on the product page, one-line version above buy, checkout and pay buttons. | Bharosa |
| Toasts | Top-anchored under the header so they never cover a buy or pay bar. | Bharosa |
| Wishlist icon in phone header | Removed on phones (it is in the bottom nav and on the product title row). Stays on desktop. | Peacock / Bharosa |
| Bottom nav on the bag page | Hidden, so only one fixed bar shows. | All three |
| Product page header | Keeps the menu icon. A visitor from an ad has no history to go back to. | Lead |
| Bag price details | Always expanded. Four or five honest lines build more trust than a disclosure. | Rani / Peacock |
| "100% Encrypted" badge | Removed. Not a confirmed claim. | All three |
| Admin panel | Re-token only (same codemod), no layout work. Ships after the storefront. | All three |

---

## 1. Tokens

All colours are new. Contrast ratios below were computed with the WCAG relative-luminance formula.

### 1.1 Colour

Define in `src/index.css` inside `@theme` (Tailwind v4 then generates `bg-*`, `text-*`, `border-*`, `ring-*` and opacity forms such as `bg-brand/10`). Mirror the same values on `:root` as `--sag-*` for plain CSS.

| Role | Hex | `@theme` variable | Tailwind name | `:root` alias | Contrast / use |
|---|---|---|---|---|---|
| Page | `#F5F4F1` | `--color-page` | `page` | `--sag-page` | Body background on bag, checkout, account |
| Surface | `#FFFFFF` | `--color-surface` | `surface` | `--sag-surface` | Cards, header, bars, sheets, inputs; home, shop and product page bands |
| Sunken | `#ECEAE4` | `--color-sunken` | `sunken` | `--sag-sunken` | Photo placeholder, icon tiles, chip hover, +91 prefix |
| Sunken deep | `#DEDBD3` | `--color-sunken-deep` | `sunken-deep` | `--sag-sunken-deep` | Disabled fill, skeletons |
| Ink | `#1B1A17` | `--color-ink` | `ink` | `--sag-ink` | Text, headings, prices, selected chip fill. 17.4:1 on white, 15.8:1 on page |
| Ink muted | `#5F5A53` | `--color-ink-muted` | `ink-muted` | `--sag-ink-muted` | Secondary text. 6.8:1 on white, 6.2:1 on page, 5.7:1 on sunken |
| Ink faint | `#6E6961` | `--color-ink-faint` | `ink-faint` | `--sag-ink-faint` | Struck MRP, placeholders. 5.5:1 on white. Not used on sunken |
| Line | `#E2DFD8` | `--color-line` | `line` | `--sag-line` | Hairlines, card borders (decorative) |
| Control | `#857F74` | `--color-control` | `control` | `--sag-control` | Input and unselected chip borders. 4.0:1 on white, 3.6:1 on page |
| Brand (Peacock) | `#0E4F4F` | `--color-brand` | `brand` | `--sag-brand` | Buy, Continue, Pay, links, active nav. White text 9.3:1 |
| Brand dark | `#0A3C3C` | `--color-brand-dark` | `brand-dark` | `--sag-brand-dark` | Hover and pressed. White text 12.2:1 |
| Brand wash | `#E6F0EE` | `--color-brand-wash` | `brand-wash` | `--sag-brand-wash` | Assurance block, selected payment or address card. Brand text on it 8.0:1 |
| Brand line | `#BFD8D3` | `--color-brand-line` | `brand-line` | `--sag-brand-line` | Border of brand-wash blocks |
| Accent (Rani) | `#B0124A` | `--color-accent` | `accent` | `--sag-accent` | Filled wishlist heart, count badges. 6.9:1 with white |
| Accent tint | `#FCE8EF` | `--color-accent-tint` | `accent-tint` | `--sag-accent-tint` | Wishlist-active fill, "Bestseller" badge. Accent text on it 5.9:1 |
| Sale | `#8A5A00` | `--color-sale` | `sale` | `--sag-sale` | "% off", "You save", "Free", offer lines. 5.9:1 on white, 5.4:1 on page, 5.2:1 on sale tint |
| Sale tint | `#FBF0D9` | `--color-sale-tint` | `sale-tint` | `--sag-sale-tint` | Offer rows, coupon chips, caution note |
| Sale line | `#E3C078` | `--color-sale-line` | `sale-line` | `--sag-sale-line` | Coupon border, caution left rule |
| Star | `#D98E04` | `--color-star` | `star` | `--sag-star` | Star fill only, always beside a numeric rating. Never text (2.7:1) |
| OK | `#17663F` | `--color-ok` | `ok` | `--sag-ok` | Applied coupon, valid tick, payment verified. 7.0:1 on white |
| OK tint | `#E9F5EE` | `--color-ok-tint` | `ok-tint` | `--sag-ok-tint` | Success rows. OK text on it 6.2:1 |
| OK line | `#B9DEC8` | `--color-ok-line` | `ok-line` | `--sag-ok-line` | Success row border |
| Danger | `#B3261E` | `--color-danger` | `danger` | `--sag-danger` | Error text and border. 6.5:1 on white |
| Danger tint | `#FCEDEA` | `--color-danger-tint` | `danger-tint` | `--sag-danger-tint` | Error field fill. Danger text on it 5.7:1 |
| Danger line | `#F0B8B2` | `--color-danger-line` | `danger-line` | `--sag-danger-line` | Error banner border |
| Dark | `#12211F` | `--color-dark` | `dark` | `--sag-dark` | Footer, announcement bar, lightbox |
| On dark | `#F5F4F1` | `--color-on-dark` | `on-dark` | `--sag-on-dark` | Text on dark. 15.1:1 |
| On dark muted | `#B9C4C1` | `--color-on-dark-muted` | `on-dark-muted` | `--sag-on-dark-muted` | Secondary text on dark. 9.3:1 |
| Highlight | `#F2C14E` | `--color-highlight` | `highlight` | `--sag-highlight` | Highlighted words on dark only. 9.9:1 on dark |
| Scrim | `rgba(27,26,23,.5)` | — | `bg-ink/50` | `--sag-scrim` | Behind sheets and drawers |

Colour rules:
- Brand teal appears only on things that move the shopper forward: primary buttons, links, focus on inputs, the active nav tab, selected payment and address cards. One primary button per screen.
- Selected chips (size, filter) are ink-filled.
- Sale colour is only for money saved. OK green only for confirmed states. Danger only for errors, always with an icon and words.
- Rani accent only for the filled wishlist heart and count badges.
- WhatsApp green stays inside the WhatsApp glyph.
- No gradients anywhere. No coloured glows.
- `index.html` `theme-color` becomes `#FFFFFF`.

### 1.2 Fonts

Replace the single Google Fonts link in `index.html` (line 136) with:
`https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600;700&display=swap`
Keep the existing preconnect. No other family is loaded.

```css
@theme {
  --font-sans: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-serif: 'Inter', system-ui, sans-serif;            /* existing font-serif classes become Inter */
  --font-display: 'DM Serif Display', Georgia, serif;      /* new font-display utility */
}
```

- Delete the `h1..h6, .font-serif { font-family: 'Cormorant Garamond' !important }` rule. Headings default to Inter 600.
- `font-display` is applied by hand to: page titles ("Your bag", "Checkout", "My account", "Sign in"), the home hero headline, home section titles. Never on prices, product names, forms or buttons (DM Serif Display has one weight).
- Every price and total: `font-variant-numeric: tabular-nums lining-nums` (helper class `sag-num`).
- Add a metric-matched fallback `@font-face` (`size-adjust` over Arial for Inter, over Georgia for DM Serif Display) so the swap causes no layout shift.

### 1.3 Type scale (390px phone; size / line-height, weight)

| Role | Family | Spec |
|---|---|---|
| Display h1 (page title, hero) | DM Serif Display | 28/32, 400, tracking -0.01em |
| Display h2 (home section title) | DM Serif Display | 22/28, 400 |
| Product title (h1 on product page) | Inter | 18/24, 600, max 2 lines |
| Functional h2 (Delivery address, Price details, Reviews) | Inter | 17/24, 600 |
| h3 (card or group title, accordion row) | Inter | 16/22, 600 |
| Card product name | Inter | 14/20, 500, clamp 2 lines |
| Price, product page | Inter | 28/32, 700, tabular |
| MRP beside it | Inter | 15/20, 400, line-through, ink-faint |
| "% off" beside it | Inter | 15/20, 700, sale |
| Price in cards and bag lines | Inter | 16/20, 700; MRP 13 struck; "% off" 13/700 sale |
| Total in sticky bars | Inter | 18/22, 700, tabular |
| Amount to pay (pay step card) | Inter | 28/32, 700, tabular |
| Body | Inter | 15/22, 400 |
| Secondary body | Inter | 14/20, 400, ink-muted |
| Form label | Inter | 13/18, 600, ink |
| Helper / error text | Inter | 13/18, 400 (error 500) |
| Eyebrow (`sag-eyebrow`) | Inter | 12/16, 600, ink-muted, sentence case, no tracking |
| Badge | Inter | 11/14, 700 |
| Bottom nav label | Inter | 11/12, 500 (700 active) |
| Primary button | Inter | 16/20, 600, sentence case, no letter-spacing |
| Secondary / small button | Inter | 14/20, 600 |
| Input text | Inter | 16/24, 400 (16px stops zoom on focus) |

Floors: body 14px, labels 11px. Every current `text-[10px]` goes to 11px. No uppercase tracked button or heading text anywhere.

### 1.4 Spacing, radius, shadow

| Scale | Values |
|---|---|
| Spacing | 4, 8, 12, 16, 20, 24, 32, 48 (Tailwind 1, 2, 3, 4, 5, 6, 8, 12). Page gutter 16. Grid gap 12. Field gap 16. Section rhythm 32 on phone, 48 on desktop |
| Radius | `--radius-badge` 6 · `--radius-chip` 10 · `--radius-control` 12 (buttons, inputs, photos) · `--radius-card` 16 · `--radius-sheet` 20 (top corners only) · full round only for icon buttons, count badges, colour dots |
| Border | 1px line for cards and dividers; 1.5px control for inputs, chips, outline buttons; 2px for selected and error |
| Shadow | `--sag-shadow-bar: 0 -4px 16px rgba(27,26,23,.08)` for bottom bars and sheets; `--sag-shadow-pop: 0 8px 24px -12px rgba(27,26,23,.18)` for toasts and menus. Cards have no shadow. `--sag-shadow` is kept as an alias of `none` so existing references do not break |
| Tap target | 44x44 minimum everywhere; primary buttons 52 high |
| Focus | `:focus-visible { outline: 2px solid #1B1A17; outline-offset: 2px }` on everything; on dark surfaces the outline is `#FFFFFF` |
| Motion | Page fade / view transitions, sheet slide (existing `sag-enter`, 240ms), button press `scale(.98)`, 150ms colour transitions. Nothing else. `prefers-reduced-motion` removes all of it |

---

## 2. Components

Helper classes in `src/index.css` keep their names and take the new spec: `sag-card`, `sag-btn-primary`, `sag-btn-outline`, `sag-eyebrow`, `sag-scroll-x`. New: `sag-input`, `sag-label`, `sag-chip`, `sag-bar`, `sag-row`, `sag-badge`, `sag-num`.

### Buttons
| Variant | Default | Pressed / hover | Disabled | Loading |
|---|---|---|---|---|
| Primary (`sag-btn-primary`) | h 52 (48 inside cards), radius 12, bg brand, white 16/600, optional 18px icon left | bg brand-dark, `scale(.98)` | bg sunken-deep, text ink-muted | Spinner replaces the icon, existing stage text ("Creating your order…"), width locked |
| Secondary (`sag-btn-outline`) | h 52 or 44, white, 1.5px ink border, ink 16/600 (14/600 small) | bg sunken | border and text ink-faint | Spinner, width locked |
| Tertiary link | brand 14/600, underline with 3px offset, 44px hit area through padding | brand-dark | ink-faint | — |
| Icon button | 44x44 round, transparent, ink icon 22px stroke 1.75 | bg sunken | — | — |
| WhatsApp help | h 48, white, 1.5px control border, existing `WhatsAppIcon`, ink text "Chat on WhatsApp" | bg sunken | — | — |

### Inputs (`sag-input`)
- h 52, radius 12, 1.5px control border, white, 16px text, 14px side padding. `scroll-margin-bottom: 96px`.
- Label always above (`sag-label`, 13/600, 6px gap) with a real `<label htmlFor>`. Placeholder is an example only, colour ink-faint. Helper 13px ink-muted below.
- Focus: 2px brand border plus the global focus outline.
- Valid (after blur, only where a rule exists): 18px OK tick inside the right edge; border stays neutral.
- Error: 2px danger border, danger-tint fill, 13/500 danger message below with an alert icon, `role="alert"`, linked with `aria-describedby`.
- Phone: one box with a fixed "+91" segment on the left (sunken fill, hairline divider).
- Select: same box, custom chevron, native picker.
- Checkbox: 22px box, radius 6, `accent-color: #0E4F4F`, whole row 44px high.

### Chips
- Size chip (`sag-chip`): h 48, min-width 52, radius 10, 1.5px control border, white, ink 15/500. Selected: ink fill, white 15/600. Need-size: every chip gets a 1.5px danger border and the label line reads "Please choose a size" in danger. The chip's only text is the exact size (e2e matches `^M$` on a visible, enabled button inside `main`).
- Colour chip: photo thumb 56x70 (4/5, `object-cover object-top`), radius 10, colour name 12px below. Selected: 2px ink border with a 2px white gap. No image: a 40px hex dot.
- Filter / category chip: h 40 (44 tap area), radius 10, white, control border. Selected: ink fill, white text.
- Coupon chip: dashed sale-line border, sale-tint fill, code ink 13/700, value in sale.

### Cards and blocks
- `sag-card`: white, radius 16, 1px line, no shadow, 16px padding. Selected (payment method, saved address): 2px brand border, brand-wash fill.
- `sag-row`: plain row, min-height 52, top hairline, 20px icon, 14/600 title, optional 13px muted sub-line, optional chevron.
- **Assurance block** (new shared component `Assurance.tsx`, `variant="full" | "line"`):
  - Full: brand-wash fill, 1px brand-line, radius 16, four `sag-row`s.
  - Line: one 12px ink-muted line with a lock icon.
  - Text comes from one place so the wording is identical everywhere (see section 6).
- Accordion: plain 56px row, top hairline, 16/600 title, chevron. No icon tile, no box.
- Skeleton: sunken-deep blocks, no shimmer.

### Badges (`sag-badge`)
Height 22, radius 6, 8px side padding, 11/700. Always below the photo, never on it.

| Badge | Fill | Text |
|---|---|---|
| New, Trending | sunken | ink |
| Bestseller | accent-tint | accent |
| Sold out | sunken | ink-muted |
| Applied, Free delivery | ok-tint | ok |
| Count (bag, wishlist) | accent, 18px circle | white 11/700 |

"% off" is sale-coloured text beside the price, not a badge box. Rating: 14px star fill followed by "4.8 · 4 reviews" in ink, shown only when real approved reviews exist.

### Sticky bars (`sag-bar`)
White, 1px top line, `--sag-shadow-bar`, padding `10px 16px calc(10px + env(safe-area-inset-bottom))`, one row, 52px button, about 72px tall. At most one fixed bottom bar per screen. The page reserves matching bottom padding. Bars never hide on input focus.

### Bottom sheet
White, radius 20 on the top corners, 36x4 grab handle, 16/600 title row with a 44px close button, scrim `bg-ink/50`, `max-height: 85dvh`, enters with `sag-enter` at 240ms, closes on scrim tap and Escape, focus trapped. A closed sheet is not rendered (so its buttons never match test selectors).

### Bottom navigation (`MobileAppNavbar.tsx`)
Same five tabs and ids (`mobile-app-bottom-navbar`, `mobile-nav-home|categories|wishlist|cart|account`). White, 56px plus safe area, top hairline. Inactive: 24px outline icon and 11/500 label in ink-muted. Active: brand icon and 11/700 label with a 3px brand bar at the top edge of the tab. No pill, no lift, no looping icon. Count badges are rani. Hidden on product page, checkout, admin (as now) and additionally on the bag page (`activePage === 'cart'`). Keep the `nav.fixed.bottom-0` classes; the view-transition CSS keys on them.

### Header (`Header.tsx`)
52px, white, bottom hairline, sticky, no entrance animation, no colour change on scroll. Keep the `header.sticky` classes and all `header-*`, `mobile-menu-trigger`, `desktop-search-field`, `nav-link-*` ids.
- Phone: menu, logo (max 32px high), then search and bag (44px each). Wishlist is hidden on phone with CSS, not deleted. The search button keeps its accessible name starting "Search suits".
- Desktop: logo, category links Inter 14/500 (active has a 2px brand underline), search, wishlist, account, bag.
- Announcement bar: 32px, dark `#12211F`, on-dark 13/500, one static line (admin text or a real live offer), highlighted words in `#F2C14E`. No marquee. It scrolls away with the page.
- Checkout variant: see section 4.

### Toasts
Top-anchored, 8px under the header, white card, radius 12, 4px left rule (ok, danger or ink), 18px icon plus 14/20 text, two lines max, `--sag-shadow-pop`, existing timing, `role="status"`, one at a time.

### Icons and motion
- lucide outline at 20 or 24px, stroke 1.75. The `svg.lucide:not([class*="text-"])` rule changes from plum to `currentColor`.
- `StoreIcons` render static (`live={false}`), single stroke in `currentColor`, no gradient tiles.
- Removed: `.sag-live` loops, hero Ken Burns, marquees, perks scroller, staggered reveals, shimmer, header entrance stagger.

---

## 3. Product page (`src/components/ProductDetailPage.tsx`)

Unchanged logic: `addToCart`, `buyNow`, `requireSize`, `notifyRestock`, `pickColor`, tracking effects, JSON-LD (`product-jsonld`, `breadcrumb-jsonld`), the `todayStats` fetch and its thresholds. Ids kept: `product-detail-page`, `pdp-size-selector`, `pdp-reviews`, `pdp-add-to-bag`, `pdp-buy-now`.

One wiring change, UI only: `onAdd(sizeOverride?)` and `onBuy(sizeOverride?)` use `sizeOverride ?? size`. The calls into `addToCart` / `buyNow` stay identical.

### 3.1 First screen (390 wide; about 700px visible inside Instagram)

| # | Block | Height |
|---|---|---|
| 1 | Announcement bar (only when admin text or a live offer exists) | 32 |
| 2 | Header | 52 |
| 3 | Gallery: scroll-snap strip, slides 84% wide (328x410, aspect 4/5, `object-cover object-top`, radius 12), 16px left gutter, next photo peeks | 410 + 8 top |
| 4 | Indicator row under the photo: 3px segments (ink active, line inactive) and "1 / 7" in 12px ink-muted | 20 |
| 5 | Title row: name 18/24 600 (2 lines max), 44px wishlist heart and 44px share button on the right | 32-56 |
| 6 | Rating link (only with real approved reviews): stars, "4.8 · 4 reviews", scrolls to `#pdp-reviews`. Row has a reserved min-height of 20 | 20 |
| 7 | Price row: ₹850 (28/700) · ₹1,999 struck · 57% off in sale. Then 13px "You save ₹1,149" in sale, "Inclusive of all taxes" in ink-muted | 54 |
| 8 | Sticky buy bar (fixed) | 72 |

Blocks 1-6 end at about 598px with a one-line title and the price row begins inside the 628px left above the bar. The price is also in the bar, so the amount and the Buy button are on screen at all times, even with a two-line title.

Gallery rules:
- Nothing is drawn on the photo. The counter and dots move below it.
- Native `scroll-snap-type: x mandatory` on a `sag-scroll-x` strip; `imageIdx` updates from an `onScroll` handler throttled with `requestAnimationFrame`; `pickColor` and thumbnail clicks call `scrollTo` on the strip. The manual touch handlers are removed on phone.
- Slide 1 keeps `fetchPriority="high"`, `data-vt-hero` and the `pdp-hero` view-transition name. Other slides are `loading="lazy"` inside fixed aspect boxes.
- Tap opens the existing lightbox (background dark at 95%).
- The phone thumbnail strip is removed (the colour chips replace it). Desktop keeps the vertical thumbnails.

### 3.2 Sticky buy bar (phone)

Single row: price block on the left (₹850 16/700 over "57% off" 12/600 sale; shows `price * qty`), then "Add to bag" secondary (flex 1), then "Buy now" primary (flex 1.3).
- "Add to bag" keeps exactly that accessible name; it shows the tick and "Added" for the existing window.
- Size required and none chosen: either button opens the size sheet ("Choose your size") with the product thumb, price, the same chips, the Size guide link and one full-width primary button that repeats the action ("Add to bag" or "Buy now"). Pick a chip, press the button, and it calls `onAdd(size)` / `onBuy(size)`. No auto-proceed.
- One-size, Free Size and toy products never open the sheet.
- The inline selector still shows the red "Please choose a size" state, and `requireSize()` with its toast and scroll stays for `CompleteTheLook`'s `onNeedSize`.
- Sold out: one full-width primary "Notify me when back" (existing restock flow).
- Desktop keeps the inline `#pdp-add-to-bag` and `#pdp-buy-now`; on phone they are `hidden` so the bar button is the first visible "Add to bag".

### 3.3 Below the fold, in order

9. Offer line, only under the existing conditions: one sale-tint row with a tag icon using the existing strings ("₹100 off at checkout when you pay online" / "{n}% off this style at checkout when you pay online"). No computed "effective price". The existing combo line and best coupon (dashed coupon chip with a 44px "Copy" button) sit behind a "1 more offer" disclosure.
10. Real activity line, same thresholds as now: "52 people saved this today", 13px ink-muted with a heart icon.
11. Colour: label "Colour: Red" and the photo colour chips in a horizontal scroller.
12. Size (`id="pdp-size-selector"`): label "Size: Select" / "Size: M" (or "Age"), "Size guide" and "Find my size" tertiary links on the right with 44px hit areas, then the chips in a wrapping row. Kids keep the "Sized by age" note.
13. Quantity and stock on one row: 44px stepper; real "Only N left" in sale when stock is 5 or less (existing rule). No "In stock" label. The "₹850 × 2 = ₹1,700" line stays when qty > 1.
14. Assurance block, full variant, four rows:
    - "Secure online payment" — "UPI, cards and net banking through {active gateway}. Your order is confirmed only after the payment is verified."
    - "7-day returns & exchange" — opens the return policy.
    - "Delivery across India" — "A tracking number is emailed when your order ships." plus the real free-shipping threshold when set. Opens the shipping policy.
    - "Questions about size or fabric? Chat on WhatsApp" — existing `createSupportWhatsAppUrl`.
    - Inside the same card, beneath: the existing `DeliveryCheck` as one row (PIN input `inputMode="numeric"`, `maxLength` 6, inline "Check" secondary button, result as one text line).
15. Customer reviews (`ProductReviews`, `id="pdp-reviews"`), moved above the details on phone. With reviews: average, count, customer photos first. With none: one quiet row, "No reviews yet. Bought this? Write the first review." No empty stars.
16. Product details, open by default: a two-column facts table from the existing `highlights` data (Fabric, Fit, Occasion, Colours, Sizes, Care), which replaces "Why you'll love it" and the "Fabric & care" accordion; then the description clamped to 5 lines with "Read more". Then two collapsed rows: Shipping, Returns & exchanges (existing copy and links).
17. Complete the look (existing component, restyled).
18. Similar styles, then Recently viewed: horizontal scrollers of compact cards.
19. Quiet link row: Compare (when the feature is on), Share on WhatsApp.
20. Breadcrumb at the bottom on phone, small and muted; at the top on desktop.

Layout: one CSS grid with named areas so no block renders twice. Phone: gallery, buy box (5-14), reviews, details. Desktop (`lg`): gallery in column 1; buy box and details in column 2; reviews full width below.

Removed on phone: top breadcrumb, thumbnail strip, on-photo counter and dots, three animated trust tiles, "Why you'll love it" box, "Fabric & care" accordion, "In stock" label, the share/compare pill grid, the two-row sticky bar with the "Choose size" pill, the floating assistant button, every gradient.

---

## 4. Bag and checkout

### 4.1 Bag (`CartContents.tsx`, `CartDrawer.tsx`, `CartPage.tsx`)

- Title "Your bag" (`font-display` 28/32) with "(1 item)" in ink-muted. Both strings are required by the e2e test. No eyebrow, no breadcrumb.
- Line: 84x105 photo (4/5, radius 10), name 14/500 on 2 lines, "Size M · Red" as plain 13px ink-muted text, price 16/700 with struck MRP and "% off" in sale. Row below: 44px stepper on the left; "Move to wishlist" and "Remove" as tertiary links on the right. The separate bin icon goes. Hairlines between lines.
- Nudges (existing `BagNudges`, real settings): one slim brand-wash row with a 4px brand progress bar.
- Coupon: one collapsed 52px row "Apply coupon" with a chevron; the best real coupon shows as a one-tap coupon chip. Expanding reveals the existing `#bag-coupon` input, Apply button and "View all offers". Applied: ok-tint row with a remove control.
- Price details, always expanded: Subtotal, each real discount in sale, Shipping ("Free" in sale), Total 18/700 with "Inclusive of all taxes". One line "You save ₹1,249 on this order" in sale (existing `totalSavings`).
- Assurance line under the totals.
- Sticky bar: "Total ₹750" (18/700) with "incl. taxes" 11px on the left; primary "Checkout securely" with a lock icon on the right. Bottom nav hidden on the bag page.
- Empty bag: icon, "Your bag is empty", primary "Start shopping", secondary "View wishlist (n)" when n is real.

### 4.2 Checkout (`CheckoutPage.tsx`)

Kept exactly: the three states `details | summary | payment`, `setCheckoutStep` (with its scroll to top), `goToStep`, `validateForm`, `handleProceedToPaymentStep`, `handleFieldChangeDebounced`, `handleFieldBlur` (abandoned-checkout save), the PIN lookup and its manual fallback, gateway loading (starts when the step leaves `details`), `handlePlacePrepaidOrder`, payment-return states. Every required field stays required, **including email**. No COD anywhere.

**Enclosed header** (replaces the site header on this page; the normal header controls are hidden with CSS so their ids survive): 52px, back arrow (previous step, or the bag), logo, "Secure checkout" with a lock (13/600 brand), WhatsApp "Help" icon button on the right. No menu, search or bottom nav.

**Stepper**, 40px, three labels always visible: "1 Address · 2 Review · 3 Pay". Done steps show an OK tick and are tappable through the existing `goToStep`.

**Order strip** (all steps, under the stepper): one collapsed row with a 40x50 thumbnail, "1 item · ₹750" and a chevron; when no coupon is applied the row also reads "Have a coupon?". It expands in place to the existing right-column summary (items, coupon field, price details), restyled. The long summary below the form is removed on phone. The strip must not contain a `<select>` (the test takes the first `select` on the page as State).

#### Step 1, Address (`details`)

Card A, "Contact":

| Order | Field | Attributes | Placeholder (must not change) |
|---|---|---|---|
| 1 | Mobile number, "+91" inside the box | `type="tel"` `inputMode="numeric"` `autoComplete="tel-national"` `name="mobile"` `maxLength={10}` | `10-digit mobile number` |
| 2 | First name / Last name (two columns) | `autoComplete="given-name"` / `"family-name"`, `autoCapitalize="words"` | `First name` / `Last name` |
| 3 | Email (required). Label "Email". Helper: "Your order confirmation and tracking number are sent here." | `type="email"` `inputMode="email"` `autoComplete="email"` `autoCapitalize="none"` `autoCorrect="off"` `spellCheck={false}` | `you@example.com` |

Card B, "Delivery address" (saved-address cards stay above it for signed-in shoppers; "Use my location" becomes a tertiary link in the card header):

| Order | Field | Attributes | Placeholder (must not change) |
|---|---|---|---|
| 4 | PIN code. Spinner inside the box during lookup; existing `pincodeHint` as an OK line, `pincodeError` in the error style | `inputMode="numeric"` `autoComplete="postal-code"` `maxLength={6}` | the existing "6-digit PIN code" text |
| 5 | City / State (two columns, filled by the lookup, always editable). State stays the first `select` on the page | `autoComplete="address-level2"` / `"address-level1"` | `New Delhi` |
| 6 | Flat, house no., building | `autoComplete="address-line1"` | `Flat 302, Palm Heights` |
| 7 | Street, area, landmark (same state wiring as today) | `autoComplete="address-line2"` | `MG Road, Near Central Mall` |
| 8 | "Save this address" checkbox, `id="saveAddr"`, 44px row | | |

All fields: real `id`, `name`, `<label htmlFor>`, `enterKeyHint="next"` (`"done"` on the last). The `aria-label`s that repeat the placeholder (for example "New Delhi", "you@example.com") become the real field name; the tests fill by placeholder, so this is safe.

Inline validation (display only):
- Add a pure helper `getFieldErrors()` in the same file that lists `{ field, message }` in the exact order and with the exact conditions and messages of `validateForm` (name, mobile `/^[6-9]\d{9}$/`, email contains "@", house, street and area, city, state, 6-digit PIN, `pincodeError`). `validateForm` keeps its current body and behaviour; a unit check asserts that `getFieldErrors()[0]?.message` equals the message `validateForm` sets, for a table of inputs.
- A field shows its message after blur and after a failed Continue. No validation on keystrokes.
- On a failed Continue, scroll to and focus the first invalid field. The top error banner stays for the summary message and for server and payment errors.

Sticky bar (new on this step, `lg:hidden`): "₹750" with "1 item" on the left; primary "Deliver here · Continue" on the right calling `handleProceedToPaymentStep`. The existing inline button becomes `hidden lg:flex`. Exactly one visible button matches /deliver here/ at any width.

Under the form: Assurance line and "Need help? Chat with us on WhatsApp".

#### Step 2, Review (`summary`)

- "Deliver to" card: name, address, mobile, email, "Change" (`setCheckoutStep('details')`).
- Items: compact lines (56x70 photo, name, "Size M · Red · Qty 1", price) and the existing delivery line, with the estimate only where the code already has `deliveryEstimateText`.
- Price details, expanded, with the "You save" line in sale.
- Gift note as a collapsed checkbox row.
- Assurance line.
- Sticky bar: "₹750" plus primary "Continue to payment". Exactly one visible button with that name.

#### Step 3, Pay (`payment`)

- White amount card: "Amount to pay ₹750" (28/700), "Deliver to {name}, {city} {pin}", "Change address" link. Replaces the dark plum block.
- Payment method: `sag-card` radio cards with the existing titles verbatim ("UPI, cards & net banking", "Pay with PayU") and their existing detail text. Selected: 2px brand border, brand-wash fill. A single active gateway shows as a plain row, not a radio. Text only; no third-party logos.
- The existing "Online payment discount of ₹100 applied." line in sale.
- The existing in-app-browser hint, same instruction, restyled as a sale-tint note with a sale-line left rule, placed directly above the pay bar.
- Reassurance, three `sag-row`s: "Secure {gateway} checkout. Your order is confirmed only after the payment is verified." (existing sentence) · "7-day returns & exchange" · "Payment stuck? Chat on WhatsApp" (existing checkout support link; the "Chat concierge" wording goes).
- "100% Encrypted" badge removed.
- Sticky bar: Assurance line "Secure payment by {gateway}" above a full-width primary "Pay ₹750 securely" with a lock icon, calling `handlePlacePrepaidOrder`. Existing disabled and loading states and stage texts stay.

Payment return, pending and failed panels and `OrderPlacedOverlay`: restyle only, same copy, one primary button each.

Taps from product page to the payment sheet: pick size, Buy now, Deliver here, Continue to payment, Pay (5; 4 for one-size). Typing: 7 fields when the PIN lookup fills city and state, all with autofill attributes.

---

## 5. Rest of the site

**Home** (`HomePage.tsx`, `HeroSection.tsx`, `HomeSections.tsx`, `ShopByCategory.tsx`). Same section order and admin controls from `storefront_settings/homepageSections`. White background with alternate sections on page grey.
- Hero: one photo with nothing over it; below it the headline (`font-display` 28/32), one sentence, "Shop now" primary and "Explore collection" secondary. Slides change by swipe with segment indicators below. No Ken Burns, no autoplay progress bar.
- Assurance band directly under the hero (the four facts in a 2x2 brand-wash grid, tappable).
- Categories: 4/5 photo tiles 104px wide in a scroller, name and real design count beneath; only categories that have products. Category buttons keep their text (the test clicks a visible button "Kids & Toys").
- Featured collection: 2-column grid. New arrivals: horizontal scroller.
- Deal / offer banner: flat sale-tint card built only from live offers; a countdown only where it is tied to a real end time, as now.
- "Why shop with us": the same Assurance content, not a second set of claims.
- Customer reviews: real approved reviews only. Instagram reels restyled.
- Newsletter card on brand wash; keep `#newsletter-section`, the placeholder "Your email address" and the submit button.
- Section header: `font-display` 22/28 title with a "View all" tertiary link on the right.

**Shop and product cards** (`ShopPage.tsx`, `ProductCard.tsx`). Two columns on phone, 12px gap, 16px gutters; 3 at tablet, 4 at desktop. Card (`article#product-card-{id}`) has no border or box: photo 4/5 radius 12 with nothing on it; below, a row with the badge and a 44px wishlist heart (`wishlist-btn-{id}`); name 14/500 on 2 lines; real rating "4.8 (4)" only when reviews exist; price 16/700, struck MRP 13, "% off" 13/700 sale; a 44px full-width secondary "Add to bag" (`add-to-bag-{id}`) that opens the existing inline size picker with 44px chips and turns into an ok-tint "In bag · View" once added. Filter and sort: a sticky 48px row under the header with two secondary buttons that open bottom sheets; the filter sheet's button reads "Show N styles" with the real count. Category chips are ink-filled when selected.

**Footer** (`Footer.tsx`). Dark `#12211F`, on-dark text. Order: "Need help?" (WhatsApp button, contact link), the four assurance facts, links (Shop, Help, Policies) as 48px accordion rows on phone, a text line "UPI · Cards · Net banking · Payments secured by {gateway}", business contact details already on the Contact page, copyright in on-dark-muted 13px. The logo sits on a white chip.

**Account and login** (`LoginPage.tsx`, `AccountPage.tsx`, `AddressBook.tsx`, `TrackOrderPage.tsx`, `OrderConfirmationPage.tsx`, `WishlistPage.tsx`). Login: one white card, `font-display` "Sign in", `sag-input` fields, OTP boxes 48x56 radius 10 (`otp-input-N` kept), primary button, Google sign-in as a secondary button, one line "Track orders, request returns and save addresses". Account: list of 56px rows with icon, label and chevron (`account-tab-*` ids kept). Orders: cards with a status badge (ok delivered, sale in transit, sunken placed), restyled progress steps, primary "Track order". Tracking: vertical timeline, ink dots, brand for the current step. Order confirmation: one OK check pop, order number in large Inter, existing next-steps copy, WhatsApp row.

**Contact and policy pages.** Same content, `sag-input` fields; keep the placeholders "e.g. Priya Patel", "priya@example.com", "How can we help…" and the button "Send message".

**Admin** (`AdminDashboardPage.tsx`, `#admin-root-container`). Layout and density unchanged. The colour codemod applies here too: page and white surfaces, ink text and sidebar, brand primary buttons, danger for destructive, sale for warnings, Inter only, no serif. Rewrite the `#admin-root-container` overrides in `index.css` (lines 91-106 and 170-180) to token classes. Lowest priority; ships after the storefront.

**Worker-rendered emails** stay in the old colours (backend is out of scope). Listed as follow-up.

---

## 6. Copy guidelines

- Plain English, sentence case, short sentences. No uppercase tracked labels.
- Words to use: bag, Buy now, Add to bag, Checkout securely, Deliver here · Continue, Continue to payment, Pay ₹750 securely, Change, Remove, Apply coupon.
- Words to drop: "concierge", "luxury", "curated", "picks", "100% Encrypted", "exclusive", any urgency phrase.
- **Never mention COD or cash on delivery.** Payment is online only.
- **Email is required.** The label is "Email"; the word "optional" never appears beside it.
- The four assurance facts, word for word, from one source (`Assurance.tsx`):
  1. Secure payment by UPI, cards and net banking ({active gateway})
  2. 7-day returns & exchange
  3. Delivery across India
  4. Questions? Chat with us on WhatsApp
  The gateway name is read from the active gateway the payment step already uses, so it never says Razorpay when PayU is active.
- Numbers shown must already exist in the app: real price and MRP, real "% off" and "You save" from those, the real "saved today" count under its existing thresholds, real review average and count, real stock when 5 or less, real coupon and offer values, real free-shipping threshold.
- Never: invented reviews or stars, "X people viewing", stock counts that are not real, countdowns that reset, delivery dates the code does not already compute, "free returns", brand or bank logos.
- Totals are a preview; the server recalculates before payment. Do not add wording that promises a final amount before the pay step.
- Errors say what to do: "Please provide a valid 10-digit Indian mobile number." (existing messages are kept as they are).
- Two helper lines are new and need the owner's yes before launch: "Your order confirmation and tracking number are sent here." (under Email) and "A tracking number is emailed when your order ships." (Delivery row).

---

## 7. Old colour to new token map (for the codemod)

Counts are occurrences in `src` on 2026-10-03.

### 7.1 Solid literals

| Old literal | Count | Was | New token (by utility) |
|---|---|---|---|
| `#4B1D3F` | 2,366 | Deep plum | `bg-` -> `bg-brand` · `hover:bg-` -> `hover:bg-brand-dark` · `text-` -> `text-ink` (then hand-fix real links to `text-brand`) · `border-` -> `border-ink` · `ring-` / `outline-` / `accent-` -> `brand` · `fill-` / `stroke-` -> `currentColor` (`fill-current`) |
| `#3B1532` | 79 | Plum hover | `brand-dark` in every utility |
| `#2A1A26` | 1,735 | Ink | `ink` in every utility |
| `#F3EEF8` | 586 | Soft lavender | `bg-` -> `bg-sunken` · `hover:bg-` -> `hover:bg-sunken` · `border-` -> `border-line` · `text-` (on dark) -> `text-on-dark` |
| `#E6DDF0` | 67 | Deeper lavender | `bg-` -> `bg-sunken-deep` · `border-` -> `border-line` · `::selection` -> `brand-wash` |
| `#F7E4EA` | 76 | Blush | `bg-` -> `bg-sale-tint` (discount badges, the default) · wishlist hover and active fills -> `bg-accent-tint` (hand-fix, search `wishlist`) · `border-` -> `border-sale-line` |
| `#8A2E55` | 94 | Text on blush | `text-sale`; on a wishlist control -> `text-accent` |
| `#FBF7F3` | 216 | Ivory page | `bg-page` on page wrappers, `html, body, #root` and scrollbar track · `bg-sunken` when it sits inside a white card · `text-` (on dark) -> `text-on-dark` |
| `#C5A46D` | 93 | Champagne gold | star `fill-` / `text-` on a star icon -> `star` · `text-` on a dark surface -> `text-highlight` · other `text-` -> `text-ink-muted` · `border-` / `bg-` decorative lines -> `line` |
| `#9C7A45` | 91 | Gold text | `text-ink-muted` (eyebrows, labels) · on a sale or offer row -> `text-sale` |
| `#FFFFFF` | 17 | White | `surface` (`bg-white` / `text-white` stay valid) |
| `#241D1B` | 14 | Admin dark | `bg-` / `from-` -> `bg-ink` (drop the gradient: `from-`/`to-` pairs become a solid `bg-ink`) · `text-` -> `text-ink` |
| `#211C1A` | 8 | Admin ink | `ink` in every utility; `#admin-root-container { color }` -> `var(--sag-ink)` |
| `#E8D2A4` | 6 | Pale gold on dark | `text-` -> `text-highlight` · `border-` -> `border-on-dark-muted` · `bg-` -> `bg-sale-tint` |

Also present and to be mapped in the same pass: `#7E5F33` (5) -> `ink-muted` · `#C2477A` (5) -> `accent` · `#3D0F1F` -> `ink` · `#FAF5EB`, `#FAF7F2` -> `on-dark` · `#D9CCE6` (scrollbar thumb) -> `control` · `rgba(75,29,63,.12)` -> `var(--sag-line)` · `rgba(42,26,38,.4)` placeholder -> `var(--sag-ink-faint)`.

Old named helpers in `index.css`: `bottle-maroon`, `brand-maroon`, `plum` -> `brand` · `antique-gold` -> `star` (text use -> `ink-muted`) · `ivory` -> `page` · `dusty-rose`, `blush` -> `sale-tint` · `charcoal` -> `ink` · `lavender` -> `sunken`. Keep the old names as aliases of the new values for one release, then delete.

### 7.2 Opacity variants

The suffixes in use are /5, /8, /10, /12, /15, /20, /25, /30, /35, /40, /45, /50, /55, /60, /65, /70, /75, /80, /85, /90, /95. Translucent plum and ink are replaced by solid tokens so contrast is guaranteed.

| Old pattern | New |
|---|---|
| `text-[#2A1A26]/85`–`/95`, `text-[#4B1D3F]/85`–`/95` | `text-ink` |
| `text-[#2A1A26]/55`–`/80`, `text-[#4B1D3F]/55`–`/80` | `text-ink-muted` |
| `text-[#2A1A26]/5`–`/50`, `text-[#4B1D3F]/5`–`/50` | `text-ink-faint` (still AA; the old values were not) |
| `placeholder:text-[#2A1A26]/N` | `placeholder:text-ink-faint` |
| `bg-[#4B1D3F]/5`, `/8`, `/10`, `/12` | `bg-sunken` |
| `bg-[#4B1D3F]/15`–`/30` | `bg-sunken-deep` |
| `bg-[#4B1D3F]/35`–`/70` on a full-screen overlay | `bg-ink/50` (scrim) |
| `bg-[#4B1D3F]/80`–`/95` | `bg-brand` |
| `hover:bg-[#4B1D3F]/5`–`/15` | `hover:bg-sunken` |
| `bg-[#2A1A26]/5`–`/12` | `bg-sunken` |
| `bg-[#2A1A26]/30`–`/80` (scrims, overlays) | `bg-ink/50` |
| `border-[#4B1D3F]/5`–`/20`, `border-[#2A1A26]/5`–`/20`, `divide-…` same range | `border-line` / `divide-line` |
| `border-[#4B1D3F]/25`–`/60`, `border-[#2A1A26]/25`–`/60` | `border-control` |
| `border-[#4B1D3F]/65`–`/95` | `border-ink` |
| `ring-[#4B1D3F]/N`, `outline-[#4B1D3F]/N` | `ring-brand` / `outline-brand` (no opacity) |
| `shadow-[#4B1D3F]/N`, `shadow-[#2A1A26]/N` | remove (cards carry no shadow) |
| `from-[#…]`, `via-[#…]`, `to-[#…]` (any colour, any opacity) | remove the gradient; use the solid token for the `from-` colour's row above |
| `bg-[#F3EEF8]/N`, `bg-[#FBF7F3]/N` | `bg-sunken` (≥ /50) or remove (< /50) |
| `bg-[#E6DDF0]/N` | `bg-sunken-deep` |
| `bg-[#F7E4EA]/N` | `bg-sale-tint` |
| `bg-[#FFFFFF]/N`, `bg-white/N` on sticky or header surfaces | `bg-surface` (solid; no backdrop blur) |
| `text-[#FFFFFF]/N`, `text-white/N` on dark | `text-on-dark` (≥ /85) or `text-on-dark-muted` (< /85) |
| `border-[#C5A46D]/N`, `bg-[#C5A46D]/N` | `border-line` / `bg-sale-tint` |
| `text-[#C5A46D]/N`, `text-[#9C7A45]/N` | `text-ink-muted` (on dark: `text-highlight`) |
| `text-[#8A2E55]/N` | `text-sale` |
| `[#241D1B]/N`, `[#211C1A]/N` | same rules as `#2A1A26` |

Codemod order:
1. Land tokens, fonts and base rules in `src/index.css` and `index.html`.
2. Rewrite the CSS rules keyed on literal classes: `[class~="bg-[#4B1D3F]"]` white-ink hacks (lines 149-162), `svg.lucide` plum default (165-167), the admin dark hacks (174-180), `.bg-*`/`.text-*` helpers (127-136), scrollbar, `::selection`, focus ring. After the codemod, the white-ink rule is replaced by one line: `.bg-brand, .bg-brand-dark, .bg-ink, .bg-dark { color: #fff }` scoped to `#app-main-content`, so buttons that never declared a text colour keep white text.
3. Run the codemod with the tables above (regex on `(prefix)-\[#HEX\](/N)?`, case-insensitive).
4. Hand-fix by page in this order: product page, bag, checkout, product card and shop, header and nav, home, footer, account, admin.
5. Final grep must return nothing in `src` and `index.html` for: `4B1D3F`, `3B1532`, `2A1A26`, `F3EEF8`, `E6DDF0`, `F7E4EA`, `8A2E55`, `FBF7F3`, `C5A46D`, `9C7A45`, `7E5F33`, `C2477A`, `241D1B`, `211C1A`, `E8D2A4`, `3D0F1F`, `D9CCE6`, `Cormorant`, `Manrope`, `gradient-to-`.

---

## 8. Things the build must not break

Ids: `app-main-content`, `admin-root-container`, `product-detail-page`, `pdp-size-selector`, `pdp-reviews`, `pdp-add-to-bag`, `pdp-buy-now`, `product-jsonld`, `breadcrumb-jsonld`, `product-card-{id}`, `wishlist-btn-{id}`, `add-to-bag-{id}`, `mobile-app-bottom-navbar`, `mobile-nav-{home|categories|wishlist|cart|account}`, `mobile-menu-trigger`, `header-*`, `desktop-search-field`, `nav-link-*`, `bag-coupon`, `saveAddr`, `otp-input-N`, `account-tab-*`, `newsletter-section`.

Classes and names the view-transition CSS keys on: `header.sticky`, `nav.fixed.bottom-0`, `data-vt-hero`, `pdp-hero`.

e2e contracts (`worker/test/e2e/storefront.mjs`, `customer.mjs`; runs at 390x844 and 1366x900; these files cannot be edited):
- `article[id^="product-card-"]` and `a[href^="/product/"]` exist on home and shop; an `h1` on the product page.
- A button whose name starts "Search suits"; a visible button with text "Kids & Toys".
- Size buttons inside `main`, visible and enabled, whose whole text is the size.
- The first button named exactly "Add to bag" is visible and clickable; after it, the text "Your bag" and "1 item" appear.
- Checkout placeholders: `First name`, `Last name`, `10-digit mobile number`, `you@example.com`, the "6-digit PIN code" text, `Flat 302, Palm Heights`, `MG Road, Near Central Mall`, `New Delhi`; State is the first `select` on the page.
- Exactly one visible button matching /deliver here/i on the Address step and exactly one matching /continue to payment/i on the Review step.
- The Pay step shows the text "UPI, cards & net banking".
- An abandoned-checkout record is saved once the form is filled (the blur handlers must stay attached to the same fields).
- Contact form placeholders `e.g. Priya Patel`, `priya@example.com`, "How can we help…", button "Send message"; `#newsletter-section` with placeholder `Your email address` and a `button[type="submit"]`.

Performance: no new npm packages; two font families only; no backdrop blur on sticky surfaces; fixed aspect boxes on every image; no looping animation; no layout shift from async values (reserve heights).

---

## 9. Open items for the owner

1. Confirm the two new helper lines about emailed confirmation and tracking (section 6).
2. The logo artwork is pink and gold on a soft glow, drawn for a cream page. It is placed on white with clear space and not redrawn; a clean transparent export would look better.
3. Order emails sent by the backend stay in the old plum colours until a separate backend task.
4. `AGENTS.md` sections 1-4 need rewriting to this system when the tokens land.
