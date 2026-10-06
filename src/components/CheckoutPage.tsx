import { lineImage } from '../utils/lineImage';
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

import { AlertCircle, ArrowLeft, Check, ChevronDown, Gift, Info, Loader2, Lock, MapPin, Tag, Truck, X } from 'lucide-react';
import { getCleanImageUrl } from '../utils/imageHelper';
import { createSupportWhatsAppUrl } from '../utils/storeContact';
import { BagIcon } from './BrandIcons';
import { Assurance } from './Assurance';
import { CouponError, PriceDetails, useCouponApply } from './CartContents';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 
  'Delhi NCR', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 
  'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 
  'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
];

export type CheckoutField = 'firstName' | 'lastName' | 'mobile' | 'email' | 'houseFlat' | 'street' | 'city' | 'state' | 'pincode';

/**
 * Display only: every address-step problem, in the same order, with the same conditions and the same messages
 * as validateForm() inside the page (which stays the one gate for moving forward). The first entry is always
 * the message validateForm() puts in the banner. Used to mark the field and to focus it after a failed Continue.
 */
export const getCheckoutFieldErrors = (values: { firstName: string; lastName: string; address: DeliveryAddress; pincodeError: string }): Array<{ field: CheckoutField; message: string }> => {
  const { firstName, lastName, address, pincodeError } = values;
  const errors: Array<{ field: CheckoutField; message: string }> = [];
  if (!firstName.trim() || !lastName.trim()) errors.push({ field: !firstName.trim() ? 'firstName' : 'lastName', message: 'Please provide both your First and Last Name.' });
  if (!address.mobile.trim() || !/^[6-9]\d{9}$/.test(address.mobile)) errors.push({ field: 'mobile', message: 'Please provide a valid 10-digit Indian mobile number.' });
  if (!address.email.trim() || !address.email.includes('@')) errors.push({ field: 'email', message: 'Please provide a valid email address.' });
  if (!address.houseFlat.trim()) errors.push({ field: 'houseFlat', message: 'Please enter your House/Flat/Apartment number.' });
  if (!address.street.trim() || !address.area.trim()) errors.push({ field: 'street', message: 'Please enter your Street and Area details.' });
  if (!address.city.trim()) errors.push({ field: 'city', message: 'Please enter your City.' });
  if (!address.state.trim()) errors.push({ field: 'state', message: 'Please choose your state.' });
  if (!address.pincode.trim() || address.pincode.length !== 6) errors.push({ field: 'pincode', message: 'Please enter a valid 6-digit Indian PIN code.' });
  if (pincodeError) errors.push({ field: 'pincode', message: pincodeError });
  return errors;
};

const FIELD_INPUT_ID: Record<CheckoutField, string> = {
  firstName: 'co-first-name', lastName: 'co-last-name', mobile: 'co-mobile', email: 'co-email',
  houseFlat: 'co-house', street: 'co-street', city: 'co-city', state: 'co-state', pincode: 'co-pincode',
};

// The fields in the order they appear on the screen (mobile comes before the name in this layout)
const FIELD_SCREEN_ORDER: CheckoutField[] = ['mobile', 'firstName', 'lastName', 'email', 'pincode', 'city', 'state', 'houseFlat', 'street'];

/** Display only: the same problems as getCheckoutFieldErrors(), one per field, in on-screen order. */
const inScreenOrder = (errors: Array<{ field: CheckoutField; message: string }>) =>
  errors
    .filter((entry, index) => errors.findIndex((other) => other.field === entry.field) === index)
    .sort((a, b) => FIELD_SCREEN_ORDER.indexOf(a.field) - FIELD_SCREEN_ORDER.indexOf(b.field));

