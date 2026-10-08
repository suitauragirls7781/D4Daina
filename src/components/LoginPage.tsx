import React, { useEffect, useRef, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { apiPost } from '../lib/api';
import { GOOGLE_LOGIN_ENABLED, exchangeGoogleCredential, getGoogleId } from '../utils/googleSignIn';
import { AlertCircle, ArrowLeft, Check, Loader2, Lock, RefreshCw } from 'lucide-react';

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
          type: 'standard', theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'center',
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
      <div className="min-h-[70vh] px-4 py-12 flex items-start sm:items-center justify-center">
        <div className="w-full max-w-sm text-center sag-glass px-5 py-8">
          <span className="mx-auto flex h-[54px] w-[54px] items-center justify-center !rounded-full sag-glass text-sale">
            <Check className="w-6 h-6" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <h1 className="mt-4 font-display text-[23px] leading-7 font-medium text-ink">You are signed in</h1>
          <p className="mt-1.5 text-[13px] leading-[18px] text-ink-muted break-all">{user.email}</p>
          <button type="button" onClick={() => setActivePage('account')} className="sag-btn-primary w-full mt-6">Go to my account</button>
        </div>
      </div>
    );
  }

  const title = otpStep ? 'Check your email' : mode === 'login' ? 'Welcome' : 'Create your account';
  const changeEmail = () => { setOtpStep(false); setError(null); };
  const label = 'sag-label text-[11.5px] leading-4 font-normal uppercase tracking-[0.06em] text-ink-muted';
  const note = 'text-[11.5px] leading-4 text-ink-muted';

  return (
    <div className="min-h-[80vh] px-4 pt-1 pb-12 sm:py-12 flex items-start justify-center">
      <div className="w-full max-w-[400px]">
        <button type="button" onClick={() => setActivePage('home')} className="sag-link gap-1.5 text-[12.5px]">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
          <span>Back to shop</span>
        </button>

        <div className="mt-5 sm:mt-4 sag-glass px-5 py-7 sm:px-7 sm:py-8">
          <div className="text-center">
            <img src="/suit-aura-mark-132.webp" alt="" width="66" height="66" className="mx-auto h-[66px] w-[66px] rounded-full border border-line bg-surface object-cover" />
            <h1 className="mt-[18px] font-display text-[23px] leading-7 font-medium text-ink lg:text-[28px] lg:leading-9">{title}</h1>
            <p className="mt-1.5 text-[13px] leading-[18px] text-ink-muted">
              {otpStep ? 'Enter the 6-digit code we emailed you.' : mode === 'login' ? 'Sign in to track orders and keep your wishlist.' : 'Track orders, request returns and save addresses.'}
            </p>
          </div>

          <div className="mt-6 space-y-3">
            {!otpStep && (
              <div className="grid grid-cols-2 border-b border-line" role="tablist" aria-label="Sign in or create an account">
                {(['login', 'signup'] as AuthMode[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={mode === tab}
                    onClick={() => switchMode(tab)}
                    className={`-mb-px h-11 border-b text-[11.5px] uppercase tracking-[0.1em] transition-colors cursor-pointer ${
                      mode === tab ? 'border-brand font-semibold text-sale' : 'border-transparent text-ink-muted hover:text-ink'
                    }`}
                  >
                    {tab === 'login' ? 'Sign in' : 'New account'}
                  </button>
                ))}
              </div>
            )}

            {error && (
              <div role="alert" className="flex items-start gap-2 border border-danger-line bg-surface px-3.5 py-3 text-sm leading-5 text-danger">
                <AlertCircle className="w-[18px] h-[18px] mt-px shrink-0" strokeWidth={1.5} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {!otpStep && GOOGLE_LOGIN_ENABLED && !googleUnavailable && (
              <>
                <div className="relative flex justify-center min-h-[44px] pt-1">
                  <div id="auth-google" ref={googleButtonRef} className={`w-full flex justify-center ${googleLoading ? 'opacity-40 pointer-events-none' : ''}`} />
                  {googleLoading && <Loader2 className="absolute top-3 w-5 h-5 animate-spin text-ink" aria-label="Signing in with Google" />}
                </div>
                <div className={`flex items-center gap-2.5 ${note}`}>
                  <span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" />
                </div>
              </>
            )}

            {!otpStep ? (
              <form onSubmit={handleRequestCode} className="space-y-3.5" noValidate>
                {mode === 'signup' && (
                  <>
                    <div>
                      <label htmlFor="signup-name" className={label}>Full name</label>
                      <input id="signup-name" name="name" type="text" autoComplete="name" autoCapitalize="words" enterKeyHint="next" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Ananya Sharma" className="sag-input" />
                    </div>
                    <div>
                      <label htmlFor="signup-phone" className={label}>Mobile number</label>
                      <div className="flex h-[52px] max-sm:h-[46px] !rounded-[16px] border border-line bg-surface overflow-hidden has-[:focus]:border-brand has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand">
                        <span className="flex items-center px-3.5 border-r border-line text-base text-ink-muted" aria-hidden="true">+91</span>
                        <input id="signup-phone" name="mobile" type="tel" inputMode="numeric" autoComplete="tel-national" enterKeyHint="next" maxLength={10} value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile number" className="flex-1 min-w-0 h-full px-3.5 bg-transparent text-base text-ink placeholder:text-ink-faint focus:outline-none" />
                      </div>
                    </div>
                  </>
                )}
                <div>
                  <label htmlFor="auth-email" className={label}>Email</label>
                  <input id="auth-email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done" value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} placeholder="name@example.com" className="sag-input" />
                </div>
                <button id="auth-send-code" type="submit" disabled={loading} className="sag-btn-primary w-full gap-2">
                  {loading && <Loader2 className="w-[18px] h-[18px] animate-spin" aria-hidden="true" />}
                  <span>{loading ? 'Sending code…' : 'Send code'}</span>
                </button>
                <p className={`${note} pt-0.5 text-center`}>
                  {mode === 'login' ? 'No password needed. New here? The code also creates your account.' : 'Already have an account? Use the Sign in tab.'}
                </p>
              </form>
            ) : (
              <form onSubmit={handleVerify} className="space-y-5">
                <div className="flex items-center justify-between gap-3 rounded-[16px] border border-line bg-surface px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className={note}>Code sent to</p>
                    <p className="text-sm leading-5 font-medium text-ink break-all">{email}</p>
                  </div>
                  <button type="button" onClick={changeEmail} aria-label="Change email" className="sag-link shrink-0 text-[12.5px]">Change</button>
                </div>
                <fieldset>
                  <legend className={label}>6-digit code</legend>
                  <div className="grid grid-cols-6 gap-2">
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
                        className={`sag-num w-full min-w-0 h-14 px-0 text-center text-[22px] leading-7 font-medium text-ink bg-surface border rounded-[14px] transition-colors focus:border-brand ${
                          digit ? 'border-brand' : 'border-line'
                        }`}
                      />
                    ))}
                  </div>
                </fieldset>
                <p className={note}>The code expires in 10 minutes. Check spam if it has not arrived.</p>
                <button id="auth-verify-code" type="submit" disabled={loading} className="sag-btn-primary w-full gap-2">
                  {loading ? <Loader2 className="w-[18px] h-[18px] animate-spin" aria-hidden="true" /> : <Lock className="w-[18px] h-[18px]" strokeWidth={1.5} aria-hidden="true" />}
                  <span>{loading ? 'Verifying…' : mode === 'signup' ? 'Verify & create account' : 'Verify & sign in'}</span>
                </button>
                <div className="flex justify-center">
                  {resendCooldown > 0 ? (
                    <span className="sag-num inline-flex items-center min-h-11 text-[12.5px] text-ink-muted">Resend in {resendCooldown}s</span>
                  ) : (
                    <button type="button" disabled={loading} onClick={handleResend} className="sag-link gap-1.5 text-[12.5px] disabled:opacity-60">
                      <RefreshCw className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
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
