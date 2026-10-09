import React, { useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { useRouter } from '../../context/RouterContext';
import {
  ShieldCheck,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  Store,
  KeyRound,
  Loader2
} from 'lucide-react';

export const AdminLogin: React.FC = () => {
  const { loginAdmin, setAdminTab } = useAdmin();
  const { showToast, setActivePage } = useShop();
  const { navigate } = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  // "Save login on this phone": on by default, remembered for the next time the form is shown
  const [remember, setRemember] = useState(() => { try { return localStorage.getItem('sag_admin_remember') !== '0'; } catch { return true; } });
  const toggleRemember = () => setRemember((on) => { try { localStorage.setItem('sag_admin_remember', on ? '0' : '1'); } catch {} return !on; });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setLoading(true);

    try {
      const res = await loginAdmin(email, password, pin, remember);
      if (res.success) {
        showToast(remember ? 'Signed in. Login saved on this phone.' : 'Signed in.', 'success');
        setAdminTab('dashboard');
        setActivePage('admin');
        navigate('/admin/dashboard');
      } else {
        setErrorMessage(res.message || 'The username, password or PIN is not right. Please check and try again.');
      }
    } catch {
      setErrorMessage('Could not sign in just now. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReturnToStorefront = () => {
    setActivePage('home');
    navigate('/');
  };

  const inputClass = 'sag-input pl-11';
  const iconClass = 'absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-ink-muted';

  return (
    <div id="admin-login-page" className="min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="bg-surface border-b border-line">
        <div className="max-w-5xl mx-auto h-14 pl-4 pr-2 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 shrink-0 rounded-full bg-brand text-[color:var(--sag-on-gold)] flex items-center justify-center text-[13px] font-extrabold tracking-[0.02em]" aria-hidden="true">SA</div>
            <span className="font-display text-[19px] leading-6 text-ink truncate">Suit Aura Girls</span>
          </div>
          <button
            id="admin-login-back-to-store-btn"
            onClick={handleReturnToStorefront}
            className="sag-link gap-1.5 px-2 shrink-0"
          >
            <Store className="w-4 h-4" />
            <span>View store</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col sm:justify-center px-4 py-6 sm:py-10">
        <div className="w-full max-w-md mx-auto">
          <div className="sag-glass !rounded-[28px] p-5 sm:p-8">
            <div className="pb-5 border-b border-line">
              <p className="flex items-center gap-1.5 text-xs leading-4 font-bold uppercase tracking-[0.16em] text-ink-muted">
                <ShieldCheck className="w-4 h-4" aria-hidden="true" /> Store staff only
              </p>
              <h2 className="mt-2.5 font-display text-[30px] leading-9 sm:text-[34px] sm:leading-10 text-ink">Admin sign in</h2>
              <p className="mt-1 text-sm leading-5 text-ink-muted">
                Enter your username, password and 6-digit PIN to manage products, orders, customers and store settings.
              </p>
            </div>

            {errorMessage && (
              <div role="alert" className="mt-5 px-3.5 py-3 rounded-[16px] bg-danger-tint border border-danger-line text-sm leading-5 text-danger font-medium flex items-start gap-2">
                <Lock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label htmlFor="admin-email-input" className="sag-label">
                  Username or email
                </label>
                <div className="relative">
                  <div className={iconClass}>
                    <Mail className="w-[18px] h-[18px]" />
                  </div>
                  <input
                    id="admin-email-input"
                    type="text"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter admin username"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="next"
                    className={`${inputClass} pr-3.5`}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="admin-password-input" className="sag-label">
                  Password
                </label>
                <div className="relative">
                  <div className={iconClass}>
                    <Lock className="w-[18px] h-[18px]" />
                  </div>
                  <input
                    id="admin-password-input"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    enterKeyHint="next"
                    className={`${inputClass} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-1.5 my-1.5 w-11 flex items-center justify-center rounded-full text-ink-muted hover:text-ink hover:bg-sunken cursor-pointer transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                  </button>
                </div>
              </div>

              {/* 6-digit security PIN */}
              <div>
                <label htmlFor="admin-pin-input" className="sag-label">
                  6-digit security PIN
                </label>
                <div className="relative">
                  <div className={iconClass}>
                    <KeyRound className="w-[18px] h-[18px]" />
                  </div>
                  <input
                    id="admin-pin-input"
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••••"
                    aria-describedby="admin-pin-help"
                    enterKeyHint="done"
                    className={`${inputClass} pr-3.5 tracking-[0.4em] font-mono`}
                  />
                </div>
                <p id="admin-pin-help" className="mt-1.5 text-[13px] leading-[18px] text-ink-muted">
                  Needed along with the password. You can change it in Admin Settings.
                </p>
              </div>

              {/* Save login on this phone */}
              <button
                id="admin-remember-toggle"
                type="button"
                role="switch"
                aria-checked={remember}
                onClick={toggleRemember}
                className={`w-full min-h-[52px] flex items-center justify-between gap-3 rounded-[16px] border px-3.5 py-2.5 text-left transition-colors cursor-pointer ${remember ? 'border-brand-line bg-brand-wash' : 'border-transparent bg-page'}`}
              >
                <span className="min-w-0">
                  <span className="block text-sm leading-5 font-semibold text-ink">Save login on this phone</span>
                  <span className="block text-[13px] leading-[18px] text-ink-muted mt-0.5">
                    {remember ? 'You will not be asked to sign in again on this phone and browser.' : 'You will be signed out after 12 hours.'}
                  </span>
                </span>
                <span aria-hidden="true" className={`relative w-12 h-7 shrink-0 rounded-full border transition-colors ${remember ? 'bg-brand border-transparent' : 'bg-sunken-deep border-line'}`}>
                  <span className={`absolute top-1 left-1 w-5 h-5 rounded-full transition-transform ${remember ? 'translate-x-5 bg-[color:var(--sag-on-gold)]' : 'bg-ink'}`} />
                </span>
              </button>

              <button
                id="admin-login-submit-btn"
                type="submit"
                disabled={loading}
                className="sag-btn-primary w-full gap-2 disabled:cursor-wait"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-[18px] h-[18px] animate-spin" />
                    <span>Signing in…</span>
                  </>
                ) : (
                  <>
                    <span>Sign in to the admin</span>
                    <ArrowRight className="w-[18px] h-[18px]" />
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="mt-4 text-center text-[13px] leading-[18px] text-ink-muted flex items-center justify-center gap-1.5">
            <Lock className="w-3.5 h-3.5" aria-hidden="true" /> This page is for store staff only
          </p>
        </div>
      </div>
    </div>
  );
};
