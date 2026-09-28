import React, { useState, useMemo, useEffect } from 'react';
import { useShop } from '../context/ShopContext';
import { VirtualizedCatalogGrid } from './VirtualizedCatalogGrid';
import { FilterDrawer } from './FilterDrawer';
import { ProductSize, ProductCategory } from '../types';
import { fuzzyMatchProduct } from '../utils/fuzzySearch';
import { BrandMarqueeHeader } from './BrandMarqueeHeader';
import { 
  Filter, 
  X, 
  Sparkles, 
  Check, 
  SlidersHorizontal,
  ChevronRight,
  Search,
  LayoutGrid,
  Square,
  Star
} from 'lucide-react';

const CATEGORIES_LIST: (ProductCategory | 'All' | 'Sale' | 'New Arrivals' | 'Best Sellers' | 'Trending')[] = [
  'All',
  'New Arrivals',
  'Trending',
  'Suits',
  'Kurtis',
  'Dresses',
  'Dupatta Sets',
  'Co-ord Sets',
  'Anarkali',
  'Festive Wear',
  'Party Wear',
  'Sale',
];

const ALL_SIZES: ProductSize[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

const ALL_COLORS = [
  { name: 'Blush / Pink', hex: '#E8A7B8' },
  { name: 'Burgundy / Maroon', hex: '#241D1B' },
  { name: 'Ivory / White', hex: '#FDFBF7' },
  { name: 'Yellow / Mustard', hex: '#C7A77A' },
  { name: 'Blue / Indigo', hex: '#1B2E63' },
  { name: 'Green / Sage', hex: '#A2B89B' },
  { name: 'Black', hex: '#18181A' },
];

export const ShopPage: React.FC = () => {
  const { products = [], isLoading, selectedCategory, setSelectedCategory, setActivePage, searchQuery, setSearchQuery } = useShop();

  // Local filter states
  const [selectedSizes, setSelectedSizes] = useState<ProductSize[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedFabrics, setSelectedFabrics] = useState<string[]>([]);
  const [selectedFits, setSelectedFits] = useState<string[]>([]);
  const [selectedOccasions, setSelectedOccasions] = useState<string[]>([]);
  const [maxPrice, setMaxPrice] = useState<number>(3000);
  const [minDiscount, setMinDiscount] = useState<number>(0);
  const [minRating, setMinRating] = useState<number>(0);
  const [sortBy, setSortBy] = useState<'featured' | 'price-low' | 'price-high' | 'newest' | 'best-sellers' | 'rating'>('featured');
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState<boolean>(false);
  const [localSearch, setLocalSearch] = useState<string>('');
  const [mobileColumns, setMobileColumns] = useState<'1' | '2'>('2');

  useEffect(() => {
    if (searchQuery) setLocalSearch(searchQuery);
  }, [searchQuery]);

  // Toggle size filter
  const toggleSize = (sz: ProductSize) => {
    setSelectedSizes((prev) =>
      prev.includes(sz) ? prev.filter((s) => s !== sz) : [...prev, sz]
    );
  };

  // Toggle color filter
  const toggleColor = (colName: string) => {
    setSelectedColors((prev) =>
      prev.includes(colName) ? prev.filter((c) => c !== colName) : [...prev, colName]
    );
  };

  // Toggle fabric filter
  const toggleFabric = (fabric: string) => {
    setSelectedFabrics((prev) =>
      prev.includes(fabric) ? prev.filter((f) => f !== fabric) : [...prev, fabric]
    );
  };

  // Toggle fit filter
  const toggleFit = (fit: string) => {
    setSelectedFits((prev) =>
      prev.includes(fit) ? prev.filter((f) => f !== fit) : [...prev, fit]
    );
  };

  // Toggle occasion filter
  const toggleOccasion = (occ: string) => {
    setSelectedOccasions((prev) =>
      prev.includes(occ) ? prev.filter((o) => o !== occ) : [...prev, occ]
    );
  };

  // Clear all filters
  const resetFilters = () => {
    setSelectedSizes([]);
    setSelectedColors([]);
    setSelectedFabrics([]);
    setSelectedFits([]);
    setSelectedOccasions([]);
    setMaxPrice(3000);
    setMinDiscount(0);
    setMinRating(0);
    setLocalSearch('');
    setSelectedCategory('All');
  };

  // Filtered & Sorted list
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      // Only display active products on storefront
      if (!product.inStock) return false;

      // Category Filter
      if (selectedCategory === 'Sale' && !product.isSale && product.discount < 36) return false;
      if (selectedCategory === 'New Arrivals' && !product.isNewArrival) return false;
      if (selectedCategory === 'Best Sellers' && !product.isBestSeller) return false;
      if (selectedCategory === 'Trending' && !product.isTrending) return false;
      if (selectedCategory === 'Festive Wear' && !product.isFestive && product.category !== 'Festive Wear') return false;
      if (selectedCategory === 'Dupatta Sets' && product.category !== 'Dupatta Sets' && !product.subcategory?.toLowerCase().includes('dupatta')) return false;
      if (
        selectedCategory !== 'All' && 
        selectedCategory !== 'Sale' && 
        selectedCategory !== 'New Arrivals' && 
        selectedCategory !== 'Best Sellers' && 
        selectedCategory !== 'Trending' &&
        selectedCategory !== 'Festive Wear' &&
        selectedCategory !== 'Dupatta Sets' &&
        product.category !== selectedCategory
      ) {
        return false;
      }

      // Fuzzy Ethnic Wear Search Query
      if (localSearch.trim()) {
        if (!fuzzyMatchProduct(product, localSearch)) return false;
      }

      // Fabric Filter (Cotton, Georgette, Silk, Rayon, Velvet, Organza)
      if (selectedFabrics.length > 0) {
        const prodFab = (product.fabric || '').toLowerCase();
        const prodDesc = (product.description || '').toLowerCase();
        const prodName = (product.name || '').toLowerCase();

        const matchesFabric = selectedFabrics.some((fab) => {
          const fabLower = fab.toLowerCase();
          if (fabLower === 'cotton') {
            return prodFab.includes('cotton') || prodFab.includes('cambric') || prodFab.includes('mulmul') || prodDesc.includes('cotton') || prodName.includes('cotton');
          }
          if (fabLower === 'georgette') {
            return prodFab.includes('georgette') || prodDesc.includes('georgette') || prodName.includes('georgette');
          }
          if (fabLower === 'silk') {
            return prodFab.includes('silk') || prodFab.includes('chanderi') || prodFab.includes('banarasi') || prodFab.includes('tussar');
          }
          if (fabLower === 'rayon') {
            return prodFab.includes('rayon') || prodDesc.includes('rayon');
          }
          if (fabLower === 'velvet') {
            return prodFab.includes('velvet') || prodDesc.includes('velvet');
          }
          if (fabLower === 'organza') {
            return prodFab.includes('organza') || prodDesc.includes('organza');
          }
          return prodFab.includes(fabLower) || prodDesc.includes(fabLower) || prodName.includes(fabLower);
        });
        if (!matchesFabric) return false;
      }

      // Fit Filter
      if (selectedFits.length > 0) {
        const prodFit = (product.fit || '').toLowerCase();
        const prodCat = (product.category || '').toLowerCase();
        const prodDesc = (product.description || '').toLowerCase();

        const matchesFit = selectedFits.some((fit) => {
          const fitLower = fit.toLowerCase();
          if (fitLower.includes('straight') || fitLower.includes('regular')) {
            return prodFit.includes('straight') || prodFit.includes('regular') || prodDesc.includes('straight') || prodDesc.includes('regular');
          }
          if (fitLower.includes('anarkali') || fitLower.includes('flare')) {
            return prodFit.includes('anarkali') || prodFit.includes('flare') || prodCat.includes('anarkali') || prodDesc.includes('anarkali') || prodDesc.includes('flare');
          }
          if (fitLower.includes('a-line') || fitLower.includes('relaxed')) {
            return prodFit.includes('a-line') || prodFit.includes('relaxed') || prodDesc.includes('a-line') || prodDesc.includes('relaxed');
          }
          if (fitLower.includes('tailored')) {
            return prodFit.includes('tailored') || prodDesc.includes('tailored') || prodFit.includes('fitted');
          }
          return prodFit.includes(fitLower) || prodDesc.includes(fitLower);
        });
        if (!matchesFit) return false;
      }

      // Occasion Filter
      if (selectedOccasions.length > 0) {
        const prodOccasion = (product.occasion || '').toLowerCase();
        const prodCat = (product.category || '').toLowerCase();
        const prodDesc = (product.description || '').toLowerCase();

        const matchesOccasion = selectedOccasions.some((occ) => {
          const occLower = occ.toLowerCase();
          if (occLower.includes('casual') || occLower.includes('workwear')) {
            return prodOccasion.includes('daytime') || prodOccasion.includes('work') || prodOccasion.includes('casual') || prodDesc.includes('workwear') || prodDesc.includes('casual');
          }
          if (occLower.includes('festive')) {
            return prodOccasion.includes('festive') || product.isFestive || prodCat.includes('festive') || prodDesc.includes('festive');
          }
          if (occLower.includes('party')) {
            return prodOccasion.includes('party') || prodOccasion.includes('soirée') || prodCat.includes('party') || prodDesc.includes('party');
          }
          if (occLower.includes('wedding') || occLower.includes('ceremonial')) {
            return prodOccasion.includes('wedding') || prodOccasion.includes('ceremonial') || prodOccasion.includes('gathering') || prodDesc.includes('wedding');
          }
          return prodOccasion.includes(occLower) || prodDesc.includes(occLower);
        });
        if (!matchesOccasion) return false;
      }

      // Size Filter
      if (selectedSizes.length > 0) {
        const hasSize = selectedSizes.some((s) => product.sizes.includes(s));
        if (!hasSize) return false;
      }

      // Color Filter
      if (selectedColors.length > 0) {
        const hasColor = product.colors.some((color) => selectedColors.includes(color.name));
        if (!hasColor) return false;
      }

      // Price Filter
      if (product.price > maxPrice) return false;

      // Discount Filter
      if (minDiscount > 0 && product.discount < minDiscount) return false;

      // Rating Filter
      if (minRating > 0 && product.rating < minRating) return false;

      return true;
    }).sort((a, b) => {
      if (sortBy === 'price-low') return a.price - b.price;
      if (sortBy === 'price-high') return b.price - a.price;
      if (sortBy === 'newest') {
        if (a.isNewArrival && !b.isNewArrival) return -1;
        if (!a.isNewArrival && b.isNewArrival) return 1;
        return (b.reviewCount || 0) - (a.reviewCount || 0);
      }
      if (sortBy === 'best-sellers') {
        if (a.isBestSeller && !b.isBestSeller) return -1;
        if (!a.isBestSeller && b.isBestSeller) return 1;
        return (b.reviewCount || 0) - (a.reviewCount || 0);
      }
      if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);

      // Default: Featured
      if (a.isFeatured && !b.isFeatured) return -1;
      if (!a.isFeatured && b.isFeatured) return 1;
      return (b.rating || 0) - (a.rating || 0);
    });
  }, [products, selectedCategory, selectedFabrics, selectedFits, selectedOccasions, selectedSizes, selectedColors, maxPrice, minDiscount, minRating, sortBy, localSearch]);

  const activeFiltersCount = 
    (selectedCategory !== 'All' ? 1 : 0) +
    selectedFabrics.length +
    selectedFits.length +
    selectedOccasions.length +
    selectedSizes.length +
    selectedColors.length +
    (maxPrice < 3000 ? 1 : 0) +
    (minDiscount > 0 ? 1 : 0) +
    (minRating > 0 ? 1 : 0) +
    (localSearch ? 1 : 0);

  return (
    <div id="shop-catalog-page" className="bg-[#120205]">
      {/* Luxury Announcement Marquee Strip Below Header */}
      <BrandMarqueeHeader />

      <div className="py-6 sm:py-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-2 text-xs text-[#E8D2A4]/55 mb-6">
          <button onClick={() => setActivePage('home')} className="hover:text-[#E8D2A4] font-medium transition-colors">Home</button>
          <ChevronRight className="w-3.5 h-3.5 text-[#F7F0E5]/55" />
          <span className="text-[#E8D2A4] font-semibold">Catalog</span>
          {selectedCategory !== 'All' && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-[#F7F0E5]/55" />
              <span className="text-[#E8D2A4] font-semibold">{selectedCategory}</span>
            </>
          )}
        </nav>

        {/* Page Title & Sort Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 mb-8 border-b border-[#D7B77A]/30 gap-4">
          <div>
            <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-[#E8D2A4]">
              {selectedCategory === 'All' ? "All Women's Collections" : selectedCategory}
            </h1>
            <p className="text-xs sm:text-sm text-[#F7F0E5]/55 mt-1">
              Showing <strong className="text-[#F7F0E5]">{filteredProducts.length}</strong> handcrafted ethnic styles
            </p>
          </div>

          {/* Controls: Search, Sort and Mobile Filter trigger */}
          <div className="flex flex-wrap items-center gap-3">
            
            {/* Search within page */}
            <div className="relative">
              <input
                type="text"
                value={localSearch}
                onChange={(e) => {
                  setLocalSearch(e.target.value);
                  setSearchQuery(e.target.value);
                }}
                placeholder="Filter by keyword..."
                className="pl-8 pr-3 py-2 border border-[#D7B77A]/35 text-xs bg-[#120205] focus:outline-none focus:ring-1 focus:ring-[#D7B77A]/40 w-40 sm:w-48 text-[#E8D2A4]"
              />
              <Search className="w-3.5 h-3.5 text-[#F7F0E5]/55 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-[#F7F0E5]/75 hidden sm:inline">
                Sort by:
              </label>
              <select
                id="shop-sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-2 bg-[#120205] border border-[#D7B77A]/35 text-xs font-semibold text-[#E8D2A4] focus:outline-none focus:ring-1 focus:ring-[#D7B77A]/40 cursor-pointer"
              >
                <option value="featured">Featured</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="newest">New Arrivals</option>
                <option value="best-sellers">Best Sellers</option>
                <option value="rating">Highest Rated</option>
              </select>
            </div>

            {/* Filter Trigger Button */}
            <button
              id="side-filter-drawer-trigger"
              onClick={() => setIsMobileFilterOpen(true)}
              className="px-4 py-2 bg-[#180306] hover:bg-[#D7B77A] hover:text-[#F7F0E5] border border-[#D7B77A]/50 text-xs font-semibold text-[#E8D2A4] flex items-center gap-1.5 transition-colors cursor-pointer group"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#F7F0E5] group-hover:text-[#F7F0E5]" />
              <span>Filters {activeFiltersCount > 0 && `(${activeFiltersCount})`}</span>
            </button>

            {/* Mobile Layout Toggle (1-Col vs 2-Col Grid) */}
            <div className="flex sm:hidden items-center border border-[#D7B77A]/35 p-0.5 bg-[#120205] gap-1 select-none">
              <button
                type="button"
                id="layout-toggle-2col"
                onClick={() => setMobileColumns('2')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  mobileColumns === '2'
                    ? 'bg-[#D7B77A] text-[#F7F0E5]'
                      : 'text-[#E8D2A4]/55 hover:text-[#E8D2A4]'
                }`}
                title="2-Column Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                id="layout-toggle-1col"
                onClick={() => setMobileColumns('1')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  mobileColumns === '1'
                    ? 'bg-[#D7B77A] text-[#F7F0E5]'
                      : 'text-[#E8D2A4]/55 hover:text-[#E8D2A4]'
                }`}
                title="1-Column Full Width View"
              >
                <Square className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Desktop Filter Sidebar */}
          <div className="hidden lg:block lg:col-span-3 space-y-6">
            
            <div className="bg-[#180306] border border-[#D7B77A]/25 p-5 space-y-6">
              <div className="flex items-center justify-between border-b border-[#D7B77A]/25 pb-3">
                <span className="font-serif text-lg font-semibold text-[#E8D2A4] flex items-center gap-2">
                  <Filter className="w-4 h-4 text-[#D7B77A]" /> Filters
                </span>
                {activeFiltersCount > 0 && (
                  <button
                    id="desktop-clear-filters-btn"
                    onClick={resetFilters}
                    className="text-xs text-[#D7B77A] hover:text-[#E8D2A4] hover:underline font-semibold"
                  >
                    Reset All
                  </button>
                )}
              </div>

              {/* Fabric Filter */}
              <div className="border-t border-[#D7B77A]/10 pt-4">
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#F7F0E5] mb-2.5">
                  Fabric Material
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'Cotton', label: 'Cotton' },
                    { id: 'Georgette', label: 'Georgette' },
                    { id: 'Silk', label: 'Chanderi/Silk' },
                    { id: 'Rayon', label: 'Rayon' },
                    { id: 'Velvet', label: 'Velvet' },
                    { id: 'Organza', label: 'Organza' },
                  ].map((f) => {
                    const isSelected = selectedFabrics.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => toggleFabric(f.id)}
                        className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg border transition-all duration-200 cursor-pointer ${
                          isSelected
                            ? 'bg-[#D7B77A] text-[#F7F0E5] border-[#D7B77A]/40'
                            : 'bg-[#120205] text-[#E8D2A4] border-[#D7B77A]/25 hover:border-[#D7B77A]'
                        }`}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Category Filter */}
              <div className="border-t border-[#D7B77A]/10 pt-4">
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#F7F0E5] mb-2.5">
                  Category
                </label>
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {CATEGORIES_LIST.map((cat) => (
                    <button
                      key={cat}
                      id={`sidebar-category-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                      onClick={() => setSelectedCategory(cat)}
                      className={`w-full text-left py-1.5 px-2 rounded-md text-xs font-bold transition-all duration-200 flex items-center justify-between ${
                        selectedCategory === cat
                          ? 'bg-[#D7B77A] text-[#F7F0E5]'
                          : 'text-[#E8D2A4]/70 hover:bg-[#120205] hover:text-[#E8D2A4]'
                      }`}
                    >
                      <span>{cat}</span>
                      {selectedCategory === cat && <Check className="w-3.5 h-3.5 text-[#F7F0E5]" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Size Filter */}
              <div className="border-t border-[#D7B77A]/10 pt-4">
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#F7F0E5] mb-2.5">
                  Size
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {ALL_SIZES.map((sz) => (
                    <button
                      key={sz}
                      id={`filter-size-${sz}`}
                      onClick={() => toggleSize(sz)}
                      className={`py-1.5 text-xs font-bold rounded-lg border transition-all duration-250 ${
                        selectedSizes.includes(sz)
                          ? 'bg-[#D7B77A] text-[#F7F0E5] border-[#D7B77A]/40'
                          : 'bg-[#120205] text-[#E8D2A4] border-[#D7B77A]/25 hover:border-[#D7B77A]'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Range Filter */}
              <div className="border-t border-[#D7B77A]/10 pt-4 space-y-2">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-[#F7F0E5]">
                  <span>Max Price:</span>
                  <span className="text-[#F7F0E5] font-bold">₹{maxPrice.toLocaleString('en-IN')}</span>
                </div>
                <input
                  type="range"
                  min={700}
                  max={3000}
                  step={100}
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(Number(e.target.value))}
                  className="w-full accent-[#3D0F1F] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-[#F7F0E5]/55 font-mono">
                  <span>₹700</span>
                  <span>₹3,000</span>
                </div>
              </div>

              {/* Discount Filter */}
              <div className="border-t border-[#D7B77A]/10 pt-4">
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#F7F0E5] mb-2">
                  Minimum Discount
                </label>
                <div className="space-y-1.5 text-xs text-[#F7F0E5]/75">
                  {[
                    { label: 'All Discounts', val: 0 },
                    { label: '30% or more', val: 30 },
                    { label: '35% or more', val: 35 },
                    { label: '40% or more', val: 40 },
                  ].map((d) => (
                    <label key={d.val} className="flex items-center gap-2 cursor-pointer font-bold text-[#F7F0E5]/75">
                      <input
                        type="radio"
                        name="discountFilter"
                        checked={minDiscount === d.val}
                        onChange={() => setMinDiscount(d.val)}
                        className="accent-[#241D1B]"
                      />
                      <span>{d.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Minimum Rating */}
              <div className="border-t border-[#D7B77A]/10 pt-4">
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#F7F0E5] mb-2">
                  Rating
                </label>
                <div className="space-y-1.5 text-xs text-[#F7F0E5]/75">
                  {[
                    { label: 'All Ratings', val: 0 },
                    { label: '4.8', val: 4.8 },
                    { label: '4.5', val: 4.5 },
                  ].map((r) => (
                    <label key={r.val} className="flex items-center gap-2 cursor-pointer font-bold text-[#F7F0E5]/75">
                      <input
                        type="radio"
                        name="ratingFilter"
                        checked={minRating === r.val}
                        onChange={() => setMinRating(r.val)}
                        className="accent-[#241D1B]"
                      />
                      <span className="flex items-center gap-1">
                        {r.val > 0 ? <><span>{r.label}</span><Star className="w-3 h-3 fill-[#D7B77A] text-[#D7B77A]" aria-hidden="true" /><span>and above</span></> : r.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

            </div>

          </div>

          {/* Product Grid Area */}
          <div className="lg:col-span-9">

            {/* Horizontal Category Quick Filter Pills Bar */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-3 mb-6 scroll-smooth">
              {CATEGORIES_LIST.map((cat) => {
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    id={`quick-cat-pill-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-4 py-2.5 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-300 flex items-center gap-1.5 shadow-xs cursor-pointer ${
                      isSelected
                        ? 'bg-[#D7B77A] text-[#F7F0E5] border border-[#D7B77A]/40'
                        : 'bg-[#120205] hover:bg-[#180306] text-[#E8D2A4]/75 border border-[#D7B77A]/25 hover:border-[#D7B77A]/50'
                    }`}
                  >
                    {isSelected && <Sparkles className="w-3.5 h-3.5 text-[#F7F0E5]" />}
                    <span>{cat}</span>
                  </button>
                );
              })}
            </div>

            {isLoading ? (
              <div className="py-24 flex flex-col items-center justify-center text-center">
                <div className="w-10 h-10 border-4 border-[#D7B77A]/30 border-t-[#241D1B] rounded-full animate-spin mb-4"></div>
                <h3 className="font-serif text-xl text-[#F7F0E5] font-semibold">Curating Exquisite Couture...</h3>
              </div>
            ) : (
              <VirtualizedCatalogGrid 
                products={filteredProducts} 
                onResetFilters={resetFilters} 
                mobileColumns={mobileColumns}
                isLoading={isLoading}
              />
            )}
          </div>

        </div>

      </div>

      {/* Universal Side Filter Drawer */}
      <FilterDrawer
        isOpen={isMobileFilterOpen}
        onClose={() => setIsMobileFilterOpen(false)}
        categoriesList={CATEGORIES_LIST}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        selectedFabrics={selectedFabrics}
        toggleFabric={toggleFabric}
        selectedFits={selectedFits}
        toggleFit={toggleFit}
        selectedOccasions={selectedOccasions}
        toggleOccasion={toggleOccasion}
        selectedSizes={selectedSizes}
        toggleSize={toggleSize}
        selectedColors={selectedColors}
        toggleColor={toggleColor}
        allSizes={ALL_SIZES}
        allColors={ALL_COLORS}
        maxPrice={maxPrice}
        setMaxPrice={setMaxPrice}
        minDiscount={minDiscount}
        setMinDiscount={setMinDiscount}
        minRating={minRating}
        setMinRating={setMinRating}
        resetFilters={resetFilters}
        totalResultsCount={filteredProducts.length}
        activeFiltersCount={activeFiltersCount}
      />
    </div>
  );
};
