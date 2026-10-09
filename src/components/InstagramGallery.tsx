import React from 'react';
import { InstagramIcon } from './BrandIcons';
import { useAdmin } from '../context/AdminContext';
import { instagramEmbedUrl, instagramProfile } from '../utils/instagram';
import { HOME_SECTION } from './HomeSections';
import { AuraTitle, Icon } from '../aura';

// Reels are managed from Admin → Instagram Reels and synced through the storefront settings.
export const InstagramGallery: React.FC = () => {
  const { instagramReels = [], storeSettings } = useAdmin();
  const profile = instagramProfile(storeSettings?.instagramUrl);
  const textLink = 'aura-fg font-bold underline decoration-[1.5px] underline-offset-4';

  return (
    <section id="instagram-gallery-section" aria-labelledby="instagram-gallery-title" className={HOME_SECTION}>
      <div className="max-w-7xl mx-auto">
        <AuraTitle
          id="instagram-gallery-title"
          title="On"
          accent="Instagram"
          sub={<>
            New looks and styling reels from{' '}
            <a href={profile.url} target="_blank" rel="noopener noreferrer" className={textLink}>{profile.handle}</a>.
            Tag <span className="aura-fg font-semibold">#SuitAuraGirls</span> to be featured.
          </>}
          className="px-4 sm:px-6 lg:px-8"
        />
        <div className="mb-4 mt-2 flex min-h-3 px-4 sm:px-6 lg:mb-7 lg:px-8">
          {instagramReels.length > 0 && (
            <a
              href={profile.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View all on Instagram: follow ${profile.handle}`}
              className="aura-lk"
            >
              View all
              <Icon name="arrow" />
            </a>
          )}
        </div>

        {instagramReels.length === 0 ? (
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="aura-card aura-blk aura-lt px-6 py-10">
              <span className="flex h-[54px] w-[54px] items-center justify-center rounded-full bg-ink text-on-dark"><InstagramIcon className="h-6 w-6" /></span>
              <p className="aura-h2 aura-h-sm mt-5 text-ink">New reels are on their <em>way</em></p>
              <p className="mt-2 mb-5 text-[15px] leading-[1.45] text-ink-muted">See our latest styles and styling videos on Instagram.</p>
              <a
                href={profile.url}
                target="_blank"
                rel="noopener noreferrer"
                className="aura-btn aura-btn-line max-w-full"
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
                className="aura-card aura-lt shrink-0 w-[78%] max-w-[320px] lg:w-auto lg:max-w-none overflow-hidden"
              >
                <iframe
                  src={instagramEmbedUrl(reel)}
                  title={reel.caption || `Suit Aura Girls on Instagram ${index + 1}`}
                  className="block w-full h-[600px] border-0 bg-surface"
                  loading="lazy"
                  scrolling="no"
                  allow="encrypted-media; picture-in-picture; clipboard-write"
                />
                {reel.caption && (
                  <figcaption className="px-4 py-3.5 text-[14px] font-semibold leading-[18px] text-ink truncate">
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
