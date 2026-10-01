import React, { useEffect, useRef, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { apiPost } from '../lib/api';
import { GOOGLE_LOGIN_ENABLED, exchangeGoogleCredential, getGoogleId } from '../utils/googleSignIn';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Loader2, Mail, Pencil, Phone, RefreshCw } from 'lucide-react';
import { HeartIcon, LockIcon, OrdersIcon, ReturnIcon, UserIcon } from './StoreIcons';

type AuthMode = 'login' | 'signup';

const inputClass = 'w-full h-12 pl-11 pr-4 text-sm bg-white border border-[#4B1D3F]/20 hover:border-[#4B1D3F]/35 focus:border-[#4B1D3F]/70 focus:ring-4 focus:ring-[#F3EEF8] rounded-full text-[#2A1A26] placeholder:text-[#2A1A26]/40 transition focus:outline-none';
const labelClass = 'block pl-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/70';
const iconInInput = 'w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[#9C7A45] pointer-events-none';
const primaryButton = 'w-full h-12 bg-[#4B1D3F] hover:bg-[#3B1532] text-white rounded-full font-semibold uppercase tracking-[0.16em] text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';

/** What an account gives the customer (all real features of this store). */
const PERKS: Array<{ icon: React.ElementType; label: string }> = [
  { icon: OrdersIcon, label: 'Track every order' },
  { icon: HeartIcon, label: 'Wishlist on all devices' },
  { icon: ReturnIcon, label: 'Easy returns & exchanges' },
];

interface VerifyResponse {
  email: string;
  firebaseToken: string;
  customer: { name?: string; phone?: string };
}


