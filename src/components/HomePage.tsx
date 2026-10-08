import React from 'react';
import { useAdmin } from '../context/AdminContext';
import { BrandMarqueeHeader } from './BrandMarqueeHeader';
import { HeroSection } from './HeroSection';
import { ArtisanalPromises } from './ArtisanalPromises';
import { FestiveComboOffers } from './FestiveComboOffers';
import { DealOfTheDaySection } from './DealOfTheDaySection';
import { FestiveCollectionSection } from './BestSellersSection';
import { TrendingNowSection } from './TrendingNowSection';
import { InstagramGallery } from './InstagramGallery';
import { CustomerReviews } from './CustomerReviews';
import { ShopByCategory } from './ShopByCategory';
import { PersonalRails } from './PersonalRails';
import { BagReminder } from './BagReminder';
import { FestiveBanner } from './FestiveBanner';
import { OccasionSection } from './OccasionSection';
import { AuraReelsSection } from './AuraReels';
import { AskAssistantRow, FeaturedCollection,HomeAssuranceBand, KidsCorner, NewArrivalsRail, NewsletterSignup, OfferBanner, WhyShop } from './HomeSections';

export const HomePage: React.FC = () => {
  const { homepageSections = [] } = useAdmin();

  const renderSectionComponent = (key: string) => {
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
        return <InstagramGallery />;
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
    .filter((section) => section.enabled !== false && !(dealOn && section.key === 'dealOfTheDay'))
    .sort((first, second) => first.order - second.order);

  return (
    <div id="dynamic-storefront-homepage" className="flex flex-col relative gap-0">
      {/* Only for a shopper with something in the bag; the wrapper adds no space when it is empty */}
      <div className="mx-auto w-full max-w-7xl px-3 sm:px-6 lg:px-8">
        <FestiveBanner className="mt-3" />
        <BagReminder className="mt-3 mb-1" />
      </div>
      {visibleSections.map((section, index) => (
        <React.Fragment key={section.id}>
          {renderSectionComponent(section.key)}
          {index === 2 && <PersonalRails />}
          {index === 3 && <OccasionSection />}
        </React.Fragment>
      ))}
      {/* The assistant sits in the page here; its floating button is kept off product cards and photos */}
      <AskAssistantRow />
    </div>
  );
};
