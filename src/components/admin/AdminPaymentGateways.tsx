import React, { useEffect, useMemo, useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { CreditCard, ShieldCheck, Save, Loader2, Copy, Check, RefreshCw, KeyRound } from 'lucide-react';
import { PaymentGatewaySettings } from '../../types';
import { AdminPageHeader } from './kidsToysShared';

type GatewayView = {
  razorpay: {
    enabled: boolean; configured: boolean; mode: 'test' | 'live'; source: 'admin' | 'env';
    keyId: string; secretSet: boolean; secretHint: string; webhookSecretSet: boolean; webhookSecretHint: string;
  };
  payu: { enabled: boolean; mode: 'test' | 'live'; merchantKey: string; saltSet: boolean; saltHint: string };
  urls: { success: string; failure: string; webhook: string; razorpayWebhook: string };
};

type RazorpayPayment = { at: string; status: string; method: string; amount: number; orderId: string; error: string };

const card = 'sag-card p-4 sm:p-6 space-y-4';
const label = 'sag-label';
const input = 'sag-input h-12';
const subCard = 'rounded-xl bg-page border border-line p-4';
const btnOutline = 'sag-btn-outline h-11 px-5 text-sm gap-2 disabled:opacity-60';
const btnPrimary = 'sag-btn-primary h-11 px-5 text-sm gap-2';

/** On/off switch used across the settings pages: 44px tall hit area, teal when on. */
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
    <span className={`block h-7 w-13 rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-control'}`} aria-hidden="true" />
    <span className={`absolute left-0.75 top-1/2 -mt-2.75 h-5.5 w-5.5 rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : ''}`} aria-hidden="true" />
  </button>
);

