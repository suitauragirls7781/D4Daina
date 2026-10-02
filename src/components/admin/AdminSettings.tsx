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
  Save,
  Key,
  AlertTriangle,
  CheckCircle2,
  Database,
  IndianRupee,
  Info,
  Copy,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Link,
  Mail,
  Send,
  Loader2
} from 'lucide-react';
import { StoreSettings, PaymentGatewaySettings } from '../../types';
import { AdminPaymentGateways, Switch } from './AdminPaymentGateways';
import { AdminPageHeader } from './kidsToysShared';
import { deliveryEstimateText } from '../../utils/delivery';

/** Loose GSTIN shape (same as api/admin-config.js): state code, PAN, entity digit, Z, check character. */
const GSTIN_RE = /^\d{2}[A-Z0-9]{10}[A-Z0-9]Z[A-Z0-9]$/;

type SettingsTab = 'general' | 'checkout' | 'payment' | 'database' | 'security' | 'brevo';
type SaveNote = { tab: SettingsTab; ok: boolean; text: string } | null;

const TABS: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
  { id: 'general', label: 'Store details', icon: <Store className="w-4 h-4" /> },
  { id: 'checkout', label: 'Checkout', icon: <IndianRupee className="w-4 h-4" /> },
  { id: 'payment', label: 'Payment gateways', icon: <CreditCard className="w-4 h-4" /> },
  { id: 'database', label: 'Database', icon: <Database className="w-4 h-4" /> },
  { id: 'security', label: 'Login & security', icon: <ShieldCheck className="w-4 h-4" /> },
  { id: 'brevo', label: 'Email', icon: <Mail className="w-4 h-4" /> },
];

/** The store's collections, as listed on the Database tab. */
const COLLECTIONS: Array<{ name: string; state: string; fields: string }> = [
  { name: '1. products', state: 'Connected', fields: 'Fields: id, sku, name, category, price, originalPrice, images[], sizes[], colors[], stockQuantity, fabric, washCare, flags.' },
  { name: '2. orders', state: 'Connected', fields: 'Fields: orderNumber, customerEmail, subtotal, discount, finalTotal, status, paymentRef, trackingNumber, deliveryAddress.' },
  { name: '3. profiles', state: 'Connected', fields: 'Fields: email, fullName, phone, address details, pincode, cart[], wishlist[] (document id = email).' },
  { name: '4. customers', state: 'Schema Ready', fields: 'Fields: id, name, email, phone, totalOrders, totalSpent, lastOrderDate, addresses[].' },
  { name: '5. coupons', state: 'Schema Ready', fields: 'Fields: code, discountType, discountValue, minOrderValue, maxDiscount, startDate, expiryDate, usageLimit.' },
  { name: '6. reviews & banners', state: 'Connected', fields: 'Fields: productId, rating, comment, verifiedPurchase, status, adminReply, bannerImages, sectionOrder.' },
];

const panel = 'sag-card p-4 sm:p-6 lg:p-8';
const input = 'sag-input h-12';
const hintText = 'mt-1.5 block text-[13px] leading-[18px] font-normal text-ink-muted';

/** One form field: label above, control, optional line of help below. */
const Field: React.FC<{ label: React.ReactNode; hint?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ label, hint, className = '', children }) => (
  <label className={`block ${className}`}>
    <span className="sag-label">{label}</span>
    {children}
    {hint && <span className={hintText}>{hint}</span>}
  </label>
);

/** Heading for a group of fields inside a settings card. */
const GroupTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h4 className="text-base leading-[22px] font-semibold text-ink border-b border-line pb-2">{children}</h4>
);

/** Card heading with an icon tile and one line of help. */
const PanelTitle: React.FC<{ icon?: React.ReactNode; title: React.ReactNode; hint?: React.ReactNode }> = ({ icon, title, hint }) => (
  <div className="flex items-start gap-3 border-b border-line pb-4">
    {icon && <span className="w-11 h-11 shrink-0 rounded-xl bg-sunken text-ink flex items-center justify-center" aria-hidden="true">{icon}</span>}
    <div className="min-w-0">
      <h3 className="text-[17px] leading-6 font-semibold text-ink">{title}</h3>
      {hint && <p className="mt-1 text-sm leading-5 text-ink-muted">{hint}</p>}
    </div>
  </div>
);

