import React, { useEffect, useRef, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { apiPost } from '../lib/api';
import { GOOGLE_LOGIN_ENABLED, exchangeGoogleCredential, getGoogleId } from '../utils/googleSignIn';
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, Lock, RefreshCw } from 'lucide-react';
import { AuraTitle, Icon } from '../aura';

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

  const card = 'aura-card aura-blk mt-6 px-4 pt-5 pb-[22px] sm:px-7 sm:pt-7 sm:pb-8 min-[900px]:mt-0';

  if (user) {
    return (
      <section data-th="blush" className="aa-cen">
        <div className="aa-cen-in">
          <AuraTitle as="h1" label="My account" title="You are signed" accent="in" sub={<span className="ocf-em">{user.email}</span>} />
          <div className={card}>
            <span className="aa-ic aa-ic-ink"><Icon name="check" draw className="in" /></span>
            <p className="mt-4 text-[15px] leading-[22px] text-ink-muted">Your orders, returns and saved addresses are in My account.</p>
            <button type="button" onClick={() => setActivePage('account')} className="aura-btn aura-btn-w mt-5">Go to my account <ArrowRight aria-hidden="true" /></button>
          </div>
        </div>
      </section>
    );
  }

  const title: [string, string] = otpStep ? ['Check your', 'email'] : mode === 'login' ? ['Sign', 'in'] : ['Create your', 'account'];
  const changeEmail = () => { setOtpStep(false); setError(null); };
  const note = 'text-[13.5px] leading-5 text-ink-muted';
  // Which field the message is about, read from the message itself (looks only: the field is marked and shakes once)
  const about = !error ? '' : otpStep ? 'code' : /name/i.test(error) ? 'name' : /mobile/i.test(error) ? 'phone' : /email/i.test(error) ? 'email' : '';
  const bad = (field: string) => (about === field ? { 'aria-invalid': true as const, 'aria-describedby': 'auth-error' } : {});

  return (
    <section data-th="blush" className="aa-cen">
      <div className="aa-cen-in">
        <div className="min-w-0">
          <button type="button" onClick={() => setActivePage('home')} className="aura-lk -mt-2 mb-3 text-[14px]">
            <ArrowLeft strokeWidth={1.6} aria-hidden="true" />
            <span>Back to shop</span>
          </button>
          <AuraTitle
            as="h1"
            label="My account"
            title={title[0]}
            accent={title[1]}
            sub={otpStep ? 'Enter the 6-digit code we emailed you.' : mode === 'login' ? 'Sign in to track orders and keep your wishlist.' : 'Track orders, request returns and save addresses.'}
            size={otpStep ? 'lg' : 'xl'}
          />
          {/* What an account keeps, in the store's own words (desktop: under the heading) */}
          <ul className="aa-keeps max-[899px]:hidden" aria-label="What your account keeps">
            {['Your orders and their tracking', 'Returns and size exchanges', 'Saved addresses for a faster checkout'].map((line) => (
              <li key={line}><Icon name="check" size={16} /> {line}</li>
            ))}
          </ul>
        </div>

        <div className={card}>
          {!otpStep && (
            <div className="aa-tabs mb-4" data-on={mode === 'login' ? '0' : '1'} role="tablist" aria-label="Sign in or create an account">
              {(['login', 'signup'] as AuthMode[]).map((tab) => (
                <button key={tab} type="button" role="tab" aria-selected={mode === tab} onClick={() => switchMode(tab)}>
                  {tab === 'login' ? 'Sign in' : 'New account'}
                </button>
              ))}
            </div>
          )}

          <div key={otpStep ? 'code' : mode} className="sag-step-in space-y-3.5">
            {error && (
              <div id="auth-error" role="alert" className="aa-alert aco-open">
                <AlertCircle strokeWidth={1.6} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {!otpStep && GOOGLE_LOGIN_ENABLED && !googleUnavailable && (
              <>
                <div className="relative flex min-h-[44px] justify-center">
                  <div id="auth-google" ref={googleButtonRef} className={`flex w-full justify-center ${googleLoading ? 'pointer-events-none opacity-40' : ''}`} />
                  {googleLoading && <Loader2 className="absolute top-3 h-5 w-5 animate-spin text-ink" aria-label="Signing in with Google" />}
                </div>
                <div className="aura-lbl flex items-center gap-3 text-[12px]">
                  <span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" />
                </div>
              </>
            )}

            {!otpStep ? (
              <form onSubmit={handleRequestCode} className="space-y-3" noValidate>
                {mode === 'signup' && (
                  <>
                    <label className="aura-field" htmlFor="signup-name">
                      <input id="signup-name" {...bad('name')} name="name" type="text" autoComplete="name" autoCapitalize="words" enterKeyHint="next" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Ananya Sharma" />
                      <span>Full name</span>
                      <i />
                    </label>
                    <label className="aura-field aa-tel" htmlFor="signup-phone">
                      <input id="signup-phone" {...bad('phone')} name="mobile" type="tel" inputMode="numeric" autoComplete="tel-national" enterKeyHint="next" maxLength={10} value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile number" />
                      <span>Mobile number</span>
                      <b aria-hidden="true">+91</b>
                      <i />
                    </label>
                  </>
                )}
                <label className="aura-field" htmlFor="auth-email">
                  <input id="auth-email" {...bad('email')} name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done" value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} placeholder="name@example.com" />
                  <span>Email</span>
                  <i />
                </label>
                <button id="auth-send-code" type="submit" disabled={loading} className="aura-btn aura-btn-w">
                  {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
                  <span>{loading ? 'Sending code…' : 'Send code'}</span>
                  {!loading && <ArrowRight aria-hidden="true" />}
                </button>
                <p className={`${note} pt-1 text-center`}>
                  {mode === 'login' ? 'No password needed. New here? The code also creates your account.' : 'Already have an account? Use the Sign in tab.'}
                </p>
              </form>
            ) : (
              <form onSubmit={handleVerify} className="space-y-4">
                <div className="min-w-0">
                  <p className={note}>Code sent to</p>
                  <p className="flex flex-wrap items-center gap-x-3">
                    <span className="min-w-0 text-[15px] leading-5 font-bold text-ink [overflow-wrap:anywhere]">{email}</span>
                    <button type="button" onClick={changeEmail} aria-label="Change email" className="aura-lk text-[14px]">Change</button>
                  </p>
                </div>
                <fieldset>
                  <legend className="aa-flbl">6-digit code</legend>
                  <div className={`aa-otp pt-1${about === 'code' ? ' err' : ''}`}>
                    {otpCode.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={idx === 0 ? firstOtpInput : undefined}
                        id={`otp-input-${idx}`}
                        type="text"
                        inputMode="numeric"
                        autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                        aria-label={`Digit ${idx + 1}`}
                        aria-invalid={about === 'code' ? true : undefined}
                        maxLength={idx === 0 ? 6 : 1}
                        value={digit}
                        onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' && !digit && idx > 0) document.getElementById(`otp-input-${idx - 1}`)?.focus();
                        }}
                        className={digit ? 'f' : undefined}
                      />
                    ))}
                  </div>
                </fieldset>
                <p className={note}>The code expires in 10 minutes. Check spam if it has not arrived.</p>
                <button id="auth-verify-code" type="submit" disabled={loading} className="aura-btn aura-btn-w">
                  {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Lock strokeWidth={1.6} aria-hidden="true" />}
                  <span>{loading ? 'Verifying…' : mode === 'signup' ? 'Verify & create account' : 'Verify & sign in'}</span>
                </button>
                <div className="flex justify-center">
                  {resendCooldown > 0 ? (
                    <span className="aura-num inline-flex min-h-11 items-center text-[13.5px] text-ink-muted">Resend in {resendCooldown}s</span>
                  ) : (
                    <button type="button" disabled={loading} onClick={handleResend} className="aura-lk text-[14px] disabled:opacity-60">
                      <RefreshCw strokeWidth={1.6} aria-hidden="true" />
                      Resend code
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
