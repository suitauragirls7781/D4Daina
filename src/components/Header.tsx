import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { fuzzyMatchProduct } from '../utils/fuzzySearch';
import { RotatableBannerTicker } from './RotatableBannerTicker';
import { createSupportWhatsAppUrl } from '../utils/storeContact';
import { 
  Search, 
  Home,
  Heart, 
  ShoppingBag, 
  Menu, 
  X, 
  ChevronRight, 
  Sparkles,
  User,
  Package,
  Headphones,
  Info,
  Clock,
  TrendingUp,
  Trash2,
  MessageSquare,
  Star
} from 'lucide-react';
import * as motion from 'motion/react-client';

export const Header: React.FC = () => {
  const { storeSettings } = useAdmin();
  const { 
    products = [],
    cartCount, 
    wishlist, 
    activePage, 
    setActivePage, 
    selectedCategory, 
    navigateToCategory, 
    navigateToProduct,
    setIsCartDrawerOpen,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
    isSearchOpen,
    setIsSearchOpen,
    setSearchQuery
  } = useShop();

  const [searchInput, setSearchInput] = useState('');
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  
  // Recent Searches state with localStorage persistence
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('sag_recent_searches_v1');
      return saved ? JSON.parse(saved) : ['Anarkali Suits', 'Silk Dupatta', 'Organza Sets', 'Cotton Kurtis'];
    } catch {
      return ['Anarkali Suits', 'Silk Dupatta', 'Organza Sets', 'Cotton Kurtis'];
    }
  });

  const searchInputRef = useRef<HTMLInputElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const saveSearchTerm = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecentSearches((prev) => {
      const filtered = prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase());
      const updated = [trimmed, ...filtered].slice(0, 6);
      try {
        localStorage.setItem('sag_recent_searches_v1', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const removeRecentSearch = (termToRemove: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setRecentSearches((prev) => {
      const updated = prev.filter((t) => t.toLowerCase() !== termToRemove.toLowerCase());
      try {
        localStorage.setItem('sag_recent_searches_v1', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const clearAllRecentSearches = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem('sag_recent_searches_v1');
    } catch {}
  };

  const executeSearch = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    saveSearchTerm(trimmed);
    setSearchQuery(trimmed);
    navigateToCategory('All');
    setIsSearchOpen(false);
  };

  // Focus search input when drawer opens
  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

  // Click outside listener for account dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Lock body scroll when mobile menu is open to prevent background scrolling
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  // Filter products for instant search dropdown with fuzzy ethnic matching (on 2-letter input)
  const activeProducts = products.filter((p) => p.inStock);
  const searchTrimmed = searchInput.trim();
  const filteredSearchResults = searchTrimmed.length >= 2
    ? activeProducts.filter((p) => fuzzyMatchProduct(p, searchTrimmed)).slice(0, 6)
    : [];

  // Top 4 Bestseller ethnic sets for fallback when search returns zero direct matches
  const top4Bestsellers = useMemo(() => {
    const tagged = activeProducts.filter((p) => p.isBestSeller);
    if (tagged.length >= 4) {
      return tagged.slice(0, 4);
    }
    const sorted = [...activeProducts].sort((a, b) => (b.rating * (b.reviewCount || 1)) - (a.rating * (a.reviewCount || 1)));
    return sorted.slice(0, 4);
  }, [activeProducts]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      executeSearch(searchInput.trim());
    }
  };

  const navItems = [
    {
      label: 'Home',
      action: () => setActivePage('home'),
      isActive: activePage === 'home',
    },
    {
      label: 'New Arrivals',
      action: () => navigateToCategory('New Arrivals'),
      isActive: activePage === 'shop' && selectedCategory === 'New Arrivals',
    },
    {
      label: 'Suits',
      action: () => navigateToCategory('Suits'),
      isActive: activePage === 'shop' && selectedCategory === 'Suits',
    },
    {
      label: 'Kurtis',
      action: () => navigateToCategory('Kurtis'),
      isActive: activePage === 'shop' && selectedCategory === 'Kurtis',
    },
    {
      label: 'Dresses',
      action: () => navigateToCategory('Dresses'),
      isActive: activePage === 'shop' && selectedCategory === 'Dresses',
    },
    {
      label: 'Dupatta Sets',
      action: () => navigateToCategory('Dupatta Sets'),
      isActive: activePage === 'shop' && selectedCategory === 'Dupatta Sets',
    },
    {
      label: 'Co-ord Sets',
      action: () => navigateToCategory('Co-ord Sets'),
      isActive: activePage === 'shop' && selectedCategory === 'Co-ord Sets',
    },
    {
      label: 'Anarkali',
      action: () => navigateToCategory('Anarkali'),
      isActive: activePage === 'shop' && selectedCategory === 'Anarkali',
    },
    {
      label: 'Festive Wear',
      action: () => navigateToCategory('Festive Wear'),
      isActive: activePage === 'shop' && selectedCategory === 'Festive Wear',
    },
    {
      label: 'Sale',
      action: () => navigateToCategory('Sale'),
      isSale: true,
      isActive: activePage === 'shop' && selectedCategory === 'Sale',
    },
  ];

  const getCategoryCount = (categoryName: string) => {
    if (!products) return 0;
    const activeProds = products.filter(p => p.inStock);
    if (categoryName === 'Sale') {
      return activeProds.filter(p => p.isSale || p.discount >= 36).length;
    }
    if (categoryName === 'Festive Wear') {
      return activeProds.filter(p => p.category === 'Festive Wear' || p.isFestive).length;
    }
    if (categoryName === 'Dupatta Sets') {
      return activeProds.filter(p => p.category === 'Dupatta Sets' || p.subcategory?.toLowerCase().includes('dupatta')).length;
    }
    return activeProds.filter(p => p.category === categoryName).length;
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-[#120205] text-[#E8D2A4] border-b border-[#D7B77A]/25 select-none">
      
      {/* Main Luxury Header Content Area */}
      <div className="relative max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-3 flex items-center justify-between gap-2 min-h-[68px] sm:min-h-[78px]">

        {/* Column 1 (Left): Mobile Menu Trigger & Status Indicator */}
        <div className="relative z-10 flex items-center shrink-0">
          <button
            id="mobile-menu-trigger"
            onClick={() => {
              setIsSearchOpen(false);
              setIsMobileMenuOpen(!isMobileMenuOpen);
            }}
            className="w-10 h-10 sm:w-11 sm:h-11 bg-transparent hover:bg-[#180306] text-[#E8D2A4] focus:outline-none lg:hidden transition-colors border border-[#D7B77A]/35 flex items-center justify-center cursor-pointer"
            aria-label="Toggle Navigation Menu"
          >
            {isMobileMenuOpen ? <X className="w-4.5 h-4.5" /> : <Menu className="w-4.5 h-4.5" />}
          </button>

          <div className="hidden lg:flex flex-col items-start gap-0.5 text-[9px] uppercase font-medium text-[#E8D2A4]">
            <span className="flex items-center gap-1.5 whitespace-nowrap font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D7B77A]" />
              JAIPUR ATELIER
            </span>
            <span className="text-[#E8D2A4]/70 whitespace-nowrap font-medium">MADE IN INDIA</span>
          </div>
        </div>

        {/* Column 2 (Center): Merged Logo & High-Fashion Title */}
        <div className="relative z-10 flex-1 flex items-center justify-center text-center px-0.5 sm:px-2">
          <button
            id="header-brand-logo"
            onClick={() => setActivePage('home')}
            className="flex items-center justify-center group shrink-0 cursor-pointer"
          >
            <motion.img
              src="/suit-aura-logo.png"
              alt="Suit Aura Girls logo"
              initial={{ scale: 0.96 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.35 }}
              className="w-24 h-12 xs:w-28 xs:h-14 sm:w-36 sm:h-[72px] object-contain"
            />
          </button>
        </div>

        {/* Column 3 (Right): Action Buttons */}
        <div className="relative z-10 flex items-center justify-end space-x-1 sm:space-x-2 shrink-0">
          
          {/* Search Trigger */}
          <button
            id="header-search-btn"
            onClick={() => {
              setIsMobileMenuOpen(false);
              setIsSearchOpen(!isSearchOpen);
            }}
            className="w-9 h-9 sm:w-10 sm:h-10 bg-transparent hover:bg-[#180306] text-[#E8D2A4] transition-colors border border-[#D7B77A]/35 flex items-center justify-center cursor-pointer"
            aria-label="Search styles"
          >
            <Search className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 text-[#F7F0E5]" />
          </button>

          {/* Account / Login Button (Visible on Mobile & Desktop) */}
          <div className="relative" ref={accountMenuRef}>
            <button
              id="header-account-btn"
              onClick={() => {
                if (window.innerWidth < 640) {
                  setActivePage('account');
                } else {
                  setIsAccountMenuOpen(!isAccountMenuOpen);
                }
              }}
              className="w-8.5 h-8.5 sm:w-10 sm:h-10 rounded-lg bg-[#180306] hover:bg-[#180306] text-[#F7F0E5] transition border border-[#D7B77A]/15 flex items-center justify-center cursor-pointer"
              aria-label="Account & Login"
              title="Account & Login"
            >
              <User className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 text-[#F7F0E5]" />
            </button>

            {/* Account Dropdown (Desktop) */}
            {isAccountMenuOpen && (
              <div 
                id="account-dropdown-menu"
                className="absolute right-0 mt-3 w-60 bg-[#180306] rounded shadow-lg border border-[#D7B77A]/30 py-2 z-50 text-[#F7F0E5]"
              >
                <div className="px-4 py-2.5 border-b border-[#D7B77A]/20 bg-[#180306]/50">
                  <p className="text-[10px] text-[#F7F0E5] uppercase tracking-wider font-bold">Welcome to</p>
                  <p className="text-sm font-serif font-bold text-[#F7F0E5] tracking-wide">Suit Aura Girls</p>
                </div>

                <button
                  id="acc-profile-btn"
                  onClick={() => {
                    setActivePage('account');
                    setIsAccountMenuOpen(false);
                  }}
                  className="w-full px-4 py-2.5 text-left text-xs font-medium text-[#F7F0E5] hover:bg-[#2A0710]/20 flex items-center gap-2.5 transition cursor-pointer"
                >
                  <User className="w-4 h-4 text-[#F7F0E5]" />
                  My Profile & Addresses
                </button>

                <button
                  id="acc-track-orders-btn"
                  onClick={() => {
                    setActivePage('track-order');
                    setIsAccountMenuOpen(false);
                  }}
                  className="w-full px-4 py-2.5 text-left text-xs font-medium text-[#F7F0E5] hover:bg-[#2A0710]/20 flex items-center gap-2.5 transition cursor-pointer"
                >
                  <Package className="w-4 h-4 text-[#F7F0E5]" />
                  Track My Order
                </button>

                <button
                  id="acc-about-btn"
                  onClick={() => {
                    setActivePage('about');
                    setIsAccountMenuOpen(false);
                  }}
                  className="w-full px-4 py-2.5 text-left text-xs font-medium text-[#F7F0E5] hover:bg-[#2A0710]/20 flex items-center gap-2.5 transition cursor-pointer"
                >
                  <Info className="w-4 h-4 text-[#F7F0E5]" />
                  About Suit Aura Girls
                </button>

                <button
                  id="acc-contact-btn"
                  onClick={() => {
                    setActivePage('contact');
                    setIsAccountMenuOpen(false);
                  }}
                  className="w-full px-4 py-2.5 text-left text-xs font-medium text-[#F7F0E5] hover:bg-[#2A0710]/20 flex items-center gap-2.5 transition cursor-pointer"
                >
                  <Headphones className="w-4 h-4 text-[#F7F0E5]" />
                  24/7 VIP Support
                </button>

                <a
                  id="acc-whatsapp-stylist-btn"
                  href={createSupportWhatsAppUrl('Hi Suit Aura Girls! I have a question regarding suits and orders.')}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsAccountMenuOpen(false)}
                  className="w-full px-4 py-2.5 text-left text-xs font-medium text-[#F7F0E5] hover:bg-[#2A0710]/20 flex items-center justify-between transition cursor-pointer border-t border-[#D7B77A]/15"
                >
                  <span className="flex items-center gap-2.5">
                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                    <span>WhatsApp Stylist</span>
                  </span>
                  <span className="text-[9px] bg-emerald-950/40 text-emerald-400 font-bold px-1.5 py-0.5 rounded-full">Active</span>
                </a>

              </div>
            )}
          </div>

          {/* Shopping Cart Button (Desktop Only) */}
          <button
            id="header-cart-btn"
            onClick={() => {
              setIsMobileMenuOpen(false);
              setIsSearchOpen(false);
              setIsCartDrawerOpen(true);
            }}
            className="hidden md:flex w-10 h-10 bg-[#D7B77A] hover:bg-[#D7B77A]/90 text-[#F7F0E5] transition-colors items-center justify-center relative group border border-[#D7B77A]/40 cursor-pointer shrink-0"
            aria-label="Shopping Bag"
          >
            <ShoppingBag className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-[#F7F0E5] font-extrabold group-hover:scale-105 transition-transform" />
            {cartCount > 0 && (
              <span key={`header-cart-badge-${cartCount}`} className="absolute -top-1.5 -right-1.5 flex h-4.5 w-4.5 items-center justify-center">
                <span className="relative inline-flex rounded-full h-4.5 w-4.5 bg-[#D7B77A] text-[#F7F0E5] text-[9px] font-bold items-center justify-center border border-[#D7B77A]/15 shadow-xs">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              </span>
            )}
          </button>

        </div>

      </div>

      {/* 3. Desktop Navigation Bar (Categories Strip) */}
      <div className="relative z-10 bg-[#120205] text-[#E8D2A4] border-t border-[#D7B77A]/20 hidden lg:block">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center justify-center gap-x-6 xl:gap-x-10 min-h-11 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {navItems.map((item) => (
              <button
                key={item.label}
                id={`nav-link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                onClick={item.action}
                className={`text-[11px] xl:text-xs tracking-[0.18em] uppercase font-semibold py-3 relative transition-all duration-200 shrink-0 cursor-pointer ${
                  item.isSale
                    ? 'text-[#D7B77A] hover:text-[#E8D2A4]'
                    : item.isActive
                    ? 'text-[#E8D2A4]'
                    : 'text-[#E8D2A4]/70 hover:text-[#E8D2A4]'
                }`}
              >
                {item.label}
                {item.isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-px bg-[#D7B77A]" />
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* 4. Live Search Overlay Drawer */}
      {isSearchOpen && (
        <div id="search-drawer-overlay" className="relative z-20 border-t border-[#D7B77A]/30 bg-[#180306] py-5 px-4 sm:px-8 text-[#E8D2A4]">
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSearchSubmit} className="relative">
              <input
                ref={searchInputRef}
                id="search-input-field"
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by style (Suits, Anarkali, Kurtis, Silk, Festive)..."
                className="w-full pl-11 pr-24 py-3.5 bg-[#120205] border border-[#D7B77A]/40 text-sm sm:text-base text-[#E8D2A4] placeholder-[#E8D2A4]/45 focus:outline-none focus:ring-1 focus:ring-[#D7B77A]/40 focus:border-transparent transition"
              />
              <Search className="w-5 h-5 text-[#F7F0E5] absolute left-4 top-1/2 -translate-y-1/2" />
              
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => setSearchInput('')}
                    className="p-1 text-[#F7F0E5]/55 hover:text-[#F7F0E5]/75 rounded-full"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="submit"
                  id="search-submit-btn"
                  className="bg-[#D7B77A] hover:bg-[#D7B77A]/90 text-[#F7F0E5] border border-[#D7B77A]/40 px-4 py-2 text-xs font-semibold uppercase transition-colors cursor-pointer"
                >
                  Search
                </button>
              </div>
            </form>

            {/* Quick Live Search Results OR Recent & Trending Searches */}
            {searchInput.trim().length > 0 ? (
              <div className="mt-3 bg-[#180306] rounded-md border border-[#D7B77A]/30 shadow-md p-3 max-h-96 overflow-y-auto">
                {searchInput.trim().length === 1 ? (
                  <div className="py-4 text-center">
                    <p className="text-xs font-semibold text-[#F7F0E5] flex items-center justify-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#F7F0E5] animate-spin" /> Type 1 more character for live thumbnail results...
                    </p>
                  </div>
                ) : filteredSearchResults.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-2 pb-1 border-b border-[#D7B77A]/20">
                      <p className="text-[11px] font-black uppercase tracking-wider text-[#F7F0E5]">
                        Live Matching Styles ({filteredSearchResults.length})
                      </p>
                      <span className="text-[10px] text-[#F7F0E5]/55 font-medium">Auto-matched for "{searchInput.trim()}"</span>
                    </div>
                    {filteredSearchResults.map((prod) => (
                      <button
                        key={prod.id}
                        id={`search-result-${prod.id}`}
                        onClick={() => {
                          saveSearchTerm(prod.name);
                          navigateToProduct(prod.id);
                          setIsSearchOpen(false);
                          setSearchInput('');
                        }}
                        className="w-full flex items-center gap-3.5 p-2.5 hover:bg-[#180306] rounded transition text-left group cursor-pointer border border-transparent hover:border-[#D7B77A]/30"
                      >
                        <div className="relative shrink-0">
                          <img 
                            src={prod.images[0]} 
                            alt={prod.name} 
                            className="w-14 h-14 object-cover rounded-lg border border-[#D7B77A]/30 shadow-2xs group-hover:scale-105 transition-transform" 
                          />
                          {prod.originalPrice && prod.originalPrice > prod.price && (
                            <span className="absolute -top-1.5 -left-1.5 bg-[#5C0B1B] text-[#F7F0E5] text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-2xs">
                              {Math.round(((prod.originalPrice - prod.price) / prod.originalPrice) * 100)}% OFF
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[10px] font-black uppercase tracking-wider text-[#F7F0E5] bg-[#D7B77A]/15 px-2 py-0.5 rounded-md">
                              {prod.category}
                            </span>
                            {prod.fabric && (
                              <span className="text-[10px] font-medium text-[#F7F0E5]/55 hidden sm:inline-block">
                                • {prod.fabric}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-bold text-[#F7F0E5] group-hover:text-[#F7F0E5] truncate">
                            {prod.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs font-black text-[#F7F0E5]">
                              ₹{prod.price.toLocaleString('en-IN')}
                            </span>
                            {prod.originalPrice && prod.originalPrice > prod.price && (
                              <span className="text-[11px] text-[#F7F0E5]/55 line-through">
                                ₹{prod.originalPrice.toLocaleString('en-IN')}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[#F7F0E5]/55 group-hover:text-[#F7F0E5] group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="py-2 px-1 space-y-3">
                    <div className="bg-[#180306] border border-[#D7B77A]/30 rounded p-3 text-center">
                      <p className="text-xs font-bold text-[#F7F0E5]">
                        No direct matches found for "{searchInput}".
                      </p>
                      <p className="text-[11px] text-[#F7F0E5]/75 mt-0.5 font-medium">
                        Explore our Top 4 Bestseller Ethnic Sets instead:
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between px-1 pb-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#F7F0E5] flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-[#F7F0E5] fill-[#D7B77A]" />
                          Top 4 Bestselling Sets
                        </span>
                        <span className="text-[10px] text-emerald-400 font-extrabold bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-800">
                          ⭐ Customer Favorites
                        </span>
                      </div>
                      {top4Bestsellers.map((prod) => (
                        <button
                          key={prod.id}
                          id={`bestseller-search-result-${prod.id}`}
                          onClick={() => {
                            saveSearchTerm(prod.name);
                            navigateToProduct(prod.id);
                            setIsSearchOpen(false);
                            setSearchInput('');
                          }}
                          className="w-full flex items-center gap-3 p-2 hover:bg-[#180306] rounded transition text-left group cursor-pointer border border-transparent hover:border-[#D7B77A]/30"
                        >
                          <div className="relative shrink-0">
                            <img 
                              src={prod.images[0]} 
                              alt={prod.name} 
                              className="w-12 h-12 object-cover rounded-lg border border-[#D7B77A]/30 shadow-2xs group-hover:scale-105 transition-transform" 
                            />
                            <span className="absolute -top-1.5 -left-1.5 bg-[#5C0B1B] text-[#F7F0E5] text-[7px] font-black px-1.5 py-0.5 rounded-full shadow-2xs">
                              BESTSELLER
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[9px] font-black uppercase tracking-wider text-[#F7F0E5] bg-[#D7B77A]/15 px-1.5 py-0.5 rounded">
                                {prod.category}
                              </span>
                              <span className="text-[9px] text-[#F7F0E5] font-bold">
                                <Star className="inline-block w-2.5 h-2.5 fill-[#D7B77A] text-[#D7B77A] mr-0.5" aria-hidden="true" />
                                {prod.rating}
                              </span>
                            </div>
                            <p className="text-xs font-bold text-[#F7F0E5] group-hover:text-[#F7F0E5] truncate">
                              {prod.name}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs font-black text-[#F7F0E5]">
                                ₹{prod.price.toLocaleString('en-IN')}
                              </span>
                              {prod.originalPrice && prod.originalPrice > prod.price && (
                                <span className="text-[10px] text-[#F7F0E5]/55 line-through">
                                  ₹{prod.originalPrice.toLocaleString('en-IN')}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-[#F7F0E5]/55 group-hover:text-[#F7F0E5] group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* Recent & Trending Searches Container */}
            <div className="mt-4 space-y-4">
              {/* Recent Searches */}
              {recentSearches.length > 0 && (
                <div id="recent-searches-container" className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-xs uppercase tracking-wider text-[#F7F0E5] flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#F7F0E5]" /> Recent Searches
                    </span>
                    <button
                      type="button"
                      id="clear-recent-searches-btn"
                      onClick={clearAllRecentSearches}
                      className="text-[11px] font-bold text-[#F7F0E5]/55 hover:text-[#F7F0E5] transition flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Clear All
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {recentSearches.map((term) => (
                      <div
                        key={term}
                        className="inline-flex items-center gap-1.5 bg-[#180306] hover:bg-[#180306] text-[#F7F0E5] px-3 py-1 rounded-full border border-[#D7B77A]/30 transition text-xs font-bold shadow-2xs group cursor-pointer"
                        onClick={() => executeSearch(term)}
                      >
                        <Clock className="w-3 h-3 text-[#F7F0E5]/70" />
                        <span>{term}</span>
                        <button
                          type="button"
                          onClick={(e) => removeRecentSearch(term, e)}
                          aria-label={`Remove ${term}`}
                          className="p-0.5 text-[#F7F0E5]/55 hover:text-rose-300 rounded-full transition ml-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trending Searches Tags */}
              <div id="trending-searches-container" className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-xs uppercase tracking-wider text-[#F7F0E5] flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-[#F7F0E5]" /> Trending Searches
                  </span>
                  <Sparkles className="w-3 h-3 text-[#F7F0E5]" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    'Chanderi Anarkali', 
                    'Velvet Suit Sets', 
                    'Cotton Kurtis', 
                    'Organza Dupatta Sets', 
                    'Silk Co-ord Sets', 
                    'Festive Party Wear',
                    'Georgette Suits'
                  ].map((tag) => (
                    <button
                      key={tag}
                      id={`trending-search-${tag.toLowerCase().replace(/\s+/g, '-')}`}
                      onClick={() => executeSearch(tag)}
                      className="bg-[#180306] hover:bg-[#5C0B1B] text-[#F7F0E5] hover:text-[#F7F0E5] px-3.5 py-1.5 rounded-full border border-[#D7B77A]/40 transition text-xs font-bold cursor-pointer shadow-2xs flex items-center gap-1.5 group"
                    >
                      <span className="text-[10px] text-[#F7F0E5] group-hover:scale-125 transition-transform">🔥</span>
                      <span>{tag}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </header>
  );
};
