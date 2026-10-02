import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, ArrowLeft, Briefcase, Check, ChevronDown, Loader2, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
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

const errorText = 'mt-1.5 flex items-start gap-1.5 text-[13px] leading-[18px] font-medium text-danger';
const helpText = 'mt-1.5 block text-[13px] leading-[18px] text-ink-muted';
const groupTitle = 'sm:col-span-2 text-base leading-[22px] font-semibold text-ink';

/** Home / Work / Other mark, drawn in the colour of the text around it. */
const TypeIcon: React.FC<{ type: AddressType; className: string; mono?: boolean }> = ({ type, className }) => {
  if (type === 'Work') return <Briefcase className={className} aria-hidden="true" />;
  const Icon = type === 'Other' ? PinIcon : HomeIcon;
  return <Icon className={className} mono live={false} />;
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

  const input = (name: keyof Draft, label: string, props: React.InputHTMLAttributes<HTMLInputElement> & { required?: boolean; optional?: boolean } = {}, span = '') => {
    const error = errors[name];
    const { required, optional, ...rest } = props;
    const id = `adr-${name}`;
    return (
      <div className={span}>
        <label htmlFor={id} className="sag-label">{label}{optional ? <span className="font-normal text-ink-muted"> (optional)</span> : null}</label>
        <input
          id={id}
          name={name}
          value={String(draft[name] ?? '')}
          onChange={(e) => set(name, e.target.value as never)}
          aria-required={required || undefined}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `adr-err-${name}` : undefined}
          enterKeyHint="next"
          className="sag-input"
          {...rest}
        />
        {error && <p id={`adr-err-${name}`} role="alert" className={errorText}><AlertCircle className="w-4 h-4 mt-px shrink-0" aria-hidden="true" />{error}</p>}
      </div>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-ink/50 flex items-end sm:items-center justify-center sm:p-4 sag-fade" onClick={close}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="address-sheet-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-white text-ink w-full sm:max-w-xl max-h-[92dvh] flex flex-col rounded-t-sheet sm:rounded-card shadow-[var(--sag-shadow-pop)] animate-in fade-in slide-in-from-bottom-5"
      >
        <span className="sm:hidden mx-auto mt-2 h-1 w-9 rounded-full bg-sunken-deep" aria-hidden="true" />
        <div className="px-2 sm:px-4 pt-2 sm:pt-4 pb-3 border-b border-line">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 min-w-0">
              {step === 'details' ? (
                <button type="button" onClick={() => setStep('location')} aria-label="Back to location" className="w-11 h-11 shrink-0 rounded-full hover:bg-sunken flex items-center justify-center text-ink cursor-pointer">
                  <ArrowLeft className="w-[22px] h-[22px]" />
                </button>
              ) : <span className="w-2 shrink-0" aria-hidden="true" />}
              <div className="min-w-0">
                <h2 id="address-sheet-title" className="text-base leading-[22px] font-semibold text-ink">
                  {step === 'location' ? 'Find your location' : initial ? 'Edit address' : 'Address details'}
                </h2>
                <p className="text-[13px] leading-[18px] text-ink-muted">Step {step === 'location' ? '1' : '2'} of 2</p>
              </div>
            </div>
            <button type="button" onClick={close} aria-label="Close" className="w-11 h-11 shrink-0 rounded-full hover:bg-sunken flex items-center justify-center text-ink cursor-pointer">
              <X className="w-[22px] h-[22px]" />
            </button>
          </div>
          <div className="mt-2 mx-2 grid grid-cols-2 gap-1" aria-hidden="true">
            <span className={`h-[3px] rounded-full ${step === 'details' ? 'bg-ink' : 'bg-brand'}`} />
            <span className={`h-[3px] rounded-full ${step === 'details' ? 'bg-brand' : 'bg-line'}`} />
          </div>
        </div>

        {step === 'location' ? (
          <div className="px-4 sm:px-6 py-4 overflow-y-auto overscroll-contain">
            <MapPinPicker onConfirm={confirmPlace} onManual={() => setStep('details')} />
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 grid gap-4 sm:grid-cols-2 content-start">
              <p className={groupTitle}>Contact</p>
              {input('fullName', 'Full name', { required: true, autoComplete: 'name', autoCapitalize: 'words', maxLength: 80 }, 'sm:col-span-2')}
              {input('mobile', 'Mobile number', { required: true, type: 'tel', inputMode: 'numeric', autoComplete: 'tel-national', maxLength: 10, placeholder: '10-digit mobile', onChange: (e) => set('mobile', e.target.value.replace(/\D/g, '').slice(0, 10)) })}
              {input('altMobile', 'Alternate mobile', { optional: true, type: 'tel', inputMode: 'numeric', maxLength: 10, onChange: (e) => set('altMobile', e.target.value.replace(/\D/g, '').slice(0, 10)) })}
              <p className={`${groupTitle} pt-4 border-t border-line`}>Address</p>
              {input('houseFlat', 'Flat / house / building', { required: true, autoComplete: 'address-line1', maxLength: 200 }, 'sm:col-span-2')}
              {input('area', 'Area / sector / locality', { optional: true, autoComplete: 'address-line2', maxLength: 120 })}
              {input('street', 'Street / road', { optional: true, maxLength: 200 })}
              {input('landmark', 'Landmark', { optional: true, maxLength: 120, placeholder: 'e.g. City Hospital' }, 'sm:col-span-2')}
              <div>
                <label htmlFor="adr-pincode" className="sag-label">PIN code</label>
                <span className="relative block">
                  <input
                    id="adr-pincode"
                    name="pincode"
                    value={draft.pincode}
                    onChange={(e) => onPincode(e.target.value)}
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="postal-code"
                    enterKeyHint="next"
                    placeholder="6-digit PIN"
                    aria-required="true"
                    aria-invalid={Boolean(errors.pincode) || undefined}
                    aria-describedby={errors.pincode ? 'adr-err-pincode' : pinNote ? 'adr-note-pincode' : undefined}
                    className="sag-input sag-num pr-11"
                  />
                  {pinLoading && <Loader2 className="w-[18px] h-[18px] animate-spin text-ink-muted absolute right-3.5 top-1/2 -translate-y-1/2" aria-label="Checking PIN code" />}
                </span>
                {errors.pincode
                  ? <p id="adr-err-pincode" role="alert" className={errorText}><AlertCircle className="w-4 h-4 mt-px shrink-0" aria-hidden="true" />{errors.pincode}</p>
                  : pinNote && <span id="adr-note-pincode" className={helpText}>{pinNote}</span>}
              </div>
              {input('city', 'Village / town / city', { required: true, autoComplete: 'address-level2', maxLength: 80 })}
              {input('tehsil', 'Tehsil', { optional: true, maxLength: 80 })}
              {input('district', 'District', { optional: true, maxLength: 80 })}
              <div className="sm:col-span-2">
                <label htmlFor="adr-state" className="sag-label">State</label>
                <span className="relative block">
                  <select
                    id="adr-state"
                    name="state"
                    value={matchState(draft.state)}
                    onChange={(e) => set('state', e.target.value)}
                    autoComplete="address-level1"
                    aria-required="true"
                    aria-invalid={Boolean(errors.state) || undefined}
                    aria-describedby={errors.state ? 'adr-err-state' : undefined}
                    className="sag-input appearance-none pr-10 cursor-pointer"
                  >
                    <option value="">Select state</option>
                    {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown className="w-[18px] h-[18px] text-ink-muted absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                </span>
                {errors.state && <p id="adr-err-state" role="alert" className={errorText}><AlertCircle className="w-4 h-4 mt-px shrink-0" aria-hidden="true" />{errors.state}</p>}
              </div>

              <fieldset className="sm:col-span-2">
                <legend className="sag-label">Address type</legend>
                <div className="flex flex-wrap gap-2">
                  {(['Home', 'Work', 'Other'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={draft.type === t}
                      onClick={() => set('type', t)}
                      className="sag-chip h-11 gap-2 text-sm"
                    >
                      <TypeIcon type={t} className="w-[18px] h-[18px]" /> {t}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="sm:col-span-2 flex items-center gap-3 min-h-11 text-sm leading-5 text-ink cursor-pointer has-[:disabled]:cursor-default">
                <input type="checkbox" checked={draft.isDefault} disabled={firstAddress || Boolean(initial?.isDefault)} onChange={(e) => set('isDefault', e.target.checked)} className="w-[22px] h-[22px] shrink-0 rounded-badge accent-brand" />
                <span className="min-w-0">
                  <span className="block font-semibold">Make this my default address</span>
                  <span className="block text-[13px] leading-[18px] text-ink-muted">Used first at checkout</span>
                </span>
              </label>
            </div>

            <div className="grid grid-cols-[auto_1fr] sm:grid-cols-2 gap-2 px-4 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-line">
              <button type="button" onClick={close} disabled={saving} className="sag-btn-outline h-12 px-5 text-[15px]">Cancel</button>
              <button type="submit" disabled={saving} className="sag-btn-primary h-12 px-4 gap-2 text-[15px]">
                {saving && <Loader2 className="w-[18px] h-[18px] animate-spin" aria-hidden="true" />}
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

  const linkBtn = 'sag-link gap-1.5 px-2 disabled:opacity-50';

  return (
    <section className="space-y-4" aria-label="Saved addresses">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[20px] leading-7 font-semibold text-ink">Saved addresses</h2>
          <p className="mt-1 text-sm leading-5 text-ink-muted">Your default address fills in checkout automatically.</p>
        </div>
        {addresses.length > 0 && (
          <button type="button" onClick={() => setSheet({ editing: null })} className="sag-btn-outline w-full sm:w-auto h-11 px-4 gap-2 text-sm">
            <Plus className="w-4 h-4" aria-hidden="true" /> Add new address
          </button>
        )}
      </div>

      {loading && addresses.length === 0 ? (
        <div className="py-12 flex justify-center" role="status" aria-label="Loading your addresses"><Loader2 className="w-6 h-6 animate-spin text-ink-muted" /></div>
      ) : addresses.length === 0 ? (
        <div className="sag-card px-4 py-10 text-center">
          <span className="w-14 h-14 mx-auto rounded-full bg-sunken text-ink-muted flex items-center justify-center"><PinIcon className="w-7 h-7" mono /></span>
          <p className="mt-4 text-[17px] leading-6 font-semibold text-ink">No saved addresses yet</p>
          <p className="mt-1 text-sm leading-5 text-ink-muted">Add your home or work address to check out faster.</p>
          <button type="button" onClick={() => setSheet({ editing: null })} className={`${onSelect ? 'sag-btn-outline' : 'sag-btn-primary'} mt-5 h-12 px-6 gap-2`}>
            <Plus className="w-[18px] h-[18px]" aria-hidden="true" /> Add address
          </button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {addresses.map((a) => {
            const selected = Boolean(onSelect) && selectedId === a.id;
            return (
              <li key={a.id} data-selected={selected} className="sag-card p-4 flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="sag-badge gap-1.5 bg-sunken text-ink">
                    <TypeIcon type={a.type} className="w-3.5 h-3.5" /> {a.type}
                  </span>
                  {a.isDefault && (
                    <span className="sag-badge gap-1 bg-ok-tint text-ok">
                      <Check className="w-3 h-3" strokeWidth={3} aria-hidden="true" /> Default
                    </span>
                  )}
                </div>
                <div className="text-sm leading-5 text-ink-muted min-w-0">
                  <p className="text-[15px] leading-[22px] font-semibold text-ink">{a.fullName}</p>
                  <p className="break-words">{formatAddressLine(a)}</p>
                  <p className="sag-num mt-1 text-[13px] leading-[18px]">Mobile {a.mobile}{a.altMobile ? ` · Alt ${a.altMobile}` : ''}</p>
                </div>
                {confirmDelete === a.id ? (
                  <div className="mt-auto rounded-control bg-danger-tint border border-danger-line p-3 space-y-2" role="alert">
                    <p className="text-sm leading-5 font-medium text-danger">Delete this address?</p>
                    <div className="flex gap-2">
                      <button type="button" disabled={busy === a.id} onClick={() => run(a.id, () => deleteAddress(a.id), 'Address deleted.')} className="h-11 px-4 rounded-control bg-danger text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60">
                        {busy === a.id && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} Delete
                      </button>
                      <button type="button" onClick={() => setConfirmDelete('')} className="sag-btn-outline h-11 px-4 text-sm">Keep</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-auto pt-1 border-t border-line">
                    <div className="flex flex-wrap items-center gap-x-1 -mx-2">
                      <button type="button" onClick={() => setSheet({ editing: a })} className={linkBtn}><Pencil className="w-4 h-4" aria-hidden="true" /> Edit</button>
                      <button type="button" onClick={() => setConfirmDelete(a.id)} className={linkBtn}><Trash2 className="w-4 h-4" aria-hidden="true" /> Delete</button>
                      {!a.isDefault && (
                        <button type="button" disabled={busy === a.id} onClick={() => run(a.id, () => setDefaultAddress(a.id), 'Default address updated.')} className={linkBtn}>
                          {busy === a.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Star className="w-4 h-4" aria-hidden="true" />} Set default
                        </button>
                      )}
                    </div>
                    {onSelect && (
                      <button type="button" onClick={() => onSelect(a)} aria-pressed={selected} className="sag-btn-outline w-full h-11 mt-1 gap-2 text-sm">
                        {selected && <Check className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />}
                        {selected ? 'Selected' : 'Use this address'}
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
