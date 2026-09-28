import React from 'react';
import { motion } from 'motion/react';
import { X, SlidersHorizontal, Sparkles, Check, RotateCcw, Shirt, Tag, DollarSign, Percent, Calendar } from 'lucide-react';
import { ProductCategory, ProductSize } from '../types';

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  categoriesList: (ProductCategory | 'All' | 'Sale' | 'New Arrivals' | 'Best Sellers' | 'Trending')[];
  selectedCategory: string;
  setSelectedCategory: (cat: any) => void;
  selectedFabrics: string[];
  toggleFabric: (fabric: string) => void;
  selectedFits: string[];
  toggleFit: (fit: string) => void;
  selectedOccasions: string[];
  toggleOccasion: (occ: string) => void;
  selectedSizes: ProductSize[];
  toggleSize: (size: ProductSize) => void;
  selectedColors: string[];
  toggleColor: (color: string) => void;
  allSizes: ProductSize[];
  allColors: { name: string; hex: string }[];
  maxPrice: number;
  setMaxPrice: (val: number) => void;
  minDiscount: number;
  setMinDiscount: (val: number) => void;
  minRating: number;
  setMinRating: (val: number) => void;
  resetFilters: () => void;
  totalResultsCount: number;
  activeFiltersCount: number;
}

const FABRIC_OPTIONS = [
  { id: 'Cotton', label: 'Cotton / Cambric / Mulmul', highlight: true },
  { id: 'Georgette', label: 'Georgette Silk', highlight: true },
  { id: 'Silk', label: 'Pure Chanderi / Silk Blend' },
  { id: 'Rayon', label: 'Rayon Slub / Flex' },
  { id: 'Velvet', label: 'Heavy Micro-Velvet' },
  { id: 'Organza', label: 'Pure Organza' },
];

const FIT_OPTIONS = [
  { id: 'Straight / Regular Fit', label: 'Straight / Regular Slit Fit' },
  { id: 'Anarkali / Flare', label: 'Anarkali / Flared Kalidaar' },
  { id: 'A-Line / Relaxed', label: 'A-Line / Relaxed Drape' },
  { id: 'Tailored Fit', label: 'Tailored Fitted Silhouette' },
];

const OCCASION_OPTIONS = [
  { id: 'Casual / Workwear', label: 'Casual / Office & Workwear' },
  { id: 'Festive Wear', label: 'Festive Celebrations & Pujas' },
  { id: 'Party Wear', label: 'Evening Soirées & Cocktail Parties' },
  { id: 'Wedding / Ceremonial', label: 'Weddings & Royal Functions' },
];

