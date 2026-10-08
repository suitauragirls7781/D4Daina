import React, { useEffect, useId, useMemo, useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { CreditCard, ShieldCheck, Save, Loader2, Copy, Check, RefreshCw, KeyRound } from 'lucide-react';
import { PaymentGatewaySettings } from '../../types';
import { AdminPageHeader } from './kidsToysShared';

// ---------------------------------------------------------------- shared pieces of the admin's "storefront & settings" pages
// (Coupons, Deal, Combo, Homepage, Hero, Banners, Reels, Instagram, Discovery, Payments, Usage, Settings.)
// Midnight glass: glass panels, light text, gold for "on", red only for real problems.

/** Class strings used by every one of those pages, so they read as one system. */
export const kit = {
  /** A titled glass panel. */
  panel: 'sag-glass p-4 sm:p-6',
  /** A quiet box inside a panel (a row, an option, a note). */
  inset: 'rounded-2xl border border-line bg-sunken p-3.5 sm:p-4',
  h2: 'text-[17px] leading-6 font-semibold text-ink',
  hint: 'text-[13px] leading-[18px] text-ink-muted',
  field: 'sag-input h-12',
  iconBtn: 'w-11 h-11 shrink-0 rounded-full inline-flex items-center justify-center text-ink hover:bg-sunken-deep transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed',
  iconBtnDanger: 'w-11 h-11 shrink-0 rounded-full inline-flex items-center justify-center text-danger hover:bg-danger-tint transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed',
  primary: 'sag-btn-primary h-12 px-6 text-sm gap-2',
  outline: 'sag-btn-outline h-12 px-5 text-sm gap-2 disabled:opacity-50',
  /** Smaller glass button for rows. */
  small: 'sag-btn-outline h-11 px-4 text-[13px] gap-1.5 disabled:opacity-50',
  /** Words-and-colour button for a destructive action. */
  danger: 'h-12 px-5 rounded-full border border-danger-line bg-danger-tint text-danger text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors hover:bg-sunken disabled:opacity-50 disabled:cursor-not-allowed',
  /** Dim layer behind a dialog, and the dialog sheet itself. */
  scrim: 'fixed inset-0 z-[80] bg-[color:var(--sag-scrim)] flex items-end sm:items-center justify-center sm:p-4',
  sheet: 'w-full bg-[color:var(--sag-glass-sheet)] backdrop-blur-xl border border-line rounded-t-[22px] sm:rounded-[22px] shadow-[var(--sag-shadow-pop)]',
  alert: 'rounded-2xl border border-danger-line bg-danger-tint px-4 py-3 text-sm leading-5 text-danger',
  note: 'rounded-2xl border border-line bg-sunken px-4 py-3 text-sm leading-5 text-ink-muted',
  th: 'px-4 py-3 text-left text-[11px] leading-4 font-semibold uppercase tracking-[0.08em] text-ink-muted',
};

type PillTone = 'live' | 'soon' | 'off' | 'problem';
const PILL_TONE: Record<PillTone, string> = {
  live: 'bg-brand text-[color:var(--sag-on-gold)]',
  soon: 'border border-brand-line bg-brand-wash text-brand',
  off: 'border border-line bg-sunken text-ink-muted',
  problem: 'border border-danger-line bg-danger-tint text-danger',
};

/** Status in words: gold fill = live now, gold outline = waiting, grey = off, red = a real problem. */
export const Pill: React.FC<{ tone?: PillTone; children: React.ReactNode; className?: string; role?: string }> = ({ tone = 'off', children, className = '', role }) => (
  <span role={role} className={`inline-flex items-center gap-1.5 min-h-7 px-3 py-1 rounded-full text-xs leading-4 font-semibold shrink-0 ${PILL_TONE[tone]} ${className}`}>
    {tone === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--sag-on-gold)]" aria-hidden="true" />}
    {children}
  </span>
);

/** A row of 2-4 key numbers. Every number passed in must be real. */
export const Tiles: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <dl className={`grid grid-cols-2 lg:grid-cols-4 gap-3 ${className}`}>{children}</dl>
);
export const Tile: React.FC<{ label: React.ReactNode; value: React.ReactNode; note?: React.ReactNode; danger?: boolean }> = ({ label, value, note, danger }) => (
  <div className="sag-glass min-w-0 px-4 py-3.5">
    <dt className="text-xs leading-4 font-medium text-ink-muted break-words">{label}</dt>
    <dd className={`mt-1 text-[26px] leading-8 font-semibold sag-num break-words ${danger ? 'text-danger' : 'text-ink'}`}>{value}</dd>
    {note && <dd className="mt-0.5 text-xs leading-4 text-ink-muted break-words">{note}</dd>}
  </div>
);

