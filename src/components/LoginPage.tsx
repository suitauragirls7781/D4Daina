import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useShop } from '../context/ShopContext';
import { COLLECTIONS, emailKey, getDocById, saveDoc } from '../lib/dataStore';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { 
  ArrowLeft,
  ShieldCheck,
  User,
  Phone,
  Mail,
  ArrowRight,
  Crown,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  KeyRound,
  UserPlus,
  LogIn
} from 'lucide-react';

type AuthMode = 'signup' | 'login' | 'forgot_password';

export const LoginPage: React.FC = () => {
  const { setActivePage, showToast, syncCustomerOrders } = useShop();

  // Primary mode state
  const [mode, setMode] = useState<AuthMode>('signup');
  const [loginType, setLoginType] = useState<'password' | 'otp'>('password');

  // Input Fields
  const [fullName, setFullName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // OTP Verification Flow State
  const [otpStep, setOtpStep] = useState(false); // true when waiting for 6-digit OTP input
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cooldown timer for OTP resend button
  useEffect(() => {
    let timer: any;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Helper to derive Full Name from email
  const deriveNameFromEmail = (emailStr: string): string => {
    if (!emailStr || !emailStr.includes('@')) return '';
    const prefix = emailStr.split('@')[0];
    const words = prefix.replace(/[\._\-]/g, ' ').split(' ').filter(Boolean);
    if (words.length === 0) return '';
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  };

  const handleEmailChange = (val: string) => {
    setEmailAddress(val);
    if (mode === 'signup') {
      const derived = deriveNameFromEmail(val);
      if (derived && (!fullName || fullName === deriveNameFromEmail(emailAddress))) {
        setFullName(derived);
      }
    }
  };

  const requestEmailOtp = async (email: string, name: string, purpose: 'signup' | 'login' | 'password_reset') => {
    const response = await fetch('/api/customer-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ action: 'send', email: email.trim().toLowerCase(), name, purpose }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success !== true) throw new Error(result.error || 'Could not send verification code.');
  };

  const verifyEmailOtp = async (email: string, code: string, purpose: 'signup' | 'login' | 'password_reset') => {
    const response = await fetch('/api/customer-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ action: 'verify', email: email.trim().toLowerCase(), code, purpose }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.verified !== true) throw new Error(result.error || 'Invalid or expired verification code.');
  };

  // Helper to get local stored user database
  const getStoredUsers = () => {
    try {
      const stored = localStorage.getItem('sag_registered_accounts');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  const getRegisteredCustomer = async (email: string) => {
    const normalizedEmail = email.toLowerCase().trim();
    const localUser = getStoredUsers().find((user: any) => user.email?.toLowerCase().trim() === normalizedEmail);
    if (localUser) return localUser;

    for (const collectionName of ['users', 'customers']) {
      try {
        const customerSnapshot = await getDoc(doc(db, collectionName, normalizedEmail));
        if (customerSnapshot.exists()) {
          return { ...customerSnapshot.data(), email: normalizedEmail };
        }
      } catch {}
    }

    return null;
  };

  // Helper to save user account to local db
  const saveStoredUser = (newUser: { email: string; name: string; phone: string; password?: string }) => {
    const users = getStoredUsers();
    const normEmail = newUser.email.toLowerCase().trim();
    const existingIndex = users.findIndex((u: any) => u.email && u.email.toLowerCase().trim() === normEmail);
    if (existingIndex >= 0) {
      const existingPass = users[existingIndex].password;
      let finalPass = newUser.password;
      if ((!finalPass || finalPass === 'BrevoVerifiedUser') && existingPass && existingPass !== 'BrevoVerifiedUser') {
        finalPass = existingPass;
      }
      users[existingIndex] = {
        ...users[existingIndex],
        ...newUser,
        email: normEmail,
        password: finalPass || 'BrevoVerifiedUser'
      };
    } else {
      users.push({
        ...newUser,
        email: normEmail,
        password: newUser.password || 'BrevoVerifiedUser',
        createdAt: new Date().toISOString()
      });
    }
    localStorage.setItem('sag_registered_accounts', JSON.stringify(users));
  };

  // Register or Sync Real Customer in the database and local storage
  const registerCustomerInDb = async (
    custEmail: string, 
    custName: string, 
    custPhone: string = '', 
    userPass: string = '',
    shouldLogin: boolean = true
  ) => {
    const normalizedEmail = custEmail.toLowerCase().trim();
    if (!normalizedEmail) return;

    const derivedName = deriveNameFromEmail(normalizedEmail);
    const effectiveName = custName.trim() || derivedName || 'Valued Customer';
    const effectivePhone = custPhone || mobileNumber || '';
    
    // 1. Clean initial state
    let profileDetails = {
      fullName: effectiveName,
      phone: effectivePhone,
      pincode: '',
      city: '',
      state: '',
      streetAddress: ''
    };

    const existingProfileStr = localStorage.getItem(`sag_user_profile_${normalizedEmail}`);
    if (existingProfileStr) {
      try {
        const parsed = JSON.parse(existingProfileStr);
        profileDetails = {
          ...profileDetails,
          ...parsed,
          fullName: parsed.fullName || effectiveName,
          phone: parsed.phone || effectivePhone
        };
      } catch {}
    }

    localStorage.setItem(`sag_user_profile_${normalizedEmail}`, JSON.stringify(profileDetails));

    // Save to local user database
    saveStoredUser({
      email: normalizedEmail,
      name: effectiveName,
      phone: effectivePhone,
      password: userPass || 'BrevoVerifiedUser'
    });

    // 2. Insert/Update into FIRESTORE DB (Shared globally across all devices/browsers in real-time)
    try {
      const custDocRef = doc(db, 'customers', normalizedEmail);
      await setDoc(custDocRef, {
        name: effectiveName,
        email: normalizedEmail,
        phone: effectivePhone,
        status: 'active',
        passwordProtected: Boolean(userPass && userPass !== 'BrevoVerifiedUser'),
        authMethod: userPass && userPass !== 'BrevoVerifiedUser' ? 'Password Protected' : 'Brevo OTP Verified',
        pincode: profileDetails.pincode || '',
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      }, { merge: true });

      const userDocRef = doc(db, 'users', normalizedEmail);
      await setDoc(userDocRef, {
        name: effectiveName,
        email: normalizedEmail,
        phone: effectivePhone,
        status: 'active',
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (fsErr) {
      console.warn('Firestore customer registration notice:', fsErr);
    }

    // 3. Insert/Update the customer's database profile (never stores the password)
    try {
      const profileId = emailKey(normalizedEmail);
      const existingProf = await getDocById(COLLECTIONS.profiles, profileId);

      await saveDoc(COLLECTIONS.profiles, profileId, {
        email: profileId,
        name: effectiveName,
        phone: effectivePhone,
        pincode: profileDetails.pincode || '',
        ...(existingProf ? {} : { createdAt: new Date().toISOString() })
      });
    } catch (dbErr) {
      console.warn('Database profile registration notice:', dbErr);
    }

    // 5. ONLY set login session IF shouldLogin is true (i.e. AFTER OTP verification or password login succeeds!)
    if (shouldLogin) {
      const sessionUser = {
        email: normalizedEmail,
        phone: effectivePhone,
        uid: 'user_' + Date.now(),
        displayName: effectiveName
      };
      localStorage.setItem('sag_custom_user', JSON.stringify(sessionUser));
      window.dispatchEvent(new Event('sag-auth-state-change'));
      await syncCustomerOrders(normalizedEmail);
    }
  };

  // --- 1. SIGNUP: REQUEST SERVER-ISSUED EMAIL OTP ---
  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const normEmail = emailAddress.trim().toLowerCase();

    if (!fullName.trim()) {
      setError('Please enter your Full Name.');
      return;
    }

    if (!mobileNumber || mobileNumber.replace(/\D/g, '').length < 10) {
      setError('Please enter a valid 10-digit Mobile Phone Number.');
      return;
    }

    if (!normEmail || !normEmail.includes('@')) {
      setError('Please enter a valid Email Address.');
      return;
    }

    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Password and Confirm Password do not match.');
      return;
    }

    // Check if account already exists
    const existing = await getRegisteredCustomer(normEmail);
    if (existing) {
      setError('An account with this email address already exists. Please Sign In instead.');
      return;
    }

    setLoading(true);

    try {
      await requestEmailOtp(normEmail, fullName.trim(), 'signup');
      showToast(`Verification code sent to ${normEmail}. Please check your Gmail inbox.`, 'success');
      setOtpCode(['', '', '', '', '', '']);
      setOtpStep(true);
      setResendCooldown(30);
    } catch (err: any) {
      setError(err.message || 'Unable to send verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // --- 2. VERIFY SERVER-ISSUED OTP & CREATE ACCOUNT ---
  const handleVerifyEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const enteredOtp = otpCode.join('');
    if (enteredOtp.length < 6) {
      setError('Please enter the full 6-digit verification code sent to your email.');
      return;
    }

    setLoading(true);

    try {
      const normalizedEmail = emailAddress.trim().toLowerCase();
      const purpose = mode === 'signup' ? 'signup' : 'login';
      await verifyEmailOtp(normalizedEmail, enteredOtp, purpose);
      if (mode === 'signup') {
        await registerCustomerInDb(normalizedEmail, fullName, mobileNumber, password);
        showToast(`Account created successfully. Welcome, ${fullName}.`, 'success');
      } else {
        const user = await getRegisteredCustomer(normalizedEmail);
        if (!user) {
          setError('No registered account found for this email. Please sign up first.');
          return;
        }
        await registerCustomerInDb(
          normalizedEmail,
          user.name || deriveNameFromEmail(normalizedEmail),
          user.phone || ''
        );
        showToast(`Welcome back, ${user.name || normalizedEmail}!`, 'success');
      }
      setActivePage('account');
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // --- 3. LOGIN WITH PASSWORD OR OTP ---
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const normEmail = emailAddress.trim().toLowerCase();
    const enteredPassword = password.trim();

    if (!normEmail || !normEmail.includes('@')) {
      setError('Please enter a valid Email Address.');
      return;
    }

    if (loginType === 'password') {
      if (!enteredPassword) {
        setError('Please enter your Password.');
        return;
      }

      setLoading(true);
      try {
        // 1. Check local registered accounts database
        const users = getStoredUsers();
        const user = users.find((u: any) => u.email && u.email.toLowerCase().trim() === normEmail);

        if (user) {
          const storedPass = (user.password || '').trim();
          if (storedPass && storedPass !== 'BrevoVerifiedUser') {
            if (storedPass === enteredPassword) {
              await registerCustomerInDb(normEmail, user.name || deriveNameFromEmail(normEmail), user.phone || '', enteredPassword);
              showToast(`Welcome back, ${user.name || normEmail}! Signed in successfully.`, 'success');
              setActivePage('account');
              return;
            } else {
              setError('Incorrect Password. Please enter your correct password or click "Forgot Password" to reset it.');
              return;
            }
          } else {
            setError('This account has no password sign-in enabled. Choose email OTP sign-in instead.');
            return;
          }
        }

        // STRICT ACCOUNT REQUIRED: If user is not registered anywhere, DENY ACCESS!
        setError(`No account found with email "${normEmail}". Please click "Sign Up" first to create an account.`);

      } catch (err: any) {
        setError('Failed to log in. Please check your credentials or click "Forgot Password".');
      } finally {
        setLoading(false);
      }
    } else {
      // OTP Login Mode - Strict account check
      setLoading(true);
      try {
        const user = await getRegisteredCustomer(normEmail);

        if (!user) {
          setError(`No registered account found with email "${normEmail}". Please click "Sign Up" to create an account.`);
          setLoading(false);
          return;
        }

        await requestEmailOtp(normEmail, user?.name || deriveNameFromEmail(normEmail), 'login');
        showToast(`Login code sent to ${normEmail}. Check your Gmail inbox.`, 'success');
        setOtpCode(['', '', '', '', '', '']);
        setOtpStep(true);
        setResendCooldown(30);
      } catch (err: any) {
        setError(err?.message || 'Failed to send login code. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  // --- 4. FORGOT PASSWORD: REQUEST OTP ---
  const handleForgotPasswordRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const normEmail = emailAddress.trim().toLowerCase();
    if (!normEmail || !normEmail.includes('@')) {
      setError('Please enter your registered Email Address.');
      return;
    }

    setLoading(true);

    try {
      const user = await getRegisteredCustomer(normEmail);

      if (!user) {
        setError(`No account found with registered email "${normEmail}". Please click "Sign Up" first.`);
        setLoading(false);
        return;
      }

      await requestEmailOtp(normEmail, user?.name || deriveNameFromEmail(normEmail), 'password_reset');
      showToast(`Password reset code sent to ${normEmail}. Check your Gmail inbox.`, 'success');
      setOtpCode(['', '', '', '', '', '']);
      setOtpStep(true);
      setResendCooldown(30);
    } catch (err: any) {
      setError('Failed to send password reset code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // --- 5. FORGOT PASSWORD: VERIFY OTP & UPDATE PASSWORD ---
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const enteredOtp = otpCode.join('');
    if (enteredOtp.length < 6) {
      setError('Please enter the 6-digit verification code sent to your email.');
      return;
    }

    if (!password || password.length < 6) {
      setError('New Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('New Password and Confirm Password do not match.');
      return;
    }

    setLoading(true);

    try {
      const normalizedEmail = emailAddress.trim().toLowerCase();
      await verifyEmailOtp(normalizedEmail, enteredOtp, 'password_reset');

      const normEmail = normalizedEmail;
      const users = getStoredUsers();
      const userIndex = users.findIndex((u: any) => u.email.toLowerCase() === normEmail);
      const userName = userIndex >= 0 ? users[userIndex].name : deriveNameFromEmail(normEmail);

      // Save updated password
      saveStoredUser({
        email: normEmail,
        name: userName,
        phone: mobileNumber,
        password: password
      });

      await registerCustomerInDb(normEmail, userName, mobileNumber, password);

      showToast('🔒 Password updated successfully! Logged in with your new password.', 'success');
      setActivePage('account');
    } catch (err: any) {
      setError(err.message || 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle OTP digit box auto-advance
  const handleOtpDigitChange = (index: number, value: string) => {
    if (value.length > 1) {
      value = value.charAt(value.length - 1);
    }
    const newCode = [...otpCode];
    newCode[index] = value;
    setOtpCode(newCode);

    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      nextInput?.focus();
    }
  };

  // Switch modes cleanly
  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setOtpStep(false);
    setError(null);
    setOtpCode(['', '', '', '', '', '']);
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="min-h-screen bg-[#120205] py-8 sm:py-10 px-4 sm:px-6 flex items-center justify-center font-sans">
      
      <div className="max-w-md w-full space-y-6">
        
        {/* Navigation & Security Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setActivePage('home')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#E8D2A4] hover:text-[#D7B77A] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-[#F7F0E5]" />
            <span>Return to Boutique</span>
          </button>
          
          <div className="inline-flex items-center gap-1.5 bg-transparent text-[#D7B77A] text-[10px] font-semibold uppercase tracking-widest px-3 py-1 border border-[#D7B77A]/40">
            <ShieldCheck className="w-3.5 h-3.5 text-[#F7F0E5]" />
            <span>100% Encrypted Security</span>
          </div>
        </div>

        {/* Main Auth Card */}
        <div className="bg-[#180306] border border-[#D7B77A]/35 overflow-hidden">
          
          {/* Card Banner Header */}
          <div className="bg-[#2A0710] text-[#F7F0E5] p-6 text-center space-y-2 relative border-b border-[#D7B77A]/30">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-[#2A0710]/10 rounded-full border border-[#D7B77A]/40 mb-1">
              <Crown className="w-6 h-6 text-[#F7F0E5]" />
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-wide text-[#F7F0E5]">
              Suit Aura Girls
            </h1>
            <p className="text-xs text-[#F7F0E5]/80 font-medium tracking-wider uppercase">
              Artisan Royal Ethnic Couture • Member Lounge
            </p>
          </div>

          {/* Mode Navigation Tabs */}
          <div className="grid grid-cols-3 bg-[#120205] border-b border-[#D7B77A]/25 p-1">
            <button
              onClick={() => switchMode('signup')}
              className={`py-2.5 text-xs font-bold uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1 rounded-lg ${
                mode === 'signup' 
                  ? 'bg-[#D7B77A] text-[#F7F0E5]' 
                  : 'text-[#E8D2A4]/65 hover:text-[#E8D2A4]'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Sign Up</span>
            </button>
            <button
              onClick={() => switchMode('login')}
              className={`py-2.5 text-xs font-bold uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1 rounded-lg ${
                mode === 'login' 
                  ? 'bg-[#D7B77A] text-[#F7F0E5]' 
                  : 'text-[#E8D2A4]/65 hover:text-[#E8D2A4]'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
            <button
              onClick={() => switchMode('forgot_password')}
              className={`py-2.5 text-xs font-bold uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1 rounded-lg ${
                mode === 'forgot_password' 
                  ? 'bg-[#D7B77A] text-[#F7F0E5]' 
                  : 'text-[#E8D2A4]/65 hover:text-[#E8D2A4]'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Forgot</span>
            </button>
          </div>

          <div className="p-6 sm:p-8 space-y-5">
            
            {/* Error Banner */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3.5 bg-[#2A0710] border border-[#D7B77A]/15 rounded text-rose-300 text-xs flex items-start gap-2.5 shadow-2xs"
              >
                <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                <span className="leading-relaxed font-medium">{error}</span>
              </motion.div>
            )}

            {/* MODE 1: SIGN UP */}
            {mode === 'signup' && (
              <>
                {!otpStep ? (
                  <form onSubmit={handleSignUpSubmit} className="space-y-4 text-left">
                    <div className="text-center space-y-1 pb-1">
                      <h2 className="font-serif text-lg font-bold text-[#F7F0E5]">
                        Create Your Aura Account
                      </h2>
                      <p className="text-xs text-[#F7F0E5]/75 leading-relaxed">
                        Enter your details and password. An OTP code will be sent to your email to verify before account creation.
                      </p>
                    </div>

                    {/* FULL NAME */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#F7F0E5] uppercase tracking-wider block">
                        Full Name <span className="text-rose-300">*</span>
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-[#F7F0E5] absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          placeholder="e.g. Ananya Sharma"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="w-full pl-10 pr-3.5 py-3 text-xs bg-[#180306] border border-[#D7B77A]/15 focus:border-[#D7B77A]/40 focus:ring-1 focus:ring-[#D7B77A]/40 rounded font-medium text-[#F7F0E5] transition focus:outline-none shadow-2xs"
                        />
                      </div>
                    </div>

                    {/* MOBILE PHONE */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#F7F0E5] uppercase tracking-wider block">
                        Mobile Phone <span className="text-rose-300">*</span>
                      </label>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-[#F7F0E5] absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="tel"
                          required
                          placeholder="10-digit mobile number"
                          value={mobileNumber}
                          onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ''))}
                          className="w-full pl-10 pr-3.5 py-3 text-xs bg-[#180306] border border-[#D7B77A]/15 focus:border-[#D7B77A]/40 focus:ring-1 focus:ring-[#D7B77A]/40 rounded font-medium text-[#F7F0E5] transition focus:outline-none shadow-2xs"
                        />
                      </div>
                    </div>

                    {/* EMAIL ADDRESS */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#F7F0E5] uppercase tracking-wider block">
                        Email Address <span className="text-rose-300">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-[#F7F0E5] absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          required
                          placeholder="name@example.com"
                          value={emailAddress}
                          onChange={(e) => handleEmailChange(e.target.value)}
                          className="w-full pl-10 pr-3.5 py-3 text-xs bg-[#180306] border border-[#D7B77A]/15 focus:border-[#D7B77A]/40 focus:ring-1 focus:ring-[#D7B77A]/40 rounded font-medium text-[#F7F0E5] transition focus:outline-none shadow-2xs"
                        />
                      </div>
                    </div>

                    {/* PASSWORD */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[#F7F0E5] uppercase tracking-wider block">
                          Password <span className="text-rose-300">*</span>
                        </label>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-[#F7F0E5] absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            placeholder="Min 6 characters"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-10 pr-9 py-3 text-xs bg-[#180306] border border-[#D7B77A]/15 focus:border-[#D7B77A]/40 focus:ring-1 focus:ring-[#D7B77A]/40 rounded font-medium text-[#F7F0E5] transition focus:outline-none shadow-2xs"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#F7F0E5]/55 hover:text-[#F7F0E5]/75 cursor-pointer"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[#F7F0E5] uppercase tracking-wider block">
                          Confirm Password <span className="text-rose-300">*</span>
                        </label>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-[#F7F0E5] absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            placeholder="Re-enter password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full pl-10 pr-3.5 py-3 text-xs bg-[#180306] border border-[#D7B77A]/15 focus:border-[#D7B77A]/40 focus:ring-1 focus:ring-[#D7B77A]/40 rounded font-medium text-[#F7F0E5] transition focus:outline-none shadow-2xs"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3.5 bg-[#5C0B1B] hover:bg-[#5C0B1B] text-[#F7F0E5] rounded font-serif font-bold uppercase tracking-wider text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-98 mt-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-[#F7F0E5]" />
                          <span>Sending Brevo Verification Code...</span>
                        </>
                      ) : (
                        <>
                          <span>Send Verification OTP</span>
                          <ArrowRight className="w-4 h-4 text-[#F7F0E5]" />
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  /* VERIFY SIGNUP OTP */
                  <form onSubmit={handleVerifyEmailOtp} className="space-y-5 text-left">
                    <div className="p-4 bg-[#2A0710] border border-[#D7B77A]/40 rounded text-left space-y-2 shadow-2xs">
                      <div className="flex items-center gap-2 text-[#F7F0E5] font-bold text-xs uppercase tracking-wider">
                        <Mail className="w-4 h-4 text-[#F7F0E5]" />
                        <span>VERIFY YOUR EMAIL OTP</span>
                      </div>
                      <p className="text-xs text-[#F7F0E5]/75 leading-relaxed">
                        A 6-digit verification code has been sent to <strong className="text-[#F7F0E5] font-semibold">{emailAddress}</strong>. Enter it to confirm account creation:
                      </p>
                    </div>

                    <div className="space-y-2 text-center">
                      <span className="text-xs font-bold text-[#F7F0E5] uppercase tracking-wider block">
                        ENTER 6-DIGIT VERIFICATION CODE
                      </span>

                      <div className="flex items-center justify-center gap-2 py-2">
                        {otpCode.map((digit, idx) => (
                          <input
                            key={idx}
                            id={`otp-input-${idx}`}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={digit}
                            onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Backspace' && !digit && idx > 0) {
                                document.getElementById(`otp-input-${idx - 1}`)?.focus();
                              }
                            }}
                            className="w-10 h-12 sm:w-12 sm:h-14 text-center font-mono font-bold text-lg sm:text-xl text-[#F7F0E5] bg-[#180306] border-2 border-[#D7B77A]/15 focus:border-[#D7B77A]/40 rounded focus:outline-none transition shadow-inner"
                          />
                        ))}
                      </div>

                      <p className="text-[11px] text-[#F7F0E5]/55 pt-1">
                        Didn't receive code?{' '}
                        {resendCooldown > 0 ? (
                          <span className="text-[#F7F0E5] font-bold">Resend in {resendCooldown}s</span>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                setLoading(true);
                                await requestEmailOtp(emailAddress, fullName || 'Customer', 'signup');
                                setOtpCode(['', '', '', '', '', '']);
                                showToast(`A new verification code was sent to ${emailAddress}.`, 'success');
                                setResendCooldown(30);
                              } catch (resendError: any) {
                                setError(resendError?.message || 'Could not resend the verification code.');
                              } finally {
                                setLoading(false);
                              }
                            }}
                            className="text-[#F7F0E5] font-bold underline hover:text-[#F7F0E5] cursor-pointer inline-flex items-center gap-1"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Resend Email OTP</span>
                          </button>
                        )}
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3.5 bg-[#5C0B1B] hover:bg-[#5C0B1B] text-[#F7F0E5] rounded font-serif font-bold uppercase tracking-wider text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-98"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-[#F7F0E5]" />
                          <span>Creating Account...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-[#F7F0E5]" />
                          <span>VERIFY OTP &amp; CREATE ACCOUNT</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setOtpStep(false)}
                      className="text-xs text-[#F7F0E5]/55 hover:text-[#F7F0E5] underline font-medium block mx-auto cursor-pointer pt-1"
                    >
                      ← Back to Form
                    </button>
                  </form>
                )}
              </>
            )}

            {/* MODE 2: SIGN IN (LOGIN) */}
            {mode === 'login' && (
              <>
                {!otpStep ? (
                  <form onSubmit={handleLoginSubmit} className="space-y-4 text-left">
                    <div className="text-center space-y-1 pb-1">
                      <h2 className="font-serif text-lg font-bold text-[#F7F0E5]">
                        Welcome Back to Suit Aura Girls
                      </h2>
                      <p className="text-xs text-[#F7F0E5]/75 leading-relaxed">
                        Sign in with your Password or get an Instant OTP sent to your email.
                      </p>
                    </div>

                    {/* LOGIN SUB-TABS: Password vs Instant OTP */}
                    <div className="flex justify-center gap-4 border-b border-[#D7B77A]/15 pb-2">
                      <button
                        type="button"
                        onClick={() => setLoginType('password')}
                        className={`text-xs font-bold uppercase tracking-wider pb-1 transition cursor-pointer ${
                          loginType === 'password'
                            ? 'text-[#F7F0E5] border-b-2 border-[#D7B77A]/40'
                            : 'text-[#F7F0E5]/55 hover:text-[#F7F0E5]/75'
                        }`}
                      >
                        Login with Password
                      </button>
                      <button
                        type="button"
                        onClick={() => setLoginType('otp')}
                        className={`text-xs font-bold uppercase tracking-wider pb-1 transition cursor-pointer ${
                          loginType === 'otp'
                            ? 'text-[#F7F0E5] border-b-2 border-[#D7B77A]/40'
                            : 'text-[#F7F0E5]/55 hover:text-[#F7F0E5]/75'
                        }`}
                      >
                        Login with Email OTP
                      </button>
                    </div>

                    {/* EMAIL ADDRESS */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#F7F0E5] uppercase tracking-wider block">
                        Email Address <span className="text-rose-300">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-[#F7F0E5] absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          required
                          placeholder="name@example.com"
                          value={emailAddress}
                          onChange={(e) => handleEmailChange(e.target.value)}
                          className="w-full pl-10 pr-3.5 py-3 text-xs bg-[#180306] border border-[#D7B77A]/15 focus:border-[#D7B77A]/40 focus:ring-1 focus:ring-[#D7B77A]/40 rounded font-medium text-[#F7F0E5] transition focus:outline-none shadow-2xs"
                        />
                      </div>
                    </div>

                    {/* PASSWORD INPUT (IF PASSWORD LOGIN) */}
                    {loginType === 'password' && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-[#F7F0E5] uppercase tracking-wider block">
                            Password <span className="text-rose-300">*</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => switchMode('forgot_password')}
                            className="text-[11px] font-semibold text-[#F7F0E5] hover:underline cursor-pointer"
                          >
                            Forgot Password?
                          </button>
                        </div>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-[#F7F0E5] absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            placeholder="Enter your account password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-10 pr-9 py-3 text-xs bg-[#180306] border border-[#D7B77A]/15 focus:border-[#D7B77A]/40 focus:ring-1 focus:ring-[#D7B77A]/40 rounded font-medium text-[#F7F0E5] transition focus:outline-none shadow-2xs"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#F7F0E5]/55 hover:text-[#F7F0E5]/75 cursor-pointer"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3.5 bg-[#5C0B1B] hover:bg-[#5C0B1B] text-[#F7F0E5] rounded font-serif font-bold uppercase tracking-wider text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-98 mt-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-[#F7F0E5]" />
                          <span>Signing In...</span>
                        </>
                      ) : (
                        <>
                          <span>{loginType === 'password' ? 'Sign In Now' : 'Send Login OTP Code'}</span>
                          <ArrowRight className="w-4 h-4 text-[#F7F0E5]" />
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  /* VERIFY LOGIN OTP */
                  <form onSubmit={handleVerifyEmailOtp} className="space-y-5 text-left">
                    <div className="p-4 bg-[#2A0710] border border-[#D7B77A]/40 rounded text-left space-y-2 shadow-2xs">
                      <div className="flex items-center gap-2 text-[#F7F0E5] font-bold text-xs uppercase tracking-wider">
                        <Mail className="w-4 h-4 text-[#F7F0E5]" />
                        <span>LOGIN OTP SENT</span>
                      </div>
                      <p className="text-xs text-[#F7F0E5]/75 leading-relaxed">
                        A 6-digit login verification code has been sent to <strong className="text-[#F7F0E5] font-semibold">{emailAddress}</strong>:
                      </p>
                    </div>

                    <div className="space-y-2 text-center">
                      <span className="text-xs font-bold text-[#F7F0E5] uppercase tracking-wider block">
                        ENTER 6-DIGIT VERIFICATION CODE
                      </span>

                      <div className="flex items-center justify-center gap-2 py-2">
                        {otpCode.map((digit, idx) => (
                          <input
                            key={idx}
                            id={`otp-input-${idx}`}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={digit}
                            onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Backspace' && !digit && idx > 0) {
                                document.getElementById(`otp-input-${idx - 1}`)?.focus();
                              }
                            }}
                            className="w-10 h-12 sm:w-12 sm:h-14 text-center font-mono font-bold text-lg sm:text-xl text-[#F7F0E5] bg-[#180306] border-2 border-[#D7B77A]/15 focus:border-[#D7B77A]/40 rounded focus:outline-none transition shadow-inner"
                          />
                        ))}
                      </div>

                      <p className="text-[11px] text-[#F7F0E5]/55 pt-1">
                        Didn't receive code?{' '}
                        {resendCooldown > 0 ? (
                          <span className="text-[#F7F0E5] font-bold">Resend in {resendCooldown}s</span>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                setLoading(true);
                                await requestEmailOtp(emailAddress, deriveNameFromEmail(emailAddress) || 'Customer', 'login');
                                setOtpCode(['', '', '', '', '', '']);
                                showToast(`A new login code was sent to ${emailAddress}.`, 'success');
                                setResendCooldown(30);
                              } catch (resendError: any) {
                                setError(resendError?.message || 'Could not resend the login code.');
                              } finally {
                                setLoading(false);
                              }
                            }}
                            className="text-[#F7F0E5] font-bold underline hover:text-[#F7F0E5] cursor-pointer inline-flex items-center gap-1"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Resend Email OTP</span>
                          </button>
                        )}
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3.5 bg-[#5C0B1B] hover:bg-[#5C0B1B] text-[#F7F0E5] rounded font-serif font-bold uppercase tracking-wider text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-98"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-[#F7F0E5]" />
                          <span>Verifying OTP...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-[#F7F0E5]" />
                          <span>VERIFY &amp; LOG IN</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setOtpStep(false)}
                      className="text-xs text-[#F7F0E5]/55 hover:text-[#F7F0E5] underline font-medium block mx-auto cursor-pointer pt-1"
                    >
                      ← Back to Login
                    </button>
                  </form>
                )}
              </>
            )}

            {/* MODE 3: FORGOT PASSWORD */}
            {mode === 'forgot_password' && (
              <>
                {!otpStep ? (
                  <form onSubmit={handleForgotPasswordRequest} className="space-y-4 text-left">
                    <div className="text-center space-y-1 pb-1">
                      <h2 className="font-serif text-lg font-bold text-[#F7F0E5]">
                        Forgot Your Password?
                      </h2>
                      <p className="text-xs text-[#F7F0E5]/75 leading-relaxed">
                        Enter your registered email address. We will send a 6-digit OTP code to your email to reset your password.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#F7F0E5] uppercase tracking-wider block">
                        Registered Email Address <span className="text-rose-300">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-[#F7F0E5] absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          required
                          placeholder="name@example.com"
                          value={emailAddress}
                          onChange={(e) => setEmailAddress(e.target.value)}
                          className="w-full pl-10 pr-3.5 py-3 text-xs bg-[#180306] border border-[#D7B77A]/15 focus:border-[#D7B77A]/40 focus:ring-1 focus:ring-[#D7B77A]/40 rounded font-medium text-[#F7F0E5] transition focus:outline-none shadow-2xs"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3.5 bg-[#5C0B1B] hover:bg-[#5C0B1B] text-[#F7F0E5] rounded font-serif font-bold uppercase tracking-wider text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-98 mt-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-[#F7F0E5]" />
                          <span>Sending Reset OTP Code...</span>
                        </>
                      ) : (
                        <>
                          <span>Send Reset OTP Code to Email</span>
                          <ArrowRight className="w-4 h-4 text-[#F7F0E5]" />
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  /* STEP 2: VERIFY RESET OTP & ENTER NEW PASSWORD */
                  <form onSubmit={handleResetPasswordSubmit} className="space-y-4 text-left">
                    <div className="p-4 bg-[#2A0710] border border-[#D7B77A]/40 rounded text-left space-y-1.5 shadow-2xs">
                      <div className="flex items-center gap-2 text-[#F7F0E5] font-bold text-xs uppercase tracking-wider">
                        <KeyRound className="w-4 h-4 text-[#F7F0E5]" />
                        <span>RESET PASSWORD OTP SENT</span>
                      </div>
                      <p className="text-xs text-[#F7F0E5]/75 leading-relaxed">
                        A 6-digit reset code has been sent to <strong className="text-[#F7F0E5] font-semibold">{emailAddress}</strong>. Enter code and choose a new password:
                      </p>
                    </div>

                    <div className="space-y-1.5 text-center">
                      <span className="text-xs font-bold text-[#F7F0E5] uppercase tracking-wider block">
                        ENTER 6-DIGIT RESET CODE
                      </span>

                      <div className="flex items-center justify-center gap-2 py-1">
                        {otpCode.map((digit, idx) => (
                          <input
                            key={idx}
                            id={`otp-input-${idx}`}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={digit}
                            onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Backspace' && !digit && idx > 0) {
                                document.getElementById(`otp-input-${idx - 1}`)?.focus();
                              }
                            }}
                            className="w-10 h-12 sm:w-12 sm:h-14 text-center font-mono font-bold text-lg sm:text-xl text-[#F7F0E5] bg-[#180306] border-2 border-[#D7B77A]/15 focus:border-[#D7B77A]/40 rounded focus:outline-none transition shadow-inner"
                          />
                        ))}
                      </div>
                    </div>

                    {/* NEW PASSWORD FIELDS */}
                    <div className="space-y-3 pt-1">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[#F7F0E5] uppercase tracking-wider block">
                          New Password <span className="text-rose-300">*</span>
                        </label>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-[#F7F0E5] absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            placeholder="Min 6 characters"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-10 pr-9 py-3 text-xs bg-[#180306] border border-[#D7B77A]/15 focus:border-[#D7B77A]/40 focus:ring-1 focus:ring-[#D7B77A]/40 rounded font-medium text-[#F7F0E5] transition focus:outline-none shadow-2xs"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#F7F0E5]/55 hover:text-[#F7F0E5]/75 cursor-pointer"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[#F7F0E5] uppercase tracking-wider block">
                          Confirm New Password <span className="text-rose-300">*</span>
                        </label>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-[#F7F0E5] absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            placeholder="Re-enter new password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full pl-10 pr-3.5 py-3 text-xs bg-[#180306] border border-[#D7B77A]/15 focus:border-[#D7B77A]/40 focus:ring-1 focus:ring-[#D7B77A]/40 rounded font-medium text-[#F7F0E5] transition focus:outline-none shadow-2xs"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3.5 bg-[#5C0B1B] hover:bg-[#5C0B1B] text-[#F7F0E5] rounded font-serif font-bold uppercase tracking-wider text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-98 mt-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-[#F7F0E5]" />
                          <span>Updating Password...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-[#F7F0E5]" />
                          <span>RESET PASSWORD &amp; SIGN IN</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setOtpStep(false)}
                      className="text-xs text-[#F7F0E5]/55 hover:text-[#F7F0E5] underline font-medium block mx-auto cursor-pointer pt-1"
                    >
                      ← Back to Email Request
                    </button>
                  </form>
                )}
              </>
            )}

          </div>

        </div>

      </div>

    </div>
  );
};
