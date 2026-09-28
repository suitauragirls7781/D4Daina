import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useShop } from '../context/ShopContext';
import { COLLECTIONS, emailKey, getDocById, patchDoc, saveDoc } from '../lib/dataStore';
import { auth, db } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { markFirestoreQuotaExhausted, isQuotaExhausted } from '../utils/visitorTracker';
import { motion, AnimatePresence } from 'motion/react';
import { LoginPage } from './LoginPage';
import { 
  User, 
  Package, 
  Heart, 
  MapPin, 
  Shield, 
  LogOut, 
  ShoppingBag, 
  Clock, 
  CheckCircle2, 
  ChevronRight, 
  Edit3,
  Sparkles,
  Gift,
  Award,
  Trash2,
  BookmarkCheck,
  ShoppingBag as CartIcon,
  HelpCircle,
  Truck,
  RefreshCcw
} from 'lucide-react';
import { getCleanImageUrl } from '../utils/imageHelper';

export const AccountPage: React.FC = () => {
  const { user, logout } = useAuth();
  const { 
    setActivePage, 
    setIsLoginPageLogin, 
    recentOrders, 
    syncCustomerOrders,
    wishlist, 
    toggleWishlist, 
    addToCart, 
    showToast 
  } = useShop();

  const [activeTab, setActiveTab] = useState<'profile' | 'orders' | 'wishlist' | 'addresses' | 'style-lounge' | 'returns'>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab');
      if (tabParam === 'orders' || window.location.pathname === '/my-orders') return 'orders';
      if (tabParam === 'wishlist') return 'wishlist';
      if (tabParam === 'addresses') return 'addresses';
      if (tabParam === 'returns') return 'returns';
      if (tabParam === 'profile' || window.location.pathname === '/my-profile') return 'profile';
    }
    return 'profile';
  });
  
  // Returns Form State
  const [returnForm, setReturnForm] = useState({
    orderId: '',
    requestType: 'Return',
    reason: 'Size does not fit',
    comments: ''
  });
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnForm.orderId) {
      showToast('Please select an order.', 'error');
      return;
    }
    setIsSubmittingReturn(true);

    try {
      const targetOrder = recentOrders.find(o => o.orderNumber === returnForm.orderId);
      if (!targetOrder) throw new Error('The selected order could not be found in your account.');
      const returnNote = `[RETURN/EXCHANGE REQUEST] Type: ${returnForm.requestType} | Reason: ${returnForm.reason} | Note: ${returnForm.comments || 'None'}`;

      await patchDoc(COLLECTIONS.orders, targetOrder.orderNumber, {
        status: 'Refund Requested',
        notes: targetOrder.notes ? `${targetOrder.notes}\n${returnNote}` : returnNote
      });

      showToast(`Your ${returnForm.requestType.toLowerCase()} request for Order ${returnForm.orderId} is registered! Courier pickup will be scheduled within 48 hours.`, 'success');
      setReturnForm({ orderId: '', requestType: 'Return', reason: 'Size does not fit', comments: '' });
      await syncCustomerOrders(user?.email || profileData.phone);
    } catch (err) {
      showToast('Return request could not be saved. Please contact customer support.', 'error');
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  // Profile state
  const [profileData, setProfileData] = useState({
    fullName: '',
    phone: '',
    gender: 'Female',
    city: '',
    state: '',
    pincode: '',
    streetAddress: '',
  });
  const [isEditing, setIsEditing] = useState(false);
  const [pincodeLoading, setPincodeLoading] = useState(false);

  // Style Lounge Interactive State
  const [fitPreference, setFitPreference] = useState<'Slim' | 'Regular' | 'A-Line' | 'Anarkali'>('Regular');
  const [lengthPreference, setLengthPreference] = useState<'Short' | 'Knee-length' | 'Floor-length'>('Knee-length');
  const [favoriteColor, setFavoriteColor] = useState<string>('Maroon');
  const [isLoungeSaved, setIsLoungeSaved] = useState(false);

  // Load profile from the database & LocalStorage (NO fake default values!)
  useEffect(() => {
    if (user?.email) {
      const normEmail = user.email.toLowerCase().trim();
      const loadProfile = async () => {
        try {
          let loadedName = user.displayName || user.name || '';
          let loadedPhone = '';
          let loadedCity = '';
          let loadedState = '';
          let loadedPincode = '';
          let loadedAddress = '';
          let loadedGender = 'Female';

          // 1. Check user-specific localStorage first
          const savedLocal = localStorage.getItem(`sag_user_profile_${normEmail}`);
          if (savedLocal) {
            try {
              const parsed = JSON.parse(savedLocal);
              if (parsed.fullName) loadedName = parsed.fullName;
              if (parsed.phone || parsed.mobile) loadedPhone = parsed.phone || parsed.mobile;
              if (parsed.city) loadedCity = parsed.city;
              if (parsed.state) loadedState = parsed.state;
              if (parsed.pincode) loadedPincode = parsed.pincode;
              if (parsed.streetAddress || parsed.houseFlat) loadedAddress = parsed.streetAddress || parsed.houseFlat;
              if (parsed.gender) loadedGender = parsed.gender;
            } catch {}
          }

          // 1.5. Check Firestore DB customer doc
          try {
            const fsSnap = await getDoc(doc(db, 'customers', normEmail));
            if (fsSnap.exists()) {
              const fsData = fsSnap.data();
              if (fsData.name && (!loadedName || loadedName === normEmail.split('@')[0])) loadedName = fsData.name;
              if (fsData.phone && !loadedPhone) loadedPhone = fsData.phone;
              if (fsData.pincode && !loadedPincode) loadedPincode = fsData.pincode;
              if (fsData.city && !loadedCity) loadedCity = fsData.city;
              if (fsData.state && !loadedState) loadedState = fsData.state;
              if (fsData.streetAddress && !loadedAddress) loadedAddress = fsData.streetAddress;
              if (fsData.gender) loadedGender = fsData.gender;
            }
          } catch (fsErr) {}

          // 3. Load from the database profile
          const profData = await getDocById(COLLECTIONS.profiles, emailKey(normEmail));

          if (profData) {
            if (profData.name && !loadedName) loadedName = profData.name;
            if (profData.phone && !loadedPhone) loadedPhone = profData.phone;
            if (profData.city && !loadedCity) loadedCity = profData.city;
            if (profData.state && !loadedState) loadedState = profData.state;
            if (profData.pincode && !loadedPincode) loadedPincode = profData.pincode;
            if (profData.streetAddress && !loadedAddress) loadedAddress = profData.streetAddress;
            if (profData.gender && !savedLocal) loadedGender = profData.gender;
          }

          // Format derived name from email if name is still empty
          if (!loadedName && user.email) {
            const namePart = user.email.split('@')[0];
            loadedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
          }

          setProfileData({
            fullName: loadedName,
            phone: loadedPhone,
            gender: loadedGender,
            city: loadedCity,
            state: loadedState,
            pincode: loadedPincode,
            streetAddress: loadedAddress
          });

        } catch (e) {
          console.warn('Error fetching user profile:', e);
        }
      };

      loadProfile();
      syncCustomerOrders(normEmail);
    }
  }, [user]);

  // Handle Pincode Auto Lookup
  const handlePincodeChange = async (val: string) => {
    const cleanPin = val.replace(/\D/g, '').slice(0, 6);
    setProfileData(prev => ({ ...prev, pincode: cleanPin }));

    if (cleanPin.length === 6) {
      setPincodeLoading(true);
      try {
        const res = await fetch(`https://api.postalpincode.in/pincode/${cleanPin}`);
        const data = await res.json();
        if (data && data[0] && data[0].Status === 'Success' && data[0].PostOffice?.length > 0) {
          const po = data[0].PostOffice[0];
          setProfileData(prev => ({
            ...prev,
            city: po.District || po.Taluk || prev.city,
            state: po.State || prev.state
          }));
          showToast(`📍 Location detected: ${po.District || po.Taluk}, ${po.State}`, 'info');
        }
      } catch (err) {
        console.warn('Pincode lookup error:', err);
      } finally {
        setPincodeLoading(false);
      }
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user?.email) {
      const normEmail = user.email.toLowerCase().trim();
      const updatedProfile = {
        fullName: profileData.fullName,
        phone: profileData.phone,
        gender: profileData.gender,
        city: profileData.city,
        state: profileData.state,
        pincode: profileData.pincode,
        streetAddress: profileData.streetAddress,
      };

      try {
        // Save to LocalStorage per user email & current user
        localStorage.setItem(`sag_user_profile_${normEmail}`, JSON.stringify(updatedProfile));
        localStorage.setItem(`sag_user_profile_current`, JSON.stringify(updatedProfile));

        // Save / Update in Firestore DB
        try {
          const custDocRef = doc(db, 'customers', normEmail);
          await setDoc(custDocRef, {
            name: profileData.fullName,
            email: normEmail,
            phone: profileData.phone,
            status: 'active',
            pincode: profileData.pincode || '',
            city: profileData.city || '',
            state: profileData.state || '',
            streetAddress: profileData.streetAddress || '',
            gender: profileData.gender || 'Female',
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (fsErr) {}

        // Save / Update the database profile
        await saveDoc(COLLECTIONS.profiles, emailKey(normEmail), {
          email: emailKey(normEmail),
          name: profileData.fullName,
          phone: profileData.phone,
          pincode: profileData.pincode,
          city: profileData.city,
          state: profileData.state,
          streetAddress: profileData.streetAddress,
          gender: profileData.gender
        });

        setIsEditing(false);
        showToast('✨ Your wardrobe profile and delivery address saved successfully!', 'success');
      } catch (err) {
        localStorage.setItem(`sag_user_profile_${normEmail}`, JSON.stringify(updatedProfile));
        setIsEditing(false);
        showToast('Profile saved locally!', 'success');
      }
    }
  };

  const handleSaveStyleLounge = async () => {
    if (user?.email) {
      try {
        if (!isQuotaExhausted()) {
          const userDocRef = doc(db, 'users', user.uid);
          await setDoc(userDocRef, {
            stylePreferences: {
              fitPreference,
              lengthPreference,
              favoriteColor
            }
          }, { merge: true });
        }
        
        setIsLoungeSaved(true);
        showToast('Personalized style recommendations locked in!', 'success');
        setTimeout(() => setIsLoungeSaved(false), 3000);
      } catch (err: any) {
        if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota')) {
          markFirestoreQuotaExhausted();
        }
        setIsLoungeSaved(true);
        showToast('Personalized style recommendations locked in!', 'success');
        setTimeout(() => setIsLoungeSaved(false), 3000);
      }
    }
  };

  const handleLogout = async () => {
    await logout();
    showToast('Successfully logged out from your Aura Account.', 'info');
    setActivePage('home');
  };

  const handleWishlistToCart = (prod: any) => {
    addToCart(prod, 'M', prod.colors?.[0] || { name: 'Original', code: '#241D1B' });
    toggleWishlist(prod);
    showToast(`${prod.name} successfully transferred to your Bag!`, 'success');
  };

  if (!user) {
    return <LoginPage />;
  }

  // Loyalty calculations
  const totalSpent = recentOrders.reduce((sum, ord: any) => sum + (Number(ord.finalTotal || ord.subtotal || ord.totalAmount) || 0), 0);
  const rewardsTier = totalSpent >= 15000 ? 'Platinum Status' : totalSpent >= 5000 ? 'Gold Status' : 'Silver Status';
  const pointsEarned = isNaN(totalSpent) ? 0 : Math.round(totalSpent / 10);
  const pointsToNext = rewardsTier === 'Platinum Status' ? 0 : rewardsTier === 'Gold Status' ? Math.max(0, 1500 - pointsEarned) : Math.max(0, 500 - pointsEarned);

  return (
    <div id="account-dashboard-root" className="max-w-7xl mx-auto py-8 sm:py-10 px-4 sm:px-6 lg:px-8 bg-[#FDFBF7] min-h-screen">
      
      {/* Dynamic Luxury Account Header Banner */}
      <div className="bg-[#3D0F1F] p-6 sm:p-8 text-[#FAF5EB] mb-8 flex flex-col md:flex-row items-center justify-between gap-6 border border-[#B8935A]/35">
        
        <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left z-10">
          {/* VIP Letter circle */}
          <div className="w-20 h-20 rounded-full bg-[#B8935A] text-[#3D0F1F] border border-[#DFBE65] flex items-center justify-center font-serif text-3xl font-semibold uppercase select-none">
            {profileData.fullName ? profileData.fullName.charAt(0) : user.email?.charAt(0) || 'U'}
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <span className="px-3 py-0.5 bg-[#B8935A] text-[#3D0F1F] text-[9px] font-semibold uppercase tracking-widest flex items-center gap-1">
                <Award className="w-3 h-3 text-[#211C1A]" />
                {rewardsTier}
              </span>
              <span className="px-2.5 py-0.5 text-[#DFBE65] text-[9px] font-semibold uppercase tracking-widest border border-[#B8935A]/35">
                ⭐ {pointsEarned} Points
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif font-semibold text-[#FAF5EB]">
              {profileData.fullName || 'Valued Customer'}
            </h1>
            <p className="text-[#FAF5EB]/65 text-xs font-mono">{user.email}</p>
          </div>
        </div>

        <button 
          onClick={handleLogout}
          className="px-5 py-2.5 bg-transparent hover:bg-[#FAF5EB]/10 border border-[#B8935A]/40 text-xs font-semibold uppercase tracking-wider transition-colors flex items-center gap-2 cursor-pointer text-[#FAF5EB]"
        >
          <LogOut className="w-3.5 h-3.5 text-black" />
          <span>Sign Out</span>
        </button>
      </div>

      {/* Main Dashboard Grid layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Navigation Sidebar */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-[#FAF5EB] p-3 border border-[#B8935A]/25 space-y-1">
            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center justify-between px-4 py-3 text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'profile' 
                  ? 'bg-[#3D0F1F] text-[#FAF5EB]' 
                  : 'text-[#3D0F1F]/75 hover:bg-[#FDFBF7] hover:text-[#3D0F1F]'
              }`}
            >
              <div className="flex items-center gap-3">
                <User className="w-4 h-4 text-black" />
                <span>My Profile</span>
              </div>
              <ChevronRight className="w-4 h-4 opacity-50" />
            </button>

            <button
              onClick={() => setActiveTab('style-lounge')}
              className={`w-full flex items-center justify-between px-4 py-3 text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'style-lounge' 
                  ? 'bg-[#3D0F1F] text-[#FAF5EB]' 
                  : 'text-[#3D0F1F]/75 hover:bg-[#FDFBF7] hover:text-[#3D0F1F]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Sparkles className="w-4 h-4 text-black" />
                <span>My Style Lounge</span>
              </div>
              <ChevronRight className="w-4 h-4 opacity-50" />
            </button>

            <button
              onClick={() => setActiveTab('orders')}
              className={`w-full flex items-center justify-between px-4 py-3 text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'orders' 
                  ? 'bg-[#3D0F1F] text-[#FAF5EB]' 
                  : 'text-[#3D0F1F]/75 hover:bg-[#FDFBF7] hover:text-[#3D0F1F]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Package className="w-4 h-4 text-black" />
                <span>My Orders ({recentOrders.length})</span>
              </div>
              <ChevronRight className="w-4 h-4 opacity-50" />
            </button>

            <button
              onClick={() => setActiveTab('wishlist')}
              className={`w-full flex items-center justify-between px-4 py-3 text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'wishlist' 
                  ? 'bg-[#3D0F1F] text-[#FAF5EB]' 
                  : 'text-[#3D0F1F]/70 hover:bg-[#FDFBF7] hover:text-[#3D0F1F]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Heart className="w-4 h-4" />
                <span>My Wishlist ({wishlist.length})</span>
              </div>
              <ChevronRight className="w-4 h-4 opacity-50" />
            </button>

            <button
              onClick={() => setActiveTab('addresses')}
              className={`w-full flex items-center justify-between px-4 py-3 text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'addresses' 
                  ? 'bg-[#3D0F1F] text-[#FAF5EB]' 
                  : 'text-[#3D0F1F]/70 hover:bg-[#FDFBF7] hover:text-[#3D0F1F]'
              }`}
            >
              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4" />
                <span>Saved Address</span>
              </div>
              <ChevronRight className="w-4 h-4 opacity-50" />
            </button>

            <button
              onClick={() => setActiveTab('returns')}
              className={`w-full flex items-center justify-between px-4 py-3 text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'returns' 
                  ? 'bg-[#3D0F1F] text-[#FAF5EB]' 
                  : 'text-[#3D0F1F]/70 hover:bg-[#FDFBF7] hover:text-[#3D0F1F]'
              }`}
            >
              <div className="flex items-center gap-3">
                <RefreshCcw className="w-4 h-4" />
                <span>Returns & Exchanges</span>
              </div>
              <ChevronRight className="w-4 h-4 opacity-50" />
            </button>
          </div>

          {/* Interactive Loyalty Progress Widget */}
          <div className="bg-[#3D0F1F] p-5 text-[#FAF5EB] space-y-3.5 border border-[#B8935A]/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest font-bold text-black">Club Rewards Lounge</span>
              <Gift className="w-4 h-4 text-black animate-bounce" />
            </div>
            
            <div className="space-y-1">
              <p className="text-xs font-semibold">Rewards Points Balance: <strong className="text-base text-black">{pointsEarned}</strong></p>
              {pointsToNext > 0 ? (
                <p className="text-[10px] text-rose-200">Earn <strong className="text-white">{pointsToNext} more</strong> points to unlock next VIP rank & free items.</p>
              ) : (
                <p className="text-[10px] text-black">💎 You are at our peak Platinum rank! Enjoy lifetime free delivery.</p>
              )}
            </div>

            <div className="w-full bg-black/30 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-gradient-to-r from-amber-400 to-yellow-200 h-full rounded-full transition-all duration-1000"
                style={{ width: `${Math.min(100, (pointsEarned / (rewardsTier === 'Silver Status' ? 500 : 1500)) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Dynamic Interactive Content Tabs */}
        <div className="lg:col-span-9">
          <AnimatePresence mode="wait">
            
            {/* TAB 1: PROFILE & DETAILS */}
            {activeTab === 'profile' && (
              <motion.div 
                key="tab-profile"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-\[#FAF7F2\] rounded-2xl p-6 sm:p-8 shadow-sm border border-rose-50/40 space-y-6"
              >
                <div className="flex items-center justify-between border-b border-rose-50 pb-4">
                  <div>
                    <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#2C1820]">Personal Wardrobe Profile</h2>
                    <p className="text-xs text-gray-400">View and refine your personal details</p>
                  </div>
                  {!isEditing && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="px-4 py-2 bg-[#D8C8B8]/20 hover:bg-[#241D1B] text-[#211C1A] hover:text-[#211C1A] border border-rose-100 rounded-lg text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit Info</span>
                    </button>
                  )}
                </div>

                {!isEditing ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 bg-[#D8C8B8]/10 rounded-xl border border-rose-50/50">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Full Name</span>
                      <span className="text-xs sm:text-sm font-semibold text-gray-800 mt-1 block">{profileData.fullName || 'Not specified'}</span>
                    </div>
                    <div className="p-4 bg-[#D8C8B8]/10 rounded-xl border border-rose-50/50">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Email Username</span>
                      <span className="text-xs sm:text-sm font-semibold text-gray-800 mt-1 block">{user.email}</span>
                    </div>
                    <div className="p-4 bg-[#D8C8B8]/10 rounded-xl border border-rose-50/50">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Mobile Contact</span>
                      <span className="text-xs sm:text-sm font-semibold text-gray-800 mt-1 block">{profileData.phone || 'Not linked'}</span>
                    </div>
                    <div className="p-4 bg-[#D8C8B8]/10 rounded-xl border border-rose-50/50">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">City & State</span>
                      <span className="text-xs sm:text-sm font-semibold text-gray-800 mt-1 block">
                        {profileData.city ? (profileData.state ? `${profileData.city}, ${profileData.state}` : profileData.city) : 'Not specified'}
                      </span>
                    </div>
                    <div className="p-4 bg-[#D8C8B8]/10 rounded-xl border border-rose-50/50">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Pincode</span>
                      <span className="text-xs sm:text-sm font-semibold text-gray-800 mt-1 block">{profileData.pincode || 'Not specified'}</span>
                    </div>
                    <div className="p-4 bg-[#D8C8B8]/10 rounded-xl border border-rose-50/50">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Street Address</span>
                      <span className="text-xs sm:text-sm font-semibold text-gray-800 mt-1 block truncate">{profileData.streetAddress || 'Not specified'}</span>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSaveProfile} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-[#211C1A] mb-1">Full Name</label>
                        <input
                          type="text"
                          required
                          value={profileData.fullName}
                          onChange={(e) => setProfileData({ ...profileData, fullName: e.target.value })}
                          placeholder="Your Full Name"
                          className="w-full px-3.5 py-2.5 bg-[#F1E8DF] border border-[#9A6A3A]/30 rounded-xl text-xs sm:text-sm text-[#211C1A] focus:ring-1 focus:ring-[#241D1B] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-[#211C1A] mb-1">Mobile Phone</label>
                        <input
                          type="text"
                          maxLength={10}
                          value={profileData.phone}
                          onChange={(e) => setProfileData({ ...profileData, phone: e.target.value.replace(/\D/g, '') })}
                          placeholder="10-digit mobile number"
                          className="w-full px-3.5 py-2.5 bg-[#F1E8DF] border border-[#9A6A3A]/30 rounded-xl text-xs sm:text-sm text-[#211C1A] focus:ring-1 focus:ring-[#241D1B] focus:outline-none"
                        />
                      </div>
                      <div className="relative">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-[#211C1A] mb-1 flex items-center justify-between">
                          <span>Pincode</span>
                          {pincodeLoading && <span className="text-[10px] text-black font-normal animate-pulse">Detecting City & State...</span>}
                        </label>
                        <input
                          type="text"
                          maxLength={6}
                          value={profileData.pincode}
                          onChange={(e) => handlePincodeChange(e.target.value)}
                          placeholder="6-digit PIN code (Auto-detects location)"
                          className="w-full px-3.5 py-2.5 bg-[#F1E8DF] border border-[#9A6A3A]/30 rounded-xl text-xs sm:text-sm text-[#211C1A] focus:ring-1 focus:ring-[#241D1B] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-[#211C1A] mb-1">City</label>
                        <input
                          type="text"
                          value={profileData.city}
                          onChange={(e) => setProfileData({ ...profileData, city: e.target.value })}
                          placeholder="e.g. Artisan, Delhi, Mumbai"
                          className="w-full px-3.5 py-2.5 bg-[#F1E8DF] border border-[#9A6A3A]/30 rounded-xl text-xs sm:text-sm text-[#211C1A] focus:ring-1 focus:ring-[#241D1B] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-[#211C1A] mb-1">State</label>
                        <input
                          type="text"
                          value={profileData.state}
                          onChange={(e) => setProfileData({ ...profileData, state: e.target.value })}
                          placeholder="e.g. Rajasthan, Maharashtra"
                          className="w-full px-3.5 py-2.5 bg-[#F1E8DF] border border-[#9A6A3A]/30 rounded-xl text-xs sm:text-sm text-[#211C1A] focus:ring-1 focus:ring-[#241D1B] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-[#211C1A] mb-1">House / Street Address</label>
                        <input
                          type="text"
                          value={profileData.streetAddress}
                          onChange={(e) => setProfileData({ ...profileData, streetAddress: e.target.value })}
                          placeholder="Flat, House no., Building, Street"
                          className="w-full px-3.5 py-2.5 bg-[#F1E8DF] border border-[#9A6A3A]/30 rounded-xl text-xs sm:text-sm text-[#211C1A] focus:ring-1 focus:ring-[#241D1B] focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex gap-3 pt-3">
                      <button
                        type="submit"
                        className="px-6 py-3 bg-[#241D1B] hover:bg-[#241D1B] text-[#211C1A] rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border border-[#9A6A3A]/30 shadow-xs"
                      >
                        Save Profile & Address
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        className="px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </motion.div>
            )}

            {/* TAB 5: STYLE LOUNGE PREFERENCES */}
            {activeTab === 'style-lounge' && (
              <motion.div 
                key="tab-lounge"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-\[#FAF7F2\] rounded-2xl p-6 sm:p-8 shadow-sm border border-rose-50/40 space-y-6"
              >
                <div className="border-b border-rose-50 pb-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-black" />
                    <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#2C1820]">Personalized Style Lounge</h2>
                  </div>
                  <p className="text-xs text-gray-400">Lock in your fit and length choices for a highly tailored boutique catalog</p>
                </div>

                <div className="space-y-6">
                  {/* Fit Preferences */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#2C1820]">1. Preferred Suit / Kurta Fit</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {['Slim', 'Regular', 'A-Line', 'Anarkali'].map((fit) => (
                        <button
                          key={fit}
                          onClick={() => setFitPreference(fit as any)}
                          className={`py-3 px-2 text-xs font-bold border-2 rounded-xl transition-all ${
                            fitPreference === fit 
                              ? 'border-[#241D1B] bg-[#D8C8B8]/30 text-[#211C1A]' 
                              : 'border-gray-100 hover:border-rose-100 text-gray-600'
                          }`}
                        >
                          {fit}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Length Preferences */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#2C1820]">2. Desired Length</h4>
                    <div className="grid grid-cols-3 gap-2.5">
                      {['Short', 'Knee-length', 'Floor-length'].map((len) => (
                        <button
                          key={len}
                          onClick={() => setLengthPreference(len as any)}
                          className={`py-3 px-2 text-xs font-bold border-2 rounded-xl transition-all ${
                            lengthPreference === len 
                              ? 'border-[#241D1B] bg-[#D8C8B8]/30 text-[#211C1A]' 
                              : 'border-gray-100 hover:border-rose-100 text-gray-600'
                          }`}
                        >
                          {len}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Favorite Colors */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#2C1820]">3. Handpicked Color Theme</h4>
                    <div className="flex flex-wrap gap-2">
                      {['Maroon', 'Peach Gold', 'Classic Indigo', 'Ivory Cream', 'Emerald Green', 'Sunset Orange'].map((col) => (
                        <button
                          key={col}
                          onClick={() => setFavoriteColor(col)}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                            favoriteColor === col 
                              ? 'bg-[#241D1B] text-[#211C1A] border-[#241D1B]' 
                              : 'bg-[#D8C8B8]/10 border-gray-200 text-gray-600 hover:bg-[#D8C8B8]/40'
                          }`}
                        >
                          {col}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Recommendations preview */}
                  <div className="p-4 bg-[#D8C8B8]/30 border border-rose-100/40 rounded-xl space-y-2 text-xs">
                    <p className="font-bold text-[#211C1A] flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-black" />
                      Our recommendation for you:
                    </p>
                    <p className="text-gray-600 leading-relaxed">
                      Based on your choices, we suggest exploring our <strong>{fitPreference} fit</strong> collections, showcasing rich <strong>{favoriteColor} and pastel</strong> shades in graceful <strong>{lengthPreference} designs</strong>!
                    </p>
                  </div>

                  {/* Save style lounge button */}
                  <div>
                    <button
                      type="button"
                      onClick={handleSaveStyleLounge}
                      className="px-6 py-3 bg-[#241D1B] hover:bg-[#3d0c1e] text-[#211C1A] font-bold text-xs uppercase tracking-widest rounded-xl shadow transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <BookmarkCheck className="w-4 h-4" />
                      <span>{isLoungeSaved ? 'preferences Locked!' : 'Lock My Preferences'}</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB 2: MY ORDERS & Tracking Stepper */}
            {activeTab === 'orders' && (
              <motion.div 
                key="tab-orders"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-\[#FAF7F2\] rounded-2xl p-6 sm:p-8 shadow-sm border border-rose-50/40 space-y-6"
              >
                <div className="border-b border-rose-50 pb-4">
                  <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#2C1820]">My Orders & Live Dispatch</h2>
                  <p className="text-xs text-gray-400">Track current shipments and view order history</p>
                </div>

                {recentOrders.length === 0 ? (
                  <div className="text-center py-16 space-y-4">
                    <Package className="w-16 h-16 text-gray-300 mx-auto" />
                    <h3 className="font-serif text-lg font-bold text-gray-700">No Orders Found</h3>
                    <p className="text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">
                      You haven't placed any ethnic wardrobe orders yet. Explore our designer collections to shop!
                    </p>
                    <button
                      onClick={() => setActivePage('shop')}
                      className="px-6 py-3 bg-[#241D1B] text-[#211C1A] rounded-xl text-xs font-bold uppercase tracking-widest transition-all cursor-pointer shadow hover:shadow-md"
                    >
                      Explore Designer Suits
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {recentOrders.map((ord, idx) => (
                      <div key={ord.orderNumber || idx} className="border border-rose-100 rounded-2xl p-5 bg-[#D8C8B8]/10 hover:shadow shadow-sm transition-all space-y-5">
                        
                        {/* Order ID & Status Header */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-rose-50 pb-3">
                          <div>
                            <span className="text-xs font-mono font-bold text-[#211C1A] uppercase">Order: #{ord.orderNumber || `SAG-${Date.now().toString().slice(-6)}`}</span>
                            <span className="text-[10px] text-gray-400 block mt-0.5">Placed on {ord.date || 'Today'}</span>
                          </div>
                          <span className="px-3 py-1 bg-emerald-50 border border-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider rounded-full flex items-center gap-1 shrink-0">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {ord.status || 'Paid & Dispatched'}
                          </span>
                        </div>

                        {/* HIGHLY INTERACTIVE REAL-TIME DISPATCH STEPPER TIMELINE */}
                        <div className="py-4 px-2 sm:px-6 bg-[#D8C8B8]/20 rounded-xl border border-rose-100/40">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-[#211C1A] mb-4 flex items-center gap-1">
                            <Truck className="w-3.5 h-3.5 text-black" />
                            Live Delivery dispatch tracker
                          </p>
                          
                          <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0">
                            {/* Connector bar for larger screens */}
                            <div className="absolute left-[15px] sm:left-4 sm:right-4 top-8 sm:top-4 bottom-8 sm:bottom-auto h-full sm:h-0.5 bg-rose-200/50 -z-10" />
                            <div className="absolute left-[15px] sm:left-4 top-8 sm:top-4 h-1/2 sm:h-0.5 bg-[#241D1B] -z-10" style={{ width: '66%' }} />

                            {/* Timeline Node 1 */}
                            <div className="flex sm:flex-col items-center gap-3 sm:gap-2">
                              <div className="w-8 h-8 rounded-full bg-[#241D1B] text-[#211C1A] flex items-center justify-center text-xs font-bold">
                                ✓
                              </div>
                              <div className="sm:text-center">
                                <p className="text-[10px] font-bold text-gray-800 uppercase tracking-wider">Confirmed</p>
                                <p className="text-[9px] text-gray-400">Order Placed</p>
                              </div>
                            </div>

                            {/* Timeline Node 2 */}
                            <div className="flex sm:flex-col items-center gap-3 sm:gap-2">
                              <div className="w-8 h-8 rounded-full bg-[#241D1B] text-[#211C1A] flex items-center justify-center text-xs font-bold">
                                ✓
                              </div>
                              <div className="sm:text-center">
                                <p className="text-[10px] font-bold text-gray-800 uppercase tracking-wider">Handcrafted</p>
                                <p className="text-[9px] text-gray-400">Packed & Dispatched</p>
                              </div>
                            </div>

                            {/* Timeline Node 3 */}
                            <div className="flex sm:flex-col items-center gap-3 sm:gap-2">
                              <div className="w-8 h-8 rounded-full bg-[#D8C8B8]/40 text-[#211C1A] border-2 border-[#241D1B] flex items-center justify-center text-xs font-bold animate-pulse">
                                🚚
                              </div>
                              <div className="sm:text-center">
                                <p className="text-[10px] font-bold text-[#211C1A] uppercase tracking-wider">In Transit</p>
                                <p className="text-[9px] text-gray-400">Express Courier Delivery</p>
                              </div>
                            </div>

                            {/* Timeline Node 4 */}
                            <div className="flex sm:flex-col items-center gap-3 sm:gap-2">
                              <div className="w-8 h-8 rounded-full bg-\[#FAF7F2\] text-gray-300 border-2 border-gray-200 flex items-center justify-center text-xs font-bold">
                                4
                              </div>
                              <div className="sm:text-center">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Delivered</p>
                                <p className="text-[9px] text-gray-400">Arrives in 2-3 Days</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Order Items */}
                        <div className="divide-y divide-rose-50">
                          {ord.items.map((it, i) => {
                            const selectedColorName = it.selectedColor?.name;
                            const selectedColorHex = it.selectedColor?.hex;
                            const colorsList = it.product?.colors || [];
                            const colorIdx = colorsList.findIndex((c: any) => c.name === selectedColorName || c.hex === selectedColorHex);
                            const itemImg = it.selectedColor?.imageUrl 
                              || (colorIdx !== -1 && it.product?.images?.[colorIdx])
                              || it.product?.images?.[0] 
                              || 'https://placehold.co/150';

                            return (
                              <div key={i} className="py-3 flex gap-4 items-center justify-between">
                                <div className="flex items-center gap-3 min-w-0">
                                  <img 
                                    src={getCleanImageUrl(itemImg)} 
                                    alt={it.product.name} 
                                    className="w-11 h-14 object-cover rounded-lg border shrink-0" 
                                  />
                                <div className="min-w-0">
                                  <h4 className="font-serif text-sm font-bold text-gray-900 truncate">{it.product.name}</h4>
                                  <p className="text-[11px] text-gray-500">Size: <strong className="text-gray-700">{it.selectedSize}</strong> | Color: <strong className="text-gray-700">{it.selectedColor.name}</strong> | Qty: {it.quantity}</p>
                                </div>
                              </div>
                              <span className="font-serif font-bold text-xs text-[#211C1A] shrink-0">₹{(it.product.price * it.quantity).toLocaleString('en-IN')}</span>
                            </div>
                           );
                          })}
                        </div>

                        {/* Order Address & Price footer */}
                        <div className="border-t border-rose-50 pt-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
                          <p className="text-gray-400">Delivery Address: <strong className="text-gray-700">{ord.deliveryAddress?.houseFlat || profileData.streetAddress}, {ord.deliveryAddress?.city || profileData.city}</strong></p>
                          <p className="font-serif text-sm font-bold text-[#211C1A]">Paid Total: ₹{((ord as any).finalTotal || (ord as any).subtotal || 0).toLocaleString('en-IN')}</p>
                        </div>

                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* TAB 3: WISHLIST with Instant Add Size pop */}
            {activeTab === 'wishlist' && (
              <motion.div 
                key="tab-wishlist"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-\[#FAF7F2\] rounded-2xl p-6 sm:p-8 shadow-sm border border-rose-50/40 space-y-6"
              >
                <div className="border-b border-rose-50 pb-4">
                  <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#2C1820]">My Designer Favorites</h2>
                  <p className="text-xs text-gray-400">Luxury products saved for your special occasions</p>
                </div>

                {wishlist.length === 0 ? (
                  <div className="text-center py-16 space-y-4">
                    <Heart className="w-16 h-16 text-gray-200 mx-auto" />
                    <h3 className="font-serif text-lg font-bold text-gray-700">Wishlist is Empty</h3>
                    <p className="text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">
                      Tap the heart icon on any designer ethnic dress to store it in your digital wardrobe lounge.
                    </p>
                    <button
                      onClick={() => setActivePage('shop')}
                      className="px-6 py-3 bg-[#241D1B] text-[#211C1A] rounded-xl text-xs font-bold uppercase tracking-widest transition-all cursor-pointer shadow hover:shadow-md"
                    >
                      Shop Exclusive Suits
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {wishlist.map((prod) => (
                      <div key={prod.id} className="border border-rose-100/60 rounded-2xl p-4 flex gap-4 bg-\[#FAF7F2\] hover:shadow transition-all relative">
                        <button
                          onClick={() => toggleWishlist(prod)}
                          className="absolute top-3 right-3 text-gray-400 hover:text-[#211C1A] transition cursor-pointer"
                          title="Remove favorite"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        
                        <img 
                          src={getCleanImageUrl(prod.images?.[0] || 'https://placehold.co/150')} 
                          alt={prod.name} 
                          className="w-18 h-24 object-cover rounded-xl border border-rose-50 shrink-0" 
                        />
                        
                        <div className="flex-1 flex flex-col justify-between min-w-0">
                          <div>
                            <span className="text-[9px] uppercase tracking-widest font-bold text-black">{prod.category}</span>
                            <h4 className="font-serif font-bold text-sm text-gray-900 truncate pr-4">{prod.name}</h4>
                            <span className="font-serif font-bold text-sm text-[#211C1A] mt-1 block">₹{prod.price.toLocaleString('en-IN')}</span>
                          </div>
                          
                          <button
                            onClick={() => handleWishlistToCart(prod)}
                            className="w-full py-2 bg-[#D8C8B8]/20 hover:bg-[#241D1B] text-[#211C1A] hover:text-[#211C1A] rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <CartIcon className="w-3.5 h-3.5" />
                            <span>Quick Add to Bag (Size M)</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* TAB 4: ADDRESSES */}
            {activeTab === 'addresses' && (
              <motion.div 
                key="tab-addresses"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-\[#FAF7F2\] rounded-2xl p-6 sm:p-8 shadow-sm border border-rose-50/40 space-y-6"
              >
                <div className="border-b border-rose-50 pb-4">
                  <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#2C1820]">Saved Shipping Address</h2>
                  <p className="text-xs text-gray-400">Set primary coordinates for single-tap safe checkout</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {profileData.streetAddress || profileData.city ? (
                    <div className="border-2 border-[#241D1B] rounded-2xl p-5 bg-[#F1E8DF] relative space-y-3">
                      <span className="absolute top-4 right-4 px-2.5 py-0.5 bg-[#241D1B] text-[#211C1A] text-[9px] font-bold uppercase tracking-widest rounded-full">Primary Address</span>
                      <div className="flex items-center gap-2 text-[#211C1A]">
                        <MapPin className="w-4 h-4 text-black" />
                        <h4 className="font-serif font-bold text-sm text-gray-900">{profileData.fullName || 'Valued Customer'}</h4>
                      </div>
                      <p className="text-xs text-gray-700 leading-relaxed font-sans">
                        {profileData.streetAddress && <span>{profileData.streetAddress}<br /></span>}
                        {profileData.city && <span>{profileData.city}{profileData.state ? `, ${profileData.state}` : ''} {profileData.pincode ? `- ${profileData.pincode}` : ''}<br /></span>}
                        Phone: <strong className="text-gray-900">{profileData.phone || 'Not linked'}</strong>
                      </p>
                      <div className="pt-2 flex gap-4">
                        <button 
                          onClick={() => {
                            setActiveTab('profile');
                            setIsEditing(true);
                          }} 
                          className="text-xs font-bold text-[#211C1A] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-black" />
                          Edit Address Details
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="col-span-full border border-dashed border-[#9A6A3A]/50 rounded-2xl p-8 text-center bg-[#F1E8DF]/50 space-y-3">
                      <MapPin className="w-8 h-8 text-black mx-auto opacity-70" />
                      <h4 className="font-serif font-bold text-base text-gray-900">No Saved Address Yet</h4>
                      <p className="text-xs text-gray-600 max-w-sm mx-auto">
                        Add your primary delivery address to speed up checkout on your future luxury orders.
                      </p>
                      <button 
                        onClick={() => {
                          setActiveTab('profile');
                          setIsEditing(true);
                        }} 
                        className="px-5 py-2.5 bg-[#241D1B] hover:bg-[#241D1B]/90 text-[#211C1A] rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-xs inline-flex items-center gap-2"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-black" />
                        Add Primary Address
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* TAB 5: RETURNS AND EXCHANGES (SELF-SERVICE PORTAL) */}
            {activeTab === 'returns' && (
              <motion.div 
                key="tab-returns"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-\[#FAF7F2\] rounded-2xl p-6 sm:p-8 shadow-sm border border-rose-50/40 space-y-6"
              >
                <div className="border-b border-rose-50 pb-4">
                  <div className="flex items-center gap-2">
                    <RefreshCcw className="w-5 h-5 text-[#211C1A]" />
                    <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#2C1820]">Returns & Exchanges</h2>
                  </div>
                  <p className="text-xs text-gray-400">Self-service portal to seamlessly manage size swaps or returns</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Form Container */}
                  <div>
                    <form onSubmit={handleReturnSubmit} className="space-y-4">
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1">Select Order <span className="text-\[#B76E79\]">*</span></label>
                        <select 
                          required
                          value={returnForm.orderId}
                          onChange={(e) => setReturnForm({...returnForm, orderId: e.target.value})}
                          className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-xs sm:text-sm focus:ring-1 focus:ring-[#241D1B] focus:outline-none"
                        >
                          <option value="">-- Choose a delivered order --</option>
                          {recentOrders.filter(o => o.status === 'Delivered' || o.status === 'Shipped' || o.status === 'Processing').map(ord => (
                            <option key={ord.orderNumber} value={ord.orderNumber}>
                              #{ord.orderNumber} - {ord.date} (₹{ord.finalTotal})
                            </option>
                          ))}
                          {recentOrders.length === 0 && <option disabled>No eligible orders found</option>}
                        </select>
                        <p className="text-[10px] text-gray-400 mt-1">Only recently delivered or dispatched orders appear here.</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1">Request Type</label>
                          <select 
                            value={returnForm.requestType}
                            onChange={(e) => setReturnForm({...returnForm, requestType: e.target.value})}
                            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-xs sm:text-sm focus:ring-1 focus:ring-[#241D1B] focus:outline-none"
                          >
                            <option value="Return">Return Item</option>
                            <option value="Exchange">Exchange Size</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1">Reason</label>
                          <select 
                            value={returnForm.reason}
                            onChange={(e) => setReturnForm({...returnForm, reason: e.target.value})}
                            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-xs sm:text-sm focus:ring-1 focus:ring-[#241D1B] focus:outline-none"
                          >
                            <option value="Size does not fit">Size doesn't fit</option>
                            <option value="Defective / Damaged">Defective / Damaged</option>
                            <option value="Not as expected">Not as expected</option>
                            <option value="Wrong item received">Wrong item received</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1">Additional Details (Optional)</label>
                        <textarea
                          rows={3}
                          value={returnForm.comments}
                          onChange={(e) => setReturnForm({...returnForm, comments: e.target.value})}
                          placeholder="Tell us what went wrong so we can improve..."
                          className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-xs sm:text-sm focus:ring-1 focus:ring-[#241D1B] focus:outline-none resize-none"
                        ></textarea>
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmittingReturn || !returnForm.orderId}
                        className="w-full px-6 py-3 bg-[#241D1B] hover:bg-[#3d0c1e] disabled:opacity-50 disabled:cursor-not-allowed text-[#211C1A] font-bold text-xs uppercase tracking-widest rounded-xl shadow transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isSubmittingReturn ? (
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        <span>{isSubmittingReturn ? 'Registering...' : 'Initiate Request'}</span>
                      </button>
                    </form>
                  </div>

                  {/* Return Policy Summary Panel */}
                  <div className="bg-[#D8C8B8]/30 p-5 sm:p-6 rounded-2xl border border-rose-100/50 flex flex-col justify-center">
                    <h3 className="text-sm font-bold text-[#211C1A] uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Shield className="w-4 h-4" /> Policy Guidelines
                    </h3>
                    <ul className="space-y-3 text-xs text-gray-600 leading-relaxed">
                      <li className="flex gap-2 items-start">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                        <span><strong>7-Day Returns:</strong> You can return or exchange any unworn product within 7 days of delivery.</span>
                      </li>
                      <li className="flex gap-2 items-start">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                        <span><strong>Free Pickup:</strong> Our courier partners will pick up the package from your doorstep at zero cost.</span>
                      </li>
                      <li className="flex gap-2 items-start">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                        <span><strong>Instant Refunds:</strong> For prepaid orders, refunds are processed within 24 hours of quality check.</span>
                      </li>
                    </ul>
                    
                    <div className="mt-6 pt-4 border-t border-rose-100/50">
                      <p className="text-[10px] text-gray-400">
                        Need human assistance? <button onClick={() => setActivePage('contact')} className="text-[#211C1A] font-bold hover:underline">Contact Care</button>
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

      </div>
    </div>
  );
};
