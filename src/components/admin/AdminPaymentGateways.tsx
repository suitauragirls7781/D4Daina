import React, { useEffect, useMemo, useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { CreditCard, ShieldCheck, Save, Loader2, Copy, Check, RefreshCw, KeyRound } from 'lucide-react';
import { PaymentGatewaySettings } from '../../types';

type GatewayView = {
  razorpay: {
    enabled: boolean; configured: boolean; mode: 'test' | 'live'; source: 'admin' | 'env';
    keyId: string; secretSet: boolean; secretHint: string; webhookSecretSet: boolean; webhookSecretHint: string;
  };
  payu: { enabled: boolean; mode: 'test' | 'live'; merchantKey: string; saltSet: boolean; saltHint: string };
  urls: { success: string; failure: string; webhook: string; razorpayWebhook: string };
};

type RazorpayPayment = { at: string; status: string; method: string; amount: number; orderId: string; error: string };

const card = 'rounded-3xl border border-[#4B1D3F]/10 bg-white p-5 sm:p-6 space-y-4';
const label = 'block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 mb-1.5 pl-1';
const input = 'w-full h-11 rounded-full border border-[#4B1D3F]/15 px-4 text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/35 outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition';

const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }> = ({ checked, onChange, label: aria, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={aria}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${checked ? 'bg-emerald-600' : 'bg-[#2A1A26]/20'}`}
  >
    <span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
  </button>
);

const CopyField: React.FC<{ title: string; value: string }> = ({ title, value }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <span className={label}>{title}</span>
      <div className="flex gap-2">
        <input readOnly value={value} className={`${input} bg-[#FBF7F3] font-mono text-xs`} />
        <button
          type="button"
          onClick={() => { navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
          className="h-11 w-11 shrink-0 rounded-full border border-[#4B1D3F]/20 flex items-center justify-center text-[#4B1D3F] hover:bg-[#F3EEF8] cursor-pointer"
          aria-label={`Copy ${title}`}
        >
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
};

/** Admin → Settings → Payments: gateway switches (Razorpay, PayU), PayU credentials, payment channels and logs. */
export const AdminPaymentGateways: React.FC = () => {
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
        <div className="rounded-3xl bg-[#4B1D3F] p-5 sm:p-7 text-white">
          <h3 className="font-serif text-2xl sm:text-3xl font-semibold flex items-center gap-2.5"><CreditCard className="h-5 w-5" /> Payment gateways</h3>
          <p className="text-sm text-white/75 mt-1.5 max-w-xl leading-relaxed">Prepaid only. Switch a gateway on or off here; checkout follows within about 20 seconds.</p>
        </div>
        {loadError ? (
          <div role="alert" className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-rose-700">
            <p className="font-semibold">{loadError}</p>
            <p className="mt-1 text-[13px] text-rose-700/85">Checkout keeps using the gateway settings already saved; nothing has changed.</p>
            <button type="button" onClick={loadGateways} className="mt-3 h-10 px-4 rounded-full bg-white border border-rose-200 text-sm font-semibold text-rose-700 inline-flex items-center gap-2 hover:bg-rose-100 cursor-pointer">
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-[#4B1D3F]/10 p-5 flex items-center gap-3 text-[#2A1A26]/70" role="status" aria-busy="true">
            <Loader2 className="w-5 h-5 animate-spin text-[#4B1D3F]" /> Loading payment settings…
          </div>
        )}
      </div>
    );
  }

  const activeCount = Number(view.razorpay.enabled && view.razorpay.configured) + Number(view.payu.enabled);

  return (
    <div className="space-y-5 text-sm">
      <div className="rounded-3xl bg-[#4B1D3F] p-5 sm:p-7 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-2xl sm:text-3xl font-semibold flex items-center gap-2.5"><CreditCard className="h-5 w-5" /> Payment gateways</h3>
          <p className="text-sm text-white/75 mt-1.5 max-w-xl leading-relaxed">Prepaid only. Switch a gateway on or off here; checkout follows within about 20 seconds, no release needed.</p>
        </div>
        <span className={`self-start rounded-full px-3 py-1 text-xs font-semibold ${activeCount ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>
          {activeCount ? `${activeCount} gateway${activeCount > 1 ? 's' : ''} live at checkout` : 'No gateway on — customers cannot pay'}
        </span>
      </div>

      {/* Razorpay */}
      <div className={card}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="font-serif text-2xl font-semibold text-[#4B1D3F]">Razorpay</h4>
            <p className="text-xs text-[#2A1A26]/60 mt-0.5">
              {!view.razorpay.configured
                ? 'No keys yet — add them below.'
                : `${view.razorpay.mode === 'live' ? 'Live' : 'Test'} keys in use (${view.razorpay.keyId}) · ${view.razorpay.source === 'admin' ? 'saved here' : 'from Vercel settings'}${view.razorpay.mode === 'test' ? ' · test mode is shown only to you, not to customers' : ''}.`}
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
          className="space-y-3 rounded-2xl bg-[#FBF7F3] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveGateways('razorpay', { razorpay: { keyId: rzp.keyId, ...(rzp.keySecret ? { keySecret: rzp.keySecret } : {}), ...(rzp.webhookSecret ? { webhookSecret: rzp.webhookSecret } : {}) } });
          }}
        >
          <p className="text-xs text-[#2A1A26]/70">
            Razorpay Dashboard → Account &amp; Settings → API Keys. A <strong>rzp_test_</strong> key runs test mode (only you see it at checkout); a <strong>rzp_live_</strong> key takes real payments. Keys are checked with Razorpay before saving.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="rzp-key">Key ID</label>
              <input id="rzp-key" value={rzp.keyId} onChange={(e) => setRzp({ ...rzp, keyId: e.target.value.trim() })} autoComplete="off" className={`${input} font-mono bg-white`}
                placeholder={view.razorpay.source === 'env' && view.razorpay.keyId ? `${view.razorpay.keyId} (from Vercel)` : 'rzp_live_… or rzp_test_…'} />
            </div>
            <div>
              <label className={label} htmlFor="rzp-secret">Key Secret</label>
              <input id="rzp-secret" type="password" value={rzp.keySecret} onChange={(e) => setRzp({ ...rzp, keySecret: e.target.value.trim() })} autoComplete="new-password" className={`${input} font-mono bg-white`}
                placeholder={view.razorpay.source === 'admin' && view.razorpay.secretSet ? `Saved (${view.razorpay.secretHint}) — leave empty to keep` : 'Paste the key secret'} />
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="rzp-webhook">Webhook secret (optional, recommended)</label>
              <input id="rzp-webhook" type="password" value={rzp.webhookSecret} onChange={(e) => setRzp({ ...rzp, webhookSecret: e.target.value.trim() })} autoComplete="new-password" className={`${input} font-mono bg-white`}
                placeholder={view.razorpay.webhookSecretSet ? `Saved (${view.razorpay.webhookSecretHint}) — leave empty to keep` : 'The secret you typed when creating the webhook in Razorpay'} />
            </div>
          </div>
          <CopyField title="Razorpay webhook URL (events: payment.captured, order.paid)" value={view.urls.razorpayWebhook} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving !== '' || !rzp.keyId} className="h-10 px-5 rounded-full bg-[#4B1D3F] hover:bg-[#3B1532] transition-colors text-white text-[13px] font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50">
              {saving === 'razorpay' ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Check &amp; save keys
            </button>
            {view.razorpay.source === 'admin' && (
              <button type="button" disabled={saving !== ''}
                onClick={() => { if (window.confirm('Remove the keys saved here and go back to the keys in Vercel settings?')) saveGateways('razorpay', { razorpay: { clearKeys: true } }); }}
                className="h-10 px-5 rounded-full border border-[#4B1D3F]/20 text-[#4B1D3F] text-[13px] font-semibold cursor-pointer hover:bg-white disabled:opacity-50">
                Use Vercel keys instead
              </button>
            )}
          </div>
          <p className="text-[11px] text-[#2A1A26]/55 flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Secrets stay on the server only and are never shown again or sent to customers.</p>
        </form>

        <div>
          <span className={label}>Methods shown in the Razorpay window</span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {([['enableUpi', 'UPI (GPay, PhonePe, Paytm)'], ['enableCards', 'Debit & credit cards'], ['enableNetBanking', 'Net banking & wallets']] as const).map(([key, text]) => (
              <label key={key} className="flex items-center gap-2 rounded-2xl bg-[#FBF7F3] border border-[#4B1D3F]/[0.08] px-4 py-3 cursor-pointer hover:border-[#4B1D3F]/25 transition-colors">
                <input type="checkbox" checked={Boolean(channels[key])} onChange={(e) => setChannels({ ...channels, [key]: e.target.checked })} className="h-4 w-4 accent-[#4B1D3F]" />
                <span className="text-[#2A1A26]">{text}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-[#2A1A26]/55 mt-2">If all three are off, every method is shown (so customers can always pay).</p>
          <button type="button" onClick={saveChannels} disabled={saving !== ''} className="mt-3 h-10 px-5 rounded-full bg-[#4B1D3F] hover:bg-[#3B1532] transition-colors text-white text-[13px] font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60">
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
            <h4 className="font-serif text-2xl font-semibold text-[#4B1D3F]">PayU</h4>
            <p className="text-xs text-[#2A1A26]/60 mt-0.5">
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

        <div className="inline-flex rounded-full bg-[#F3EEF8] p-1">
          {(['test', 'live'] as const).map((mode) => (
            <button key={mode} type="button" onClick={() => setPayu({ ...payu, mode })}
              className={`rounded-full px-4 py-2 text-xs font-semibold cursor-pointer ${payu.mode === mode ? 'bg-[#4B1D3F] text-white' : 'text-[#4B1D3F]'}`}>
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
            <p className="text-[11px] text-[#2A1A26]/55 mt-1 flex items-center gap-1"><KeyRound className="h-3 w-3" /> Stored on the server only; never shown again or sent to customers.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <CopyField title="Success URL (surl)" value={view.urls.success} />
          <CopyField title="Failure URL (furl)" value={view.urls.failure} />
          <CopyField title="Webhook URL (PayU Dashboard → Webhooks: Successful & Failed)" value={view.urls.webhook} />
        </div>
        <p className="text-xs text-[#2A1A26]/60 flex items-start gap-1.5">
          <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0" />
          Every PayU payment is checked with PayU's verify API (status and amount) before the order is marked paid. A repeated callback never creates a second order.
        </p>

        <button type="submit" disabled={saving !== ''} className="h-11 px-6 rounded-full bg-[#4B1D3F] hover:bg-[#3B1532] transition-colors text-white text-[13px] font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60">
          {saving === 'payu' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save PayU settings
        </button>
      </form>

      {/* Payment status & logs */}
      <div className={card}>
        <h4 className="font-serif text-2xl font-semibold text-[#4B1D3F]">Payment status</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {([['Paid', summary.Paid, 'text-emerald-700'], ['Awaiting payment', summary.Unpaid, 'text-[#9C7A45]'], ['Refunded', summary.Refunded, 'text-[#8A2E55]'], ['Cancelled', summary.Cancelled, 'text-[#2A1A26]/70']] as const).map(([name, value, tone]) => (
            <div key={name} className="rounded-2xl bg-[#FBF7F3] border border-[#4B1D3F]/[0.08] p-4">
              <p className="text-[11px] uppercase tracking-wider text-[#2A1A26]/55">{name}</p>
              <p className={`mt-1 font-serif text-3xl font-semibold tabular-nums ${tone}`}>{value}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-[#2A1A26]/55">From the orders loaded in this admin panel · Razorpay {summary.razorpay} · PayU {summary.payu}</p>

        {recentPayu.length > 0 && (
          <div>
            <span className={label}>Latest PayU orders</span>
            <div className="divide-y divide-[#4B1D3F]/10 rounded-2xl border border-[#4B1D3F]/10">
              {recentPayu.map((order) => (
                <div key={order.orderNumber} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                  <span className="font-mono">{order.orderNumber}</span>
                  <span>₹{Number(order.finalTotal || 0).toLocaleString('en-IN')}</span>
                  <span className={order.paymentStatus === 'Paid' ? 'text-emerald-700 font-semibold' : 'text-[#9C7A45]'}>{order.paymentStatus}</span>
                  <span className="font-mono text-[#2A1A26]/60">{(order as any).paymentRef || (order as any).payuTxnId || ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <button type="button" onClick={loadPayments} disabled={loadingPayments} className="h-10 px-5 rounded-full border border-[#4B1D3F]/20 text-[#4B1D3F] text-[13px] font-semibold inline-flex items-center gap-2 hover:bg-[#F3EEF8] cursor-pointer disabled:opacity-60">
            {loadingPayments ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Latest Razorpay payments
          </button>
          {payments && (
            <>
            {/* Phone: stacked rows */}
            <ul className="sm:hidden mt-3 rounded-2xl border border-[#4B1D3F]/10 divide-y divide-[#4B1D3F]/[0.08]">
              {payments.length === 0 && <li className="px-4 py-3 text-[#2A1A26]/60">No payments yet.</li>}
              {payments.map((p, index) => (
                <li key={`${p.orderId}-${index}`} className="px-4 py-3 text-[13px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#2A1A26] tabular-nums">₹{p.amount.toLocaleString('en-IN')}</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${p.status === 'captured' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : p.status === 'failed' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-[#FBF7F3] border-[#C5A46D]/60 text-[#2A1A26]/80'}`}>{p.status}</span>
                  </div>
                  <p className="mt-1 text-[12px] text-[#2A1A26]/60">{new Date(p.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })} · {p.method}</p>
                  <p className="mt-0.5 text-[12px] font-mono text-[#2A1A26]/70 break-all">{p.error || p.orderId}</p>
                </li>
              ))}
            </ul>
            <div className="hidden sm:block mt-3 overflow-x-auto rounded-2xl border border-[#4B1D3F]/10">
              <table className="w-full text-[13px]">
                <thead className="bg-[#FBF7F3] text-left text-[11px] uppercase tracking-[0.12em] text-[#2A1A26]/55">
                  <tr><th className="px-4 py-3 font-semibold">Time</th><th className="px-4 py-3 font-semibold">Amount</th><th className="px-4 py-3 font-semibold">Method</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Order / reason</th></tr>
                </thead>
                <tbody className="divide-y divide-[#4B1D3F]/[0.08]">
                  {payments.length === 0 && <tr><td colSpan={5} className="px-4 py-4 text-[#2A1A26]/60">No payments yet.</td></tr>}
                  {payments.map((p, index) => (
                    <tr key={`${p.orderId}-${index}`} className="hover:bg-[#FBF7F3]">
                      <td className="px-4 py-3 whitespace-nowrap text-[#2A1A26]/75">{new Date(p.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className="px-4 py-3 font-semibold text-[#2A1A26] tabular-nums">₹{p.amount.toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3 text-[#2A1A26]/75">{p.method}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${p.status === 'captured' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : p.status === 'failed' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-[#FBF7F3] border-[#C5A46D]/60 text-[#2A1A26]/80'}`}>{p.status}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[12px] text-[#2A1A26]/70">{p.error || p.orderId}</td>
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
