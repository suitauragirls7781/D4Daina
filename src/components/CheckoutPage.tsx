import React, { useState, useEffect, useRef } from 'react';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import { DeliveryAddress, PaymentMethodType, Order } from '../types';
import { COLLECTIONS, emailKey, saveDoc } from '../lib/dataStore';
import { getStoredUtmParams } from '../utils/utmTracker';
import { ordersApi } from '../lib/api';
import confetti from 'canvas-confetti';
import { OrderPlacedOverlay } from './OrderPlacedOverlay';
import { estimateDelivery, formatDeliveryDate } from '../utils/delivery';
import { WhatsAppIcon } from './BrandIcons';
import { AddressBook } from './AddressBook';
import { listAddresses, SavedAddress } from '../lib/addressBook';
import { Gateway, loadRazorpaySDK, razorpayDisplayConfig, submitToPayu } from '../lib/payments';

type PaymentReturn = { state: 'checking' | 'failed' | 'pending'; orderNumber: string; token: string; message: string };

// One key per bag + coupon: trying the same checkout again reuses its order instead of creating another
const checkoutAttemptKey = (signature: string) => {
  try {
    const saved = JSON.parse(sessionStorage.getItem('sag_checkout_attempt') || 'null');
    if (saved?.signature === signature && typeof saved.key === 'string') return saved.key as string;
    const key = (globalThis.crypto?.randomUUID?.() || `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
    sessionStorage.setItem('sag_checkout_attempt', JSON.stringify({ signature, key }));
    return key;
  } catch {
    return '';
  }
};

import { 
  Lock, 
  CreditCard, 
  CheckCircle2, 
  ArrowLeft, 
  Truck, 
  AlertCircle,
  ChevronRight,
  Info,
  Loader2,
  MapPin,
  Sparkles,
  Percent,
  ShoppingBag,
  Trash2,
  Plus,
  Minus,
  Check,
  ShieldCheck,
  ShieldAlert,
  Gift,
  X,
  Zap,
  Tag,
  ArrowRight,
  HelpCircle,
  Award,
  Scissors,
  RotateCcw
} from 'lucide-react';
import { getCleanImageUrl } from '../utils/imageHelper';
import { createSupportWhatsAppUrl } from '../utils/storeContact';
import { BagIcon } from './BrandIcons';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 
  'Delhi NCR', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 
  'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 
  'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
];

export const CheckoutPage: React.FC = () => {
  const {
    cart,
    cartSubtotal,
    shippingFee,
    cartTotal,
    prepaidDiscount,
    comboDiscount,
    comboOffer,
    freeShippingThreshold,
    discountAmount,
    appliedCoupon,
    applyCoupon,
    removeCoupon,
    coupons,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    setConfirmedOrder,
    addRecentOrder,
    syncCustomerOrders,
    setActivePage,
    showToast
  } = useShop();

  const { user } = useAuth();
  const { storeSettings, paymentSettings } = useAdmin();

  // 3-step flow: Address → Order summary → Payment (going back never loses the bag or the form)
  const [checkoutStep, setCheckoutStepState] = useState<'details' | 'summary' | 'payment'>('details');
  const setCheckoutStep = (step: 'details' | 'summary' | 'payment') => {
    setCheckoutStepState(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  // 'creating' while the server prices the bag and creates the order, 'paying' once the payment window is open
  const [payStage, setPayStage] = useState<'creating' | 'paying'>('creating');

  // Form State
  const [address, setAddress] = useState<DeliveryAddress>({
    fullName: '',
    mobile: '',
    email: '',
    houseFlat: '',
    street: '',
    area: '',
    city: '',
    state: '',
    pincode: '',
  });

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [saveAddressOption, setSaveAddressOption] = useState(true);


  // Gift Note State
  const [addGiftNote, setAddGiftNote] = useState(false);
  const [giftNoteText, setGiftNoteText] = useState('');

  // Location Auto-Detect State
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);

  // Pincode Lookup State
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const [availablePostOffices, setAvailablePostOffices] = useState<any[]>([]);
  const [pincodeError, setPincodeError] = useState('');
  // Shown when the PIN lookup service could not be reached (not an error: the shopper types city and state)
  const [pincodeHint, setPincodeHint] = useState('');

  // Coupon Input State inside checkout
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [showCouponsModal, setShowCouponsModal] = useState(false);

  // Processing state & error
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Prepaid gateways the admin has switched on (checked on the server each time the payment step opens)
  const [gateways, setGateways] = useState<{ razorpay: boolean; payu: boolean } | null>(null);
  const [gateway, setGateway] = useState<Gateway>('razorpay');
  const [paymentReturn, setPaymentReturn] = useState<PaymentReturn | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  // Saved addresses (Account → Addresses): one tap fills the delivery form
  const [hasSavedAddresses] = useState(() => { try { return listAddresses().length > 0; } catch { return false; } });
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const applySavedAddress = (saved: SavedAddress) => {
    setSelectedAddressId(saved.id);
    const parts = String(saved.fullName || '').trim().split(/\s+/);
    setFirstName(parts[0] || '');
    setLastName(parts.slice(1).join(' '));
    setAddress((current) => ({
      ...current,
      fullName: saved.fullName,
      mobile: saved.mobile,
      houseFlat: saved.houseFlat,
      street: saved.street,
      area: saved.area,
      city: saved.city,
      state: saved.state,
      pincode: saved.pincode,
      landmark: saved.landmark || '',
      tehsil: saved.tehsil || '',
      district: saved.district || '',
      altMobile: saved.altMobile || '',
      type: saved.type,
    }));
    showToast('Delivery address filled in. Check it below.', 'success');
  };

  // Estimated delivery from the owner's delivery settings (not shown when the owner has not set delivery days)
  const deliveryEstimate = estimateDelivery(storeSettings);
  const deliveryEstimateText = deliveryEstimate ? formatDeliveryDate(deliveryEstimate.max) : '';

  // Preview totals. The server recalculates everything from Firestore before payment.
  const finalCartTotal = Math.max(0, cartTotal - prepaidDiscount);

  const totalMRP = cart.reduce((acc, item) => {
    const itemPrice = Number(item.product?.price) || 0;
    const origPrice = Math.max(itemPrice, Number(item.product?.originalPrice) || itemPrice);
    return acc + (origPrice * item.quantity);
  }, 0);

  const catalogDiscount = Math.max(0, totalMRP - cartSubtotal);
  const totalSavings = catalogDiscount + comboDiscount + discountAmount + prepaidDiscount;

  // Session ID & debounce timer ref for abandoned checkout tracking
  const getCheckoutSessionId = () => {
    let sid = sessionStorage.getItem('sag_checkout_session_id');
    if (!sid) {
      sid = 'chk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      sessionStorage.setItem('sag_checkout_session_id', sid);
    }
    return sid;
  };

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const savePartialToDb = async (
    customFirstName?: string,
    customLastName?: string,
    customPhone?: string,
    customEmail?: string
  ) => {
    try {
      const fName = customFirstName !== undefined ? customFirstName : firstName;
      const lName = customLastName !== undefined ? customLastName : lastName;
      const mob = customPhone !== undefined ? customPhone : address.mobile;
      const eml = customEmail !== undefined ? customEmail : address.email;
      const fullNameCombined = `${fName} ${lName}`.trim() || address.fullName;

      if (!mob && !fullNameCombined && !fName && !eml) return;

      const sid = getCheckoutSessionId();
      const utmParams = getStoredUtmParams();
      const payload = {
        sessionId: sid,
        firstName: fName,
        lastName: lName,
        fullName: fullNameCombined,
        phone: mob,
        mobile: mob,
        email: eml,
        utmSource: utmParams.utm_source || (utmParams.fbclid ? 'meta_ads' : 'direct'),
        utmMedium: utmParams.utm_medium || '',
        utmCampaign: utmParams.utm_campaign || '',
        fbclid: utmParams.fbclid || '',
        cartItems: cart,
        totalAmount: cartTotal,
        address: {
          ...address,
          fullName: fullNameCombined,
          mobile: mob,
          email: eml,
        },
        status: 'abandoned',
      };

      await saveDoc(COLLECTIONS.abandonedCheckouts, sid, payload);
    } catch (err) {
      console.warn('Abandoned checkouts push notice:', err);
    }
  };

  const handleFieldChangeDebounced = (field: string, val: string) => {
    if (field === 'firstName') {
      setFirstName(val);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        savePartialToDb(val, lastName, address.mobile, address.email);
      }, 1000);
    } else if (field === 'lastName') {
      setLastName(val);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        savePartialToDb(firstName, val, address.mobile, address.email);
      }, 1000);
    } else if (field === 'mobile') {
      const cleanMob = val.replace(/\D/g, '').slice(0, 10);
      setAddress(prev => ({ ...prev, mobile: cleanMob }));
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        savePartialToDb(firstName, lastName, cleanMob, address.email);
      }, 1000);
    } else if (field === 'email') {
      setAddress(prev => ({ ...prev, email: val }));
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        savePartialToDb(firstName, lastName, address.mobile, val);
      }, 1000);
    }
  };

  const handleFieldBlur = () => {
    savePartialToDb();
  };

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Auto load saved user profile/address on mount
  useEffect(() => {
    const loadSavedAddress = async () => {
      try {
        const normEmail = user?.email ? user.email.toLowerCase().trim() : '';
        let saved = null;
        if (normEmail) {
          saved = localStorage.getItem(`sag_user_profile_${normEmail}`);
        }

        let loadedName = user?.displayName || user?.name || '';
        let loadedPhone = '';
        let loadedEmail = normEmail || '';
        let loadedHouse = '';
        let loadedCity = '';
        let loadedState = '';
        let loadedPincode = '';

        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed.fullName) loadedName = parsed.fullName;
            if (parsed.phone || parsed.mobile) loadedPhone = parsed.phone || parsed.mobile;
            if (parsed.email && !loadedEmail) loadedEmail = parsed.email;
            if (parsed.streetAddress || parsed.houseFlat) loadedHouse = parsed.streetAddress || parsed.houseFlat;
            if (parsed.city) loadedCity = parsed.city;
            if (parsed.state) loadedState = parsed.state;
            if (parsed.pincode) loadedPincode = parsed.pincode;
          } catch {}
        }

        if (loadedName) {
          const parts = loadedName.split(' ');
          setFirstName(parts[0] || '');
          setLastName(parts.slice(1).join(' ') || '');
        }

        setAddress(prev => ({
          ...prev,
          fullName: loadedName || prev.fullName,
          mobile: loadedPhone || prev.mobile,
          email: loadedEmail || prev.email,
          houseFlat: loadedHouse || prev.houseFlat,
          city: loadedCity || prev.city,
          state: loadedState || prev.state,
          pincode: loadedPincode || prev.pincode,
        }));
      } catch (e) {
        console.error('Error loading saved profile:', e);
      }
    };

    loadSavedAddress();
  }, [user]);

  // Sync Pincode manually or through autofill
  useEffect(() => {
    if (address.pincode.length === 6) {
      const fetchPincodeDetails = async () => {
        setPincodeLoading(true);
        setPincodeError('');
        setPincodeHint('');
        try {
          // The lookup service being slow or down is not an invalid PIN: keep what the shopper typed,
          // show no error, and let them fill in city and state by hand.
          let data: any;
          try {
            const controller = new AbortController();
            const timer = window.setTimeout(() => controller.abort(), 4000);
            try {
              const res = await fetch(`https://api.postalpincode.in/pincode/${address.pincode}`, { signal: controller.signal });
              if (!res.ok) throw new Error('PIN lookup unavailable');
              data = await res.json();
            } finally {
              window.clearTimeout(timer);
            }
          } catch {
            setAvailablePostOffices([]);
            // An earlier PIN the service called invalid emptied "area"; the street field fills both, so
            // put it back or the shopper is asked for a street they have already typed.
            setAddress(prev => (prev.area.trim() || !prev.street.trim() ? prev : { ...prev, area: prev.street }));
            setPincodeHint('Could not look up this PIN. Please enter your city and state.');
            return;
          }
          if (data && data[0] && data[0].Status === 'Success') {
            const postOffices = data[0].PostOffice;
            if (postOffices && postOffices.length > 0) {
              setAvailablePostOffices(postOffices);
              const firstPO = postOffices[0];
              setAddress(prev => ({
                ...prev,
                city: firstPO.District || firstPO.Taluk || prev.city,
                state: firstPO.State || prev.state,
                area: firstPO.Name || prev.area,
              }));
              showToast(`Pincode verified: Delivering to ${firstPO.District}, ${firstPO.State}`, 'success');
            } else {
              throw new Error('No delivery branches found for this PIN code.');
            }
          } else {
            throw new Error('Invalid or non-Indian Pincode! Please check.');
          }
        } catch (err: any) {
          const errMsg = err.message || 'Verification failed. Please check your 6-digit PIN code.';
          setPincodeError(errMsg);
          setAvailablePostOffices([]);
          setAddress(prev => ({ ...prev, city: '', state: '', area: '' }));
          showToast('Invalid PIN Code!', 'error');
        } finally {
          setPincodeLoading(false);
        }
      };
      fetchPincodeDetails();
    } else {
      setAvailablePostOffices([]);
      setPincodeError('');
      setPincodeHint('');
    }
  }, [address.pincode]);

  // SMART GPS Location Auto-Detection
  const handleAutoDetectLocation = () => {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser.', 'error');
      return;
    }

    setIsDetectingLocation(true);
    showToast('Fetching GPS location coordinates...', 'info');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`
          );
          const data = await response.json();

          if (data && data.address) {
            const addr = data.address;
            const pincode = addr.postcode || '';
            const city = addr.city || addr.town || addr.village || addr.city_district || addr.county || '';
            const state = addr.state || '';
            const road = addr.road || addr.suburb || addr.subdivision || '';
            const neighbourhood = addr.neighbourhood || addr.suburb || addr.village || '';

            const matchedState = INDIAN_STATES.find(
              s => s.toLowerCase() === state.toLowerCase()
            ) || 'Delhi NCR';

            setAddress(prev => ({
              ...prev,
              pincode: pincode ? pincode.replace(/\D/g, '').slice(0, 6) : prev.pincode,
              city: city || prev.city,
              state: matchedState,
              street: road || prev.street,
              area: neighbourhood || prev.area || addr.suburb || '',
            }));

            showToast('GPS Location auto-detected successfully!', 'success');
          } else {
            showToast('Could not resolve physical address. Please type details.', 'error');
          }
        } catch (err) {
          console.error('Reverse Geocoding Error:', err);
          showToast('Geocoding service unavailable. Please enter manually.', 'error');
        } finally {
          setIsDetectingLocation(false);
        }
      },
      (error) => {
        console.error('GPS Geolocation Error:', error);
        let errMsg = 'Could not access location services.';
        if (error.code === error.PERMISSION_DENIED) {
          errMsg = 'Location permission denied. Please allow GPS access in your browser.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          errMsg = 'Location coordinates are currently unavailable.';
        } else if (error.code === error.TIMEOUT) {
          errMsg = 'GPS request timed out.';
        }
        showToast(errMsg, 'error');
        setIsDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSaveAddressToDb = async (currentAddr: DeliveryAddress) => {
    try {
      const combinedFullName = `${firstName.trim()} ${lastName.trim()}`;

      if (user?.email) {
        saveDoc(COLLECTIONS.profiles, emailKey(user.email), {
          email: emailKey(user.email),
          fullName: combinedFullName,
          phone: currentAddr.mobile,
          houseFlat: currentAddr.houseFlat,
          streetAddress: currentAddr.street,
          area: currentAddr.area,
          city: currentAddr.city,
          state: currentAddr.state,
          pincode: currentAddr.pincode,
        }).catch((err) => console.warn('Could not save address to profile:', err));
      }

      const userProfileKey = user ? `sag_user_profile_${user.email}` : 'sag_user_profile_current';
      localStorage.setItem(userProfileKey, JSON.stringify({
        fullName: combinedFullName,
        phone: currentAddr.mobile,
        email: currentAddr.email,
        houseFlat: currentAddr.houseFlat,
        street: currentAddr.street,
        city: currentAddr.city,
        state: currentAddr.state,
        pincode: currentAddr.pincode
      }));
    } catch (e) {
      console.error('Error saving address details:', e);
    }
  };

  const validateForm = (): boolean => {
    if (!firstName.trim() || !lastName.trim()) {
      setErrorMessage('Please provide both your First and Last Name.');
      return false;
    }
    const mobilePattern = /^[6-9]\d{9}$/;
    if (!address.mobile.trim() || !mobilePattern.test(address.mobile)) {
      setErrorMessage('Please provide a valid 10-digit Indian mobile number.');
      return false;
    }
    if (!address.email.trim() || !address.email.includes('@')) {
      setErrorMessage('Please provide a valid email address.');
      return false;
    }
    if (!address.houseFlat.trim()) {
      setErrorMessage('Please enter your House/Flat/Apartment number.');
      return false;
    }
    if (!address.street.trim() || !address.area.trim()) {
      setErrorMessage('Please enter your Street and Area details.');
      return false;
    }
    if (!address.city.trim()) {
      setErrorMessage('Please enter your City.');
      return false;
    }
    if (!address.state.trim()) {
      setErrorMessage('Please choose your state.');
      return false;
    }
    if (!address.pincode.trim() || address.pincode.length !== 6) {
      setErrorMessage('Please enter a valid 6-digit Indian PIN code.');
      return false;
    }
    if (pincodeError) {
      setErrorMessage(pincodeError);
      return false;
    }

    setErrorMessage('');
    return true;
  };

  const handleProceedToPaymentStep = () => {
    if (validateForm()) {
      if (saveAddressOption) handleSaveAddressToDb(address);
      setCheckoutStep('summary');
    } else {
      window.scrollTo({ top: 100, behavior: 'smooth' });
    }
  };

  const goToStep = (step: 'details' | 'summary' | 'payment') => {
    if (step === 'details' || validateForm()) setCheckoutStep(step);
    else setCheckoutStep('details');
  };

  const handleCouponApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCodeInput.trim()) return;
    const success = await applyCoupon(couponCodeInput);
    if (success) {
      setCouponCodeInput('');
    }
  };

  const completeOrder = (order: Order) => {
    addRecentOrder(order);
    setConfirmedOrder(order);
    try {
      sessionStorage.setItem('sag_last_order', JSON.stringify({ orderNumber: order.orderNumber, contact: order.customerEmail }));
      if (!user) {
        const guestOrders = JSON.parse(localStorage.getItem('sag_guest_orders') || '[]');
        localStorage.setItem('sag_guest_orders', JSON.stringify([order, ...guestOrders.filter((o: Order) => o.orderNumber !== order.orderNumber)].slice(0, 20)));
      }
    } catch {}
    if (user?.email) syncCustomerOrders(user.email);
    try { sessionStorage.removeItem('sag_checkout_attempt'); sessionStorage.removeItem('sag_payu_pending'); } catch {}
    clearCart();
    setIsProcessing(false);
    setPaymentReturn(null);
    // Short "Order placed" moment, then the full confirmation page
    setCelebrating(true);
    confetti({ particleCount: 120, spread: 70, origin: { y: 0.55 }, colors: ['#4B1D3F', '#C5A46D', '#F7E4EA', '#10B981'], zIndex: 10001 });
    window.setTimeout(() => {
      setActivePage('order-confirmation');
      window.scrollTo({ top: 0, behavior: 'auto' });
    }, 1700);
  };

  // Which gateways are on right now (the admin can switch PayU / Razorpay without a new release)
  useEffect(() => {
    if (checkoutStep === 'details') return;
    let cancelled = false;
    // Never leave the payment step on a loading box: after 6 seconds the store's main gateway is shown
    const slow = window.setTimeout(() => {
      if (!cancelled) setGateways((current) => current || { razorpay: true, payu: false });
    }, 6000);
    ordersApi<{ gateways: { razorpay: boolean; payu: boolean } }>('gateways')
      .finally(() => window.clearTimeout(slow))
      .then(({ gateways: available }) => {
        if (cancelled) return;
        setGateways(available);
        setGateway((current) => (available[current] ? current : available.razorpay ? 'razorpay' : 'payu'));
      })
      .catch(() => { if (!cancelled) setGateways({ razorpay: true, payu: false }); });
    return () => { cancelled = true; };
  }, [checkoutStep]);

  // Back from PayU (or a customer checking a pending payment): the server confirms the payment with the gateway
  const checkPaymentResult = async (orderNumber: string, token: string) => {
    setPaymentReturn({ state: 'checking', orderNumber, token, message: '' });
    try {
      const result = await ordersApi<{ order: Order; paid: boolean; gatewayNote: string }>('payment-result', { orderNumber, token });
      if (result.paid) {
        completeOrder(result.order);
        showToast('Payment received. Your order is confirmed.', 'success');
        return;
      }
      const pending = result.gatewayNote === 'pending' || result.gatewayNote === 'unknown';
      setPaymentReturn({
        state: pending ? 'pending' : 'failed',
        orderNumber,
        token,
        message: pending
          ? 'Your bank has not confirmed the payment yet. If money was deducted, it will be confirmed automatically in a few minutes — please do not pay again.'
          : 'The payment was not completed and no money was taken. You can try again.',
      });
    } catch (err: any) {
      setPaymentReturn({ state: 'pending', orderNumber, token, message: err?.message || 'We could not check the payment right now. Please try again in a moment.' });
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const state = params.get('payment');
    const orderNumber = params.get('order') || '';
    const token = params.get('t') || '';
    if (!state) return;
    window.history.replaceState(window.history.state, '', window.location.pathname);
    if (!orderNumber || !token) {
      setErrorMessage(state === 'failed'
        ? 'The payment was not completed. No money was taken. Please try again.'
        : 'We could not confirm the payment on this page. If money was deducted, the order is confirmed automatically within a few minutes — check My Orders before paying again.');
      return;
    }
    checkPaymentResult(orderNumber, token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the Razorpay window script as soon as the checkout page opens
  useEffect(() => { loadRazorpaySDK(); }, []);

  const inAppBrowser = typeof navigator !== 'undefined'
    ? (/Instagram/i.test(navigator.userAgent) ? 'Instagram' : /FBAN|FBAV|FB_IAB/i.test(navigator.userAgent) ? 'Facebook' : '')
    : '';

  const handlePlacePrepaidOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessing) return;

    if (!cart || cart.length === 0) {
      setErrorMessage('Your bag is empty. Please add products before placing an order.');
      return;
    }
    if (!validateForm()) {
      setCheckoutStep('details');
      window.scrollTo({ top: 100, behavior: 'smooth' });
      return;
    }
    if (saveAddressOption) handleSaveAddressToDb(address);

    setIsProcessing(true);
    setPayStage('creating');
    setErrorMessage('');

    if (gateways && !gateways.razorpay && !gateways.payu) {
      setIsProcessing(false);
      setErrorMessage('Online payment is paused for a few minutes. Please try again shortly.');
      return;
    }
    const sdkReady = gateway === 'razorpay' ? loadRazorpaySDK() : Promise.resolve(true);
    const signature = JSON.stringify([cart.map((item) => [item.product.id, item.selectedSize, item.selectedColor?.name || '', item.quantity, item.lookParentId || '']), appliedCoupon?.code || '']);
    let created: {
      gateway?: Gateway; alreadyPaid?: boolean; orderNumber: string; order: Order;
      razorpayOrderId: string; amount: number; currency: string; keyId: string;
      payuAction?: string; payuFields?: Record<string, string>;
    };
    try {
      created = await ordersApi('create', {
        gateway,
        attemptKey: checkoutAttemptKey(signature),
        items: cart.map((item) => ({
          productId: item.product.id,
          size: item.selectedSize,
          color: { name: item.selectedColor?.name || '', hex: item.selectedColor?.hex || '' },
          quantity: item.quantity,
          ...(item.lookParentId ? { parentId: item.lookParentId } : {}),
        })),
        couponCode: appliedCoupon?.code || '',
        address: { ...address, fullName: `${firstName.trim()} ${lastName.trim()}`.trim() },
        giftNote: addGiftNote ? giftNoteText.trim() : '',
      });
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMessage(err?.message || 'Could not start checkout. Please try again.');
      showToast(err?.message || 'Could not start checkout.', 'error');
      return;
    }
    // This same checkout was already paid (e.g. paid in another tab): show its confirmation, never charge twice
    if (created.alreadyPaid) {
      completeOrder(created.order);
      return;
    }
    if (created.gateway === 'payu' && created.payuAction && created.payuFields) {
      try { sessionStorage.setItem('sag_payu_pending', created.orderNumber); } catch {}
      submitToPayu(created.payuAction, created.payuFields);
      return;
    }
    if (!(await sdkReady) || !(window as any).Razorpay) {
      setIsProcessing(false);
      setErrorMessage('Could not load the Razorpay payment window. Check your connection and try again.');
      return;
    }
    setPayStage('paying');

    if (Math.round(created.order.finalTotal) !== Math.round(finalCartTotal)) {
      showToast(`Your total was updated to ₹${created.order.finalTotal.toLocaleString('en-IN')} based on current prices.`, 'info');
    }

    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    try {
      const rzp = new (window as any).Razorpay({
        key: created.keyId,
        order_id: created.razorpayOrderId,
        amount: created.amount,
        currency: created.currency,
        name: 'Suit Aura Girls',
        description: `Order ${created.orderNumber}`,
        image: '/suit-aura-logo-512.png',
        prefill: { name: fullName, email: address.email, contact: address.mobile },
        notes: { order_number: created.orderNumber },
        theme: { color: '#4B1D3F' },
        config: razorpayDisplayConfig(paymentSettings),
        retry: { enabled: true },
        handler: async (response: any) => {
          try {
            const verified = await ordersApi<{ order: Order }>('verify', {
              orderNumber: created.orderNumber,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            completeOrder(verified.order);
            showToast('Payment received. Your order is confirmed.', 'success');
          } catch (err: any) {
            setIsProcessing(false);
            setErrorMessage(`${err?.message || 'We could not confirm your payment yet.'} Your order number is ${created.orderNumber}. Please do not pay again — contact us on WhatsApp and we will confirm it.`);
          }
        },
        modal: {
          confirm_close: true,
          ondismiss: () => {
            setIsProcessing(false);
            showToast('Payment cancelled. No money was taken.', 'info');
          },
        },
      });
      rzp.on('payment.failed', (response: any) => {
        setIsProcessing(false);
        const reason = response?.error?.description || 'Payment failed.';
        setErrorMessage(`${reason} You can try again.`);
      });
      rzp.open();
    } catch (err) {
      console.error('Razorpay launch error:', err);
      setIsProcessing(false);
      setErrorMessage('Could not open the payment window. Please try again.');
    }
  };

  if (celebrating) return <OrderPlacedOverlay />;

  if (paymentReturn) {
    return (
      <div className="min-h-[80vh] bg-[#FBF7F3] flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-3xl border border-[#4B1D3F]/10 bg-white p-7 text-center shadow-[0_24px_60px_-40px_rgba(42,26,38,0.6)]">
          {paymentReturn.state === 'checking' ? (
            <>
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#4B1D3F]" />
              <h2 className="mt-4 font-serif text-2xl text-[#4B1D3F]">Confirming your payment…</h2>
              <p className="mt-2 text-sm text-[#2A1A26]/70">Please keep this page open. This takes a few seconds.</p>
            </>
          ) : (
            <>
              <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${paymentReturn.state === 'pending' ? 'bg-[#F3EEF8] text-[#4B1D3F]' : 'bg-rose-50 text-rose-700'}`}>
                {paymentReturn.state === 'pending' ? <Info className="h-7 w-7" /> : <AlertCircle className="h-7 w-7" />}
              </div>
              <h2 className="mt-4 font-serif text-2xl text-[#4B1D3F]">{paymentReturn.state === 'pending' ? 'Payment pending' : 'Payment not completed'}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#2A1A26]/70">{paymentReturn.message}</p>
              <p className="mt-3 text-xs text-[#2A1A26]/55">Order number: <span className="font-semibold text-[#2A1A26]">{paymentReturn.orderNumber}</span></p>
              <div className="mt-6 flex flex-col gap-2.5">
                {paymentReturn.state === 'pending' && (
                  <button type="button" onClick={() => checkPaymentResult(paymentReturn.orderNumber, paymentReturn.token)} className="sag-btn-primary h-12 text-xs font-semibold uppercase tracking-[0.14em] cursor-pointer">
                    Check payment status
                  </button>
                )}
                {paymentReturn.state === 'failed' && cart.length > 0 && (
                  <button type="button" onClick={() => { setPaymentReturn(null); setCheckoutStep('payment'); }} className="sag-btn-primary h-12 text-xs font-semibold uppercase tracking-[0.14em] cursor-pointer">
                    Try payment again
                  </button>
                )}
                <button type="button" onClick={() => { setPaymentReturn(null); setActivePage(cart.length > 0 ? 'cart' : 'shop'); }} className="sag-btn-outline h-12 text-xs font-semibold uppercase tracking-[0.14em] cursor-pointer">
                  {cart.length > 0 ? 'Back to bag' : 'Continue shopping'}
                </button>
                <a
                  href={createSupportWhatsAppUrl(`Hi Suit Aura Girls, I need help with the payment for order ${paymentReturn.orderNumber}.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center justify-center gap-2 text-sm font-medium text-[#4B1D3F] hover:underline"
                >
                  <WhatsAppIcon className="h-4 w-4" /> Contact support
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!cart || cart.length === 0) {
    return (
      <div className="min-h-[80vh] bg-[#FBF7F3] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-[#4B1D3F]/10 text-[#2A1A26] rounded-full flex items-center justify-center mb-4">
          <BagIcon className="w-10 h-10" />
        </div>
        <h2 className="font-serif text-3xl font-bold text-[#2A1A26] mb-2">
          Your Shopping Bag is Empty
        </h2>
        <p className="text-[#2A1A26]/75 max-w-md mb-6 text-sm">
          Explore our handcrafted ethnic couture collections and add your favorite suits to complete your purchase.
        </p>
        <button
          onClick={() => setActivePage('shop')}
          className="px-8 py-3.5 bg-[#4B1D3F] hover:bg-[#3B1532] text-white rounded font-bold text-xs uppercase tracking-widest transition-all cursor-pointer shadow-md"
        >
          Explore Luxury Collection
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBF7F3] text-[#4B1D3F] pb-6 sm:pb-8 font-sans text-left">

      {/* Progress: Address → Order summary → Payment */}
      <nav aria-label="Checkout steps" className="bg-white border-b border-[#4B1D3F]/10 py-3.5 px-4 sm:px-8">
        <p className="max-w-3xl mx-auto mb-3 flex items-center justify-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-emerald-700">
          <Lock className="h-3 w-3" /> Secure checkout
        </p>
        <ol className="max-w-3xl mx-auto flex items-center">
          {([['details', 'Address'], ['summary', 'Order summary'], ['payment', 'Payment']] as const).map(([step, text], index, all) => {
            const order = ['details', 'summary', 'payment'];
            const current = order.indexOf(checkoutStep);
            const done = index < current;
            const active = index === current;
            return (
              <li key={step} className={`flex items-center ${index < all.length - 1 ? 'flex-1' : ''}`}>
                <button
                  type="button"
                  onClick={() => goToStep(step)}
                  aria-current={active ? 'step' : undefined}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${active ? 'bg-[#4B1D3F] text-white' : done ? 'bg-emerald-600 text-white' : 'bg-[#F3EEF8] text-[#4B1D3F]/70'}`}>
                    {done ? <Check className="h-4 w-4" /> : index + 1}
                  </span>
                  <span className={`text-[13px] sm:text-sm whitespace-nowrap ${active ? 'font-semibold text-[#4B1D3F]' : 'text-[#2A1A26]/60'} ${active ? '' : 'hidden min-[400px]:inline'}`}>{text}</span>
                </button>
                {index < all.length - 1 && <span aria-hidden="true" className={`mx-2 sm:mx-4 h-px flex-1 ${done ? 'bg-emerald-600' : 'bg-[#4B1D3F]/15'}`} />}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Main Content Layout */}
      <div className={`max-w-6xl mx-auto px-4 sm:px-6 pt-5 sm:pt-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start ${checkoutStep !== 'details' ? 'pb-28 lg:pb-0' : ''}`}>

        {/* Left Column: Checkout Step Form (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">

          {errorMessage && (
            <div role="alert" className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-sm flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-700 mt-0.5" />
              <div>
                <p className="font-semibold">Please check</p>
                <p className="mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* STEP 1: DETAILS VIEW */}
          {checkoutStep === 'details' && (
            <div className="space-y-6 animate-in fade-in duration-200">

              {/* Contact Information Box */}
              <div className="bg-white border border-[#4B1D3F]/10 rounded-3xl p-5 sm:p-7 space-y-4 shadow-[0_1px_3px_rgba(42,26,38,0.05)]">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-xl text-[#4B1D3F] flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-full bg-[#4B1D3F] text-white text-xs font-sans font-semibold flex items-center justify-center">1</span>
                    Contact details
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-[13px] font-medium text-[#2A1A26]/80 mb-1.5">
                      First name *
                    </label>
                    <input aria-label="First name"
                      type="text"
                      value={firstName}
                      onChange={(e) => handleFieldChangeDebounced('firstName', e.target.value)}
                      onBlur={handleFieldBlur}
                      placeholder="First name"
                      className="w-full h-12 px-4 bg-white border border-[#4B1D3F]/15 rounded-xl text-[15px] text-[#2A1A26] placeholder:text-[#2A1A26]/40 focus:outline-none focus:ring-2 focus:ring-[#4B1D3F]/15 focus:border-[#4B1D3F]/50 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-[#2A1A26]/80 mb-1.5">
                      Last name *
                    </label>
                    <input aria-label="Last name"
                      type="text"
                      value={lastName}
                      onChange={(e) => handleFieldChangeDebounced('lastName', e.target.value)}
                      onBlur={handleFieldBlur}
                      placeholder="Last name"
                      className="w-full h-12 px-4 bg-white border border-[#4B1D3F]/15 rounded-xl text-[15px] text-[#2A1A26] placeholder:text-[#2A1A26]/40 focus:outline-none focus:ring-2 focus:ring-[#4B1D3F]/15 focus:border-[#4B1D3F]/50 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#2A1A26]/80 mb-1.5">
                    Mobile number *
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="h-12 px-3.5 flex items-center bg-[#F3EEF8] rounded-xl text-[15px] font-medium text-[#4B1D3F] shrink-0">
                      +91
                    </span>
                    <input aria-label="10-digit mobile number"
                      type="tel"
                      maxLength={10}
                      value={address.mobile}
                      onChange={(e) => handleFieldChangeDebounced('mobile', e.target.value)}
                      onBlur={handleFieldBlur}
                      placeholder="10-digit mobile number"
                      className="w-full h-12 px-4 bg-white border border-[#4B1D3F]/15 rounded-xl text-[15px] text-[#2A1A26] placeholder:text-[#2A1A26]/40 focus:outline-none focus:ring-2 focus:ring-[#4B1D3F]/15 focus:border-[#4B1D3F]/50 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#2A1A26]/80 mb-1.5">
                    Email (for order updates) *
                  </label>
                  <input aria-label="you@example.com"
                    type="email"
                    value={address.email}
                    onChange={(e) => handleFieldChangeDebounced('email', e.target.value)}
                    onBlur={handleFieldBlur}
                    placeholder="you@example.com"
                    className="w-full h-12 px-4 bg-white border border-[#4B1D3F]/15 rounded-xl text-[15px] text-[#2A1A26] placeholder:text-[#2A1A26]/40 focus:outline-none focus:ring-2 focus:ring-[#4B1D3F]/15 focus:border-[#4B1D3F]/50 transition-colors"
                  />
                </div>
              </div>

              {hasSavedAddresses && (
                <div className="bg-white border border-[#4B1D3F]/10 rounded-3xl p-5 sm:p-6 space-y-3 shadow-[0_1px_3px_rgba(42,26,38,0.05)]">
                  <h3 className="font-serif text-xl text-[#4B1D3F]">Deliver to a saved address</h3>
                  <AddressBook onSelect={applySavedAddress} selectedId={selectedAddressId} />
                </div>
              )}

              {/* Shipping Address Box */}
              <div className="bg-white border border-[#4B1D3F]/10 rounded-3xl p-5 sm:p-7 space-y-4 shadow-[0_1px_3px_rgba(42,26,38,0.05)]">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-serif text-xl text-[#4B1D3F] flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-full bg-[#4B1D3F] text-white text-xs font-sans font-semibold flex items-center justify-center">2</span>
                    Delivery address
                  </h3>

                  <button
                    type="button"
                    onClick={handleAutoDetectLocation}
                    disabled={isDetectingLocation}
                    className="h-9 px-3.5 bg-[#F3EEF8] hover:bg-[#E6DDF0] text-[#4B1D3F] rounded-full font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    {isDetectingLocation ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2A1A26]" />
                    ) : (
                      <MapPin className="w-3.5 h-3.5 text-[#2A1A26]" />
                    )}
                    <span>Use my location</span>
                  </button>
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#2A1A26]/80 mb-1.5">
                    PIN code *
                  </label>
                  <div className="relative">
                    <input aria-label="6-digit PIN code (e.g. 110001)"
                      type="text"
                      maxLength={6}
                      value={address.pincode}
                      onChange={(e) => setAddress(prev => ({ ...prev, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                      placeholder="6-digit PIN code (e.g. 110001)"
                      className="w-full h-12 px-4 bg-white border border-[#4B1D3F]/15 rounded-xl text-[15px] text-[#2A1A26] placeholder:text-[#2A1A26]/40 focus:outline-none focus:ring-2 focus:ring-[#4B1D3F]/15 focus:border-[#4B1D3F]/50 transition-colors"
                    />
                    {pincodeLoading && (
                      <div className="absolute right-3.5 top-4">
                        <Loader2 className="w-4 h-4 animate-spin text-[#2A1A26]" />
                      </div>
                    )}
                  </div>
                  {pincodeError && (
                    <p className="text-[11px] text-rose-700 font-bold mt-1">⚠️ {pincodeError}</p>
                  )}
                  {!pincodeError && pincodeHint && (
                    <p role="status" className="text-[12px] text-[#2A1A26]/70 mt-1">{pincodeHint}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#2A1A26]/80 mb-1.5">
                    Flat / house no. / building *
                  </label>
                  <input aria-label="Flat 302, Palm Heights"
                    type="text"
                    value={address.houseFlat}
                    onChange={(e) => setAddress(prev => ({ ...prev, houseFlat: e.target.value }))}
                    placeholder="Flat 302, Palm Heights"
                    className="w-full h-12 px-4 bg-white border border-[#4B1D3F]/15 rounded-xl text-[15px] text-[#2A1A26] placeholder:text-[#2A1A26]/40 focus:outline-none focus:ring-2 focus:ring-[#4B1D3F]/15 focus:border-[#4B1D3F]/50 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#2A1A26]/80 mb-1.5">
                    Street, area, landmark *
                  </label>
                  <input aria-label="MG Road, Near Central Mall"
                    type="text"
                    value={address.street}
                    onChange={(e) => setAddress(prev => ({ ...prev, street: e.target.value, area: e.target.value }))}
                    placeholder="MG Road, Near Central Mall"
                    className="w-full h-12 px-4 bg-white border border-[#4B1D3F]/15 rounded-xl text-[15px] text-[#2A1A26] placeholder:text-[#2A1A26]/40 focus:outline-none focus:ring-2 focus:ring-[#4B1D3F]/15 focus:border-[#4B1D3F]/50 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[13px] font-medium text-[#2A1A26]/80 mb-1.5">
                      City / town *
                    </label>
                    <input aria-label="New Delhi"
                      type="text"
                      value={address.city}
                      onChange={(e) => setAddress(prev => ({ ...prev, city: e.target.value }))}
                      placeholder="New Delhi"
                      className="w-full h-12 px-4 bg-white border border-[#4B1D3F]/15 rounded-xl text-[15px] text-[#2A1A26] placeholder:text-[#2A1A26]/40 focus:outline-none focus:ring-2 focus:ring-[#4B1D3F]/15 focus:border-[#4B1D3F]/50 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-[#2A1A26]/80 mb-1.5">
                      State *
                    </label>
                    <select aria-label="State"
                      value={address.state}
                      onChange={(e) => setAddress(prev => ({ ...prev, state: e.target.value }))}
                      className="w-full h-12 px-4 bg-white border border-[#4B1D3F]/15 rounded-xl text-[15px] text-[#2A1A26] placeholder:text-[#2A1A26]/40 focus:outline-none focus:ring-2 focus:ring-[#4B1D3F]/15 focus:border-[#4B1D3F]/50 transition-colors"
                    >
                      <option value="" disabled>Select state</option>
                      {/* The PIN lookup or a saved address can give a name that is not in the list
                          ("Delhi", "Chandigarh"): show it, or the box would display the first state instead. */}
                      {address.state && !INDIAN_STATES.includes(address.state) && (
                        <option value={address.state}>{address.state}</option>
                      )}
                      {INDIAN_STATES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="saveAddr"
                    checked={saveAddressOption}
                    onChange={(e) => setSaveAddressOption(e.target.checked)}
                    className="w-4 h-4 accent-[#4B1D3F] rounded cursor-pointer"
                  />
                  <label htmlFor="saveAddr" className="text-sm text-[#2A1A26]/75 cursor-pointer">
                    Save this address to my account for future orders
                  </label>
                </div>

              </div>

              {/* Continue to the order summary */}
              <button
                type="button"
                onClick={handleProceedToPaymentStep}
                className="w-full h-14 bg-[#4B1D3F] hover:bg-[#3B1532] text-white rounded-full font-semibold text-xs uppercase tracking-[0.16em] transition-colors cursor-pointer shadow-md flex items-center justify-center gap-2 group"
              >
                <span>Deliver here · Continue</span>
                <ArrowRight className="w-4 h-4 text-white group-hover:translate-x-1 transition-transform" />
              </button>

            </div>
          )}

          {/* STEP 2: ORDER SUMMARY */}
          {checkoutStep === 'summary' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <section className="rounded-2xl border border-[#4B1D3F]/12 bg-white p-5 sm:p-6" aria-label="Delivery address">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="sag-eyebrow flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Deliver to</p>
                    <p className="mt-2 text-sm font-semibold text-[#2A1A26]">
                      {`${firstName} ${lastName}`.trim()}
                      {address.type && <span className="ml-2 rounded-full bg-[#F3EEF8] px-2 py-0.5 text-[11px] font-semibold text-[#4B1D3F]">{address.type}</span>}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[#2A1A26]/75">
                      {[address.houseFlat, address.street, address.area, address.landmark, address.city, address.state].filter(Boolean).join(', ')} – {address.pincode}
                    </p>
                    <p className="mt-1 text-sm text-[#2A1A26]/75">Mobile: {address.mobile}{address.altMobile ? ` · Alt: ${address.altMobile}` : ''}</p>
                    {address.email && <p className="text-sm text-[#2A1A26]/60 break-all">{address.email}</p>}
                  </div>
                  <button type="button" onClick={() => setCheckoutStep('details')} className="shrink-0 h-9 px-4 rounded-full border border-[#4B1D3F]/25 text-xs font-semibold text-[#4B1D3F] hover:bg-[#F3EEF8] cursor-pointer">
                    Change
                  </button>
                </div>
              </section>

              <section className="rounded-2xl border border-[#4B1D3F]/12 bg-white p-5 sm:p-6 space-y-4" aria-label="Items">
                <p className="text-sm font-semibold text-[#2A1A26]">{cart.reduce((a, c) => a + c.quantity, 0)} {cart.reduce((a, c) => a + c.quantity, 0) === 1 ? 'item' : 'items'}</p>
                <ul className="divide-y divide-[#4B1D3F]/10">
                  {cart.map((item) => {
                    const unit = Number(item.product?.price) || 0;
                    const mrp = Math.max(unit, Number(item.product?.originalPrice) || unit);
                    const off = mrp > unit ? Math.round(((mrp - unit) / mrp) * 100) : 0;
                    const colour = item.selectedColor?.name && !['Default', 'Standard'].includes(item.selectedColor.name) ? item.selectedColor.name : '';
                    const img = item.selectedColor?.imageUrl || item.product?.images?.[0] || item.product?.image || '';
                    return (
                      <li key={`${item.id}-${item.selectedSize}-${colour}`} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                        <img src={getCleanImageUrl(img, 200)} alt="" className="h-24 w-[76px] shrink-0 rounded-xl object-cover object-top bg-[#F3EEF8]" loading="lazy" />
                        <div className="min-w-0 flex-1">
                          <p className="font-serif text-base leading-snug text-[#2A1A26] line-clamp-2">{item.product?.name}</p>
                          {item.lookParentName && <p className="text-[11px] text-[#9C7A45]">Complete the look · with {item.lookParentName}</p>}
                          <p className="mt-0.5 text-xs text-[#2A1A26]/65">
                            {item.selectedSize && !/free/i.test(item.selectedSize) ? `Size ${item.selectedSize}` : 'One size'}{colour ? ` · ${colour}` : ''} · Qty {item.quantity}
                          </p>
                          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
                            <span className="text-base font-semibold text-[#2A1A26]">₹{(unit * item.quantity).toLocaleString('en-IN')}</span>
                            {mrp > unit && <span className="text-xs text-[#2A1A26]/50 line-through">₹{(mrp * item.quantity).toLocaleString('en-IN')}</span>}
                            {off > 0 && <span className="text-xs font-semibold text-emerald-700">{off}% off</span>}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="flex items-center gap-2 rounded-xl bg-[#FBF7F3] px-3 py-2.5 text-xs text-[#2A1A26]/75">
                  <Truck className="h-4 w-4 text-[#4B1D3F]" />
                  {shippingFee === 0 ? 'Free delivery' : `Delivery ₹${shippingFee.toLocaleString('en-IN')}`}{deliveryEstimateText ? <> · <span className="font-semibold text-[#2A1A26]">Estimated delivery by {deliveryEstimateText}</span></> : null}
                </p>
              </section>

              {/* Gift note */}
              <section className="rounded-2xl border border-[#4B1D3F]/12 bg-white p-5 space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium text-[#2A1A26] cursor-pointer">
                  <input type="checkbox" checked={addGiftNote} onChange={(e) => setAddGiftNote(e.target.checked)} className="w-4 h-4 accent-[#4B1D3F] cursor-pointer" />
                  <Gift className="w-4 h-4 text-[#4B1D3F]" /> Add a gift note to the parcel
                </label>
                {addGiftNote && (
                  <textarea aria-label="Gift note" rows={2} maxLength={300} value={giftNoteText} onChange={(e) => setGiftNoteText(e.target.value)}
                    placeholder="Write a short message for the recipient"
                    className="w-full p-3 bg-white border border-[#4B1D3F]/15 rounded-xl text-sm text-[#2A1A26] focus:outline-none focus:ring-2 focus:ring-[#4B1D3F]/20" />
                )}
              </section>

              <button type="button" onClick={() => goToStep('payment')}
                className="hidden lg:flex w-full h-14 bg-[#4B1D3F] hover:bg-[#3B1532] text-white rounded-full font-semibold text-xs uppercase tracking-[0.16em] cursor-pointer shadow-md items-center justify-center gap-2">
                Continue to payment · ₹{finalCartTotal.toLocaleString('en-IN')} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* STEP 3: PAYMENT VIEW */}
          {checkoutStep === 'payment' && (
            <div className="space-y-6 animate-in fade-in duration-200">

              {/* Back to Details Button */}
              <button
                type="button"
                onClick={() => setCheckoutStep('summary')}
                className="text-xs font-bold text-[#2A1A26] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to order summary</span>
              </button>

              <div className="rounded-2xl bg-[#4B1D3F] p-5 text-white flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#C5A46D]">Total amount</p>
                  <p className="font-serif text-3xl mt-1">₹{finalCartTotal.toLocaleString('en-IN')}</p>
                </div>
                <p className="text-right text-xs text-white/70 max-w-[55%]">Deliver to {`${firstName} ${lastName}`.trim()}, {address.city} {address.pincode}
                  <button type="button" onClick={() => setCheckoutStep('details')} className="block ml-auto mt-1 font-semibold text-[#C5A46D] underline underline-offset-2 cursor-pointer">Change address</button>
                </p>
              </div>

              {/* Select Payment Method Container */}
              <div className="bg-white border border-[#4B1D3F]/10 rounded-3xl p-5 sm:p-7 space-y-5 shadow-[0_1px_3px_rgba(42,26,38,0.05)]">

                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-serif text-xl text-[#4B1D3F] flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-[#4B1D3F]" />
                    Choose how to pay
                  </h3>
                  <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold text-[10px] flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> 100% Encrypted
                  </span>
                </div>

                {gateways === null ? (
                  <div className="space-y-2.5" aria-busy="true" aria-label="Loading payment options">
                    <div className="h-[76px] rounded-2xl bg-[#F3EEF8] animate-pulse flex items-center justify-center gap-2 text-sm text-[#4B1D3F]/70">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading payment options…
                    </div>
                  </div>
                ) : !gateways.razorpay && !gateways.payu ? (
                  <p className="rounded-2xl bg-[#F7E4EA] px-4 py-3 text-sm text-[#8A2E55]">
                    Online payment is paused for a few minutes. Please try again shortly or message us on WhatsApp.
                  </p>
                ) : (
                  <div className="space-y-2.5" role="radiogroup" aria-label="Payment method">
                    {([
                      ['razorpay', 'UPI, cards & net banking', 'Google Pay, PhonePe, Paytm, any UPI app, debit / credit cards, net banking and wallets'],
                      ['payu', 'Pay with PayU', 'UPI, debit / credit cards and net banking on PayU\'s secure page'],
                    ] as Array<[Gateway, string, string]>).filter(([id]) => gateways[id]).map(([id, title, detail]) => (
                      <label
                        key={id}
                        className={`flex items-start gap-3 rounded-2xl border p-4 cursor-pointer transition-colors ${gateway === id ? 'border-[#4B1D3F] bg-[#F3EEF8]/70' : 'border-[#4B1D3F]/15 bg-white hover:border-[#4B1D3F]/40'}`}
                      >
                        <input type="radio" name="gateway" value={id} checked={gateway === id} onChange={() => setGateway(id)} className="mt-1 h-4 w-4 accent-[#4B1D3F]" />
                        <span className="flex-1">
                          <span className="block text-sm font-semibold text-[#2A1A26]">{title}</span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-[#2A1A26]/70">{detail}</span>
                        </span>
                        {gateway === id && <CheckCircle2 className="h-5 w-5 shrink-0 text-[#4B1D3F]" />}
                      </label>
                    ))}
                    {prepaidDiscount > 0 && (
                      <p className="text-xs text-emerald-700 font-semibold">
                        Online payment discount of ₹{prepaidDiscount.toLocaleString('en-IN')} applied.
                      </p>
                    )}
                  </div>
                )}

                {inAppBrowser && (
                  <p className="rounded-xl bg-[#F7E4EA] px-4 py-3 text-xs text-[#8A2E55] leading-relaxed">
                    You are inside the {inAppBrowser} app. UPI apps (Google Pay, PhonePe, Paytm) open best in your phone's browser:
                    tap <span className="font-semibold">⋮</span> (top right) → <span className="font-semibold">Open in browser / Chrome</span>, then pay.
                  </p>
                )}

                {/* PAY NOW CTA BUTTON */}
                <button
                  type="button"
                  onClick={handlePlacePrepaidOrder}
                  disabled={isProcessing || gateways === null || (!gateways.razorpay && !gateways.payu)}
                  className="hidden lg:flex w-full h-14 bg-[#4B1D3F] hover:bg-[#3B1532] text-white rounded-full font-semibold text-sm uppercase tracking-[0.14em] transition-colors cursor-pointer shadow-md items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  {isProcessing ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>{payStage === 'creating' ? 'Creating your order…' : gateway === 'payu' ? 'Taking you to PayU…' : 'Processing your payment…'}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-white" />
                      <span>PAY NOW • ₹{finalCartTotal.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                </button>

                <p className="text-center text-[11px] text-[#2A1A26]/65">
                  Secure {gateway === 'payu' ? 'PayU' : 'Razorpay'} checkout. Your order is confirmed only after the payment is verified.
                </p>

              </div>

            </div>
          )}

        </div>

        {/* Right Column: Order Summary & Karigari Guarantee (5 Cols) */}
        <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-36">

          <div className="bg-white border border-[#4B1D3F]/10 rounded-3xl p-5 sm:p-6 space-y-5 shadow-[0_1px_3px_rgba(42,26,38,0.05)]">

            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-serif text-xl text-[#4B1D3F]">
                  {checkoutStep === 'details' ? 'Order summary' : 'Price details'}
                </h3>
                <p className="text-[11px] font-sans text-[#2A1A26]/65 font-medium">
                  {cart.reduce((a, c) => a + c.quantity, 0)} {cart.reduce((a, c) => a + c.quantity, 0) === 1 ? 'Item' : 'Items'} in Bag
                </p>
              </div>
              {shippingFee === 0 && (
                <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold text-[10px] sm:text-[11px] uppercase tracking-wider whitespace-nowrap shrink-0">
                  Free Delivery
                </span>
              )}
            </div>

            {/* Cart Items List */}
            <div className={`space-y-3 max-h-96 overflow-y-auto pr-1 ${checkoutStep === 'summary' ? 'hidden' : checkoutStep === 'payment' ? 'hidden lg:block' : ''}`}>
              {cart.map((item) => {
                const itemTitle = item.product?.name || (item as any).title || (item as any).name || 'Ethnic Suit Set';
                const selectedColorName = item.selectedColor?.name;
                const selectedColorHex = item.selectedColor?.hex;
                const colorsList = item.product?.colors || [];
                const colorIdx = colorsList.findIndex((c: any) => c.name === selectedColorName || c.hex === selectedColorHex);
                const itemImg = item.selectedColor?.imageUrl
                  || (colorIdx !== -1 && item.product?.images?.[colorIdx])
                  || item.product?.images?.[0]
                  || (item as any).image
                  || (item as any).imageUrl
                  || '';
                const itemSize = item.selectedSize || (item as any).size || 'M';
                const itemColor = typeof item.selectedColor === 'object' ? item.selectedColor?.name : (item.selectedColor || (item as any).color || '');
                const itemPrice = typeof item.product?.price === 'number' ? item.product.price : ((item as any).price || 0);
                const origPrice = Math.max(itemPrice, Number(item.product?.originalPrice) || itemPrice);

                return (
                  <div key={`${item.id}-${itemSize}-${itemColor}`} className="p-3 bg-[#FBF7F3] rounded-2xl flex items-start gap-3">
                    <img
                      src={getCleanImageUrl(itemImg)}
                      alt={itemTitle}
                      className="w-[72px] h-24 object-cover object-top rounded-xl shrink-0 bg-[#F3EEF8]"
                    />
                    <div className="flex-1 min-w-0 text-xs space-y-1.5">

                      <h4 className="font-serif text-[15px] text-[#2A1A26] leading-snug line-clamp-2">
                        {itemTitle}
                      </h4>

                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] pt-0.5">
                        <span className="px-2 py-0.5 bg-white text-[#2A1A26]/80 rounded-full">
                          Size: <strong className="text-[#2A1A26]">{itemSize}</strong>
                        </span>
                        {itemColor && (
                          <span className="px-2 py-0.5 bg-white text-[#2A1A26]/80 rounded-full">
                            Color: <strong className="text-[#2A1A26]">{itemColor}</strong>
                          </span>
                        )}
                        <span className="px-2 py-0.5 bg-white text-[#2A1A26]/80 rounded-full">
                          Qty: <strong className="text-[#2A1A26]">{item.quantity}</strong>
                        </span>
                      </div>

                      <div className="pt-1 flex items-baseline justify-between gap-2">
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold text-[#2A1A26] text-base">
                            ₹{(itemPrice * item.quantity).toLocaleString('en-IN')}
                          </span>
                          {origPrice > itemPrice && (
                            <span className="text-[#2A1A26]/65 line-through text-xs font-mono">
                              ₹{(origPrice * item.quantity).toLocaleString('en-IN')}
                            </span>
                          )}
                        </div>
                        {origPrice > itemPrice && (
                          <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                            {Math.round(((origPrice - itemPrice) / origPrice) * 100)}% OFF
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Promo Code / Coupon Section */}
            <div className="space-y-2.5 pt-2 border-t border-[#4B1D3F]/20">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-[#2A1A26]/65 uppercase tracking-widest flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-[#2A1A26]" />
                  Apply Promo Code
                </p>
                {coupons.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCouponsModal(true)}
                  className="text-xs font-bold text-[#2A1A26] hover:text-[#2A1A26] flex items-center gap-1 transition cursor-pointer underline underline-offset-2"
                >
                  <span>View coupons ({coupons.length})</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                )}
              </div>

              {/* Applied Coupon Info or Manual Input Form */}
              {appliedCoupon ? (
                <div className="p-3 bg-[#F3EEF8]/50 border border-dashed border-[#4B1D3F]/40 rounded flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Tag className="w-4 h-4 text-[#2A1A26] shrink-0" />
                    <div className="min-w-0">
                      <p className="font-bold text-[#2A1A26] text-xs">
                        Coupon <span className="tabular-nums font-bold bg-[#4B1D3F] text-white px-1.5 py-0.5 rounded-md text-[10px] ml-1 uppercase">{appliedCoupon.code}</span> Applied
                      </p>
                      <p className="text-[10px] text-[#2A1A26]/65 font-medium mt-0.5">
                        Saved additional ₹{discountAmount.toLocaleString('en-IN')} on this order
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeCoupon}
                    className="text-xs font-bold text-[#2A1A26] uppercase tracking-wider underline underline-offset-2 hover:text-[#2A1A26] transition cursor-pointer shrink-0 ml-3"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <form onSubmit={handleCouponApply} className="flex gap-2">
                  <input aria-label="Enter coupon code"
                    type="text"
                    value={couponCodeInput}
                    onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                    placeholder="Enter coupon code"
                    className="flex-1 min-w-0 h-11 px-4 bg-white border border-[#4B1D3F]/20 rounded-full text-sm font-semibold text-[#2A1A26] uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-[#4B1D3F]/15 placeholder:font-normal placeholder:text-[#2A1A26]/45 placeholder:normal-case placeholder:tracking-normal"
                  />
                  <button
                    type="submit"
                    className="h-11 px-5 bg-[#4B1D3F] text-white hover:bg-[#3B1532] rounded-full font-semibold text-xs uppercase tracking-wider cursor-pointer transition-colors"
                  >
                    Apply
                  </button>
                </form>
              )}
            </div>

            {/* Official High-End Price Breakdown */}
            <div className="pt-3 border-t border-[#4B1D3F]/25 space-y-3 text-[13px]">
              <div className={`flex items-center justify-between ${checkoutStep === 'details' ? '' : 'hidden'}`}>
                <span className="text-[11px] font-bold text-[#2A1A26]/65 uppercase tracking-widest">
                  Price Details ({cart.reduce((a, c) => a + c.quantity, 0)} {cart.reduce((a, c) => a + c.quantity, 0) === 1 ? 'Item' : 'Items'})
                </span>
              </div>

              <div className="space-y-2.5 py-1">
                {/* Total Item MRP */}
                <div className="flex justify-between items-center text-[#2A1A26]/75">
                  <span>Total MRP</span>
                  <span className="tabular-nums text-[#2A1A26] font-medium">₹{totalMRP.toLocaleString('en-IN')}</span>
                </div>

                {/* Catalog Savings */}
                {catalogDiscount > 0 && (
                  <div className="flex justify-between items-center text-[#2A1A26]/75">
                    <span>Discount on MRP</span>
                    <span className="tabular-nums font-bold text-emerald-700">-₹{catalogDiscount.toLocaleString('en-IN')}</span>
                  </div>
                )}

                {/* Bag Subtotal */}
                <div className="flex justify-between items-center text-[#2A1A26] font-semibold pt-1 border-t border-[#4B1D3F]/15">
                  <span>Subtotal</span>
                  <span className="tabular-nums font-bold text-[#2A1A26]">₹{cartSubtotal.toLocaleString('en-IN')}</span>
                </div>

                {/* Express Delivery */}
                <div className="flex justify-between items-center text-[#2A1A26]/75">
                  <span>Delivery Charges</span>
                  {shippingFee === 0 ? (
                    <span className="font-semibold text-emerald-700">FREE</span>
                  ) : (
                    <span className="tabular-nums text-[#2A1A26]">₹{shippingFee.toLocaleString('en-IN')}</span>
                  )}
                </div>

                {comboDiscount > 0 && (
                  <div className="flex justify-between items-center text-[#2A1A26]/75">
                    <span>Combo discount ({comboOffer?.percent}% on {comboOffer?.minItems}+ outfits)</span>
                    <span className="tabular-nums font-bold text-emerald-700">-₹{comboDiscount.toLocaleString('en-IN')}</span>
                  </div>
                )}

                {/* Coupon Savings */}
                {discountAmount > 0 && (
                  <div className="flex justify-between items-center text-[#2A1A26]/75">
                    <span>Coupon Discount ({appliedCoupon?.code})</span>
                    <span className="tabular-nums font-bold text-emerald-700">-₹{discountAmount.toLocaleString('en-IN')}</span>
                  </div>
                )}

                {/* Online Payment Discount */}
                {prepaidDiscount > 0 && (
                  <div className="flex justify-between items-center text-[#2A1A26]/75">
                    <span>Prepaid discount</span>
                    <span className="tabular-nums font-bold text-emerald-700">-₹{prepaidDiscount.toLocaleString('en-IN')}</span>
                  </div>
                )}
              </div>

              {/* Total Savings Callout Banner */}
              {totalSavings > 0 && (
                <div className="p-3 bg-emerald-50 border border-dashed border-emerald-200 rounded flex items-center justify-between text-xs">
                  <span className="text-[#2A1A26]/75 font-medium flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    Total Savings
                  </span>
                  <span className="tabular-nums font-bold text-emerald-700">
                    ₹{totalSavings.toLocaleString('en-IN')}
                  </span>
                </div>
              )}

              {/* Grand Payable Total */}
              <div className="pt-3.5 border-t border-[#4B1D3F]/30 flex justify-between items-baseline text-[#2A1A26]">
                <div>
                  <span className="font-semibold text-base block text-[#2A1A26]">Total amount</span>
                  <span className="text-[10px] text-[#2A1A26]/65 font-sans">Inclusive of all taxes{shippingFee > 0 ? ' and shipping' : ''}{freeShippingThreshold > 0 && shippingFee > 0 ? ` · free shipping above ₹${freeShippingThreshold.toLocaleString('en-IN')}` : ''}</span>
                </div>
                <span className="font-serif text-3xl text-[#4B1D3F]">
                  ₹{finalCartTotal.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

          </div>

          {/* Need Order or Size Help? Concierge Box */}
          <div className="bg-[#4B1D3F] text-white rounded-2xl p-4 flex items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0">
                <WhatsAppIcon className="w-5 h-5" />
              </div>
              <div className="text-xs">
                <p className="font-bold">Need order or size help?</p>
                <p className="text-[11px] text-white/75">Message us on WhatsApp</p>
              </div>
            </div>

            <a
              href={createSupportWhatsAppUrl('Hi Suit Aura Girls, I need help with my order checkout.')}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 bg-[#F3EEF8] text-[#2A1A26] hover:bg-white rounded font-bold text-[11px] uppercase tracking-wider transition-all cursor-pointer shrink-0"
            >
              Chat Concierge
            </a>
          </div>

        </div>

      </div>

      {/* Mobile: sticky bottom action for the summary and payment steps */}
      {checkoutStep !== 'details' && (
        <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-[#4B1D3F]/10 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-10px_30px_-20px_rgba(42,26,38,0.5)]">
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <p className="text-lg font-semibold text-[#2A1A26] leading-none">₹{finalCartTotal.toLocaleString('en-IN')}</p>
              {totalSavings > 0 && <p className="mt-1 text-[11px] font-semibold text-emerald-700">You save ₹{totalSavings.toLocaleString('en-IN')}</p>}
            </div>
            {checkoutStep === 'summary' ? (
              <button type="button" onClick={() => goToStep('payment')} className="ml-auto h-12 flex-1 max-w-[220px] rounded-full bg-[#4B1D3F] text-white text-xs font-semibold uppercase tracking-[0.14em] cursor-pointer">
                Continue
              </button>
            ) : (
              <button type="button" onClick={handlePlacePrepaidOrder} disabled={isProcessing || gateways === null || (!gateways.razorpay && !gateways.payu)}
                className="ml-auto h-12 flex-1 max-w-[220px] rounded-full bg-[#4B1D3F] text-white text-xs font-semibold uppercase tracking-[0.14em] cursor-pointer inline-flex items-center justify-center gap-2 disabled:opacity-50">
                {isProcessing ? <><Loader2 className="h-4 w-4 animate-spin" /> {payStage === 'creating' ? 'Creating…' : 'Processing…'}</> : <><Lock className="h-4 w-4" /> Pay now</>}
              </button>
            )}
          </div>
        </div>
      )}

      {/* All Available Coupons Modal / Drawer */}
      {showCouponsModal && (
        <div className="fixed inset-0 z-50 bg-[#2A1A26]/40 flex items-center justify-center p-4 animate-fadeIn" onClick={() => setShowCouponsModal(false)}>
          <div role="dialog" aria-modal="true" aria-label="Available coupons" onClick={(e) => e.stopPropagation()} className="bg-[#FBF7F3] border border-[#4B1D3F]/40 rounded-md max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-scaleUp">

            {/* Modal Header */}
            <div className="p-5 bg-[#4B1D3F] text-white flex items-center justify-between">
              <div>
                <h2 className="font-serif text-xl text-white flex items-center gap-2">
                  <Tag className="w-5 h-5 text-white" />
                  <span>Available coupons</span>
                </h2>
                <p className="text-xs text-white/80 mt-0.5">Tap a coupon to apply it to your order</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCouponsModal(false)}
                aria-label="Close coupons"
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Coupons List */}
            <div className="p-5 overflow-y-auto space-y-3.5 bg-[#F3EEF8]/50 flex-1">
              {coupons && coupons.length > 0 ? (
                coupons.map((cp) => {
                  const isApplied = appliedCoupon?.code === cp.code;
                  const isEligible = cartSubtotal >= cp.minOrderValue;
                  const discountLabel = cp.discountType === 'percentage'
                    ? `${cp.discountValue}% OFF`
                    : `₹${cp.discountValue} OFF`;

                  return (
                    <div
                      key={cp.id}
                      className={`p-4 rounded-md border transition-all space-y-2.5 ${
                        isApplied
                          ? 'bg-white border-emerald-200 ring-2 ring-emerald-500/30 shadow-md'
                          : 'bg-white border-[#4B1D3F]/30 hover:border-[#4B1D3F]/40 shadow-xs'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="tabular-nums font-extrabold text-[#2A1A26] text-sm bg-[#F3EEF8] px-3 py-1 rounded-lg border border-[#4B1D3F]/40 tracking-wider">
                            {cp.code}
                          </span>
                          <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                            {discountLabel}
                          </span>
                        </div>

                        {isApplied ? (
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
                            Applied ✓
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              applyCoupon(cp.code);
                              setCouponCodeInput(cp.code);
                              setShowCouponsModal(false);
                            }}
                            disabled={!isEligible}
                            className={`px-4 py-1.5 rounded text-xs font-extrabold uppercase tracking-wider transition cursor-pointer shadow-2xs ${
                              isEligible
                                ? 'bg-[#4B1D3F] text-white hover:bg-[#3B1532] border border-[#4B1D3F]/30'
                                : 'bg-[#F3EEF8] text-[#2A1A26]/65 cursor-not-allowed'
                            }`}
                          >
                            APPLY
                          </button>
                        )}
                      </div>

                      <p className="text-xs text-[#2A1A26]/75 font-medium">
                        {cp.description || (cp.minOrderValue > 0
                          ? `Save ${discountLabel} on orders above ₹${cp.minOrderValue.toLocaleString('en-IN')}`
                          : `Save ${discountLabel} on your entire cart with no minimum order limit.`)}
                      </p>

                      {!isEligible && (
                        <p className="text-[11px] text-rose-700 font-bold bg-[#F3EEF8] p-1.5 rounded-lg border border-[#4B1D3F]/15">
                          Add ₹{(cp.minOrderValue - cartSubtotal).toLocaleString('en-IN')} more to unlock this coupon.
                        </p>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="text-center text-xs text-[#2A1A26]/65 py-8">No promo coupons available right now.</p>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-white border-t border-[#4B1D3F]/20 flex items-center justify-between">
              <p className="text-xs text-[#2A1A26]/65">
                Coupons applied at checkout are non-transferable.
              </p>
              <button
                type="button"
                onClick={() => setShowCouponsModal(false)}
                className="px-5 py-2 bg-[#F3EEF8] hover:bg-[#F3EEF8] text-[#2A1A26] rounded font-bold text-xs uppercase cursor-pointer transition"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

// Internal icon component for tag
const TagIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2H2v10l10 10 10-10L12 2z"></path>
    <circle cx="7" cy="7" r="1.5"></circle>
  </svg>
);
