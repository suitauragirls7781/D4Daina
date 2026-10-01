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
        setErrorMessage(res.message || 'Invalid administrative credentials.');
      }
    } catch {
      setErrorMessage('Authentication service error.');
    } finally {
      setLoading(false);
    }
  };

  const handleReturnToStorefront = () => {
    setActivePage('home');
    navigate('/');
  };

  const inputClass = 'block w-full h-12 pl-11 border border-[#4B1D3F]/15 bg-[#FBF7F3] rounded-full text-[15px] text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:bg-white focus:border-[#4B1D3F]/50 focus:ring-4 focus:ring-[#4B1D3F]/10 transition';
  const labelClass = 'block text-[12px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/70 mb-2 pl-1';

  return (
    <div id="admin-login-page" className="min-h-screen bg-[#FBF7F3] flex flex-col relative">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 sm:px-8 py-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#4B1D3F] text-white flex items-center justify-center font-serif font-semibold ring-1 ring-[#C5A46D]/40">SA</div>
          <span className="hidden sm:block font-serif text-xl font-semibold text-[#4B1D3F]">Suit Aura Girls</span>
        </div>
        <button
          id="admin-login-back-to-store-btn"
          onClick={handleReturnToStorefront}
          className="inline-flex items-center gap-2 h-10 px-4 bg-white border border-[#4B1D3F]/20 rounded-full text-[13px] font-semibold text-[#4B1D3F] hover:bg-[#F3EEF8] hover:border-[#4B1D3F]/40 transition-colors cursor-pointer"
        >
          <Store className="w-4 h-4" />
          <span>View Storefront</span>
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center px-4 pb-12">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-8">
            <p className="text-[11px] uppercase tracking-[0.28em] font-semibold text-[#9C7A45]">Admin Studio</p>
            <h2 className="mt-3 font-serif text-4xl sm:text-5xl font-semibold tracking-tight text-[#4B1D3F] leading-[1.05]">
              Welcome back
            </h2>
            <p className="mt-3 text-sm text-[#2A1A26]/60">
              Store Operations & Catalog Control
            </p>
          </div>

          <div className="bg-white py-8 px-6 sm:px-9 rounded-3xl border border-[#4B1D3F]/10 shadow-[0_24px_60px_-30px_rgba(42,26,38,0.35)] space-y-6">

            <div className="flex items-start gap-3 pb-5 border-b border-[#4B1D3F]/10">
              <span className="w-10 h-10 shrink-0 rounded-full bg-[#F3EEF8] text-[#4B1D3F] flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-[#2A1A26]">Staff Authentication</h3>
                <p className="text-[13px] text-[#2A1A26]/60 mt-0.5 leading-relaxed">
                  Sign in to manage catalog items, categories, order fulfillment, customers, and store configurations.
                </p>
              </div>
            </div>

            {errorMessage && (
              <div role="alert" className="px-4 py-3 rounded-2xl bg-rose-50 border border-rose-200 text-[13px] text-rose-700 font-medium">
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="admin-email-input" className={labelClass}>
                  Admin Username or Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#4B1D3F]/45">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="admin-email-input"
                    type="text"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter admin username"
                    autoComplete="username"
                    className={`${inputClass} pr-4`}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="admin-password-input" className={labelClass}>
                  Admin Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#4B1D3F]/45">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="admin-password-input"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    className={`${inputClass} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-1 my-1 w-10 flex items-center justify-center rounded-full text-[#4B1D3F]/50 hover:text-[#4B1D3F] hover:bg-[#F3EEF8] cursor-pointer transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* 6-Digit Security PIN */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="admin-pin-input" className={`${labelClass} mb-0`}>
                    6-Digit Security PIN (2FA)
                  </label>
                  <span className="text-[11px] font-semibold text-[#8A2E55] bg-[#F7E4EA] px-2.5 py-0.5 rounded-full">
                    Required
                  </span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#4B1D3F]/45">
                    <KeyRound className="w-4 h-4" />
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
                    className={`${inputClass} pr-4 tracking-[0.4em] font-mono`}
                  />
                </div>
                <p className="text-[12px] text-[#2A1A26]/50 mt-2 pl-1 leading-relaxed">
                  2-Factor PIN configured in Admin Settings. Even with the password, this PIN is required.
                </p>
              </div>

              {/* Save login on this phone */}
              <button
                id="admin-remember-toggle"
                type="button"
                role="switch"
                aria-checked={remember}
                onClick={toggleRemember}
                className={`w-full flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors cursor-pointer ${remember ? 'border-[#4B1D3F]/30 bg-[#F3EEF8]' : 'border-[#4B1D3F]/15 bg-white'}`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[#2A1A26]">Save login on this phone</span>
                  <span className="block text-[12px] text-[#2A1A26]/60 leading-snug mt-0.5">
                    {remember ? 'You will not be asked to sign in again on this phone and browser.' : 'You will be signed out after 12 hours.'}
                  </span>
                </span>
                <span aria-hidden="true" className={`relative w-11 h-6 shrink-0 rounded-full transition-colors ${remember ? 'bg-[#4B1D3F]' : 'bg-[#E6DDF0]'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${remember ? 'translate-x-5' : ''}`} />
                </span>
              </button>

              <button
                id="admin-login-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full h-12 flex justify-center items-center gap-2 px-4 rounded-full text-sm font-semibold tracking-wide text-white bg-[#4B1D3F] hover:bg-[#3B1532] focus:outline-none focus:ring-4 focus:ring-[#4B1D3F]/20 transition-colors disabled:opacity-60 disabled:cursor-wait cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <span>Unlock Admin Vault</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

          </div>

          <p className="mt-6 text-center text-[12px] text-[#2A1A26]/45 flex items-center justify-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Protected area for store staff only
          </p>
        </div>
      </div>
    </div>
  );
};
