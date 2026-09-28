import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Sparkles, Gem, Crown, Zap, Truck, Tag, ArrowRight } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';

export interface MarqueeMessage {
  id: string;
  leadPrefix?: string;
  badge?: string;
  badgeType?: 'gold' | 'maroon' | 'outline';
  text: string;
  highlight?: string;
  separatorIcon?: 'star' | 'diamond' | 'crown' | 'dot';
  targetCategory?: string;
  actionType?: 'category' | 'coupon' | 'sale' | 'none';
}

export const LuxuryAnnouncementMarquee: React.FC = () => {
  const { 
    activePage, 
    selectedCategory, 
    setSelectedCategory, 
    setActivePage, 
    selectedProduct,
    setIsCouponDrawerOpen,
    showToast
  } = useShop();

  const { storeSettings } = useAdmin();

  const [isPaused, setIsPaused] = useState(false);
  const [adminCustomText, setAdminCustomText] = useState<string>(() => {
    return storeSettings?.announcementActive === false ? '' : storeSettings?.announcementText || '';
  });

  useEffect(() => {
    setAdminCustomText(storeSettings?.announcementActive === false ? '' : storeSettings?.announcementText || '');
  }, [storeSettings?.announcementActive, storeSettings?.announcementText]);

  // Determine current active section or category context
  const currentContextKey = useMemo(() => {
    if (activePage === 'home') return 'HOME';
    if (activePage === 'product-detail' && selectedProduct) {
      return `PDP_${selectedProduct.category?.toUpperCase() || 'GENERAL'}`;
    }
    if (activePage === 'shop') {
      const cat = (selectedCategory || 'ALL').trim().toUpperCase();
      return cat;
    }
    return 'DEFAULT';
  }, [activePage, selectedCategory, selectedProduct]);

  // Build luxury messages dynamically tailored to context & actual categories
  const messages: MarqueeMessage[] = useMemo(() => {
    const list: MarqueeMessage[] = [];

    // 1. If admin configured custom announcement, inject as priority royal spotlight
    if (storeSettings?.announcementActive !== false && adminCustomText && adminCustomText.trim().length > 0) {
      list.push({
        id: 'admin-custom-lead',
        leadPrefix: 'ROYAL EDIT',
        badge: 'EXCLUSIVE',
        badgeType: 'gold',
        text: adminCustomText.trim(),
        highlight: 'Special Boutique Notice',
        separatorIcon: 'crown',
        actionType: 'none',
      });
    }

    // 2. Category-specific and page-aware messages
    if (currentContextKey === 'HOME') {
      list.push(
        {
          id: 'home-brand',
          leadPrefix: 'SUIT AURA GIRLS',
          badge: 'ARTISAN ATELIER',
          badgeType: 'outline',
          text: 'Elegance That Feels Like You',
          highlight: '100% Pure Heritage Silk & Gotapatti Couture',
          separatorIcon: 'crown',
          actionType: 'none',
        },
        {
          id: 'home-upi',
          badge: 'INSTANT REWARD',
          badgeType: 'gold',
          text: 'Extra ₹100 Flat Discount on UPI & Prepaid Orders',
          highlight: 'Instant 1-Click Checkout',
          separatorIcon: 'diamond',
          actionType: 'coupon',
        },
        {
          id: 'home-discover',
          text: 'Discover Timeless Indian Elegance & Handcrafted Luxury Weaves',
          separatorIcon: 'star',
          actionType: 'category',
          targetCategory: 'All',
        },
        {
          id: 'home-dispatch',
          badge: 'AIR DISPATCH',
          badgeType: 'outline',
          text: '24–48 Hour Express Dispatch Across India',
          highlight: 'Hassle-Free 7-Day Size Exchanges',
          separatorIcon: 'dot',
          actionType: 'none',
        },
        {
          id: 'home-new',
          text: 'New Styles • Hand-Embroidered Festive Couture • Shop Your Look',
          separatorIcon: 'star',
          actionType: 'category',
          targetCategory: 'Suits',
        }
      );
    } else if (currentContextKey.includes('ANARKALI')) {
      list.push(
        {
          id: 'anarkali-flare',
          badge: '4-METER FLARE',
          badgeType: 'gold',
          text: 'Royal Kalidaar Flare • Timeless Floor-Sweeping Anarkali Elegance',
          highlight: 'Heirloom Heritage',
          separatorIcon: 'crown',
          actionType: 'category',
          targetCategory: 'Anarkali',
        },
        {
          id: 'anarkali-twirl',
          text: 'Make Every Twirl a Moment to Remember • Hand-Laced Gheras',
          separatorIcon: 'star',
          actionType: 'none',
        },
        {
          id: 'anarkali-craft',
          badge: 'HANDWORK',
          badgeType: 'outline',
          text: 'Zari Kalis & Artisan Dupatta Sets Tailored to Royal Perfection',
          separatorIcon: 'diamond',
          actionType: 'category',
          targetCategory: 'Anarkali',
        }
      );
    } else if (currentContextKey.includes('KURTI')) {
      list.push(
        {
          id: 'kurti-everyday',
          badge: 'DAILY LUXURY',
          badgeType: 'gold',
          text: 'Everyday Elegance, Beautifully Reimagined in Pure Breathable Cottons',
          separatorIcon: 'star',
          actionType: 'category',
          targetCategory: 'Kurtis',
        },
        {
          id: 'kurti-statement',
          text: 'Your Style • Your Statement • Hand-Blocked Artisan Prints for Every Mood',
          separatorIcon: 'crown',
          actionType: 'none',
        },
        {
          id: 'kurti-poise',
          badge: 'ALL DAY COMFORT',
          badgeType: 'outline',
          text: 'Double-Interlocked Stitching with Generous Inner Alteration Margin',
          separatorIcon: 'dot',
          actionType: 'category',
          targetCategory: 'Kurtis',
        }
      );
    } else if (currentContextKey.includes('CO-ORD')) {
      list.push(
        {
          id: 'coord-elevated',
          badge: 'MODERN ETHNIC',
          badgeType: 'gold',
          text: 'Effortless Coordination • Elevated Contemporary Day-to-Evening Style',
          separatorIcon: 'crown',
          actionType: 'category',
          targetCategory: 'Co-ord Sets',
        },
        {
          id: 'coord-pockets',
          text: 'Tailored Comfort Trousers with Concealed Functional Pockets & Elastic Back',
          separatorIcon: 'star',
          actionType: 'none',
        },
        {
          id: 'coord-perfect',
          badge: 'MATCHED FIT',
          badgeType: 'outline',
          text: 'Discover Your Perfectly Matched Look • Day-to-Evening Poise',
          separatorIcon: 'diamond',
          actionType: 'category',
          targetCategory: 'Co-ord Sets',
        }
      );
    } else if (currentContextKey.includes('DUPATTA')) {
      list.push(
        {
          id: 'dupatta-sets',
          badge: 'ROYAL DRAPES',
          badgeType: 'gold',
          text: 'Exquisite Pure Organza & Handloom Silk Heritage Dupatta Sets',
          separatorIcon: 'crown',
          actionType: 'category',
          targetCategory: 'Dupatta Sets',
        },
        {
          id: 'dupatta-borders',
          text: 'Intricate Scalloped Borders, Delicate Zari Work & Authentic Chanderi Textures',
          separatorIcon: 'star',
          actionType: 'none',
        },
        {
          id: 'dupatta-complete',
          badge: '3-PIECE SETS',
          badgeType: 'outline',
          text: 'Complete 3-Piece Boutique Ensembles Ready to Flaunt with Pride',
          separatorIcon: 'diamond',
          actionType: 'category',
          targetCategory: 'Dupatta Sets',
        }
      );
    } else if (currentContextKey.includes('FESTIVE') || currentContextKey.includes('PARTY')) {
      list.push(
        {
          id: 'festive-celebrate',
          badge: 'ROYAL OCCASIONS',
          badgeType: 'gold',
          text: 'Celebrate in Luxury • Shine in Authentic Heritage Heritage & Zardozi',
          separatorIcon: 'crown',
          actionType: 'category',
          targetCategory: 'Festive Wear',
        },
        {
          id: 'festive-wedding',
          text: 'Crafted for Sangeet Nights, Weddings & Unforgettable Family Celebrations',
          separatorIcon: 'star',
          actionType: 'none',
        },
        {
          id: 'festive-hues',
          badge: 'RICH PALETTE',
          badgeType: 'outline',
          text: 'Rich Royal Maroon, Haldi Gold, Rani Pink & Emerald Hues',
          separatorIcon: 'diamond',
          actionType: 'category',
          targetCategory: 'Festive Wear',
        }
      );
    } else if (currentContextKey.includes('DRESSES')) {
      list.push(
        {
          id: 'dresses-moments',
          badge: 'FESTIVE GLAMOUR',
          badgeType: 'gold',
          text: 'Dress Up for Your Most Beautiful Moments • Timeless Indian Charm',
          separatorIcon: 'crown',
          actionType: 'category',
          targetCategory: 'Dresses',
        },
        {
          id: 'dresses-flow',
          text: 'Flowing Festive Silhouettes with Handcrafted Necklines & Delicate Tassels',
          separatorIcon: 'star',
          actionType: 'none',
        },
        {
          id: 'dresses-poise',
          badge: 'ATELIER EXCLUSIVE',
          badgeType: 'outline',
          text: 'Celebrate Every Occasion in Style • Crafted to Turn Heads',
          separatorIcon: 'diamond',
          actionType: 'category',
          targetCategory: 'Dresses',
        }
      );
    } else if (currentContextKey.includes('SALE') || currentContextKey.includes('OFFER')) {
      list.push(
        {
          id: 'sale-exclusive',
          badge: 'LIMITED ARCHIVE',
          badgeType: 'gold',
          text: 'Special Handloom Styles • Exclusive Boutique Offers • Limited Pieces',
          separatorIcon: 'crown',
          actionType: 'sale',
        },
        {
          id: 'sale-coupon',
          text: 'Use Code: BLISS10 for Extra 10% Off on Prepaid Orders',
          highlight: 'Instant Checkout Voucher',
          separatorIcon: 'star',
          actionType: 'coupon',
        },
        {
          id: 'sale-dream',
          badge: 'LAST CHANCE',
          badgeType: 'outline',
          text: 'Your Dream Royal Outfit Awaits • Shop Before It Leaves the Loom',
          separatorIcon: 'diamond',
          actionType: 'category',
          targetCategory: 'Sale',
        }
      );
    } else {
      // General Suits & Sets default
      list.push(
        {
          id: 'suits-timeless',
          badge: 'SIGNATURE WEAVES',
          badgeType: 'gold',
          text: 'Explore Elegant Heritage Suit Sets • Crafted for Every Beautiful Occasion',
          separatorIcon: 'crown',
          actionType: 'category',
          targetCategory: 'Suits',
        },
        {
          id: 'suits-silhouettes',
          text: 'Timeless Silhouettes • Pure Chanderi, Modal Silk & Handloom Cotton',
          separatorIcon: 'star',
          actionType: 'none',
        },
        {
          id: 'suits-perfect',
          badge: 'BOUTIQUE FIT',
          badgeType: 'outline',
          text: 'Discover Your Perfect Suit Set • Free Express Nationwide Air Shipping',
          separatorIcon: 'diamond',
          actionType: 'category',
          targetCategory: 'Suits',
        }
      );
    }

    // Always append guaranteed trust perk at the end of the loop
    list.push({
      id: 'universal-upi-trust',
      badge: 'EXTRA 5% OFF',
      badgeType: 'gold',
      text: 'Instant UPI & Prepaid Discount Applied at 1-Click Checkout',
      separatorIcon: 'crown',
      actionType: 'coupon',
    });

    return list;
  }, [adminCustomText, currentContextKey]);

  // Handle message click navigation
  const handleMessageClick = useCallback((msg: MarqueeMessage) => {
    if (msg.actionType === 'category') {
      const cat = msg.targetCategory || 'All';
      setSelectedCategory(cat);
      setActivePage('shop');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (msg.actionType === 'coupon') {
      setIsCouponDrawerOpen(true);
    } else if (msg.actionType === 'sale') {
      setSelectedCategory('Sale');
      setActivePage('shop');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      showToast('Suit Aura Girls • Artisan Luxury Handloom Atelier', 'info');
    }
  }, [setActivePage, setIsCouponDrawerOpen, setSelectedCategory, showToast]);

  // Render elegant separator glyph
  const renderSeparator = (type?: string) => {
    switch (type) {
      case 'crown':
        return <Crown className="w-3 h-3 text-[#F7F0E5] shrink-0 mx-3 sm:mx-4 opacity-90 inline-block" />;
      case 'star':
        return <Sparkles className="w-3 h-3 text-antique-gold shrink-0 mx-3 sm:mx-4" aria-hidden="true" />;
      case 'diamond':
        return <Gem className="w-3 h-3 text-antique-gold shrink-0 mx-3 sm:mx-4" aria-hidden="true" />;
      case 'dot':
      default:
        return <span className="w-1.5 h-1.5 rounded-full bg-[#D7B77A]/70 shrink-0 mx-3 sm:mx-4 inline-block" />;
    }
  };

  // Render each item in the track
  const renderMarqueeItem = (msg: MarqueeMessage, index: number) => {
    const isInteractive = msg.actionType && msg.actionType !== 'none';

    return (
      <div
        key={`${msg.id}-${index}`}
        onClick={() => handleMessageClick(msg)}
        className={`inline-flex items-center gap-2 group/item text-[10.5px] sm:text-[11.5px] tracking-[0.06em] select-none py-1 transition-colors duration-200 ${
          isInteractive ? 'cursor-pointer hover:text-[#F7F0E5]' : 'cursor-default'
        }`}
      >
        {/* Luxury Badge if present */}
        {msg.badge && (
          <span
            className={`text-[8.5px] sm:text-[9px] font-mono font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-[3px] shrink-0 flex items-center gap-1 transition-all ${
              msg.badgeType === 'gold'
                ? 'bg-[#D7B77A] text-[#1E050E] font-bold shadow-xs'
                : 'bg-[#5C0B1B] text-[#F7F0E5] border border-[#D7B77A]/50'
            }`}
          >
            {msg.badgeType === 'gold' && <Zap className="w-2.5 h-2.5 fill-[#D7B77A] text-[#1E050E]" />}
            <span>{msg.badge}</span>
          </span>
        )}

        {/* Lead Prefix / Brand Title */}
        {msg.leadPrefix && (
          <span className="font-serif font-extrabold uppercase tracking-[0.15em] text-[#F7F0E5] shrink-0 text-[11px] sm:text-xs">
            {msg.leadPrefix}
          </span>
        )}

        {/* Main Announcement Text */}
        <span className="font-medium text-[#F7F0E5] group-hover/item:text-black transition-colors whitespace-nowrap">
          {msg.text}
        </span>

        {/* Optional Highlight Note */}
        {msg.highlight && (
          <span className="hidden md:inline-block text-[#F7F0E5] font-semibold text-[10px] sm:text-[10.5px] whitespace-nowrap opacity-90">
            • {msg.highlight}
          </span>
        )}

        {/* Subtle arrow indicator for interactive items on desktop hover */}
        {isInteractive && (
          <ArrowRight className="w-2.5 h-2.5 text-[#F7F0E5] opacity-0 -translate-x-1 group-hover/item:opacity-100 group-hover/item:translate-x-0 transition-all hidden sm:inline-block shrink-0" />
        )}

        {/* Sophisticated Separator Glyph */}
        {renderSeparator(msg.separatorIcon)}
      </div>
    );
  };

  return (
    <div
      id="luxury-announcement-marquee"
      role="region"
      aria-label="Store Announcements & Offers"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
      className="relative w-full bg-[#5C0B1B] text-[#F7F0E5] border-b border-[#D7B77A]/30 shadow-xs select-none z-50 overflow-hidden group h-[34px] sm:h-[38px] flex items-center"
    >
      {/* Subtle Artisan Gold Runway Gradients at left and right edges for smooth feathering */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-8 sm:w-14 bg-gradient-to-r from-[#5C0B1B] via-[#5C0B1B]/80 to-transparent z-20" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 sm:w-14 bg-gradient-to-l from-[#5C0B1B] via-[#5C0B1B]/80 to-transparent z-20" />

      {/* Very subtle ambient gold hairline border reflection */}
      <div className="pointer-events-none absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#D7B77A]/30 to-transparent z-10" />

      {/* Infinite Seamless Scrolling Container (Track A + Track B for uninterrupted right-to-left loop) */}
      <div
        className={`inline-flex items-center whitespace-nowrap will-change-transform animate-luxury-marquee ${
          isPaused ? 'marquee-paused' : ''
        }`}
      >
        {/* Track A */}
        <div className="inline-flex items-center whitespace-nowrap shrink-0">
          {messages.map((msg, idx) => renderMarqueeItem(msg, idx))}
        </div>

        {/* Track B (Identical duplicate for mathematically seamless loop without jump or blank gap) */}
        <div className="inline-flex items-center whitespace-nowrap shrink-0" aria-hidden="true">
          {messages.map((msg, idx) => renderMarqueeItem(msg, idx + 100))}
        </div>
      </div>
    </div>
  );
};
