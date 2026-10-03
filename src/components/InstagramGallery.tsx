import React from 'react';
import { InstagramIcon } from './BrandIcons';
import { useAdmin } from '../context/AdminContext';
import { instagramEmbedUrl, instagramProfile } from '../utils/instagram';
import { HOME_SECTION } from './HomeSections';

// Reels are managed from Admin → Instagram Reels and synced through the storefront settings.
export const InstagramGallery: React.FC = () => {
  const { instagramReels = [], storeSettings } = useAdmin();
  const profile = instagramProfile(storeSettings?.instagramUrl);

  const followButton = (
    <a
      href={profile.url}
      target="_blank"
      rel="noopener noreferrer"
      className="sag-btn-outline h-12 gap-2 px-5 text-[15px] max-w-full"
    >
      <InstagramIcon className="w-[18px] h-[18px] shrink-0" />
      <span className="truncate">Follow {profile.handle}</span>
    </a>
  );

  // No reels added in Admin yet: the section is left out, rather than an empty card
  if (instagramReels.length === 0) return null;

  return (
    <section id="instagram-gallery-section" aria-labelledby="instagram-gallery-title" className={`${HOME_SECTION} bg-page`}>
      <div className="max-w-7xl mx-auto">
        <div className="px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-4 lg:mb-6">
          <div className="min-w-0 max-w-xl">
            <h2 id="instagram-gallery-title" className="font-display text-[22px] leading-7 lg:text-[28px] lg:leading-8 text-ink">On Instagram</h2>
            <p className="mt-1 text-sm leading-5 text-ink-muted">
              New looks and styling reels from{' '}
              <a href={profile.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline underline-offset-[3px]">{profile.handle}</a>.
              Tag <span className="font-semibold text-ink">#SuitAuraGirls</span> to be featured.
            </p>
          </div>
          <div className="hidden md:block shrink-0">{followButton}</div>
        </div>

            {/* Swipe row on mobile, grid from large screens */}
            <div className="sag-scroll-x flex lg:grid lg:grid-cols-4 gap-3 lg:gap-5 overflow-x-auto lg:overflow-visible px-4 sm:px-6 lg:px-8 pb-1">
              {instagramReels.map((reel, index) => (
                <figure
                  key={reel.url}
                  className="shrink-0 w-[78%] max-w-[320px] lg:w-auto lg:max-w-none rounded-card overflow-hidden bg-white border border-line"
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
            <div className="mt-5 px-4 flex justify-center md:hidden">{followButton}</div>
      </div>
    </section>
  );
};
