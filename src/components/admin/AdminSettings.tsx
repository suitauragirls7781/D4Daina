import React, { useEffect, useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { ADMIN_ENTRY, adminEntrySlug } from '../../utils/adminEntry';
import { useShop } from '../../context/ShopContext';
import { ordersApi } from '../../lib/api';
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
import { AdminPaymentGateways } from './AdminPaymentGateways';
import { deliveryEstimateText } from '../../utils/delivery';

/** Loose GSTIN shape (same as api/admin-config.js): state code, PAN, entity digit, Z, check character. */
const GSTIN_RE = /^\d{2}[A-Z0-9]{10}[A-Z0-9]Z[A-Z0-9]$/;

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
  const [activeTab, setActiveTab] = useState<'general' | 'checkout' | 'payment' | 'database' | 'security' | 'brevo'>('security');

  useEffect(() => setStoreForm(storeSettings), [storeSettings]);
  useEffect(() => setPayForm(paymentSettings), [paymentSettings]);

  // Brevo API State
  const [testEmail, setTestEmail] = useState('');
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

  // Checkout rules and invoice details live in the same storeSettings document; the server enforces the rules again.
  const handleSaveCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    const whole = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));
    const min = whole(storeForm.minOrderAmount);
    const max = whole(storeForm.maxOrderAmount);
    const dMin = whole(storeForm.deliveryMinDays);
    const dMax = whole(storeForm.deliveryMaxDays);
    const gstin = String(storeForm.gstin || '').trim().toUpperCase().replace(/\s+/g, '');
    if (max > 0 && max < min) {
      showToast('The maximum order value must be higher than the minimum (or 0 for no maximum).', 'error');
      return;
    }
    if (dMin > 0 && dMax > 0 && dMin > dMax) {
      showToast('Delivery days: the "from" number cannot be more than the "to" number.', 'error');
      return;
    }
    if (gstin && !GSTIN_RE.test(gstin)) {
      showToast('That GSTIN does not look right. It has 15 characters, e.g. 19ABCDE1234F1Z5.', 'error');
      return;
    }
    const next: StoreSettings = {
      ...storeForm,
      minOrderAmount: min,
      maxOrderAmount: max,
      shippingCharge: whole(storeForm.shippingCharge),
      freeShippingThreshold: whole(storeForm.freeShippingThreshold),
      couponsEnabled: storeForm.couponsEnabled !== false,
      cancellationWindowHours: Math.min(720, whole(storeForm.cancellationWindowHours)),
      processingDays: Math.min(30, whole(storeForm.processingDays)),
      deliveryMinDays: Math.min(60, dMin || dMax),
      deliveryMaxDays: Math.min(60, dMax || dMin),
      gstin,
      invoicePrefix: String(storeForm.invoicePrefix || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'SAG-INV',
    };
    try {
      await updateStoreSettings(next);
      showToast('Checkout settings saved.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to save checkout settings.', 'error');
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
    const cleanSlug = (adminEntrySlug(secForm.secretPathSlug))
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '');
    const finalSlug = cleanSlug || ADMIN_ENTRY;

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
        window.location.href = `/${adminEntrySlug(secForm.secretPathSlug)}`;
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Unable to revoke sessions.', 'error');
      }
    }
  };

  const handleCopySecretLink = () => {
    const origin = window.location.origin;
    const secretUrl = `${origin}/${adminEntrySlug(secForm.secretPathSlug)}`;
    navigator.clipboard.writeText(secretUrl);
    setCopiedLink(true);
    showToast('Secret Admin URL copied to clipboard!', 'success');
    setTimeout(() => setCopiedLink(false), 2500);
  };



  return (
    <div id="admin-settings-page" className="space-y-6">

      {/* Header */}
      <div className="flex flex-col gap-4">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9C7A45]">
            Configuration & Infrastructure
          </span>
          <h2 className="mt-1 font-serif text-3xl sm:text-4xl font-semibold text-[#4B1D3F] leading-tight">
            Store & Gateway Settings
          </h2>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-full border border-[#4B1D3F]/10 text-[13px] font-semibold overflow-x-auto sag-scroll-x max-w-full">
          <button
            onClick={() => setActiveTab('general')}
            className={`h-9 px-3.5 rounded-full transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'general' ? 'bg-[#4B1D3F] text-white shadow-sm' : 'text-[#2A1A26]/70 hover:text-[#4B1D3F] hover:bg-[#F3EEF8]'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>Store Details</span>
          </button>

          <button
            onClick={() => setActiveTab('checkout')}
            className={`h-9 px-3.5 rounded-full transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'checkout' ? 'bg-[#4B1D3F] text-white shadow-sm' : 'text-[#2A1A26]/70 hover:text-[#4B1D3F] hover:bg-[#F3EEF8]'
            }`}
          >
            <IndianRupee className="w-3.5 h-3.5" />
            <span>Checkout</span>
          </button>

          <button
            onClick={() => setActiveTab('payment')}
            className={`h-9 px-3.5 rounded-full transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'payment' ? 'bg-[#4B1D3F] text-white shadow-sm' : 'text-[#2A1A26]/70 hover:text-[#4B1D3F] hover:bg-[#F3EEF8]'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Payment gateways</span>
          </button>

          <button
            onClick={() => setActiveTab('database')}
            className={`h-9 px-3.5 rounded-full transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'database' ? 'bg-[#4B1D3F] text-white shadow-sm' : 'text-[#2A1A26]/70 hover:text-[#4B1D3F] hover:bg-[#F3EEF8]'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Database Architecture</span>
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`h-9 px-3.5 rounded-full transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'security' ? 'bg-[#4B1D3F] text-white shadow-sm' : 'text-[#2A1A26]/70 hover:text-[#4B1D3F] hover:bg-[#F3EEF8]'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Login & Security</span>
          </button>

          <button
            onClick={() => setActiveTab('brevo')}
            className={`h-9 px-3.5 rounded-full transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'brevo' ? 'bg-[#4B1D3F] text-white shadow-sm' : 'text-[#2A1A26]/70 hover:text-[#4B1D3F] hover:bg-[#F3EEF8]'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Email</span>
          </button>
        </div>
      </div>

      {/* Tab 1: General Store Settings */}
      {activeTab === 'general' && (
        <div className="bg-white p-5 sm:p-8 rounded-3xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] space-y-6">
          <div className="border-b border-[#4B1D3F]/[0.08] pb-3">
            <h3 className="font-serif text-2xl font-semibold text-[#4B1D3F]">
              Brand Identity & Contact Details
            </h3>
            <p className="text-xs text-[#2A1A26]/60">
              Basic identity, customer care channels, and default shipment thresholds.
            </p>
          </div>

          <form onSubmit={handleSaveGeneral} className="space-y-5 text-xs">

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Store Name *</label>
                <input
                  type="text"
                  required
                  value={storeForm.storeName}
                  onChange={(e) => setStoreForm({ ...storeForm, storeName: e.target.value })}
                  className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition font-serif font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Brand Tagline</label>
                <input
                  type="text"
                  value={storeForm.tagline}
                  onChange={(e) => setStoreForm({ ...storeForm, tagline: e.target.value })}
                  className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition italic"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Customer Support Email *</label>
                <input
                  type="email"
                  required
                  value={storeForm.storeEmail}
                  onChange={(e) => setStoreForm({ ...storeForm, storeEmail: e.target.value })}
                  className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Support Phone Number *</label>
                <input
                  type="text"
                  required
                  value={storeForm.phone}
                  onChange={(e) => setStoreForm({ ...storeForm, phone: e.target.value })}
                  className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Official WhatsApp Number</label>
                <input
                  type="text"
                  value={storeForm.whatsapp}
                  onChange={(e) => setStoreForm({ ...storeForm, whatsapp: e.target.value })}
                  className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Atelier / Physical Address</label>
              <input
                type="text"
                value={storeForm.address}
                onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })}
                className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition"
              />
            </div>

            {/* Social Media Links */}
            <div className="space-y-3 pt-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9C7A45] border-b border-[#4B1D3F]/[0.08] pb-2">
                Social Media Links
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[12px] font-semibold text-[#2A1A26]/70 mb-1.5 pl-1">Instagram URL</label>
                  <input
                    type="url"
                    value={storeForm.instagramUrl}
                    onChange={(e) => setStoreForm({ ...storeForm, instagramUrl: e.target.value })}
                    className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[#2A1A26]/70 mb-1.5 pl-1">Facebook URL</label>
                  <input
                    type="url"
                    value={storeForm.facebookUrl}
                    onChange={(e) => setStoreForm({ ...storeForm, facebookUrl: e.target.value })}
                    className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[#2A1A26]/70 mb-1.5 pl-1">Twitter / X URL</label>
                  <input
                    type="url"
                    value={storeForm.twitterUrl}
                    onChange={(e) => setStoreForm({ ...storeForm, twitterUrl: e.target.value })}
                    className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9C7A45] border-b border-[#4B1D3F]/[0.08] pb-2">
                Homepage Announcement
              </h4>
              <label className="block text-[12px] font-semibold text-[#2A1A26]/70 mb-1.5 pl-1" htmlFor="store-announcement-text">
                Custom marquee message
              </label>
              <textarea
                id="store-announcement-text"
                maxLength={500}
                rows={2}
                value={storeForm.announcementText || ''}
                onChange={(e) => setStoreForm({ ...storeForm, announcementText: e.target.value })}
                className="w-full px-4 py-3 border border-[#4B1D3F]/15 bg-white rounded-2xl text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition resize-y"
              />
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#2A1A26]/80 cursor-pointer">
                <input
                  type="checkbox"
                  checked={storeForm.announcementActive ?? true}
                  onChange={(e) => setStoreForm({ ...storeForm, announcementActive: e.target.checked })}
                  className="accent-[#4B1D3F]"
                />
                Show custom announcement in marquee
              </label>
            </div>

            {/* Currency & Delivery Thresholds */}
            <div className="space-y-3 pt-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9C7A45] border-b border-[#4B1D3F]/[0.08] pb-2">
                Currency & Shipping Rates
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Store Currency</label>
                  <input
                    type="text"
                    readOnly
                    value="INR (Indian Rupee - ₹)"
                    className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition bg-[#FBF7F3] font-semibold text-[#2A1A26]/70"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Standard Shipping Fee (₹)</label>
                  <input
                    type="number"
                    min={0}
                    value={storeForm.shippingCharge}
                    onChange={(e) => setStoreForm({ ...storeForm, shippingCharge: Number(e.target.value) })}
                    className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Free Shipping Threshold (₹)</label>
                  <input
                    type="number"
                    min={0}
                    value={storeForm.freeShippingThreshold}
                    onChange={(e) => setStoreForm({ ...storeForm, freeShippingThreshold: Number(e.target.value) })}
                    className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition font-semibold text-emerald-700"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Online payment discount, flat (₹ per order, 0 = off)</label>
                  <input
                    type="number"
                    min={0}
                    value={storeForm.prepaidDiscount ?? 0}
                    onChange={(e) => setStoreForm({ ...storeForm, prepaidDiscount: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition"
                  />
                  <p className="mt-1 text-[11px] text-[#2A1A26]/60">Taken off every online order at checkout. The server applies the same amount.</p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Online payment discount (%, 0 = off)</label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={1}
                    value={storeForm.prepaidPercent ?? 0}
                    onChange={(e) => setStoreForm({ ...storeForm, prepaidPercent: Math.min(50, Math.max(0, Math.floor(Number(e.target.value) || 0))) })}
                    className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition"
                  />
                  <p className="mt-1 text-[11px] text-[#2A1A26]/60">Whole number from 0 to 50. Taken off at checkout, after the combo offer and coupon. It is added to the flat amount, so set the flat amount to 0 if you want only the percent.</p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Only on products priced above (₹)</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={storeForm.prepaidMinPrice ?? 0}
                    onChange={(e) => setStoreForm({ ...storeForm, prepaidMinPrice: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                    className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition"
                  />
                  <p className="mt-1 text-[11px] text-[#2A1A26]/60">The percent applies only to products whose price is more than this. With 700, a ₹700 product gets no percent discount and a ₹701 product does. 0 = every product.</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-[#4B1D3F]/[0.08]">
              <span />

              <button
                type="submit"
                className="h-11 px-6 bg-[#4B1D3F] hover:bg-[#3B1532] text-white rounded-full text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Save className="w-4 h-4" /> Save Store Settings
              </button>
            </div>

          </form>
        </div>
      )}

      {/* Checkout rules, delivery estimate and invoice details */}
      {activeTab === 'checkout' && (
        <form onSubmit={handleSaveCheckout} className="bg-white p-5 sm:p-8 rounded-3xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] space-y-7 text-xs text-left">
          <div>
            <h3 className="font-serif text-2xl font-semibold text-[#4B1D3F]">Checkout</h3>
            <p className="text-[#2A1A26]/70 mt-1 leading-relaxed">
              These rules are checked again by the server before every payment, so the store never takes an order outside them.
              Use 0 to switch a limit off.
            </p>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9C7A45] border-b border-[#4B1D3F]/[0.08] pb-2 w-full mb-1">Order value &amp; shipping</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Minimum order (₹, 0 = none)</span>
                <input type="number" min={0} step={1} value={storeForm.minOrderAmount ?? 0} onChange={(e) => setStoreForm({ ...storeForm, minOrderAmount: Number(e.target.value) })} className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition" />
                <span className="mt-1 block text-[11px] text-[#2A1A26]/60">Counted after discounts, before shipping.</span>
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Maximum order (₹, 0 = none)</span>
                <input type="number" min={0} step={1} value={storeForm.maxOrderAmount ?? 0} onChange={(e) => setStoreForm({ ...storeForm, maxOrderAmount: Number(e.target.value) })} className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition" />
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Shipping charge (₹)</span>
                <input type="number" min={0} step={1} value={storeForm.shippingCharge} onChange={(e) => setStoreForm({ ...storeForm, shippingCharge: Number(e.target.value) })} className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition" />
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Free shipping from (₹, 0 = never)</span>
                <input type="number" min={0} step={1} value={storeForm.freeShippingThreshold} onChange={(e) => setStoreForm({ ...storeForm, freeShippingThreshold: Number(e.target.value) })} className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition" />
                <span className="mt-1 block text-[11px] text-[#2A1A26]/60">Same fields as Store Details; both places save the same values.</span>
              </label>
            </div>
            <label className="inline-flex items-center gap-2 font-semibold text-[#2A1A26]/80 cursor-pointer">
              <input type="checkbox" checked={storeForm.couponsEnabled !== false} onChange={(e) => setStoreForm({ ...storeForm, couponsEnabled: e.target.checked })} className="accent-[#4B1D3F] w-4 h-4" />
              Coupons are on (untick to switch every coupon code off)
            </label>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9C7A45] border-b border-[#4B1D3F]/[0.08] pb-2 w-full mb-1">Cancellation &amp; delivery</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Cancellation window (hours, 0 = no limit)</span>
                <input type="number" min={0} max={720} step={1} value={storeForm.cancellationWindowHours ?? 0} onChange={(e) => setStoreForm({ ...storeForm, cancellationWindowHours: Number(e.target.value) })} className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition" />
                <span className="mt-1 block text-[11px] text-[#2A1A26]/60">Customers can ask to cancel only before packing and within this many hours of paying.</span>
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Processing days (to pack and ship)</span>
                <input type="number" min={0} max={30} step={1} value={storeForm.processingDays ?? 0} onChange={(e) => setStoreForm({ ...storeForm, processingDays: Number(e.target.value) })} className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition" />
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Courier delivery days: from (0 = not shown)</span>
                <input type="number" min={0} max={60} step={1} value={storeForm.deliveryMinDays ?? 0} onChange={(e) => setStoreForm({ ...storeForm, deliveryMinDays: Number(e.target.value) })} className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition" />
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Courier delivery days: to (0 = not shown)</span>
                <input type="number" min={0} max={60} step={1} value={storeForm.deliveryMaxDays ?? 0} onChange={(e) => setStoreForm({ ...storeForm, deliveryMaxDays: Number(e.target.value) })} className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition" />
              </label>
            </div>
            <p className="text-[11px] text-[#2A1A26]/70 leading-relaxed">
              {(() => {
                const text = deliveryEstimateText(storeForm);
                return text
                  ? <>Shoppers see: <strong>{text}</strong> (for an order placed now; Sundays are skipped). An expected date you enter on an order replaces it.</>
                  : 'No delivery date is shown to shoppers until you set delivery days.';
              })()}
            </p>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9C7A45] border-b border-[#4B1D3F]/[0.08] pb-2 w-full mb-1">Invoice</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Legal business name</span>
                <input type="text" maxLength={160} value={storeForm.legalName || ''} onChange={(e) => setStoreForm({ ...storeForm, legalName: e.target.value })} className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition" />
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">GSTIN (leave empty if not registered)</span>
                <input type="text" maxLength={20} value={storeForm.gstin || ''} onChange={(e) => setStoreForm({ ...storeForm, gstin: e.target.value.toUpperCase() })} placeholder="19ABCDE1234F1Z5" className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition font-mono" />
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Invoice number prefix</span>
                <input type="text" maxLength={20} value={storeForm.invoicePrefix ?? 'SAG-INV'} onChange={(e) => setStoreForm({ ...storeForm, invoicePrefix: e.target.value.toUpperCase() })} className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition font-mono" />
                <span className="mt-1 block text-[11px] text-[#2A1A26]/60">Invoice number = prefix + order number, e.g. {(storeForm.invoicePrefix || 'SAG-INV').toUpperCase()}-SAG-260930-ABCDE.</span>
              </label>
              <label className="block sm:col-span-2">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Registered address on invoices (empty = store address)</span>
                <textarea rows={2} maxLength={500} value={storeForm.invoiceAddress || ''} onChange={(e) => setStoreForm({ ...storeForm, invoiceAddress: e.target.value })} className="w-full px-4 py-3 border border-[#4B1D3F]/15 bg-white rounded-2xl text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition resize-y" />
              </label>
              <label className="block sm:col-span-2">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Note printed on invoices</span>
                <textarea rows={2} maxLength={500} value={storeForm.invoiceNote || ''} onChange={(e) => setStoreForm({ ...storeForm, invoiceNote: e.target.value })} placeholder="e.g. Goods once sold can be exchanged within 7 days as per our return policy." className="w-full px-4 py-3 border border-[#4B1D3F]/15 bg-white rounded-2xl text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition resize-y" />
              </label>
            </div>
          </fieldset>

          <div className="flex justify-end pt-2 border-t border-[#4B1D3F]/10">
            <button type="submit" className="h-11 px-6 bg-[#4B1D3F] hover:bg-[#3B1532] text-white rounded-full text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer">
              <Save className="w-4 h-4" /> Save checkout settings
            </button>
          </div>
        </form>
      )}

      {/* Tab 2: Payment gateways (Razorpay, PayU) */}
      {activeTab === 'payment' && <AdminPaymentGateways />}

      {/* Tab 3: Database Architecture (Firebase Firestore + Cloudinary images) */}
      {activeTab === 'database' && (
        <div className="bg-white p-5 sm:p-8 rounded-3xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] space-y-6">
          <div className="border-b border-[#4B1D3F]/[0.08] pb-3">
            <h3 className="font-serif text-2xl font-semibold text-[#4B1D3F] flex items-center gap-2">
              <Database className="w-5 h-5 text-[#4B1D3F]" />
              Firebase Database & Schema Overview
            </h3>
            <p className="text-xs text-[#2A1A26]/60">
              Store data lives in Firebase (Cloud Firestore for records, Cloudinary for images). The connection is configured at build time, so there are no credentials to manage here.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">

            <div className="p-4 rounded-2xl border border-[#4B1D3F]/[0.08] bg-[#FBF7F3] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#2A1A26] font-mono">1. products</span>
                <span className="px-2.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full font-semibold text-[11px]">Connected</span>
              </div>
              <p className="text-[#2A1A26]/70 text-[11px]">
                Fields: id, sku, name, category, price, originalPrice, images[], sizes[], colors[], stockQuantity, fabric, washCare, flags.
              </p>
            </div>

            <div className="p-4 rounded-2xl border border-[#4B1D3F]/[0.08] bg-[#FBF7F3] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#2A1A26] font-mono">2. orders</span>
                <span className="px-2.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full font-semibold text-[11px]">Connected</span>
              </div>
              <p className="text-[#2A1A26]/70 text-[11px]">
                Fields: orderNumber, customerEmail, subtotal, discount, finalTotal, status, paymentRef, trackingNumber, deliveryAddress.
              </p>
            </div>

            <div className="p-4 rounded-2xl border border-[#4B1D3F]/[0.08] bg-[#FBF7F3] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#2A1A26] font-mono">3. profiles</span>
                <span className="px-2.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full font-semibold text-[11px]">Connected</span>
              </div>
              <p className="text-[#2A1A26]/70 text-[11px]">
                Fields: email, fullName, phone, address details, pincode, cart[], wishlist[] (document id = email).
              </p>
            </div>

            <div className="p-4 rounded-2xl border border-[#4B1D3F]/[0.08] bg-[#FBF7F3] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#2A1A26] font-mono">4. customers</span>
                <span className="px-2.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full font-semibold text-[11px]">Schema Ready</span>
              </div>
              <p className="text-[#2A1A26]/70 text-[11px]">
                Fields: id, name, email, phone, totalOrders, totalSpent, lastOrderDate, addresses[].
              </p>
            </div>

            <div className="p-4 rounded-2xl border border-[#4B1D3F]/[0.08] bg-[#FBF7F3] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#2A1A26] font-mono">5. coupons</span>
                <span className="px-2.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full font-semibold text-[11px]">Schema Ready</span>
              </div>
              <p className="text-[#2A1A26]/70 text-[11px]">
                Fields: code, discountType, discountValue, minOrderValue, maxDiscount, startDate, expiryDate, usageLimit.
              </p>
            </div>

            <div className="p-4 rounded-2xl border border-[#4B1D3F]/[0.08] bg-[#FBF7F3] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#2A1A26] font-mono">6. reviews & banners</span>
                <span className="px-2.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full font-semibold text-[11px]">Connected</span>
              </div>
              <p className="text-[#2A1A26]/70 text-[11px]">
                Fields: productId, rating, comment, verifiedPurchase, status, adminReply, bannerImages, sectionOrder.
              </p>
            </div>

          </div>

          <div className="p-4 bg-[#F3EEF8] rounded-2xl text-[13px] text-[#2A1A26]/70 flex items-start gap-2">
            <Info className="w-4 h-4 text-[#4B1D3F] shrink-0 mt-0.5" />
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
          <div className="bg-[#4B1D3F] text-white p-5 sm:p-7 rounded-3xl space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="w-10 h-10 shrink-0 rounded-full bg-white/10 flex items-center justify-center text-[#C5A46D]">
                  <ShieldCheck className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-serif text-2xl font-semibold text-white">
                    Hardened Admin Security & Route Obfuscation
                  </h3>
                  <p className="text-[13px] text-white/75">
                    Protecting your store from unauthorized access, shared password leakage, and brute-force attempts.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-semibold border border-emerald-200">
                  Active Protection
                </span>
                <span className="px-3 py-1 rounded-full bg-white/10 text-white/85 text-[11px] font-mono">
                  Session v{securityConfig.sessionVersion}
                </span>
              </div>
            </div>
            <p className="text-[13px] text-white/75 leading-relaxed border-t border-white/15 pt-3">
              Direct `/admin` URL access is protected. If anyone tries to guess or open `/admin` without your active credentials, they receive a fake 404 &quot;Page Not Found&quot; screen. Only your secret URL slug or authorized staff PIN can access the login gate.
            </p>
          </div>

          <form onSubmit={handleSaveSecurity} className="space-y-6">

            {/* Section 1: Secret URL Route Slug */}
            <div className="bg-white p-5 sm:p-8 rounded-3xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] space-y-5">
              <div className="border-b border-[#4B1D3F]/[0.08] pb-3 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="font-serif text-xl font-semibold text-[#4B1D3F] flex items-center gap-2">
                    <Link className="w-4 h-4 text-[#4B1D3F]" />
                    Secret Administrative URL (Route Obfuscation)
                  </h4>
                  <p className="text-xs text-[#2A1A26]/60">
                    Choose a custom hidden URL path instead of the easily guessable `/admin`.
                  </p>
                </div>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">
                    Secret Path Slug
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="h-11 w-11 shrink-0 flex items-center justify-center bg-[#F3EEF8] rounded-full text-[#4B1D3F]/60 font-mono text-sm">
                      /
                    </span>
                    <input
                      type="text"
                      value={secForm.secretPathSlug}
                      onChange={(e) => setSecForm({ ...secForm, secretPathSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '') })}
                      placeholder="e.g. drdaina"
                      className="flex-1 min-w-0 h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleCopySecretLink}
                      className="h-11 px-4 shrink-0 bg-[#F3EEF8] hover:bg-[#E6DDF0] text-[#4B1D3F] text-[13px] font-semibold rounded-full transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedLink ? 'Copied!' : 'Copy Secret Link'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-[#2A1A26]/60 mt-1">
                    Your secret admin link: <code className="bg-[#F3EEF8] text-[#4B1D3F] px-2 py-0.5 rounded-full font-mono font-semibold">/{adminEntrySlug(secForm.secretPathSlug)}</code>. Bookmark this in your browser.
                  </p>
                </div>

                <div className="pt-2 border-t border-[#4B1D3F]/[0.08] flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-[#2A1A26] block">Hide `/admin` from Public</span>
                    <p className="text-[11px] text-[#2A1A26]/60">
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
                    <div className="w-11 h-6 bg-[#2A1A26]/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#4B1D3F]/20 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4B1D3F]"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* Section 2: Master Credentials */}
            <div className="bg-white p-5 sm:p-8 rounded-3xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] space-y-5">
              <div className="border-b border-[#4B1D3F]/[0.08] pb-3">
                <h4 className="font-serif text-xl font-semibold text-[#4B1D3F] flex items-center gap-2">
                  <Key className="w-4 h-4 text-[#4B1D3F]" />
                  Master Admin Credentials
                </h4>
                <p className="text-xs text-[#2A1A26]/60">
                  Update your username and master password. The old password (&apos;abhi&apos;) has been permanently disabled.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">
                    Admin Username
                  </label>
                  <input
                    type="text"
                    required
                    value={secForm.adminUsername}
                    onChange={(e) => setSecForm({ ...secForm, adminUsername: e.target.value })}
                    placeholder="e.g. muskan"
                    className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition font-mono"
                  />
                  <p className="text-[11px] text-[#2A1A26]/45 mt-1">
                    Accepts either &quot;{secForm.adminUsername}&quot; or &quot;{secForm.adminUsername}@suitauragirls.com&quot;.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">
                    Master Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={secForm.adminPassword}
                      onChange={(e) => setSecForm({ ...secForm, adminPassword: e.target.value })}
                      placeholder="Enter strong password"
                      className="w-full h-11 pl-4 pr-12 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#2A1A26]/45 hover:text-[#2A1A26]/70"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-emerald-600 mt-1 font-semibold">
                    Password and PIN are stored only as salted hashes, never as plain text.
                  </p>
                </div>
              </div>
            </div>

            {/* Section 3: 2FA Security PIN */}
            <div className="bg-white p-5 sm:p-8 rounded-3xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] space-y-5">
              <div className="border-b border-[#4B1D3F]/[0.08] pb-3">
                <h4 className="font-serif text-xl font-semibold text-[#4B1D3F] flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[#4B1D3F]" />
                  Two-Factor Authentication (6-Digit Security PIN)
                </h4>
                <p className="text-xs text-[#2A1A26]/60">
                  Even if someone discovers your password, they cannot enter without this 6-digit PIN.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs items-center">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">
                    6-Digit Security PIN
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    required={secForm.requirePin}
                    value={secForm.securityPin}
                    onChange={(e) => setSecForm({ ...secForm, securityPin: e.target.value.replace(/\D/g, '') })}
                    placeholder="829146"
                    className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-lg text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition tracking-[0.4em] font-mono text-center"
                  />
                  <p className="text-[11px] text-[#2A1A26]/45 mt-1">
                    Store this in a safe place. Default: <code className="font-mono">829146</code>.
                  </p>
                </div>

                <div className="p-4 bg-[#F3EEF8] rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#2A1A26]">Enforce PIN on Login</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={secForm.requirePin}
                        onChange={(e) => setSecForm({ ...secForm, requirePin: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-[#2A1A26]/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#4B1D3F]/20 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4B1D3F]"></div>
                    </label>
                  </div>
                  <p className="text-[11px] text-[#2A1A26]/70">
                    Requires typing the 6-digit PIN whenever signing into the admin panel.
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-[#4B1D3F]/[0.08] flex justify-end">
                <button
                  type="submit"
                  className="h-11 px-6 bg-[#4B1D3F] hover:bg-[#3B1532] text-white rounded-full text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Save All Security Changes</span>
                </button>
              </div>
            </div>
          </form>

          {/* Section 4: Emergency Session Revocation (Danger Zone) */}
          <div className="bg-rose-50 border border-rose-200 p-5 sm:p-8 rounded-3xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-white border border-rose-200 text-rose-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="font-serif text-xl font-semibold text-rose-700">
                  Revoke All Active Sessions (Disconnect Friend &amp; Other Devices)
                </h4>
                <p className="text-xs text-rose-700 leading-relaxed">
                  If you shared your password with a friend earlier, or suspect anyone else has an open admin tab, clicking this button immediately invalidates every active session across all browsers and devices. They will be immediately booted out and unable to log back in without your new password and PIN.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-rose-200">
              <div className="text-[11px] text-rose-700 font-mono">
                Current Session Key Version: v{securityConfig.sessionVersion}
              </div>
              <button
                type="button"
                onClick={handleRevokeAllSessions}
                className="h-11 px-5 bg-rose-700 hover:bg-rose-800 text-white text-sm font-semibold rounded-full transition-colors flex items-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Revoke All Sessions Now</span>
              </button>
            </div>
          </div>

        </div>
      )}

      {/* Tab 5: Transactional email (sent by the server) */}
      {activeTab === 'brevo' && (
        <div className="bg-white p-5 sm:p-8 rounded-3xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] space-y-5 text-xs text-left">
          <div>
            <h3 className="font-serif text-2xl font-semibold text-[#4B1D3F]">Transactional email</h3>
            <p className="text-[#2A1A26]/70 mt-1 leading-relaxed">
              Login codes, order confirmations and shipped / delivered / cancelled / refund emails are sent by the server through Brevo.
              The API key lives only in the Cloudflare Worker secret <code className="font-mono">BREVO_API_KEY</code> and is never sent to browsers.
            </p>
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1">Send a test email</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 min-w-0 h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition"
              />
              <button
                type="button"
                disabled={sendingTest}
                onClick={async () => {
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
                    showToast('Enter a valid email address.', 'error');
                    return;
                  }
                  setSendingTest(true);
                  try {
                    await ordersApi('admin-test-email', { email: testEmail });
                    showToast(`Test email sent to ${testEmail}. Check the inbox and spam folder.`, 'success');
                  } catch (err: any) {
                    showToast(err?.message || 'Test email failed.', 'error');
                  } finally {
                    setSendingTest(false);
                  }
                }}
                className="h-11 px-5 bg-[#4B1D3F] hover:bg-[#3B1532] text-white text-sm font-semibold rounded-full flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 transition-colors"
              >
                {sendingTest ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Send test</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
