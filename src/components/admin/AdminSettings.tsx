import React, { useEffect, useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { ADMIN_ENTRY, adminEntrySlug } from '../../utils/adminEntry';
import { useShop } from '../../context/ShopContext';
import { ordersApi } from '../../lib/api';
import {
  Settings,
  ShieldCheck,
  Save,
  AlertTriangle,
  CheckCircle2,
  Info,
  Copy,
  Check,
  Eye,
  EyeOff,
  LogOut,
  Send,
  Loader2
} from 'lucide-react';
import { StoreSettings, PaymentGatewaySettings } from '../../types';
import { AdminPaymentGateways, CheckRow, Panel, Pill, SaveBar, SwitchRow, Tile, Tiles, kit } from './AdminPaymentGateways';
import { AdminPageHeader } from './kidsToysShared';
import { deliveryEstimateText } from '../../utils/delivery';

/** Loose GSTIN shape (same as api/admin-config.js): state code, PAN, entity digit, Z, check character. */
const GSTIN_RE = /^\d{2}[A-Z0-9]{10}[A-Z0-9]Z[A-Z0-9]$/;

type SettingsTab = 'general' | 'checkout' | 'payment' | 'database' | 'security' | 'brevo';
type SaveNote = { tab: SettingsTab; ok: boolean; text: string } | null;

/**
 * The page is one long list of titled panels; this is the small index at the top. `tab` keeps the ids of the
 * six former tabs (settings-tab-general …) on the entries they became.
 */
const SECTIONS: Array<{ id: string; label: string; tab?: SettingsTab }> = [
  { id: 'settings-store', label: 'Store details', tab: 'general' },
  { id: 'settings-announcement', label: 'Announcement line' },
  { id: 'settings-delivery', label: 'Delivery & shipping' },
  { id: 'settings-prepaid', label: 'Online payment discount' },
  { id: 'settings-cod', label: 'Cash on delivery' },
  { id: 'settings-emails', label: 'Automatic emails', tab: 'brevo' },
  { id: 'settings-checkout', label: 'Checkout rules', tab: 'checkout' },
  { id: 'settings-invoice', label: 'Invoice' },
  { id: 'settings-payment', label: 'Payment gateways', tab: 'payment' },
  { id: 'settings-security', label: 'Login & security', tab: 'security' },
  { id: 'settings-data', label: 'Where data is kept', tab: 'database' },
];

/** The store's collections, as listed in "Where data is kept". */
const COLLECTIONS: Array<{ name: string; state: string; fields: string }> = [
  { name: '1. products', state: 'Connected', fields: 'Fields: id, sku, name, category, price, originalPrice, images[], sizes[], colors[], stockQuantity, fabric, washCare, flags.' },
  { name: '2. orders', state: 'Connected', fields: 'Fields: orderNumber, customerEmail, subtotal, discount, finalTotal, status, paymentRef, trackingNumber, deliveryAddress.' },
  { name: '3. profiles', state: 'Connected', fields: 'Fields: email, fullName, phone, address details, pincode, cart[], wishlist[] (document id = email).' },
  { name: '4. customers', state: 'Schema Ready', fields: 'Fields: id, name, email, phone, totalOrders, totalSpent, lastOrderDate, addresses[].' },
  { name: '5. coupons', state: 'Schema Ready', fields: 'Fields: code, discountType, discountValue, minOrderValue, maxDiscount, startDate, expiryDate, usageLimit.' },
  { name: '6. reviews & banners', state: 'Connected', fields: 'Fields: productId, rating, comment, verifiedPurchase, status, adminReply, bannerImages, sectionOrder.' },
];

const input = 'sag-input h-12';
const area = 'sag-input h-auto py-3 resize-y';
const hintText = 'mt-1.5 block text-[13px] leading-[18px] font-normal text-ink-muted';
const rupees = (value: unknown) => `₹${(Number(value) || 0).toLocaleString('en-IN')}`;

/** One form field: small label above, the control, and one plain line saying what it does. */
const Field: React.FC<{ label: React.ReactNode; hint?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ label, hint, className = '', children }) => (
  <label className={`block ${className}`}>
    <span className="sag-label">{label}</span>
    {children}
    {hint && <span className={hintText}>{hint}</span>}
  </label>
);