/** A glass panel with a title, one plain line of help and an optional action at the right. */
export const Panel: React.FC<{
  id?: string; title: React.ReactNode; hint?: React.ReactNode; action?: React.ReactNode; titleId?: string; className?: string; children?: React.ReactNode;
}> = ({ id, title, hint, action, titleId, className = '', children }) => (
  <section id={id} aria-labelledby={titleId} className={`${kit.panel} scroll-mt-24 ${className}`}>
    <div className={`flex flex-wrap items-start justify-between gap-3 ${children ? 'pb-4 mb-4 border-b border-line' : ''}`}>
      <div className="min-w-0 flex-1 basis-56">
        <h3 id={titleId} className={kit.h2}>{title}</h3>
        {hint && <p className={`mt-1 ${kit.hint} max-w-2xl`}>{hint}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
);

/** On/off switch used across the settings pages: 44px tall hit area, gold when on. */
export const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; id?: string }> = ({ checked, onChange, label: aria, disabled, id }) => (
  <button
    type="button"
    role="switch"
    id={id}
    aria-checked={checked}
    aria-label={aria}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className="relative inline-flex h-11 w-13 shrink-0 items-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
  >
    <span className={`block h-7 w-13 rounded-full border transition-colors ${checked ? 'bg-brand border-transparent' : 'bg-sunken-deep border-line'}`} aria-hidden="true" />
    <span className={`absolute left-0.75 top-1/2 -mt-2.75 h-5.5 w-5.5 rounded-full transition-transform ${checked ? 'translate-x-6 bg-[color:var(--sag-on-gold)]' : 'bg-ink'}`} aria-hidden="true" />
  </button>
);

