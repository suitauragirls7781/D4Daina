import React, { useMemo } from 'react';
import { useAdmin } from '../context/AdminContext';
import { useShop } from '../context/ShopContext';
import { BrandMarqueeHeader } from './BrandMarqueeHeader';
import { HeroSection, buildHeroSlides } from './HeroSection';
import { ArtisanalPromises } from './ArtisanalPromises';
import { FestiveComboOffers } from './FestiveComboOffers';
import { DealOfTheDaySection } from './DealOfTheDaySection';
import { FestiveCollectionSection, pickFestive } from './BestSellersSection';
import { TrendingNowSection, pickTrending } from './TrendingNowSection';
import { InstagramGallery } from './InstagramGallery';
import { CustomerReviews } from './CustomerReviews';
import { ShopByCategory } from './ShopByCategory';
import { PersonalRails } from './PersonalRails';
import { OccasionSection } from './OccasionSection';
import { AuraReelsSection } from './AuraReels';
import {
  AskAssistantRow, FEATURED_ON_PHONE, FeaturedCollection, HOME_RHYTHM, HomeAssuranceBand, KidsCorner, NewArrivalsRail,
  NewsletterSignup, OfferBanner, SeenIds, WhyShop, pickFeatured, pickNewArrivals,
} from './HomeSections';

const NOTHING_SEEN: SeenIds = new Set<string>();
/** The slot after this section (counted among the sections that are switched on) holds the occasions rail. */
const OCCASIONS_AFTER = 3;

export const HomePage: React.FC = () => {
  const { homepageSections = [], heroConfig, dealOfTheDay } = useAdmin();
  const { products = [] } = useShop();

  const enabledKeys = new Set(homepageSections.filter((section) => section.enabled !== false).map((section) => section.key));
  const heroOn = enabledKeys.has('hero');
  const dealOn = heroOn && enabledKeys.has('dealOfTheDay');
  // The four store facts are drawn once on the page: under the hero, or (hero off) in the promises strip
  const factsBandOn = heroOn || enabledKeys.has('artisanalPromises');

  const visibleSections = [...homepageSections]
    .filter((section) => section.enabled !== false && !(dealOn && section.key === 'dealOfTheDay'))
    .sort((first, second) => first.order - second.order);

  /**
   * Walks the page top to bottom, in the admin's order, and notes for every product rail which products are
   * already on the page above it. Each rail then prefers the ones not shown yet (see preferUnseen). The hero
   * slides and the deal of the day are the admin's own picks, so they are only counted, never changed.
   */
  const orderKey = visibleSections.map((section) => `${section.id}:${section.key}`).join('|');
  const seenAbove = useMemo(() => {
    const seen = new Set<string>();
    const bySection = new Map<string, SeenIds>();
    let beforeOccasions: SeenIds = NOTHING_SEEN;
    const note = (ids: Array<string | undefined | null>) => ids.forEach((id) => { if (id) seen.add(String(id)); });
    const noteDeal = () => {
      if (dealOfTheDay?.enabled === false) return;
      note([dealOfTheDay?.productId || products[0]?.id]);
    };
    visibleSections.forEach((section, index) => {
      const above: SeenIds = new Set(seen);
      bySection.set(section.id, above);
      switch (section.key) {
        case 'hero':
          note(buildHeroSlides(heroConfig, products).map((slide) => slide.productId));
          if (dealOn) noteDeal();
          break;
        case 'dealOfTheDay':
          noteDeal();
          break;
        case 'bestSellers':
          // A phone shows the first four cards of this grid
          note(pickFeatured(products, above).slice(0, FEATURED_ON_PHONE).map((p) => p.id));
          break;
        case 'newArrivals':
          note(pickNewArrivals(products, above).map((p) => p.id));
          break;
        case 'trending':
          note(pickTrending(products, above).map((p) => p.id));
          break;
        case 'festive':
          note(pickFestive(products, above).map((p) => p.id));
          break;
        default:
          break;
      }
      if (index === OCCASIONS_AFTER) beforeOccasions = new Set(seen);
    });
    return { bySection, beforeOccasions };
    // orderKey stands for visibleSections (a new array on every render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey, products, heroConfig, dealOfTheDay, dealOn]);

  const renderSectionComponent = (key: string, seen: SeenIds) => {
    switch (key) {
      case 'brandHeader':
        return <BrandMarqueeHeader />;
      case 'categoryGrid':
        return <ShopByCategory />;
      case 'hero':
        // The four store facts sit straight under the hero; the deal follows when both are on
        return dealOn
          ? <><HeroSection /><HomeAssuranceBand /><DealOfTheDaySection /></>
          : <><HeroSection /><HomeAssuranceBand /></>;
      case 'artisanalPromises':
        // Same four facts as the band under the hero, so it is not drawn twice on one page
        return heroOn ? null : <ArtisanalPromises />;
      case 'comboOffers':
        return <FestiveComboOffers />;
      case 'dealOfTheDay':
        return <DealOfTheDaySection />;
      case 'newArrivals':
        return <NewArrivalsRail seen={seen} />;
      case 'auraReels':
        return <AuraReelsSection />;
      case 'kidsCorner':
        return <KidsCorner />;
      case 'bestSellers':
        return <FeaturedCollection seen={seen} />;
      case 'trending':
        return <TrendingNowSection seen={seen} />;
      case 'festive':
        return <FestiveCollectionSection seen={seen} />;
      case 'specialOffer':
        return <OfferBanner />;
      case 'whyShop':
        // With the facts band on the page, this section is one sentence and the WhatsApp action, not the tiles again
        return <WhyShop compact={factsBandOn} />;
      case 'reviews':
        return <CustomerReviews />;
      case 'instagram':
        return <InstagramGallery />;
      case 'newsletter':
        return <NewsletterSignup />;
      default:
        return null;
    }
  };

  return (
    <div id="dynamic-storefront-homepage" className={`flex flex-col relative gap-0 bg-white ${HOME_RHYTHM}`}>
      {visibleSections.map((section, index) => (
        <React.Fragment key={section.id}>
          {renderSectionComponent(section.key, seenAbove.bySection.get(section.id) || NOTHING_SEEN)}
          {index === 2 && <PersonalRails />}
          {index === OCCASIONS_AFTER && <OccasionSection seen={seenAbove.beforeOccasions} />}
        </React.Fragment>
      ))}
      {/* The assistant sits in the page here; its floating button is kept off product cards and photos */}
      <AskAssistantRow />
    </div>
  );
};
