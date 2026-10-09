import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { KIDS_TOYS, departmentOf } from '../utils/kids';
import { HOME_SECTION, HomeMore } from './HomeSections';
import { SectionTitle } from './SectionTitle';

// How many real photos one category's arch moves through, and how long each category stays in the light
const MAX_PHOTOS = 4;
const FOCUS_MS = 2800;

/**
 * Category rail at the top of the homepage, built only from categories that have products.
 * It is alive (owner, 2026-10-09): one category at a time is "in the light": its arch lifts a little, its
 * champagne line doubles, its photo changes to the next real photo of that category and a thin line fills
 * under its name; then the light moves on to the next one. On a phone the row follows the light until the
 * shopper touches it. The light stops while the pointer is over a category (that one takes it), while the
 * section is off screen, and for good with reduced motion. Every photo and count is the store's own.
 */
export const ShopByCategory: React.FC = () => {
  const { products = [], navigateToCategory } = useShop();
  const { categories = [] } = useAdmin();

  // Women's categories here; kids wear and toys show as one tile that opens their own page
  const women = useMemo(() => products.filter((p) => departmentOf(p) === 'women'), [products]);
  const kidsToys = useMemo(() => {
    const items = products.filter((p) => departmentOf(p) !== 'women');
    const withPhoto = items.find((p) => p.images?.find(Boolean) || p.image);
    const images = [...new Set(items.map((p) => p.images?.find(Boolean) || p.image || '').filter(Boolean))].slice(0, MAX_PHOTOS);
    return { count: items.length, image: withPhoto ? withPhoto.images?.find(Boolean) || withPhoto.image || '' : '', images };
  }, [products]);
  const cards = useMemo(() => {
    const byCategory = new Map<string, { count: number; images: string[] }>();
    women.forEach((p) => {
      const entry = byCategory.get(p.category) || { count: 0, images: [] };
      entry.count += 1;
      const photo = p.images?.find(Boolean) || p.image || '';
      if (photo && entry.images.length < MAX_PHOTOS && !entry.images.includes(photo)) entry.images.push(photo);
      byCategory.set(p.category, entry);
    });
    return [...byCategory.entries()]
      .map(([name, info]) => {
        const adminCategory = categories.find((c) => c.name === name);
        const adminImage = adminCategory?.image && !adminCategory.image.includes('unsplash.com') ? adminCategory.image : '';
        // The owner's own category photo comes first; the styles' photos follow it
        const images = [...new Set([adminImage, ...info.images].filter(Boolean))].slice(0, MAX_PHOTOS);
        return { name: name as string, count: info.count, images };
      })
      .sort((a, b) => b.count - a.count);
  }, [women, categories]);

  const tiles = useMemo(() => [
    ...cards.map((card) => ({ key: card.name, name: card.name, count: card.count, images: card.images, open: card.name })),
    ...(kidsToys.count > 0 ? [{ key: KIDS_TOYS as string, name: KIDS_TOYS as string, count: kidsToys.count, images: kidsToys.images, open: KIDS_TOYS as string }] : []),
  ], [cards, kidsToys]);

  const sectionRef = useRef<HTMLElement | null>(null);
  const rowRef = useRef<HTMLUListElement | null>(null);
  const [focus, setFocus] = useState(0);
  // Which photo each category shows: it moves on by one every time the light comes to that category
  const [shown, setShown] = useState<Record<string, number>>({});
  const [inView, setInView] = useState(false);
  const [held, setHeld] = useState(false);
  // The arches rise in once, the first time the row is seen
  const [entered, setEntered] = useState(false);
  const rowTaken = useRef(false);
  const [still] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver !== 'function') { setEntered(true); return undefined; }
    const observer = new IntersectionObserver(([entry]) => { setInView(entry.isIntersecting); if (entry.isIntersecting) setEntered(true); }, { threshold: 0.2 });
    observer.observe(section);
    return () => observer.disconnect();
  }, [tiles.length]);

  const running = inView && !held && !still && tiles.length > 1;
  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => setFocus((current) => (current + 1) % tiles.length), FOCUS_MS);
    return () => window.clearInterval(timer);
  }, [running, tiles.length]);

  // The light arrives: that category shows its next photo, and on a phone the row brings it into sight
  useEffect(() => {
    const tile = tiles[focus];
    if (!tile || still) return;
    if (tile.images.length > 1) setShown((current) => ({ ...current, [tile.key]: ((current[tile.key] ?? 0) + 1) % tile.images.length }));
    const row = rowRef.current;
    const element = row?.children[focus] as HTMLElement | undefined;
    if (!row || !element || rowTaken.current || !inView || row.scrollWidth <= row.clientWidth + 4) return;
    const left = Math.max(0, Math.min(row.scrollWidth - row.clientWidth, element.offsetLeft - (row.clientWidth - element.offsetWidth) / 2));
    row.scrollTo({ left, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  if (tiles.length === 0) return null;

  const designs = (n: number) => `${n} ${n === 1 ? 'design' : 'designs'}`;
  const takeRow = () => { rowTaken.current = true; };

  return (
    <section ref={sectionRef} id="shop-by-category" aria-labelledby="shop-by-category-title" className={HOME_SECTION}>
      <div className="max-w-7xl mx-auto">
        <div className="px-4 sm:px-6 lg:px-8">
          <SectionTitle id="shop-by-category-title" eyebrow="Collections" title="Shop by category" className="mb-7 lg:mb-10" />
        </div>

        <ul
          ref={rowRef}
          onTouchStart={takeRow}
          onWheel={takeRow}
          onPointerDown={takeRow}
          onMouseLeave={() => setHeld(false)}
          data-in={entered || still ? 'true' : undefined}
          data-run={inView && !still ? 'true' : undefined}
          className="sag-cats sag-scroll-x flex gap-[18px] overflow-x-auto px-4 pt-5 pb-2 sm:px-6 lg:gap-7 lg:px-8 lg:[justify-content:safe_center]"
        >
          {tiles.map((tile, index) => {
            const lit = index === focus;
            const current = tile.images.length ? (shown[tile.key] ?? 0) % tile.images.length : 0;
            return (
              <li key={tile.key} className="sag-cat w-[31%] shrink-0 sm:w-[150px] lg:w-auto lg:min-w-[128px] lg:max-w-[210px] lg:flex-1" style={{ ['--i' as any]: index }} data-lit={lit ? 'true' : undefined}>
                <button
                  type="button"
                  onClick={() => navigateToCategory(tile.open as any)}
                  onMouseEnter={() => { setHeld(true); setFocus(index); }}
                  onFocus={() => { setHeld(true); setFocus(index); }}
                  onBlur={() => setHeld(false)}
                  className="group flex w-full cursor-pointer flex-col items-center gap-3 text-center"
                >
                  <span className="sag-cat-frame relative block w-full">
                    <span className="sag-cat-photo sag-arch relative block aspect-[3/4] w-full overflow-hidden bg-sunken">
                      {tile.images.length === 0 && <img src={ELEGANT_PLACEHOLDER_SVG} alt="" className="h-full w-full rounded-none object-cover object-top" />}
                      {tile.images.map((image, photo) => (
                        <img
                          key={image}
                          src={getCleanImageUrl(image, 320)}
                          alt=""
                          loading={photo === 0 ? 'eager' : 'lazy'}
                          decoding="async"
                          data-on={photo === current ? 'true' : undefined}
                          className="sag-cat-img absolute inset-0 h-full w-full rounded-none object-cover object-top"
                        />
                      ))}
                    </span>
                    <span className="sag-arch-line" aria-hidden="true" />
                    <span className="sag-cat-ring" aria-hidden="true" />
                    {/* The running line: a short emerald stroke that travels up one side of the arch, over the top and down the other, without end */}
                    <svg className="sag-cat-run" viewBox="0 0 100 134" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                      <path pathLength={1} d="M0.5,134 L0.5,50 A49.5,49.5 0 0 1 99.5,50 L99.5,134" />
                    </svg>
                  </span>
                  <span className="block w-full">
                    <span className="sag-cat-name block font-display text-[17px] font-semibold leading-[1.12] text-ink line-clamp-2 lg:text-[24px]">{tile.name}</span>
                    <span className="sag-num mt-1 block text-[11px] leading-4 text-ink-muted lg:text-[12.5px]">{designs(tile.count)}</span>
                    {/* The thin line that fills while this category is in the light */}
                    <span className="sag-cat-bar mx-auto mt-2 block" aria-hidden="true"><i key={lit && running ? `${focus}-on` : 'off'} style={lit && running ? { animationDuration: `${FOCUS_MS}ms` } : undefined} /></span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <HomeMore onClick={() => navigateToCategory('All')}>
          View all <ArrowRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </HomeMore>
      </div>
    </section>
  );
};
