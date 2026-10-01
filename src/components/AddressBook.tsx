import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Briefcase, Check, ChevronDown, Loader2, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { HomeIcon, PinIcon } from './StoreIcons';
import { useAuth } from '../context/AuthContext';
import { useShop } from '../context/ShopContext';
import { useDialogA11y } from './OrderInvoice';
import { MapPinPicker } from './MapPinPicker';
import {
  AddressSyncError,
  AddressType,
  INDIAN_STATES,
  PlaceResult,
  SavedAddress,
  deleteAddress,
  formatAddressLine,
  listAddresses,
  lookupPincode,
  saveAddress,
  setAddressBookOwner,
  setDefaultAddress,
  subscribeAddressBook,
  syncAddressBook,
} from '../lib/addressBook';

const fieldClass = 'w-full h-12 px-4 bg-white border rounded-full text-sm text-[#2A1A26] transition focus:outline-none focus:ring-4 focus:ring-[#F3EEF8] placeholder:text-[#2A1A26]/40';
const labelClass = 'block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65 pl-1';
const actionClass = 'inline-flex items-center justify-center gap-1.5 min-h-10 px-3 rounded-full text-[13px] font-semibold text-[#4B1D3F] hover:bg-[#F3EEF8] transition-colors cursor-pointer disabled:opacity-50';

/** Home / Work / Other mark; `mono` draws it in the text colour (for plum chips). */
const TypeIcon: React.FC<{ type: AddressType; className: string; mono?: boolean }> = ({ type, className, mono = false }) => {
  if (type === 'Work') return <Briefcase className={`${className} ${mono ? 'text-current' : 'text-[#4B1D3F]'}`} aria-hidden="true" />;
  const Icon = type === 'Other' ? PinIcon : HomeIcon;
  return <Icon className={className} mono={mono} live={false} />;
};

type OptionalText ='altMobile' | 'landmark' | 'tehsil' | 'district';
type Draft = Omit<SavedAddress, 'id' | OptionalText> & { id?: string } & Record<OptionalText, string>;
type Errors = Partial<Record<keyof Draft, string>>;

const emptyDraft = (fullName = ''): Draft => ({
  fullName, mobile: '', altMobile: '', houseFlat: '', street: '', area: '', landmark: '', city: '', tehsil: '', district: '', state: '', pincode: '', type: 'Home', isDefault: false,
});

const matchState = (name: string) => INDIAN_STATES.find((s) => s.toLowerCase() === name.trim().toLowerCase()) || '';

/** Field order on the form, so the first invalid field gets focus. */
const FIELD_ORDER: (keyof Draft)[] = ['fullName', 'mobile', 'altMobile', 'houseFlat', 'area', 'street', 'landmark', 'city', 'tehsil', 'district', 'state', 'pincode'];

const validate = (d: Draft): Errors => {
  const e: Errors = {};
  if (d.fullName.trim().length < 2) e.fullName = 'Enter the full name of the person receiving the order.';
  if (!/^[6-9]\d{9}$/.test(d.mobile)) e.mobile = 'Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9.';
  if (d.altMobile && !/^[6-9]\d{9}$/.test(d.altMobile)) e.altMobile = 'Alternate mobile must be a valid 10-digit number starting with 6, 7, 8 or 9.';
  else if (d.altMobile && d.altMobile === d.mobile) e.altMobile = 'Use a different number from the main mobile.';
  if (d.houseFlat.trim().length < 2) e.houseFlat = 'Enter your flat, house number or building.';
  if (d.city.trim().length < 2) e.city = 'Enter the village, town or city.';
  if (!matchState(d.state)) e.state = 'Select the state.';
  if (!/^[1-9]\d{5}$/.test(d.pincode)) e.pincode = 'Enter a valid PIN code';
  return e;
};

