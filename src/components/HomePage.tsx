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
import { Reveal } from './Reveal';
import { ShopByCategory } from './ShopByCategory';
import { PrepaidPerks } from './PrepaidPerks';
import { PersonalRails } from './PersonalRails';
import { OccasionSection } from './OccasionSection';
import { AuraReelsSection } from './AuraReels';
import { FeaturedCollection, KidsCorner, NewArrivalsRail, NewsletterSignup, OfferBanner, WhyShop } from './HomeSections';

export const HomePage: React.FC = () => {
  const { homepageSections = [] } = useAdmin();

  const renderSectionComponent = (key: string) => {
    switch (key) {
      case 'brandHeader':
        return <BrandMarqueeHeader />;
      case 'categoryGrid':
        return <ShopByCategory />;
      case 'hero':
        // The deal sits straight after the hero (just under the category circles) when both are on
        return dealOn
          ? <><HeroSection /><DealOfTheDaySection /><PrepaidPerks /></>
          : <><HeroSection /><PrepaidPerks /></>;
      case 'artisanalPromises':
        return <ArtisanalPromises />;
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
  const dealOn = enabledKeys.has('hero') && enabledKeys.has('dealOfTheDay');

  const visibleSections = [...homepageSections]
    .filter((section) => section.enabled !== false && !(dealOn && section.key === 'dealOfTheDay'))
    .sort((first, second) => first.order - second.order);

  return (
    <div id="dynamic-storefront-homepage" className="flex flex-col relative gap-0">
      {visibleSections.map((section, index) => (
        <React.Fragment key={section.id}>
          {index <= 1 ? renderSectionComponent(section.key) : <Reveal>{renderSectionComponent(section.key)}</Reveal>}
          {index === 2 && <Reveal><PersonalRails /></Reveal>}
          {index === 3 && <Reveal><OccasionSection /></Reveal>}
        </React.Fragment>
      ))}
    </div>
  );
};
