# Suit Aura Girls - Brand & UI/UX Guidelines

These rules are set for the "Suit Aura Girls" women's fashion storefront. All code, styles, and UI adjustments must adhere to these guidelines. (Updated 2026-10-08: the owner found the green + gold design "cartoon-like" and chose **"Noir & Champagne"** from two premium previews, for every page at every width. It replaces every earlier look: do not bring back filled colour blocks, pills, turning rings, floating or waving parts, the green, the teal, the violet or the pastel palettes. The brand is always "Suit Aura Girls".)

---

## 🎨 1. Core Color System (Noir & Champagne)
White pages, near-black text and buttons, a little champagne gold. Use the token classes (`bg-surface`, `text-ink-muted`, `border-line` …), never raw hex in components. Tokens are defined once in `src/index.css` (`@theme`, mirrored on `:root` as `--sag-*`). The token NAMES are kept from the earlier systems (`lilac`, `peach`, `mint`, `sky`, `butter`, `sun` are only names and are all quiet tints now): do not read a colour into a name.

- **White** — `page` and `surface` `#FFFFFF`. The one quiet tint is `sunken` `#F6F4F0` (a notice, the offers box, the "In short" box, the review section, photo placeholders).
- **Near-black** `#161514` — `ink` (text), `brand` (the primary button, links, selected outlines; hover `#2E2C2A`), `dark` (only the footer, the thin announcement line above the header, and the two framed homepage panels: the festive offer and the deal of the day). Secondary text `ink-muted` `#6B6762`, faint `#7A756F`.
- **Champagne** — as text `sale` / `accent` `#8A6A36` (small eyebrow labels, "% off", "You save", the icons of the four facts); `star` / `sun` `#A6824A` for review stars; `highlight` `#C9A66B` for champagne text on the dark footer. Never a filled champagne button or block.
- **Lines** — `line` `#E4E0DA` hairlines everywhere; `control` `#9A948C`.
- **Outside these, only where meaning needs it**: `danger` red `#B3261E` for errors (with an icon and words), the green inside the WhatsApp glyph, and the product photos.
- **Negative constraint**: no filled colour blocks as section, card, banner or icon-circle backgrounds; no gradients, glows or shadows; no second accent colour.

Helper classes live in `src/index.css`: `sag-btn-primary` (black, square, small capitals), `sag-btn-outline` (1px black border), `sag-link` (thin underline), `sag-input` (square, hairline), `sag-label` and `sag-eyebrow` (small letter-spaced capitals), `sag-chip` (square outline box; selected = ink border), `sag-badge`, `sag-card` (hairline box), `sag-row`, `sag-bar`, `sag-num`, `sag-scroll-x`. The four trust facts are worded once in `src/components/Assurance.tsx`; reuse that component instead of writing new claims.

---

