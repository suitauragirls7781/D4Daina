import React from 'react';
import { InstagramIcon } from './BrandIcons';
import { useAdmin } from '../context/AdminContext';
import { instagramEmbedUrl, instagramProfile } from '../utils/instagram';
import { HOME_SECTION } from './HomeSections';

// Reels are managed from Admin → Instagram Reels and synced through the storefront settings.
export const InstagramGallery: React.FC = () => {
  const { instagramReels = [], storeSettings } = useAdmin();
  const profile = instagramProfile(storeSettings?.instagramUrl);
  const textLink = 'text-sale hover:text-brand-dark transition-colors';

  return (
    <section id="instagram-gallery-section" aria-labelledby="instagram-gallery-title" className={HOME_SECTION}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 flex items-end justify-between gap-4 px-4 sm:px-6 lg:mb-6 lg:px-8">
          <div className="min-w-0 max-w-xl">
            <h2 id="instagram-gallery-title" className="font-display text-[20px] font-medium leading-[1.18] text-ink lg:text-[28px]">On Instagram</h2>
            <p className="mt-1 text-[13px] leading-[18px] text-ink-muted">
              New looks and styling reels from{' '}
              <a href={profile.url} target="_blank" rel="noopener noreferrer" className={textLink}>{profile.handle}</a>.
              Tag <span className="text-ink">#SuitAuraGirls</span> to be featured.
            </p>
          </div>
          {instagramReels.length > 0 && (
            <a
              href={profile.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View all on Instagram: follow ${profile.handle}`}
              className={`shrink-0 whitespace-nowrap text-[13px] font-semibold ${textLink}`}
            >
              View all
            </a>
          )}
        </div>

        {instagramReels.length === 0 ? (
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="sag-glass rounded-[26px]! px-5 py-8 text-center">
              <InstagramIcon className="mx-auto h-6 w-6 text-sale" />
              <p className="mt-3 text-[15px] leading-[22px] font-medium text-ink">New reels are on their way</p>
              <p className="mt-1 mb-4 text-[13px] leading-[18px] text-ink-muted">See our latest styles and styling videos on Instagram.</p>
              <a
                href={profile.url}
                target="_blank"
                rel="noopener noreferrer"
                className="sag-btn-outline h-12 max-w-full gap-2 px-5"
              >
                <InstagramIcon className="h-[18px] w-[18px] shrink-0" />
                <span className="truncate">Follow {profile.handle}</span>
              </a>
            </div>
          </div>
        ) : (
          /* Swipe row on mobile, grid from large screens */
          <div className="sag-scroll-x flex lg:grid lg:grid-cols-4 gap-3 lg:gap-5 overflow-x-auto lg:overflow-visible px-4 sm:px-6 lg:px-8 pb-6 -mb-5">
            {instagramReels.map((reel, index) => (
              <figure
                key={reel.url}
                className="sag-glass shrink-0 w-[78%] max-w-[320px] lg:w-auto lg:max-w-none overflow-hidden"
              >
                <iframe
                  src={instagramEmbedUrl(reel)}
                  title={reel.caption || `Suit Aura Girls on Instagram ${index + 1}`}
                  className="block w-full h-[600px] border-0 bg-white"
                  loading="lazy"
                  scrolling="no"
                  allow="encrypted-media; picture-in-picture; clipboard-write"
                />
                {reel.caption && (
                  <figcaption className="px-4 py-3 text-[13px] leading-[18px] text-ink-muted border-t border-line truncate">
                    {reel.caption}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
