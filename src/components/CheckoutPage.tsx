import React, { useState, useEffect, useRef } from 'react';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import { DeliveryAddress, PaymentMethodType, Order } from '../types';
import { COLLECTIONS, saveDoc } from '../lib/dataStore';
import { getStoredUtmParams } from '../utils/utmTracker';
import { lockAndReserveCartStock, releaseStockLock, confirmStockDeduction } from '../utils/stockLock';
import { trackPurchaseEvent, markFirestoreQuotaExhausted, isQuotaExhausted } from '../utils/visitorTracker';
import { db } from '../lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import confetti from 'canvas-confetti';
import { sendWhatsAppOrderConfirmation } from '../utils/whatsappService';
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
  MessageCircle,
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
  const { addOrder, paymentSettings } = useAdmin();

  // 2-Step Progress Flow: 'details' (Step 1) | 'payment' (Step 2)
  const [checkoutStep, setCheckoutStep] = useState<'details' | 'payment'>('details');

  // Exit Intent Modal State
  const [showExitModal, setShowExitModal] = useState(false);
  const [exitModalShown, setExitModalShown] = useState(false);

  useEffect(() => {
    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 10 && !exitModalShown) {
        setShowExitModal(true);
        setExitModalShown(true);
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!exitModalShown) {
        setExitModalShown(true);
        setShowExitModal(true);
      }
    };

    document.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [exitModalShown]);

  // Form State
  const [address, setAddress] = useState<DeliveryAddress>({
    fullName: '',
    mobile: '',
    email: '',
    houseFlat: '',
    street: '',
    area: '',
    city: '',
    state: 'Delhi NCR',
    pincode: '',
  });

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [saveAddressOption, setSaveAddressOption] = useState(true);

  // Selected Payment Method Option: 'online' | 'cod'
  const [selectedPaymentOption, setSelectedPaymentOption] = useState<'online' | 'cod'>('online');
  const [showCodWarningModal, setShowCodWarningModal] = useState(false);

  // Gift Note State
  const [addGiftNote, setAddGiftNote] = useState(false);
  const [giftNoteText, setGiftNoteText] = useState('');

  // Location Auto-Detect State
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);

  // Pincode Lookup State
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const [availablePostOffices, setAvailablePostOffices] = useState<any[]>([]);
  const [pincodeError, setPincodeError] = useState('');

  // Coupon Input State inside checkout
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [showCouponsModal, setShowCouponsModal] = useState(false);

  // Processing state & error
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Derived Price & Savings Calculations
  const prepaidDiscount = selectedPaymentOption === 'online' ? 100 : 0;
  const finalCartTotal = Math.max(0, cartTotal - prepaidDiscount);

  const giftPackThreshold = 2999;
  const giftPackProgress = Math.min(100, Math.round((cartSubtotal / giftPackThreshold) * 100));
  const amountToGiftPack = Math.max(0, giftPackThreshold - cartSubtotal);

  const totalMRP = cart.reduce((acc, item) => {
    const itemPrice = typeof item.product?.price === 'number' ? item.product.price : ((item as any).price || 0);
    const origPrice = item.product?.originalPrice || (itemPrice > 0 ? Math.round(itemPrice * 1.35) : itemPrice);
    return acc + (origPrice * item.quantity);
  }, 0);

  const catalogDiscount = Math.max(0, totalMRP - cartSubtotal);
  const totalSavings = catalogDiscount + discountAmount + prepaidDiscount;

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
  const stockLockTokenRef = useRef<string | undefined>(undefined);

  const releaseReservedStockLock = () => {
    const lockToken = stockLockTokenRef.current;
    stockLockTokenRef.current = undefined;
    if (lockToken) void releaseStockLock(lockToken);
  };

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
        try {
          const res = await fetch(`https://api.postalpincode.in/pincode/${address.pincode}`);
          const data = await res.json();
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
          setAddress(prev => ({ ...prev, city: '', state: 'Delhi NCR', area: '' }));
          showToast('Invalid PIN Code!', 'error');
        } finally {
          setPincodeLoading(false);
        }
      };
      fetchPincodeDetails();
    } else {
      setAvailablePostOffices([]);
      setPincodeError('');
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

  // Fast Auto-Fill Demo Handler
  const handleExpressAutoFill = () => {
    setFirstName('Ananya');
    setLastName('Sharma');
    setAddress({
      fullName: 'Ananya Sharma',
      mobile: '9876543210',
      email: 'ananya@example.com',
      houseFlat: 'Flat 302, Palm Heights',
      street: 'MG Road, Near Central Mall',
      area: 'Connaught Place',
      city: 'New Delhi',
      state: 'Delhi NCR',
      pincode: '110001',
    });
    showToast('Express Fast Checkout Auto-Filled!', 'success');
  };

  const handleSaveAddressToDb = async (currentAddr: DeliveryAddress) => {
    try {
      const combinedFullName = `${firstName.trim()} ${lastName.trim()}`;
      const updatedAddr = { ...currentAddr, fullName: combinedFullName };

      if (user && !isQuotaExhausted()) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          await setDoc(userDocRef, {
            savedAddress: updatedAddr,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (err: any) {
          if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota')) {
            markFirestoreQuotaExhausted();
          }
        }
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
      setCheckoutStep('payment');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 100, behavior: 'smooth' });
    }
  };

  const handleCouponApply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCodeInput.trim()) return;
    const success = applyCoupon(couponCodeInput);
    if (success) {
      setCouponCodeInput('');
    }
  };

  // Finalize order placement after Razorpay payment
  const finalizeOrderPlacement = async (order: Order, paymentId: string) => {
    try {
      const finalizedOrder: Order = {
        ...order,
        paymentStatus: order.paymentStatus || 'Paid',
        paymentRef: paymentId || order.paymentRef || '',
      };

      // Persist the paid order before updating inventory or clearing the cart.
      await addOrder(finalizedOrder);
      await confirmStockDeduction(cart, stockLockTokenRef.current);
      stockLockTokenRef.current = undefined;

      // 2. Add order to ShopContext recent orders & local storage
      addRecentOrder(finalizedOrder);
      setConfirmedOrder(finalizedOrder);

      // 3. Store guest recovery identifiers & auto-save profile for future login sync
      try {
        const orderEmail = (finalizedOrder.customerEmail || address.email || '').toLowerCase().trim();
        const orderPhone = finalizedOrder.customerMobile || address.mobile || '';
        const orderName = finalizedOrder.customerName || address.fullName || '';

        if (orderEmail) {
          syncCustomerOrders(orderEmail);
          localStorage.setItem('sag_last_guest_email', orderEmail);

          const profileToSave = {
            fullName: orderName,
            phone: orderPhone,
            email: orderEmail,
            houseFlat: address.houseFlat,
            streetAddress: address.houseFlat || address.street,
            city: address.city,
            state: address.state,
            pincode: address.pincode,
          };

          localStorage.setItem(`sag_user_profile_${orderEmail}`, JSON.stringify(profileToSave));
          localStorage.setItem(`sag_user_profile_current`, JSON.stringify(profileToSave));

          // Auto-save customer record in the database so login later immediately syncs address & orders
          (async () => {
            try {
              const custDocRef = doc(db, 'customers', orderEmail);
              await setDoc(custDocRef, {
                name: orderName,
                email: orderEmail,
                phone: orderPhone,
                status: 'active',
                pincode: address.pincode || '',
                city: address.city || '',
                state: address.state || '',
                streetAddress: address.houseFlat || '',
                updatedAt: new Date().toISOString()
              }, { merge: true });
            } catch (fsErr) {}

          })();
        }
        if (orderPhone) {
          localStorage.setItem('sag_last_guest_phone', orderPhone);
        }
        if (orderName) {
          localStorage.setItem('sag_last_guest_name', orderName);
        }
      } catch {}

      // 4. Purchase event analytics
      try {
        trackPurchaseEvent(finalizedOrder.orderNumber, finalizedOrder.finalTotal);
      } catch (trackErr) {
        console.warn('Purchase track warning:', trackErr);
      }

      // 5. Clear bag and stop spinner
      clearCart();
      setIsProcessing(false);

      // 7. Confetti explosion
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#241D1B', '#9A6A3A', '#C7A77A', '#F1E8DF', '#0B3D2E'],
        zIndex: 9999
      });

      // 8. WhatsApp confirmation
      sendWhatsAppOrderConfirmation(finalizedOrder);

      // 9. Navigate to order success screen
      setActivePage('order-confirmation');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      showToast('Order submitted successfully! 🎉', 'success');
    } catch (err: any) {
      releaseReservedStockLock();
      setIsProcessing(false);
      setErrorMessage(err.message || 'Payment succeeded but order processing needs support. Contact us before retrying payment.');
      showToast('Order confirmation needs support. Please do not pay again.', 'error');
    }
  };

  // Helper to load Razorpay Checkout Script
  const loadRazorpaySDK = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) {
        return resolve(true);
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  // Final Order Submit via Razorpay Payment Gateway
  const handlePlacePrepaidOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!cart || cart.length === 0) {
      setErrorMessage('Your shopping bag is empty. Please add products before placing an order.');
      showToast('Your shopping bag is empty!', 'error');
      return;
    }

    if (finalCartTotal <= 0) {
      setErrorMessage('Invalid total order amount. Order total must be greater than ₹0.');
      showToast('Invalid order amount!', 'error');
      return;
    }

    if (!validateForm()) {
      setCheckoutStep('details');
      window.scrollTo({ top: 100, behavior: 'smooth' });
      return;
    }

    if (selectedPaymentOption === 'cod') {
      setShowCodWarningModal(true);
      return;
    }

    if (saveAddressOption) {
      handleSaveAddressToDb(address);
    }

    setIsProcessing(true);
    setErrorMessage('');

    // Reserve stock lock
    try {
      const stockCheck = await lockAndReserveCartStock(cart);
      if (!stockCheck.success) {
        setErrorMessage(stockCheck.errorMessage || 'Some items in your cart are out of stock.');
        setIsProcessing(false);
        showToast(stockCheck.errorMessage || 'Stock reservation failed', 'error');
        return;
      }
      stockLockTokenRef.current = stockCheck.lockToken;
    } catch (stockErr) {
      console.warn('Stock lock warning:', stockErr);
    }

    const combinedFullName = `${firstName.trim()} ${lastName.trim()}`;
    const completeAddress: DeliveryAddress = {
      ...address,
      fullName: combinedFullName,
    };

    const orderNum = 'SAG-' + Math.floor(100000 + Math.random() * 900000);
    const newOrder: Order = {
      orderNumber: orderNum,
      date: new Date().toISOString(),
      customerName: combinedFullName,
      customerEmail: address.email,
      customerMobile: address.mobile,
      items: cart,
      subtotal: cartSubtotal,
      shippingCharge: shippingFee,
      discountAmount: discountAmount + prepaidDiscount,
      couponCode: appliedCoupon ? appliedCoupon.code : undefined,
      finalTotal: finalCartTotal,
      deliveryAddress: completeAddress,
      paymentMethod: 'razorpay',
      paymentStatus: 'Unpaid',
      paymentRef: '',
      estimatedDeliveryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toDateString(),
      status: 'Processing',
    };

    // Retrieve Razorpay Key ID
    const envKey = (import.meta as any).env?.VITE_RAZORPAY_KEY_ID || '';
    const adminKey = paymentSettings.razorpayKeyIdPlaceholder || '';
    const localKey = localStorage.getItem('sag_razorpay_key_id') || '';
    const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const candidateKey = (adminKey || envKey || (isLocalHost ? localKey : '') || '').trim();

    if (!candidateKey) {
      releaseReservedStockLock();
      setIsProcessing(false);
      setErrorMessage('Razorpay Gateway Key is missing. Please enter your Live Razorpay Key ID in Admin Settings > Payment Gateway or configure VITE_RAZORPAY_KEY_ID.');
      showToast('Razorpay Gateway Key missing. Please set key in Admin Settings.', 'error');
      return;
    }

    // Load Razorpay SDK Script
    const sdkLoaded = await loadRazorpaySDK();
    if (!sdkLoaded || !(window as any).Razorpay) {
      releaseReservedStockLock();
      setIsProcessing(false);
      setErrorMessage('Unable to load Razorpay payment gateway script. Please check your network connection.');
      showToast('Razorpay SDK load failed', 'error');
      return;
    }

    try {
      const options = {
        key: candidateKey,
        amount: Math.round(finalCartTotal * 100),
        currency: 'INR',
        name: 'Suit Aura Girls',
        description: `Order #${orderNum} - Luxury Ethnic Wear`,
        image: '/suit-aura-logo.png',
        handler: async function (response: any) {
          if (response.razorpay_payment_id) {
            const verifiedOrder: Order = {
              ...newOrder,
              paymentStatus: 'Paid',
              paymentRef: response.razorpay_payment_id,
            };
            await finalizeOrderPlacement(verifiedOrder, response.razorpay_payment_id);
          } else {
            setIsProcessing(false);
            releaseReservedStockLock();
            setErrorMessage('Payment verification failed on Razorpay.');
            showToast('Payment verification failed', 'error');
          }
        },
        prefill: {
          name: combinedFullName,
          email: address.email || 'guest@suitauragirls.com',
          contact: address.mobile,
        },
        notes: {
          order_number: orderNum,
          customer_name: combinedFullName,
          customer_phone: address.mobile,
        },
        theme: {
          color: '#241D1B',
        },
        modal: {
          confirm_close: true,
          ondismiss: function () {
            releaseReservedStockLock();
            setIsProcessing(false);
            showToast('Payment was cancelled on Razorpay. Order was NOT placed.', 'info');
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', function (response: any) {
        releaseReservedStockLock();
        setIsProcessing(false);
        const reason = response.error?.description || 'Payment failed on Razorpay.';
        setErrorMessage(reason);
        showToast(`Payment failed: ${reason}`, 'error');
      });

      rzp.open();
    } catch (rzpErr: any) {
      console.error('Razorpay SDK modal launch error:', rzpErr);
      releaseReservedStockLock();
      setIsProcessing(false);
      setErrorMessage('Razorpay Gateway Error. Please verify your Razorpay Key ID in settings.');
      showToast('Razorpay Payment Gateway launch failed', 'error');
    }
  };

  // Helper for dynamic pincode COD unavailable reasons
  const getPincodeCodReason = (pincode: string) => {
    const cleanPin = pincode.replace(/\D/g, '') || '110001';
    const lastDigit = parseInt(cleanPin.slice(-1) || '0', 10);

    if (lastDigit === 0 || lastDigit === 1) {
      return `Due to heavy festive courier traffic and peak season dispatch limits, Cash on Delivery slots for Pincode ${cleanPin} are currently filled.`;
    } else if (lastDigit === 2 || lastDigit === 3) {
      return `Cash collection capacity for ${address.city || 'your area'} logistics hub is currently at maximum daily operational limit for Pincode ${cleanPin}.`;
    } else if (lastDigit === 4 || lastDigit === 5) {
      return `Doorstep cash collection verification protocols active in Pincode ${cleanPin}. COD slots are restricted for high-demand luxury items.`;
    } else if (lastDigit === 6 || lastDigit === 7) {
      return `Courier partner third-party COD dispatch slots for Pincode ${cleanPin} are fully booked for this week.`;
    } else {
      return `Festive surge restriction: Express Cash-On-Delivery routes for Pincode ${cleanPin} are currently closed.`;
    }
  };

  if (!cart || cart.length === 0) {
    return (
      <div className="min-h-[80vh] bg-[#FDFBF7] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-[#241D1B]/10 text-[#211C1A] rounded-full flex items-center justify-center mb-4">
          <ShoppingBag className="w-10 h-10" />
        </div>
        <h2 className="font-serif text-3xl font-bold text-[#211C1A] mb-2">
          Your Shopping Bag is Empty
        </h2>
        <p className="text-stone-600 max-w-md mb-6 text-sm">
          Explore our handcrafted ethnic couture collections and add your favorite suits to complete your purchase.
        </p>
        <button
          onClick={() => setActivePage('shop')}
          className="px-8 py-3.5 bg-[#241D1B] hover:bg-[#241D1B] text-[#211C1A] rounded-xl font-bold text-xs uppercase tracking-widest transition-all cursor-pointer shadow-md"
        >
          Explore Luxury Collection
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#3D0F1F] pb-6 sm:pb-8 font-sans text-left">
      
      {/* Top Header Bar */}
      <div className="sticky top-0 z-40 bg-[#FDFBF7] border-b border-[#B8935A]/30 py-3.5 px-4 sm:px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div>
              <h1 className="font-serif text-xl sm:text-2xl font-semibold text-[#3D0F1F] leading-none flex items-center gap-2">
                Suit Aura Girls <span className="font-sans text-[10px] sm:text-xs uppercase tracking-widest text-[#B8935A] font-semibold border-l border-[#B8935A]/40 pl-2">Checkout</span>
              </h1>
              <div className="flex items-center gap-2.5 text-[11px] text-stone-600 font-medium mt-1">
                <span className="flex items-center gap-1 text-emerald-800 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" /> 256-Bit Bank Grade SSL
                </span>
                <span className="hidden sm:inline text-stone-300">•</span>
                <span className="hidden sm:inline text-stone-700 font-semibold">⚡ Priority Dispatch Active</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setActivePage('cart')}
            className="w-10 h-10 bg-transparent hover:bg-[#FAF5EB] text-[#3D0F1F] flex items-center justify-center transition-colors cursor-pointer border border-[#B8935A]/35 shrink-0"
            title="Return to Bag"
          >
            <X className="w-5 h-5" />
          </button>

        </div>
      </div>

      {/* Progress Step Bar */}
      <div className="bg-[#FAF5EB] border-b border-[#B8935A]/20 py-2.5 px-4 sm:px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs font-bold tracking-wider">
            <button
              type="button"
              onClick={() => setCheckoutStep('details')}
              className={`flex items-center gap-1.5 cursor-pointer ${
                checkoutStep === 'details' ? 'text-[#3D0F1F] font-semibold border-b border-[#B8935A] pb-0.5' : 'text-[#3D0F1F]/45 hover:text-[#3D0F1F]'
              }`}
            >
              <span>1. Details</span>
            </button>
            <span className="text-stone-300">→</span>
            <button
              type="button"
              onClick={() => {
                if (validateForm()) setCheckoutStep('payment');
              }}
              className={`flex items-center gap-1.5 cursor-pointer ${
                checkoutStep === 'payment' ? 'text-[#3D0F1F] font-semibold border-b border-[#B8935A] pb-0.5' : 'text-[#3D0F1F]/45 hover:text-[#3D0F1F]'
              }`}
            >
              <span>2. Payment</span>
            </button>
          </div>

          <div className="text-xs font-bold text-[#211C1A]">
            {cart.reduce((a, c) => a + c.quantity, 0)} items • <span className="text-[#211C1A] font-serif font-extrabold">₹{finalCartTotal.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Checkout Step Form (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">

          {errorMessage && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs font-semibold flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <p className="font-bold">Checkout Notice</p>
                <p className="mt-0.5 text-rose-700">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* STEP 1: DETAILS VIEW */}
          {checkoutStep === 'details' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Express Fast Checkout Banner */}
              <div className="bg-[#3D0F1F] text-[#FAF5EB] p-4 sm:p-5 border border-[#B8935A]/35 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-[#DFBE65]">
                    EXPRESS FAST CHECKOUT
                  </span>
                  <p className="font-serif text-sm font-bold text-white mt-0.5">
                    Returning Customer or Demo Autofill?
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExpressAutoFill}
                  className="px-4 py-2 bg-[#B8935A] hover:bg-[#DFBE65] text-[#3D0F1F] font-semibold text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  <Zap className="w-3.5 h-3.5 fill-[#241D1B]" />
                  <span>Express Auto-Fill</span>
                </button>
              </div>

              {/* Contact Information Box */}
              <div className="bg-[#FAF5EB] border border-[#B8935A]/30 p-5 sm:p-7 space-y-4">
                <div className="border-b border-[#B8935A]/25 pb-3 flex items-center justify-between">
                  <h3 className="font-serif text-lg font-semibold text-[#3D0F1F] flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#F1E8DF] text-[#211C1A] border border-[#9A6A3A]/40 text-xs flex items-center justify-center font-bold">1</span>
                    Contact Information
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-[#211C1A] uppercase tracking-wider mb-1">
                      First Name *
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => handleFieldChangeDebounced('firstName', e.target.value)}
                      onBlur={handleFieldBlur}
                      placeholder="Ananya"
                      className="w-full px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-xs text-[#211C1A] focus:outline-none focus:ring-2 focus:ring-[#241D1B]/20 focus:border-[#241D1B]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#211C1A] uppercase tracking-wider mb-1">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => handleFieldChangeDebounced('lastName', e.target.value)}
                      onBlur={handleFieldBlur}
                      placeholder="Sharma"
                      className="w-full px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-xs text-[#211C1A] focus:outline-none focus:ring-2 focus:ring-[#241D1B]/20 focus:border-[#241D1B]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#211C1A] uppercase tracking-wider mb-1">
                    Mobile Number *
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-2.5 bg-stone-100 border border-stone-200 rounded-xl text-xs font-bold text-stone-700">
                      +91
                    </span>
                    <input
                      type="tel"
                      maxLength={10}
                      value={address.mobile}
                      onChange={(e) => handleFieldChangeDebounced('mobile', e.target.value)}
                      onBlur={handleFieldBlur}
                      placeholder="10-digit mobile number"
                      className="w-full px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-xs text-[#211C1A] focus:outline-none focus:ring-2 focus:ring-[#241D1B]/20 focus:border-[#241D1B]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#211C1A] uppercase tracking-wider mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={address.email}
                    onChange={(e) => handleFieldChangeDebounced('email', e.target.value)}
                    onBlur={handleFieldBlur}
                    placeholder="ananya@example.com"
                    className="w-full px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-xs text-[#211C1A] focus:outline-none focus:ring-2 focus:ring-[#241D1B]/20 focus:border-[#241D1B]"
                  />
                </div>
              </div>

              {/* Shipping Address Box */}
              <div className="bg-[#FFFDFC] border border-[#9A6A3A]/30 rounded-2xl p-5 sm:p-7 shadow-xs space-y-4">
                <div className="border-b border-[#9A6A3A]/20 pb-3 flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-serif text-lg font-bold text-[#211C1A] flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#F1E8DF] text-[#211C1A] border border-[#9A6A3A]/40 text-xs flex items-center justify-center font-bold">2</span>
                    Shipping Address
                  </h3>

                  <button
                    type="button"
                    onClick={handleAutoDetectLocation}
                    disabled={isDetectingLocation}
                    className="px-3 py-1.5 bg-[#F1E8DF] hover:bg-[#f3e9d7] text-[#211C1A] border border-[#9A6A3A]/40 rounded-xl font-bold text-[11px] transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    {isDetectingLocation ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                    ) : (
                      <MapPin className="w-3.5 h-3.5 text-black" />
                    )}
                    <span>Auto-Detect GPS</span>
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#211C1A] uppercase tracking-wider mb-1">
                    PIN Code *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      maxLength={6}
                      value={address.pincode}
                      onChange={(e) => setAddress(prev => ({ ...prev, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                      placeholder="6-digit PIN code (e.g. 110001)"
                      className="w-full px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-xs text-[#211C1A] focus:outline-none focus:ring-2 focus:ring-[#241D1B]/20 focus:border-[#241D1B]"
                    />
                    {pincodeLoading && (
                      <div className="absolute right-3 top-2.5">
                        <Loader2 className="w-4 h-4 animate-spin text-black" />
                      </div>
                    )}
                  </div>
                  {pincodeError && (
                    <p className="text-[11px] text-rose-700 font-bold mt-1">⚠️ {pincodeError}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#211C1A] uppercase tracking-wider mb-1">
                    Flat, House No., Building Name *
                  </label>
                  <input
                    type="text"
                    value={address.houseFlat}
                    onChange={(e) => setAddress(prev => ({ ...prev, houseFlat: e.target.value }))}
                    placeholder="Flat 302, Palm Heights"
                    className="w-full px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-xs text-[#211C1A] focus:outline-none focus:ring-2 focus:ring-[#241D1B]/20 focus:border-[#241D1B]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#211C1A] uppercase tracking-wider mb-1">
                    Street, Area, Landmark *
                  </label>
                  <input
                    type="text"
                    value={address.street}
                    onChange={(e) => setAddress(prev => ({ ...prev, street: e.target.value, area: e.target.value }))}
                    placeholder="MG Road, Near Central Mall"
                    className="w-full px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-xs text-[#211C1A] focus:outline-none focus:ring-2 focus:ring-[#241D1B]/20 focus:border-[#241D1B]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-[#211C1A] uppercase tracking-wider mb-1">
                      City / District *
                    </label>
                    <input
                      type="text"
                      value={address.city}
                      onChange={(e) => setAddress(prev => ({ ...prev, city: e.target.value }))}
                      placeholder="New Delhi"
                      className="w-full px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-xs text-[#211C1A] focus:outline-none focus:ring-2 focus:ring-[#241D1B]/20 focus:border-[#241D1B]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#211C1A] uppercase tracking-wider mb-1">
                      State *
                    </label>
                    <select
                      value={address.state}
                      onChange={(e) => setAddress(prev => ({ ...prev, state: e.target.value }))}
                      className="w-full px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-xs text-[#211C1A] focus:outline-none focus:ring-2 focus:ring-[#241D1B]/20 focus:border-[#241D1B]"
                    >
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
                    className="w-4 h-4 accent-[#211C1A] rounded cursor-pointer"
                  />
                  <label htmlFor="saveAddr" className="text-xs text-stone-700 cursor-pointer">
                    Save this address to my account for future orders
                  </label>
                </div>

              </div>

              {/* Proceed to Payment Step Button */}
              <button
                type="button"
                onClick={handleProceedToPaymentStep}
                className="w-full py-4 bg-[#241D1B] hover:bg-[#241D1B] text-[#211C1A] rounded-2xl font-bold text-xs uppercase tracking-widest transition-all cursor-pointer shadow-md flex items-center justify-center gap-2 group"
              >
                <span>PROCEED TO SECURE PAYMENT</span>
                <ArrowRight className="w-4 h-4 text-black group-hover:translate-x-1 transition-transform" />
              </button>

            </div>
          )}

          {/* STEP 2: PAYMENT VIEW */}
          {checkoutStep === 'payment' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Back to Details Button */}
              <button
                type="button"
                onClick={() => setCheckoutStep('details')}
                className="text-xs font-bold text-[#211C1A] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Delivery Details</span>
              </button>

              {/* Delivery Address Summary Card */}
              <div className="bg-[#FFFDFC] border border-[#9A6A3A]/30 rounded-2xl p-4 sm:p-5 shadow-xs text-xs space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                  DELIVERING TO:
                </span>
                <p className="font-bold text-[#211C1A] text-sm">
                  {firstName} {lastName} • {address.mobile}
                </p>
                <p className="text-stone-600 leading-relaxed">
                  {address.houseFlat}, {address.street}, {address.city}, {address.state} - {address.pincode}
                </p>
              </div>

              {/* Select Payment Method Container */}
              <div className="bg-[#FFFDFC] border border-[#9A6A3A]/30 rounded-2xl p-5 sm:p-7 shadow-xs space-y-5">
                
                <div className="border-b border-[#9A6A3A]/20 pb-3 flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-serif text-lg font-bold text-[#211C1A] flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-black" />
                    Select Payment Method
                  </h3>
                  <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200/60 rounded-full font-bold text-[10px] flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> 100% Encrypted
                  </span>
                </div>

                {/* Option 1: Online Payment (UPI, Cards, NetBanking) */}
                <div
                  onClick={() => setSelectedPaymentOption('online')}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer relative ${
                    selectedPaymentOption === 'online'
                      ? 'border-[#241D1B] bg-[#F1E8DF]/80 ring-2 ring-[#241D1B]/20'
                      : 'border-stone-200 bg-white hover:border-[#9A6A3A]/40'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="paymentOption"
                      checked={selectedPaymentOption === 'online'}
                      onChange={() => setSelectedPaymentOption('online')}
                      className="mt-1 accent-[#211C1A] w-4 h-4 cursor-pointer"
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="font-bold text-[#211C1A] text-sm">
                          Online Payment (UPI, Cards, NetBanking)
                        </span>
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 text-[10px] font-extrabold rounded-full flex items-center gap-1">
                          <Zap className="w-3 h-3 fill-emerald-700" /> FAST & RECOMMENDED
                        </span>
                      </div>
                      <p className="text-xs text-stone-600 leading-relaxed">
                        Instant UPI (GPay, PhonePe, Paytm), Credit/Debit Cards, Net Banking & Wallet payments.
                      </p>

                      <div className="pt-2 flex flex-wrap items-center gap-2 text-[10px] font-bold">
                        <span className="px-2 py-0.5 bg-[#241D1B] text-[#211C1A] rounded">
                          Priority Express Dispatch (within 24 hours)
                        </span>
                        <span className="px-2 py-0.5 bg-[#F1E8DF] text-[#211C1A] border border-[#9A6A3A]/30 rounded">
                          Instant Confirmation
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Option 2: Cash On Delivery (COD) */}
                <div
                  onClick={() => setSelectedPaymentOption('cod')}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer relative ${
                    selectedPaymentOption === 'cod'
                      ? 'border-amber-600 bg-amber-50/40 ring-2 ring-amber-500/20'
                      : 'border-stone-200 bg-white hover:border-[#9A6A3A]/40'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="paymentOption"
                      checked={selectedPaymentOption === 'cod'}
                      onChange={() => setSelectedPaymentOption('cod')}
                      className="mt-1 accent-amber-700 w-4 h-4 cursor-pointer"
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="font-bold text-stone-800 text-sm">
                          Cash On Delivery (COD)
                        </span>
                        <span className="px-2 py-0.5 bg-amber-100 text-black border border-amber-300 text-[10px] font-extrabold rounded-full flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-black" /> PINCODE CHECK NEEDED
                        </span>
                      </div>
                      <p className="text-xs text-stone-600 leading-relaxed">
                        Pay cash at doorstep upon delivery. Subject to courier slot availability for Pincode {address.pincode || '110001'}.
                      </p>
                    </div>
                  </div>
                </div>

                {/* DYNAMIC COD CURRENTLY UNAVAILABLE BOX (triggers when COD selected) */}
                {selectedPaymentOption === 'cod' && (
                  <div className="p-4 sm:p-5 bg-[#FFFDFC] border-2 border-amber-500/60 rounded-2xl space-y-3.5 animate-in fade-in slide-in-from-top-2 duration-200 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-amber-100 text-black rounded-xl shrink-0 mt-0.5 border border-amber-300">
                        <AlertCircle className="w-5 h-5 text-black" />
                      </div>
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-[#211C1A] text-xs uppercase tracking-wider">
                            COD Currently Unavailable
                          </h4>
                          <span className="px-2 py-0.5 bg-amber-100 text-black font-mono text-[10px] font-bold rounded border border-amber-300">
                            PINCODE: {address.pincode || '380054'}
                          </span>
                        </div>
                        <p className="text-xs text-stone-700 leading-relaxed font-medium pt-1">
                          {getPincodeCodReason(address.pincode)}
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[#9A6A3A]/25 space-y-2.5">
                      <p className="text-xs text-[#211C1A] font-bold flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-black shrink-0" />
                        <span>Pay Online via UPI or Cards for FREE Shipping + Priority Dispatch!</span>
                      </p>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPaymentOption('online');
                          showToast('Switched to Online Payment! Priority dispatch activated.', 'success');
                        }}
                        className="w-full p-3.5 bg-[#241D1B] hover:bg-[#241D1B] text-[#211C1A] rounded-xl font-bold text-xs transition-all cursor-pointer shadow-md flex items-center justify-between gap-3 text-left group border border-[#9A6A3A]/40"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-[#C7A77A]/20 text-black flex items-center justify-center shrink-0 border border-[#C7A77A]/40">
                            <Zap className="w-4 h-4 fill-black" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-white text-xs leading-snug">Switch to Online Payment (UPI / Cards)</p>
                            <p className="text-[11px] text-black font-semibold leading-tight mt-0.5">Get ₹100 Extra Discount + Priority Dispatch</p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-black group-hover:translate-x-1 transition-transform shrink-0" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Festive Gift Note Checkbox */}
                <div className="pt-2 border-t border-[#9A6A3A]/15 space-y-3">
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#211C1A] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addGiftNote}
                      onChange={(e) => setAddGiftNote(e.target.checked)}
                      className="w-4 h-4 accent-[#211C1A] rounded cursor-pointer"
                    />
                    <Gift className="w-4 h-4 text-black" />
                    <span>Add Complimentary Festive Gift Note</span>
                  </label>

                  {addGiftNote && (
                    <textarea
                      rows={2}
                      value={giftNoteText}
                      onChange={(e) => setGiftNoteText(e.target.value)}
                      placeholder="Enter personal greeting message for the recipient..."
                      className="w-full p-3 bg-white border border-stone-200 rounded-xl text-xs text-[#211C1A] focus:outline-none focus:ring-2 focus:ring-[#241D1B]/20"
                    />
                  )}
                </div>

                {/* PAY NOW CTA BUTTON */}
                <button
                  type="button"
                  onClick={handlePlacePrepaidOrder}
                  disabled={isProcessing}
                  className="w-full py-4 bg-[#241D1B] hover:bg-[#241D1B] text-[#211C1A] rounded-2xl font-bold text-sm uppercase tracking-wider transition-all cursor-pointer shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group border border-[#9A6A3A]/30"
                >
                  {isProcessing ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-black" />
                      <span>Connecting to Razorpay Gateway...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-black" />
                      <span>PAY NOW • ₹{finalCartTotal.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                </button>

                <p className="text-center text-[11px] text-stone-500">
                  🔒 256-Bit Encrypted Razorpay Checkout • Order saved ONLY after successful payment
                </p>

              </div>

            </div>
          )}

        </div>

        {/* Right Column: Order Summary & Karigari Guarantee (5 Cols) */}
        <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24">
          
          <div className="bg-[#FFFDFC] border border-[#9A6A3A]/30 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
            
            <div className="border-b border-[#9A6A3A]/20 pb-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-serif text-base sm:text-lg font-bold text-[#211C1A] tracking-tight">
                  Order Summary
                </h3>
                <p className="text-[11px] font-sans text-stone-500 font-medium">
                  {cart.reduce((a, c) => a + c.quantity, 0)} {cart.reduce((a, c) => a + c.quantity, 0) === 1 ? 'Item' : 'Items'} in Bag
                </p>
              </div>
              <span className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200/80 rounded-full font-bold text-[10px] sm:text-[11px] uppercase tracking-wider whitespace-nowrap shrink-0">
                Free Delivery
              </span>
            </div>

            {/* Cart Items List */}
            <div className="space-y-3.5 max-h-96 overflow-y-auto pr-1">
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
                const origPrice = item.product?.originalPrice || (itemPrice > 0 ? Math.round(itemPrice * 1.35) : itemPrice);
                const categoryName = item.product?.category || 'Royal Ethnic Couture';

                return (
                  <div key={`${item.id}-${itemSize}-${itemColor}`} className="p-3.5 bg-[#F1E8DF]/90 border border-[#9A6A3A]/30 rounded-2xl flex items-start gap-3.5 shadow-2xs">
                    <img
                      src={getCleanImageUrl(itemImg)}
                      alt={itemTitle}
                      className="w-20 h-28 sm:w-22 sm:h-30 object-cover rounded-xl border border-[#9A6A3A]/25 shrink-0 shadow-xs"
                    />
                    <div className="flex-1 min-w-0 text-xs space-y-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="inline-block px-2 py-0.5 bg-[#241D1B] text-[#211C1A] text-[9px] font-extrabold uppercase tracking-widest rounded-md">
                          {categoryName}
                        </span>
                        <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          In Stock
                        </span>
                      </div>
                      
                      <h4 className="font-serif font-bold text-[#211C1A] text-sm leading-snug line-clamp-2">
                        {itemTitle}
                      </h4>

                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] pt-0.5">
                        <span className="px-2 py-0.5 bg-white border border-stone-200 text-[#211C1A] font-bold rounded-md shadow-2xs">
                          Size: <strong className="text-[#211C1A]">{itemSize}</strong>
                        </span>
                        {itemColor && (
                          <span className="px-2 py-0.5 bg-white border border-stone-200 text-[#211C1A] font-bold rounded-md shadow-2xs">
                            Color: <strong className="text-[#211C1A]">{itemColor}</strong>
                          </span>
                        )}
                        <span className="px-2 py-0.5 bg-white border border-stone-200 text-[#211C1A] font-bold rounded-md shadow-2xs">
                          Qty: <strong className="text-[#211C1A]">{item.quantity}</strong>
                        </span>
                      </div>

                      <div className="pt-1 flex items-baseline justify-between gap-2">
                        <div className="flex items-baseline gap-2">
                          <span className="font-serif font-extrabold text-[#211C1A] text-base">
                            ₹{(itemPrice * item.quantity).toLocaleString('en-IN')}
                          </span>
                          {origPrice > itemPrice && (
                            <span className="text-stone-400 line-through text-xs font-mono">
                              ₹{(origPrice * item.quantity).toLocaleString('en-IN')}
                            </span>
                          )}
                        </div>
                        {origPrice > itemPrice && (
                          <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-100/70 px-1.5 py-0.5 rounded">
                            {Math.round(((origPrice - itemPrice) / origPrice) * 100)}% OFF
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Royal Gift Packaging Perk Progress Bar */}
            <div className="p-4 bg-[#F1E8DF] rounded-2xl border border-[#9A6A3A]/25 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-[#211C1A]">
                <span className="flex items-center gap-1.5">
                  <Gift className="w-4 h-4 text-black" />
                  Royal Gift Packaging Perk
                </span>
                <span className="text-[10px] text-stone-500 font-mono">
                  {amountToGiftPack > 0 ? `Add ₹${amountToGiftPack.toLocaleString('en-IN')} more` : 'Unlocked!'}
                </span>
              </div>

              <div className="w-full h-2 bg-stone-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-[#241D1B] to-[#9A6A3A] transition-all duration-500"
                  style={{ width: `${giftPackProgress}%` }}
                />
              </div>

              <p className="text-[11px] text-stone-600 leading-tight">
                {amountToGiftPack > 0 
                  ? `Orders above ₹2,999 unlock complimentary Royal Satin Gift Box & Calligraphy Greeting Card.`
                  : `✨ Congratulations! Your order includes a complimentary Royal Satin Gift Box & Greeting Card.`}
              </p>
            </div>

            {/* Promo Code / Coupon Section */}
            <div className="space-y-2.5 pt-2 border-t border-[#9A6A3A]/20">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-stone-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-black" />
                  Apply Promo Code
                </p>
                <button
                  type="button"
                  onClick={() => setShowCouponsModal(true)}
                  className="text-xs font-bold text-black hover:text-[#211C1A] flex items-center gap-1 transition cursor-pointer underline underline-offset-2"
                >
                  <span>View All Coupons ({coupons ? coupons.length : 0})</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Applied Coupon Info or Manual Input Form */}
              {appliedCoupon ? (
                <div className="p-3 bg-[#F1E8DF]/50 border border-dashed border-[#9A6A3A]/40 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Tag className="w-4 h-4 text-black shrink-0" />
                    <div className="min-w-0">
                      <p className="font-bold text-[#211C1A] text-xs">
                        Coupon <span className="font-mono font-bold bg-[#241D1B] text-[#211C1A] px-1.5 py-0.5 rounded-md text-[10px] ml-1 uppercase">{appliedCoupon.code}</span> Applied
                      </p>
                      <p className="text-[10px] text-stone-500 font-medium mt-0.5">
                        Saved additional ₹{discountAmount.toLocaleString('en-IN')} on this order
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeCoupon}
                    className="text-xs font-bold text-[#211C1A] uppercase tracking-wider underline underline-offset-2 hover:text-black transition cursor-pointer shrink-0 ml-3"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <form onSubmit={handleCouponApply} className="flex gap-2">
                  <input
                    type="text"
                    value={couponCodeInput}
                    onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                    placeholder="Enter coupon code"
                    className="flex-1 px-3 py-2 bg-white border border-[#9A6A3A]/30 rounded-xl text-xs font-mono font-bold text-[#211C1A] uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-[#241D1B] placeholder:font-sans placeholder:font-normal placeholder:text-stone-400 placeholder:normal-case"
                  />
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[#241D1B] text-[#211C1A] hover:bg-[#241D1B] rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer shadow-2xs transition active:scale-95 border border-[#9A6A3A]/30"
                  >
                    Apply
                  </button>
                </form>
              )}
            </div>

            {/* Official High-End Price Breakdown */}
            <div className="pt-3 border-t border-[#9A6A3A]/25 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-stone-500 uppercase tracking-widest">
                  Price Details ({cart.reduce((a, c) => a + c.quantity, 0)} {cart.reduce((a, c) => a + c.quantity, 0) === 1 ? 'Item' : 'Items'})
                </span>
              </div>

              <div className="space-y-2.5 py-1">
                {/* Total Item MRP */}
                <div className="flex justify-between items-center text-stone-600">
                  <span>Total MRP</span>
                  <span className="font-mono text-stone-800 font-medium">₹{totalMRP.toLocaleString('en-IN')}</span>
                </div>

                {/* Catalog Savings */}
                {catalogDiscount > 0 && (
                  <div className="flex justify-between items-center text-stone-600">
                    <span>Discount on MRP</span>
                    <span className="font-mono font-bold text-emerald-700">-₹{catalogDiscount.toLocaleString('en-IN')}</span>
                  </div>
                )}

                {/* Bag Subtotal */}
                <div className="flex justify-between items-center text-[#211C1A] font-semibold pt-1 border-t border-[#9A6A3A]/15">
                  <span>Subtotal</span>
                  <span className="font-mono font-bold text-[#211C1A]">₹{cartSubtotal.toLocaleString('en-IN')}</span>
                </div>

                {/* Express Delivery */}
                <div className="flex justify-between items-center text-stone-600">
                  <span>Delivery Charges</span>
                  <span className="font-semibold text-emerald-700">
                    FREE <span className="text-stone-400 line-through text-[10px] font-normal font-mono ml-1">₹199</span>
                  </span>
                </div>

                {/* Coupon Savings */}
                {discountAmount > 0 && (
                  <div className="flex justify-between items-center text-stone-600">
                    <span>Coupon Discount ({appliedCoupon?.code})</span>
                    <span className="font-mono font-bold text-emerald-700">-₹{discountAmount.toLocaleString('en-IN')}</span>
                  </div>
                )}

                {/* Online Payment Discount */}
                {prepaidDiscount > 0 && (
                  <div className="flex justify-between items-center text-stone-600">
                    <span>Online Prepayment Discount</span>
                    <span className="font-mono font-bold text-emerald-700">-₹{prepaidDiscount.toLocaleString('en-IN')}</span>
                  </div>
                )}
              </div>

              {/* Total Savings Callout Banner */}
              {totalSavings > 0 && (
                <div className="p-3 bg-emerald-50/60 border border-dashed border-emerald-600/20 rounded-xl flex items-center justify-between text-xs">
                  <span className="text-stone-600 font-medium flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    Total Savings
                  </span>
                  <span className="font-mono font-bold text-emerald-800">
                    ₹{totalSavings.toLocaleString('en-IN')}
                  </span>
                </div>
              )}

              {/* Grand Payable Total */}
              <div className="pt-3.5 border-t border-[#241D1B]/30 flex justify-between items-baseline text-[#211C1A]">
                <div>
                  <span className="font-serif font-bold text-sm block text-[#211C1A] tracking-wide">Grand Payable Total</span>
                  <span className="text-[10px] text-stone-400 font-sans">Inclusive of all GST, taxes & express shipping</span>
                </div>
                <span className="font-serif font-bold text-2xl sm:text-3xl text-[#211C1A]">
                  ₹{finalCartTotal.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

          </div>

          {/* Suit Aura Girls Karigari Guarantee Card */}
          <div className="bg-[#FFFDFC] border border-[#9A6A3A]/35 rounded-2xl p-5 text-xs space-y-4 shadow-xs text-left">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#241D1B] text-[#211C1A] flex items-center justify-center shrink-0 border border-[#9A6A3A]/30">
                <Award className="w-5 h-5 text-black" />
              </div>
              <div>
                <h4 className="font-serif font-bold text-[#211C1A] text-base leading-tight">
                  Suit Aura Girls • Karigari Guarantee
                </h4>
                <p className="text-[10px] text-black font-extrabold uppercase tracking-widest mt-0.5">
                  Authentic Artisanal Heritage
                </p>
              </div>
            </div>

            <div className="h-0.5 bg-[#9A6A3A]/20 rounded-full" />

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#241D1B]/10 text-[#211C1A] flex items-center justify-center shrink-0 mt-0.5 font-bold">
                  <Sparkles className="w-3.5 h-3.5 text-black" />
                </div>
                <div>
                  <p className="font-bold text-[#211C1A] text-xs">100% Handcrafted Couture</p>
                  <p className="text-[11px] text-stone-500">Pure cotton, authentic gota patti & hand-block prints</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#241D1B]/10 text-[#211C1A] flex items-center justify-center shrink-0 mt-0.5 font-bold">
                  <Scissors className="w-3.5 h-3.5 text-black" />
                </div>
                <div>
                  <p className="font-bold text-[#211C1A] text-xs">Free Custom Stitching & Fit Assistance</p>
                  <p className="text-[11px] text-stone-500">Personal size alteration & custom fit support from master karigars</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#241D1B]/10 text-[#211C1A] flex items-center justify-center shrink-0 mt-0.5 font-bold">
                  <RotateCcw className="w-3.5 h-3.5 text-black" />
                </div>
                <div>
                  <p className="font-bold text-[#211C1A] text-xs">Hassle-Free 7-Day Easy Exchange</p>
                  <p className="text-[11px] text-stone-500">Direct WhatsApp pickup & replacement support</p>
                </div>
              </div>
            </div>
          </div>

          {/* Need Order or Size Help? Concierge Box */}
          <div className="bg-[#241D1B] text-[#211C1A] rounded-2xl p-4 flex items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#C7A77A]/20 text-black flex items-center justify-center shrink-0">
                <MessageCircle className="w-4 h-4" />
              </div>
              <div className="text-xs">
                <p className="font-bold">Need order or size help?</p>
                <p className="text-[10px] text-stone-300">Live styling assistance available</p>
              </div>
            </div>

            <a
              href={createSupportWhatsAppUrl('Hi Suit Aura Girls, I need help with my order checkout.')}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 bg-[#F1E8DF] text-[#211C1A] hover:bg-white rounded-xl font-bold text-[11px] uppercase tracking-wider transition-all cursor-pointer shrink-0"
            >
              Chat Concierge
            </a>
          </div>

        </div>

      </div>

      {/* COD Unavailable Popup Modal */}
      {showCodWarningModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#FFFDFC] border-2 border-[#9A6A3A]/50 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 relative text-left">
            <button
              type="button"
              onClick={() => setShowCodWarningModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 pr-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-black flex items-center justify-center shrink-0 border border-amber-300">
                <AlertCircle className="w-6 h-6 text-black" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-lg text-[#211C1A]">
                  COD Currently Restricted
                </h3>
                <span className="px-2 py-0.5 bg-amber-100 text-black font-mono text-[10px] font-bold rounded border border-amber-300">
                  PINCODE: {address.pincode || '380054'}
                </span>
              </div>
            </div>

            <p className="text-xs text-stone-700 leading-relaxed font-medium bg-[#F1E8DF] p-3.5 rounded-2xl border border-[#9A6A3A]/20">
              {getPincodeCodReason(address.pincode)}
            </p>

            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5 text-emerald-800">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Pay Online & Get Priority Dispatch!</span>
              </p>
              <p className="text-[11px] text-emerald-800/90 leading-tight">
                Enjoy ₹100 extra savings + 24-hour priority dispatch with 256-Bit SSL protection.
              </p>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowCodWarningModal(false);
                  setSelectedPaymentOption('online');
                  showToast('Switched to Online Payment! Priority dispatch activated.', 'success');
                }}
                className="w-full py-3.5 bg-[#241D1B] hover:bg-[#241D1B] text-[#211C1A] rounded-2xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md flex items-center justify-center gap-2 border border-[#9A6A3A]/40"
              >
                <Zap className="w-4 h-4 text-black fill-black" />
                <span>Switch to UPI / Online Payment</span>
              </button>

              <button
                type="button"
                onClick={() => setShowCodWarningModal(false)}
                className="w-full py-2 text-stone-500 hover:text-stone-800 font-bold text-xs transition-colors cursor-pointer"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* All Available Coupons Modal / Drawer */}
      {showCouponsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 transition-all animate-fadeIn">
          <div className="bg-[#FFFDFC] border border-[#9A6A3A]/40 rounded-3xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-scaleUp">
            
            {/* Modal Header */}
            <div className="p-5 bg-[#241D1B] text-[#211C1A] flex items-center justify-between border-b border-[#9A6A3A]/30">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#F1E8DF] flex items-center gap-2">
                  <Tag className="w-5 h-5 text-black" />
                  <span>Available Promo Coupons</span>
                </h3>
                <p className="text-[11px] text-black font-medium mt-0.5">
                  Select a coupon to apply directly to your order
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCouponsModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-[#F1E8DF] flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Coupons List */}
            <div className="p-5 overflow-y-auto space-y-3.5 bg-[#F1E8DF]/50 flex-1">
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
                      className={`p-4 rounded-2xl border transition-all space-y-2.5 ${
                        isApplied
                          ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/30 shadow-md'
                          : 'bg-white border-[#9A6A3A]/30 hover:border-[#241D1B] shadow-xs'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-extrabold text-[#211C1A] text-sm bg-[#F1E8DF] px-3 py-1 rounded-lg border border-[#9A6A3A]/40 tracking-wider">
                            {cp.code}
                          </span>
                          <span className="text-xs font-extrabold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
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
                            className={`px-4 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition cursor-pointer shadow-2xs ${
                              isEligible
                                ? 'bg-[#241D1B] text-[#211C1A] hover:bg-[#241D1B] border border-[#9A6A3A]/30'
                                : 'bg-stone-200 text-stone-500 cursor-not-allowed'
                            }`}
                          >
                            APPLY
                          </button>
                        )}
                      </div>

                      <p className="text-xs text-stone-600 font-medium">
                        {cp.description || (cp.minOrderValue > 0
                          ? `Save ${discountLabel} on orders above ₹${cp.minOrderValue.toLocaleString('en-IN')}`
                          : `Save ${discountLabel} on your entire cart with no minimum order limit.`)}
                      </p>

                      {!isEligible && (
                        <p className="text-[11px] text-rose-700 font-bold bg-rose-50 p-1.5 rounded-lg border border-rose-200">
                          Add ₹{(cp.minOrderValue - cartSubtotal).toLocaleString('en-IN')} more to unlock this coupon.
                        </p>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="text-center text-xs text-stone-500 py-8">No promo coupons available right now.</p>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-white border-t border-[#9A6A3A]/20 flex items-center justify-between">
              <p className="text-xs text-stone-500">
                Coupons applied at checkout are non-transferable.
              </p>
              <button
                type="button"
                onClick={() => setShowCouponsModal(false)}
                className="px-5 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl font-bold text-xs uppercase cursor-pointer transition"
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
