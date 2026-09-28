import React, { useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { 
  Flame, 
  Sparkles, 
  Save, 
  CheckCircle2, 
  Clock, 
  RefreshCw, 
  Zap, 
  Search, 
  Eye, 
  ShoppingBag,
  Star
} from 'lucide-react';
import { getCleanImageUrl } from '../../utils/imageHelper';

export const AdminDealOfTheDay: React.FC = () => {
  const { products = [], dealOfTheDay, updateDealOfTheDay } = useAdmin();
  const { showToast } = useShop();

  const [enabled, setEnabled] = useState<boolean>(dealOfTheDay?.enabled ?? true);
  const [productId, setProductId] = useState<string>(dealOfTheDay?.productId || (products[0]?.id || ''));
  const [badgeText, setBadgeText] = useState<string>(dealOfTheDay?.badgeText || "DEAL OF THE DAY");
  const [dealPrice, setDealPrice] = useState<number>(dealOfTheDay?.dealPrice || (products[0]?.price ? Math.round(products[0].price * 0.85) : 899));
  const [durationHours, setDurationHours] = useState<number>(dealOfTheDay?.durationHours || 24);
  const [stockText, setStockText] = useState<string>(dealOfTheDay?.stockText || "🔥 Only 30 left at this price!");

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isSaving, setIsSaving] = useState(false);

  // Currently selected active product
  const activeProduct = products.find((p) => p.id === productId) || products[0];

  // Filtered products for 1-click catalog picker
  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const categories = ['All', ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))];

  // 1-Click Set as Deal of the Day Handler
  const handleOneClickSelect = async (prod: any) => {
    setProductId(prod.id);
    const suggestedPrice = Math.round(prod.price * 0.82); // 18% additional deal discount
    setDealPrice(suggestedPrice);
    const newBadge = `DEAL OF THE DAY - ${prod.name.toUpperCase()}`;
    setBadgeText(newBadge);

    const futureEndTime = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();

    try {
      await updateDealOfTheDay({
        enabled: true,
        productId: prod.id,
        badgeText: newBadge,
        dealPrice: suggestedPrice,
        durationHours: Number(durationHours),
        endTime: futureEndTime,
        stockText: stockText || "🔥 Only 25 left at this special price!",
      });
      setEnabled(true);
      showToast(`⚡ 1-CLICK SYNC: "${prod.name}" is now LIVE as Deal of the Day at ₹${suggestedPrice}!`, 'success');
    } catch (err) {
      console.error('Error syncing deal:', err);
      showToast('Error syncing deal of the day', 'error');
    }
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const futureEndTime = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
      await updateDealOfTheDay({
        enabled,
        productId,
        badgeText,
        dealPrice: Number(dealPrice),
        durationHours: Number(durationHours),
        endTime: futureEndTime,
        stockText,
      });

      showToast('✨ Deal of the Day saved & synced live to Firebase!', 'success');
    } catch (err) {
      console.error('Error saving deal:', err);
      showToast('Error saving deal configuration', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetTimer = async () => {
    const futureEndTime = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
    await updateDealOfTheDay({
      endTime: futureEndTime,
      durationHours: Number(durationHours),
    });
    showToast(`⏱️ Timer reset to fresh ${durationHours}-Hour countdown!`, 'success');
  };

  return (
    <div className="space-y-8">
      
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-[#241D1B] via-[#241D1B] to-[#241D1B] text-[#211C1A] p-6 rounded-2xl border border-[#9A6A3A]/40 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#241D1B] border border-[#9A6A3A]/40 rounded-full text-xs font-bold text-[#211C1A]">
            <Flame className="w-4 h-4 text-black animate-pulse" />
            <span>1-CLICK DEAL OF THE DAY SPOTLIGHT</span>
          </div>
          <h1 className="font-serif font-black text-2xl text-white">Deal of the Day Manager</h1>
          <p className="text-xs text-[#F1E8DF]/80 font-sans">
            Sync any product from your catalog to the homepage with a single click. Connected to Firebase & live state.
          </p>
        </div>

        <button
          type="button"
          onClick={handleResetTimer}
          className="px-4 py-2.5 bg-[#F1E8DF] hover:bg-white text-[#211C1A] text-xs font-bold rounded-xl border border-[#9A6A3A] shadow-xs flex items-center gap-2 transition cursor-pointer shrink-0"
        >
          <RefreshCw className="w-4 h-4 text-black" />
          <span>RESET TIMER ({durationHours}H)</span>
        </button>
      </div>

      {/* 2. Enable/Disable Master Toggle */}
      <div className="bg-white rounded-2xl p-5 border border-[#9A6A3A]/35 shadow-xs flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <span className="text-sm font-serif font-bold text-[#211C1A] flex items-center gap-2">
            <span>Show "Deal of the Day" Section on Homepage</span>
            {enabled && (
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-full border border-emerald-300">
                LIVE ON HOMEPAGE
              </span>
            )}
          </span>
          <p className="text-xs text-gray-600">
            When enabled, the single spotlight card appears right below the Hero banner on your storefront.
          </p>
        </div>

        <label className="relative inline-flex items-center cursor-pointer">
          <input 
            type="checkbox" 
            checked={enabled} 
            onChange={(e) => {
              const val = e.target.checked;
              setEnabled(val);
              updateDealOfTheDay({ enabled: val });
              showToast(val ? 'Deal section enabled' : 'Deal section hidden', 'info');
            }}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#241D1B]" />
        </label>
      </div>

      {/* 3. 1-CLICK CATALOG SYNC GRID */}
      <div className="bg-white rounded-2xl p-6 border border-[#9A6A3A]/30 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
          <div>
            <h2 className="font-serif text-lg font-bold text-[#211C1A] flex items-center gap-2">
              <Zap className="w-5 h-5 text-black" />
              <span>Select Product to Spotlight (1-Click Sync)</span>
            </h2>
            <p className="text-xs text-gray-500">
              Click "⚡ SET AS DEAL OF THE DAY" on any uploaded product to make it the live spotlight.
            </p>
          </div>

          {/* Search & Category Filter */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-48">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-gray-200 text-xs text-gray-800 outline-none focus:border-[#241D1B]"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs text-gray-800 font-medium outline-none focus:border-[#241D1B] bg-white"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Product Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[420px] overflow-y-auto p-1 scrollbar-thin">
          {filteredProducts.map((prod) => {
            const isActive = productId === prod.id && enabled;
            const thumb = getCleanImageUrl(prod.images?.[0] || prod.image);

            return (
              <div 
                key={prod.id}
                className={`p-3 rounded-xl border transition-all flex flex-col justify-between relative ${
                  isActive 
                    ? 'border-[#241D1B] bg-[#F1E8DF] ring-2 ring-[#9A6A3A] shadow-md' 
                    : 'border-gray-200 bg-white hover:border-[#9A6A3A]/50'
                }`}
              >
                {isActive && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 bg-[#241D1B] text-[#211C1A] text-[9px] font-black rounded-md shadow-xs">
                    ACTIVE DEAL
                  </span>
                )}

                <div className="flex items-center gap-3">
                  <img 
                    src={thumb} 
                    alt={prod.name} 
                    className="w-14 h-18 object-cover object-top rounded-lg border border-gray-200 shrink-0 bg-gray-50"
                  />
                  <div className="min-w-0 space-y-1">
                    <span className="text-[9px] font-bold text-black uppercase tracking-wider block truncate">
                      {prod.category}
                    </span>
                    <h4 className="font-serif font-bold text-xs text-[#211C1A] line-clamp-2 leading-tight">
                      {prod.name}
                    </h4>
                    <div className="text-xs font-black text-[#211C1A]">
                      Catalog: ₹{prod.price.toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOneClickSelect(prod)}
                  className={`mt-3 w-full py-2 px-3 text-[11px] font-serif font-black uppercase tracking-wider rounded-lg border flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    isActive 
                      ? 'bg-emerald-600 text-white border-emerald-700' 
                      : 'bg-[#241D1B] hover:bg-[#20050E] text-[#211C1A] border-[#9A6A3A]'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 text-black fill-black" />
                  <span>{isActive ? 'CURRENTLY ACTIVE' : '⚡ 1-CLICK SET AS DEAL'}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. ACTIVE DEAL PARAMETERS FORM */}
      <form onSubmit={handleSaveForm} className="bg-white rounded-2xl p-6 border border-[#9A6A3A]/30 shadow-xs space-y-6">
        
        <div className="border-b border-gray-100 pb-3">
          <h2 className="font-serif text-lg font-bold text-[#211C1A] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-black" />
            <span>Customize Active Deal Parameters</span>
          </h2>
          <p className="text-xs text-gray-500">
            Fine-tune promotional pricing, custom banner text, and stock warnings.
          </p>
        </div>

        {/* Selected Product Banner */}
        {activeProduct && (
          <div className="p-4 bg-[#F1E8DF] rounded-2xl border border-[#9A6A3A]/30 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img 
                src={getCleanImageUrl(activeProduct.images?.[0] || activeProduct.image)} 
                alt="" 
                className="w-14 h-18 object-cover object-top rounded-xl border border-[#9A6A3A]/40 shrink-0"
              />
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-black uppercase tracking-widest">{activeProduct.category}</span>
                <h4 className="font-serif font-bold text-sm text-[#211C1A]">{activeProduct.name}</h4>
                <p className="text-xs text-gray-600">Standard Catalog Price: ₹{activeProduct.price.toLocaleString('en-IN')}</p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">PROMOTIONAL DEAL PRICE</span>
              <span className="font-serif text-2xl font-black text-[#211C1A]">₹{dealPrice.toLocaleString('en-IN')}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-800 uppercase tracking-wider block">
              Promotional Deal Price (₹) *
            </label>
            <input 
              type="number" 
              required
              min="1"
              value={dealPrice} 
              onChange={(e) => setDealPrice(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-[#211C1A] focus:ring-2 focus:ring-[#241D1B] outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-800 uppercase tracking-wider block">
              Timer Duration (Hours) *
            </label>
            <select
              value={durationHours}
              onChange={(e) => setDurationHours(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-[#211C1A] focus:ring-2 focus:ring-[#241D1B] outline-none bg-white"
            >
              <option value={6}>6 Hours</option>
              <option value={12}>12 Hours</option>
              <option value={24}>24 Hours (Default)</option>
              <option value={48}>48 Hours</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-800 uppercase tracking-wider block">
              Stock Urgency Notice
            </label>
            <input 
              type="text" 
              value={stockText} 
              onChange={(e) => setStockText(e.target.value)}
              placeholder="e.g. 🔥 Only 30 left at this price!"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs font-medium focus:ring-2 focus:ring-[#241D1B] outline-none"
            />
          </div>

        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-800 uppercase tracking-wider block">
            Top Banner Headline Text
          </label>
          <input 
            type="text" 
            value={badgeText} 
            onChange={(e) => setBadgeText(e.target.value)}
            placeholder="e.g. DEAL OF THE DAY - FULL COMBO SET"
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs font-medium focus:ring-2 focus:ring-[#241D1B] outline-none"
          />
        </div>

        {/* Save Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="w-full md:w-auto py-3.5 px-8 bg-[#241D1B] hover:bg-[#20050E] text-[#211C1A] font-serif font-black text-xs uppercase tracking-wider rounded-xl transition shadow-md flex items-center justify-center gap-2 cursor-pointer border border-[#9A6A3A]"
          >
            <Save className="w-4 h-4 text-black" />
            <span>{isSaving ? 'SAVING...' : 'SAVE & SYNC TO HOMEPAGE'}</span>
          </button>
        </div>

      </form>

      {/* 5. LIVE PREVIEW CARD */}
      <div className="space-y-3">
        <h3 className="font-serif font-bold text-base text-[#211C1A] flex items-center gap-2">
          <Eye className="w-4 h-4 text-black" />
          <span>Live Front-Store Preview</span>
        </h3>

        {activeProduct && (
          <div className="max-w-xl mx-auto bg-white rounded-2xl border border-[#9A6A3A]/35 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-[#241D1B] via-[#241D1B] to-[#241D1B] text-[#211C1A] px-4 py-2 flex items-center justify-between">
              <span className="font-serif text-xs font-bold text-black truncate uppercase">
                {badgeText || `DEAL OF THE DAY - ${activeProduct.name}`}
              </span>
              <span className="text-[9px] font-black uppercase text-black bg-[#F1E8DF]/10 px-2 py-0.5 rounded-full border border-[#C7A77A]/30">
                EXCLUSIVE OFFER
              </span>
            </div>

            <div className="p-3 grid grid-cols-12 gap-3 items-center">
              <img 
                src={getCleanImageUrl(activeProduct.images?.[0] || activeProduct.image)} 
                alt="" 
                className="col-span-4 aspect-[4/5] object-cover object-top rounded-xl border border-gray-200"
              />
              <div className="col-span-8 space-y-1.5">
                <span className="text-[9px] font-bold text-black uppercase">{activeProduct.category}</span>
                <h4 className="font-serif font-bold text-sm text-[#211C1A] leading-tight">{activeProduct.name}</h4>
                <div className="flex items-baseline gap-2">
                  <span className="font-serif font-black text-lg text-[#211C1A]">₹{dealPrice.toLocaleString('en-IN')}</span>
                  <span className="text-xs text-gray-400 line-through">₹{activeProduct.price.toLocaleString('en-IN')}</span>
                </div>
                <div className="text-[10px] font-bold text-black">{stockText}</div>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