export const FilterDrawer: React.FC<FilterDrawerProps> = ({
  isOpen,
  onClose,
  categoriesList,
  selectedCategory,
  setSelectedCategory,
  selectedFabrics,
  toggleFabric,
  selectedFits,
  toggleFit,
  selectedOccasions,
  toggleOccasion,
  selectedSizes,
  toggleSize,
  selectedColors,
  toggleColor,
  allSizes,
  allColors,
  maxPrice,
  setMaxPrice,
  minDiscount,
  setMinDiscount,
  resetFilters,
  totalResultsCount,
  activeFiltersCount,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9900] flex justify-end">
      {/* Backdrop */}
      <div 
        id="filter-drawer-backdrop"
        className="fixed inset-0 bg-[#5C0B1B]/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Slide-Over Drawer Panel (Bespoke Artisan styling) */}
      <motion.div 
        id="filter-drawer-panel"
        initial={{ x: '100%' }}
        animate={{ x: isOpen ? 0 : '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="relative w-full max-w-md bg-[#120205] h-full flex flex-col z-10 text-[#E8D2A4] overflow-hidden border-l border-[#D7B77A]/35"
      >
        {/* Header Bar */}
        <div className="bg-[#D7B77A] text-[#F7F0E5] px-5 py-4 flex items-center justify-between border-b border-[#D7B77A]/35">
          <div className="flex items-center gap-3">
            <div className="w-8.5 h-8.5 rounded-full bg-[#180306]/10 flex items-center justify-center border border-[#D7B77A]/15">
              <SlidersHorizontal className="w-4 h-4 text-[#E8D2A4]" />
            </div>
            <div>
              <h2 className="font-serif font-semibold text-base text-[#F7F0E5] tracking-wide flex items-center gap-2">
                Refine Couture
                {activeFiltersCount > 0 && (
                  <span className="bg-[#D7B77A] text-[#F7F0E5] text-[10px] font-bold px-2 py-0.5 rounded-full border border-[#D7B77A]/15">
                    {activeFiltersCount} Active
                  </span>
                )}
              </h2>
              <p className="text-[10px] text-[#F7F0E5]/55">Filter by fabric, fit, price, occasion & size</p>
            </div>
          </div>

          <button
            type="button"
            id="filter-drawer-close-btn"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-[#180306]/10 text-[#F7F0E5]/55 hover:text-[#F7F0E5] transition-all cursor-pointer"
            aria-label="Close filter drawer"
          >
            <X className="w-5 h-5 text-[#F7F0E5]" />
          </button>
        </div>

        {/* Scrollable Filter Options */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* 1. Fabric Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#D7B77A]/15 pb-2">
              <label className="text-xs font-black uppercase tracking-[0.12em] text-[#F7F0E5] flex items-center gap-1.5">
                <Shirt className="w-3.5 h-3.5 text-[#F7F0E5]" />
                Fabric Material
              </label>
              {selectedFabrics.length > 0 && (
                <span className="text-[10px] font-bold text-[#F7F0E5]">
                  {selectedFabrics.length} selected
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FABRIC_OPTIONS.map((f) => {
                const isChecked = selectedFabrics.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    id={`filter-fabric-${f.id.toLowerCase()}`}
                    onClick={() => toggleFabric(f.id)}
                    className={`px-3 py-2.5 rounded text-left text-xs font-bold border transition-all duration-200 flex items-center justify-between cursor-pointer ${
                      isChecked
                        ? 'bg-[#5C0B1B] text-[#F7F0E5] border-[#D7B77A]/40 shadow-xs'
                        : 'bg-[#180306] border-[#D7B77A]/15 text-[#F7F0E5] hover:border-[#D7B77A]/50 hover:bg-[#2A0710]'
                    }`}
                  >
                    <span className="truncate pr-1">{f.label}</span>
                    {isChecked && <Check className="w-3.5 h-3.5 text-[#F7F0E5] shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Fit Type Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#D7B77A]/15 pb-2">
              <label className="text-xs font-black uppercase tracking-[0.12em] text-[#F7F0E5] flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-[#F7F0E5]" />
                Garment Fit
              </label>
            </div>

            <div className="space-y-1.5">
              {FIT_OPTIONS.map((fit) => {
                const isChecked = selectedFits.includes(fit.id);
                return (
                  <button
                    key={fit.id}
                    type="button"
                    id={`filter-fit-${fit.id.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                    onClick={() => toggleFit(fit.id)}
                    className={`w-full px-3 py-2.5 rounded text-left text-xs font-bold border transition-all duration-200 flex items-center justify-between cursor-pointer ${
                      isChecked
                        ? 'bg-[#5C0B1B] text-[#F7F0E5] border-[#D7B77A]/40 shadow-xs'
                        : 'bg-[#180306] border-[#D7B77A]/15 text-[#F7F0E5] hover:bg-[#2A0710] hover:border-[#D7B77A]/40'
                    }`}
                  >
                    <span>{fit.label}</span>
                    {isChecked && <Check className="w-3.5 h-3.5 text-[#F7F0E5]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Occasion Filter */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#D7B77A]/15 pb-2">
              <label className="text-xs font-black uppercase tracking-[0.12em] text-[#F7F0E5] flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#F7F0E5]" />
                Occasion & Style
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {OCCASION_OPTIONS.map((occ) => {
                const isChecked = selectedOccasions.includes(occ.id);
                return (
                  <button
                    key={occ.id}
                    type="button"
                    id={`filter-occasion-${occ.id.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                    onClick={() => toggleOccasion(occ.id)}
                    className={`px-3 py-2.5 rounded text-left text-xs font-bold border transition-all duration-200 flex items-center justify-between cursor-pointer ${
                      isChecked
                        ? 'bg-[#5C0B1B] text-[#F7F0E5] border-[#D7B77A]/40'
                        : 'bg-[#180306] border-[#D7B77A]/15 text-[#F7F0E5] hover:bg-[#2A0710] hover:border-[#D7B77A]/40'
                    }`}
                  >
                    <span className="truncate pr-1">{occ.label}</span>
                    {isChecked && <Check className="w-3.5 h-3.5 text-[#F7F0E5] shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Price Filter */}
          <div className="space-y-3 bg-[#2A0710] p-4 rounded border border-[#D7B77A]/30">
            <div className="flex justify-between items-center text-xs font-black uppercase tracking-[0.12em] text-[#F7F0E5]">
              <span className="flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-[#F7F0E5]" />
                Maximum Price
              </span>
              <span className="text-[#F7F0E5] font-bold text-sm">₹{maxPrice.toLocaleString('en-IN')}</span>
            </div>

            <input
              type="range"
              id="filter-drawer-price-range"
              min={700}
              max={3000}
              step={100}
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              className="w-full accent-[#211C1A] cursor-pointer"
            />

            <div className="flex justify-between text-[11px] font-bold text-[#F7F0E5]/55">
              <span>₹700</span>
              <span>₹3,000</span>
            </div>

            {/* Quick Price Preset Pills */}
            <div className="flex items-center gap-1.5 pt-1 flex-wrap">
              {[
                { label: '< ₹1,000', price: 1000 },
                { label: '< ₹1,800', price: 1800 },
                { label: '< ₹2,500', price: 2500 },
                { label: 'All Prices', price: 3000 },
              ].map((preset) => (
                <button
                  key={preset.price}
                  type="button"
                  onClick={() => setMaxPrice(preset.price)}
                  className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold border transition-all duration-200 cursor-pointer ${
                    maxPrice === preset.price
                      ? 'bg-[#5C0B1B] text-[#F7F0E5] border-[#D7B77A]/40'
                      : 'bg-[#180306] text-[#F7F0E5]/75 border-[#D7B77A]/15 hover:bg-[#2A0710]'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* 5. Minimum Discount % Filter */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#D7B77A]/15 pb-2">
              <label className="text-xs font-black uppercase tracking-[0.12em] text-[#F7F0E5] flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 text-[#F7F0E5]" />
                Discount Percentage
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'All Discounts', val: 0 },
                { label: '30% or more', val: 30 },
                { label: '35% or more', val: 35 },
                { label: '40% or more', val: 40 },
              ].map((d) => {
                const isSelected = minDiscount === d.val;
                return (
                  <button
                    key={d.val}
                    type="button"
                    onClick={() => setMinDiscount(d.val)}
                    className={`px-3 py-2.5 rounded text-xs font-bold border transition-all duration-200 text-left flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-[#5C0B1B] text-[#F7F0E5] border-[#D7B77A]/40'
                        : 'bg-[#180306] border-[#D7B77A]/15 text-[#F7F0E5] hover:bg-[#2A0710]'
                    }`}
                  >
                    <span>{d.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#F7F0E5]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 6. Category Selection */}
          <div className="space-y-3">
            <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#F7F0E5] border-b border-[#D7B77A]/15 pb-2">
              Apparel Category
            </label>
            <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
              {categoriesList.map((cat) => {
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1.5 rounded-lg text-left text-xs font-bold border transition-all duration-200 flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-[#5C0B1B] text-[#F7F0E5] border-[#D7B77A]/40'
                        : 'bg-[#180306] border-[#D7B77A]/15 text-[#F7F0E5]/75 hover:bg-[#2A0710]'
                    }`}
                  >
                    <span className="truncate pr-1">{cat}</span>
                    {isSelected && <Check className="w-3 h-3 text-[#F7F0E5] shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 7. Size Filter */}
          <div className="space-y-3 border-t border-[#D7B77A]/15 pt-3">
            <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#F7F0E5]">
              Select Sizes
            </label>
            <div className="grid grid-cols-6 gap-1.5">
              {allSizes.map((sz) => {
                const isSelected = selectedSizes.includes(sz);
                return (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => toggleSize(sz)}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? 'bg-[#5C0B1B] text-[#F7F0E5] border-[#D7B77A]/40'
                        : 'bg-[#180306] text-[#F7F0E5]/75 border-[#D7B77A]/15 hover:border-gray-400'
                    }`}
                  >
                    {sz}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 8. Color Filter */}
          <div className="space-y-3 border-t border-[#D7B77A]/15 pt-3">
            <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#F7F0E5]">
              Color Shade
            </label>
            <div className="flex flex-wrap gap-2">
              {allColors.map((col) => {
                const isSelected = selectedColors.includes(col.name);
                return (
                  <button
                    key={col.name}
                    type="button"
                    onClick={() => toggleColor(col.name)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? 'bg-[#5C0B1B] text-[#F7F0E5] border-[#D7B77A]/40'
                        : 'bg-[#180306] text-[#F7F0E5] border-[#D7B77A]/15 hover:border-[#D7B77A]/40'
                    }`}
                  >
                    <span 
                      className="w-3 h-3 rounded-full border border-[#D7B77A]/10" 
                      style={{ backgroundColor: col.hex }} 
                    />
                    <span>{col.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer Actions Bar */}
        <div className="p-4 bg-[#2A0710] border-t border-[#D7B77A]/20 shadow-md space-y-2 shrink-0">
          <motion.button
            whileTap={{ scale: 0.98 }}
            type="button"
            id="filter-drawer-apply-btn"
            onClick={onClose}
            className="w-full py-3 bg-[#5C0B1B] hover:bg-[#5C0B1B] text-[#F7F0E5] rounded text-xs font-bold uppercase tracking-[0.15em] transition-all duration-300 shadow-md flex items-center justify-center gap-2 cursor-pointer border border-[#D7B77A]/40"
          >
            <Sparkles className="w-4 h-4 text-[#F7F0E5]" />
            <span>Apply Filters ({totalResultsCount} Outfits)</span>
          </motion.button>

          {activeFiltersCount > 0 && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              type="button"
              id="filter-drawer-reset-btn"
              onClick={resetFilters}
              className="w-full py-2 text-xs font-bold text-[#F7F0E5] hover:text-[#F7F0E5] flex items-center justify-center gap-1 hover:underline cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset All Filters</span>
            </motion.button>
          )}
        </div>
      </motion.div>
    </div>
  );
};