interface RowProps {
  label: React.ReactNode;
  /** One plain line saying what the switch does. */
  hint?: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Words in the pill, e.g. "Live on the site" / "Off". */
  onText?: string;
  offText?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/** A setting with a switch: the name, a Live / Off pill, one line of help, and the switch at the right. */
export const SwitchRow: React.FC<RowProps & { ariaLabel: string }> = ({ label, hint, checked, onChange, onText = 'Live on the site', offText = 'Off', disabled, id, ariaLabel, className = '' }) => (
  <div className={`flex items-center gap-3 ${kit.inset} ${className}`}>
    <div className="min-w-0 flex-1">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-5 font-semibold text-ink">
        <span>{label}</span>
        <Pill tone={checked ? 'live' : 'off'}>{checked ? onText : offText}</Pill>
      </p>
      {hint && <p className={`mt-1 ${kit.hint}`}>{hint}</p>}
    </div>
    <Switch id={id} checked={checked} onChange={onChange} label={ariaLabel} disabled={disabled} />
  </div>
);

/** The same row with a real tick box (keeps the element ids that scripts use). The whole row is the tap target. */
export const CheckRow: React.FC<RowProps> = ({ label, hint, checked, onChange, onText = 'On', offText = 'Off', disabled, id, className = '' }) => (
  <label className={`flex items-start gap-3 cursor-pointer ${kit.inset} ${className}`}>
    <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5.5 w-5.5 shrink-0 accent-brand cursor-pointer" />
    <span className="min-w-0 flex-1">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-5 font-semibold text-ink">
        <span>{label}</span>
        <Pill tone={checked ? 'live' : 'off'}>{checked ? onText : offText}</Pill>
      </span>
      {hint && <span className={`mt-1 block ${kit.hint}`}>{hint}</span>}
    </span>
  </label>
);

/** The page's one save bar: stays at the bottom of the screen while the page scrolls. */
export const SaveBar: React.FC<{ note?: React.ReactNode; children: React.ReactNode }> = ({ note, children }) => (
  <div className="sticky bottom-3 z-20 sag-glass-bar !rounded-[22px] flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pl-4 pr-2 py-2">
    <div className="min-w-0 flex-1 basis-40 text-[13px] leading-[18px] text-ink-muted" aria-live="polite">{note}</div>
    <div className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:[&>*]:flex-1">{children}</div>
  </div>
);

/** An honest empty state: what is missing and what to do next. */
export const Empty: React.FC<{ icon?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode }> = ({ icon, title, children, action }) => (
  <div className="sag-glass px-5 py-12 text-center">
    {icon && <span className="mx-auto mb-3 flex w-12 h-12 items-center justify-center text-brand [&>svg]:w-7 [&>svg]:h-7" aria-hidden="true">{icon}</span>}
    <p className="text-base leading-6 font-semibold text-ink">{title}</p>
    {children && <p className="mt-1 mx-auto max-w-md text-sm leading-5 text-ink-muted">{children}</p>}
    {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
  </div>
);

/** A thin usage / progress line: grey track, gold fill (red only when a real limit is nearly reached). */
export const Meter: React.FC<{ percent: number; danger?: boolean; label: string; valueText?: string }> = ({ percent, danger, label, valueText }) => (
  <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100, Math.max(0, percent)))} aria-valuetext={valueText}
    className="h-2 w-full overflow-hidden rounded-full bg-line">
    <div className={`h-full rounded-full transition-[width] duration-300 ${danger ? 'bg-danger' : 'bg-brand'}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
  </div>
);

// ---------------------------------------------------------------- payment gateways

type GatewayView = {
  razorpay: {
    enabled: boolean; configured: boolean; mode: 'test' | 'live'; source: 'admin' | 'env';
    keyId: string; secretSet: boolean; secretHint: string; webhookSecretSet: boolean; webhookSecretHint: string;
  };
  payu: { enabled: boolean; mode: 'test' | 'live'; merchantKey: string; saltSet: boolean; saltHint: string };
  urls: { success: string; failure: string; webhook: string; razorpayWebhook: string };
};

type RazorpayPayment = { at: string; status: string; method: string; amount: number; orderId: string; error: string };

const label = 'sag-label';
const input = kit.field;
const btnOutline = 'sag-btn-outline h-11 px-5 text-sm gap-2 disabled:opacity-60';
const btnPrimary = 'sag-btn-primary h-11 px-5 text-sm gap-2';

const CopyField: React.FC<{ title: string; value: string }> = ({ title, value }) => {
  const [copied, setCopied] = useState(false);
  const fieldId = useId();
  return (
    <div>
      <label className={label} htmlFor={fieldId}>{title}</label>
      <div className="flex gap-2">
        <input id={fieldId} readOnly value={value} className={`${input} min-w-0 font-mono text-[13px] text-ink-muted`} />
        <button
          type="button"
          onClick={() => { navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
          className="sag-btn-outline h-12 w-12 shrink-0 px-0"
          aria-label={`Copy ${title}`}
        >
          {copied ? <Check className="h-4 w-4 text-brand" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
};

const paymentTone = (status: string): PillTone => (status === 'captured' ? 'soon' : status === 'failed' ? 'problem' : 'off');

const PAGE_LINE = 'The companies that collect money from shoppers at checkout. Switch one on or off here; checkout follows within about 20 seconds.';

/** Admin → Settings → Payments: gateway switches (Razorpay, PayU), PayU credentials, payment channels and logs. */
// asPage: shown as its own admin page (/payments) with the shared page header; inside Settings it is one titled panel group.
export const AdminPaymentGateways: React.FC<{ asPage?: boolean }> = ({ asPage = false }) => {
  const { paymentSettings, updatePaymentSettings, orders = [] } = useAdmin();
  const { showToast } = useShop();

  const [view, setView] = useState<GatewayView | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState<'' | 'razorpay' | 'payu' | 'channels'>('');
  const [payu, setPayu] = useState({ enabled: false, mode: 'test' as 'test' | 'live', merchantKey: '', salt: '' });
  const [rzp, setRzp] = useState({ keyId: '', keySecret: '', webhookSecret: '' });
  const [channels, setChannels] = useState<PaymentGatewaySettings>(paymentSettings);
  const [payments, setPayments] = useState<RazorpayPayment[] | null>(null);
  const [loadingPayments, setLoadingPayments] = useState(false);

  useEffect(() => setChannels(paymentSettings), [paymentSettings]);

  const applyView = (next: GatewayView) => {
    setView(next);
    setPayu({ enabled: next.payu.enabled, mode: next.payu.mode, merchantKey: next.payu.merchantKey, salt: '' });
    setRzp({ keyId: next.razorpay.source === 'admin' ? next.razorpay.keyId : '', keySecret: '', webhookSecret: '' });
  };

  const loadGateways = () => {
    setLoadError('');
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);
    fetch('/api/admin-config?action=payment-gateways', { credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(response.status === 401 ? 'Please sign in again to see the payment settings.' : 'The payment settings could not be loaded right now. The store database may be busy.');
        applyView(result.gateways);
      })
      .catch((error) => setLoadError(error?.name === 'AbortError' ? 'The payment settings are taking too long to load. The store database may be busy.' : error.message))
      .finally(() => window.clearTimeout(timer));
  };
  useEffect(loadGateways, []);

  const saveGateways = async (which: 'razorpay' | 'payu', body: Record<string, unknown>) => {
    setSaving(which);
    try {
      const response = await fetch('/api/admin-config', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentGateways: body }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not save.');
      applyView(result.gateways);
      showToast('Saved. Checkout updates within about 20 seconds.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save.', 'error');
    } finally {
      setSaving('');
    }
  };

  const saveChannels = async () => {
    setSaving('channels');
    try {
      await updatePaymentSettings(channels);
      showToast('Payment methods saved.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save.', 'error');
    } finally {
      setSaving('');
    }
  };

  const loadPayments = async () => {
    setLoadingPayments(true);
    try {
      const response = await fetch('/api/admin-config?action=razorpay-payments', { credentials: 'same-origin' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Razorpay did not answer.');
      setPayments(result.payments || []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not load payments.', 'error');
    } finally {
      setLoadingPayments(false);
    }
  };

  // Payment status across the store's orders (already loaded in the admin panel, no extra reads)
  const summary = useMemo(() => {
    const count = { Paid: 0, Unpaid: 0, Refunded: 0, Cancelled: 0, payu: 0, razorpay: 0 };
    for (const order of orders) {
      if (order.paymentStatus === 'Paid') count.Paid += 1;
      else if (order.paymentStatus === 'Refunded') count.Refunded += 1;
      else count.Unpaid += 1;
      if (order.status === 'Cancelled') count.Cancelled += 1;
      if ((order as any).paymentMethod === 'payu') count.payu += 1;
      else count.razorpay += 1;
    }
    return count;
  }, [orders]);

  const recentPayu = orders.filter((order) => (order as any).paymentMethod === 'payu').slice(0, 10);

  const heading = (actions?: React.ReactNode) => (asPage ? (
    <AdminPageHeader eyebrow="System" title="Payment gateways" icon={<CreditCard />} description={PAGE_LINE} actions={actions} />
  ) : (
    <Panel title="Payment gateways" hint={`${PAGE_LINE} Each part below has its own save button.`} action={actions} />
  ));

  // Never an empty page: the title is always shown, with what is happening and a way to try again
  if (loadError || !view) {
    return (
      <div className="space-y-4 text-sm">
        {heading()}
        {loadError ? (
          <div role="alert" className={kit.alert}>
            <p className="font-semibold">{loadError}</p>
            <p className="mt-1 text-[13px]">Checkout keeps using the gateway settings already saved; nothing has changed.</p>
            <button type="button" onClick={loadGateways} className="sag-btn-outline mt-3 h-11 px-4 text-sm gap-2">
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          </div>
        ) : (
          <div className={`${kit.panel} flex items-center gap-3 text-ink-muted`} role="status" aria-busy="true">
            <Loader2 className="w-5 h-5 animate-spin text-ink" /> Loading payment settings…
          </div>
        )}
      </div>
    );
  }

  const razorpayLive = view.razorpay.enabled && view.razorpay.configured;
  const activeCount = Number(razorpayLive) + Number(view.payu.enabled);

  const statusChip = (
    <Pill role="status" tone={activeCount ? 'live' : 'problem'} className="self-start">
      {activeCount ? `${activeCount} gateway${activeCount > 1 ? 's' : ''} live at checkout` : 'No gateway on — customers cannot pay'}
    </Pill>
  );

  return (
    <div className="space-y-4 text-sm">
      {heading(statusChip)}

      {/* Payment status across the orders already loaded */}
      <div>
        <Tiles>
          <Tile label="Paid orders" value={summary.Paid} />
          <Tile label="Awaiting payment" value={summary.Unpaid} />
          <Tile label="Refunded" value={summary.Refunded} />
          <Tile label="Cancelled" value={summary.Cancelled} />
        </Tiles>
        <p className={`mt-2 ${kit.hint} sag-num`}>From the orders loaded in this admin panel · Razorpay {summary.razorpay} · PayU {summary.payu}</p>
      </div>

      {/* Razorpay */}
      <Panel
        title="Razorpay"
        hint={!view.razorpay.configured
          ? 'No keys yet — add them below.'
          : `${view.razorpay.mode === 'live' ? 'Live' : 'Test'} keys in use (${view.razorpay.keyId}) · ${view.razorpay.source === 'admin' ? 'saved here' : 'from the Cloudflare Worker secrets'}${view.razorpay.mode === 'test' ? ' · test mode is shown only to you, not to customers' : ''}.`}
        action={<Pill tone={razorpayLive ? 'live' : view.razorpay.enabled ? 'problem' : 'off'}>{razorpayLive ? 'Live at checkout' : view.razorpay.enabled ? 'On, but no keys yet' : 'Off'}</Pill>}
      >
        <div className="space-y-5">
          <SwitchRow
            label="Take payments with Razorpay"
            hint="On: shoppers can pay by UPI, card and net banking through Razorpay. Off: Razorpay is not offered at checkout. Saved as soon as you tap it."
            checked={view.razorpay.enabled}
            onText="On"
            ariaLabel="Razorpay on/off"
            disabled={saving !== ''}
            onChange={(enabled) => saveGateways('razorpay', { razorpay: { enabled } })}
          />

          <form
            className={`${kit.inset} space-y-3`}
            onSubmit={(e) => {
              e.preventDefault();
              saveGateways('razorpay', { razorpay: { keyId: rzp.keyId, ...(rzp.keySecret ? { keySecret: rzp.keySecret } : {}), ...(rzp.webhookSecret ? { webhookSecret: rzp.webhookSecret } : {}) } });
            }}
          >
            <p className="text-sm leading-5 font-semibold text-ink">Razorpay keys</p>
            <p className={kit.hint}>
              Razorpay Dashboard → Account &amp; Settings → API Keys. A <strong className="text-ink">rzp_test_</strong> key runs test mode (only you see it at checkout); a <strong className="text-ink">rzp_live_</strong> key takes real payments. Keys are checked with Razorpay before saving.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={label} htmlFor="rzp-key">Key ID</label>
                <input id="rzp-key" value={rzp.keyId} onChange={(e) => setRzp({ ...rzp, keyId: e.target.value.trim() })} autoComplete="off" className={`${input} font-mono`}
                  placeholder={view.razorpay.source === 'env' && view.razorpay.keyId ? `${view.razorpay.keyId} (from the Worker secrets)` : 'rzp_live_… or rzp_test_…'} />
              </div>
              <div>
                <label className={label} htmlFor="rzp-secret">Key Secret</label>
                <input id="rzp-secret" type="password" value={rzp.keySecret} onChange={(e) => setRzp({ ...rzp, keySecret: e.target.value.trim() })} autoComplete="new-password" className={`${input} font-mono`}
                  placeholder={view.razorpay.source === 'admin' && view.razorpay.secretSet ? `Saved (${view.razorpay.secretHint}) — leave empty to keep` : 'Paste the key secret'} />
              </div>
              <div className="sm:col-span-2">
                <label className={label} htmlFor="rzp-webhook">Webhook secret (optional, recommended)</label>
                <input id="rzp-webhook" type="password" value={rzp.webhookSecret} onChange={(e) => setRzp({ ...rzp, webhookSecret: e.target.value.trim() })} autoComplete="new-password" className={`${input} font-mono`}
                  placeholder={view.razorpay.webhookSecretSet ? `Saved (${view.razorpay.webhookSecretHint}) — leave empty to keep` : 'The secret you typed when creating the webhook in Razorpay'} />
              </div>
            </div>
            <CopyField title="Razorpay webhook URL (events: payment.captured, order.paid)" value={view.urls.razorpayWebhook} />
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={saving !== '' || !rzp.keyId} className={`${btnPrimary} w-full sm:w-auto`}>
                {saving === 'razorpay' ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Check &amp; save keys
              </button>
              {view.razorpay.source === 'admin' && (
                <button type="button" disabled={saving !== ''}
                  onClick={() => { if (window.confirm('Remove the keys saved here and go back to the keys set as Cloudflare Worker secrets?')) saveGateways('razorpay', { razorpay: { clearKeys: true } }); }}
                  className={`${btnOutline} w-full sm:w-auto`}>
                  Use Worker secret keys instead
                </button>
              )}
            </div>
            <p className={`${kit.hint} flex items-start gap-1.5`}><ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-brand" /> Secrets stay on the server only and are never shown again or sent to customers.</p>
          </form>

          <div>
            <p className="text-sm leading-5 font-semibold text-ink">Methods shown in the Razorpay window</p>
            <p className={`mt-1 ${kit.hint}`}>Tick the ways shoppers may pay. If all three are off, every method is shown (so customers can always pay).</p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              {([['enableUpi', 'UPI (GPay, PhonePe, Paytm)'], ['enableCards', 'Debit & credit cards'], ['enableNetBanking', 'Net banking & wallets']] as const).map(([key, text]) => (
                <label key={key} className={`flex items-center gap-3 min-h-12 cursor-pointer ${kit.inset} !py-2.5`}>
                  <input type="checkbox" checked={Boolean(channels[key])} onChange={(e) => setChannels({ ...channels, [key]: e.target.checked })} className="h-[22px] w-[22px] shrink-0 accent-brand" />
                  <span className="text-ink">{text}</span>
                </label>
              ))}
            </div>
            <button type="button" onClick={saveChannels} disabled={saving !== ''} className={`${btnOutline} mt-3 w-full sm:w-auto`}>
              {saving === 'channels' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save methods
            </button>
          </div>
        </div>
      </Panel>

      {/* PayU */}
      <Panel
        title="PayU"
        hint={view.payu.enabled ? `On at checkout (${view.payu.mode} mode).` : 'Off — customers do not see PayU.'}
        action={<Pill tone={view.payu.enabled ? 'live' : 'off'}>{view.payu.enabled ? 'Live at checkout' : 'Off'}</Pill>}
      >
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            saveGateways('payu', { payu: { enabled: payu.enabled, mode: payu.mode, merchantKey: payu.merchantKey, ...(payu.salt ? { salt: payu.salt } : {}) } });
          }}
        >
          <SwitchRow
            label="Take payments with PayU"
            hint="On: shoppers see PayU as a way to pay. Off: PayU is hidden. Saved as soon as you tap it."
            checked={payu.enabled}
            onText="On"
            ariaLabel="PayU on/off"
            disabled={saving !== ''}
            onChange={(enabled) => {
              setPayu({ ...payu, enabled });
              saveGateways('payu', { payu: { enabled, mode: payu.mode, merchantKey: payu.merchantKey, ...(payu.salt ? { salt: payu.salt } : {}) } });
            }}
          />

          <div>
            <p className="text-sm leading-5 font-semibold text-ink">Mode</p>
            <p className={`mt-1 ${kit.hint}`}>Test takes no real money. Live takes real payments.</p>
            <div className="mt-3 flex sm:inline-flex gap-2" role="group" aria-label="PayU mode">
              {(['test', 'live'] as const).map((mode) => (
                <button key={mode} type="button" aria-pressed={payu.mode === mode} onClick={() => setPayu({ ...payu, mode })}
                  className="sag-chip h-11 flex-1 sm:flex-none px-4 text-sm">
                  {mode === 'test' ? 'Test / sandbox' : 'Live / production'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label} htmlFor="payu-key">Merchant key</label>
              <input id="payu-key" value={payu.merchantKey} onChange={(e) => setPayu({ ...payu, merchantKey: e.target.value.trim() })} autoComplete="off" className={`${input} font-mono`} placeholder="From PayU Dashboard → Payment Gateway → Settings" />
            </div>
            <div>
              <label className={label} htmlFor="payu-salt">Salt (secret)</label>
              <input id="payu-salt" type="password" value={payu.salt} onChange={(e) => setPayu({ ...payu, salt: e.target.value.trim() })} autoComplete="new-password" className={`${input} font-mono`}
                placeholder={view.payu.saltSet ? `Saved (${view.payu.saltHint}) — leave empty to keep` : 'Paste the salt (v1)'} />
              <p className={`${kit.hint} mt-1.5 flex items-start gap-1.5`}><KeyRound className="h-4 w-4 shrink-0 mt-0.5" /> Stored on the server only; never shown again or sent to customers.</p>
            </div>
          </div>

          <div className={`${kit.inset} grid grid-cols-1 gap-3`}>
            <p className="text-sm leading-5 font-semibold text-ink">Addresses to paste into the PayU dashboard</p>
            <CopyField title="Success URL (surl)" value={view.urls.success} />
            <CopyField title="Failure URL (furl)" value={view.urls.failure} />
            <CopyField title="Webhook URL (PayU Dashboard → Webhooks: Successful & Failed)" value={view.urls.webhook} />
          </div>
          <p className={`${kit.hint} flex items-start gap-1.5`}>
            <ShieldCheck className="h-4 w-4 text-brand shrink-0 mt-0.5" />
            Every PayU payment is checked with PayU's verify API (status and amount) before the order is marked paid. A repeated callback never creates a second order.
          </p>

          <button type="submit" disabled={saving !== ''} className={`${btnPrimary} w-full sm:w-auto`}>
            {saving === 'payu' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save PayU settings
          </button>
        </form>
      </Panel>

      {/* Latest payments */}
      <Panel title="Latest payments" hint="The newest payments as the gateways report them, to check that money is arriving.">
        <div className="space-y-5">
          <div>
            <p className={label}>Latest PayU orders</p>
            {recentPayu.length === 0 ? (
              <p className={kit.note}>No PayU orders among the orders loaded here.</p>
            ) : (
              <div className="divide-y divide-line rounded-2xl border border-line">
                {recentPayu.map((order) => (
                  <div key={order.orderNumber} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 text-[13px] sag-num">
                    <span className="font-mono text-ink">{order.orderNumber}</span>
                    <span className="font-semibold text-ink">₹{Number(order.finalTotal || 0).toLocaleString('en-IN')}</span>
                    <span className={order.paymentStatus === 'Paid' ? 'text-brand font-semibold' : 'text-ink-muted'}>{order.paymentStatus}</span>
                    <span className="font-mono text-ink-muted break-all">{(order as any).paymentRef || (order as any).payuTxnId || ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <button type="button" onClick={loadPayments} disabled={loadingPayments} className={`${btnOutline} w-full sm:w-auto`}>
              {loadingPayments ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Latest Razorpay payments
            </button>
            {!payments && <p className={`mt-2 ${kit.hint}`}>Asks Razorpay for its newest payments and lists them here.</p>}
            {payments && (
              <>
              {/* Phone: stacked rows */}
              <ul className="sm:hidden mt-3 rounded-2xl border border-line divide-y divide-line">
                {payments.length === 0 && <li className="px-4 py-3 text-ink-muted">No payments yet.</li>}
                {payments.map((p, index) => (
                  <li key={`${p.orderId}-${index}`} className="px-4 py-3 text-[13px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-base font-semibold text-ink sag-num">₹{p.amount.toLocaleString('en-IN')}</span>
                      <Pill tone={paymentTone(p.status)}>{p.status}</Pill>
                    </div>
                    <p className="mt-1 text-[13px] text-ink-muted">{new Date(p.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })} · {p.method}</p>
                    <p className="mt-0.5 text-[13px] font-mono text-ink-muted break-all">{p.error || p.orderId}</p>
                  </li>
                ))}
              </ul>
              <div className="hidden sm:block mt-3 overflow-x-auto rounded-2xl border border-line">
                <table className="w-full text-[13px]">
                  <thead className="border-b border-line">
                    <tr><th className={kit.th}>Time</th><th className={kit.th}>Amount</th><th className={kit.th}>Method</th><th className={kit.th}>Status</th><th className={kit.th}>Order / reason</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {payments.length === 0 && <tr><td colSpan={5} className="px-4 py-4 text-ink-muted">No payments yet.</td></tr>}
                    {payments.map((p, index) => (
                      <tr key={`${p.orderId}-${index}`}>
                        <td className="px-4 py-3 whitespace-nowrap text-ink-muted">{new Date(p.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td className="px-4 py-3 font-semibold text-ink sag-num">₹{p.amount.toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3 text-ink-muted">{p.method}</td>
                        <td className="px-4 py-3"><Pill tone={paymentTone(p.status)}>{p.status}</Pill></td>
                        <td className="px-4 py-3 font-mono text-[13px] text-ink-muted break-all">{p.error || p.orderId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
};
