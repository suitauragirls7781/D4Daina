import React, { useState, useEffect } from 'react';
import { useShop } from '../context/ShopContext';
import { 
  Search, 
  Package, 
  Truck, 
  CheckCircle2, 
  Clock, 
  MapPin, 
  ChevronRight, 
  AlertCircle,
  Copy,
  Check,
  Phone,
  Sparkles,
  ShoppingBag,
  ShieldCheck,
  RefreshCw,
  Crown
} from 'lucide-react';
import { getDocById } from '../lib/dataStore';
import { mapOrderFromDb } from '../context/AdminContext';

export const TrackOrderPage: React.FC = () => {
  const { confirmedOrder, recentOrders = [], setActivePage, showToast } = useShop();
  
  const [orderQuery, setOrderQuery] = useState(confirmedOrder?.orderNumber || '');
  const [phoneQuery, setPhoneQuery] = useState(confirmedOrder?.customerMobile || '');
  const [trackedResult, setTrackedResult] = useState<any | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [copiedAwb, setCopiedAwb] = useState(false);

  // Auto load order from URL params or confirmedOrder on page load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlOrderId = urlParams.get('order_id') || urlParams.get('orderNumber');
      const urlMobile = urlParams.get('mobile') || urlParams.get('phone');
      if (urlOrderId || urlMobile) {
        if (urlOrderId) setOrderQuery(urlOrderId);
        if (urlMobile) setPhoneQuery(urlMobile);
        executeSearch(urlOrderId || '', urlMobile || '');
        return;
      }
    }

    if (confirmedOrder) {
      setOrderQuery(confirmedOrder.orderNumber);
      if (confirmedOrder.customerMobile) setPhoneQuery(confirmedOrder.customerMobile);
      executeSearch(confirmedOrder.orderNumber, confirmedOrder.customerMobile);
    }
  }, [confirmedOrder]);

  const mapStatusToSteps = (status: string = 'Shipped', dateStr?: string) => {
    const normStatus = status.toLowerCase();
    
    let currentIndex = 2; // Default to Shipped
    if (normStatus.includes('paid') || normStatus.includes('pending') || normStatus.includes('order')) currentIndex = 0;
    if (normStatus.includes('process') || normStatus.includes('pack')) currentIndex = 1;
    if (normStatus.includes('ship') || normStatus.includes('transit')) currentIndex = 2;
    if (normStatus.includes('out') || normStatus.includes('delivery')) currentIndex = 3;
    if (normStatus.includes('deliver') && !normStatus.includes('out')) currentIndex = 4;

    const today = dateStr || new Date().toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });

    return [
      { label: 'Order Verified', desc: 'Order confirmed & VIP tailoring queued', date: today, done: currentIndex >= 0, current: currentIndex === 0 },
      { label: 'Artisanal Tailoring & QC', desc: 'Handcrafted garments inspected and packaged in Artisan', date: currentIndex >= 1 ? today : 'Pending', done: currentIndex >= 1, current: currentIndex === 1 },
      { label: 'Dispatched via Express Air', desc: 'Handed over to priority courier partner', date: currentIndex >= 2 ? today : 'Pending', done: currentIndex >= 2, current: currentIndex === 2 },
      { label: 'Out for Delivery', desc: 'Courier agent assigned for doorstep delivery', date: currentIndex >= 3 ? 'Today' : 'Pending', done: currentIndex >= 3, current: currentIndex === 3 },
      { label: 'Delivered', desc: 'Package successfully handed over to customer', date: currentIndex >= 4 ? 'Today' : 'Pending', done: currentIndex >= 4, current: currentIndex === 4 },
    ];
  };

  const executeSearch = async (orderIdStr: string, phoneStr: string) => {
    const cleanOrderId = orderIdStr.trim().toUpperCase();
    const cleanPhone = phoneStr.trim().replace(/\D/g, '');
    if (!cleanOrderId || !cleanPhone) {
      setError('Enter both the exact Order ID and registered mobile number to view tracking details.');
      setTrackedResult(null);
      setHasSearched(true);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setError('');
    setHasSearched(true);

    try {
      // 1. Check local recentOrders from ShopContext
      let foundOrder: any = null;
      if (recentOrders && recentOrders.length > 0) {
        foundOrder = recentOrders.find((o) => {
          const matchId = cleanOrderId && o.orderNumber?.toUpperCase() === cleanOrderId;
          const matchPhone = cleanPhone && o.customerMobile?.replace(/\D/g, '') === cleanPhone;
          return matchId && matchPhone;
        });
      }

      // 2. Check confirmedOrder if not found in recentOrders
      if (!foundOrder && confirmedOrder) {
        const matchId = cleanOrderId && confirmedOrder.orderNumber?.toUpperCase() === cleanOrderId;
        const matchPhone = cleanPhone && confirmedOrder.customerMobile?.replace(/\D/g, '') === cleanPhone;
        if (matchId && matchPhone) {
          foundOrder = confirmedOrder;
        }
      }

      // 3. Look up the order document in Firestore (document id = order number)
      if (!foundOrder) {
        try {
          const orderDoc = await getDocById('orders', cleanOrderId);
          if (orderDoc) {
            const mapped = mapOrderFromDb(orderDoc);
            const mobileMatches = mapped.customerMobile?.replace(/\D/g, '') === cleanPhone;
            if (mobileMatches) foundOrder = mapped;
          }
        } catch (lookupErr) {
          console.warn('Order lookup notice:', lookupErr);
        }
      }

      // Format result
      if (foundOrder) {
        const formatted = {
          orderNumber: foundOrder.orderNumber || cleanOrderId,
          customerName: foundOrder.customerName || foundOrder.deliveryAddress?.fullName || 'Valued Customer',
          customerMobile: foundOrder.customerMobile || foundOrder.deliveryAddress?.mobile || cleanPhone,
          status: foundOrder.status || 'Processing',
          carrier: foundOrder.courierPartner || '',
          awb: foundOrder.trackingNumber || '',
          estimatedDelivery: foundOrder.estimatedDeliveryDate || '',
          date: foundOrder.date || new Date().toLocaleDateString('en-IN'),
          finalTotal: foundOrder.finalTotal || foundOrder.subtotal || 0,
          items: foundOrder.items || [],
          deliveryAddress: foundOrder.deliveryAddress || null,
          steps: mapStatusToSteps(foundOrder.status || 'Processing', foundOrder.date),
        };
        setTrackedResult(formatted);
      } else {
        setError('No order found matching the provided Order ID or Mobile Number. Please verify your input and try again.');
        setTrackedResult(null);
      }
    } catch (e) {
      console.error('Track Order Search Error:', e);
      setError('Could not retrieve tracking details right now. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderQuery.trim() || !phoneQuery.trim()) {
      setError('Please enter both your Order ID and registered 10-digit Mobile Number.');
      return;
    }
    executeSearch(orderQuery, phoneQuery);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAwb(true);
    if (showToast) showToast('AWB Tracking Number copied!', 'success');
    setTimeout(() => setCopiedAwb(false), 2500);
  };

  return (
    <div id="track-order-page" className="py-8 sm:py-12 bg-[#FDFBF7] min-h-screen font-sans">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-2 text-xs text-[#3D0F1F]/55">
          <button onClick={() => setActivePage('home')} className="hover:text-[#3D0F1F] transition font-medium cursor-pointer">
            Home
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-[#3D0F1F] font-semibold">Track Order Shipment</span>
        </nav>

        {/* Page Title & Header */}
        <div className="text-center max-w-xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-1.5 text-[#B8935A] text-[10px] font-semibold uppercase tracking-widest">
            <Crown className="w-3.5 h-3.5" />
            <span>Priority Order Tracker</span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-[#3D0F1F]">
            Track Your Shipment
          </h1>
          <p className="text-xs sm:text-sm text-gray-700 leading-relaxed font-medium">
            Enter your Order ID (e.g. <span className="font-mono text-[#211C1A] font-bold">SAG-2026-XXXXXX</span>) or 10-digit mobile number to view live parcel updates.
          </p>
        </div>

        {/* Quick Recent Order Chip */}
        {recentOrders && recentOrders.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-gray-600 font-medium">Recent Orders:</span>
            {recentOrders.slice(0, 3).map((ro) => (
              <button
                key={ro.orderNumber}
                onClick={() => {
                  setOrderQuery(ro.orderNumber);
                  executeSearch(ro.orderNumber, ro.customerMobile || '');
                }}
                className="px-3.5 py-1.5 bg-[#FAF5EB] hover:bg-[#3D0F1F] hover:text-[#FAF5EB] text-[#3D0F1F] border border-[#B8935A]/35 text-xs font-mono font-medium transition flex items-center gap-1.5 cursor-pointer"
              >
                <Package className="w-3.5 h-3.5 text-black" />
                {ro.orderNumber}
              </button>
            ))}
          </div>
        )}

        {/* Search Form Card */}
        <div className="bg-[#FAF5EB] border border-[#B8935A]/35 p-6 sm:p-8 max-w-2xl mx-auto text-left space-y-5">
          
          <form onSubmit={handleTrackSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#211C1A] mb-1.5">
                  Order ID / AWB Number
                </label>
                <input
                  id="track-order-id-input"
                  type="text"
                  value={orderQuery}
                  onChange={(e) => setOrderQuery(e.target.value)}
                  placeholder="e.g. SAG-2026-891023"
                  className="w-full px-4 py-3 bg-[#FDFBF7] border border-[#B8935A]/35 text-xs sm:text-sm font-medium focus:outline-none focus:border-[#3D0F1F] focus:ring-1 focus:ring-[#3D0F1F] transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#211C1A] mb-1.5">
                  Mobile Number
                </label>
                <input
                  id="track-phone-input"
                  type="tel"
                  maxLength={10}
                  value={phoneQuery}
                  onChange={(e) => setPhoneQuery(e.target.value.replace(/\D/g, ''))}
                  placeholder="10-digit registered mobile"
                  className="w-full px-4 py-3 bg-[#FDFBF7] border border-[#B8935A]/35 text-xs sm:text-sm font-medium focus:outline-none focus:border-[#3D0F1F] focus:ring-1 focus:ring-[#3D0F1F] transition"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-800 font-medium">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              id="track-order-submit-btn"
              type="submit"
              disabled={isSearching}
              className="w-full py-4 bg-[#3D0F1F] hover:bg-[#3D0F1F]/90 text-[#FAF5EB] text-xs sm:text-sm font-semibold tracking-widest uppercase transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75"
            >
              {isSearching ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-black" />
                  <span>Fetching Order Status...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 text-black" />
                  <span>Track Live Package</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Output Results Card */}
        {hasSearched && trackedResult && (
          <div className="bg-[#FDFBF7] border-2 border-[#9A6A3A]/35 rounded-2xl p-6 sm:p-8 shadow-xl space-y-7 text-left">
            
            {/* Status Header Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-[#9A6A3A]/30 gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-black block">
                  Suit Aura Girls Package:
                </span>
                <h3 className="font-serif text-xl sm:text-2xl font-bold text-[#211C1A]">
                  {trackedResult.orderNumber}
                </h3>
                <p className="text-xs text-gray-600 mt-0.5">
                  Ordered for: <strong className="text-gray-900">{trackedResult.customerName}</strong> ({trackedResult.customerMobile})
                </p>
              </div>

              <div className="flex flex-col sm:items-end gap-1.5">
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-bold uppercase tracking-wider shadow-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Status: {trackedResult.status}
                </span>
                <span className="text-[11px] text-gray-500 font-mono">
                  Order Date: {trackedResult.date}
                </span>
              </div>
            </div>

            {/* Courier Partner & Estimated Delivery */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              <div className="p-4 bg-[#F1E8DF] rounded-xl border border-[#9A6A3A]/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Truck className="w-5 h-5 text-[#211C1A]" />
                    <span className="text-xs font-bold uppercase tracking-wider text-[#211C1A]">
                      Courier Express Partner
                    </span>
                  </div>
                  <span className="text-[10px] bg-[#FAF5EB] text-[#3D0F1F] px-2 py-0.5 border border-[#B8935A]/35 font-semibold uppercase">
                    {trackedResult.awb ? 'In Transit' : 'Dispatch Pending'}
                  </span>
                </div>

                <div>
                  <p className="text-sm font-bold text-gray-900">{trackedResult.carrier || 'Carrier not assigned yet'}</p>
                  {trackedResult.awb ? (
                    <div className="mt-2 flex items-center justify-between bg-white px-3 py-2 border border-gray-300">
                      <span className="text-xs font-mono font-bold text-gray-800">AWB: {trackedResult.awb}</span>
                      <button
                        onClick={() => copyToClipboard(trackedResult.awb)}
                        className="text-[11px] font-bold text-[#211C1A] hover:text-black flex items-center gap-1 transition cursor-pointer"
                      >
                        {copiedAwb ? <><Check className="w-3.5 h-3.5 text-emerald-600" /><span className="text-emerald-600">Copied</span></> : <><Copy className="w-3.5 h-3.5" /><span>Copy AWB</span></>}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-gray-600">Tracking number will appear after dispatch.</p>
                  )}
                </div>
              </div>

              <div className="p-4 bg-[#F1E8DF] rounded-xl border border-[#9A6A3A]/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-black" />
                    <span className="text-xs font-bold uppercase tracking-wider text-[#211C1A]">
                      Expected Delivery Window
                    </span>
                  </div>
                  <span className="text-[10px] bg-[#FAF5EB] text-[#3D0F1F] px-2 py-0.5 border border-[#B8935A]/30 font-semibold uppercase">
                    {trackedResult.estimatedDelivery ? 'Estimated' : 'Pending'}
                  </span>
                </div>

                <div>
                  <p className="text-base font-bold text-[#211C1A]">
                    {trackedResult.estimatedDelivery || 'Estimated delivery date is not available yet.'}
                  </p>
                  <p className="text-[11px] text-gray-600 mt-1">
                    Tracking updates appear once the parcel is handed to the carrier.
                  </p>
                </div>
              </div>

            </div>

            {/* Stepper Timeline */}
            <div className="space-y-4 pt-4 border-t border-[#9A6A3A]/30">
              <h4 className="text-xs font-bold uppercase tracking-widest text-[#211C1A] flex items-center gap-2">
                <MapPin className="w-4 h-4 text-black" />
                Live Shipment Milestones
              </h4>

              <div className="relative pl-7 space-y-5 before:absolute before:left-3 before:top-3 before:bottom-3 before:w-[2px] before:bg-[#9A6A3A]/30">
                {trackedResult.steps.map((step: any, idx: number) => (
                  <div 
                    key={idx} 
                    className={`relative flex items-start justify-between gap-4 p-3 rounded-xl transition-all border ${
                      step.current 
                        ? 'bg-[#F1E8DF] border-[#9A6A3A] shadow-xs' 
                        : 'border-transparent hover:bg-gray-50'
                    }`}
                  >
                    <div className={`absolute -left-7 w-6 h-6 rounded-full flex items-center justify-center z-10 ${
                      step.current
                        ? 'bg-[#241D1B] text-[#211C1A]'
                        : step.done 
                        ? 'bg-[#241D1B] text-[#211C1A]' 
                        : 'bg-gray-200 text-gray-400'
                    }`}>
                      {step.done ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-3.5 h-3.5" />}
                    </div>

                    <div className="space-y-0.5 flex-1">
                      <p className={`text-sm font-bold ${
                        step.current ? 'text-[#211C1A]' : step.done ? 'text-gray-900' : 'text-gray-400'
                      }`}>
                        {step.label}
                      </p>
                      <p className={`text-xs font-medium leading-relaxed ${
                        step.current ? 'text-gray-800' : step.done ? 'text-gray-600' : 'text-gray-400'
                      }`}>
                        {step.desc}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                        step.current 
                          ? 'bg-[#241D1B] text-[#211C1A] border-[#241D1B]'
                          : step.done 
                          ? 'bg-[#F1E8DF] text-[#211C1A] border-[#9A6A3A]/30' 
                          : 'text-gray-400 bg-gray-50 border-gray-200'
                      }`}>
                        {step.date}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Order Items List */}
            {trackedResult.items && trackedResult.items.length > 0 && (
              <div className="pt-5 border-t border-[#9A6A3A]/30 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-[#211C1A] flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-black" />
                  Items in Package ({trackedResult.items.length})
                </h4>
                <div className="divide-y divide-gray-200 border border-gray-200 rounded-xl bg-white overflow-hidden">
                  {trackedResult.items.map((item: any, idx: number) => (
                    <div key={idx} className="p-3 flex items-center gap-3">
                      <img
                        src={item.product?.images?.[0] || 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=200&q=80'}
                        alt={item.product?.name || 'Garment'}
                        className="w-12 h-14 object-cover rounded-md border border-gray-200"
                      />
                      <div className="flex-1 min-w-0">
                        <h5 className="text-xs font-bold text-gray-900 truncate">
                          {item.product?.name || 'Ethnic Suit Set'}
                        </h5>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          Size: <span className="font-semibold text-gray-800">{item.selectedSize}</span> | Qty: <span className="font-semibold text-gray-800">{item.quantity}</span>
                        </p>
                      </div>
                      <span className="text-xs font-mono font-bold text-[#211C1A]">
                        ₹{(item.product?.price || 0) * item.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Support Footer Box */}
            <div className="pt-4 border-t border-[#9A6A3A]/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs bg-[#F1E8DF] p-4 rounded-xl border border-[#9A6A3A]/30">
              <div className="flex items-center gap-2 text-gray-800">
                <ShieldCheck className="w-5 h-5 text-[#211C1A] shrink-0" />
                <span>Need help with delivery timing or address change?</span>
              </div>
              <button
                onClick={() => setActivePage('contact')}
                className="px-4 py-2 bg-[#241D1B] hover:bg-[#20050E] text-[#211C1A] rounded-lg text-xs font-bold uppercase tracking-wider transition shrink-0 flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Phone className="w-3.5 h-3.5 text-black" />
                <span>Contact VIP Support</span>
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};