/** A whole-row checkbox, 44px tall. */
const CheckRow: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; children: React.ReactNode }> = ({ checked, onChange, children }) => (
  <label className="flex items-center gap-3 min-h-11 text-sm font-medium text-ink cursor-pointer">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5.5 w-5.5 shrink-0 accent-brand" />
    <span>{children}</span>
  </label>
);

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
  const [activeTab, setActiveTab] = useState<SettingsTab>('security');

  useEffect(() => setStoreForm(storeSettings), [storeSettings]);
  useEffect(() => setPayForm(paymentSettings), [paymentSettings]);

  // Brevo API State
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  // Security Form State
  const [secForm, setSecForm] = useState(securityConfig);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Save feedback shown beside each Save button (display only; the toasts stay as they were)
  const [busy, setBusy] = useState<'' | SettingsTab | 'revoke'>('');
  const [note, setNote] = useState<SaveNote>(null);
  const savedNow = (tab: SettingsTab) => setNote({ tab, ok: true, text: `Saved at ${new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` });
  const failed = (tab: SettingsTab, text: string) => setNote({ tab, ok: false, text });
  const openTab = (tab: SettingsTab) => { setActiveTab(tab); setNote(null); };

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('general');
    try {
      await updateStoreSettings(storeForm);
      showToast('Store settings updated successfully.', 'success');
      savedNow('general');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save store settings.';
      showToast(message, 'error');
      failed('general', message);
    } finally {
      setBusy('');
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
    const reject = (message: string) => { showToast(message, 'error'); failed('checkout', message); };
    if (max > 0 && max < min) {
      reject('The maximum order value must be higher than the minimum (or 0 for no maximum).');
      return;
    }
    if (dMin > 0 && dMax > 0 && dMin > dMax) {
      reject('Delivery days: the "from" number cannot be more than the "to" number.');
      return;
    }
    if (gstin && !GSTIN_RE.test(gstin)) {
      reject('That GSTIN does not look right. It has 15 characters, e.g. 19ABCDE1234F1Z5.');
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
    setBusy('checkout');
    try {
      await updateStoreSettings(next);
      showToast('Checkout settings saved.', 'success');
      savedNow('checkout');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save checkout settings.';
      showToast(message, 'error');
      failed('checkout', message);
    } finally {
      setBusy('');
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
      failed('security', 'New password must be at least 8 characters.');
      return;
    }
    if (secForm.requirePin && secForm.securityPin && !/^\d{6}$/.test(secForm.securityPin)) {
      showToast('Security PIN must be exactly 6 digits.', 'error');
      failed('security', 'Security PIN must be exactly 6 digits.');
      return;
    }
    const cleanSlug = (adminEntrySlug(secForm.secretPathSlug))
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '');
    const finalSlug = cleanSlug || ADMIN_ENTRY;

    setBusy('security');
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
      savedNow('security');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update admin security settings.';
      showToast(message, 'error');
      failed('security', message);
    } finally {
      setBusy('');
    }
  };

  const handleRevokeAllSessions = async () => {
    if (window.confirm('Revoke all active sessions? Anyone who had the old password or an active session on another device (including friends) will be instantly disconnected.')) {
      setBusy('revoke');
      try {
        await invalidateAllAdminSessions();
        showToast('All sessions invalidated. Logging out...', 'info');
        window.location.href = `/${adminEntrySlug(secForm.secretPathSlug)}`;
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Unable to revoke sessions.', 'error');
      } finally {
        setBusy('');
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

  /** Save button row: the result of the last save on the left, the button on the right (full width on phones). */
  const saveRow = (tab: SettingsTab, label: string) => (
    <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-line">
      <div className="min-h-5" aria-live="polite">
        {note && note.tab === tab && (
          <p role={note.ok ? 'status' : 'alert'} className={`flex items-start gap-1.5 text-[13px] leading-[18px] font-medium ${note.ok ? 'text-ok' : 'text-danger'}`}>
            {note.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />}
            <span>{note.text}</span>
          </p>
        )}
      </div>
      <button type="submit" disabled={busy !== ''} className="sag-btn-primary h-12 px-6 text-sm gap-2 w-full sm:w-auto shrink-0">
        {busy === tab ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        <span>{busy === tab ? 'Saving…' : label}</span>
      </button>
    </div>
  );

  return (
    <div id="admin-settings-page" className="space-y-5">

      <AdminPageHeader
        eyebrow="Settings"
        title="Store settings"
        icon={<Settings />}
        description="Store details, checkout rules, payment gateways, admin login and email."
      />

      {/* Tabs: one scrolling row on phones */}
      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex gap-1 overflow-x-auto sag-scroll-x border-b border-line"
      >
        {TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`settings-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls="settings-tab-panel"
              onClick={() => openTab(tab.id)}
              className={`relative h-12 px-3 sm:px-4 inline-flex items-center gap-2 whitespace-nowrap shrink-0 text-sm cursor-pointer transition-colors ${
                selected ? 'text-brand font-semibold' : 'text-ink-muted font-medium hover:text-ink'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              <span className={`absolute inset-x-2 bottom-0 h-0.5 rounded-full ${selected ? 'bg-brand' : 'bg-transparent'}`} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <div id="settings-tab-panel" role="tabpanel" aria-labelledby={`settings-tab-${activeTab}`} className="space-y-5">

      {/* Tab 1: General Store Settings */}
      {activeTab === 'general' && (
        <div className={`${panel} space-y-6`}>
          <PanelTitle
            icon={<Store className="w-5 h-5" />}
            title="Brand identity & contact details"
            hint="Basic identity, customer care channels, and default shipment thresholds."
          />

          <form onSubmit={handleSaveGeneral} className="space-y-6">

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Store name *">
                <input
                  type="text"
                  required
                  value={storeForm.storeName}
                  onChange={(e) => setStoreForm({ ...storeForm, storeName: e.target.value })}
                  className={input}
                />
              </Field>

              <Field label="Brand tagline">
                <input
                  type="text"
                  value={storeForm.tagline}
                  onChange={(e) => setStoreForm({ ...storeForm, tagline: e.target.value })}
                  className={input}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Customer support email *">
                <input
                  type="email"
                  required
                  value={storeForm.storeEmail}
                  onChange={(e) => setStoreForm({ ...storeForm, storeEmail: e.target.value })}
                  className={input}
                />
              </Field>

              <Field label="Support phone number *">
                <input
                  type="text"
                  inputMode="tel"
                  required
                  value={storeForm.phone}
                  onChange={(e) => setStoreForm({ ...storeForm, phone: e.target.value })}
                  className={input}
                />
              </Field>

              <Field label="Official WhatsApp number">
                <input
                  type="text"
                  inputMode="tel"
                  value={storeForm.whatsapp}
                  onChange={(e) => setStoreForm({ ...storeForm, whatsapp: e.target.value })}
                  className={input}
                />
              </Field>
            </div>

            <Field label="Store / physical address">
              <input
                type="text"
                value={storeForm.address}
                onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })}
                className={input}
              />
            </Field>

            {/* Social Media Links */}
            <div className="space-y-4">
              <GroupTitle>Social media links</GroupTitle>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Instagram URL">
                  <input
                    type="url"
                    value={storeForm.instagramUrl}
                    onChange={(e) => setStoreForm({ ...storeForm, instagramUrl: e.target.value })}
                    className={input}
                  />
                </Field>
                <Field label="Facebook URL">
                  <input
                    type="url"
                    value={storeForm.facebookUrl}
                    onChange={(e) => setStoreForm({ ...storeForm, facebookUrl: e.target.value })}
                    className={input}
                  />
                </Field>
                <Field label="Twitter / X URL">
                  <input
                    type="url"
                    value={storeForm.twitterUrl}
                    onChange={(e) => setStoreForm({ ...storeForm, twitterUrl: e.target.value })}
                    className={input}
                  />
                </Field>
              </div>
            </div>

            <div className="space-y-3">
              <GroupTitle>Homepage announcement</GroupTitle>
              <div>
                <label className="sag-label" htmlFor="store-announcement-text">
                  Announcement bar message
                </label>
                <textarea
                  id="store-announcement-text"
                  maxLength={500}
                  rows={2}
                  value={storeForm.announcementText || ''}
                  onChange={(e) => setStoreForm({ ...storeForm, announcementText: e.target.value })}
                  className="sag-input resize-y"
                />
              </div>
              <CheckRow
                checked={storeForm.announcementActive ?? true}
                onChange={(checked) => setStoreForm({ ...storeForm, announcementActive: checked })}
              >
                Show this message in the announcement bar
              </CheckRow>
            </div>

            {/* Currency & Delivery Thresholds */}
            <div className="space-y-4">
              <GroupTitle>Currency & shipping rates</GroupTitle>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Store currency">
                  <input
                    type="text"
                    readOnly
                    value="INR (Indian Rupee - ₹)"
                    className={`${input} bg-sunken text-ink-muted`}
                  />
                </Field>

                <Field label="Standard shipping fee (₹)">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={storeForm.shippingCharge}
                    onChange={(e) => setStoreForm({ ...storeForm, shippingCharge: Number(e.target.value) })}
                    className={`${input} sag-num`}
                  />
                </Field>

                <Field label="Free shipping threshold (₹)">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={storeForm.freeShippingThreshold}
                    onChange={(e) => setStoreForm({ ...storeForm, freeShippingThreshold: Number(e.target.value) })}
                    className={`${input} sag-num`}
                  />
                </Field>

                <Field
                  label="Online payment discount, flat (₹ per order, 0 = off)"
                  hint="Taken off every online order at checkout. The server applies the same amount."
                >
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={storeForm.prepaidDiscount ?? 0}
                    onChange={(e) => setStoreForm({ ...storeForm, prepaidDiscount: Math.max(0, Number(e.target.value) || 0) })}
                    className={`${input} sag-num`}
                  />
                </Field>

                <Field
                  label="Online payment discount (%, 0 = off)"
                  hint="Whole number from 0 to 50. Taken off at checkout, after the combo offer and coupon. It is added to the flat amount, so set the flat amount to 0 if you want only the percent."
                >
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={50}
                    step={1}
                    value={storeForm.prepaidPercent ?? 0}
                    onChange={(e) => setStoreForm({ ...storeForm, prepaidPercent: Math.min(50, Math.max(0, Math.floor(Number(e.target.value) || 0))) })}
                    className={`${input} sag-num`}
                  />
                </Field>

                <Field
                  label="Only on products priced above (₹)"
                  hint="The percent applies only to products whose price is more than this. With 700, a ₹700 product gets no percent discount and a ₹701 product does. 0 = every product."
                >
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={storeForm.prepaidMinPrice ?? 0}
                    onChange={(e) => setStoreForm({ ...storeForm, prepaidMinPrice: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                    className={`${input} sag-num`}
                  />
                </Field>
              </div>
            </div>

            {saveRow('general', 'Save store settings')}

          </form>
        </div>
      )}

      {/* Checkout rules, delivery estimate and invoice details */}
      {activeTab === 'checkout' && (
        <form onSubmit={handleSaveCheckout} className={`${panel} space-y-7 text-left`}>
          <PanelTitle
            icon={<IndianRupee className="w-5 h-5" />}
            title="Checkout"
            hint="These rules are checked again by the server before every payment, so the store never takes an order outside them. Use 0 to switch a limit off."
          />

          <fieldset className="space-y-4">
            <legend className="text-base leading-[22px] font-semibold text-ink border-b border-line pb-2 w-full mb-4">Order value &amp; shipping</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Minimum order (₹, 0 = none)" hint="Counted after discounts, before shipping.">
                <input type="number" inputMode="numeric" min={0} step={1} value={storeForm.minOrderAmount ?? 0} onChange={(e) => setStoreForm({ ...storeForm, minOrderAmount: Number(e.target.value) })} className={`${input} sag-num`} />
              </Field>
              <Field label="Maximum order (₹, 0 = none)">
                <input type="number" inputMode="numeric" min={0} step={1} value={storeForm.maxOrderAmount ?? 0} onChange={(e) => setStoreForm({ ...storeForm, maxOrderAmount: Number(e.target.value) })} className={`${input} sag-num`} />
              </Field>
              <Field label="Shipping charge (₹)">
                <input type="number" inputMode="numeric" min={0} step={1} value={storeForm.shippingCharge} onChange={(e) => setStoreForm({ ...storeForm, shippingCharge: Number(e.target.value) })} className={`${input} sag-num`} />
              </Field>
              <Field label="Free shipping from (₹, 0 = never)" hint="Same fields as Store details; both places save the same values.">
                <input type="number" inputMode="numeric" min={0} step={1} value={storeForm.freeShippingThreshold} onChange={(e) => setStoreForm({ ...storeForm, freeShippingThreshold: Number(e.target.value) })} className={`${input} sag-num`} />
              </Field>
            </div>
            <CheckRow
              checked={storeForm.couponsEnabled !== false}
              onChange={(checked) => setStoreForm({ ...storeForm, couponsEnabled: checked })}
            >
              Coupons are on (untick to switch every coupon code off)
            </CheckRow>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-base leading-[22px] font-semibold text-ink border-b border-line pb-2 w-full mb-4">Cancellation &amp; delivery</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Cancellation window (hours, 0 = no limit)" hint="Customers can ask to cancel only before packing and within this many hours of paying.">
                <input type="number" inputMode="numeric" min={0} max={720} step={1} value={storeForm.cancellationWindowHours ?? 0} onChange={(e) => setStoreForm({ ...storeForm, cancellationWindowHours: Number(e.target.value) })} className={`${input} sag-num`} />
              </Field>
              <Field label="Processing days (to pack and ship)">
                <input type="number" inputMode="numeric" min={0} max={30} step={1} value={storeForm.processingDays ?? 0} onChange={(e) => setStoreForm({ ...storeForm, processingDays: Number(e.target.value) })} className={`${input} sag-num`} />
              </Field>
              <Field label="Courier delivery days: from (0 = not shown)">
                <input type="number" inputMode="numeric" min={0} max={60} step={1} value={storeForm.deliveryMinDays ?? 0} onChange={(e) => setStoreForm({ ...storeForm, deliveryMinDays: Number(e.target.value) })} className={`${input} sag-num`} />
              </Field>
              <Field label="Courier delivery days: to (0 = not shown)">
                <input type="number" inputMode="numeric" min={0} max={60} step={1} value={storeForm.deliveryMaxDays ?? 0} onChange={(e) => setStoreForm({ ...storeForm, deliveryMaxDays: Number(e.target.value) })} className={`${input} sag-num`} />
              </Field>
            </div>
            <p className="rounded-xl bg-sunken px-4 py-3 text-sm leading-5 text-ink-muted">
              {(() => {
                const text = deliveryEstimateText(storeForm);
                return text
                  ? <>Shoppers see: <strong className="text-ink">{text}</strong> (for an order placed now; Sundays are skipped). An expected date you enter on an order replaces it.</>
                  : 'No delivery date is shown to shoppers until you set delivery days.';
              })()}
            </p>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-base leading-[22px] font-semibold text-ink border-b border-line pb-2 w-full mb-4">Invoice</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Legal business name">
                <input type="text" maxLength={160} value={storeForm.legalName || ''} onChange={(e) => setStoreForm({ ...storeForm, legalName: e.target.value })} className={input} />
              </Field>
              <Field label="GSTIN (leave empty if not registered)">
                <input type="text" maxLength={20} value={storeForm.gstin || ''} onChange={(e) => setStoreForm({ ...storeForm, gstin: e.target.value.toUpperCase() })} placeholder="19ABCDE1234F1Z5" className={`${input} font-mono`} />
              </Field>
              <Field
                label="Invoice number prefix"
                hint={<>Invoice number = prefix + order number, e.g. <span className="break-all">{(storeForm.invoicePrefix || 'SAG-INV').toUpperCase()}-SAG-260930-ABCDE</span>.</>}
              >
                <input type="text" maxLength={20} value={storeForm.invoicePrefix ?? 'SAG-INV'} onChange={(e) => setStoreForm({ ...storeForm, invoicePrefix: e.target.value.toUpperCase() })} className={`${input} font-mono`} />
              </Field>
              <Field label="Registered address on invoices (empty = store address)" className="sm:col-span-2">
                <textarea rows={2} maxLength={500} value={storeForm.invoiceAddress || ''} onChange={(e) => setStoreForm({ ...storeForm, invoiceAddress: e.target.value })} className="sag-input resize-y" />
              </Field>
              <Field label="Note printed on invoices" className="sm:col-span-2">
                <textarea rows={2} maxLength={500} value={storeForm.invoiceNote || ''} onChange={(e) => setStoreForm({ ...storeForm, invoiceNote: e.target.value })} placeholder="e.g. Goods once sold can be exchanged within 7 days as per our return policy." className="sag-input resize-y" />
              </Field>
            </div>
          </fieldset>

          {saveRow('checkout', 'Save checkout settings')}
        </form>
      )}

      {/* Tab 2: Payment gateways (Razorpay, PayU) */}
      {activeTab === 'payment' && <AdminPaymentGateways />}

      {/* Tab 3: Database Architecture (Firebase Firestore + Cloudinary images) */}
      {activeTab === 'database' && (
        <div className={`${panel} space-y-5`}>
          <PanelTitle
            icon={<Database className="w-5 h-5" />}
            title="Firebase database & schema overview"
            hint="Store data lives in Firebase (Cloud Firestore for records, Cloudinary for images). The connection is configured at build time, so there are no credentials to manage here."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {COLLECTIONS.map((collection) => (
              <div key={collection.name} className="p-4 rounded-xl border border-line bg-page space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink font-mono break-all">{collection.name}</span>
                  <span className="sag-badge shrink-0 border border-ok-line bg-ok-tint text-ok">{collection.state}</span>
                </div>
                <p className="text-[13px] leading-[18px] text-ink-muted break-words">{collection.fields}</p>
              </div>
            ))}
          </div>

          <div className="p-4 bg-sunken rounded-xl text-sm leading-5 text-ink-muted flex items-start gap-2.5">
            <Info className="w-4 h-4 text-ink shrink-0 mt-0.5" />
            <span>
              <strong className="text-ink">Firebase live sync:</strong> Customer profiles, orders, categories, coupons, and reviews are stored in Cloud Firestore and sync in real time; product and banner images are stored in Cloudinary.
            </span>
          </div>

        </div>
      )}

      {/* Tab 4: Login & Route Security */}
      {activeTab === 'security' && (
        <div className="space-y-5">
          {/* Security Status Banner */}
          <div className="rounded-2xl border border-brand-line bg-brand-wash p-4 sm:p-6 space-y-3">
            <div className="flex items-start gap-3">
              <span className="w-11 h-11 shrink-0 rounded-xl bg-white border border-brand-line text-brand flex items-center justify-center" aria-hidden="true">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-[17px] leading-6 font-semibold text-ink">
                  Admin security & hidden login address
                </h3>
                <p className="mt-1 text-sm leading-5 text-ink-muted">
                  Protecting your store from unauthorized access, shared password leakage, and brute-force attempts.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="sag-badge border border-ok-line bg-ok-tint text-ok">
                Protection on
              </span>
              <span className="sag-badge bg-white border border-brand-line font-mono">
                Session v{securityConfig.sessionVersion}
              </span>
            </div>
            <p className="text-sm leading-5 text-ink-muted border-t border-brand-line pt-3">
              Direct <code className="font-mono text-ink">/admin</code> URL access is protected. If anyone tries to guess or open <code className="font-mono text-ink">/admin</code> without your active credentials, they receive a fake 404 &quot;Page Not Found&quot; screen. Only your secret URL slug or authorized staff PIN can access the login gate.
            </p>
          </div>

          <form onSubmit={handleSaveSecurity} className="space-y-5">

            {/* Section 1: Secret URL Route Slug */}
            <div className={`${panel} space-y-5`}>
              <PanelTitle
                icon={<Link className="w-5 h-5" />}
                title="Secret admin address"
                hint={<>Choose a custom hidden URL path instead of the easily guessable <code className="font-mono">/admin</code>.</>}
              />

              <div className="space-y-4">
                <div>
                  <label className="sag-label" htmlFor="settings-secret-slug">
                    Secret path slug
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex flex-1 min-w-0 h-12 rounded-xl border-[1.5px] border-control bg-white overflow-hidden focus-within:border-brand">
                      <span className="w-11 shrink-0 flex items-center justify-center bg-sunken border-r border-line text-ink-muted font-mono text-base" aria-hidden="true">
                        /
                      </span>
                      <input
                        id="settings-secret-slug"
                        type="text"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={secForm.secretPathSlug}
                        onChange={(e) => setSecForm({ ...secForm, secretPathSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '') })}
                        placeholder="e.g. drdaina"
                        className="flex-1 min-w-0 h-full px-3.5 bg-white text-base text-ink font-mono placeholder:text-ink-faint outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleCopySecretLink}
                      className="sag-btn-outline h-12 px-4 text-sm gap-2 shrink-0"
                    >
                      {copiedLink ? <Check className="w-4 h-4 text-ok" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedLink ? 'Copied!' : 'Copy secret link'}</span>
                    </button>
                  </div>
                  <p className={hintText}>
                    Your secret admin link: <code className="bg-sunken text-ink px-1.5 py-0.5 rounded-md font-mono font-semibold break-all">/{adminEntrySlug(secForm.secretPathSlug)}</code>. Bookmark this in your browser.
                  </p>
                </div>

                <div className="pt-4 border-t border-line flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-ink block">Hide <code className="font-mono">/admin</code> from public</span>
                    <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">
                      When enabled, anyone typing <code className="font-mono">/admin</code> in their browser sees a 404 Page Not Found error instead of a login form.
                    </p>
                  </div>
                  <Switch
                    checked={!secForm.allowDirectAdminRoute}
                    onChange={(hidden) => setSecForm({ ...secForm, allowDirectAdminRoute: !hidden })}
                    label="Hide /admin from public"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Master Credentials */}
            <div className={`${panel} space-y-5`}>
              <PanelTitle
                icon={<Key className="w-5 h-5" />}
                title="Master admin credentials"
                hint="Update your username and master password. The old password ('abhi') has been permanently disabled."
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="Admin username"
                  hint={<>Accepts either &quot;{secForm.adminUsername}&quot; or &quot;{secForm.adminUsername}@suitauragirls.com&quot;.</>}
                >
                  <input
                    type="text"
                    required
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={secForm.adminUsername}
                    onChange={(e) => setSecForm({ ...secForm, adminUsername: e.target.value })}
                    placeholder="e.g. muskan"
                    className={`${input} font-mono`}
                  />
                </Field>

                <div>
                  <label className="sag-label" htmlFor="settings-master-password">
                    Master password
                  </label>
                  <div className="relative">
                    <input
                      id="settings-master-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={secForm.adminPassword}
                      onChange={(e) => setSecForm({ ...secForm, adminPassword: e.target.value })}
                      placeholder="Enter strong password"
                      className={`${input} pr-12 font-mono`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      className="absolute inset-y-0 right-0 w-12 flex items-center justify-center rounded-xl text-ink-muted hover:text-ink cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <p className={`${hintText} flex items-start gap-1.5`}>
                    <ShieldCheck className="w-4 h-4 text-ok shrink-0 mt-px" />
                    <span>Password and PIN are stored only as salted hashes, never as plain text.</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Section 3: 2FA Security PIN */}
            <div className={`${panel} space-y-5`}>
              <PanelTitle
                icon={<KeyRound className="w-5 h-5" />}
                title="Two-step login (6-digit security PIN)"
                hint="Even if someone discovers your password, they cannot enter without this 6-digit PIN."
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                <Field
                  label="6-digit security PIN"
                  hint={<>Store this in a safe place. Default: <code className="font-mono">829146</code>.</>}
                >
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    required={secForm.requirePin}
                    value={secForm.securityPin}
                    onChange={(e) => setSecForm({ ...secForm, securityPin: e.target.value.replace(/\D/g, '') })}
                    placeholder="829146"
                    className={`${input} text-lg tracking-[0.4em] font-mono text-center`}
                  />
                </Field>

                <div className="p-4 bg-sunken rounded-xl md:mt-6">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-semibold text-ink">Ask for the PIN at login</span>
                    <Switch
                      checked={secForm.requirePin}
                      onChange={(requirePin) => setSecForm({ ...secForm, requirePin })}
                      label="Ask for the PIN at login"
                    />
                  </div>
                  <p className="mt-1 text-[13px] leading-[18px] text-ink-muted">
                    Requires typing the 6-digit PIN whenever signing into the admin panel.
                  </p>
                </div>
              </div>

              {saveRow('security', 'Save all security changes')}
            </div>
          </form>

          {/* Section 4: Emergency Session Revocation (Danger Zone) */}
          <div className="bg-danger-tint border border-danger-line p-4 sm:p-6 lg:p-8 rounded-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-white border border-danger-line text-danger flex items-center justify-center shrink-0" aria-hidden="true">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <h4 className="text-[17px] leading-6 font-semibold text-danger">
                  Revoke all active sessions (disconnect friends &amp; other devices)
                </h4>
                <p className="text-sm leading-5 text-ink">
                  If you shared your password with a friend earlier, or suspect anyone else has an open admin tab, clicking this button immediately invalidates every active session across all browsers and devices. They will be immediately booted out and unable to log back in without your new password and PIN.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-danger-line">
              <div className="text-[13px] text-ink-muted font-mono">
                Current session key version: v{securityConfig.sessionVersion}
              </div>
              <button
                type="button"
                onClick={handleRevokeAllSessions}
                disabled={busy !== ''}
                className="h-12 px-5 w-full sm:w-auto bg-danger hover:bg-ink text-white text-sm font-semibold rounded-xl transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {busy === 'revoke' ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                <span>Revoke all sessions now</span>
              </button>
            </div>
          </div>

        </div>
      )}

      {/* Tab 5: Transactional email (sent by the server) */}
      {activeTab === 'brevo' && (
        <div className={`${panel} space-y-5 text-left`}>
          <PanelTitle
            icon={<Mail className="w-5 h-5" />}
            title="Transactional email"
            hint={<>
              Login codes, order confirmations and shipped / delivered / cancelled / refund emails are sent by the server through Brevo.
              The API key lives only in the Cloudflare Worker secret <code className="font-mono break-all text-ink">BREVO_API_KEY</code> and is never sent to browsers.
            </>}
          />
          <div>
            <label className="sag-label" htmlFor="settings-test-email">Send a test email</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="settings-test-email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="you@example.com"
                className={`${input} flex-1 min-w-0`}
              />
              <button
                type="button"
                disabled={sendingTest}
                onClick={async () => {
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
                    showToast('Enter a valid email address.', 'error');
                    failed('brevo', 'Enter a valid email address.');
                    return;
                  }
                  setSendingTest(true);
                  try {
                    await ordersApi('admin-test-email', { email: testEmail });
                    showToast(`Test email sent to ${testEmail}. Check the inbox and spam folder.`, 'success');
                    setNote({ tab: 'brevo', ok: true, text: `Test email sent to ${testEmail}. Check the inbox and spam folder.` });
                  } catch (err: any) {
                    showToast(err?.message || 'Test email failed.', 'error');
                    failed('brevo', err?.message || 'Test email failed.');
                  } finally {
                    setSendingTest(false);
                  }
                }}
                className="sag-btn-primary h-12 px-5 text-sm gap-2 shrink-0"
              >
                {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>{sendingTest ? 'Sending…' : 'Send test'}</span>
              </button>
            </div>
            <div className="mt-2 min-h-5" aria-live="polite">
              {note && note.tab === 'brevo' && (
                <p role={note.ok ? 'status' : 'alert'} className={`flex items-start gap-1.5 text-[13px] leading-[18px] font-medium ${note.ok ? 'text-ok' : 'text-danger'}`}>
                  {note.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />}
                  <span className="break-words min-w-0">{note.text}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
};
