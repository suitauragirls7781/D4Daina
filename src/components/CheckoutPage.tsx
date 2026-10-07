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

import { AlertCircle, ArrowLeft, Check, ChevronDown, Gift, Info, Loader2, Lock, MapPin, X } from 'lucide-react';
import { getCleanImageUrl } from '../utils/imageHelper';
import { createSupportWhatsAppUrl } from '../utils/storeContact';
import { BagIcon } from './BrandIcons';
import { assuranceFacts, assuranceLine } from './Assurance';
import { CouponError, PriceDetails, useBagSavings, useCouponApply } from './CartContents';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 
  'Delhi NCR', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 
  'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 
  'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
];

export type CheckoutField = 'firstName' | 'mobile' | 'email' | 'houseFlat' | 'street' | 'city' | 'state' | 'pincode';

/**
 * Display only: every address-step problem, in the same order, with the same conditions and the same messages
 * as validateForm() inside the page (which stays the one gate for moving forward). The first entry is always
 * the message validateForm() puts in the banner. Used to mark the field and to focus it after a failed Continue.
 */
export const getCheckoutFieldErrors = (values: { firstName: string; lastName: string; address: DeliveryAddress; pincodeError: string }): Array<{ field: CheckoutField; message: string }> => {
  const { firstName, lastName, address, pincodeError } = values;
  const errors: Array<{ field: CheckoutField; message: string }> = [];
  // One "Full name" box (its two halves are split at the first space): at least two characters
  if (`${firstName} ${lastName}`.trim().length < 2) errors.push({ field: 'firstName', message: 'Please enter your full name.' });
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
  firstName: 'co-first-name', mobile: 'co-mobile', email: 'co-email',
  houseFlat: 'co-house', street: 'co-street', city: 'co-city', state: 'co-state', pincode: 'co-pincode',
};

// The fields in the order they appear on the screen (mobile comes before the name in this layout)
const FIELD_SCREEN_ORDER: CheckoutField[] = ['mobile', 'firstName', 'email', 'pincode', 'city', 'state', 'houseFlat', 'street'];

/** Display only: the same problems as getCheckoutFieldErrors(), one per field, in on-screen order. */
const inScreenOrder = (errors: Array<{ field: CheckoutField; message: string }>) =>
  errors
    .filter((entry, index) => errors.findIndex((other) => other.field === entry.field) === index)
    .sort((a, b) => FIELD_SCREEN_ORDER.indexOf(a.field) - FIELD_SCREEN_ORDER.indexOf(b.field));

// Noir & Champagne (owner's pick): the shared pieces of this page. Small capital muted labels above square
// hairline fields, a small link with a thin underline, and the champagne eyebrow label.
const LABEL = 'sag-label mb-[5px] text-[11.5px] leading-4 font-normal uppercase tracking-[0.06em] text-ink-muted';
const INPUT = 'sag-input border border-line focus:border-ink aria-[invalid=true]:border-danger';
const LINK = 'sag-link text-[12.5px] decoration-1 underline-offset-4';
const EYEBROW = 'text-[10.5px] leading-4 font-semibold uppercase tracking-[0.16em] text-sale';
const FIELD_ERROR = 'mt-1.5 flex items-start gap-1.5 text-[13px] leading-[18px] font-medium text-danger';