const CopyField: React.FC<{ title: string; value: string }> = ({ title, value }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <span className={label}>{title}</span>
      <div className="flex gap-2">
        <input readOnly value={value} className={`${input} min-w-0 bg-page font-mono text-[13px]`} />
        <button
          type="button"
          onClick={() => { navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
          className="h-12 w-12 shrink-0 rounded-xl border-[1.5px] border-control bg-white flex items-center justify-center text-ink hover:bg-sunken cursor-pointer"
          aria-label={`Copy ${title}`}
        >
          {copied ? <Check className="h-4 w-4 text-ok" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
};

/** Admin → Settings → Payments: gateway switches (Razorpay, PayU), PayU credentials, payment channels and logs. */
// asPage: shown as its own admin page (/payments) with the shared page header; inside Settings the tab keeps the card header.
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

  // Never an empty page: the title is always shown, with what is happening and a way to try again
  if (loadError || !view) {
    return (
      <div className="space-y-5 text-sm">
        {asPage ? (
          <AdminPageHeader
            eyebrow="System"
            title="Payment gateways"
            icon={<CreditCard />}
            description="Prepaid only. Switch a gateway on or off here; checkout follows within about 20 seconds."
          />
        ) : (
        <div className="sag-card p-4 sm:p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-11 h-11 shrink-0 rounded-xl bg-sunken text-ink flex items-center justify-center" aria-hidden="true"><CreditCard className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h3 className="text-[17px] leading-6 font-semibold text-ink">Payment gateways</h3>
              <p className="text-sm text-ink-muted mt-1 max-w-xl leading-relaxed">Prepaid only. Switch a gateway on or off here; checkout follows within about 20 seconds.</p>
            </div>
          </div>
        </div>
        )}
        {loadError ? (
          <div role="alert" className="rounded-xl bg-danger-tint border border-danger-line p-4 text-danger">
            <p className="font-semibold">{loadError}</p>
            <p className="mt-1 text-[13px] text-danger">Checkout keeps using the gateway settings already saved; nothing has changed.</p>
            <button type="button" onClick={loadGateways} className="sag-btn-outline mt-3 h-11 px-4 text-sm gap-2">
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          </div>
        ) : (
          <div className="sag-card p-5 flex items-center gap-3 text-ink-muted" role="status" aria-busy="true">
            <Loader2 className="w-5 h-5 animate-spin text-ink" /> Loading payment settings…
          </div>
        )}
      </div>
    );
  }

  const activeCount = Number(view.razorpay.enabled && view.razorpay.configured) + Number(view.payu.enabled);

  const statusChip = (
    <span role="status" className={`self-start shrink-0 rounded-md border px-3 py-1.5 text-[13px] font-semibold ${activeCount ? 'bg-ok-tint border-ok-line text-ok' : 'bg-danger-tint border-danger-line text-danger'}`}>
      {activeCount ? `${activeCount} gateway${activeCount > 1 ? 's' : ''} live at checkout` : 'No gateway on — customers cannot pay'}
    </span>
  );

  return (
    <div className="space-y-5 text-sm">
      {asPage ? (
        <AdminPageHeader
          eyebrow="System"
          title="Payment gateways"
          icon={<CreditCard />}
          description="Prepaid only. Switch a gateway on or off here; checkout follows within about 20 seconds, no release needed."
          actions={statusChip}
        />
      ) : (
      <div className="sag-card p-4 sm:p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-11 h-11 shrink-0 rounded-xl bg-sunken text-ink flex items-center justify-center" aria-hidden="true"><CreditCard className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h3 className="text-[17px] leading-6 font-semibold text-ink">Payment gateways</h3>
            <p className="text-sm text-ink-muted mt-1 max-w-xl leading-relaxed">Prepaid only. Switch a gateway on or off here; checkout follows within about 20 seconds, no release needed.</p>
          </div>
        </div>
        {statusChip}
      </div>
      )}

      {/* Razorpay */}
      <div className={card}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="text-[17px] leading-6 font-semibold text-ink">Razorpay</h4>
            <p className="text-[13px] text-ink-muted mt-0.5">
              {!view.razorpay.configured
                ? 'No keys yet — add them below.'
                : `${view.razorpay.mode === 'live' ? 'Live' : 'Test'} keys in use (${view.razorpay.keyId}) · ${view.razorpay.source === 'admin' ? 'saved here' : 'from the Cloudflare Worker secrets'}${view.razorpay.mode === 'test' ? ' · test mode is shown only to you, not to customers' : ''}.`}
            </p>
          </div>
          <Switch
            checked={view.razorpay.enabled}
            label="Razorpay on/off"
            disabled={saving !== ''}
            onChange={(enabled) => saveGateways('razorpay', { razorpay: { enabled } })}
          />
        </div>
        <form
          className={`${subCard} space-y-3`}
          onSubmit={(e) => {
            e.preventDefault();
            saveGateways('razorpay', { razorpay: { keyId: rzp.keyId, ...(rzp.keySecret ? { keySecret: rzp.keySecret } : {}), ...(rzp.webhookSecret ? { webhookSecret: rzp.webhookSecret } : {}) } });
          }}
        >
          <p className="text-[13px] text-ink-muted">
            Razorpay Dashboard → Account &amp; Settings → API Keys. A <strong>rzp_test_</strong> key runs test mode (only you see it at checkout); a <strong>rzp_live_</strong> key takes real payments. Keys are checked with Razorpay before saving.
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
          <p className="text-[13px] text-ink-muted flex items-start gap-1.5"><ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" /> Secrets stay on the server only and are never shown again or sent to customers.</p>
        </form>

        <div>
          <span className={label}>Methods shown in the Razorpay window</span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {([['enableUpi', 'UPI (GPay, PhonePe, Paytm)'], ['enableCards', 'Debit & credit cards'], ['enableNetBanking', 'Net banking & wallets']] as const).map(([key, text]) => (
              <label key={key} className="flex items-center gap-3 min-h-12 rounded-xl bg-white border-[1.5px] border-control px-4 py-2 cursor-pointer hover:bg-sunken transition-colors">
                <input type="checkbox" checked={Boolean(channels[key])} onChange={(e) => setChannels({ ...channels, [key]: e.target.checked })} className="h-[22px] w-[22px] shrink-0 accent-brand" />
                <span className="text-ink">{text}</span>
              </label>
            ))}
          </div>
          <p className="text-[13px] text-ink-muted mt-2">If all three are off, every method is shown (so customers can always pay).</p>
          <button type="button" onClick={saveChannels} disabled={saving !== ''} className={`${btnOutline} mt-3 w-full sm:w-auto`}>
            {saving === 'channels' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save methods
          </button>
        </div>
      </div>

      {/* PayU */}
      <form
        className={card}
        onSubmit={(e) => {
          e.preventDefault();
          saveGateways('payu', { payu: { enabled: payu.enabled, mode: payu.mode, merchantKey: payu.merchantKey, ...(payu.salt ? { salt: payu.salt } : {}) } });
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="text-[17px] leading-6 font-semibold text-ink">PayU</h4>
            <p className="text-[13px] text-ink-muted mt-0.5">
              {view.payu.enabled ? `On at checkout (${view.payu.mode} mode).` : 'Off — customers do not see PayU.'}
            </p>
          </div>
          <Switch
            checked={payu.enabled}
            label="PayU on/off"
            disabled={saving !== ''}
            onChange={(enabled) => {
              setPayu({ ...payu, enabled });
              saveGateways('payu', { payu: { enabled, mode: payu.mode, merchantKey: payu.merchantKey, ...(payu.salt ? { salt: payu.salt } : {}) } });
            }}
          />
        </div>

        <div className="flex sm:inline-flex gap-2" role="group" aria-label="PayU mode">
          {(['test', 'live'] as const).map((mode) => (
            <button key={mode} type="button" aria-pressed={payu.mode === mode} onClick={() => setPayu({ ...payu, mode })}
              className="sag-chip h-11 flex-1 sm:flex-none px-4 text-sm">
              {mode === 'test' ? 'Test / sandbox' : 'Live / production'}
            </button>
          ))}
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
            <p className="text-[13px] text-ink-muted mt-1.5 flex items-start gap-1.5"><KeyRound className="h-4 w-4 shrink-0 mt-0.5" /> Stored on the server only; never shown again or sent to customers.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <CopyField title="Success URL (surl)" value={view.urls.success} />
          <CopyField title="Failure URL (furl)" value={view.urls.failure} />
          <CopyField title="Webhook URL (PayU Dashboard → Webhooks: Successful & Failed)" value={view.urls.webhook} />
        </div>
        <p className="text-[13px] text-ink-muted flex items-start gap-1.5">
          <ShieldCheck className="h-4 w-4 text-ok shrink-0 mt-0.5" />
          Every PayU payment is checked with PayU's verify API (status and amount) before the order is marked paid. A repeated callback never creates a second order.
        </p>

        <button type="submit" disabled={saving !== ''} className={`${btnPrimary} w-full sm:w-auto`}>
          {saving === 'payu' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save PayU settings
        </button>
      </form>

      {/* Payment status & logs */}
      <div className={card}>
        <h4 className="text-[17px] leading-6 font-semibold text-ink">Payment status</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {([['Paid', summary.Paid, 'text-ok'], ['Awaiting payment', summary.Unpaid, 'text-ink-muted'], ['Refunded', summary.Refunded, 'text-sale'], ['Cancelled', summary.Cancelled, 'text-ink-muted']] as const).map(([name, value, tone]) => (
            <div key={name} className="rounded-xl bg-page border border-line p-4">
              <p className="text-[13px] text-ink-muted">{name}</p>
              <p className={`mt-1 text-2xl leading-8 sag-num font-bold ${tone}`}>{value}</p>
            </div>
          ))}
        </div>
        <p className="text-[13px] text-ink-muted">From the orders loaded in this admin panel · Razorpay {summary.razorpay} · PayU {summary.payu}</p>

        {recentPayu.length > 0 && (
          <div>
            <span className={label}>Latest PayU orders</span>
            <div className="divide-y divide-line rounded-xl border border-line">
              {recentPayu.map((order) => (
                <div key={order.orderNumber} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 text-[13px] sag-num">
                  <span className="font-mono">{order.orderNumber}</span>
                  <span>₹{Number(order.finalTotal || 0).toLocaleString('en-IN')}</span>
                  <span className={order.paymentStatus === 'Paid' ? 'text-ok font-semibold' : 'text-ink-muted'}>{order.paymentStatus}</span>
                  <span className="font-mono text-ink-muted">{(order as any).paymentRef || (order as any).payuTxnId || ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <button type="button" onClick={loadPayments} disabled={loadingPayments} className={`${btnOutline} w-full sm:w-auto`}>
            {loadingPayments ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Latest Razorpay payments
          </button>
          {payments && (
            <>
            {/* Phone: stacked rows */}
            <ul className="sm:hidden mt-3 rounded-xl border border-line divide-y divide-line">
              {payments.length === 0 && <li className="px-4 py-3 text-ink-muted">No payments yet.</li>}
              {payments.map((p, index) => (
                <li key={`${p.orderId}-${index}`} className="px-4 py-3 text-[13px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-ink tabular-nums">₹{p.amount.toLocaleString('en-IN')}</span>
                    <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${p.status === 'captured' ? 'bg-ok-tint border-ok-line text-ok' : p.status === 'failed' ? 'bg-danger-tint border-danger-line text-danger' : 'bg-page border-line text-ink-muted'}`}>{p.status}</span>
                  </div>
                  <p className="mt-1 text-[13px] text-ink-muted">{new Date(p.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })} · {p.method}</p>
                  <p className="mt-0.5 text-[13px] font-mono text-ink-muted break-all">{p.error || p.orderId}</p>
                </li>
              ))}
            </ul>
            <div className="hidden sm:block mt-3 overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-[13px]">
                <thead className="bg-page text-left text-[13px] text-ink-muted">
                  <tr><th className="px-4 py-3 font-semibold">Time</th><th className="px-4 py-3 font-semibold">Amount</th><th className="px-4 py-3 font-semibold">Method</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Order / reason</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {payments.length === 0 && <tr><td colSpan={5} className="px-4 py-4 text-ink-muted">No payments yet.</td></tr>}
                  {payments.map((p, index) => (
                    <tr key={`${p.orderId}-${index}`} className="hover:bg-page">
                      <td className="px-4 py-3 whitespace-nowrap text-ink-muted">{new Date(p.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className="px-4 py-3 font-semibold text-ink tabular-nums">₹{p.amount.toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3 text-ink-muted">{p.method}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${p.status === 'captured' ? 'bg-ok-tint border-ok-line text-ok' : p.status === 'failed' ? 'bg-danger-tint border-danger-line text-danger' : 'bg-page border-line text-ink-muted'}`}>{p.status}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[13px] text-ink-muted">{p.error || p.orderId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