/** Heading for a smaller group of fields inside a panel. */
const GroupTitle: React.FC<{ children: React.ReactNode; hint?: React.ReactNode }> = ({ children, hint }) => (
  <div className="pt-5 mt-1 border-t border-line">
    <h4 className="text-[15px] leading-[22px] font-semibold text-ink">{children}</h4>
    {hint && <p className={`mt-0.5 ${kit.hint}`}>{hint}</p>}
  </div>
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
  const [activeTab, setActiveTab] = useState<string>('');

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
  /** The index at the top: scrolls to that panel. */
  const openSection = (id: string) => {
    setActiveTab(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Store details, delivery, discounts, cash on delivery, emails, checkout rules and invoice details all live in the
  // same storeSettings document and are saved together by the one save bar. The server enforces the rules again.
  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    const whole = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));
    const min = whole(storeForm.minOrderAmount);
    const max = whole(storeForm.maxOrderAmount);
    const dMin = whole(storeForm.deliveryMinDays);
    const dMax = whole(storeForm.deliveryMaxDays);
    const gstin = String(storeForm.gstin || '').trim().toUpperCase().replace(/\s+/g, '');
    const reject = (message: string, sectionId: string) => {
      showToast(message, 'error');
      failed('general', message);
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    if (max > 0 && max < min) {
      reject('The maximum order value must be higher than the minimum (or 0 for no maximum).', 'settings-checkout');
      return;
    }
    if (dMin > 0 && dMax > 0 && dMin > dMax) {
      reject('Delivery days: the "from" number cannot be more than the "to" number.', 'settings-delivery');
      return;
    }
    if (gstin && !GSTIN_RE.test(gstin)) {
      reject('That GSTIN does not look right. It has 15 characters, e.g. 19ABCDE1234F1Z5.', 'settings-invoice');
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
    setBusy('general');
    try {
      await updateStoreSettings(next);
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

  const sendTestEmail = async () => {
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
  };

  /** The result of the last save or test, in words with an icon. */
  const noteLine = (tab: SettingsTab) => (note && note.tab === tab ? (
    <p role={note.ok ? 'status' : 'alert'} className={`flex items-start gap-1.5 text-[13px] leading-[18px] font-medium ${note.ok ? 'text-brand' : 'text-danger'}`}>
      {note.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />}
      <span className="break-words min-w-0">{note.text}</span>
    </p>
  ) : null);

  // What the store has saved right now (the fields below may hold changes not saved yet)
  const saved = storeSettings;
  const storeUnsaved = JSON.stringify(storeForm) !== JSON.stringify(storeSettings);
  const savedPercent = Number(saved.prepaidPercent) || 0;
  const savedFlat = Number(saved.prepaidDiscount) || 0;
  const prepaidText = savedPercent && savedFlat ? `${savedPercent}% + ${rupees(savedFlat)}` : savedPercent ? `${savedPercent}%` : savedFlat ? rupees(savedFlat) : 'Off';
  const formPercent = Number(storeForm.prepaidPercent) || 0;
  const formFlat = Number(storeForm.prepaidDiscount) || 0;
  const deliveryText = deliveryEstimateText(storeForm);

  return (
    <div id="admin-settings-page" className="space-y-5">

      <AdminPageHeader
        eyebrow="Settings"
        title="Store settings"
        icon={<Settings />}
        description="Everything about how the shop runs: your details, delivery, discounts, cash on delivery, emails, checkout rules, invoices, payments and the admin login."
      />

      {/* What shoppers get today, from the saved settings */}
      <Tiles>
        <Tile label="Shipping charge" value={rupees(saved.shippingCharge)} note={Number(saved.freeShippingThreshold) > 0 ? `Free from ${rupees(saved.freeShippingThreshold)}` : 'No free shipping set'} />
        <Tile label="Paying online saves" value={prepaidText} note={savedPercent && Number(saved.prepaidMinPrice) > 0 ? `Percent only on products above ${rupees(saved.prepaidMinPrice)}` : 'Taken off at checkout'} />
        <Tile label="Cash on delivery" value={saved.codEnabled === true ? 'On' : 'Off'} note={saved.codEnabled === true ? `${rupees(saved.codCharge ?? 99)} paid online to confirm` : 'Shoppers pay online only'} />
        <Tile label="Coupons" value={saved.couponsEnabled !== false ? 'On' : 'Off'} note={saved.couponsEnabled !== false ? 'Codes work in the bag' : 'Every code is refused'} />
      </Tiles>

      {/* In-page index */}
      <nav aria-label="Settings sections" className={`${kit.panel} !py-4`}>
        <p className="text-xs leading-4 font-semibold uppercase tracking-[0.08em] text-ink-muted">On this page</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              id={section.tab ? `settings-tab-${section.tab}` : `settings-jump-${section.id}`}
              aria-pressed={activeTab === section.id}
              onClick={() => openSection(section.id)}
              className="sag-chip h-10 px-3.5 text-[13px] whitespace-nowrap"
            >
              {section.label}
            </button>
          ))}
        </div>
      </nav>

      <div id="settings-tab-panel" className="space-y-5">

      {/* ---------------- Everything saved by the one save bar ---------------- */}
      <form onSubmit={handleSaveStore} className="space-y-5 text-left">

        <Panel id="settings-store" title="Store details" hint="Your shop's name and how customers reach you.">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Store name *" hint="Your shop's name.">
                <input
                  type="text"
                  required
                  value={storeForm.storeName}
                  onChange={(e) => setStoreForm({ ...storeForm, storeName: e.target.value })}
                  className={input}
                />
              </Field>

              <Field label="Brand tagline" hint="A short line that goes with the name.">
                <input
                  type="text"
                  value={storeForm.tagline}
                  onChange={(e) => setStoreForm({ ...storeForm, tagline: e.target.value })}
                  className={input}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Customer support email *" hint="Where customers write to you.">
                <input
                  type="email"
                  required
                  value={storeForm.storeEmail}
                  onChange={(e) => setStoreForm({ ...storeForm, storeEmail: e.target.value })}
                  className={input}
                />
              </Field>

              <Field label="Support phone number *" hint="The number customers call for help.">
                <input
                  type="text"
                  inputMode="tel"
                  required
                  value={storeForm.phone}
                  onChange={(e) => setStoreForm({ ...storeForm, phone: e.target.value })}
                  className={input}
                />
              </Field>

              <Field label="Official WhatsApp number" hint="The number customers message on WhatsApp.">
                <input
                  type="text"
                  inputMode="tel"
                  value={storeForm.whatsapp}
                  onChange={(e) => setStoreForm({ ...storeForm, whatsapp: e.target.value })}
                  className={input}
                />
              </Field>
            </div>

            <Field label="Store / physical address" hint="Your shop or office address.">
              <input
                type="text"
                value={storeForm.address}
                onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })}
                className={input}
              />
            </Field>

            {/* Social Media Links */}
            <GroupTitle hint="Paste the full link to each of your pages.">Social media links</GroupTitle>
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
        </Panel>

        <Panel
          id="settings-announcement"
          title="Announcement line"
          hint="The short message in the line at the top of the store."
          action={<Pill tone={(saved.announcementActive ?? true) ? 'live' : 'off'}>{(saved.announcementActive ?? true) ? 'Live on the site' : 'Off'}</Pill>}
        >
          <div className="space-y-4">
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
                className={area}
              />
              <span className={hintText}>Up to 500 letters. Keep it to one short line.</span>
            </div>
            <CheckRow
              label="Show this message in the announcement bar"
              hint="Off: the message is kept here but shoppers do not see it."
              checked={storeForm.announcementActive ?? true}
              onChange={(checked) => setStoreForm({ ...storeForm, announcementActive: checked })}
            />
          </div>
        </Panel>

        <Panel id="settings-delivery" title="Delivery & shipping" hint="What shipping costs, and how long an order takes to reach the customer.">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Store currency" hint="All prices are in Indian rupees. This cannot be changed.">
                <input
                  type="text"
                  readOnly
                  value="INR (Indian Rupee - ₹)"
                  className={`${input} text-ink-muted`}
                />
              </Field>

              <Field label="Standard shipping fee (₹)" hint="The shipping charge added to an order at checkout.">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={storeForm.shippingCharge}
                  onChange={(e) => setStoreForm({ ...storeForm, shippingCharge: Number(e.target.value) })}
                  className={`${input} sag-num`}
                />
              </Field>

              <Field label="Free shipping threshold (₹)" hint="Orders of this amount or more ship free. 0 = never free.">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={storeForm.freeShippingThreshold}
                  onChange={(e) => setStoreForm({ ...storeForm, freeShippingThreshold: Number(e.target.value) })}
                  className={`${input} sag-num`}
                />
              </Field>
            </div>

            <GroupTitle hint="Used to tell shoppers when their order should arrive.">Delivery time</GroupTitle>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Processing days (to pack and ship)" hint="Days you need before the courier collects the parcel.">
                <input type="number" inputMode="numeric" min={0} max={30} step={1} value={storeForm.processingDays ?? 0} onChange={(e) => setStoreForm({ ...storeForm, processingDays: Number(e.target.value) })} className={`${input} sag-num`} />
              </Field>
              <Field label="Courier delivery days: from (0 = not shown)" hint="The quickest the courier usually delivers.">
                <input type="number" inputMode="numeric" min={0} max={60} step={1} value={storeForm.deliveryMinDays ?? 0} onChange={(e) => setStoreForm({ ...storeForm, deliveryMinDays: Number(e.target.value) })} className={`${input} sag-num`} />
              </Field>
              <Field label="Courier delivery days: to (0 = not shown)" hint="The longest the courier usually takes.">
                <input type="number" inputMode="numeric" min={0} max={60} step={1} value={storeForm.deliveryMaxDays ?? 0} onChange={(e) => setStoreForm({ ...storeForm, deliveryMaxDays: Number(e.target.value) })} className={`${input} sag-num`} />
              </Field>
            </div>
            <p className={kit.note}>
              {deliveryText
                ? <>Shoppers see: <strong className="text-ink">{deliveryText}</strong> (for an order placed now; Sundays are skipped). An expected date you enter on an order replaces it.</>
                : 'No delivery date is shown to shoppers until you set delivery days.'}
            </p>
          </div>
        </Panel>

        <Panel
          id="settings-prepaid"
          title="Online payment discount"
          hint="A reward for paying online. Set a flat amount, a percent, or both; 0 switches one off."
          action={<Pill tone={savedPercent || savedFlat ? 'live' : 'off'}>{savedPercent || savedFlat ? `Live: ${prepaidText} off` : 'Off'}</Pill>}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            <p className={`${kit.note} sag-num`}>
              {formPercent || formFlat
                ? <>With these numbers a shopper who pays online gets <strong className="text-ink">{[formPercent ? `${formPercent}% off` : '', formFlat ? `${rupees(formFlat)} off` : ''].filter(Boolean).join(' and ')}</strong>{formPercent && Number(storeForm.prepaidMinPrice) > 0 ? <> (the percent only on products above {rupees(storeForm.prepaidMinPrice)})</> : null}.</>
                : 'With both at 0, paying online gives no extra discount.'}
            </p>
          </div>
        </Panel>

        <Panel
          id="settings-cod"
          title="Cash on delivery"
          hint="Let shoppers pay most of the order in cash when the parcel arrives."
          action={<Pill tone={saved.codEnabled === true ? 'live' : 'off'}>{saved.codEnabled === true ? 'Live on the site' : 'Off'}</Pill>}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            <div>
              <span className="sag-label">Cash on delivery</span>
              <CheckRow
                id="admin-cod-enabled"
                label="Offer cash on delivery"
                hint="When on, the shopper can choose cash on delivery at the pay step: the charge below is paid online (UPI, Razorpay) to confirm the order and the rest is collected in cash at delivery. Cash on delivery orders get no online payment discount."
                checked={storeForm.codEnabled === true}
                onChange={(checked) => setStoreForm({ ...storeForm, codEnabled: checked })}
              />
            </div>

            <Field
              label="Cash on delivery charge (₹, paid online)"
              hint="Shipping charge of a cash on delivery order. The shopper pays it online to confirm; it is the whole online payment of that order."
            >
              <input
                id="admin-cod-charge"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={storeForm.codCharge ?? 99}
                onChange={(e) => setStoreForm({ ...storeForm, codCharge: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                className={`${input} sag-num`}
              />
            </Field>
          </div>
        </Panel>

        <Panel id="settings-emails" title="Automatic emails" hint="Emails the store sends by itself. Order confirmations and sign-in codes are always sent; these two you can switch off.">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              <div>
                <span className="sag-label">Checkout reminder email</span>
                <CheckRow
                  id="admin-abandoned-reminders"
                  label="Send checkout reminders"
                  hint="One email, about an hour after a shopper types their email at checkout and leaves without paying. Never more than one in 7 days to the same address."
                  checked={storeForm.abandonedReminders !== false}
                  onChange={(checked) => setStoreForm({ ...storeForm, abandonedReminders: checked })}
                />
              </div>

              <div>
                <span className="sag-label">Review request email</span>
                <CheckRow
                  id="admin-review-requests"
                  label="Ask for a review after delivery"
                  hint="One email per order, 3 days after it is marked Delivered, asking for an honest review. Not sent while a return is open."
                  checked={storeForm.reviewRequests !== false}
                  onChange={(checked) => setStoreForm({ ...storeForm, reviewRequests: checked })}
                />
              </div>
            </div>

            {/* Transactional email (sent by the server) */}
            <GroupTitle
              hint={<>
                Login codes, order confirmations and shipped / delivered / cancelled / refund emails are sent by the server through Brevo.
                The API key lives only in the Cloudflare Worker secret <code className="font-mono break-all text-ink">BREVO_API_KEY</code> and is never sent to browsers.
              </>}
            >
              Check that emails are working
            </GroupTitle>
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
                  // Enter here sends the test; it must not save the whole settings form
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (!sendingTest) sendTestEmail(); } }}
                  placeholder="you@example.com"
                  className={`${input} sm:flex-1 min-w-0`}
                />
                <button
                  type="button"
                  disabled={sendingTest}
                  onClick={sendTestEmail}
                  className="sag-btn-outline h-12 px-5 text-sm gap-2 shrink-0"
                >
                  {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>{sendingTest ? 'Sending…' : 'Send test'}</span>
                </button>
              </div>
              <span className={hintText}>Sends one real email to this address so you can see it arrive. It does not change any setting.</span>
              <div className="mt-2 min-h-5" aria-live="polite">{noteLine('brevo')}</div>
            </div>
          </div>
        </Panel>

        <Panel
          id="settings-checkout"
          title="Checkout rules"
          hint="These rules are checked again by the server before every payment, so the store never takes an order outside them. Use 0 to switch a limit off."
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Minimum order (₹, 0 = none)" hint="Counted after discounts, before shipping.">
                <input type="number" inputMode="numeric" min={0} step={1} value={storeForm.minOrderAmount ?? 0} onChange={(e) => setStoreForm({ ...storeForm, minOrderAmount: Number(e.target.value) })} className={`${input} sag-num`} />
              </Field>
              <Field label="Maximum order (₹, 0 = none)" hint="The biggest order the store accepts.">
                <input type="number" inputMode="numeric" min={0} step={1} value={storeForm.maxOrderAmount ?? 0} onChange={(e) => setStoreForm({ ...storeForm, maxOrderAmount: Number(e.target.value) })} className={`${input} sag-num`} />
              </Field>
              <Field label="Cancellation window (hours, 0 = no limit)" hint="Customers can ask to cancel only before the order is shipped and within this many hours of paying.">
                <input type="number" inputMode="numeric" min={0} max={720} step={1} value={storeForm.cancellationWindowHours ?? 0} onChange={(e) => setStoreForm({ ...storeForm, cancellationWindowHours: Number(e.target.value) })} className={`${input} sag-num`} />
              </Field>
            </div>
            <CheckRow
              label="Coupons are on"
              hint="Untick to switch every coupon code off."
              checked={storeForm.couponsEnabled !== false}
              onChange={(checked) => setStoreForm({ ...storeForm, couponsEnabled: checked })}
            />
          </div>
        </Panel>

        <Panel id="settings-invoice" title="Invoice" hint="What is printed on the invoice a customer gets with an order.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Legal business name" hint="The registered name of the business.">
              <input type="text" maxLength={160} value={storeForm.legalName || ''} onChange={(e) => setStoreForm({ ...storeForm, legalName: e.target.value })} className={input} />
            </Field>
            <Field label="GSTIN (leave empty if not registered)" hint="15 characters, e.g. 19ABCDE1234F1Z5.">
              <input type="text" maxLength={20} value={storeForm.gstin || ''} onChange={(e) => setStoreForm({ ...storeForm, gstin: e.target.value.toUpperCase() })} placeholder="19ABCDE1234F1Z5" className={`${input} font-mono`} />
            </Field>
            <Field
              label="Invoice number prefix"
              hint={<>Invoice number = prefix + order number, e.g. <span className="break-all">{(storeForm.invoicePrefix || 'SAG-INV').toUpperCase()}-SAG-260930-ABCDE</span>.</>}
            >
              <input type="text" maxLength={20} value={storeForm.invoicePrefix ?? 'SAG-INV'} onChange={(e) => setStoreForm({ ...storeForm, invoicePrefix: e.target.value.toUpperCase() })} className={`${input} font-mono`} />
            </Field>
            <Field label="Registered address on invoices (empty = store address)" className="sm:col-span-2">
              <textarea rows={2} maxLength={500} value={storeForm.invoiceAddress || ''} onChange={(e) => setStoreForm({ ...storeForm, invoiceAddress: e.target.value })} className={area} />
            </Field>
            <Field label="Note printed on invoices" className="sm:col-span-2">
              <textarea rows={2} maxLength={500} value={storeForm.invoiceNote || ''} onChange={(e) => setStoreForm({ ...storeForm, invoiceNote: e.target.value })} placeholder="e.g. Goods once sold can be exchanged within 7 days as per our return policy." className={area} />
            </Field>
          </div>
        </Panel>

        <SaveBar
          note={noteLine('general') || (storeUnsaved
            ? <span className="font-medium text-brand">You have changes that are not saved yet.</span>
            : 'Saves everything from Store details to Invoice.')}
        >
          <button type="submit" disabled={busy !== ''} className={kit.primary}>
            {busy === 'general' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{busy === 'general' ? 'Saving…' : 'Save store settings'}</span>
          </button>
        </SaveBar>
      </form>

      {/* ---------------- Payment gateways (Razorpay, PayU): each part has its own save ---------------- */}
      <div id="settings-payment" className="scroll-mt-24">
        <AdminPaymentGateways />
      </div>

      {/* ---------------- Login & security: its own save, because it needs the password ---------------- */}
      <div id="settings-security" className="space-y-5 scroll-mt-24">
        <Panel
          title="Login & security"
          hint="Protecting your store from unauthorized access, shared password leakage, and brute-force attempts. This part has its own save button, because it asks for the password."
          action={<span className="flex flex-wrap items-center gap-2">
            <Pill tone="live">Protection on</Pill>
            <Pill tone="off" className="font-mono">Session v{securityConfig.sessionVersion}</Pill>
          </span>}
        >
          <p className="flex items-start gap-2.5 text-sm leading-5 text-ink-muted">
            <ShieldCheck className="w-5 h-5 shrink-0 text-brand" aria-hidden="true" />
            <span>
              Direct <code className="font-mono text-ink">/admin</code> URL access is protected. If anyone tries to guess or open <code className="font-mono text-ink">/admin</code> without your active credentials, they receive a fake 404 &quot;Page Not Found&quot; screen. Only your secret URL slug or authorized staff PIN can access the login gate.
            </span>
          </p>
        </Panel>

        <form onSubmit={handleSaveSecurity} className="space-y-5">

          {/* Section 1: Secret URL Route Slug */}
          <Panel
            title="Secret admin address"
            hint={<>Choose a custom hidden URL path instead of the easily guessable <code className="font-mono">/admin</code>.</>}
          >
            <div className="space-y-4">
              <div>
                <label className="sag-label" htmlFor="settings-secret-slug">
                  Secret path slug
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex sm:flex-1 min-w-0 items-center gap-2">
                    <span className="shrink-0 font-mono text-lg text-ink-muted" aria-hidden="true">/</span>
                    <input
                      id="settings-secret-slug"
                      type="text"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={secForm.secretPathSlug}
                      onChange={(e) => setSecForm({ ...secForm, secretPathSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '') })}
                      placeholder="e.g. drdaina"
                      className={`${input} font-mono min-w-0`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleCopySecretLink}
                    className="sag-btn-outline h-12 px-4 text-sm gap-2 shrink-0"
                  >
                    {copiedLink ? <Check className="w-4 h-4 text-brand" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedLink ? 'Copied!' : 'Copy secret link'}</span>
                  </button>
                </div>
                <p className={hintText}>
                  Your secret admin link: <code className="text-brand px-1 font-mono font-semibold break-all">/{adminEntrySlug(secForm.secretPathSlug)}</code>. Bookmark this in your browser.
                </p>
              </div>

              <SwitchRow
                label={<>Hide <code className="font-mono">/admin</code> from public</>}
                hint={<>When enabled, anyone typing <code className="font-mono">/admin</code> in their browser sees a 404 Page Not Found error instead of a login form.</>}
                checked={!secForm.allowDirectAdminRoute}
                onChange={(hidden) => setSecForm({ ...secForm, allowDirectAdminRoute: !hidden })}
                ariaLabel="Hide /admin from public"
                onText="On"
              />
            </div>
          </Panel>

          {/* Section 2: Master Credentials */}
          <Panel
            title="Master admin credentials"
            hint="Update your username and master password. The old password ('abhi') has been permanently disabled."
          >
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
                    className="absolute inset-y-0 right-0 w-12 flex items-center justify-center rounded-full text-ink-muted hover:text-ink cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className={`${hintText} flex items-start gap-1.5`}>
                  <ShieldCheck className="w-4 h-4 text-brand shrink-0 mt-px" />
                  <span>Password and PIN are stored only as salted hashes, never as plain text.</span>
                </p>
              </div>
            </div>
          </Panel>

          {/* Section 3: 2FA Security PIN */}
          <Panel
            title="Two-step login (6-digit security PIN)"
            hint="Even if someone discovers your password, they cannot enter without this 6-digit PIN."
          >
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

              <SwitchRow
                className="md:mt-6"
                label="Ask for the PIN at login"
                hint="Requires typing the 6-digit PIN whenever signing into the admin panel."
                checked={secForm.requirePin}
                onChange={(requirePin) => setSecForm({ ...secForm, requirePin })}
                ariaLabel="Ask for the PIN at login"
                onText="On"
              />
            </div>

            <div className="mt-5 pt-4 border-t border-line flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-h-5" aria-live="polite">{noteLine('security')}</div>
              <button type="submit" disabled={busy !== ''} className={`${kit.primary} w-full sm:w-auto shrink-0`}>
                {busy === 'security' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{busy === 'security' ? 'Saving…' : 'Save all security changes'}</span>
              </button>
            </div>
          </Panel>
        </form>

        {/* Section 4: Emergency Session Revocation (Danger Zone) */}
        <section className="rounded-[10px] border border-danger-line bg-danger-tint p-4 sm:p-6 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 shrink-0 text-danger" aria-hidden="true" />
            <div className="min-w-0 space-y-1">
              <p className="text-xs leading-4 font-semibold uppercase tracking-[0.08em] text-danger">Emergency</p>
              <h4 className="text-[17px] leading-6 font-semibold text-ink">
                Revoke all active sessions (disconnect friends &amp; other devices)
              </h4>
              <p className="text-sm leading-5 text-ink-muted">
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
              className={`${kit.danger} w-full sm:w-auto`}
            >
              {busy === 'revoke' ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              <span>Revoke all sessions now</span>
            </button>
          </div>
        </section>
      </div>

      {/* ---------------- Where the data is kept (technical; closed until opened) ---------------- */}
      <details id="settings-data" className={`${kit.panel} scroll-mt-24 group`}>
        <summary className="flex flex-wrap items-center justify-between gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1 basis-56">
            <span className={`block ${kit.h2}`}>Where data is kept</span>
            <span className={`mt-1 block ${kit.hint}`}>Technical details for a developer. There is nothing to set here.</span>
          </span>
          <span className="text-[13px] font-medium text-brand underline underline-offset-[3px] group-open:hidden">Show</span>
          <span className="text-[13px] font-medium text-brand underline underline-offset-[3px] hidden group-open:inline">Hide</span>
        </summary>

        <div className="mt-4 pt-4 border-t border-line space-y-4">
          <div>
            <h4 className="text-[15px] leading-[22px] font-semibold text-ink">Firebase database &amp; schema overview</h4>
            <p className={`mt-1 ${kit.hint}`}>Store data lives in Firebase (Cloud Firestore for records, Cloudflare R2 for photos). The connection is configured at build time, so there are no credentials to manage here.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {COLLECTIONS.map((collection) => (
              <div key={collection.name} className={`${kit.inset} space-y-2`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink font-mono break-all">{collection.name}</span>
                  <Pill tone="soon">{collection.state}</Pill>
                </div>
                <p className={`${kit.hint} break-words`}>{collection.fields}</p>
              </div>
            ))}
          </div>

          <p className={`${kit.note} flex items-start gap-2.5`}>
            <Info className="w-4 h-4 text-brand shrink-0 mt-0.5" />
            <span>
              <strong className="text-ink">Firebase live sync:</strong> Customer profiles, orders, categories, coupons, and reviews are stored in Cloud Firestore and sync in real time; product and banner images are stored in Cloudflare R2.
            </span>
          </p>
        </div>
      </details>

      </div>
    </div>
  );
};