## 💎 2. Visual Language
- **Calm and sharp**: sections are separated by white space and a hairline (`border-t border-line`), not by coloured blocks. Corners are square (all radius tokens are 0); round shapes are only for colour swatches, the heart on a photo, avatars / the logo mark, radio dots and timeline dots. No shadows (a fixed bar has a top hairline).
- **Typography**: two families only. **Figtree** for all text and every number, at regular and medium weights (semibold for prices and totals; no bold / extrabold). **Fraunces** (`font-display`, weight 500) for the wordmark, page titles, section titles, the hero title and dialog titles; never for prices, product names, order numbers, forms, buttons or navigation. Small labels (eyebrows, button text, field labels, the steps, Filter / Sort) are letter-spaced capitals; everything else is sentence case. Prices use tabular figures (`sag-num`). Body ≥ 13px, labels ≥ 10.5px, text in fields 16px.
- **Buttons**: primary is black, square, white small letter-spaced capitals; secondary is white with a 1px black border. "Buy now", "Checkout" and the pay button are the black primary. Links are text with a thin underline. Tap targets at least 44×44px from tablet width up (36-40px on phones, see Phone scale).
- **Icons**: thin outline icons (lucide, `StoreIcons`) in the colour of the text or in champagne for the four facts; never inside a filled circle.
- **Motion** (owner, 2026-10-08: calm, one-time, premium, on every page): the new page rises in; every section rises in once as it comes into view (`src/utils/reveal.ts`), with a thin champagne rule drawing under its title; buttons fill from the left on hover and press slightly; product photos zoom slowly under the pointer; the heart beats once, the bag icon bumps once, changed totals settle in. The hero photo drifts slowly, its words rise in, slides change by themselves every 6 seconds with a thin progress line. The festive panel and the deal of the day are the two dark, framed panels on the homepage: the festive one carries a live countdown to the coupon's real last day and a silhouette scene (Ravan Dahan for Dussehra, diyas for Diwali); the deal's price counts once to the real price and shows a clock only for a real end time. No spinning rings, bouncing stickers, waving letters, blinking or marquees. `prefers-reduced-motion` removes all motion.
- **Header**: a thin dark announcement line (the live festive round from `useFestiveRound()`, nothing when none is live), then one white sticky bar with a hairline: menu, the wordmark "SUIT AURA GIRLS" centred in Fraunces capitals, search and bag (real count). Desktop: the wordmark, a square hairline search field and the menu row in small capitals.
- **Search**: an underlined field; with an empty field "Trending now" (real product photos with prices) and "Collections" as plain rows with real counts.
- **Phone menu**: a white panel: wordmark and close, a tinted sign-in row with a black button, the main links as large serif rows with hairlines and real counts, "Collections" as square outline chips, then Track order / Returns / WhatsApp rows.
- **Bottom navigation (phones)**: a white bar with a top hairline: Home, Shop, Wishlist, Bag (real count), Account; the current one in ink, the others muted. At most one fixed bottom bar per screen.
- **Hero**: per slide the photo full-bleed and square, and under it, centred on white: the eyebrow, the serif title, the real price and "% off", black "Shop now" and outline "Explore". Nothing is drawn on the photo.
- **Trust facts**: a plain grid of thin champagne icon + the fact between hairlines (two columns on phones, four on desktop). "How your order works" is a hairline box with three numbered rows.
- **Shop by category**: a swipe row of rectangular 3:4 photos with the name under each.
- **Product card**: no card chrome. The photo (4:5, square) with the heart in a small white circle; under it a real badge as a tiny champagne label, the name in two lines, a small rating line with one champagne star when real, the price line, and "Add to bag" as a quiet underlined control. Grids are two columns on phones (12px / 18px gaps); rails give each card about 150px.
- **Homepage sections**: serif title left, underlined "View all" right. Deal of the day is a hairline box (photo, eyebrow, name, price, "You save ₹X", black "View deal"; the clock only for a real end time). Customer reviews is the one tinted section: a centred serif italic quote with small champagne stars, the name and "Verified purchase" when true, and the real average and count.
- **Shop page**: serif title with the real count, square outline quick filters, one Filter | Sort row in small capitals between hairlines (sticky under the header), the grid.
- **Product page**: one large square-cornered photo with a "1 / N" count and a row of small thumbnails; the badge as an eyebrow, the name, heart and share as plain icons, the price, the rating line, the offers as one tinted box of plain lines, round colour swatches, square size boxes, black "Buy now" over outline "Add to bag", the four facts between hairlines, the PIN code check as a hairline area, then details as "+" rows. The fixed buy bar is white with a top hairline.
- **Bag**: serif title, a tinted savings notice, lines separated by hairlines, a hairline coupon box, plain price rows and a black "Checkout".
- **Checkout** (two steps: address, then payment; one "Full name" field): a white bar "SECURE CHECKOUT" with a thin lock and an underlined "Help", the steps as small capitals, hairline boxes for the order and the address, the title "How would you like to pay?". Email stays required. **Cash on delivery** (Admin → Settings switches it and sets the charge): two hairline options, "Pay online now" (the online payment discount) and "Cash on delivery" (the charge is paid by UPI through Razorpay to confirm, the rest is collected in cash at delivery; no online discount); with cash on delivery chosen a tinted box shows the prepaid saving and a way back to online payment. The order stores `payMode`, `codAdvance` and `codDue`; order pages, emails and Admin always show what was paid online and what is still to be collected. PayU is never used for the advance.
- **Order placed**: centred on white: an outline circle with a tick, the eyebrow, the serif title, the real order number, a hairline box with the items and payment rows, black "Track order". **Order tracking**: a hairline box with the state in words and a thin four-part progress line, the reached stages as a plain timeline with their real times, then "Courier tracking" (only with a real link) and "Help".
- **Sign in**: a white page with the logo mark, serif "Welcome", outline "Continue with Google", the email field and a black "Send code". **My account**: the latest order as a hairline box, then plain rows with thin champagne icons.
- **Wishlist**: a two-column photo grid with name, price and an outline "Move to bag". There is no per-style price-drop switch (the store has no such setting).
- **Help and policy pages**: an eyebrow, the serif title, a tinted "In short" box whose points are taken from that policy's own text, then the full text in numbered hairline sections.
- **Footer**: the only dark block: wordmark, links in columns, plain social icons, the address and one line of small print from the store's real facts.
- **Festive month**: the announcement line, a hairline box on the homepage and a tinted row on the shop page, all drawn only while that round's coupon is live (`FestiveBanner.tsx`).
- **Phone scale**: on phones (below 640px) the layout sits one size smaller: `src/index.css` sets the root size to 90.6%, body text 14px, buttons and fields 46px high; text inside fields stays 16px so a phone does not zoom on focus. Do not size phone elements up again.
- **Focus**: a visible 2px ink outline on everything (white on the dark footer).

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
1. Header (the festive announcement line when a round is live, then the white bar)
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
