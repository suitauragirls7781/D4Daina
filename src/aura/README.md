# Aura: the shared pieces

Everything a page needs to look and move like the Aura design. Import from `src/aura` (the folder's `index.ts`):

```tsx
import { AuraTitle, Odometer, Seg, Icon, useScrollFx, setVar, useNoPin, flyToBag } from '../aura';
```

The CSS lives in `src/index.css` (the tokens at the top, the block "Aura" near the end). Nothing here needs a
new npm package.

## 1. Colours

Token classes (Tailwind): `bg-page` paper, `bg-surface` white, `bg-sunken` sand tint, `bg-sunken-deep` sand,
`text-ink`, `text-ink-muted`, `text-ink-faint`, `border-line`, `border-control`, `bg-brand` / `text-brand` INK,
`text-sale` dark rose ("% off"), `text-accent` / `bg-accent` rose, `text-star` ochre, `bg-ok` / `text-ok` forest,
`text-danger`, `bg-dark` ink, `text-on-dark` paper, `text-on-dark-muted`, `text-highlight` / `bg-highlight` blush,
`bg-blush`. Never a hex or `rgba()` in a component. CSS variables you may use:
`var(--aura-paper|ink|rose|drose|blush|sand|forest)`, the easings `var(--aura-e|eo|sp|io)` and the section
variables below. Text on a rose fill is ink, on ink / forest / dark rose it is paper.

### Section colours: `data-th`

```tsx
<section data-th="ink">      {/* paper | ink | blush | forest | rose | sand */}
  <p className="aura-lbl">Why us</p>          {/* muted label, follows the section */}
  <h2 className="aura-h2">Made to <em>last</em></h2>
  <div className="aura-card aura-lt p-5">ink on white again</div>
</section>
```

- Put `data-th` on the page's top-level sections. Sections stay TRANSPARENT: the colour is the one fixed
  backdrop (`<Backdrop />`, mounted once by the site frame), which cross-fades when the section "under the
  reader's eye" changes (45% down the screen). Where no themed section is under the eye the page is paper.
- With the colour, `<body data-th>` switches these variables: `--fg` text, `--inv` text on a filled button,
  `--mu` muted text, `--hl` hairline, `--ac` the accent word, `--sa` "% off" / savings, `--th` the thread,
  `--bg` the backdrop. Text simply inherits `--fg`.
- Classes that read them: `aura-fg`, `aura-mu`, `aura-ac`, `aura-sa` (text) and `aura-hl` (border colour).
- `aura-lt`: a light surface inside any section (variables and text back to ink on white). `aura-card` and
  every `bg-surface` / `bg-page` / `bg-sunken` / dialog already do this.
  `aura-dk`: a dark block inside a light section (use with `bg-ink` or `bg-ok`). `aura-on-rose`: a rose block.
- Token classes such as `text-ink` do NOT follow the section. Inside a themed section colour text with the
  `aura-*` classes or let it inherit.
- Do not put `data-th` on something sticky or fixed. A themed section is not auto-revealed as a whole (see
  Reveal): move its parts with `data-rv` and `MaskLines`.
- Inside a `[data-th]` section (or under a root marked `data-aura`) the old "force 22px corners on every
  bordered box and 16px on every `object-cover` photo" rules are off: set your own corners.

## 2. Helper classes

They are in `@layer components`, so a Tailwind utility on the same element wins (`aura-h2 text-[40px]`,
`aura-btn mt-6`, `aura-card p-4`).

| Class | What it is |
| --- | --- |
| `aura-h1`, `aura-h2` | The big heading: Figtree 800, `clamp(44px, 13.2vw, 80px)`, line-height .94. One word inside an `<em>` is the serif italic accent in `--ac`. Smaller steps: add `aura-h-lg` (34-52px), `aura-h-md` (28-44px), `aura-h-sm` (22-30px). |
| `aura-serif` | The serif italic accent on any element (the wordmark's "Aura"). The serif is ONLY ever one accent word. |
| `aura-lbl` | Small capitals label: 13px, 700, .16em, muted. |
| `aura-sub` | The muted 15px line under a title. |
| `aura-btn` | Pill button, 54px, `--fg` fill with `--inv` text (so it inverts on a dark section), ripple from the tap point, soft press. Modifiers: `aura-btn-rose`, `aura-btn-line` (outline), `aura-btn-w` (full width), `aura-btn-sm` (46px). Sentence case, never capitals. |
| `aura-lk` | Bold 15px link, 44px tall, whose underline draws in when it comes into view. |
| `aura-card` | White card, 22px corners, no border, no shadow (also resets the section variables). |
| `aura-blk` | 28px corners for a big block. |
| `aura-rnd` | Round 48px button in `--fg`. With class `ok` its first icon turns away and an `<Icon draw>` inside draws itself. |
| `aura-tag` | Small label under a photo: blush with ink text, 9px corners. `aura-tag-ink`, `aura-tag-rose`. Never on a photo. |
| `aura-num` | Tabular lining figures for prices. |
| `aura-seg` | The segmented control's styles: use the `<Seg>` component. |
| `aura-field` | Field with a floating label (below). |
| `aura-sk` | Photo placeholder: a sand box that breathes until its `<img>` has loaded (class `ok` is set for you). |
| `aura-mq`, `aura-mq-r`, `aura-mq-i` | The kinetic band of very large words (below). |
| `aura-pin-wrap`, `aura-pin` | A pinned section's tall wrapper and its sticky screen-high child (section 5). |

```tsx
<a className="aura-btn aura-btn-w" href="/shop">Shop all <Icon name="arrow" /></a>
<button className="aura-btn aura-btn-line aura-btn-sm">Size guide</button>

<label className="aura-field">
  <input id="co-email" name="email" placeholder="you@example.com" />   {/* keep the real placeholder */}
  <span>Email</span>
  <i />                                                                  {/* the ink line that grows on focus */}
</label>

<div className="aura-sk aspect-[3/4] rounded-[17px]">
  <img src={getCleanImageUrl(url, 640)} alt={name} className="h-full w-full object-cover object-top" />
</div>
```

The OLD helper names still exist and are re-skinned (pills, white cards, sentence case):
`sag-btn-primary` (ink pill, 54px), `sag-btn-outline` (inset 1.5px ink line), `sag-btn-light` (paper pill),
`sag-input` (white 58px field, 16px corners, ink line grows on focus), `sag-chip` (pill; selected = ink),
`sag-glass` / `sag-card` (white card), `sag-glass-strong` (sand card), `sag-glass-bar` (white bar with the
hairline), `sag-link` (bold underlined link), `sag-lnk` (bold link, underline draws in), `sag-eyebrow` /
`sag-label` (small capitals), `sag-badge` (= `aura-tag`), `sag-on-emerald` (an INK surface with paper text),
`sag-orn` (hidden), `sag-arch` (arch-topped frame), `sag-marquee` (slim ink strip). These are static ink /
paper and do not follow `data-th`. Prefer `aura-*` in what you rebuild.

Base rules: `h1`, `h2` and the utility class `font-display` are bold Figtree (not the serif).
`font-display italic` and an `<em>` inside `font-display` are the serif accent. Focus is a 2px rose ring,
3px away. The uppercase rule of `index.css` is unchanged (`uppercase` needs `tracking-[...]` or `sag-caps`).

## 3. Components

### `AuraTitle`: the heading of a page or a section
```tsx
<AuraTitle as="h1" label="Collections" title="Shop by" accent="category" sub={`${count} designs`} id="cat-title" />
<AuraTitle title={['Dress for', 'the']} accent="moment" accentBreak align="center" size="lg" />
```
Props: `label`, `title` (string / nodes = one line, or an array = one masked line each), `accent` (the serif
word, added after the last line, or on its own line with `accentBreak`), `sub`, `as` (`h1|h2|h3`), `align`
(`left` default, `center`), `size` (`xl` default, `lg`, `md`, `sm`), `id` (on the heading), `className`
(wrapper), `titleClassName`, `delay`. `components/SectionTitle.tsx` is a thin wrapper around it with its old
props (`eyebrow`, `title`, `sub`, `id`, `as`, `align`, `ornament`, `className`); it turns the last word of a
plain text title into the accent.

### `MaskLines`: title lines that rise and go from light to bold
```tsx
<MaskLines as="h2" className="aura-h2" lines={['Made to be', <>worn <em>often</em></>]} />
```
Each entry is one masked line; a long line may wrap (it rises as one block; `nowrap` forbids wrapping).
`delay` (ms before the first line), `step` (ms between lines, 90). Plays once when it comes into view.

### `Reveal` and `data-rv`: rise in once
```tsx
<div data-rv>rises 26px</div>
<li data-rv data-rv-delay="120">waits 120ms</li>
<article data-rv="card" className="aura-card">tips up like a card
  <div data-rv="photo" className="aura-sk aspect-[3/4]">…photo unveils from below…</div>
</article>
<Reveal as="section" kind="fade" delay={200}>the same as a component</Reveal>
```
`data-rv` values: empty (up), `fade`, `card`, `photo` (set `--rv-r` to the frame's corner radius, 17px by
default). The element gets class `in` when shown. Things that arrive together follow one another (70ms)
unless `data-rv-delay` says otherwise. One IntersectionObserver for the whole site
(`revealEngine.ts`); elements added later are adopted. Something already on screen when it appears is never
hidden, and the hidden state (`aura-w`) is only ever set by the script. The older automatic reveal still
runs on plain `#main-content section`s (`sag-reveal` / `is-in`), but NOT on a section that has `data-th`,
`data-no-reveal`, or Aura pieces inside. If React rewrites `className` on a raw `data-rv` element it simply
becomes visible; use `<Reveal>` where the class list changes often.

### `Odometer`: a number that rolls
```tsx
<Odometer value={`₹${total.toLocaleString('en-IN')}`} className="text-[26px] font-extrabold" />
<Odometer value={count} roll={false} />   {/* no roll on first paint, only on changes */}
```
Digits roll, other characters just change. The element's text is only the plain value (the digit columns
are drawn by CSS), `aria-label` carries it too; with reduced motion it is a plain `<span>`.

### `Seg`: the pill segmented control
```tsx
<Seg ariaLabel="Category" scroll options={['All', ...categories]} value={filter} onChange={setFilter} />
<Seg ariaLabel="Size" variant="box" options={sizes.map((s) => ({ value: s, disabled: !inStock(s) }))} value={size} onChange={setSize} />
```
Real `button`s with `aria-pressed`, one ink indicator that slides. `options`: strings or
`{ value, label?, ariaLabel?, disabled? }`. `scroll` puts the row in its own sideways scroller (give that
scroller the side padding you need through `className`). `variant="box"`: a white box with equal parts.

### `Thread`: the rose line drawn by scrolling
```tsx
const host = useRef<HTMLDivElement>(null);
<div ref={host}>
  <Thread containerRef={host} />
  <section data-th="paper" data-thread="left">…</section>      {/* runs down the left gutter */}
  <section data-th="blush" data-thread="right">                 {/* crosses over in its first 48px */}
    <span data-thread="knot" className="ml-[70%] block h-0 w-0" />   {/* a small loop here */}
    <div data-thread="around" className="…photo frame…" />          {/* once around this box, 6px outside */}
  </section>
</div>
```
Anchors are read in document order: `left`, `right`, `center` (a vertical run beside / through that block),
`arch`, `knot` (a small motif where an empty marker sits), `around` (a loop around a box). The line is
re-measured on resize (never per frame), drawn up to 62% of the screen height (`tip`), coloured `--th`, and
sits BEHIND the host's content, so white cards cover it. It changes sides only in the gap at the start of
the next anchor, so give blocks top padding and keep photos out of that first 48px. A section without an
anchor is crossed by the S-curve to the next one: anchor every block, or pass `points={() => [{x, y}, …]}`
(host px) to draw your own path. Props: `gutter` (10), `maxWidth` (1120), `tip`, `dot`. Static full line
with reduced motion.

### `Backdrop`
`<Backdrop watch={pathname} />`, mounted once by the site frame. See "Section colours". `refreshBackdrop()`
re-reads the sections after you add or remove one without the page changing height.

### `flyToBag`, `bumpBag`
```tsx
const onAdd = async (e: React.MouseEvent) => {
  addToBag(product);                                   // the real logic first, never wait for the flight
  await flyToBag(photoRef.current, getCleanImageUrl(product.image, 160));
};
```
A small round copy of the photo flies on a curve to the visible `[data-bag-target]` (the tab bar's bag on
phones, the header's bag otherwise) and that button bumps. Resolves when it lands; does nothing with reduced
motion or without a target. `bumpBag()` only bumps.

### `ripple`
Automatic on `.aura-btn`, `.aura-rnd`, the old `sag-btn-*` and anything with `data-ripple` (the element needs
`position: relative; overflow: hidden; isolation: isolate`). For another element: `onPointerDown={ripple}`.

### `Icon`
```tsx
<Icon name="bag" />   <Icon name="heart" filled size={18} />   <Icon name="check" draw className="in" />
```
Names: menu, search, bag, heart, lock, shield, returns, truck, chat, arrow, up, check, plus, minus, close,
play, pin, copy, trash, user, box, home, grid, pinch. 1.6 stroke, 22px, text colour. `draw`: the icon starts
undrawn and draws itself when it or its parent gets class `in` / `ok`. For any other icon use lucide-react
with `strokeWidth={1.6}`.

### Kinetic band
```tsx
const row = useRef<HTMLDivElement>(null);
const width = useRef(1);
useScrollFx(row, ({ el, y, velocity, time }) => {
  const off = ((time * 0.035 + y * 0.55) % width.current + width.current) % width.current;
  el.style.transform = `translate3d(${-off}px,0,0) skewX(${clamp(velocity * 0.22, -7, 7).toFixed(2)}deg)`;
}, [], { always: true, measure: (el) => { width.current = (el.firstElementChild as HTMLElement).scrollWidth / 4; } });

<section className="aura-mq" data-th="ink" aria-label="Store facts">
  <div ref={row} className="aura-mq-r">
    <div className="aura-mq-i">{[0, 1, 2, 3].map((k) => facts.map((f, i) => (   /* the same real facts four times */
      <Fragment key={`${k}-${i}`}><span className={['', 'o', 's'][i % 3]} aria-hidden={k > 0}>{f}</span><i /></Fragment>)))}</div>
  </div>
</section>
```
`span.o` is outlined, `span.s` is the serif accent, `<i/>` the rose diamond. Only real store facts.

## 4. The scroll engine (`scroll.ts`)

One passive scroll listener, one `requestAnimationFrame` loop for the whole site. It sleeps when nothing is
moving and when the tab is hidden.

```ts
useScrollFx(ref, (frame) => { … }, deps?, { always?, measure? })
```
`frame`: `el`, `y` (scroll position; it glides a little behind the finger, the real one with reduced
motion), `rawY`, `vh`, `vw`, `top`, `height` (the element's cached place in the document), `progress` (0 when
the element's top reaches the top of the screen, 1 when its bottom reaches the bottom: the range of a pinned
section), `enter` (0 when its top enters at the bottom of the screen, 1 when its bottom has left at the top),
`velocity` (smoothed px per frame), `time`.

- `setVar(el, '--p', value)` writes a CSS variable only when the rounded value changed (3 decimals; a 4th
  argument sets the digits). A name without `--` sets a style property.
- `measure(el, { vw, vh, top, height })` in the options runs whenever the engine re-measures (resize, a
  registered element or the page changing size, a photo loading, fonts arriving): cache your own sizes there.
  `requestMeasure()` asks for a re-measure after you changed the layout yourself.
- `always: true`: also called on frames without scrolling while the element is near the screen (a band that
  drifts by itself).
- `useNoPin()` / `noPin()`: true with reduced motion, without `position: sticky` / `overflow: clip`, or on a
  screen shorter than 480px. `<html>` then has class `aura-nopin` (and `aura-rm` with reduced motion).
  `useReducedMotion()` / `prefersReducedMotion()`.
- `clamp(v, min = 0, max = 1)`, `lerp(a, b, t)`, `smooth(t)` (ease in-out for a 0..1 value),
  `getScroll()`, `docTop(el)`, `addScrollFx(el, update, opts)` (outside React; returns the remover).
- Register the tall WRAPPER, never the sticky child or anything inside a sticky box (their `offsetTop`
  moves while scrolling).

## 5. A pinned section

A tall wrapper, a sticky screen-high child, and `useScrollFx` writing variables that CSS turns into
transforms. Nothing is ever pinned by JavaScript and the scroll is never touched.

```tsx
function Unveil({ photo, alt }: { photo: string; alt: string }) {
  const wrap = useRef<HTMLElement>(null);
  const still = useNoPin();
  // no React state here: one CSS variable per frame, and only when it changed
  useScrollFx(wrap, ({ el, progress }) => setVar(el, '--o', smooth(clamp(progress / 0.72))));

  if (still) {                       // reduced motion / no sticky / short screen: a plain section, all visible
    return (
      <section data-th="ink" className="px-4 py-16">
        <AuraTitle title="New this" accent="week" />
        <div className="aura-sk mt-6 aspect-[4/5] rounded-[26px]"><img src={photo} alt={alt} className="h-full w-full object-cover object-top" /></div>
      </section>
    );
  }
  return (
    <section ref={wrap} data-th="ink" className="aura-pin-wrap h-[220vh]">       {/* the scroll range */}
      <div className="aura-pin overflow-hidden">                                {/* sticky, 100svh */}
        <AuraTitle title="New this" accent="week" className="absolute left-4 top-20 z-10" />
        <div className="absolute inset-x-3 bottom-24 top-48 [clip-path:inset(0_calc((1_-_var(--o,0))_*_19%)_round_26px)]">
          <img src={photo} alt={alt}
            className="h-full w-full object-cover object-top will-change-transform [transform:scale(calc(1.16_-_var(--o,0)_*_.16))]" />
        </div>
      </div>
    </section>
  );
}
```
Even if the component forgets the fallback, CSS makes `.aura-pin-wrap` `height: auto` and `.aura-pin`
static under `html.aura-nopin` and reduced motion; but only your static branch can lay the content out
well, so always write it.

## 6. Performance rules (they are requirements)

1. Scroll-linked motion writes ONLY `transform`, `opacity`, `clip-path`, or CSS variables that feed those,
   inside the engine's callback. Never `height`, `top`, `left`, `width`, `margin`, `box-shadow` on scroll.
2. Never set React state on a scroll frame. State may change when a threshold is crossed (which card is
   current), not every frame: compare with a ref first.
3. Never read layout (`getBoundingClientRect`, `offsetWidth`…) in the callback: read it in `measure`.
4. `will-change: transform` only on the few layers that really move, never on a whole section.
5. Nothing may trap or jump the scroll: no `preventDefault` on wheel / touch, no `scrollTo` that fights the
   finger (`Seg` only scrolls its own row), no `overflow: hidden` on an ancestor of a sticky element
   (`html`, `body` and `#root` use `overflow-x: clip`; keep it that way). `overflow: hidden` on the sticky
   child itself is fine.
6. With `prefers-reduced-motion` and under `aura-nopin` every pinned section is a normal static section
   with everything visible. The CSS already stops reveals, mask lines, the odometer, ripples, the thread's
   drawing and all keyframe animations for reduced motion.
7. Phones first (390px). No sideways page scroll, tap targets at least 44px, 16px text in fields.

## 7. Files

`scroll.ts` engine · `revealEngine.ts` reveal + photo placeholders · `Reveal.tsx` · `MaskLines.tsx` ·
`AuraTitle.tsx` · `Odometer.tsx` · `Seg.tsx` · `Thread.tsx` · `Backdrop.tsx` · `fly.ts` · `ripple.ts` ·
`icons.tsx` · `index.ts`.