export const LoginPage: React.FC = () => {
  const { setActivePage, showToast, syncCustomerOrders } = useShop();
  const { user, signInWithOtpToken } = useAuth();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleUnavailable, setGoogleUnavailable] = useState(false);

  const [mode, setMode] = useState<AuthMode>('login');
  const [fullName, setFullName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstOtpInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (otpStep) firstOtpInput.current?.focus();
  }, [otpStep]);

  const email = emailAddress.trim().toLowerCase();

  const sendCode = async () => {
    await apiPost('/api/customer-auth', { action: 'send', email, purpose: mode, name: fullName.trim() || 'Customer' });
    setResendCooldown(30);
  };

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (mode === 'signup') {
      if (fullName.trim().length < 2) {
        setError('Please enter your full name.');
        return;
      }
      if (!/^[6-9]\d{9}$/.test(mobileNumber)) {
        setError('Please enter a valid 10-digit Indian mobile number.');
        return;
      }
    }
    setLoading(true);
    try {
      await sendCode();
      setOtpCode(['', '', '', '', '', '']);
      setOtpStep(true);
      showToast(`We sent a 6-digit code to ${email}.`, 'success');
    } catch (err: any) {
      setError(err?.message || 'Could not send the code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setLoading(true);
    try {
      await sendCode();
      setOtpCode(['', '', '', '', '', '']);
      showToast(`A new code was sent to ${email}.`, 'success');
    } catch (err: any) {
      setError(err?.message || 'Could not resend the code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    const code = otpCode.join('');
    if (code.length < 6) {
      setError('Please enter the full 6-digit code from your email.');
      return;
    }
    setLoading(true);
    try {
      const result = await apiPost<VerifyResponse>('/api/customer-auth', {
        action: 'verify',
        email,
        purpose: mode,
        code,
        name: mode === 'signup' ? fullName.trim() : undefined,
        phone: mode === 'signup' ? mobileNumber : undefined,
      });
      await signInWithOtpToken(result.firebaseToken, result.customer);
      await syncCustomerOrders(result.email);
      const name = result.customer?.name;
      showToast(mode === 'signup' ? `Welcome to Suit Aura Girls${name ? `, ${name}` : ''}.` : `Welcome back${name ? `, ${name}` : ''}.`, 'success');
      const next = sessionStorage.getItem('sag_after_login');
      sessionStorage.removeItem('sag_after_login');
      setActivePage(next === 'checkout' ? 'checkout' : 'account');
    } catch (err: any) {
      setError(err?.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // "Continue with Google": Google's own button (its screen names suitauragirls.in); the credential becomes a customer session
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const onGoogleCredential = async (credential: string) => {
    setError(null);
    setGoogleLoading(true);
    try {
      const result = await exchangeGoogleCredential(credential);
      await signInWithOtpToken(result.firebaseToken, result.customer);
      await syncCustomerOrders(result.email);
      const name = result.customer?.name;
      showToast(`Welcome${name ? `, ${name.split(' ')[0]}` : ''}!`, 'success');
      const next = sessionStorage.getItem('sag_after_login');
      sessionStorage.removeItem('sag_after_login');
      setActivePage(next === 'checkout' ? 'checkout' : 'account');
    } catch (err: any) {
      setError(err?.message || 'Google sign-in failed. Please try again or use the email code.');
    } finally {
      setGoogleLoading(false);
    }
  };

  useEffect(() => {
    if (!GOOGLE_LOGIN_ENABLED || otpStep) return;
    let cancelled = false;
    getGoogleId(onGoogleCredential)
      .then((g) => {
        const el = googleButtonRef.current;
        if (cancelled || !el) return;
        el.innerHTML = '';
        g.renderButton(el, {
          type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'center',
          width: Math.min(400, Math.max(220, el.clientWidth || 320)),
        });
      })
      .catch(() => { if (!cancelled) setGoogleUnavailable(true); });
    return () => { cancelled = true; };
  }, [otpStep, mode]);

  const handleOtpDigitChange = (index: number, value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length > 1) {
      // Pasted code: spread it across the boxes.
      const next = ['', '', '', '', '', ''];
      digits.slice(0, 6).split('').forEach((digit, i) => { next[i] = digit; });
      setOtpCode(next);
      document.getElementById(`otp-input-${Math.min(5, digits.length - 1)}`)?.focus();
      return;
    }
    const next = [...otpCode];
    next[index] = digits;
    setOtpCode(next);
    if (digits && index < 5) document.getElementById(`otp-input-${index + 1}`)?.focus();
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setOtpStep(false);
    setError(null);
    setOtpCode(['', '', '', '', '', '']);
  };

  if (user) {
    return (
      <div className="min-h-[70vh] bg-[#FBF7F3] px-4 py-16 flex items-center justify-center">
        <div className="max-w-sm w-full text-center rounded-3xl border border-[#4B1D3F]/10 bg-white shadow-[var(--sag-shadow)] p-8 space-y-4">
          <span className="w-16 h-16 mx-auto rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-700" />
          </span>
          <h1 className="font-serif text-3xl text-[#2A1A26]">You are signed in</h1>
          <p className="text-sm text-[#2A1A26]/70 break-all">{user.email}</p>
          <button onClick={() => setActivePage('account')} className={primaryButton}>Go to my account</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBF7F3] pt-5 pb-12 sm:py-12 px-4 flex items-start sm:items-center justify-center">
      <div className="max-w-md w-full space-y-4 sm:space-y-5">
        <button
          onClick={() => setActivePage('home')}
          className="inline-flex items-center gap-2 h-10 pl-2 pr-4 -ml-2 rounded-full text-xs font-semibold uppercase tracking-[0.16em] text-[#4B1D3F] hover:bg-[#F3EEF8] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to shop</span>
        </button>

        <div className="bg-white rounded-3xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] overflow-hidden">
          <div className="px-6 pt-8 pb-6 text-center bg-[#F3EEF8]/60 border-b border-[#4B1D3F]/8">
            <span className="w-14 h-14 mx-auto rounded-full bg-white ring-1 ring-[#4B1D3F]/10 shadow-[var(--sag-shadow)] flex items-center justify-center">
              {otpStep ? <LockIcon className="w-7 h-7" /> : <UserIcon className="w-7 h-7" />}
            </span>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#9C7A45]">Suit Aura Girls</p>
            <h1 className="font-serif text-[32px] leading-tight text-[#2A1A26] mt-1">
              {otpStep ? 'Check your email' : mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h1>
            <p className="text-sm text-[#2A1A26]/70 mt-1.5 max-w-xs mx-auto leading-relaxed">
              {otpStep ? 'Enter the 6-digit code to continue.' : 'No password needed. We email you a one-time code.'}
            </p>
          </div>

          <div className="p-5 sm:p-8 space-y-5">
            {!otpStep && (
              <div className="grid grid-cols-2 gap-1 p-1 rounded-full bg-[#F3EEF8]" role="tablist" aria-label="Sign in or create an account">
                {(['login', 'signup'] as AuthMode[]).map((tab) => (
                  <button
                    key={tab}
                    role="tab"
                    aria-selected={mode === tab}
                    onClick={() => switchMode(tab)}
                    className={`h-10 rounded-full text-[13px] font-semibold transition-colors cursor-pointer ${
                      mode === tab ? 'bg-white text-[#4B1D3F] shadow-[var(--sag-shadow)]' : 'text-[#2A1A26]/65 hover:text-[#2A1A26]'
                    }`}
                  >
                    {tab === 'login' ? 'Sign in' : 'New account'}
                  </button>
                ))}
              </div>
            )}

            {error && (
              <div role="alert" className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {!otpStep && GOOGLE_LOGIN_ENABLED && !googleUnavailable && (
              <>
                <div className="relative flex justify-center min-h-[44px]">
                  <div id="auth-google" ref={googleButtonRef} className={`w-full flex justify-center ${googleLoading ? 'opacity-40 pointer-events-none' : ''}`} />
                  {googleLoading && <Loader2 className="absolute top-3 w-5 h-5 animate-spin text-[#4B1D3F]" />}
                </div>
                <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2A1A26]/55"><span className="h-px flex-1 bg-[#4B1D3F]/10" />or use email<span className="h-px flex-1 bg-[#4B1D3F]/10" /></div>
              </>
            )}

            {!otpStep ? (
              <form onSubmit={handleRequestCode} className="space-y-4" noValidate>
                {mode === 'signup' && (
                  <>
                    <label className="block space-y-1.5">
                      <span className={labelClass}>Full name</span>
                      <span className="relative block">
                        <UserIcon className={iconInInput} mono />
                        <input id="signup-name" type="text" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Ananya Sharma" className={inputClass} />
                      </span>
                    </label>
                    <label className="block space-y-1.5">
                      <span className={labelClass}>Mobile number</span>
                      <span className="relative block">
                        <Phone className={iconInInput} />
                        <input id="signup-phone" type="tel" inputMode="numeric" autoComplete="tel-national" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile number" className={inputClass} />
                      </span>
                    </label>
                  </>
                )}
                <label className="block space-y-1.5">
                  <span className={labelClass}>Email address</span>
                  <span className="relative block">
                    <Mail className={iconInInput} />
                    <input id="auth-email" type="email" autoComplete="email" value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} placeholder="name@example.com" className={inputClass} />
                  </span>
                </label>
                <button id="auth-send-code" type="submit" disabled={loading} className={primaryButton}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  <span>{loading ? 'Sending code…' : 'Email me a code'}</span>
                  {!loading && <ArrowRight className="w-4 h-4" />}
                </button>
                <p className="text-[13px] text-[#2A1A26]/65 text-center">
                  {mode === 'login' ? 'New here? A code also creates your account.' : 'Already have an account? Use the Sign in tab.'}
                </p>
              </form>
            ) : (
              <form onSubmit={handleVerify} className="space-y-5">
                <div className="flex items-center gap-3 rounded-2xl bg-[#FBF7F3] border border-[#4B1D3F]/8 px-4 py-3">
                  <span className="w-9 h-9 shrink-0 rounded-full bg-white ring-1 ring-[#4B1D3F]/10 flex items-center justify-center"><Mail className="w-4 h-4 text-[#4B1D3F]" aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9C7A45]">Code sent to</p>
                    <p className="text-sm font-semibold text-[#2A1A26] break-all">{email}</p>
                  </div>
                  <button type="button" onClick={() => { setOtpStep(false); setError(null); }} aria-label="Change email" className="w-9 h-9 shrink-0 rounded-full hover:bg-[#F3EEF8] flex items-center justify-center text-[#4B1D3F] cursor-pointer">
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
                <fieldset>
                  <legend className="sr-only">6-digit code</legend>
                  <div className="grid grid-cols-6 gap-2 sm:gap-2.5 max-w-[340px] mx-auto">
                    {otpCode.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={idx === 0 ? firstOtpInput : undefined}
                        id={`otp-input-${idx}`}
                        type="text"
                        inputMode="numeric"
                        autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                        aria-label={`Digit ${idx + 1}`}
                        maxLength={idx === 0 ? 6 : 1}
                        value={digit}
                        onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' && !digit && idx > 0) document.getElementById(`otp-input-${idx - 1}`)?.focus();
                        }}
                        className={`w-full min-w-0 h-14 text-center font-sans font-semibold text-xl text-[#2A1A26] rounded-2xl border transition focus:outline-none focus:border-[#4B1D3F] focus:ring-4 focus:ring-[#F3EEF8] ${
                          digit ? 'bg-white border-[#4B1D3F]/45' : 'bg-[#FBF7F3] border-[#4B1D3F]/20'
                        }`}
                      />
                    ))}
                  </div>
                </fieldset>
                <p className="text-[13px] text-[#2A1A26]/65 text-center">The code expires in 10 minutes. Check spam if it has not arrived.</p>
                <button id="auth-verify-code" type="submit" disabled={loading} className={primaryButton}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LockIcon className="w-4 h-4" mono />}
                  <span>{loading ? 'Verifying…' : mode === 'signup' ? 'Verify & create account' : 'Verify & sign in'}</span>
                </button>
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <button type="button" onClick={() => { setOtpStep(false); setError(null); }} className="min-h-10 text-[#2A1A26]/70 hover:text-[#2A1A26] underline underline-offset-2 cursor-pointer">
                    Change email
                  </button>
                  {resendCooldown > 0 ? (
                    <span className="inline-flex items-center h-9 px-3 rounded-full bg-[#F3EEF8] text-[#2A1A26]/70 tabular-nums">Resend in {resendCooldown}s</span>
                  ) : (
                    <button type="button" disabled={loading} onClick={handleResend} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full font-semibold text-[#4B1D3F] hover:bg-[#F3EEF8] cursor-pointer disabled:opacity-60">
                      <RefreshCw className="w-3.5 h-3.5" />
                      Resend code
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>

          {!otpStep && (
            <ul className="grid grid-cols-3 border-t border-[#4B1D3F]/8 bg-[#FBF7F3]/70" aria-label="With an account you can">
              {PERKS.map(({ icon: Icon, label }) => (
                <li key={label} className="flex flex-col items-center gap-1.5 px-2 py-4 text-center">
                  <Icon className="w-6 h-6" live={false} />
                  <span className="text-[11px] leading-tight font-medium text-[#2A1A26]/70">{label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
