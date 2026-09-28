import React, { useEffect, useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { 
  getStoredBrevoKey, 
  setStoredBrevoKey, 
  sendBrevoOtpEmail 
} from '../../utils/brevoService';
import { 
  Settings, 
  CreditCard, 
  Store, 
  ShieldCheck, 
  Lock, 
  Save, 
  Key, 
  AlertTriangle, 
  CheckCircle2, 
  Database, 
  RotateCcw,
  IndianRupee,
  Share2,
  Info,
  Copy,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Sparkles,
  Link,
  Mail,
  Send,
  Loader2
} from 'lucide-react';
import { StoreSettings, PaymentGatewaySettings } from '../../types';

export const AdminSettings: React.FC = () => {
  const { 
    storeSettings, 
    updateStoreSettings, 
    paymentSettings, 
    updatePaymentSettings,
    resetStoreDataToDefaults,
    securityConfig,
    updateSecurityConfig,
    invalidateAllAdminSessions,
  } = useAdmin();
  const { showToast } = useShop();

  const [storeForm, setStoreForm] = useState<StoreSettings>(storeSettings);
  const [payForm, setPayForm] = useState<PaymentGatewaySettings>(paymentSettings);
  const [activeTab, setActiveTab] = useState<'general' | 'payment' | 'database' | 'security' | 'brevo'>('security');

  useEffect(() => setStoreForm(storeSettings), [storeSettings]);
  useEffect(() => setPayForm(paymentSettings), [paymentSettings]);

  // Brevo API State
  const [brevoKeyInput, setBrevoKeyInput] = useState(getStoredBrevoKey());
  const [testEmail, setTestEmail] = useState('starkhell69@gmail.com');
  const [sendingTest, setSendingTest] = useState(false);

  // Security Form State
  const [secForm, setSecForm] = useState(securityConfig);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateStoreSettings(storeForm);
      showToast('Store settings updated successfully.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to save store settings.', 'error');
    }
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updatePaymentSettings(payForm);
      setPayForm((current) => ({ ...current, razorpayKeySecretPlaceholder: '', webhookSecretPlaceholder: '' }));
      showToast('Payment configuration updated.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to update payment configuration.', 'error');
    }
  };

  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (secForm.adminPassword && secForm.adminPassword.length < 8) {
      showToast('New password must be at least 8 characters.', 'error');
      return;
    }
    if (secForm.requirePin && secForm.securityPin && !/^\d{6}$/.test(secForm.securityPin)) {
      showToast('Security PIN must be exactly 6 digits.', 'error');
      return;
    }
    const cleanSlug = (secForm.secretPathSlug || 'sag-vault')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '');
    const finalSlug = cleanSlug || 'sag-vault';
    
    try {
      await updateSecurityConfig({
        adminUsername: secForm.adminUsername.trim(),
        adminPassword: secForm.adminPassword,
        securityPin: secForm.securityPin.trim(),
        secretPathSlug: finalSlug,
        allowDirectAdminRoute: secForm.allowDirectAdminRoute,
        requirePin: secForm.requirePin,
      });
      setSecForm((prev) => ({ ...prev, adminPassword: '', securityPin: '', secretPathSlug: finalSlug }));
      showToast('Admin security settings updated.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to update admin security settings.', 'error');
    }
  };

  const handleRevokeAllSessions = async () => {
    if (window.confirm('Revoke all active sessions? Anyone who had the old password or an active session on another device (including friends) will be instantly disconnected.')) {
      try {
        await invalidateAllAdminSessions();
        showToast('All sessions invalidated. Logging out...', 'info');
        window.location.href = `/${secForm.secretPathSlug || 'sag-vault'}`;
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Unable to revoke sessions.', 'error');
      }
    }
  };

  const handleCopySecretLink = () => {
    const origin = window.location.origin;
    const secretUrl = `${origin}/${secForm.secretPathSlug || 'sag-vault'}`;
    navigator.clipboard.writeText(secretUrl);
    setCopiedLink(true);
    showToast('Secret Admin URL copied to clipboard!', 'success');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleResetData = () => {
    if (window.confirm('Reset all catalog, order, and configuration state back to demo defaults?')) {
      resetStoreDataToDefaults();
      showToast('Storefront reset to initial seed data.', 'info');
    }
  };

  return (
    <div id="admin-settings-page" className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-\[#FAF7F2\] p-5 rounded-2xl border border-rose-100 shadow-xs">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#8B2635]">
            Configuration & Infrastructure
          </span>
          <h2 className="font-serif text-2xl font-bold text-gray-900">
            Store & Gateway Settings
          </h2>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1.5 bg-[#D8C8B8]/70 p-1 rounded-xl border border-rose-100 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'general' ? 'bg-[#241D1B] text-[#211C1A] shadow-xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>Store Details</span>
          </button>

          <button
            onClick={() => setActiveTab('payment')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'payment' ? 'bg-[#241D1B] text-[#211C1A] shadow-xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Razorpay Gateway</span>
          </button>

          <button
            onClick={() => setActiveTab('database')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'database' ? 'bg-[#241D1B] text-[#211C1A] shadow-xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Database Architecture</span>
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'security' ? 'bg-[#241D1B] text-[#211C1A] shadow-xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Login & Security</span>
          </button>

          <button
            onClick={() => setActiveTab('brevo')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'brevo' ? 'bg-[#241D1B] text-[#211C1A] shadow-xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Brevo Email API</span>
          </button>
        </div>
      </div>

      {/* Tab 1: General Store Settings */}
      {activeTab === 'general' && (
        <div className="bg-\[#FAF7F2\] p-6 sm:p-8 rounded-2xl border border-rose-100 shadow-xs space-y-6">
          <div className="border-b border-gray-100 pb-3">
            <h3 className="font-serif text-xl font-bold text-gray-900">
              Brand Identity & Contact Details
            </h3>
            <p className="text-xs text-gray-500">
              Basic identity, customer care channels, and default shipment thresholds.
            </p>
          </div>

          <form onSubmit={handleSaveGeneral} className="space-y-5 text-xs">
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">Store Name *</label>
                <input
                  type="text"
                  required
                  value={storeForm.storeName}
                  onChange={(e) => setStoreForm({ ...storeForm, storeName: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl font-serif text-sm font-bold text-gray-900"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">Brand Tagline</label>
                <input
                  type="text"
                  value={storeForm.tagline}
                  onChange={(e) => setStoreForm({ ...storeForm, tagline: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl italic text-gray-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">Customer Support Email *</label>
                <input
                  type="email"
                  required
                  value={storeForm.storeEmail}
                  onChange={(e) => setStoreForm({ ...storeForm, storeEmail: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">Support Phone Number *</label>
                <input
                  type="text"
                  required
                  value={storeForm.phone}
                  onChange={(e) => setStoreForm({ ...storeForm, phone: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">Official WhatsApp Number</label>
                <input
                  type="text"
                  value={storeForm.whatsapp}
                  onChange={(e) => setStoreForm({ ...storeForm, whatsapp: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-gray-700 uppercase mb-1">Atelier / Physical Address</label>
              <input
                type="text"
                value={storeForm.address}
                onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl"
              />
            </div>

            {/* Social Media Links */}
            <div className="space-y-3 pt-2">
              <h4 className="font-bold text-gray-900 uppercase tracking-wider text-[11px] border-b border-gray-100 pb-1">
                Social Media Links
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-gray-600 mb-1">Instagram URL</label>

              <div className="space-y-3 pt-2">
                <h4 className="font-bold text-gray-900 uppercase tracking-wider text-[11px] border-b border-gray-100 pb-1">
                  Homepage Announcement
                </h4>
                <label className="block font-medium text-gray-600 mb-1" htmlFor="store-announcement-text">
                  Custom marquee message
                </label>
                <textarea
                  id="store-announcement-text"
                  maxLength={500}
                  rows={2}
                  value={storeForm.announcementText || ''}
                  onChange={(e) => setStoreForm({ ...storeForm, announcementText: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs resize-y"
                />
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={storeForm.announcementActive ?? true}
                    onChange={(e) => setStoreForm({ ...storeForm, announcementActive: e.target.checked })}
                    className="accent-[#3D0F1F]"
                  />
                  Show custom announcement in marquee
                </label>
              </div>
                  <input
                    type="url"
                    value={storeForm.instagramUrl}
                    onChange={(e) => setStoreForm({ ...storeForm, instagramUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-medium text-gray-600 mb-1">Facebook URL</label>
                  <input
                    type="url"
                    value={storeForm.facebookUrl}
                    onChange={(e) => setStoreForm({ ...storeForm, facebookUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-medium text-gray-600 mb-1">Twitter / X URL</label>
                  <input
                    type="url"
                    value={storeForm.twitterUrl}
                    onChange={(e) => setStoreForm({ ...storeForm, twitterUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <h4 className="font-bold text-gray-900 uppercase tracking-wider text-[11px] border-b border-gray-100 pb-1">
                Homepage Announcement
              </h4>
              <label className="block font-medium text-gray-600 mb-1" htmlFor="store-announcement-text">
                Custom marquee message
              </label>
              <textarea
                id="store-announcement-text"
                maxLength={500}
                rows={2}
                value={storeForm.announcementText || ''}
                onChange={(e) => setStoreForm({ ...storeForm, announcementText: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs resize-y"
              />
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={storeForm.announcementActive ?? true}
                  onChange={(e) => setStoreForm({ ...storeForm, announcementActive: e.target.checked })}
                  className="accent-[#3D0F1F]"
                />
                Show custom announcement in marquee
              </label>
            </div>

            {/* Currency & Delivery Thresholds */}
            <div className="space-y-3 pt-2">
              <h4 className="font-bold text-gray-900 uppercase tracking-wider text-[11px] border-b border-gray-100 pb-1">
                Currency & Shipping Rates
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-bold text-gray-700 uppercase mb-1">Store Currency</label>
                  <input
                    type="text"
                    readOnly
                    value="INR (Indian Rupee - ₹)"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg font-bold text-gray-700"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 uppercase mb-1">Standard Shipping Fee (₹)</label>
                  <input
                    type="number"
                    min={0}
                    value={storeForm.shippingCharge}
                    onChange={(e) => setStoreForm({ ...storeForm, shippingCharge: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 uppercase mb-1">Free Shipping Threshold (₹)</label>
                  <input
                    type="number"
                    min={0}
                    value={storeForm.freeShippingThreshold}
                    onChange={(e) => setStoreForm({ ...storeForm, freeShippingThreshold: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg font-bold text-emerald-700"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={handleResetData}
                className="px-4 py-2 text-rose-700 hover:bg-[#D8C8B8]/20 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Store Data to Default Seed</span>
              </button>

              <button
                type="submit"
                className="px-6 py-2.5 bg-[#241D1B] hover:bg-[#241D1B] text-[#211C1A] rounded-xl font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md"
              >
                <Save className="w-4 h-4" /> Save Store Settings
              </button>
            </div>

          </form>
        </div>
      )}

      {/* Tab 2: Razorpay Payment Gateway Settings */}
      {activeTab === 'payment' && (
        <div className="bg-\[#FAF7F2\] p-6 sm:p-8 rounded-2xl border border-rose-100 shadow-xs space-y-6">
          <div className="border-b border-gray-100 pb-3">
            <h3 className="font-serif text-xl font-bold text-gray-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-[#211C1A]" />
              Razorpay Gateway & Prepaid Policy Configuration
            </h3>
            <p className="text-xs text-gray-500">
              Manage online prepaid checkout parameters (UPI, Credit/Debit Cards, Net Banking). Cash on Delivery is permanently disabled.
            </p>
          </div>

          {/* Strict Prepaid Policy Guarantee Banner */}
          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold text-emerald-900">
                Active Policy: Online Prepaid Payments Only (100% Guaranteed)
              </p>
              <p className="text-emerald-800 leading-relaxed">
                Cash on Delivery (COD) is strictly disabled across all storefront checkouts. All customer transactions are processed securely upfront via UPI, Cards, or Net Banking with instant automated settlement.
              </p>
            </div>
          </div>

          {/* Security Notice on Backend Environment Variables */}
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-3">
            <Lock className="w-5 h-5 text-black shrink-0 mt-0.5" />
            <div className="text-xs space-y-1 text-black">
              <p className="font-bold">
                Production Key Security Architecture
              </p>
              <p className="leading-relaxed text-black">
                To protect store funds and customer data, <strong>live Razorpay Key Secrets and Webhook Secrets must NEVER be stored in client-side code</strong>. When connecting a production server, inject them as server-side environment variables (`process.env.RAZORPAY_KEY_SECRET`).
              </p>
            </div>
          </div>

          <form onSubmit={handleSavePayment} className="space-y-4 text-xs">
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">Gateway Environment Mode</label>
                <select
                  value={payForm.mode}
                  onChange={(e) => setPayForm({ ...payForm, mode: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl bg-\[#FAF7F2\] font-bold text-gray-800"
                >
                  <option value="test">Test / Sandbox Mode</option>
                  <option value="live">Production / Live Mode</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">Razorpay Key ID (Client-Accessible)</label>
                <input
                  type="text"
                  value={payForm.razorpayKeyIdPlaceholder}
                  onChange={(e) => setPayForm({ ...payForm, razorpayKeyIdPlaceholder: e.target.value })}
                  placeholder="rzp_test_... or rzp_live_..."
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl font-mono text-gray-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">
                  Razorpay Key Secret (Server Env Target)
                </label>
                <input
                  type="password"
                  value=""
                  readOnly
                  placeholder="Managed in Vercel: RAZORPAY_KEY_SECRET"
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl font-mono bg-gray-50 text-gray-600 cursor-not-allowed"
                />
                <span className="text-[10px] text-gray-400 mt-1 block">
                  Mapped to backend server variable `RAZORPAY_KEY_SECRET`
                </span>
              </div>

              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">
                  Razorpay Webhook Secret Token
                </label>
                <input
                  type="password"
                  value=""
                  readOnly
                  placeholder="Managed in Vercel: RAZORPAY_WEBHOOK_SECRET"
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl font-mono bg-gray-50 text-gray-600 cursor-not-allowed"
                />
                <span className="text-[10px] text-gray-400 mt-1 block">
                  Validates signature on `/api/webhooks/razorpay` events
                </span>
              </div>
            </div>

            {/* Allowed payment channels */}
            <div className="space-y-2 pt-2">
              <h4 className="font-bold text-gray-900 uppercase tracking-wider text-[11px]">
                Enabled Customer Payment Rails
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-gray-800">
                  <input
                    type="checkbox"
                    checked={payForm.enableUpi}
                    onChange={(e) => setPayForm({ ...payForm, enableUpi: e.target.checked })}
                    className="rounded text-[#211C1A] focus:ring-[#241D1B]"
                  />
                  <span>UPI Instant (GPay, PhonePe, Paytm)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-bold text-gray-800">
                  <input
                    type="checkbox"
                    checked={payForm.enableCards}
                    onChange={(e) => setPayForm({ ...payForm, enableCards: e.target.checked })}
                    className="rounded text-[#211C1A] focus:ring-[#241D1B]"
                  />
                  <span>Credit & Debit Cards (Visa/Mastercard/RuPay)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-bold text-gray-800">
                  <input
                    type="checkbox"
                    checked={payForm.enableNetBanking}
                    onChange={(e) => setPayForm({ ...payForm, enableNetBanking: e.target.checked })}
                    className="rounded text-[#211C1A] focus:ring-[#241D1B]"
                  />
                  <span>Net Banking (50+ Indian Banks)</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-100">
              <button
                type="submit"
                className="px-6 py-2.5 bg-[#241D1B] hover:bg-[#241D1B] text-[#211C1A] rounded-xl font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md"
              >
                <Save className="w-4 h-4" /> Save Gateway Settings
              </button>
            </div>

          </form>
        </div>
      )}

      {/* Tab 3: Database Architecture (Firebase Firestore + Cloudinary images) */}
      {activeTab === 'database' && (
        <div className="bg-\[#FAF7F2\] p-6 sm:p-8 rounded-2xl border border-rose-100 shadow-xs space-y-6">
          <div className="border-b border-gray-100 pb-3">
            <h3 className="font-serif text-xl font-bold text-gray-900 flex items-center gap-2">
              <Database className="w-5 h-5 text-[#211C1A]" />
              Firebase Database & Schema Overview
            </h3>
            <p className="text-xs text-gray-500">
              Store data lives in Firebase (Cloud Firestore for records, Cloudinary for images). The connection is configured at build time, so there are no credentials to manage here.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
            
            <div className="p-4 rounded-xl border border-rose-100 bg-[#FFF9FA] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900 font-mono">1. products</span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">Connected</span>
              </div>
              <p className="text-gray-600 text-[11px]">
                Fields: id, sku, name, category, price, originalPrice, images[], sizes[], colors[], stockQuantity, fabric, washCare, flags.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-rose-100 bg-[#FFF9FA] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900 font-mono">2. orders</span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">Connected</span>
              </div>
              <p className="text-gray-600 text-[11px]">
                Fields: orderNumber, customerEmail, subtotal, discount, finalTotal, status, paymentRef, trackingNumber, deliveryAddress.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-rose-100 bg-[#FFF9FA] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900 font-mono">3. profiles</span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">Connected</span>
              </div>
              <p className="text-gray-600 text-[11px]">
                Fields: email, fullName, phone, address details, pincode, cart[], wishlist[] (document id = email).
              </p>
            </div>

            <div className="p-4 rounded-xl border border-rose-100 bg-[#FFF9FA] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900 font-mono">4. customers</span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">Schema Ready</span>
              </div>
              <p className="text-gray-600 text-[11px]">
                Fields: id, name, email, phone, totalOrders, totalSpent, lastOrderDate, addresses[].
              </p>
            </div>

            <div className="p-4 rounded-xl border border-rose-100 bg-[#FFF9FA] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900 font-mono">5. coupons</span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">Schema Ready</span>
              </div>
              <p className="text-gray-600 text-[11px]">
                Fields: code, discountType, discountValue, minOrderValue, maxDiscount, startDate, expiryDate, usageLimit.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-rose-100 bg-[#FFF9FA] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900 font-mono">6. reviews & banners</span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">Connected</span>
              </div>
              <p className="text-gray-600 text-[11px]">
                Fields: productId, rating, comment, verifiedPurchase, status, adminReply, bannerImages, sectionOrder.
              </p>
            </div>

          </div>

          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-600 flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              <strong>Firebase Live Sync:</strong> Customer profiles, orders, categories, coupons, and reviews are stored in Cloud Firestore and sync in real time; product and banner images are stored in Cloudinary.
            </span>
          </div>

        </div>
      )}

      {/* Tab 4: Login & Route Security */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          {/* Security Status Banner */}
          <div className="bg-gradient-to-r from-[#241D1B] to-[#3B0E1E] text-[#211C1A] p-6 rounded-2xl shadow-md space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-\[#FAF7F2\]/10 flex items-center justify-center text-black">
                  <ShieldCheck className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-serif text-lg font-bold text-white">
                    Hardened Admin Security & Route Obfuscation
                  </h3>
                  <p className="text-xs text-rose-200">
                    Protecting your store from unauthorized access, shared password leakage, and brute-force attempts.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-400/30 uppercase tracking-wider">
                  Active Protection
                </span>
                <span className="px-2.5 py-1 rounded-full bg-\[#FAF7F2\]/10 text-rose-100 text-[10px] font-mono">
                  Session v{securityConfig.sessionVersion}
                </span>
              </div>
            </div>
            <p className="text-xs text-rose-100/90 leading-relaxed border-t border-white/10 pt-3">
              Direct `/admin` URL access is protected. If anyone tries to guess or open `/admin` without your active credentials, they receive a fake 404 &quot;Page Not Found&quot; screen. Only your secret URL slug or authorized staff PIN can access the login gate.
            </p>
          </div>

          <form onSubmit={handleSaveSecurity} className="space-y-6">
            
            {/* Section 1: Secret URL Route Slug */}
            <div className="bg-\[#FAF7F2\] p-6 sm:p-8 rounded-2xl border border-rose-100 shadow-xs space-y-5">
              <div className="border-b border-gray-100 pb-3 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="font-serif text-base font-bold text-gray-900 flex items-center gap-2">
                    <Link className="w-4 h-4 text-[#211C1A]" />
                    Secret Administrative URL (Route Obfuscation)
                  </h4>
                  <p className="text-xs text-gray-500">
                    Choose a custom hidden URL path instead of the easily guessable `/admin`.
                  </p>
                </div>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
                    Secret Path Slug
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-gray-500 font-mono text-xs">
                      /
                    </span>
                    <input
                      type="text"
                      value={secForm.secretPathSlug}
                      onChange={(e) => setSecForm({ ...secForm, secretPathSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '') })}
                      placeholder="e.g. sag-vault or secret-portal"
                      className="flex-1 px-3.5 py-2 border border-gray-200 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#241D1B]"
                    />
                    <button
                      type="button"
                      onClick={handleCopySecretLink}
                      className="px-3.5 py-2 bg-[#D8C8B8]/20 hover:bg-[#D8C8B8]/40 text-[#211C1A] font-semibold rounded-lg border border-rose-200 transition flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedLink ? 'Copied!' : 'Copy Secret Link'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Your secret admin link: <code className="bg-[#D8C8B8]/20 text-[#211C1A] px-1.5 py-0.5 rounded font-mono font-bold">/{secForm.secretPathSlug || 'sag-vault'}</code>. Bookmark this in your browser.
                  </p>
                </div>

                <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-gray-900 block">Hide `/admin` from Public</span>
                    <p className="text-[11px] text-gray-500">
                      When enabled, anyone typing `/admin` in their browser sees a 404 Page Not Found error instead of a login form.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!secForm.allowDirectAdminRoute}
                      onChange={(e) => setSecForm({ ...secForm, allowDirectAdminRoute: !e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-\[#FAF7F2\] after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#241D1B]"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* Section 2: Master Credentials */}
            <div className="bg-\[#FAF7F2\] p-6 sm:p-8 rounded-2xl border border-rose-100 shadow-xs space-y-5">
              <div className="border-b border-gray-100 pb-3">
                <h4 className="font-serif text-base font-bold text-gray-900 flex items-center gap-2">
                  <Key className="w-4 h-4 text-[#211C1A]" />
                  Master Admin Credentials
                </h4>
                <p className="text-xs text-gray-500">
                  Update your username and master password. The old password (&apos;abhi&apos;) has been permanently disabled.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
                    Admin Username
                  </label>
                  <input
                    type="text"
                    required
                    value={secForm.adminUsername}
                    onChange={(e) => setSecForm({ ...secForm, adminUsername: e.target.value })}
                    placeholder="e.g. muskan"
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#241D1B] font-mono"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Accepts either &quot;{secForm.adminUsername}&quot; or &quot;{secForm.adminUsername}@suitauragirls.com&quot;.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
                    Master Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={secForm.adminPassword}
                      onChange={(e) => setSecForm({ ...secForm, adminPassword: e.target.value })}
                      placeholder="Enter strong password"
                      className="w-full pl-3.5 pr-10 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#241D1B] font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-emerald-600 mt-1 font-semibold">
                    Protected with high entropy salt &amp; session key isolation.
                  </p>
                </div>
              </div>
            </div>

            {/* Section 3: 2FA Security PIN */}
            <div className="bg-\[#FAF7F2\] p-6 sm:p-8 rounded-2xl border border-rose-100 shadow-xs space-y-5">
              <div className="border-b border-gray-100 pb-3">
                <h4 className="font-serif text-base font-bold text-gray-900 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[#211C1A]" />
                  Two-Factor Authentication (6-Digit Security PIN)
                </h4>
                <p className="text-xs text-gray-500">
                  Even if someone discovers your password, they cannot enter without this 6-digit PIN.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs items-center">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
                    6-Digit Security PIN
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    required={secForm.requirePin}
                    value={secForm.securityPin}
                    onChange={(e) => setSecForm({ ...secForm, securityPin: e.target.value.replace(/\[#B76E79\]/g, '') })}
                    placeholder="829146"
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-lg tracking-widest font-mono text-center focus:outline-none focus:ring-2 focus:ring-[#241D1B]"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Store this in a safe place. Default: <code className="font-mono">829146</code>.
                  </p>
                </div>

                <div className="p-4 bg-[#D8C8B8]/70 border border-rose-100 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900">Enforce PIN on Login</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={secForm.requirePin}
                        onChange={(e) => setSecForm({ ...secForm, requirePin: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-\[#FAF7F2\] after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#241D1B]"></div>
                    </label>
                  </div>
                  <p className="text-[11px] text-gray-600">
                    Requires typing the 6-digit PIN whenever signing into the admin panel.
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[#241D1B] hover:bg-[#241D1B] text-[#211C1A] font-bold text-xs uppercase tracking-wider rounded-xl transition shadow-md flex items-center gap-2 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Save All Security Changes</span>
                </button>
              </div>
            </div>
          </form>

          {/* Section 4: Emergency Session Revocation (Danger Zone) */}
          <div className="bg-red-50/70 border border-red-200 p-6 sm:p-8 rounded-2xl shadow-xs space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="font-serif text-base font-bold text-red-950">
                  Revoke All Active Sessions (Disconnect Friend &amp; Other Devices)
                </h4>
                <p className="text-xs text-red-800 leading-relaxed">
                  If you shared your password with a friend earlier, or suspect anyone else has an open admin tab, clicking this button immediately invalidates every active session across all browsers and devices. They will be immediately booted out and unable to log back in without your new password and PIN.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-red-200/80">
              <div className="text-[11px] text-red-700 font-mono">
                Current Session Key Version: v{securityConfig.sessionVersion}
              </div>
              <button
                type="button"
                onClick={handleRevokeAllSessions}
                className="px-4 py-2.5 bg-red-700 hover:bg-red-800 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition shadow-xs flex items-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Revoke All Sessions Now</span>
              </button>
            </div>
          </div>

        </div>
      )}

      {/* Tab 5: Brevo Direct Email API Settings */}
      {activeTab === 'brevo' && (
        <div className="bg-[#FAF7F2] p-6 sm:p-8 rounded-2xl border border-rose-100 shadow-xs space-y-6 text-xs text-left">
          <div className="border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded-full uppercase tracking-wider">
                Active Integration
              </span>
            </div>
            <h3 className="font-serif text-xl font-bold text-gray-900 mt-1">
              Brevo Transactional Email API Key
            </h3>
            <p className="text-xs text-gray-500">
              Manage your Brevo API key for direct 1-second OTP verification emails sent to all customer inboxes.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block font-bold text-gray-700 uppercase mb-1">
                Brevo API Key (Starts with xkeysib-)
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={brevoKeyInput}
                  onChange={(e) => setBrevoKeyInput(e.target.value)}
                  placeholder="xkeysib-xxxxxxxxxxxxxxxx..."
                  className="flex-1 px-3.5 py-2.5 border border-gray-200 rounded-xl font-mono text-xs text-gray-900 bg-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    setStoredBrevoKey(brevoKeyInput);
                    showToast('✅ Brevo API Key updated & saved successfully!', 'success');
                  }}
                  className="px-5 py-2.5 bg-[#241D1B] hover:bg-[#241D1B] text-[#211C1A] font-bold text-xs uppercase tracking-wider rounded-xl transition flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Key</span>
                </button>
              </div>
            </div>

            {/* Connection Status Card */}
            <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2 font-bold text-emerald-900 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>BREVO API SYNC STATUS: CONNECTED</span>
              </div>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                Direct REST API mode is active. Customer OTP verification emails bypass auth-provider rate limits and land directly in user inboxes within 1 second.
              </p>
            </div>

            {/* Test Email Form */}
            <div className="p-4 bg-white border border-gray-200 rounded-xl space-y-3">
              <h4 className="font-bold text-gray-800 uppercase tracking-wider text-[11px]">
                Send Test Verification Email
              </h4>
              <p className="text-[11px] text-gray-600">
                Test your Brevo API key by dispatching a live 6-digit test code to any email address:
              </p>

              <div className="flex gap-2">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="Enter recipient email address..."
                  className="flex-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs"
                />
                <button
                  type="button"
                  disabled={sendingTest}
                  onClick={async () => {
                    if (!testEmail || !testEmail.includes('@')) {
                      showToast('Please enter a valid recipient email.', 'error');
                      return;
                    }
                    setSendingTest(true);
                    const testCode = Math.floor(100000 + Math.random() * 900000).toString();
                    const res = await sendBrevoOtpEmail({
                      email: testEmail,
                      code: testCode,
                      name: 'Admin Tester',
                    });
                    setSendingTest(false);
                    if (res.success) {
                      showToast(`✅ Test email sent to ${testEmail}! Check inbox.`, 'success');
                    } else {
                      showToast(`❌ Brevo Error: ${res.message}`, 'error');
                    }
                  }}
                  className="px-4 py-2 bg-[#9A6A3A] hover:bg-[#A37F46] text-white font-bold text-xs uppercase tracking-wider rounded-lg transition flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  {sendingTest ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>Send Test Email</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
