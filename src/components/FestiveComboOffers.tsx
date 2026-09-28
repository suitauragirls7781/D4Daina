import React, { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { Sparkles, Gift, Check, ShoppingBag, Zap, ShieldCheck, Flame } from 'lucide-react';
import { getCleanImageUrl } from '../utils/imageHelper';

export const FestiveComboOffers: React.FC = () => {
  const { products, addToCart, showToast, navigateToProduct, setActivePage } = useShop();

  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(() => {
    return products.slice(0, 2).map(p => p.id);
  });
  const [isComboAdded, setIsComboAdded] = useState(false);

  if (!products || products.length < 2) return null;

  // Combo calculation logic (15% discount when 2 or more selected)
  const selectedProducts = products.filter(p => selectedProductIds.includes(p.id));
  const rawTotal = selectedProducts.reduce((sum, p) => sum + p.price, 0);
  const comboDiscountAmount = Math.round(rawTotal * 0.15); // 15% OFF
  const finalComboPrice = rawTotal - comboDiscountAmount;

  const toggleProductInCombo = (id: string) => {
    if (selectedProductIds.includes(id)) {
      if (selectedProductIds.length <= 2) {
        showToast('Select at least 2 suits to build your Festive Combo!', 'info');
        return;
      }
      setSelectedProductIds(prev => prev.filter(pId => pId !== id));
    } else {
      if (selectedProductIds.length >= 3) {
        showToast('Max 3 suits allowed per Combo Set for maximum 15% savings!', 'info');
        return;
      }
      setSelectedProductIds(prev => [...prev, id]);
    }
  };

  const handleAddComboToBag = () => {
    selectedProducts.forEach(prod => {
      const sizeToUse = prod.sizes?.[0] || 'M';
      const colorToUse = prod.colors?.[0] || { name: 'Artisan Gold', hex: '#9A6A3A' };
      addToCart({
        ...prod,
        price: Math.round(prod.price * 0.85) // Apply 15% discount
      }, sizeToUse, colorToUse, 1, false);
    });

    setIsComboAdded(true);
    setTimeout(() => setIsComboAdded(false), 2500);
    showToast(`Added ${selectedProducts.length} Artisan Suits Combo to Bag at ₹${finalComboPrice.toLocaleString('en-IN')}!`, 'success');
  };

  const handleBuyComboNow = () => {
    if (selectedProducts.length < 2) {
      showToast('Select at least 2 suits to build your Festive Combo!', 'info');
      return;
    }

    selectedProducts.forEach((product) => {
      const size = product.sizes?.[0] || 'M';
      const color = product.colors?.[0] || { name: 'Artisan Gold', hex: '#B8935A' };
      addToCart({ ...product, price: Math.round(product.price * 0.85) }, size, color, 1, false);
    });
    setActivePage('checkout');
  };

  return (
    <section id="festive-combo-offers-section" className="w-full py-12 sm:py-16 bg-[#120205] border-b border-[#D7B77A]/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Section Header */}
        <div className="text-center space-y-1.5 max-w-xl mx-auto">
          <div className="inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-[#D7B77A]">
            <Sparkles className="w-3.5 h-3.5" />
            <span>ROYAL FESTIVE COMBO SAVINGS</span>
          </div>
          <h2 className="font-serif font-semibold text-3xl sm:text-4xl text-[#E8D2A4]">
            Buy 2 Suits & Save Extra 15% OFF
          </h2>
          <p className="text-sm sm:text-base text-[#E8D2A4]/75 font-sans">
            Mix & match any handcrafted Artisan kurti or suit sets. Get instant 15% bundle discount + Free Artisan Silk Gift Tote!
          </p>
        </div>

        {/* Combo Builder Main Card */}
        <div className="grid grid-cols-1 items-stretch border border-[#D7B77A]/35 bg-[#180306] lg:grid-cols-12">
          
          {/* Product Selection Pickers (7 Cols) */}
          <div className="space-y-4 p-4 sm:p-7 lg:col-span-7">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold text-[#E8D2A4] pb-3 border-b border-[#D7B77A]/25">
              <span className="uppercase tracking-wider">Tap Suits To Add To Your Combo Box:</span>
              <span className="text-[#F7F0E5]">{selectedProducts.length} Selected</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {products.slice(0, 6).map((prod) => {
                const isSelected = selectedProductIds.includes(prod.id);
                return (
                  <div
                    key={prod.id}
                    onClick={() => toggleProductInCombo(prod.id)}
                    className={`relative rounded-sm p-2.5 border transition-colors cursor-pointer flex flex-col items-center text-center space-y-1.5 ${
                      isSelected 
                        ? 'border-[#D7B77A]/40 bg-[#D7B77A]/10' 
                        : 'border-[#D7B77A]/30 bg-[#120205] hover:border-[#D7B77A]'
                    }`}
                  >
                    {/* Checkmark Ribbon */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 bg-[#D7B77A] text-[#F7F0E5] p-1">
                        <Check className="w-3 h-3" />
                      </div>
                    )}

                    <div className="w-full aspect-[4/5] overflow-hidden bg-[#180306]">
                      <img 
                        src={getCleanImageUrl(prod.images?.[0] || prod.image)} 
                        alt={prod.name} 
                        className="w-full h-full object-cover object-top"
                      />
                    </div>

                    <h4 className="font-serif font-semibold text-xs text-[#E8D2A4] line-clamp-1">{prod.name}</h4>
                    <span className="font-serif font-semibold text-sm text-[#E8D2A4]">₹{prod.price.toLocaleString('en-IN')}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Bundle Savings Calculator (5 Cols) */}
          <div className="flex flex-col justify-center space-y-5 bg-[#D7B77A] p-5 text-[#F7F0E5] sm:p-7 lg:col-span-5">
            
            <div className="flex items-center justify-between pb-3 border-b border-[#D7B77A]/35">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-[#E8D2A4]" />
                <h3 className="font-serif font-semibold text-lg text-[#F7F0E5]">Combo Summary</h3>
              </div>
              <span className="text-[10px] font-bold uppercase px-2 py-1 bg-[#D7B77A] text-[#E8D2A4]">
                15% OFF SAVINGS
              </span>
            </div>

            {/* Price Calculations */}
            <div className="space-y-2 text-xs font-sans">
              <div className="flex justify-between text-[#F7F0E5]/80">
                <span>Combined Price ({selectedProducts.length} Items):</span>
                <span>₹{rawTotal.toLocaleString('en-IN')}</span>
              </div>

              <div className="flex justify-between text-[#E8D2A4] font-semibold">
                <span>15% Festive Combo Discount:</span>
                <span>-₹{comboDiscountAmount.toLocaleString('en-IN')}</span>
              </div>

              <div className="flex justify-between text-emerald-200 font-medium">
                <span>Free Silk Gift Tote:</span>
                <span>FREE (Valued ₹499)</span>
              </div>

              <div className="pt-3 border-t border-[#D7B77A]/35 flex justify-between items-baseline">
                <span className="font-serif font-semibold text-sm text-[#F7F0E5]">Final Bundle Total:</span>
                <span className="font-serif font-semibold text-2xl text-[#E8D2A4]">₹{finalComboPrice.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* CTAs */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={handleAddComboToBag}
                className={`w-full py-3 px-3 rounded font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer border ${
                  isComboAdded 
                    ? 'bg-emerald-700 text-[#F7F0E5] border-emerald-500' 
                    : 'bg-[#180306] text-[#E8D2A4] border-[#FAF5EB] hover:bg-[#120205]'
                }`}
              >
                {isComboAdded ? <Check className="w-4 h-4 text-emerald-300" /> : <ShoppingBag className="w-4 h-4" />}
                <span>{isComboAdded ? 'ADDED COMBO TO BAG!' : 'ADD FESTIVE COMBO TO BAG'}</span>
              </button>

              <button
                type="button"
                onClick={handleBuyComboNow}
                className="w-full py-3 px-3 bg-[#D7B77A] text-[#E8D2A4] font-semibold text-xs uppercase tracking-wider hover:bg-[#D7B77A] transition-colors flex items-center justify-center gap-2 cursor-pointer border border-[#D7B77A]"
              >
                <Zap className="w-4 h-4" />
                <span>INSTANT BUY COMBO NOW</span>
              </button>
            </div>

            <div className="flex items-center justify-center gap-2 text-[10px] text-[#F7F0E5]/70 font-medium pt-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>100% Guaranteed Fit & 7-Day Easy Exchange</span>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
};
