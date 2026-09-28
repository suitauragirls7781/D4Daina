import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { MapPin, X, CheckCircle2, AlertCircle, Loader2, Navigation, Sparkles, Truck } from 'lucide-react';
import { useShop } from '../context/ShopContext';

interface PopularMetro {
  city: string;
  pincode: string;
  state: string;
}

const POPULAR_METROS: PopularMetro[] = [
  { city: 'New Delhi', pincode: '110001', state: 'Delhi' },
  { city: 'Mumbai', pincode: '400001', state: 'Maharashtra' },
  { city: 'Bengaluru', pincode: '560001', state: 'Karnataka' },
  { city: 'Artisan', pincode: '302001', state: 'Rajasthan' },
  { city: 'Kolkata', pincode: '700001', state: 'West Bengal' },
  { city: 'Chennai', pincode: '600001', state: 'Tamil Nadu' },
  { city: 'Hyderabad', pincode: '500001', state: 'Telangana' },
  { city: 'Ahmedabad', pincode: '380001', state: 'Gujarat' },
];

export const PincodeModal: React.FC = () => {
  const { 
    isPincodeModalOpen, 
    setIsPincodeModalOpen, 
    userDeliveryLocation, 
    setUserDeliveryLocation,
    showToast 
  } = useShop();

  const [inputPincode, setInputPincode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lookupResult, setLookupResult] = useState<{
    city: string;
    state: string;
    area: string;
  } | null>(null);

  // Sync input value when modal opens
  useEffect(() => {
    if (isPincodeModalOpen) {
      setInputPincode(userDeliveryLocation.pincode || '');
      setErrorMsg('');
      setLookupResult({
        city: userDeliveryLocation.city,
        state: userDeliveryLocation.state,
        area: userDeliveryLocation.area || ''
      });
    }
  }, [isPincodeModalOpen, userDeliveryLocation]);

  if (!isPincodeModalOpen) return null;

  const handleLookup = async (codeToLookup: string) => {
    const cleanCode = codeToLookup.replace(/\[#B76E79\]/g, '').slice(0, 6);
    setInputPincode(cleanCode);
    setErrorMsg('');
    setLookupResult(null);

    if (cleanCode.length !== 6) {
      setErrorMsg('Please enter a valid 6-digit Indian pincode');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${cleanCode}`);
      const data = await res.json();

      if (data && data[0] && data[0].Status === 'Success' && data[0].PostOffice?.length > 0) {
        const po = data[0].PostOffice[0];
        const result = {
          city: po.District || po.Division || po.Name || 'India',
          state: po.State || 'India',
          area: po.Name || po.Block || ''
        };
        setLookupResult(result);
        
        // Save to state & localstorage
        setUserDeliveryLocation({
          pincode: cleanCode,
          city: result.city,
          state: result.state,
          area: result.area
        });

        showToast(`Delivery location set to ${result.city} (${cleanCode})`, 'success');
        setIsPincodeModalOpen(false);
      } else {
        setErrorMsg('Pincode not found or unserviceable. Please verify.');
      }
    } catch (e) {
      // Fallback if API fails
      const fallbackResult = {
        city: 'Delivery Location',
        state: 'India',
        area: ''
      };
      setUserDeliveryLocation({
        pincode: cleanCode,
        city: fallbackResult.city,
        state: fallbackResult.state,
      });
      showToast(`Pincode updated to ${cleanCode}`, 'info');
      setIsPincodeModalOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMetro = (metro: PopularMetro) => {
    setInputPincode(metro.pincode);
    setUserDeliveryLocation({
      pincode: metro.pincode,
      city: metro.city,
      state: metro.state,
      area: `${metro.city} Central`
    });
    showToast(`Delivery location set to ${metro.city} (${metro.pincode})`, 'success');
    setIsPincodeModalOpen(false);
  };

  return (
    <div 
      id="pincode-modal-overlay" 
      className="fixed inset-0 z-[9990] bg-[#5C0B1B]/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
      onClick={() => setIsPincodeModalOpen(false)}
    >
      <div 
        id="pincode-modal-card"
        className="relative w-full max-w-md bg-[#180306] rounded-md shadow-2xl border border-[#D7B77A]/15 overflow-hidden text-[#F7F0E5]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Header */}
        <div className="bg-gradient-to-r from-[#5C0B1B] via-[#5C0B1B] to-[#5C0B1B] text-[#F7F0E5] px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#180306]/10 flex items-center justify-center border border-[#D7B77A]/15">
              <MapPin className="w-4 h-4 text-[#F7F0E5]" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-base tracking-wide text-[#F7F0E5]">Select Delivery Location</h3>
              <p className="text-[11px] text-rose-200/90 font-medium">Get accurate shipping times & delivery updates</p>
            </div>
          </div>
          <button
            type="button"
            id="pincode-modal-close-btn"
            onClick={() => setIsPincodeModalOpen(false)}
            aria-label="Close delivery location modal"
            className="p-1.5 rounded-full hover:bg-\[#FAF7F2\]/10 text-[#F7F0E5]/80 hover:text-[#F7F0E5] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5">
          {/* Current Saved Location Pill */}
          <div className="bg-[#120205] border border-[#D7B77A]/15 rounded p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Navigation className="w-4 h-4 text-[#F7F0E5] shrink-0" />
              <div>
                <span className="text-[10px] font-bold text-[#F7F0E5]/55 uppercase tracking-wider block">Current Location</span>
                <p className="text-xs font-bold text-[#F7F0E5]">
                  {userDeliveryLocation.city} ({userDeliveryLocation.pincode}) - {userDeliveryLocation.state}
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold bg-emerald-950/40 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-800">
              Active
            </span>
          </div>

          {/* Pincode Input Box */}
          <div className="space-y-2">
            <label htmlFor="pincode-modal-input" className="block text-xs font-bold text-[#F7F0E5]/75">
              Enter 6-Digit Pincode
            </label>
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleLookup(inputPincode);
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <input
                  id="pincode-modal-input"
                  type="text"
                  maxLength={6}
                  placeholder="e.g. 110001, 400001"
                  value={inputPincode}
                  onChange={(e) => setInputPincode(e.target.value.replace(/\[#B76E79\]/g, '').slice(0, 6))}
                  className="w-full pl-3.5 pr-8 py-2.5 bg-[#2A0710] border border-[#D7B77A]/15 rounded text-sm font-semibold tracking-wider text-[#F7F0E5] focus:bg-\[#FAF7F2\] focus:border-[#D7B77A]/40 focus:ring-1 focus:ring-[#D7B77A]/40 outline-none transition"
                />
                {inputPincode.length === 6 && (
                  <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                )}
              </div>
              <button
                type="submit"
                id="pincode-modal-apply-btn"
                disabled={loading || inputPincode.length !== 6}
                className="px-4 py-2.5 bg-[#5C0B1B] hover:bg-[#5C0B1B] text-[#F7F0E5] rounded text-xs font-bold tracking-wide transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
              </button>
            </form>

            {errorMsg && (
              <p className="text-[11px] font-semibold text-\[#800020\] flex items-center gap-1 mt-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{errorMsg}</span>
              </p>
            )}
          </div>

          {/* Quick Select Popular Indian Cities */}
          <div className="space-y-2.5">
            <span className="text-[11px] font-bold text-[#F7F0E5]/55 uppercase tracking-wider block flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[#F7F0E5]" />
              Quick Select Popular Cities
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {POPULAR_METROS.map((metro) => {
                const isSelected = userDeliveryLocation.pincode === metro.pincode;
                return (
                  <button
                    key={metro.pincode}
                    type="button"
                    id={`pincode-metro-${metro.pincode}`}
                    onClick={() => handleSelectMetro(metro)}
                    className={`px-2.5 py-2 rounded text-left border transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? 'bg-[#5C0B1B] text-[#F7F0E5] border-[#D7B77A]/40 shadow-xs'
                        : 'bg-\[#FAF7F2\] hover:bg-[#2A0710]/50 text-[#F7F0E5] border-[#D7B77A]/15 hover:border-rose-300'
                    }`}
                  >
                    <p className={`text-xs font-bold truncate ${isSelected ? 'text-[#F7F0E5]' : 'text-[#F7F0E5]'}`}>
                      {metro.city}
                    </p>
                    <p className={`text-[10px] font-mono ${isSelected ? 'text-rose-200' : 'text-[#F7F0E5]/55'}`}>
                      {metro.pincode}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Guarantee / Shipping Perk Banner */}
          <div className="bg-[#2A0710]/60 border border-amber-200/80 rounded p-3 flex items-center gap-3">
            <Truck className="w-5 h-5 text-[#F7F0E5] shrink-0" />
            <div className="text-[11px] text-[#F7F0E5]">
              <span className="font-bold">Free Shipping & Express Prepaid Dispatch!</span> Dispatch within 24-48 hours across 27,000+ Indian pincodes.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
