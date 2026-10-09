import React, { useMemo, useRef } from 'react';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { KIDS_TOYS, departmentOf } from '../utils/kids';
import { KineticBand, frameInsets } from './HomeSections';
import { AuraTitle, Icon, clamp, setVar, useNoPin, useScrollFx } from '../aura';

// How many categories become large stacking cards; the rest follow as a row of pills
const STACK = 6;
// Each card's own colour, in turn: ink, rose, white, forest, sand (token classes; the text colour follows)
const CARD_FILL = ['aura-dk bg-dark', 'aura-on-rose bg-accent', 'aura-lt bg-surface', 'aura-dk bg-ok', 'aura-lt bg-sunken-deep'];
// ... and the shape of its photo: arch, circle, round-cornered, leaf, reverse arch
const PHOTO_SHAPE = ['hm-m0', 'hm-m1', 'hm-m2', 'hm-m3', 'hm-m4'];

/**
 * Shop by category, built only from categories that have products. On blush: one row of the category names
 * in very large type that slides with the scroll, the heading, then the categories as large cards that
 * stack: every card is `position: sticky` a little lower than the one before it, so they pile up as the page
 * scrolls, and the covered ones scale down slightly and dim (a transform and an opacity, from the shared
 * scroll engine). Each card has its own colour, its place and the real count of designs, the name in very
 * large type, a round arrow and the category's real photo in its own shape. Every category stays reachable:
 * past the first six they follow as pills. Kids wear and toys are one card that opens their own page.
 * Without pinning (reduced motion, no sticky) the cards are a plain list.
 */
