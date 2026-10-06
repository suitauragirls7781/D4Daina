import React, { useEffect, useRef, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { apiPost } from '../lib/api';
import { GOOGLE_LOGIN_ENABLED, exchangeGoogleCredential, getGoogleId } from '../utils/googleSignIn';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Lock, RefreshCw } from 'lucide-react';

type AuthMode = 'login' | 'signup';

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
          type: 'standard', theme: 'outline', size: 'large', shape: 'rectangular', text: 'continue_with', logo_alignment: 'center',
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
      <div className="min-h-[70vh] bg-page px-4 py-12 flex items-start sm:items-center justify-center">
        <div className="sag-card w-full max-w-sm p-6 text-center">
          <CheckCircle2 className="w-10 h-10 mx-auto text-ok" aria-hidden="true" />
          <h1 className="mt-3 font-display text-[28px] leading-8 text-ink">You are signed in</h1>
          <p className="mt-1 text-sm leading-5 text-ink-muted break-all">{user.email}</p>
          <button type="button" onClick={() => setActivePage('account')} className="sag-btn-primary w-full mt-5">Go to my account</button>
        </div>
      </div>
    );
  }

  const title = otpStep ? 'Check your email' : mode === 'login' ? 'Sign in' : 'Create your account';
  const changeEmail = () => { setOtpStep(false); setError(null); };

  return (
    <div className="min-h-[80vh] bg-lilac rounded-b-[28px] px-4 pt-1 pb-10 sm:py-12 flex items-start justify-center">
      <div className="w-full max-w-[440px]">
        <button type="button" onClick={() => setActivePage('home')} className="sag-link gap-1.5">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Back to shop</span>
        </button>

        <div className="mt-2">
          <div className="text-center">
            <span className="sag-ring inline-block rounded-full">
              <img src="/suit-aura-mark-132.webp" alt="" width="72" height="72" className="h-[72px] w-[72px] rounded-full bg-white object-cover" />
            </span>
            <h1 className="mt-3.5 font-display text-[24px] leading-[30px] text-ink">{otpStep ? title : mode === 'login' ? 'Sign in to Suit Aura Girls' : 'Create your account'}</h1>
            <p className="mt-1 text-[13px] leading-[18px] text-lilac-ink">
              {otpStep ? 'Enter the 6-digit code we emailed you.' : 'Track orders, request returns and save addresses.'}
            </p>
          </div>

          <div className="mt-5 space-y-4">
            {!otpStep && (
              <div className="grid grid-cols-2 gap-1 p-1 rounded-full bg-white/60" role="tablist" aria-label="Sign in or create an account">
                {(['login', 'signup'] as AuthMode[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={mode === tab}
                    onClick={() => switchMode(tab)}
                    className={`h-11 rounded-full text-sm font-bold transition-colors cursor-pointer ${
                      mode === tab ? 'bg-white text-ink shadow-[0_1px_4px_rgba(34,27,51,0.10)]' : 'text-lilac-ink hover:text-ink'
                    }`}
                  >
                    {tab === 'login' ? 'Sign in' : 'New account'}
                  </button>
                ))}
              </div>
            )}

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-control border border-danger-line bg-danger-tint px-3.5 py-3 text-sm leading-5 font-medium text-danger">
                <AlertCircle className="w-[18px] h-[18px] mt-px shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {!otpStep && GOOGLE_LOGIN_ENABLED && !googleUnavailable && (
              <>
                <div className="relative flex justify-center min-h-[44px]">
                  <div id="auth-google" ref={googleButtonRef} className={`w-full flex justify-center ${googleLoading ? 'opacity-40 pointer-events-none' : ''}`} />
                  {googleLoading && <Loader2 className="absolute top-3 w-5 h-5 animate-spin text-ink" aria-label="Signing in with Google" />}
                </div>
                <div className="flex items-center gap-3 text-xs leading-[18px] font-bold text-lilac-ink">
                  <span className="h-px flex-1 bg-brand-line" />or use your email<span className="h-px flex-1 bg-brand-line" />
                </div>
              </>
            )}

            {!otpStep ? (
              <form onSubmit={handleRequestCode} className="space-y-4" noValidate>
                {mode === 'signup' && (
                  <>
                    <div>
                      <label htmlFor="signup-name" className="sag-label">Full name</label>
                      <input id="signup-name" name="name" type="text" autoComplete="name" autoCapitalize="words" enterKeyHint="next" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Ananya Sharma" className="sag-input rounded-full border-transparent focus:border-brand" />
                    </div>
                    <div>
                      <label htmlFor="signup-phone" className="sag-label">Mobile number</label>
                      <div className="flex h-[52px] rounded-full border-[1.5px] border-transparent bg-white overflow-hidden has-[:focus]:border-brand has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink">
                        <span className="flex items-center px-3.5 bg-sunken border-r border-line text-base text-ink-muted" aria-hidden="true">+91</span>
                        <input id="signup-phone" name="mobile" type="tel" inputMode="numeric" autoComplete="tel-national" enterKeyHint="next" maxLength={10} value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile number" className="flex-1 min-w-0 h-full px-3.5 bg-white text-base text-ink placeholder:text-ink-faint focus:outline-none" />
                      </div>
                    </div>
                  </>
                )}
                <div>
                  <label htmlFor="auth-email" className="sag-label">Email</label>
                  <input id="auth-email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done" value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} placeholder="name@example.com" className="sag-input rounded-full border-transparent focus:border-brand" />
                </div>
                <button id="auth-send-code" type="submit" disabled={loading} className="w-full h-[52px] rounded-full bg-ink text-white text-base font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
                  {loading && <Loader2 className="w-[18px] h-[18px] animate-spin" aria-hidden="true" />}
                  <span>{loading ? 'Sending code…' : 'Email me a code'}</span>
                </button>
                <p className="text-[13px] leading-[18px] text-lilac-ink text-center">
                  {mode === 'login' ? 'No password needed. New here? The code also creates your account.' : 'Already have an account? Use the Sign in tab.'}
                </p>
              </form>
            ) : (
              <form onSubmit={handleVerify} className="space-y-5">
                <div className="flex items-center justify-between gap-3 rounded-control bg-white px-3.5 py-2">
                  <div className="min-w-0">
                    <p className="text-[13px] leading-[18px] text-ink-muted">Code sent to</p>
                    <p className="text-sm leading-5 font-semibold text-ink break-all">{email}</p>
                  </div>
                  <button type="button" onClick={changeEmail} aria-label="Change email" className="sag-link shrink-0">Change</button>
                </div>
                <fieldset>
                  <legend className="sag-label">6-digit code</legend>
                  <div className="grid grid-cols-6 gap-2 max-w-[328px]">
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
                        className={`sag-num w-full min-w-0 h-14 px-0 text-center text-[22px] leading-7 font-semibold text-ink bg-white rounded-chip border-[1.5px] transition-colors focus:border-brand ${
                          digit ? 'border-ink' : 'border-control'
                        }`}
                      />
                    ))}
                  </div>
                </fieldset>
                <p className="text-[13px] leading-[18px] text-lilac-ink">The code expires in 10 minutes. Check spam if it has not arrived.</p>
                <button id="auth-verify-code" type="submit" disabled={loading} className="sag-btn-primary w-full gap-2">
                  {loading ? <Loader2 className="w-[18px] h-[18px] animate-spin" aria-hidden="true" /> : <Lock className="w-[18px] h-[18px]" aria-hidden="true" />}
                  <span>{loading ? 'Verifying…' : mode === 'signup' ? 'Verify & create account' : 'Verify & sign in'}</span>
                </button>
                <div className="flex justify-center">
                  {resendCooldown > 0 ? (
                    <span className="sag-num inline-flex items-center min-h-11 text-sm text-lilac-ink">Resend in {resendCooldown}s</span>
                  ) : (
                    <button type="button" disabled={loading} onClick={handleResend} className="sag-link gap-1.5 disabled:opacity-60">
                      <RefreshCw className="w-4 h-4" aria-hidden="true" />
                      Resend code
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
