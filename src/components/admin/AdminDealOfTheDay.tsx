import React, { useEffect, useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { Flame, Save, Clock, RefreshCw, Zap, Search, Eye, Upload, Loader2, Image as ImageIcon, TimerOff, CalendarClock } from 'lucide-react';
import { getCleanImageUrl } from '../../utils/imageHelper';
import { deleteImages, uploadImage } from '../../lib/dataStore';
import { AdminPageHeader } from './kidsToysShared';

const DURATION_PRESETS = [1, 2, 3, 6, 12, 24, 48, 72];

// Value for <input type="datetime-local"> in the admin's own time zone
const toLocalInput = (iso?: string) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatLeft = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${d > 0 ? `${d}d ` : ''}${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
};

const card = 'sag-card p-4 sm:p-6';
const label = 'sag-label';

const Toggle: React.FC<{ checked: boolean; onChange: (value: boolean) => void; label: string }> = ({ checked, onChange, label: aria }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={aria}
    onClick={() => onChange(!checked)}
    className={`relative h-11 w-11 shrink-0 cursor-pointer flex items-center`}
  >
    <span className={`relative block h-6 w-11 rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-sunken-deep'}`}>
      <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </span>
  </button>
);

export const AdminDealOfTheDay: React.FC = () => {
  const { products: allAdminProducts = [], dealOfTheDay, updateDealOfTheDay } = useAdmin();
  const products = allAdminProducts.filter((p) => p.productType !== 'accessory');
  const { showToast } = useShop();

  const [enabled, setEnabled] = useState<boolean>(dealOfTheDay?.enabled ?? true);
  const [productId, setProductId] = useState<string>(dealOfTheDay?.productId || (products[0]?.id || ''));
  const [badgeText, setBadgeText] = useState<string>(dealOfTheDay?.badgeText || 'Deal of the day');
  const [customSubtitle, setCustomSubtitle] = useState<string>(dealOfTheDay?.customSubtitle || '');
  const [bannerImage, setBannerImage] = useState<string>(dealOfTheDay?.bannerImage || '');
  const [isUploading, setIsUploading] = useState(false);

  // Timer controls
  const [showTimer, setShowTimer] = useState<boolean>(dealOfTheDay?.showTimer !== false);
  const [hideWhenEnded, setHideWhenEnded] = useState<boolean>(dealOfTheDay?.hideWhenEnded !== false);
  const [timerMode, setTimerMode] = useState<'duration' | 'exact'>('duration');
  const [durationHours, setDurationHours] = useState<number>(dealOfTheDay?.durationHours || 24);
  const [exactEnd, setExactEnd] = useState<string>(toLocalInput(dealOfTheDay?.endTime));
  const [now, setNow] = useState(Date.now());

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const activeProduct = products.find((p) => p.id === productId) || products[0];
  const previewImage = bannerImage || activeProduct?.images?.[0] || activeProduct?.image;

  const liveEndMs = dealOfTheDay?.endTime ? new Date(dealOfTheDay.endTime).getTime() : 0;
  const liveTimerOn = dealOfTheDay?.showTimer !== false && liveEndMs > 0;
  const liveLeft = liveEndMs - now;
  // A running timer is kept when the product, photo or text changes; use "Restart timer now" to change it
  const timerRunning = liveTimerOn && liveLeft > 0;

  // End time + duration from the form (exact date/time or hours from now)
  const buildTimer = () => {
    if (timerMode === 'exact') {
      const endMs = new Date(exactEnd).getTime();
      if (!exactEnd || Number.isNaN(endMs)) throw new Error('Pick the date and time the deal should end.');
      if (endMs <= Date.now() + 60000) throw new Error('The end time must be in the future.');
      return { endTime: new Date(endMs).toISOString(), durationHours: Math.max(1, Math.round((endMs - Date.now()) / 3600000)) };
    }
    return { endTime: new Date(Date.now() + durationHours * 3600000).toISOString(), durationHours: Number(durationHours) };
  };

  const cleanupOldBanner = (nextBanner: string) => {
    const oldBanner = dealOfTheDay?.bannerImage;
    if (!oldBanner || oldBanner === nextBanner) return;
    const usedByProduct = products.some((product) => (product.images || []).includes(oldBanner));
    if (!usedByProduct) deleteImages([oldBanner]).catch((error) => console.error('Error deleting old deal banner:', error));
  };

  const handleBannerUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Only image files can be uploaded.', 'error');
      return;
    }
    setIsUploading(true);
    try {
      const url = await uploadImage(file, 'deals');
      setBannerImage(url);
      showToast('Deal photo uploaded. Click "Save deal" to publish it.', 'success');
    } catch (err: any) {
      showToast(`Failed to upload photo: ${err?.message || 'Please try again.'}`, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
    return matchesSearch && (selectedCategory === 'All' || p.category === selectedCategory);
  });
  const categories = ['All', ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];

  const handleOneClickSelect = async (prod: any) => {
    setProductId(prod.id);
    // A banner photo belongs to the previous deal product, so start the new deal with the product's photo
    const nextBanner = prod.id === dealOfTheDay?.productId ? bannerImage : '';
    setBannerImage(nextBanner);
    try {
      const timer = showTimer && !timerRunning ? buildTimer() : {};
      await updateDealOfTheDay({ enabled: true, productId: prod.id, bannerImage: nextBanner, showTimer, hideWhenEnded, ...timer });
      cleanupOldBanner(nextBanner);
      setEnabled(true);
      showToast(`"${prod.name}" is now the Deal of the Day.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not save the deal', 'error');
    }
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const timer = showTimer && !timerRunning ? buildTimer() : {};
      await updateDealOfTheDay({ enabled, productId, badgeText, customSubtitle, bannerImage, showTimer, hideWhenEnded, ...timer });
      cleanupOldBanner(bannerImage);
      showToast(!showTimer ? 'Deal saved without a timer.' : timerRunning ? 'Deal saved. The running timer was kept.' : 'Deal saved. The timer has started.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Error saving the deal', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestartTimer = async () => {
    try {
      const timer = buildTimer();
      await updateDealOfTheDay({ ...timer, showTimer: true, hideWhenEnded });
      setShowTimer(true);
      showToast('Timer started.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not start the timer', 'error');
    }
  };

  const handleStopTimer = async () => {
    await updateDealOfTheDay({ showTimer: false });
    setShowTimer(false);
    showToast('Timer turned off. The deal stays on the homepage without a countdown.', 'info');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <AdminPageHeader
        eyebrow="Offers"
        title="Deal of the Day"
        icon={<Flame className="text-current" />}
        description="Pick a product, add a photo and control the countdown timer shown on the homepage."
        actions={
        <div role="status" className="rounded-xl bg-brand-wash border border-brand-line text-ink px-4 py-3 text-sm w-full sm:w-auto sm:min-w-[240px]">
          <p className="text-xs font-semibold text-ink-muted">Timer on the site</p>
          {!dealOfTheDay?.enabled ? (
            <p className="mt-0.5 font-semibold">Deal is hidden</p>
          ) : !liveTimerOn ? (
            <p className="mt-0.5 font-semibold">No timer (deal shown without countdown)</p>
          ) : liveLeft > 0 ? (
            <p className="mt-0.5 font-semibold sag-num">Ends in {formatLeft(liveLeft)}</p>
          ) : (
            <p className="mt-0.5 font-semibold text-sale">Ended{dealOfTheDay?.hideWhenEnded === true ? ' — deal hidden from homepage' : ' — deal shown without timer'}</p>
          )}
          {liveTimerOn && <p className="text-[13px] text-ink-muted">{new Date(liveEndMs).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>}
        </div>
        }
      />

      {/* Show / hide */}
      <div className={`${card} flex items-center justify-between gap-4`}>
        <div>
          <p className="text-sm font-semibold text-ink flex items-center gap-2">
            Show Deal of the Day on homepage
            {enabled && <span className="sag-badge bg-ok-tint text-ok">Live</span>}
          </p>
          <p className="text-[13px] text-ink-muted mt-0.5">Turn this off to take the deal off the homepage.</p>
        </div>
        <Toggle
          checked={enabled}
          label="Show deal on homepage"
          onChange={(val) => {
            setEnabled(val);
            updateDealOfTheDay({ enabled: val });
            showToast(val ? 'Deal section shown' : 'Deal section hidden', 'info');
          }}
        />
      </div>

      {/* Timer */}
      <div className={`${card} space-y-5`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-sans text-[17px] leading-6 font-semibold text-ink flex items-center gap-2"><Clock className="h-5 w-5 text-current" /> Countdown timer</h2>
            <p className="text-[13px] text-ink-muted mt-0.5">Customers see a live countdown. It never restarts by itself; only you can start it again.</p>
          </div>
          <Toggle checked={showTimer} onChange={setShowTimer} label="Show countdown timer" />
        </div>

        {showTimer && (
          <>
            <div role="group" aria-label="How the timer ends" className="flex sm:inline-flex rounded-xl bg-sunken p-1">
              {([['duration', 'Run for hours'], ['exact', 'End at date & time']] as const).map(([mode, text]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTimerMode(mode)}
                  aria-pressed={timerMode === mode}
                  className={`flex-1 sm:flex-none h-11 rounded-[10px] px-4 text-sm font-semibold transition-colors cursor-pointer ${timerMode === mode ? 'bg-ink text-white' : 'text-ink'}`}
                >
                  {text}
                </button>
              ))}
            </div>

            {timerMode === 'duration' ? (
              <div className="grid grid-cols-4 sm:flex sm:flex-wrap gap-2">
                {DURATION_PRESETS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setDurationHours(h)}
                    aria-pressed={durationHours === h}
                    className="sag-chip h-11 min-w-[64px]"
                  >
                    {h < 24 ? `${h} hr` : `${h / 24} day${h > 24 ? 's' : ''}`}
                  </button>
                ))}
              </div>
            ) : (
              <div className="max-w-xs">
                <label className={label} htmlFor="deal-end-time">Deal ends at</label>
                <input
                  id="deal-end-time"
                  type="datetime-local"
                  value={exactEnd}
                  min={toLocalInput(new Date(Date.now() + 5 * 60000).toISOString())}
                  onChange={(e) => setExactEnd(e.target.value)}
                  className="sag-input"
                />
              </div>
            )}

            <label className="flex items-start gap-3 min-h-11 rounded-xl border border-line bg-white p-3.5 cursor-pointer">
              <input type="checkbox" checked={hideWhenEnded} onChange={(e) => setHideWhenEnded(e.target.checked)} className="mt-0.5 h-[22px] w-[22px] shrink-0 accent-brand" />
              <span className="text-sm text-ink">
                Hide the deal when the timer ends
                <span className="block text-[13px] text-ink-muted">Off: the deal stays on the homepage without the countdown.</span>
              </span>
            </label>

            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap gap-2">
              <button type="button" onClick={handleRestartTimer} className="sag-btn-outline h-12 px-5 text-sm gap-2">
                <RefreshCw className="h-4 w-4 text-current" /> {liveTimerOn && liveLeft > 0 ? 'Restart timer now' : 'Start timer now'}
              </button>
              {liveTimerOn && (
                <button type="button" onClick={handleStopTimer} className="sag-btn-outline h-12 px-5 text-sm gap-2">
                  <TimerOff className="h-4 w-4 text-current" /> Turn timer off
                </button>
              )}
            </div>
            <p className="text-[13px] text-ink-muted flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5 text-current" />
              {timerMode === 'duration'
                ? `Will end on ${new Date(now + durationHours * 3600000).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} if started now.`
                : exactEnd ? `Will end on ${new Date(exactEnd).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.` : 'Choose a date and time.'}
            </p>
          </>
        )}
      </div>

      {/* Product picker */}
      <div className={`${card} space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-sans text-[17px] leading-6 font-semibold text-ink flex items-center gap-2"><Zap className="h-5 w-5 text-current" /> Choose the deal product</h2>
            <p className="text-[13px] text-ink-muted">One click makes it live{showTimer && !timerRunning ? ' and starts the timer' : ''}.</p>
          </div>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-[minmax(0,1fr)_auto] gap-2 w-full sm:w-auto">
            <div className="relative min-w-0 sm:w-56">
              <Search className="w-4 h-4 text-ink-faint absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products"
                aria-label="Search products"
                className="sag-input pl-10"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="Filter by category"
              className="sag-input min-[420px]:w-auto"
            >
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[460px] overflow-y-auto overscroll-contain p-0.5">
          {filteredProducts.map((prod) => {
            const isActive = productId === prod.id && enabled;
            return (
              <div key={prod.id} className={`p-3 rounded-xl border-2 flex flex-col justify-between ${isActive ? 'border-brand bg-brand-wash' : 'border-line bg-white'}`}>
                <div className="flex items-center gap-3">
                  <img src={getCleanImageUrl(prod.images?.[0] || prod.image, 160)} alt={prod.name} loading="lazy" className="w-14 aspect-[4/5] object-cover object-top rounded-[10px] shrink-0 bg-sunken" />
                  <div className="min-w-0">
                    <span className="block truncate text-xs text-ink-muted">{prod.category}</span>
                    <h4 className="text-sm font-semibold text-ink line-clamp-2 leading-tight">{prod.name}</h4>
                    <p className="text-sm font-semibold text-ink sag-num">₹{prod.price.toLocaleString('en-IN')}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleOneClickSelect(prod)}
                  className={`mt-3 w-full h-11 text-sm font-semibold rounded-xl border-[1.5px] transition-colors cursor-pointer ${isActive ? 'bg-ok-tint border-ok-line text-ok' : 'bg-white border-ink text-ink hover:bg-sunken'}`}
                >
                  {isActive ? 'Current deal' : 'Set as deal'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Photo & text */}
      <form onSubmit={handleSaveForm} className={`${card} space-y-5`}>
        <h2 className="font-sans text-[17px] leading-6 font-semibold text-ink">Photo and text</h2>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
          <div className="md:col-span-4">
            <div className="w-full max-w-[220px] mx-auto aspect-[4/5] rounded-xl overflow-hidden border border-line bg-sunken">
              {previewImage ? (
                <img src={getCleanImageUrl(previewImage)} alt="Deal photo preview" className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full grid place-items-center text-ink-faint"><ImageIcon className="w-8 h-8 text-current" /></div>
              )}
            </div>
            <p className="mt-2 min-h-5 text-center text-[13px] text-ink-muted" role="status">
              {isUploading ? <span className="inline-flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin text-current" /> Uploading…</span> : previewImage ? 'The full photo, uncropped.' : 'No photo yet.'}
            </p>
          </div>
          <div className="md:col-span-8 space-y-4">
            <div>
              <span className={label}>Deal photo</span>
              <p className="text-[13px] text-ink-muted">Optional. Used only on the homepage deal; the product page keeps its own photos.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className={`sag-btn-outline h-11 px-4 text-sm gap-2 ${isUploading ? 'opacity-60 cursor-wait' : ''}`}>
                  <Upload className="w-4 h-4 text-current" /> {bannerImage ? 'Replace photo' : 'Upload photo'}
                  <input type="file" accept="image/*" className="sr-only" onChange={handleBannerUpload} disabled={isUploading} />
                </label>
                {bannerImage && (
                  <button type="button" onClick={() => setBannerImage('')} className="sag-link">
                    Use product photo instead
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className={label} htmlFor="deal-label">Small label above the name</label>
              <input id="deal-label" type="text" value={badgeText} onChange={(e) => setBadgeText(e.target.value)} placeholder="Deal of the day"
                className="sag-input" />
            </div>
            <div>
              <label className={label} htmlFor="deal-subtitle">Short line (optional)</label>
              <input id="deal-subtitle" type="text" value={customSubtitle} onChange={(e) => setCustomSubtitle(e.target.value)} placeholder="Leave empty to use the product description"
                className="sag-input" />
            </div>
          </div>
        </div>
        {activeProduct && (
          <p className="text-[13px] text-ink-muted">
            Price customers pay: <span className="font-semibold text-ink">₹{activeProduct.price.toLocaleString('en-IN')}</span> (the product's own price — change it from Products → Edit).
          </p>
        )}
        <button type="submit" disabled={isSaving}
          className="sag-btn-primary w-full sm:w-auto px-8 gap-2">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin text-current" /> : <Save className="w-4 h-4 text-current" />}
          {isSaving ? 'Saving...' : showTimer && !timerRunning ? 'Save deal & start timer' : 'Save deal'}
        </button>
      </form>

      {activeProduct && (
        <p className="text-[13px] text-ink-muted flex items-center gap-1.5"><Eye className="h-3.5 w-3.5 text-current" /> Open the homepage to see the deal exactly as customers see it.</p>
      )}
    </div>
  );
};