export const ShopByCategory: React.FC = () => {
  const { products = [], navigateToCategory } = useShop();
  const { categories = [] } = useAdmin();

  // Women's categories here; kids wear and toys show as one tile that opens their own page
  const women = useMemo(() => products.filter((p) => departmentOf(p) === 'women'), [products]);
  const kidsToys = useMemo(() => {
    const items = products.filter((p) => departmentOf(p) !== 'women');
    const images = [...new Set(items.map((p) => p.images?.find(Boolean) || p.image || '').filter(Boolean))].slice(0, 1);
    return { count: items.length, images };
  }, [products]);
  const cards = useMemo(() => {
    const byCategory = new Map<string, { count: number; images: string[] }>();
    women.forEach((p) => {
      const entry = byCategory.get(p.category) || { count: 0, images: [] };
      entry.count += 1;
      const photo = p.images?.find(Boolean) || p.image || '';
      if (photo && entry.images.length < 1) entry.images.push(photo);
      byCategory.set(p.category, entry);
    });
    return [...byCategory.entries()]
      .map(([name, info]) => {
        const adminCategory = categories.find((c) => c.name === name);
        const adminImage = adminCategory?.image && !adminCategory.image.includes('unsplash.com') ? adminCategory.image : '';
        // The owner's own category photo comes first; a style's photo stands in for it
        return { name: name as string, count: info.count, image: adminImage || info.images[0] || '' };
      })
      .sort((a, b) => b.count - a.count);
  }, [women, categories]);

  const tiles = useMemo(() => [
    ...cards.map((card) => ({ key: card.name, name: card.name, count: card.count, image: card.image, open: card.name })),
    ...(kidsToys.count > 0 ? [{ key: KIDS_TOYS as string, name: KIDS_TOYS as string, count: kidsToys.count, image: kidsToys.images[0] || '', open: KIDS_TOYS as string }] : []),
  ], [cards, kidsToys]);

  const still = useNoPin();
  const section = useRef<HTMLElement>(null);
  const stack = useRef<HTMLDivElement>(null);
  // Where each card rests and where it sticks, cached by the measure pass
  const place = useRef({ rest: [] as number[], stick: [] as number[], height: 1, inner: [] as HTMLElement[] });

  useScrollFx(section, ({ y }) => {
    const g = place.current;
    if (still) return;
    // A card is covered by the next one as that one rises to its own sticking place
    for (let i = 0; i < g.inner.length; i += 1) {
      const covered = i + 1 < g.rest.length ? clamp(1 - (g.rest[i + 1] - y - g.stick[i]) / g.height) : 0;
      setVar(g.inner[i], '--q', covered);
    }
  }, [still, tiles.length], {
    measure: (el, { top }) => {
      const insets = frameInsets();
      setVar(el, '--hs', `${insets.hs}px`);
      const box = stack.current;
      const g = place.current;
      if (!box || still) { g.inner = []; return; }
      const items = Array.from(box.children) as HTMLElement[];
      const first = items[0];
      if (!first) { g.inner = []; return; }
      // The cards are sticky, so their own offsetTop moves: their resting places come from the stack's top,
      // one card height and the gap between two cards
      const style = getComputedStyle(first);
      const gap = parseFloat(style.marginBottom) || 0;
      g.height = first.offsetHeight || 1;
      const stackTop = top + (box.getBoundingClientRect().top - el.getBoundingClientRect().top);
      g.rest = items.map((_, i) => stackTop + i * (g.height + gap));
      g.stick = items.map((item) => parseFloat(getComputedStyle(item).top) || 0);
      g.inner = items.map((item) => item.firstElementChild as HTMLElement);
    },
  });

  if (tiles.length === 0) return null;

  const designs = (n: number) => `${n} ${n === 1 ? 'design' : 'designs'}`;
  const big = tiles.slice(0, STACK);
  const more = tiles.slice(STACK);

  return (
    <section ref={section} id="shop-by-category" aria-labelledby="shop-by-category-title" data-th="blush" className="hm-cs">
      <KineticBand bare label="Categories" rows={[tiles.map((tile) => tile.name)]} className="hm-cs-mq" />
      <div className="hm-cs-in">
        <span data-thread="arch" aria-hidden="true" className="ml-[72%] block h-0 w-10" />
        <AuraTitle id="shop-by-category-title" label="Collections" title="Shop by" accent="category" accentBreak className="px-2 pb-6" />

        <div ref={stack} data-thread="right" className="hm-cs-st">
          {big.map((tile, index) => (
            <div key={tile.key} className="hm-cc" style={{ '--i': index } as React.CSSProperties}>
              <button
                type="button"
                onClick={() => navigateToCategory(tile.open as any)}
                className={`hm-cc-in ${CARD_FILL[index % CARD_FILL.length]}`}
              >
                <span className="hm-cc-t">
                  <span className="min-w-0">
                    <span className="hm-cc-name">{tile.name}</span>
                    <span className="hm-cc-ix aura-num"><span aria-hidden="true">{String(index + 1).padStart(2, '0')} · </span>{designs(tile.count)}</span>
                  </span>
                  <span className="hm-cc-go" aria-hidden="true"><Icon name="arrow" /></span>
                </span>
                {/* Nothing is drawn on the photo: only its frame has a shape */}
                <span className={`hm-cc-ph ${PHOTO_SHAPE[index % PHOTO_SHAPE.length]}`}>
                  <span className="aura-sk">
                    <img
                      src={tile.image ? getCleanImageUrl(tile.image, 640) : ELEGANT_PLACEHOLDER_SVG}
                      srcSet={tile.image && getCleanImageUrl(tile.image, 640) !== getCleanImageUrl(tile.image, 1100) ? `${getCleanImageUrl(tile.image, 640)} 640w, ${getCleanImageUrl(tile.image, 828)} 828w, ${getCleanImageUrl(tile.image, 1100)} 1100w` : undefined}
                      sizes="(min-width: 900px) 540px, 92vw"
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                </span>
                <span className="hm-cc-dim" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>

        {more.length > 0 && (
          <ul className="hm-cs-more" aria-label="More categories">
            {more.map((tile) => (
              <li key={tile.key}>
                <button type="button" onClick={() => navigateToCategory(tile.open as any)} className="hm-cs-pill">
                  {tile.name}<span className="aura-num">{designs(tile.count)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="px-2 pb-16 pt-5 lg:pb-24">
          <button type="button" onClick={() => navigateToCategory('All')} className="aura-lk whitespace-nowrap">
            View all <Icon name="arrow" size={18} />
          </button>
        </div>
      </div>
    </section>
  );
};