/** Step 1 (search / current location) and step 2 (details) for adding or editing an address. */
const AddressSheet: React.FC<{
  initial: SavedAddress | null;
  defaultName: string;
  firstAddress: boolean;
  onClose: () => void;
  onSaved: (address: SavedAddress) => void;
}> = ({ initial, defaultName, firstAddress, onClose, onSaved }) => {
  const { showToast } = useShop();
  const panelRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<'location' | 'details'>(initial ? 'details' : 'location');
  const [draft, setDraft] = useState<Draft>(() => initial
    ? { ...initial, altMobile: initial.altMobile || '', landmark: initial.landmark || '', tehsil: initial.tehsil || '', district: initial.district || '', state: matchState(initial.state) || initial.state }
    : { ...emptyDraft(defaultName), isDefault: firstAddress });
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinNote, setPinNote] = useState('');
  /** A PIN India Post reported as not existing. */
  const [badPin, setBadPin] = useState('');
  const pinRequest = useRef(0);

  const close = () => { if (!saving) onClose(); };
  useDialogA11y(panelRef, close);

  /** Fills city / tehsil / district / state from India Post. Only fills empty fields unless `overwrite`. */
  const fillFromPin = async (pin: string, overwrite: boolean) => {
    const request = ++pinRequest.current;
    setPinLoading(true);
    setPinNote('');
    const found = await lookupPincode(pin);
    if (request !== pinRequest.current) return;
    setPinLoading(false);
    if (!found) {
      setPinNote('We could not check this PIN code right now. Please fill in the details yourself.');
      return;
    }
    if (!found.valid) {
      setBadPin(pin);
      setErrors((e) => ({ ...e, pincode: 'Enter a valid PIN code' }));
      return;
    }
    setBadPin('');
    const pick = (current: string, next: string) => (next && (overwrite || !current.trim()) ? next : current);
    setDraft((d) => ({
      ...d,
      city: pick(d.city, found.city),
      tehsil: pick(d.tehsil, found.tehsil),
      district: pick(d.district, found.district),
      state: pick(matchState(d.state), matchState(found.state)) || d.state,
    }));
    setErrors((e) => ({ ...e, pincode: undefined, city: undefined, state: undefined }));
  };

  const confirmPlace = (place: PlaceResult) => {
    setDraft((d) => ({
      ...d,
      houseFlat: place.houseFlat || d.houseFlat,
      street: place.street || d.street,
      area: place.area || d.area,
      city: place.city || d.city,
      district: place.district || d.district,
      state: matchState(place.state) || d.state,
      pincode: /^[1-9]\d{5}$/.test(place.pincode) ? place.pincode : d.pincode,
    }));
    setErrors({});
    setStep('details');
    // Tehsil (and a missing district) come from India Post for the detected PIN
    if (/^[1-9]\d{5}$/.test(place.pincode)) fillFromPin(place.pincode, false);
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const onPincode = (value: string) => {
    const pin = value.replace(/\D/g, '').slice(0, 6);
    set('pincode', pin);
    setPinNote('');
    if (pin.length !== 6) { pinRequest.current += 1; setPinLoading(false); return; }
    if (!/^[1-9]\d{5}$/.test(pin)) { setErrors((e) => ({ ...e, pincode: 'Enter a valid PIN code' })); return; }
    fillFromPin(pin, true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate(draft);
    if (!found.pincode && badPin && badPin === draft.pincode) found.pincode = 'Enter a valid PIN code';
    setErrors(found);
    const first = FIELD_ORDER.find((key) => found[key]);
    if (first) {
      panelRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setSaving(true);
    try {
      const saved = await saveAddress({
        ...draft,
        state: matchState(draft.state),
        altMobile: draft.altMobile || undefined,
        // Cards print "Near {landmark}", so a typed "near ..." is not doubled
        landmark: draft.landmark.trim().replace(/^near\s+/i, '') || undefined,
        tehsil: draft.tehsil.trim() || undefined,
        district: draft.district.trim() || undefined,
      });
      showToast(initial ? 'Address updated.' : 'Address saved.', 'success');
      onSaved(saved);
    } catch (err: any) {
      // The list is already saved in this browser; only the upload to the account failed
      if (err instanceof AddressSyncError) {
        showToast(err.message, 'info');
        onClose();
      } else {
        showToast(err?.message || 'Could not save the address. Please try again.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const input = (name: keyof Draft, label: string, props: React.InputHTMLAttributes<HTMLInputElement> & { required?: boolean } = {}, span = '') => {
    const error = errors[name];
    const { required, ...rest } = props;
    return (
      <label className={`block space-y-1.5 ${span}`}>
        <span className={labelClass}>{label}{required ? ' *' : ''}</span>
        <input
          name={name}
          value={String(draft[name] ?? '')}
          onChange={(e) => set(name, e.target.value as never)}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `adr-err-${name}` : undefined}
          className={`${fieldClass} ${error ? 'border-rose-300 focus:border-rose-400' : 'border-[#4B1D3F]/20 focus:border-[#4B1D3F]/60'}`}
          {...rest}
        />
        {error && <span id={`adr-err-${name}`} className="block text-xs text-rose-700 pl-1">{error}</span>}
      </label>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-[#2A1A26]/50 flex items-end sm:items-center justify-center sm:p-4 sag-fade" onClick={close}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="address-sheet-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-[#FBF7F3] w-full sm:max-w-xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl shadow-[var(--sag-shadow)] animate-in fade-in slide-in-from-bottom-5"
      >
        <span className="sm:hidden mx-auto mt-2.5 h-1 w-10 rounded-full bg-[#4B1D3F]/15" aria-hidden="true" />
        <div className="px-5 sm:px-6 pt-3 sm:pt-5 pb-4 border-b border-[#4B1D3F]/10 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {step === 'details' && (
                <button type="button" onClick={() => setStep('location')} aria-label="Back to location" className="w-10 h-10 -ml-2 shrink-0 rounded-full hover:bg-[#F3EEF8] flex items-center justify-center text-[#4B1D3F] cursor-pointer">
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9C7A45]">Step {step === 'location' ? '1' : '2'} of 2</p>
                <h2 id="address-sheet-title" className="font-serif text-2xl text-[#4B1D3F] leading-tight">
                  {step === 'location' ? 'Find your location' : initial ? 'Edit address' : 'Address details'}
                </h2>
              </div>
            </div>
            <button type="button" onClick={close} aria-label="Close" className="w-10 h-10 shrink-0 rounded-full hover:bg-[#F3EEF8] flex items-center justify-center text-[#4B1D3F] cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5" aria-hidden="true">
            <span className="h-1 rounded-full bg-[#4B1D3F]" />
            <span className={`h-1 rounded-full transition-colors ${step === 'details' ? 'bg-[#4B1D3F]' : 'bg-[#E6DDF0]'}`} />
          </div>
        </div>

        {step === 'location' ? (
          <div className="px-5 sm:px-6 py-5 overflow-y-auto overscroll-contain">
            <MapPinPicker onConfirm={confirmPlace} onManual={() => setStep('details')} />
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 py-5 grid gap-4 sm:grid-cols-2 content-start">
            <p className="sm:col-span-2 font-serif text-lg text-[#4B1D3F] -mb-1">Contact details</p>
            {input('fullName', 'Full name', { required: true, autoComplete: 'name', maxLength: 80 }, 'sm:col-span-2')}
            {input('mobile', 'Mobile number', { required: true, type: 'tel', inputMode: 'numeric', autoComplete: 'tel-national', maxLength: 10, placeholder: '10-digit mobile', onChange: (e) => set('mobile', e.target.value.replace(/\D/g, '').slice(0, 10)) })}
            {input('altMobile', 'Alternate mobile', { type: 'tel', inputMode: 'numeric', maxLength: 10, placeholder: 'Optional', onChange: (e) => set('altMobile', e.target.value.replace(/\D/g, '').slice(0, 10)) })}
            <p className="sm:col-span-2 font-serif text-lg text-[#4B1D3F] -mb-1 pt-3 mt-1 border-t border-[#4B1D3F]/8">Address</p>
            {input('houseFlat', 'Flat / house / building', { required: true, autoComplete: 'address-line1', maxLength: 200 }, 'sm:col-span-2')}
            {input('area', 'Area / sector / locality', { autoComplete: 'address-line2', maxLength: 120, placeholder: 'Optional' })}
            {input('street', 'Street / road', { maxLength: 200, placeholder: 'Optional' })}
            {input('landmark', 'Landmark', { maxLength: 120, placeholder: 'Optional, e.g. City Hospital' }, 'sm:col-span-2')}
            <label className="block space-y-1.5">
              <span className={labelClass}>PIN code *</span>
              <span className="relative block">
                <input
                  name="pincode"
                  value={draft.pincode}
                  onChange={(e) => onPincode(e.target.value)}
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="postal-code"
                  placeholder="6-digit PIN"
                  aria-invalid={Boolean(errors.pincode) || undefined}
                  aria-describedby={errors.pincode ? 'adr-err-pincode' : pinNote ? 'adr-note-pincode' : undefined}
                  className={`${fieldClass} ${errors.pincode ? 'border-rose-300 focus:border-rose-400' : 'border-[#4B1D3F]/20 focus:border-[#4B1D3F]/60'}`}
                />
                {pinLoading && <Loader2 className="w-4 h-4 animate-spin text-[#4B1D3F] absolute right-4 top-1/2 -translate-y-1/2" aria-label="Checking PIN code" />}
              </span>
              {errors.pincode
                ? <span id="adr-err-pincode" className="block text-xs text-rose-700 pl-1">{errors.pincode}</span>
                : pinNote && <span id="adr-note-pincode" className="block text-xs text-[#2A1A26]/60 pl-1">{pinNote}</span>}
            </label>
            {input('city', 'Village / town / city', { required: true, autoComplete: 'address-level2', maxLength: 80 })}
            {input('tehsil', 'Tehsil', { maxLength: 80, placeholder: 'Optional' })}
            {input('district', 'District', { maxLength: 80, placeholder: 'Optional' })}
            <label className="block space-y-1.5 sm:col-span-2">
              <span className={labelClass}>State *</span>
              <span className="relative block">
              <select
                name="state"
                value={matchState(draft.state)}
                onChange={(e) => set('state', e.target.value)}
                autoComplete="address-level1"
                aria-invalid={Boolean(errors.state) || undefined}
                aria-describedby={errors.state ? 'adr-err-state' : undefined}
                className={`${fieldClass} appearance-none cursor-pointer ${errors.state ? 'border-rose-300 focus:border-rose-400' : 'border-[#4B1D3F]/20 focus:border-[#4B1D3F]/60'}`}
              >
                <option value="">Select state</option>
                {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 text-[#4B1D3F]/60 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              </span>
              {errors.state && <span id="adr-err-state" className="block text-xs text-rose-700 pl-1">{errors.state}</span>}
            </label>

            <fieldset className="sm:col-span-2 space-y-1.5">
              <legend className={labelClass}>Address type</legend>
              <div className="flex flex-wrap gap-2 pt-1">
                {(['Home', 'Work', 'Other'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={draft.type === t}
                    onClick={() => set('type', t)}
                    className={`inline-flex items-center gap-2 h-11 pl-4 pr-5 rounded-full border text-sm font-medium cursor-pointer transition-colors ${draft.type === t ? 'bg-[#4B1D3F] border-[#4B1D3F] text-white' : 'bg-white border-[#4B1D3F]/20 text-[#2A1A26]/80 hover:bg-[#F3EEF8]'}`}
                  >
                    <TypeIcon type={t} className="w-[18px] h-[18px]" mono={draft.type === t} /> {t}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="sm:col-span-2 flex items-center gap-3 min-h-12 px-4 py-2.5 rounded-2xl border border-[#4B1D3F]/12 bg-white text-sm text-[#2A1A26]/85 cursor-pointer has-[:disabled]:opacity-70 has-[:disabled]:cursor-default">
              <input type="checkbox" checked={draft.isDefault} disabled={firstAddress || Boolean(initial?.isDefault)} onChange={(e) => set('isDefault', e.target.checked)} className="w-5 h-5 shrink-0 accent-[#4B1D3F]" />
              <span className="min-w-0">
                <span className="block font-medium text-[#2A1A26]">Make this my default address</span>
                <span className="block text-[13px] text-[#2A1A26]/60">Used first at checkout</span>
              </span>
            </label>
          </div>

            <div className="grid grid-cols-2 gap-2 px-5 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-5 border-t border-[#4B1D3F]/10 bg-[#FBF7F3] sm:rounded-b-3xl">
              <button type="button" onClick={close} disabled={saving} className="sag-btn-outline h-12 px-4 text-xs font-semibold uppercase tracking-[0.12em] cursor-pointer disabled:opacity-60">Cancel</button>
              <button type="submit" disabled={saving} className="sag-btn-primary h-12 px-4 text-xs font-semibold uppercase tracking-[0.12em] inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
                {saving && <Loader2 className="w-4 h-4 animate-spin text-current" />}
                {saving ? 'Saving…' : 'Save address'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
};

/**
 * Saved addresses with add / edit / delete / set default. Pass onSelect (and selectedId) to let the customer
 * pick one, e.g. at checkout.
 */
export const AddressBook: React.FC<{
  onSelect?: (address: SavedAddress) => void;
  selectedId?: string;
  /** Called with the full list after it loads or changes. */
  onChange?: (addresses: SavedAddress[]) => void;
  /** Profile document already read by the page (saves a read). */
  profile?: Record<string, any> | null;
}> = ({ onSelect, selectedId, onChange, profile }) => {
  const { user } = useAuth();
  const { showToast } = useShop();
  const [addresses, setAddresses] = useState<SavedAddress[]>(() => { setAddressBookOwner(user?.email || null, true); return listAddresses(); });
  const [loading, setLoading] = useState(Boolean(user?.email));
  const [sheet, setSheet] = useState<{ editing: SavedAddress | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState('');
  const [busy, setBusy] = useState('');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => subscribeAddressBook(() => setAddresses(listAddresses())), []);
  useEffect(() => { onChangeRef.current?.(addresses); }, [addresses]);

  useEffect(() => {
    setAddressBookOwner(user?.email || null);
    setAddresses(listAddresses());
    if (!user?.email) { setLoading(false); return; }
    setLoading(true);
    syncAddressBook(user.email, profile)
      .catch((err) => console.warn('Could not load saved addresses:', err))
      .finally(() => { setAddresses(listAddresses()); setLoading(false); });
    // profile is only a first-read shortcut
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  const run = async (id: string, task: () => Promise<void>, done: string) => {
    setBusy(id);
    try {
      await task();
      showToast(done, 'success');
    } catch (err) {
      console.warn('Address book sync failed:', err);
      showToast('Saved on this device. We could not sync it to your account right now.', 'info');
    } finally {
      setBusy('');
      setConfirmDelete('');
    }
  };

  return (
    <section className="space-y-4" aria-label="Saved addresses">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-2xl sm:text-[28px] leading-tight text-[#4B1D3F]">Saved addresses</h2>
          <p className="mt-1 text-sm text-[#2A1A26]/70">Your default address fills in checkout automatically.</p>
        </div>
        <button type="button" onClick={() => setSheet({ editing: null })} className="sag-btn-primary w-full sm:w-auto h-11 px-5 text-xs font-semibold uppercase tracking-[0.12em] inline-flex items-center justify-center gap-2 cursor-pointer">
          <Plus className="w-4 h-4 text-current" /> Add new address
        </button>
      </div>

      {loading && addresses.length === 0 ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#9C7A45]" /></div>
      ) : addresses.length === 0 ? (
        <div className="sag-card py-12 px-5 text-center">
          <span className="w-16 h-16 mx-auto rounded-full bg-[#F3EEF8] ring-1 ring-[#4B1D3F]/8 flex items-center justify-center"><PinIcon className="w-8 h-8" /></span>
          <p className="mt-4 font-serif text-2xl text-[#2A1A26]">No saved addresses yet</p>
          <p className="mt-1.5 text-sm text-[#2A1A26]/70">Add your home or work address to check out faster.</p>
          <button type="button" onClick={() => setSheet({ editing: null })} className="mt-5 sag-btn-outline h-11 px-6 text-xs font-semibold uppercase tracking-[0.12em] cursor-pointer">Add address</button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {addresses.map((a) => {
            const selected = Boolean(onSelect) && selectedId === a.id;
            return (
              <li key={a.id} className={`sag-card p-4 sm:p-5 flex flex-col gap-3 ${selected ? 'ring-2 ring-[#4B1D3F]' : ''}`}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F3EEF8] pl-2 pr-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#4B1D3F]">
                    <TypeIcon type={a.type} className="w-4 h-4" /> {a.type}
                  </span>
                  {a.isDefault && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-800">
                      <Check className="w-3 h-3" aria-hidden="true" /> Default
                    </span>
                  )}
                </div>
                <div className="text-sm text-[#2A1A26]/75 leading-relaxed min-w-0">
                  <p className="font-semibold text-base text-[#2A1A26]">{a.fullName}</p>
                  <p className="break-words">{formatAddressLine(a)}</p>
                  <p className="mt-1 text-[13px] text-[#2A1A26]/65">Mobile {a.mobile}{a.altMobile ? ` · Alt ${a.altMobile}` : ''}</p>
                </div>
                {confirmDelete === a.id ? (
                  <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3 space-y-2" role="alert">
                    <p className="text-sm text-rose-700">Delete this address?</p>
                    <div className="flex gap-2">
                      <button type="button" disabled={busy === a.id} onClick={() => run(a.id, () => deleteAddress(a.id), 'Address deleted.')} className="h-10 px-4 rounded-full bg-rose-700 text-white text-xs font-semibold uppercase tracking-[0.1em] inline-flex items-center gap-2 cursor-pointer disabled:opacity-60">
                        {busy === a.id && <Loader2 className="w-4 h-4 animate-spin text-current" />} Delete
                      </button>
                      <button type="button" onClick={() => setConfirmDelete('')} className="h-10 px-4 rounded-full border border-rose-200 bg-white text-rose-700 text-xs font-semibold uppercase tracking-[0.1em] cursor-pointer">Keep</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-auto flex flex-wrap items-center gap-1 -mx-2 pt-2 border-t border-[#4B1D3F]/8">
                    {onSelect && (
                      <button type="button" onClick={() => onSelect(a)} aria-pressed={selected} className={`${selected ? 'sag-btn-primary' : 'sag-btn-outline'} h-10 px-4 mr-1 ml-2 text-xs font-semibold uppercase tracking-[0.1em] cursor-pointer`}>
                        {selected ? 'Selected' : 'Deliver here'}
                      </button>
                    )}
                    <button type="button" onClick={() => setSheet({ editing: a })} className={actionClass}><Pencil className="w-4 h-4" /> Edit</button>
                    <button type="button" onClick={() => setConfirmDelete(a.id)} className={actionClass}><Trash2 className="w-4 h-4" /> Delete</button>
                    {!a.isDefault && (
                      <button type="button" disabled={busy === a.id} onClick={() => run(a.id, () => setDefaultAddress(a.id), 'Default address updated.')} className={actionClass}>
                        {busy === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />} Set default
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {sheet && (
        <AddressSheet
          initial={sheet.editing}
          defaultName={user?.name || ''}
          firstAddress={addresses.length === 0}
          onClose={() => setSheet(null)}
          onSaved={(saved) => { setSheet(null); if (onSelect && !sheet.editing) onSelect(saved); }}
        />
      )}
    </section>
  );
};
