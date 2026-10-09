import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { useAdmin } from '../context/AdminContext';
import { BrandMarqueeHeader } from './BrandMarqueeHeader';
import { HeroSection } from './HeroSection';
import { ArtisanalPromises } from './ArtisanalPromises';
import { FestiveComboOffers } from './FestiveComboOffers';
import { DealOfTheDaySection } from './DealOfTheDaySection';
import { FestiveCollectionSection } from './BestSellersSection';
import { TrendingNowSection } from './TrendingNowSection';
import { CustomerReviews } from './CustomerReviews';
import { ShopByCategory } from './ShopByCategory';
import { PersonalRails } from './PersonalRails';
import { BagReminder } from './BagReminder';
import { FestiveBanner } from './FestiveBanner';
import { OccasionSection } from './OccasionSection';
import { AuraReelsSection } from './AuraReels';
import { AskAssistantRow, FeaturedCollection, HomeAssuranceBand, KidsCorner, NewArrivalsRail, NewsletterSignup, OfferBanner, WhyShop } from './HomeSections';
import { Thread, requestMeasure } from '../aura';

/**
 * The homepage as one scroll story. Every section sets the colour of the page while it is under the reader's
 * eye (`data-th` on the section itself: paper, ink, blush, forest, rose, sand) and a thin rose thread runs
 * down the page through the gutters, drawn by scrolling (src/aura/Thread.tsx): around the hero's arch, down
 * one side of a section, across to the other side in the gap before the next one, to the end of the page.
 * Which sections are shown, and in which order, is still the owner's list in Admin → Homepage.
 */
export const HomePage: React.FC = () => {
  const { homepageSections = [] } = useAdmin();
  const host = useRef<HTMLDivElement>(null);

  const renderSectionComponent = (key: string) => {
    switch (key) {
      case 'brandHeader':
        return <BrandMarqueeHeader />;
      case 'categoryGrid':
        return <ShopByCategory />;
      case 'hero':
        return <HeroSection />;
      case 'artisanalPromises':
        // Same four facts as the band under the hero, so it is not drawn twice on one page
        return heroOn ? null : <ArtisanalPromises />;
      case 'comboOffers':
        return <FestiveComboOffers />;
      case 'dealOfTheDay':
        return <DealOfTheDaySection />;
      case 'newArrivals':
        return <NewArrivalsRail />;
      case 'auraReels':
        return <AuraReelsSection />;
      case 'kidsCorner':
        return <KidsCorner />;
      case 'bestSellers':
        return <FeaturedCollection />;
      case 'trending':
        return <TrendingNowSection />;
      case 'festive':
        return <FestiveCollectionSection />;
      case 'specialOffer':
        return <OfferBanner />;
      case 'whyShop':
        return <WhyShop />;
      case 'reviews':
        return <CustomerReviews />;
      case 'instagram':
        // Removed from the homepage at the owner's request (2026-10-09)
        return null;
      case 'newsletter':
        return <NewsletterSignup />;
      default:
        return null;
    }
  };

  const enabledKeys = new Set(homepageSections.filter((section) => section.enabled !== false).map((section) => section.key));
  const heroOn = enabledKeys.has('hero');
  const dealOn = heroOn && enabledKeys.has('dealOfTheDay');

  const visibleSections = [...homepageSections]
    .filter((section) => section.enabled !== false && section.key !== 'instagram' && !(dealOn && section.key === 'dealOfTheDay'))
    .sort((first, second) => first.order - second.order)
    // The story opens with the hero (its arch opens as the page starts to scroll); everything else keeps the owner's order
    .sort((first, second) => Number(second.key === 'hero') - Number(first.key === 'hero'));

  // The festive panel and the "your bag is waiting" row: straight after the hero (at the very top when the
  // hero is switched off). Their wrappers add no space when they draw nothing.
  const notices = (
    <React.Fragment key="notices">
      <div className="hm-part"><div className="mx-auto w-full max-w-[1120px] px-3 lg:px-0"><BagReminder className="mb-4 mt-2" /></div></div>
      <div className="hm-part"><div className="mx-auto w-full max-w-[1120px] px-3 lg:px-0"><FestiveBanner className="mb-12 mt-4 lg:mb-16" /></div></div>
    </React.Fragment>
  );

  // The thread's side for each part of the page: left, then right, then left... A part that draws nothing
  // gets no anchor, and a section that places its own anchors (data-thread inside it) keeps them. Done after
  // every render and whenever the page changes height (sections arrive as the catalogue loads); the thread
  // itself is rebuilt by the scroll engine's next measure pass, never on a scroll frame.
  const assignThread = () => {
    const root = host.current;
    if (!root) return;
    // The hero's own thread leaves in the left gutter
    let side: 'left' | 'right' = 'left';
    let changed = false;
    for (const part of Array.from(root.children) as HTMLElement[]) {
      if (!part.classList.contains('hm-part')) continue;
      const own = part.querySelectorAll<HTMLElement>('[data-thread]');
      let want: string | null = null;
      if (own.length > 0) {
        const last = own[own.length - 1].dataset.thread;
        if (last === 'left' || last === 'right') side = last === 'left' ? 'right' : 'left';
      } else if (!part.hasAttribute('data-nothread') && part.offsetHeight >= 8) {
        want = side;
        side = side === 'left' ? 'right' : 'left';
      }
      if (part.getAttribute('data-thread') !== want) {
        if (want) part.setAttribute('data-thread', want);
        else part.removeAttribute('data-thread');
        changed = true;
      }
    }
    if (changed) requestMeasure();
  };
  useLayoutEffect(assignThread);
  useEffect(() => {
    const root = host.current;
    if (!root || !('ResizeObserver' in window)) return undefined;
    const watch = new ResizeObserver(assignThread);
    watch.observe(root);
    return () => watch.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div id="dynamic-storefront-homepage" ref={host} data-aura="" className="relative flex w-full min-w-0 flex-col gap-0">
      <Thread containerRef={host} />
      {!heroOn && notices}
      {visibleSections.map((section, index) => (
        <React.Fragment key={section.id}>
          {/* The hero draws its own thread around the arch; the page's thread starts under it */}
          <div className="hm-part" data-nothread={section.key === 'hero' ? '' : undefined}>{renderSectionComponent(section.key)}</div>
          {section.key === 'hero' && (
            <>
              {notices}
              {/* The store's facts as the kinetic band; the deal follows when both are on */}
              <div className="hm-part"><HomeAssuranceBand /></div>
              {dealOn && <div className="hm-part"><DealOfTheDaySection /></div>}
            </>
          )}
          {index === 2 && <div className="hm-part"><PersonalRails /></div>}
          {index === 3 && <div className="hm-part"><OccasionSection /></div>}
        </React.Fragment>
      ))}
      {/* The assistant sits in the page here; its floating button is kept off product cards and photos */}
      <div className="hm-part"><AskAssistantRow /></div>
    </div>
  );
};
