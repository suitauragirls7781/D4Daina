# Suit Aura Girls - Brand & UI/UX Guidelines

These rules are set for the "Suit Aura Girls" women's fashion storefront. All code, styles, and UI adjustments must adhere to these guidelines. (Updated 2026-09-28: the owner chose the lavender & plum palette, replacing the earlier wine/gold theme.)

---

## 🎨 1. Core Color System (Lavender & Plum Luxury)
- **Deep Plum** `#4B1D3F` — primary buttons, headings, active states. Hover `#3B1532`.
- **Ink** `#2A1A26` — body text (use opacity steps like `/75`, `/55` for secondary text).
- **Soft Lavender** `#F3EEF8` (deeper `#E6DDF0`) — section tints, chips, icon circles, hover fills.
- **Blush Pink** `#F7E4EA` — discount badges, wishlist hover; text on blush `#8A2E55`.
- **Ivory / Cream** `#FBF7F3` — default page background. **Clean White** `#FFFFFF` — cards, panels, header on scroll.
- **Champagne Gold** `#C5A46D` (readable text tone `#9C7A45`) — used sparingly: eyebrow labels, stars, fine accents.
- **Success**: standard emerald (`emerald-50/200/700/800`). Errors: rose (`rose-50/200/700`).
- **Negative constraint**: no neon colours, no cheap gradients, no artificial glow, no more colours than the list above.

Design tokens and helper classes live in `src/index.css` (`sag-card`, `sag-btn-primary`, `sag-btn-outline`, `sag-eyebrow`, `sag-scroll-x`).

---

## 💎 2. Visual Language
- **Flat, solid surfaces**: buttons and cards use solid colours — no metallic or decorative gradients.
- **Rounded & soft**: cards `rounded-2xl`/`rounded-3xl`, buttons and inputs fully rounded (pill), refined 1px borders (`border-[#4B1D3F]/10`–`/20`).
- **Subtle shadows only** (e.g. `--sag-shadow`); never wide coloured glows.
- **Typography**: Cormorant Garamond for headings (serif), Manrope for body. No tiny text on mobile (body ≥ 14px, labels ≥ 11px).
- **Micro-interactions**: gentle colour transitions and slight image zoom on hover; no excessive animation.

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
