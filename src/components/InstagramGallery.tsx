import React from 'react';
import { Instagram, ArrowUpRight } from 'lucide-react';
import { useAdmin } from '../context/AdminContext';
import { instagramEmbedUrl, instagramProfile } from '../utils/instagram';

// Reels are managed from Admin → Instagram Reels and synced through the storefront settings.
export const InstagramGallery: React.FC = () => {
  const { instagramReels = [], storeSettings } = useAdmin();
  const profile = instagramProfile(storeSettings?.instagramUrl);

  const followButton = (
    <a
      href={profile.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#D7B77A] text-[#F7F0E5] text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] hover:bg-[#561A2E] active:scale-95 transition"
    >
      <Instagram className="w-4 h-4" />
      Follow {profile.handle}
      <ArrowUpRight className="w-3.5 h-3.5" />
    </a>
  );

  return (
    <section id="instagram-gallery-section" className="py-14 sm:py-20 bg-[#120205] overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mb-8 sm:mb-12">
          <div className="max-w-xl">
            <a
              href={profile.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mb-3 text-[11px] font-bold uppercase tracking-[0.25em] text-[#D7B77A] hover:text-[#E8D2A4] transition"
            >
              <span className="grid place-items-center w-7 h-7 rounded-full bg-gradient-to-tr from-[#F9CE34] via-[#EE2A7B] to-[#6228D7]">
                <Instagram className="w-3.5 h-3.5 text-[#F7F0E5]" />
              </span>
              {profile.handle}
            </a>
            <h2 className="font-serif text-4xl sm:text-5xl font-bold text-[#F7F0E5] tracking-tight leading-[1.05]">
              Follow the Aura
            </h2>
            <p className="text-sm text-[#F7F0E5]/70 mt-3 leading-relaxed">
              Fresh looks, styling reels and behind-the-scenes from our atelier. Tag{' '}
              <span className="font-semibold text-[#F7F0E5]">#SuitAuraGirls</span> to be featured.
            </p>
          </div>
          {instagramReels.length > 0 && <div className="hidden md:block">{followButton}</div>}
        </div>

        {instagramReels.length === 0 ? (
          <div className="relative rounded-md overflow-hidden border border-[#D7B77A]/25 bg-[#180306] px-6 py-12 sm:py-16 text-center">
            <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-gradient-to-tr from-[#F9CE34]/20 via-[#EE2A7B]/15 to-[#6228D7]/15 blur-2xl" aria-hidden="true" />
            <div className="relative max-w-md mx-auto space-y-5">
              <span className="mx-auto grid place-items-center w-16 h-16 rounded-md bg-gradient-to-tr from-[#F9CE34] via-[#EE2A7B] to-[#6228D7] shadow-lg">
                <Instagram className="w-8 h-8 text-[#F7F0E5]" />
              </span>
              <p className="font-serif text-2xl text-[#F7F0E5]">New reels are on their way</p>
              <p className="text-sm text-[#F7F0E5]/70">Catch our latest drops and styling videos first on Instagram.</p>
              {followButton}
            </div>
          </div>
        ) : (
          <>
            {/* Swipe row on mobile, grid from large screens */}
            <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex lg:grid lg:grid-cols-4 gap-4 overflow-x-auto lg:overflow-visible snap-x snap-mandatory scroll-px-4 sm:scroll-px-0 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {instagramReels.map((reel, index) => (
                <figure
                  key={reel.url}
                  className="snap-start shrink-0 w-[78vw] max-w-[320px] lg:w-auto lg:max-w-none rounded-md overflow-hidden bg-[#180306] border border-[#D7B77A]/20 shadow-[0_8px_30px_-12px_rgba(61,15,31,0.25)]"
                >
                  <iframe
                    src={instagramEmbedUrl(reel)}
                    title={reel.caption || `Suit Aura Girls on Instagram ${index + 1}`}
                    className="block w-full h-[600px] border-0 bg-[#180306]"
                    loading="lazy"
                    scrolling="no"
                    allow="encrypted-media; picture-in-picture; clipboard-write"
                  />
                  {reel.caption && (
                    <figcaption className="px-4 py-3 text-xs text-[#F7F0E5]/80 border-t border-[#D7B77A]/15 truncate">
                      {reel.caption}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
            <div className="mt-8 flex justify-center md:hidden">{followButton}</div>
          </>
        )}
      </div>
    </section>
  );
};