/** Label above, field, then one line below: the error (with an icon) or the helper text. */
const Field: React.FC<{ id: string; label: string; error?: string; helper?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ id, label, error, helper, className = '', children }) => (
  <div className={className}>
    <label htmlFor={id} className="sag-label">{label}</label>
    {children}
    {error ? (
      <p id={`${id}-error`} role="alert" className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-[18px] font-medium text-danger">
        <AlertCircle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" /><span>{error}</span>
      </p>
    ) : helper ? (
      <p id={`${id}-help`} className="mt-1.5 text-[13px] leading-[18px] text-ink-muted">{helper}</p>
    ) : null}
  </div>
);

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
  // Display only: the reason a coupon was refused, shown under the coupon field
  const { apply: applyCouponCode, error: couponError, clearError: clearCouponError } = useCouponApply();

  // Display only: which fields may show their message (after blur, or all of them after a failed Continue),
  // and whether the order strip under the stepper is open on a phone.
  const [touched, setTouched] = useState<Partial<Record<CheckoutField, boolean>>>({});
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const touch = (field: CheckoutField) => setTouched((current) => (current[field] ? current : { ...current, [field]: true }));

  useEffect(() => {
    if (!showCouponsModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowCouponsModal(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showCouponsModal]);

  // Processing state & error
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  // Display only: true while the banner is showing an address-form problem (not a server or payment error),
  // so it can follow the form and disappear the moment every field is valid again.
  const [formErrorShown, setFormErrorShown] = useState(false);
  useEffect(() => {
    if (!formErrorShown) return;
    if (getCheckoutFieldErrors({ firstName, lastName, address, pincodeError }).length > 0) return;
    setFormErrorShown(false);
    setErrorMessage('');
  }, [formErrorShown, firstName, lastName, address, pincodeError]);

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
      // Show every field message and take the shopper to the first field on the screen that needs fixing
      setShowAllErrors(true);
      setFormErrorShown(true);
      const first = inScreenOrder(getCheckoutFieldErrors({ firstName, lastName, address, pincodeError }))[0];
      const target = first ? document.getElementById(FIELD_INPUT_ID[first.field]) : null;
      if (target) {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        target.focus({ preventScroll: true });
      } else {
        window.scrollTo({ top: 100, behavior: 'smooth' });
      }
    }
  };

  const goToStep = (step: 'details' | 'summary' | 'payment') => {
    if (step === 'details' || validateForm()) setCheckoutStep(step);
    else {
      setShowAllErrors(true);
      setFormErrorShown(true);
      setCheckoutStep('details');
    }
  };

  const handleCouponApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCodeInput.trim()) return;
    const success = await applyCouponCode(couponCodeInput);
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
    confetti({ particleCount: 120, spread: 70, origin: { y: 0.55 }, colors: ['#5B3FD1', '#F0A30A', '#FFE1D2', '#10B981'], zIndex: 10001 });
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
      setShowAllErrors(true);
      setFormErrorShown(true);
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
        theme: { color: '#5B3FD1' },
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
      <div className="min-h-[80vh] bg-page flex items-center justify-center p-4">
        <div className="sag-card w-full max-w-md p-6 text-center">
          {paymentReturn.state === 'checking' ? (
            <>
              <Loader2 className="mx-auto h-9 w-9 animate-spin text-brand" />
              <h2 className="mt-4 text-[17px] leading-6 font-semibold text-ink">Confirming your payment…</h2>
              <p className="mt-2 text-sm leading-5 text-ink-muted">Please keep this page open. This takes a few seconds.</p>
            </>
          ) : (
            <>
              <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${paymentReturn.state === 'pending' ? 'bg-sale-tint text-sale' : 'bg-danger-tint text-danger'}`}>
                {paymentReturn.state === 'pending' ? <Info className="h-6 w-6" /> : <AlertCircle className="h-6 w-6" />}
              </div>
              <h2 className="mt-4 text-[17px] leading-6 font-semibold text-ink">{paymentReturn.state === 'pending' ? 'Payment pending' : 'Payment not completed'}</h2>
              <p className="mt-2 text-sm leading-5 text-ink-muted">{paymentReturn.message}</p>
              <p className="mt-3 text-[13px] leading-[18px] text-ink-muted">Order number: <span className="font-semibold text-ink">{paymentReturn.orderNumber}</span></p>
              <div className="mt-5 flex flex-col gap-2.5">
                {paymentReturn.state === 'pending' && (
                  <button type="button" onClick={() => checkPaymentResult(paymentReturn.orderNumber, paymentReturn.token)} className="sag-btn-primary w-full">
                    Check payment status
                  </button>
                )}
                {paymentReturn.state === 'failed' && cart.length > 0 && (
                  <button type="button" onClick={() => { setPaymentReturn(null); setCheckoutStep('payment'); }} className="sag-btn-primary w-full">
                    Try payment again
                  </button>
                )}
                <button type="button" onClick={() => { setPaymentReturn(null); setActivePage(cart.length > 0 ? 'cart' : 'shop'); }} className="sag-btn-outline w-full">
                  {cart.length > 0 ? 'Back to bag' : 'Continue shopping'}
                </button>
                <a
                  href={createSupportWhatsAppUrl(`Hi Suit Aura Girls, I need help with the payment for order ${paymentReturn.orderNumber}.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-12 items-center justify-center gap-2 text-sm font-semibold text-ink"
                >
                  <WhatsAppIcon className="h-5 w-5" /> Contact support
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
      <div className="min-h-[70vh] bg-page flex flex-col items-center justify-center px-6 py-16 text-center">
        <span className="w-16 h-16 rounded-full bg-sunken text-ink flex items-center justify-center">
          <BagIcon className="w-7 h-7" />
        </span>
        <h1 className="mt-5 font-display text-[28px] leading-8 text-ink">Your bag is empty</h1>
        <p className="mt-2 max-w-sm text-sm leading-5 text-ink-muted">Add a style to your bag and come back here to check out.</p>
        <button onClick={() => setActivePage('shop')} className="mt-6 sag-btn-primary w-full max-w-xs">
          Start shopping
        </button>
      </div>
    );
  }

  // ---- Display helpers (no pricing or validation logic lives below this line) ----
  const rupees = (value: number) => `₹${value.toLocaleString('en-IN')}`;
  const itemCount = cart.reduce((a, c) => a + c.quantity, 0);
  const itemsText = `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;
  const fullNameText = `${firstName} ${lastName}`.trim();
  const stepIndex = ['details', 'summary', 'payment'].indexOf(checkoutStep);
  const goBack = () => {
    if (checkoutStep === 'payment') setCheckoutStep('summary');
    else if (checkoutStep === 'summary') setCheckoutStep('details');
    else setActivePage('cart');
  };
  const helpUrl = createSupportWhatsAppUrl('Hi Suit Aura Girls, I need help with my order checkout.');

  const fieldErrors = getCheckoutFieldErrors({ firstName, lastName, address, pincodeError });
  // The banner for an address-form problem follows the form: one field = its own message, several = a plain count
  const formProblems = formErrorShown ? inScreenOrder(fieldErrors) : [];
  const bannerTitle = formProblems.length > 1 ? `Please check ${formProblems.length} fields` : 'Please check';
  const bannerText = formProblems.length > 1
    ? 'Each one is marked in red below. Fix them to continue.'
    : formProblems.length === 1 ? formProblems[0].message : errorMessage;
  // Display only: the street box fills "area" too, so the two are often the same text; show it once
  const sameText = (a?: string, b?: string) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const addressLine = [address.houseFlat, address.street, sameText(address.area, address.street) ? '' : address.area, address.landmark, address.city, address.state]
    .map((part) => String(part || '').trim()).filter(Boolean).join(', ');
  const errFor = (field: CheckoutField) => (showAllErrors || touched[field] ? fieldErrors.find((entry) => entry.field === field)?.message || '' : '');
  const nameError = errFor('firstName') || errFor('lastName');
  const mobileError = errFor('mobile');
  const emailError = errFor('email');
  const pinError = pincodeError || errFor('pincode');
  const cityError = errFor('city');
  const stateError = errFor('state');
  const houseError = errFor('houseFlat');
  const streetError = errFor('street');
  const mobileValid = Boolean(touched.mobile) && /^[6-9]\d{9}$/.test(address.mobile);
  const pinFound = !pincodeLoading && !pincodeError && address.pincode.length === 6 && availablePostOffices.length > 0;

  const payDisabled = isProcessing || gateways === null || (!gateways.razorpay && !gateways.payu);
  const gatewayKnown = gateways !== null && (gateways.razorpay || gateways.payu);
  const gatewayName = gateway === 'payu' ? 'PayU' : 'Razorpay';
  // What the Razorpay window will really offer: the same admin switches razorpayDisplayConfig() reads
  const noMethodSwitch = !paymentSettings?.enableUpi && !paymentSettings?.enableCards && !paymentSettings?.enableNetBanking;
  const razorpayDetail = [
    noMethodSwitch || paymentSettings?.enableUpi ? 'Google Pay, PhonePe, Paytm, any UPI app' : '',
    noMethodSwitch || paymentSettings?.enableCards ? 'debit / credit cards' : '',
    noMethodSwitch || paymentSettings?.enableNetBanking ? 'net banking and wallets' : '',
  ].filter(Boolean).join(', ');
  const upiOnly = Boolean(paymentSettings?.enableUpi) && !paymentSettings?.enableCards && !paymentSettings?.enableNetBanking;
  const razorpayTitle = upiOnly ? 'Pay by UPI' : [
    noMethodSwitch || paymentSettings?.enableUpi ? 'UPI' : '',
    noMethodSwitch || paymentSettings?.enableCards ? 'cards' : '',
    noMethodSwitch || paymentSettings?.enableNetBanking ? 'net banking' : '',
  ].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' & $1');
  const paymentOptions = ([
    ['razorpay', razorpayTitle, upiOnly ? 'Google Pay, PhonePe, Paytm, BHIM or any UPI app, or scan the QR code' : razorpayDetail],
    ['payu', 'Pay with PayU', 'UPI, debit / credit cards and net banking on PayU\'s secure page'],
  ] as Array<[Gateway, string, string]>).filter(([id]) => gateways?.[id]);
  const payButtonContent = isProcessing ? (
    <>
      <Loader2 className="w-[18px] h-[18px] animate-spin shrink-0" />
      <span>{payStage === 'creating' ? 'Creating your order…' : gateway === 'payu' ? 'Taking you to PayU…' : 'Processing your payment…'}</span>
    </>
  ) : (
    <>
      <Lock className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
      <span className="sag-num">Pay {rupees(finalCartTotal)} securely</span>
    </>
  );


  // Compact bag lines: shown in the Review step, and inside the order summary on the other steps
  const itemLines = (
    <ul className="divide-y divide-line">
      {cart.map((item) => {
        const unit = Number(item.product?.price) || 0;
        const mrp = Math.max(unit, Number(item.product?.originalPrice) || unit);
        const off = mrp > unit ? Math.round(((mrp - unit) / mrp) * 100) : 0;
        const colour = item.selectedColor?.name && !['Default', 'Standard'].includes(item.selectedColor.name) ? item.selectedColor.name : '';
        return (
          <li key={`${item.id}-${item.selectedSize}-${colour}`} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <img src={getCleanImageUrl(lineImage(item), 200)} alt="" width={56} height={70} className="h-[70px] w-14 shrink-0 rounded-chip object-cover object-top bg-sunken" loading="lazy" />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-5 font-medium text-ink line-clamp-2">{item.product?.name}</p>
              {item.lookParentName && <p className="text-[13px] leading-[18px] text-ink-muted">Complete the look · with {item.lookParentName}</p>}
              <p className="text-[13px] leading-[18px] text-ink-muted">
                {item.selectedSize && !/free/i.test(item.selectedSize) ? `Size ${item.selectedSize}` : 'One size'}{colour ? ` · ${colour}` : ''} · Qty {item.quantity}
              </p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 sag-num">
                <span className="text-[15px] leading-5 font-bold text-ink">{rupees(unit * item.quantity)}</span>
                {mrp > unit && <span className="text-[13px] text-ink-faint line-through">{rupees(mrp * item.quantity)}</span>}
                {off > 0 && <span className="text-[13px] font-bold text-sale">{off}% off</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="sag-checkout min-h-screen bg-page text-ink font-sans text-left pb-32 lg:pb-10">

      {/* Checkout bar: back, "Secure checkout", WhatsApp help. Then the three steps, always visible.
          The site header is hidden while this page is open (".sag-checkout" rule at the end of index.css). */}
      <div className="bg-white border-b border-line">
        <div className="max-w-6xl mx-auto flex items-center h-11 pl-1 pr-2 sm:px-4">
          <button type="button" onClick={goBack} aria-label={checkoutStep === 'details' ? 'Back to bag' : 'Back to the previous step'} className="w-11 h-11 rounded-full flex items-center justify-center text-ink hover:bg-sunken cursor-pointer">
            <ArrowLeft className="w-[22px] h-[22px]" />
          </button>
          <p className="flex-1 flex items-center gap-1.5 pl-1 text-[13px] leading-[18px] font-semibold text-brand">
            <Lock className="w-4 h-4" aria-hidden="true" /> Secure checkout
          </p>
          <a href={helpUrl} target="_blank" rel="noopener noreferrer" aria-label="Help on WhatsApp" className="inline-flex items-center gap-1.5 h-11 px-2 rounded-control text-[13px] font-semibold text-ink hover:bg-sunken">
            <WhatsAppIcon className="w-5 h-5" /> Help
          </a>
        </div>
        <nav aria-label="Checkout steps" className="border-t border-line">
          <ol className="max-w-6xl mx-auto flex items-center px-4 sm:px-6">
            {([['details', 'Address'], ['summary', 'Review'], ['payment', 'Pay']] as const).map(([step, text], index, all) => {
              const done = index < stepIndex;
              const active = index === stepIndex;
              return (
                <li key={step} className={`flex items-center ${index < all.length - 1 ? 'flex-1' : ''}`}>
                  <button
                    type="button"
                    onClick={() => goToStep(step)}
                    aria-current={active ? 'step' : undefined}
                    className="flex items-center gap-1.5 h-11 cursor-pointer"
                  >
                    <span className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-ok text-white' : active ? 'bg-ink text-white' : 'border-[1.5px] border-control text-ink-muted'}`}>
                      {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                    </span>
                    <span className={`text-[13px] leading-[18px] whitespace-nowrap ${active ? 'font-bold text-ink' : done ? 'font-semibold text-ink' : 'font-medium text-ink-muted'}`}>{text}</span>
                    {done && <span className="sr-only">(done)</span>}
                  </button>
                  {index < all.length - 1 && <span aria-hidden="true" className={`mx-2.5 h-px flex-1 ${done ? 'bg-ok' : 'bg-line'}`} />}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      <div className="max-w-6xl mx-auto px-3 sm:px-6 pt-3 sm:pt-6 grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-8 items-start">

        {/* Left column: the current step */}
        <div className="lg:col-span-7 space-y-3 min-w-0">

          {errorMessage && (
            <div role="alert" className="rounded-control border border-danger-line bg-danger-tint p-3.5 text-sm leading-5 text-danger flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 mt-px" aria-hidden="true" />
              <div>
                <p className="font-semibold">{bannerTitle}</p>
                <p className="mt-0.5">{bannerText}</p>
              </div>
            </div>
          )}

          {/* STEP 1: ADDRESS */}
          {checkoutStep === 'details' && (
            <div className="space-y-3">

              <section className="sag-card p-4 sm:p-6" aria-labelledby="co-contact-title">
                <h2 id="co-contact-title" className="text-xl leading-7 font-semibold text-ink">Contact</h2>
                <div className="mt-3.5 space-y-4">
                  <Field id="co-mobile" label="Mobile number" error={mobileError}>
                    <div className={`relative flex h-[52px] rounded-control border-[1.5px] overflow-hidden focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink ${mobileError ? 'border-danger bg-danger-tint' : 'border-control bg-white focus-within:border-brand'}`}>
                      <span className="flex items-center px-3.5 bg-sunken border-r border-line text-base font-medium text-ink shrink-0" aria-hidden="true">+91</span>
                      <input
                        id="co-mobile"
                        name="mobile"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        enterKeyHint="next"
                        maxLength={10}
                        value={address.mobile}
                        onChange={(e) => handleFieldChangeDebounced('mobile', e.target.value)}
                        onBlur={() => { handleFieldBlur(); touch('mobile'); }}
                        placeholder="10-digit mobile number"
                        aria-invalid={mobileError ? true : undefined}
                        aria-describedby={mobileError ? 'co-mobile-error' : undefined}
                        className="flex-1 min-w-0 h-full pl-3.5 pr-10 bg-transparent text-base text-ink placeholder:text-ink-faint outline-none focus:outline-none focus-visible:outline-none"
                      />
                      {mobileValid && <Check className="absolute right-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-ok" aria-hidden="true" />}
                    </div>
                  </Field>

                  <div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="co-first-name" className="sag-label">First name</label>
                        <input
                          id="co-first-name"
                          name="given-name"
                          type="text"
                          autoComplete="given-name"
                          autoCapitalize="words"
                          enterKeyHint="next"
                          value={firstName}
                          onChange={(e) => handleFieldChangeDebounced('firstName', e.target.value)}
                          onBlur={() => { handleFieldBlur(); touch('firstName'); }}
                          placeholder="First name"
                          aria-invalid={nameError && !firstName.trim() ? true : undefined}
                          aria-describedby={nameError ? 'co-name-error' : undefined}
                          className="sag-input"
                        />
                      </div>
                      <div>
                        <label htmlFor="co-last-name" className="sag-label">Last name</label>
                        <input
                          id="co-last-name"
                          name="family-name"
                          type="text"
                          autoComplete="family-name"
                          autoCapitalize="words"
                          enterKeyHint="next"
                          value={lastName}
                          onChange={(e) => handleFieldChangeDebounced('lastName', e.target.value)}
                          onBlur={() => { handleFieldBlur(); touch('lastName'); }}
                          placeholder="Last name"
                          aria-invalid={nameError && !lastName.trim() ? true : undefined}
                          aria-describedby={nameError ? 'co-name-error' : undefined}
                          className="sag-input"
                        />
                      </div>
                    </div>
                    {nameError && (
                      <p id="co-name-error" role="alert" className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-[18px] font-medium text-danger">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" /><span>{nameError}</span>
                      </p>
                    )}
                  </div>

                  <Field id="co-email" label="Email" error={emailError} helper="Order updates are sent to this email.">
                    <input
                      id="co-email"
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="next"
                      value={address.email}
                      onChange={(e) => handleFieldChangeDebounced('email', e.target.value)}
                      onBlur={() => { handleFieldBlur(); touch('email'); }}
                      placeholder="you@example.com"
                      aria-invalid={emailError ? true : undefined}
                      aria-describedby={emailError ? 'co-email-error' : 'co-email-help'}
                      className="sag-input"
                    />
                  </Field>
                </div>
              </section>

              {hasSavedAddresses && (
                <section className="sag-card p-4 sm:p-6 space-y-3" aria-labelledby="co-saved-title">
                  <h2 id="co-saved-title" className="text-xl leading-7 font-semibold text-ink">Deliver to a saved address</h2>
                  <AddressBook onSelect={applySavedAddress} selectedId={selectedAddressId} />
                </section>
              )}

              <section className="sag-card p-4 sm:p-6" aria-labelledby="co-address-title">
                <div className="flex items-center justify-between gap-2 -my-2.5">
                  <h2 id="co-address-title" className="text-xl leading-7 font-semibold text-ink">Delivery address</h2>
                  <button type="button" onClick={handleAutoDetectLocation} disabled={isDetectingLocation} className="sag-link gap-1.5 text-[13px] disabled:opacity-60">
                    {isDetectingLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" aria-hidden="true" />}
                    Use my location
                  </button>
                </div>

                <div className="mt-3.5 space-y-4">
                  <Field id="co-pincode" label="PIN code" error={pinError} helper={!pinError && pincodeHint ? <span role="status">{pincodeHint}</span> : undefined}>
                    <div className="relative">
                      <input
                        id="co-pincode"
                        name="postal-code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="postal-code"
                        enterKeyHint="next"
                        maxLength={6}
                        value={address.pincode}
                        onChange={(e) => setAddress(prev => ({ ...prev, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                        onBlur={() => touch('pincode')}
                        placeholder="6-digit PIN code (e.g. 110001)"
                        aria-invalid={pinError ? true : undefined}
                        aria-describedby={pinError ? 'co-pincode-error' : pincodeHint ? 'co-pincode-help' : undefined}
                        className="sag-input pr-10"
                      />
                      {pincodeLoading && <Loader2 className="absolute right-3.5 top-1/2 -mt-[9px] w-[18px] h-[18px] animate-spin text-ink-muted" aria-label="Checking PIN code" />}
                      {pinFound && <Check className="absolute right-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-ok" aria-hidden="true" />}
                    </div>
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field id="co-city" label="City / town" error={cityError}>
                      <input
                        id="co-city"
                        name="city"
                        type="text"
                        autoComplete="address-level2"
                        autoCapitalize="words"
                        enterKeyHint="next"
                        value={address.city}
                        onChange={(e) => setAddress(prev => ({ ...prev, city: e.target.value }))}
                        onBlur={() => touch('city')}
                        placeholder="New Delhi"
                        aria-invalid={cityError ? true : undefined}
                        aria-describedby={cityError ? 'co-city-error' : undefined}
                        className="sag-input"
                      />
                    </Field>

                    <Field id="co-state" label="State" error={stateError}>
                      <div className="relative">
                        <select
                          id="co-state"
                          name="state"
                          autoComplete="address-level1"
                          value={address.state}
                          onChange={(e) => setAddress(prev => ({ ...prev, state: e.target.value }))}
                          onBlur={() => touch('state')}
                          aria-invalid={stateError ? true : undefined}
                          aria-describedby={stateError ? 'co-state-error' : undefined}
                          className="sag-input appearance-none pr-9 truncate"
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
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-ink-muted" aria-hidden="true" />
                      </div>
                    </Field>
                  </div>

                  <Field id="co-house" label="Flat, house no., building" error={houseError}>
                    <input
                      id="co-house"
                      name="address-line1"
                      type="text"
                      autoComplete="address-line1"
                      enterKeyHint="next"
                      value={address.houseFlat}
                      onChange={(e) => setAddress(prev => ({ ...prev, houseFlat: e.target.value }))}
                      onBlur={() => touch('houseFlat')}
                      placeholder="Flat 302, Palm Heights"
                      aria-invalid={houseError ? true : undefined}
                      aria-describedby={houseError ? 'co-house-error' : undefined}
                      className="sag-input"
                    />
                  </Field>

                  <Field id="co-street" label="Street, area, landmark" error={streetError}>
                    <input
                      id="co-street"
                      name="address-line2"
                      type="text"
                      autoComplete="address-line2"
                      enterKeyHint="done"
                      value={address.street}
                      onChange={(e) => setAddress(prev => ({ ...prev, street: e.target.value, area: e.target.value }))}
                      onBlur={() => touch('street')}
                      placeholder="MG Road, Near Central Mall"
                      aria-invalid={streetError ? true : undefined}
                      aria-describedby={streetError ? 'co-street-error' : undefined}
                      className="sag-input"
                    />
                  </Field>

                  <label htmlFor="saveAddr" className="flex items-center gap-3 min-h-11 text-sm leading-5 text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      id="saveAddr"
                      checked={saveAddressOption}
                      onChange={(e) => setSaveAddressOption(e.target.checked)}
                      className="w-[22px] h-[22px] shrink-0 rounded-badge accent-brand cursor-pointer"
                    />
                    Save this address for future orders
                  </label>
                </div>

                {/* Desktop: inline button. Phones use the bar at the bottom of the screen. */}
                <button type="button" onClick={handleProceedToPaymentStep} className="sag-btn-primary hidden lg:flex w-full mt-4">
                  Deliver here · Continue
                </button>
              </section>
            </div>
          )}

          {/* STEP 2: REVIEW */}
          {checkoutStep === 'summary' && (
            <div className="space-y-3">
              <section className="sag-card p-4 sm:p-6" aria-label="Delivery address">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-xl leading-7 font-semibold text-ink">Deliver to</h2>
                    <p className="mt-2 text-sm leading-5 font-semibold text-ink">
                      {fullNameText}
                      {address.type && <span className="sag-badge ml-2 align-middle">{address.type}</span>}
                    </p>
                    <p className="mt-0.5 text-sm leading-5 text-ink-muted">
                      {addressLine} – {address.pincode}
                    </p>
                    <p className="mt-0.5 text-sm leading-5 text-ink-muted">Mobile: {address.mobile}{address.altMobile ? ` · Alt: ${address.altMobile}` : ''}</p>
                    {address.email && <p className="text-sm leading-5 text-ink-muted break-all">{address.email}</p>}
                  </div>
                  <button type="button" onClick={() => setCheckoutStep('details')} className="sag-link shrink-0 -my-2.5">
                    Change
                  </button>
                </div>
              </section>

              <section className="sag-card p-4 sm:p-6 space-y-3" aria-label="Items">
                <h2 className="text-xl leading-7 font-semibold text-ink">Your order <span className="font-sans text-sm font-normal text-ink-muted">({itemsText})</span></h2>
                {itemLines}
                <p className="flex items-start gap-2 pt-3 border-t border-line text-sm leading-5 text-ink-muted">
                  <Truck className="h-[18px] w-[18px] shrink-0 mt-px text-ink" aria-hidden="true" />
                  <span>
                    {shippingFee === 0 ? <span className="font-semibold text-sale">Free delivery</span> : `Delivery ${rupees(shippingFee)}`}
                    {deliveryEstimateText ? <> · <span className="font-semibold text-ink">Estimated delivery by {deliveryEstimateText}</span></> : null}
                  </span>
                </p>
              </section>

              <section className="sag-card px-4 sm:px-6">
                <label className="flex items-center gap-3 min-h-[52px] text-sm leading-5 font-semibold text-ink cursor-pointer">
                  <input type="checkbox" checked={addGiftNote} onChange={(e) => setAddGiftNote(e.target.checked)} className="w-[22px] h-[22px] shrink-0 rounded-badge accent-brand cursor-pointer" />
                  <Gift className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> Add a gift note to the parcel
                </label>
                {addGiftNote && (
                  <textarea aria-label="Gift note" rows={2} maxLength={300} value={giftNoteText} onChange={(e) => setGiftNoteText(e.target.value)}
                    placeholder="Write a short message for the recipient"
                    className="sag-input mb-4" />
                )}
              </section>

              <button type="button" onClick={() => goToStep('payment')} className="sag-btn-primary hidden lg:flex w-full">
                Continue to payment
              </button>
            </div>
          )}

          {/* STEP 3: PAY */}
          {checkoutStep === 'payment' && (
            <div className="space-y-3">

              <section className="sag-card p-4 sm:p-6" aria-label="Amount to pay">
                <p className="text-sm leading-5 text-ink-muted">Amount to pay</p>
                <p className="mt-0.5 text-[28px] leading-8 font-bold text-ink sag-num">{rupees(finalCartTotal)}</p>
                <div className="mt-2 pt-2 border-t border-line flex items-center justify-between gap-3">
                  <p className="min-w-0 text-sm leading-5 text-ink-muted">Deliver to {fullNameText}, {address.city} {address.pincode}</p>
                  <button type="button" onClick={() => setCheckoutStep('details')} className="sag-link shrink-0 text-[13px]">Change address</button>
                </div>
              </section>

              <section className="sag-card p-4 sm:p-6 space-y-3" aria-labelledby="co-pay-title">
                <h2 id="co-pay-title" className="text-xl leading-7 font-semibold text-ink">Payment method</h2>

                {gateways === null ? (
                  <div className="min-h-[76px] rounded-control bg-sunken flex items-center justify-center gap-2 text-sm text-ink-muted" aria-busy="true" aria-label="Loading payment options">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading payment options…
                  </div>
                ) : !gateways.razorpay && !gateways.payu ? (
                  <p className="rounded-control border-l-4 border-sale-line bg-sale-tint px-3.5 py-3 text-sm leading-5 text-ink">
                    Online payment is paused for a few minutes. Please try again shortly or message us on WhatsApp.
                  </p>
                ) : (
                  <>
                    {paymentOptions.length === 1 ? (
                      <div className="sag-card p-3.5 flex items-start gap-3" data-selected="true">
                        <Check className="h-5 w-5 shrink-0 mt-0.5 text-brand" aria-hidden="true" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-[15px] leading-[22px] font-semibold text-ink">{paymentOptions[0][1]}</span>
                          <span className="mt-0.5 block text-[13px] leading-[18px] text-ink-muted">{paymentOptions[0][2]}</span>
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-2.5" role="radiogroup" aria-label="Payment method">
                        {paymentOptions.map(([id, title, detail]) => (
                          <label key={id} data-selected={gateway === id ? 'true' : undefined} className="sag-card p-3.5 flex items-start gap-3 min-h-[52px] cursor-pointer">
                            <input type="radio" name="gateway" value={id} checked={gateway === id} onChange={() => setGateway(id)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
                            <span className="flex-1 min-w-0">
                              <span className="block text-[15px] leading-[22px] font-semibold text-ink">{title}</span>
                              <span className="mt-0.5 block text-[13px] leading-[18px] text-ink-muted">{detail}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                    {prepaidDiscount > 0 && (
                      <p className="text-[13px] leading-[18px] font-semibold text-sale sag-num">
                        Online payment discount of ₹{prepaidDiscount.toLocaleString('en-IN')} applied.
                      </p>
                    )}
                  </>
                )}

                {inAppBrowser && (
                  <p className="rounded-control border-l-4 border-sale-line bg-sale-tint px-3.5 py-3 text-[13px] leading-[18px] text-ink">
                    You are inside the {inAppBrowser} app. UPI apps (Google Pay, PhonePe, Paytm) open best in your phone's browser:
                    tap <span className="font-semibold">⋮</span> (top right) → <span className="font-semibold">Open in browser / Chrome</span>, then pay.
                  </p>
                )}

                <button type="button" onClick={handlePlacePrepaidOrder} disabled={payDisabled} className="sag-btn-primary hidden lg:flex w-full gap-2">
                  {payButtonContent}
                </button>
              </section>

              <section className="sag-card px-4 sm:px-6" aria-label="Why it is safe to pay">
                <div className="sag-row">
                  <Lock className="w-5 h-5 shrink-0 text-brand" aria-hidden="true" />
                  <span className="flex-1 min-w-0 font-medium">Secure {gatewayKnown ? `${gatewayName} ` : ''}checkout. Your order is confirmed only after the payment is verified.</span>
                </div>
                <div className="sag-row">
                  <Check className="w-5 h-5 shrink-0 text-brand" aria-hidden="true" />
                  <span className="flex-1 min-w-0">7-day returns &amp; exchange</span>
                </div>
                <a href={helpUrl} target="_blank" rel="noopener noreferrer" className="sag-row">
                  <WhatsAppIcon className="w-5 h-5 shrink-0" />
                  <span className="flex-1 min-w-0">Payment stuck? Chat on WhatsApp</span>
                </a>
              </section>
            </div>
          )}

        </div>

        {/* Order summary. Phones: one collapsed strip under the stepper that opens in place (always open on the
            Review step, where it sits under the items). Desktop: the right column. It holds no <select>. */}
        <aside className={`lg:col-span-5 lg:sticky lg:top-6 lg:order-none min-w-0 ${checkoutStep === 'summary' ? '' : 'order-first'}`} aria-label="Order summary">
          <div className="sag-card overflow-hidden">
            {checkoutStep !== 'summary' && (
              <button type="button" onClick={() => setSummaryOpen((open) => !open)} aria-expanded={summaryOpen} aria-controls="co-order-summary"
                className="lg:hidden w-full flex items-center gap-3 px-3.5 py-2.5 min-h-[60px] text-left cursor-pointer">
                <img src={getCleanImageUrl(lineImage(cart[0]), 200)} alt="" width={40} height={50} className="h-[50px] w-10 shrink-0 rounded-badge object-cover object-top bg-sunken" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm leading-5 font-semibold text-ink sag-num">{itemsText} · {rupees(finalCartTotal)}</span>
                  <span className="block text-[13px] leading-[18px] text-ink-muted">
                    {appliedCoupon ? `Coupon ${appliedCoupon.code} applied` : 'Have a coupon?'}
                  </span>
                </span>
                <span className="shrink-0 inline-flex items-center gap-1 text-[13px] font-semibold text-brand">
                  {summaryOpen ? 'Hide' : 'View'}
                  <ChevronDown className={`w-[18px] h-[18px] transition-transform ${summaryOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </span>
              </button>
            )}

            <div id="co-order-summary" className={`${summaryOpen || checkoutStep === 'summary' ? 'block' : 'hidden'} lg:block ${checkoutStep === 'summary' ? '' : 'border-t border-line lg:border-t-0'} p-4 sm:p-6 space-y-4`}>
              {checkoutStep !== 'summary' && (
                <div>
                  <h2 className="hidden lg:block mb-3 text-xl leading-7 font-semibold text-ink">Order summary <span className="font-sans text-sm font-normal text-ink-muted">({itemsText})</span></h2>
                  <div className="max-h-80 overflow-y-auto">{itemLines}</div>
                </div>
              )}

              {/* Coupon */}
              <div className={checkoutStep === 'summary' ? '' : 'pt-4 border-t border-line'}>
                {appliedCoupon ? (
                  <div className="flex items-center justify-between gap-3 rounded-control border border-ok-line bg-ok-tint pl-3.5 pr-2 min-h-[52px] text-ok">
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Tag className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block text-sm leading-5 font-semibold truncate">{appliedCoupon.code} applied</span>
                        <span className="block text-[13px] leading-[18px] sag-num">You save ₹{discountAmount.toLocaleString('en-IN')} with this coupon</span>
                      </span>
                    </span>
                    <button type="button" onClick={removeCoupon} className="sag-link shrink-0 px-1.5 text-[13px]">
                      Remove
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2 -my-2.5">
                      <p className="sag-label mb-0">Coupon code</p>
                      {coupons.length > 0 && (
                        <button type="button" onClick={() => setShowCouponsModal(true)} className="sag-link text-[13px]">
                          View coupons ({coupons.length})
                        </button>
                      )}
                    </div>
                    <form onSubmit={handleCouponApply} className="mt-1.5 flex gap-2">
                      <input aria-label="Coupon code"
                        id="co-coupon"
                        aria-invalid={couponError ? true : undefined}
                        aria-describedby={couponError ? 'co-coupon-error' : undefined}
                        type="text"
                        autoComplete="off"
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        enterKeyHint="done"
                        value={couponCodeInput}
                        onChange={(e) => { setCouponCodeInput(e.target.value.toUpperCase()); if (couponError) clearCouponError(); }}
                        placeholder="Enter coupon code"
                        className="sag-input flex-1 min-w-0 h-12 uppercase placeholder:normal-case"
                      />
                      <button type="submit" className="sag-btn-outline h-12 px-4 text-sm">
                        Apply
                      </button>
                    </form>
                    <CouponError id="co-coupon-error" message={couponError} />
                  </>
                )}
              </div>

              {/* Price details: a preview; the server recalculates before payment */}
              <div className="pt-4 border-t border-line">
                <PriceDetails />
              </div>
            </div>
          </div>
        </aside>

        {/* Always last on Address and Review: the short assurance line and WhatsApp help.
            The Pay step says both once, in its own card above ("Secure … checkout", "Payment stuck?"). */}
        {checkoutStep !== 'payment' && (
          <div className="lg:col-span-7 space-y-3 pt-1">
            <Assurance variant="line" />
            <a href={helpUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 h-12 rounded-control border-[1.5px] border-control bg-white text-sm font-semibold text-ink hover:bg-sunken">
              <WhatsAppIcon className="w-5 h-5" /> Need help? Chat with us on WhatsApp
            </a>
          </div>
        )}

      </div>

      {/* Phones: one fixed bar per step, always showing the amount and the next action */}
      <div className="sag-bar lg:hidden fixed inset-x-0 bottom-0 z-40">
        {checkoutStep === 'payment' ? (
          <div className="max-w-md mx-auto">
            <button type="button" onClick={handlePlacePrepaidOrder} disabled={payDisabled} className="sag-btn-primary w-full gap-2">
              {payButtonContent}
            </button>
          </div>
        ) : (
          <div className="max-w-md mx-auto flex items-center gap-3">
            <div className="shrink-0">
              <p className="text-lg leading-[22px] font-bold text-ink sag-num">{rupees(finalCartTotal)}</p>
              <p className="text-[11px] leading-[14px] text-ink-muted">{itemsText}</p>
            </div>
            {checkoutStep === 'details' ? (
              <button type="button" onClick={handleProceedToPaymentStep} className="sag-btn-primary flex-1 min-w-0 px-3">
                Deliver here · Continue
              </button>
            ) : (
              <button type="button" onClick={() => goToStep('payment')} className="sag-btn-primary flex-1 min-w-0 px-3">
                Continue to payment
              </button>
            )}
          </div>
        )}
      </div>

      {/* Available coupons: a sheet on phones, a dialog on wider screens */}
      {showCouponsModal && (
        <div className="fixed inset-0 z-[60] bg-ink/50 flex items-end sm:items-center justify-center sm:p-4 animate-fadeIn" onClick={() => setShowCouponsModal(false)}>
          <div role="dialog" aria-modal="true" aria-label="Available coupons" onClick={(e) => e.stopPropagation()} className="bg-white w-full sm:max-w-lg max-h-[85dvh] rounded-t-sheet sm:rounded-card overflow-hidden flex flex-col">

            <div className="flex items-center justify-between gap-3 pl-4 pr-1.5 min-h-14 border-b border-line">
              <div className="py-2">
                <h2 className="text-base leading-[22px] font-semibold text-ink">Available coupons</h2>
                <p className="text-[13px] leading-[18px] text-ink-muted">Tap Apply to use a coupon on this order</p>
              </div>
              <button type="button" onClick={() => setShowCouponsModal(false)} aria-label="Close coupons" className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-ink hover:bg-sunken cursor-pointer">
                <X className="w-[22px] h-[22px]" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 flex-1 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {coupons && coupons.length > 0 ? (
                coupons.map((cp) => {
                  const isApplied = appliedCoupon?.code === cp.code;
                  const isEligible = cartSubtotal >= cp.minOrderValue;
                  const discountLabel = cp.discountType === 'percentage'
                    ? `${cp.discountValue}% off`
                    : `₹${cp.discountValue} off`;

                  return (
                    <div key={cp.id} className={`rounded-control border border-dashed p-3.5 space-y-2 ${isApplied ? 'border-ok-line bg-ok-tint' : 'border-sale-line bg-sale-tint'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 text-sm leading-5">
                          <span className="font-bold text-ink">{cp.code}</span>
                          <span className="ml-2 font-semibold text-sale">{discountLabel}</span>
                        </p>

                        {isApplied ? (
                          <span className="inline-flex items-center gap-1 text-sm font-semibold text-ok">
                            <Check className="w-4 h-4" aria-hidden="true" /> Applied
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              applyCouponCode(cp.code);
                              setCouponCodeInput(cp.code);
                              setShowCouponsModal(false);
                            }}
                            disabled={!isEligible}
                            className="sag-btn-outline h-11 px-4 text-sm shrink-0"
                          >
                            Apply
                          </button>
                        )}
                      </div>

                      <p className="text-[13px] leading-[18px] text-ink-muted">
                        {cp.description || (cp.minOrderValue > 0
                          ? `Save ${discountLabel} on orders above ₹${cp.minOrderValue.toLocaleString('en-IN')}`
                          : `Save ${discountLabel} on your entire cart with no minimum order limit.`)}
                      </p>

                      {!isEligible && (
                        <p className="text-[13px] leading-[18px] font-medium text-ink">
                          Add ₹{(cp.minOrderValue - cartSubtotal).toLocaleString('en-IN')} more to unlock this coupon.
                        </p>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="text-center text-sm text-ink-muted py-8">No coupons available right now.</p>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