/** Label above, field, then one line below: the error (with an icon) or the helper text. */
const Field: React.FC<{ id: string; label: string; error?: string; helper?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ id, label, error, helper, className = '', children }) => (
  <div className={className}>
    <label htmlFor={id} className={LABEL}>{label}</label>
    {children}
    {error ? (
      <p id={`${id}-error`} role="alert" className={FIELD_ERROR}>
        <AlertCircle className="w-4 h-4 shrink-0 mt-px" strokeWidth={1.5} aria-hidden="true" /><span>{error}</span>
      </p>
    ) : helper ? (
      <p id={`${id}-help`} className="mt-1.5 text-[11.5px] leading-4 text-ink-muted">{helper}</p>
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
    storeOffers,
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

  // 2-step flow: Address → Payment (going back never loses the bag or the form)
  const [checkoutStep, setCheckoutStepState] = useState<'details' | 'payment'>('details');
  const setCheckoutStep = (step: 'details' | 'payment') => {
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

  // One "Full name" box. The rest of the page still works with a first and a last name: the text is split
  // at the first space, so the full name sent with the order is the same string as before.
  const [nameInput, setNameInput] = useState('');
  const splitName = (value: string) => {
    const clean = value.trim();
    const gap = clean.search(/\s/);
    return gap < 0 ? { first: clean, last: '' } : { first: clean.slice(0, gap), last: clean.slice(gap).trim() };
  };
  const { first: firstName, last: lastName } = splitName(nameInput);
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
  // Display only: what the bag saves against MRP (the same sum the price details show)
  const { totalSavings } = useBagSavings();

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
    setNameInput(String(saved.fullName || '').trim());
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
  // Cash on delivery (when the owner has it on): the charge is paid online now, the rest in cash at the door.
  // No online payment discount, and the charge replaces the delivery charge. Same sums as priceCart on the server.
  const [payMode, setPayMode] = useState<'prepaid' | 'cod'>('prepaid');
  const codCharge = storeOffers.codCharge;
  const codDue = Math.max(0, cartTotal - shippingFee);
  const codTotal = codDue + codCharge;

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
    if (field === 'fullName') {
      setNameInput(val);
      const typed = splitName(val);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        savePartialToDb(typed.first, typed.last, address.mobile, address.email);
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

        if (loadedName) setNameInput(String(loadedName).trim());

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
      const combinedFullName = `${firstName.trim()} ${lastName.trim()}`.trim();

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
    if (`${firstName} ${lastName}`.trim().length < 2) {
      setErrorMessage('Please enter your full name.');
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
      setCheckoutStep('payment');
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

  const goToStep = (step: 'details' | 'payment') => {
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
    confetti({ particleCount: 120, spread: 70, origin: { y: 0.55 }, colors: ['#161514', '#A6824A', '#F6F1E7', '#10B981'], zIndex: 10001 });
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
    // The advance of a cash-on-delivery order always goes through Razorpay
    const cod = payMode === 'cod' && codOn;
    const payGateway: Gateway = cod ? 'razorpay' : gateway;
    const sdkReady = payGateway === 'razorpay' ? loadRazorpaySDK() : Promise.resolve(true);
    const signature = JSON.stringify([cart.map((item) => [item.product.id, item.selectedSize, item.selectedColor?.name || '', item.quantity, item.lookParentId || '']), appliedCoupon?.code || '', cod ? 'cod' : '']);
    let created: {
      gateway?: Gateway; alreadyPaid?: boolean; orderNumber: string; order: Order;
      razorpayOrderId: string; amount: number; currency: string; keyId: string;
      payuAction?: string; payuFields?: Record<string, string>;
    };
    try {
      created = await ordersApi('create', {
        gateway: payGateway,
        payMode: cod ? 'cod' : 'prepaid',
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

    if (Math.round(created.order.finalTotal) !== Math.round(cod ? codTotal : finalCartTotal)) {
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
        description: cod ? `Advance for cash on delivery order ${created.orderNumber}` : `Order ${created.orderNumber}`,
        image: '/suit-aura-logo-512.png',
        prefill: { name: fullName, email: address.email, contact: address.mobile },
        notes: { order_number: created.orderNumber },
        theme: { color: '#161514' },
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
        <div className="w-full max-w-md border border-line bg-surface p-6 text-center">
          {paymentReturn.state === 'checking' ? (
            <>
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-ink" strokeWidth={1.5} />
              <h2 className="mt-4 font-display text-[19px] leading-6 text-ink">Confirming your payment…</h2>
              <p className="mt-2 text-[13px] leading-5 text-ink-muted">Please keep this page open. This takes a few seconds.</p>
            </>
          ) : (
            <>
              <div className={`mx-auto flex h-7 w-7 items-center justify-center ${paymentReturn.state === 'pending' ? 'text-sale' : 'text-danger'}`}>
                {paymentReturn.state === 'pending' ? <Info className="h-7 w-7" strokeWidth={1.5} /> : <AlertCircle className="h-7 w-7" strokeWidth={1.5} />}
              </div>
              <h2 className="mt-4 font-display text-[19px] leading-6 text-ink">{paymentReturn.state === 'pending' ? 'Payment pending' : 'Payment not completed'}</h2>
              <p className="mt-2 text-[13px] leading-5 text-ink-muted">{paymentReturn.message}</p>
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
                  className={`${LINK} justify-center`}
                >
                  Contact support on WhatsApp
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
        <BagIcon className="w-8 h-8 text-ink" />
        <h1 className="mt-5 font-display text-[23px] leading-7 text-ink">Your bag is empty</h1>
        <p className="mt-2 max-w-sm text-[13px] leading-5 text-ink-muted">Add a style to your bag and come back here to check out.</p>
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
  const stepIndex = ['details', 'payment'].indexOf(checkoutStep);
  // The two steps, shown as small capital text under the bar
  const stepBlocks = [
    { step: 'details' as const, label: 'Address' },
    { step: 'payment' as const, label: 'Payment' },
  ];
  const goBack = () => {
    if (checkoutStep === 'payment') setCheckoutStep('details');
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
  const nameError = errFor('firstName');
  const mobileError = errFor('mobile');
  const emailError = errFor('email');
  const pinError = pincodeError || errFor('pincode');
  const cityError = errFor('city');
  const stateError = errFor('state');
  const houseError = errFor('houseFlat');
  const streetError = errFor('street');
  const mobileValid = Boolean(touched.mobile) && /^[6-9]\d{9}$/.test(address.mobile);
  const pinFound = !pincodeLoading && !pincodeError && address.pincode.length === 6 && availablePostOffices.length > 0;
  // Display only: the line under the PIN code box (what the lookup is doing, then what it found)
  const pinPlace = pinFound ? [availablePostOffices[0]?.District || availablePostOffices[0]?.Taluk, availablePostOffices[0]?.State].filter(Boolean).join(', ') : '';
  const pinHelp = pincodeLoading ? 'Filling city and state…'
    : pinPlace ? `City and state filled: ${pinPlace}`
    : pincodeHint || 'Your city and state are filled from the PIN code.';

  const payDisabled = isProcessing || gateways === null || (!gateways.razorpay && !gateways.payu);
  const gatewayKnown = gateways !== null && (gateways.razorpay || gateways.payu);
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
  // Cash on delivery is offered only when the owner has it on and Razorpay can take the advance
  const codOn = storeOffers.codEnabled && Boolean(gateways?.razorpay);
  const codChosen = payMode === 'cod' && codOn;
  const prepaidSaving = Math.max(0, codTotal - finalCartTotal);
  // A cash-on-delivery order does not get the online payment discount, so it is not counted as saved
  const summarySavings = codChosen ? Math.max(0, totalSavings - prepaidDiscount) : totalSavings;
  const payButtonContent = isProcessing ? (
    <>
      <Loader2 className="w-4 h-4 animate-spin shrink-0" strokeWidth={1.5} />
      <span>{payStage === 'creating' ? 'Creating your order…' : gateway === 'payu' && !codChosen ? 'Taking you to PayU…' : 'Processing your payment…'}</span>
    </>
  ) : (
    <>
      <Lock className="w-4 h-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      {/* "Pay by UPI" only when UPI is the one method the chosen gateway offers; otherwise the wording as before */}
      <span className="sag-num">{codChosen ? `Pay ${rupees(codCharge)} now to confirm` : gateway === 'razorpay' && upiOnly ? 'Pay by UPI' : `Pay ${rupees(finalCartTotal)} securely`}</span>
    </>
  );
  // "Secure payment by <gateway> · 7-day returns & exchange": the store's own wording (Assurance), with the
  // gateway's name only once it is known (the cash-on-delivery advance always goes through Razorpay)
  const securedByText = assuranceLine(gatewayKnown ? (codChosen ? 'razorpay' : gateway) : undefined);
  // Display only: the online-payment option's detail line, the same words whether or not cash on delivery is offered
  const prepaidDetail = [storeOffers.prepaidPercent > 0 ? `${storeOffers.prepaidPercent}% off` : '', shippingFee === 0 ? 'Free delivery' : ''].filter(Boolean).join(' · ');
  // A way to pay: a hairline box (ink border when chosen) with the radio dot, title, detail and amount
  const optionBox = (on: boolean) => `flex items-start gap-2.5 border bg-surface p-3.5 ${on ? 'border-ink ring-1 ring-inset ring-ink' : 'border-line'}`;
  const kvRow = 'flex justify-between gap-3 py-[5px]';

  // Compact bag lines, shown inside the order summary
  const itemLines = (
    <ul className="divide-y divide-line">
      {cart.map((item) => {
        const unit = Number(item.product?.price) || 0;
        const mrp = Math.max(unit, Number(item.product?.originalPrice) || unit);
        const off = mrp > unit ? Math.round(((mrp - unit) / mrp) * 100) : 0;
        const colour = item.selectedColor?.name && !['Default', 'Standard'].includes(item.selectedColor.name) ? item.selectedColor.name : '';
        return (
          <li key={`${item.id}-${item.selectedSize}-${colour}`} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <img src={getCleanImageUrl(lineImage(item), 200)} alt="" width={54} height={68} className="aspect-[4/5] w-[54px] shrink-0 self-start object-cover object-top bg-sunken" loading="lazy" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-[18px] text-ink line-clamp-2">{item.product?.name}</p>
              {item.lookParentName && <p className="mt-0.5 text-[11.5px] leading-4 text-ink-muted">Complete the look · with {item.lookParentName}</p>}
              <p className="mt-0.5 text-[11.5px] leading-4 text-ink-muted">
                {item.selectedSize && !/free/i.test(item.selectedSize) ? `Size ${item.selectedSize}` : 'One size'}{colour ? ` · ${colour}` : ''} · Qty {item.quantity}
              </p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-[7px] sag-num">
                <span className="text-[14.5px] leading-5 font-semibold text-ink">{rupees(unit * item.quantity)}</span>
                {mrp > unit && <span className="text-[12.5px] text-ink-muted line-through">{rupees(mrp * item.quantity)}</span>}
                {off > 0 && <span className="text-[12.5px] font-semibold text-sale">{off}% off</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className={`sag-checkout min-h-screen bg-page text-ink font-sans text-left pb-12`}>

      {/* Checkout bar: back, "Secure checkout", WhatsApp help. Then the two steps, always visible.
          The site header is hidden while this page is open (".sag-checkout" rule at the end of index.css). */}
      <div className="bg-surface border-b border-line">
        <div className="max-w-6xl mx-auto flex items-center h-12 pl-1 pr-4 sm:pl-3 sm:pr-6">
          <button type="button" onClick={goBack} aria-label={checkoutStep === 'details' ? 'Back to bag' : 'Back to the previous step'} className="w-11 h-11 flex items-center justify-center text-ink hover:bg-sunken cursor-pointer">
            <ArrowLeft className="w-[22px] h-[22px]" strokeWidth={1.5} />
          </button>
          <p className="flex-1 flex items-center justify-center gap-[7px] text-[13px] leading-[18px] uppercase tracking-[0.08em] text-ink">
            <Lock className="w-[15px] h-[15px]" strokeWidth={1.5} aria-hidden="true" /> Secure checkout
          </p>
          <a href={helpUrl} target="_blank" rel="noopener noreferrer" aria-label="Help on WhatsApp" className={LINK}>
            Help
          </a>
        </div>
      </div>

      {/* The two steps as small capital text, the current one in ink. A step that is not open is a button
          (back to the address, or on to payment once the address is complete). */}
      <nav aria-label="Checkout steps" className="max-w-6xl mx-auto flex items-center justify-center gap-2.5 px-4 pt-1.5 text-[11.5px] leading-4 uppercase tracking-[0.1em] sag-num">
        {stepBlocks.map((block, index) => (
          <React.Fragment key={block.step}>
            {index > 0 && <span aria-hidden="true" className="h-px w-[26px] bg-line" />}
            {index === stepIndex ? (
              <span aria-current="step" className="inline-flex min-h-9 items-center font-semibold text-ink">{index + 1} {block.label}</span>
            ) : (
              <button type="button" onClick={() => goToStep(block.step)} className="inline-flex min-h-9 items-center uppercase tracking-[0.1em] text-ink-muted hover:text-ink cursor-pointer">
                {index + 1} {block.label}{index < stepIndex && <span className="sr-only"> (done)</span>}
              </button>
            )}
          </React.Fragment>
        ))}
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-3 sm:pt-5 grid grid-cols-1 lg:grid-cols-12 gap-[18px] lg:gap-12 items-start">

        {/* Left column: the current step */}
        <div className="lg:col-span-7 min-w-0">

          {errorMessage && (
            <div role="alert" className="mb-[18px] border border-danger bg-surface p-3.5 text-[13px] leading-5 text-danger flex items-start gap-2.5">
              <AlertCircle className="w-[18px] h-[18px] shrink-0 mt-px" strokeWidth={1.5} aria-hidden="true" />
              <div>
                <p className="font-semibold">{bannerTitle}</p>
                <p className="mt-0.5">{bannerText}</p>
              </div>
            </div>
          )}

          {/* STEP 1: ADDRESS. The serif title, the fields with small capital labels straight on the white page,
              one black button and a small facts line. The same at every width. */}
          {checkoutStep === 'details' && (
            <div>
              <h1 className="font-display text-[23px] leading-7 text-ink">Where should we deliver?</h1>

              <section className="mt-[18px]" aria-labelledby="co-contact-title">
                <h2 id="co-contact-title" className={`font-sans ${EYEBROW}`}>Contact</h2>
                <div className="mt-3 space-y-3.5">
                  <Field id="co-mobile" label="Mobile number" error={mobileError}>
                    <div className={`relative flex h-[46px] sm:h-[52px] border overflow-hidden focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink ${mobileError ? 'border-danger bg-danger-tint' : 'border-line bg-surface focus-within:border-ink'}`}>
                      <span className="flex items-center px-3.5 border-r border-line text-base text-ink-muted shrink-0" aria-hidden="true">+91</span>
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
                      {mobileValid && <Check className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink" strokeWidth={1.5} aria-hidden="true" />}
                    </div>
                  </Field>

                  <div>
                    <label htmlFor="co-first-name" className={LABEL}>Full name</label>
                    <input
                      id="co-first-name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      autoCapitalize="words"
                      enterKeyHint="next"
                      value={nameInput}
                      onChange={(e) => handleFieldChangeDebounced('fullName', e.target.value)}
                      onBlur={() => { handleFieldBlur(); touch('firstName'); }}
                      placeholder="Your full name"
                      aria-invalid={nameError ? true : undefined}
                      aria-describedby={nameError ? 'co-name-error' : undefined}
                      className={INPUT}
                    />
                    {nameError && (
                      <p id="co-name-error" role="alert" className={FIELD_ERROR}>
                        <AlertCircle className="w-4 h-4 shrink-0 mt-px" strokeWidth={1.5} aria-hidden="true" /><span>{nameError}</span>
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
                      className={INPUT}
                    />
                  </Field>
                </div>
              </section>

              {hasSavedAddresses && (
                <section className="mt-6 border-t border-line pt-5 space-y-3" aria-labelledby="co-saved-title">
                  <h2 id="co-saved-title" className={`font-sans ${EYEBROW}`}>Deliver to a saved address</h2>
                  <AddressBook onSelect={applySavedAddress} selectedId={selectedAddressId} />
                </section>
              )}

              <section className="mt-6 border-t border-line pt-5" aria-labelledby="co-address-title">
                <div className="flex items-center justify-between gap-2 -my-3">
                  <h2 id="co-address-title" className={`font-sans ${EYEBROW}`}>Delivery address</h2>
                  <button type="button" onClick={handleAutoDetectLocation} disabled={isDetectingLocation} className={`${LINK} gap-1.5 disabled:opacity-60`}>
                    {isDetectingLocation ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> : <MapPin className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />}
                    Use my location
                  </button>
                </div>

                <div className="mt-3 space-y-3.5">
                  {/* PIN code and city side by side; the state follows on its own line */}
                  <div className="grid grid-cols-2 items-start gap-3">
                    <Field id="co-pincode" label="PIN code" error={pinError} helper={<span role="status">{pinHelp}</span>}>
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
                          aria-describedby={pinError ? 'co-pincode-error' : 'co-pincode-help'}
                          className={`${INPUT} pr-10`}
                        />
                        {pincodeLoading && <Loader2 className="absolute right-3.5 top-1/2 -mt-2 w-4 h-4 animate-spin text-ink-muted" strokeWidth={1.5} aria-label="Checking PIN code" />}
                        {pinFound && <Check className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink" strokeWidth={1.5} aria-hidden="true" />}
                      </div>
                    </Field>

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
                        className={INPUT}
                      />
                    </Field>
                  </div>

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
                        className={`${INPUT} appearance-none pr-9 truncate`}
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
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" strokeWidth={1.5} aria-hidden="true" />
                    </div>
                  </Field>

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
                      className={INPUT}
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
                      className={INPUT}
                    />
                  </Field>

                  <label htmlFor="saveAddr" className="flex items-center gap-2.5 min-h-11 text-[13px] leading-5 text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      id="saveAddr"
                      checked={saveAddressOption}
                      onChange={(e) => setSaveAddressOption(e.target.checked)}
                      className="w-[18px] h-[18px] shrink-0 accent-brand cursor-pointer"
                    />
                    Save this address for future orders
                  </label>
                </div>

                {/* One black button at the end of the form at every width (this step has no fixed bar), then a small facts line.
                    Its accessible name keeps "Deliver here" (the e2e test in worker/test/e2e finds the button by it). */}
                <button type="button" onClick={handleProceedToPaymentStep} aria-label="Deliver here: continue to secure payment" className="sag-btn-primary flex w-full mt-3 h-[52px] gap-2 px-3">
                  <Lock className="w-4 h-4 shrink-0" strokeWidth={1.5} aria-hidden="true" /> Continue to secure payment
                </button>
                <p className="mt-2.5 text-center text-[11.5px] leading-4 text-ink-muted">
                  {assuranceFacts().returns} · <a href={helpUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center underline decoration-1 underline-offset-4 hover:text-ink">Help on WhatsApp</a>
                </p>
              </section>
            </div>
          )}

          {/* STEP 2: PAY. White, hairline boxes: where it goes, the ways to pay, the price rows, one black pay
              button and WhatsApp help. Every number is the page's own preview; the pay button is the one
              existing pay action. */}
          {checkoutStep === 'payment' && (
            <div>

              {/* The finished address step: a plain hairline box with its summary and "Change".
                  The delivery date shows only when the owner has set delivery days. */}
              <div className="border border-line bg-surface px-3.5 py-3">
                <div className="flex items-center justify-between gap-3 -my-2">
                  <p className={EYEBROW}>Deliver to</p>
                  <button type="button" onClick={() => setCheckoutStep('details')} aria-label="Change address" className={`${LINK} shrink-0`}>Change</button>
                </div>
                <p className="sag-num mt-1.5 text-[13.5px] leading-5 text-ink">{[fullNameText, [address.city, address.pincode].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</p>
                {addressLine && <p className="mt-0.5 text-[11.5px] leading-4 text-ink-muted line-clamp-2">{addressLine}</p>}
                {deliveryEstimateText && <p className="mt-1.5 text-[11.5px] leading-4 text-ink-muted">Estimated delivery by <span className="text-ink">{deliveryEstimateText}</span></p>}
              </div>

              <section className="mt-6" aria-labelledby="co-pay-title">
                <h2 id="co-pay-title" className="font-display text-[19px] leading-6 text-ink">How would you like to pay?</h2>

                {codOn ? (
                  <div id="co-pay-mode" className="mt-3.5 grid gap-2.5" role="radiogroup" aria-label="How would you like to pay?">
                    {([
                      ['prepaid', 'Pay online now', prepaidDetail, finalCartTotal],
                      ['cod', 'Cash on delivery', `Pay ${rupees(codCharge)} now, ${rupees(codDue)} in cash at delivery`, codTotal],
                    ] as Array<['prepaid' | 'cod', string, string, number]>).map(([id, title, detail, amount]) => (
                      <label key={id} className={`cursor-pointer ${optionBox(payMode === id)}`}>
                        <input type="radio" name="payMode" value={id} checked={payMode === id} onChange={() => setPayMode(id)} disabled={isProcessing} className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-brand" />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[14.5px] leading-5 font-semibold text-ink">
                            {title}
                            {id === 'prepaid' && prepaidSaving > 0 && <span className="text-[10.5px] leading-4 font-semibold uppercase tracking-[0.06em] text-sale sag-num">Save {rupees(prepaidSaving)}</span>}
                          </span>
                          {detail && <span className="mt-0.5 block text-[13px] leading-[18px] text-ink-muted sag-num">{detail}</span>}
                        </span>
                        <span className="shrink-0 text-[15px] leading-5 font-semibold text-ink sag-num">{rupees(amount)}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  // Online payment is the one way to pay: the same box, already chosen
                  <div className={`mt-3.5 ${optionBox(true)}`}>
                    <span aria-hidden="true" className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-ink">
                      <span className="h-2.5 w-2.5 rounded-full bg-ink" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] leading-5 font-semibold text-ink">Pay online now</span>
                      {prepaidDetail && <span className="mt-0.5 block text-[13px] leading-[18px] text-ink-muted sag-num">{prepaidDetail}</span>}
                    </span>
                    <span className="shrink-0 text-[15px] leading-5 font-semibold text-ink sag-num">{rupees(finalCartTotal)}</span>
                  </div>
                )}

                {codChosen && prepaidSaving > 0 && (
                  <div id="co-prepaid-nudge" className="mt-2.5 bg-sunken p-3.5 text-ink">
                    <p className="text-[13.5px] leading-5 font-semibold sag-num">{storeOffers.prepaidPercent > 0 ? `${storeOffers.prepaidPercent}% off on prepaid orders` : 'Pay online and save'}</p>
                    <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted sag-num">Pay {rupees(finalCartTotal)} online instead of {rupees(codTotal)} and save <span className="font-semibold text-sale">{rupees(prepaidSaving)}</span>.</p>
                    <button type="button" onClick={() => setPayMode('prepaid')} className="sag-btn-outline mt-2.5 h-10 px-4 sag-num">Pay online and save {rupees(prepaidSaving)}</button>
                  </div>
                )}

                <div className="mt-3.5 space-y-2.5">
                  {gateways === null ? (
                    <div className="min-h-[52px] border border-line flex items-center justify-center gap-2 text-[13px] text-ink-muted" aria-busy="true" aria-label="Loading payment options">
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} /> Loading payment options…
                    </div>
                  ) : !gateways.razorpay && !gateways.payu ? (
                    <p className="flex items-start gap-2 bg-sunken px-3.5 py-3 text-[13px] leading-5 text-ink">
                      <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                      <span>Online payment is paused for a few minutes. Please try again shortly or message us on WhatsApp.</span>
                    </p>
                  ) : (
                    <>
                      {codChosen ? (
                        <p className="text-[11.5px] leading-4 text-ink-muted sag-num">The {rupees(codCharge)} is paid by UPI through Razorpay. It is not refunded if the parcel is refused at delivery.</p>
                      ) : paymentOptions.length === 1 ? (
                        // One way to pay: named in a quiet line (the black button below is the action)
                        <p className="text-[11.5px] leading-4 text-ink-muted">
                          <span className="font-semibold text-ink">{paymentOptions[0][1]}</span> · {paymentOptions[0][2]}
                        </p>
                      ) : (
                        <div className="space-y-2.5" role="radiogroup" aria-label="Payment method">
                          {paymentOptions.map(([id, title, detail]) => (
                            <label key={id} data-selected={gateway === id ? 'true' : undefined} className={`cursor-pointer ${optionBox(gateway === id)}`}>
                              <input type="radio" name="gateway" value={id} checked={gateway === id} onChange={() => setGateway(id)} className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-brand" />
                              <span className="flex-1 min-w-0">
                                <span className="block text-[14.5px] leading-5 font-semibold text-ink">{title}</span>
                                <span className="mt-0.5 block text-[13px] leading-[18px] text-ink-muted">{detail}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                      {prepaidDiscount > 0 && !codChosen && (
                        <p className="text-[11.5px] leading-4 font-semibold text-sale sag-num">
                          Online payment discount of ₹{prepaidDiscount.toLocaleString('en-IN')} applied.
                        </p>
                      )}
                    </>
                  )}

                  {inAppBrowser && (
                    <p className="flex items-start gap-2 bg-sunken px-3.5 py-3 text-[13px] leading-5 text-ink">
                      <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                      <span>
                        You are inside the {inAppBrowser} app. UPI apps (Google Pay, PhonePe, Paytm) open best in your phone's browser:
                        tap <span className="font-semibold">⋮</span> (top right) → <span className="font-semibold">Open in browser / Chrome</span>, then pay.
                      </span>
                    </p>
                  )}
                </div>

                {/* The gift note: a plain checkbox row between hairlines. Nothing here has to be touched to pay. */}
                <div className="mt-5 border-t border-line">
                  <label className="flex items-center gap-2.5 min-h-[48px] text-[13.5px] leading-5 text-ink cursor-pointer">
                    <input type="checkbox" checked={addGiftNote} onChange={(e) => setAddGiftNote(e.target.checked)} className="w-[18px] h-[18px] shrink-0 accent-brand cursor-pointer" />
                    <Gift className="w-4 h-4 shrink-0" strokeWidth={1.5} aria-hidden="true" /> Add a gift note to the parcel
                  </label>
                  {addGiftNote && (
                    <textarea aria-label="Gift note" rows={2} maxLength={300} value={giftNoteText} onChange={(e) => setGiftNoteText(e.target.value)}
                      placeholder="Write a short message for the recipient"
                      className={`${INPUT} mb-4`} />
                  )}
                </div>

                {/* Price rows with a hairline above what is paid now. Cash on delivery: the advance is "Pay now"
                    and the cash amount is stated under it. Online: the bag's own price details (phones and tablets;
                    on desktop they are in the order summary beside this column, so only the amount is repeated). */}
                <div className="border-t border-line pt-4">
                  {codChosen ? (
                    <>
                      <dl className="text-[13.5px] leading-5 text-ink sag-num">
                        <div className={kvRow}><dt className="text-ink-muted">Cash when the parcel arrives</dt><dd>{rupees(codDue)}</dd></div>
                        <div className={kvRow}><dt className="text-ink-muted">Cash on delivery shipping</dt><dd>{rupees(codCharge)}</dd></div>
                        <div className={kvRow}><dt className="text-ink-muted">Order total</dt><dd>{rupees(codTotal)}</dd></div>
                        <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-3 text-[17px] leading-6 font-semibold">
                          <dt>Pay now</dt><dd>{rupees(codCharge)}</dd>
                        </div>
                      </dl>
                      <p className="sag-num mt-1 text-[13px] leading-[18px] text-ink">+ {rupees(codDue)} in cash when the parcel arrives</p>
                    </>
                  ) : (
                    <>
                      <div className="lg:hidden"><PriceDetails totalLabel="To pay" /></div>
                      <div className="hidden lg:block sag-num">
                        <p className="flex items-baseline justify-between gap-3 text-[17px] leading-6 font-semibold text-ink"><span>To pay</span><span>{rupees(finalCartTotal)}</span></p>
                        {totalSavings > 0 && <p className="mt-1 text-xs leading-4 font-semibold text-sale">You saved {rupees(Math.round(totalSavings))}</p>}
                      </div>
                    </>
                  )}
                </div>

                {/* The one pay button at every width (this step has no fixed bar): black, with a thin lock */}
                <button type="button" onClick={handlePlacePrepaidOrder} disabled={payDisabled} className="sag-btn-primary flex w-full mt-[18px] h-[52px] gap-2 px-3 disabled:opacity-60">
                  {payButtonContent}
                </button>
                <p className="mt-2.5 text-center text-[11.5px] leading-4 text-ink-muted">{securedByText}</p>
                <p className="mt-1 text-center text-[11.5px] leading-4 text-ink-muted">Your order is confirmed only after the payment is verified. Receipt on your email.</p>
                <p className="mt-2 text-center">
                  <a href={helpUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
                    Trouble paying? Chat with us on WhatsApp
                  </a>
                </p>
              </section>
            </div>
          )}

        </div>

        {/* Order summary (items, coupon, price details). Phones: one collapsed hairline box on top that opens in
            place, on both steps. Desktop: the right column. It holds no <select>. */}
        <aside className="lg:col-span-5 lg:sticky lg:top-6 lg:order-none min-w-0 order-first" aria-label="Order summary">
          <div className="border border-line bg-surface overflow-hidden">
              <button type="button" onClick={() => setSummaryOpen((open) => !open)} aria-expanded={summaryOpen} aria-controls="co-order-summary"
                className="lg:hidden w-full flex items-center gap-3 p-3 text-left cursor-pointer">
                {/* The first photos, the count and total, the real saving */}
                <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
                  {cart.slice(0, 3).map((item) => (
                    <img key={item.id} src={getCleanImageUrl(lineImage(item), 200)} alt="" width={44} height={55}
                      className="aspect-[4/5] w-11 object-cover object-top bg-sunken" />
                  ))}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] leading-5 font-semibold text-ink sag-num">{itemsText} · {rupees(codChosen ? codTotal : finalCartTotal)}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-4 text-ink-muted">
                    {summarySavings > 0 && <span className="sag-num font-semibold text-sale">You save {rupees(Math.round(summarySavings))}</span>}
                    {summarySavings > 0 ? ' · ' : ''}{appliedCoupon ? `Coupon ${appliedCoupon.code} applied` : 'Have a coupon?'}
                  </span>
                </span>
                <span className="shrink-0 text-[12.5px] font-semibold text-ink underline decoration-1 underline-offset-4">
                  {summaryOpen ? 'Hide' : 'View'}
                </span>
              </button>

            <div id="co-order-summary" className={`${summaryOpen ? 'block' : 'hidden'} lg:block border-t border-line lg:border-t-0 p-3.5 sm:p-6 space-y-4`}>
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3 -mt-2 lg:-mt-1">
                    <h2 className={`font-sans ${EYEBROW}`}>Order summary <span className="font-normal normal-case tracking-normal text-ink-muted sag-num">· {itemsText}</span></h2>
                    <button type="button" onClick={() => setActivePage('cart')} className={`${LINK} shrink-0`}>Edit bag</button>
                  </div>
                  <div className="max-h-80 overflow-y-auto">{itemLines}</div>
                </div>

              {/* Coupon */}
              <div className="pt-4 border-t border-line">
                {appliedCoupon ? (
                  <div className="flex items-center justify-between gap-3 border border-line bg-surface px-3.5 min-h-[52px] text-ink">
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Check className="w-[18px] h-[18px] shrink-0 text-sale" strokeWidth={1.5} aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block text-[13.5px] leading-5 truncate">Code <span className="font-semibold">{appliedCoupon.code}</span> applied</span>
                        <span className="block text-[11.5px] leading-4 text-sale sag-num">You save ₹{discountAmount.toLocaleString('en-IN')} with this coupon</span>
                      </span>
                    </span>
                    <button type="button" onClick={removeCoupon} className={`${LINK} shrink-0`}>
                      Remove
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2 -my-3">
                      <p className={`${LABEL} mb-0`}>Coupon code</p>
                      {coupons.length > 0 && (
                        <button type="button" onClick={() => setShowCouponsModal(true)} className={LINK}>
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
                        className={`${INPUT} flex-1 min-w-0 h-12 uppercase placeholder:normal-case`}
                      />
                      <button type="submit" className="sag-btn-outline h-12 px-4">
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

      </div>

      {/* Available coupons: a sheet on phones, a dialog on wider screens */}
      {showCouponsModal && (
        <div className="fixed inset-0 z-[60] bg-ink/50 flex items-end sm:items-center justify-center sm:p-4 animate-fadeIn" onClick={() => setShowCouponsModal(false)}>
          <div role="dialog" aria-modal="true" aria-label="Available coupons" onClick={(e) => e.stopPropagation()} className="bg-surface w-full sm:max-w-lg max-h-[85dvh] overflow-hidden flex flex-col">

            <div className="flex items-center justify-between gap-3 pl-4 pr-1.5 min-h-14 border-b border-line">
              <div className="py-2.5">
                <h2 className="font-display text-[19px] leading-6 text-ink">Available coupons</h2>
                <p className="mt-0.5 text-[11.5px] leading-4 text-ink-muted">Tap Apply to use a coupon on this order</p>
              </div>
              <button type="button" onClick={() => setShowCouponsModal(false)} aria-label="Close coupons" className="w-11 h-11 shrink-0 flex items-center justify-center text-ink hover:bg-sunken cursor-pointer">
                <X className="w-[22px] h-[22px]" strokeWidth={1.5} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-2.5 flex-1 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {coupons && coupons.length > 0 ? (
                coupons.map((cp) => {
                  const isApplied = appliedCoupon?.code === cp.code;
                  const isEligible = cartSubtotal >= cp.minOrderValue;
                  const discountLabel = cp.discountType === 'percentage'
                    ? `${cp.discountValue}% off`
                    : `₹${cp.discountValue} off`;

                  return (
                    <div key={cp.id} className={`border bg-surface p-3.5 space-y-2 ${isApplied ? 'border-ink ring-1 ring-inset ring-ink' : 'border-line'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 text-[13.5px] leading-5">
                          <span className="font-semibold tracking-[0.04em] text-ink">{cp.code}</span>
                          <span className="ml-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-sale">{discountLabel}</span>
                        </p>

                        {isApplied ? (
                          <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink">
                            <Check className="w-4 h-4 text-sale" strokeWidth={1.5} aria-hidden="true" /> Applied
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
                            className="sag-btn-outline h-10 px-4 shrink-0"
                          >
                            Apply
                          </button>
                        )}
                      </div>

                      <p className="text-[11.5px] leading-4 text-ink-muted">
                        {cp.description || (cp.minOrderValue > 0
                          ? `Save ${discountLabel} on orders above ₹${cp.minOrderValue.toLocaleString('en-IN')}`
                          : `Save ${discountLabel} on your entire cart with no minimum order limit.`)}
                      </p>

                      {!isEligible && (
                        <p className="text-[11.5px] leading-4 font-semibold text-sale">
                          Add ₹{(cp.minOrderValue - cartSubtotal).toLocaleString('en-IN')} more to unlock this coupon.
                        </p>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="text-center text-[13px] text-ink-muted py-8">No coupons available right now.</p>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
