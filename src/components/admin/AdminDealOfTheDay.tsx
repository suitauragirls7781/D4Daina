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

const card = 'bg-white rounded-3xl p-5 sm:p-6 border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)]';
const label = 'text-xs font-semibold text-[#2A1A26]/70 uppercase tracking-wider block';

const Toggle: React.FC<{ checked: boolean; onChange: (value: boolean) => void; label: string }> = ({ checked, onChange, label: aria }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={aria}
    onClick={() => onChange(!checked)}
    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer ${checked ? 'bg-[#4B1D3F]' : 'bg-[#2A1A26]/20'}`}
  >
    <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
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
        eyebrow="Homepage spotlight"
        title="Deal of the Day"
        icon={<Flame className="text-current" />}
        description="Pick a product, add a photo and control the countdown timer shown on the homepage."
        actions={
        <div className="rounded-2xl bg-[#4B1D3F] text-white px-4 py-3 text-sm w-full sm:w-auto sm:min-w-[240px]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C5A46D]">Timer on the site</p>
          {!dealOfTheDay?.enabled ? (
            <p className="mt-0.5 font-semibold">Deal is hidden</p>
          ) : !liveTimerOn ? (
            <p className="mt-0.5 font-semibold">No timer (deal shown without countdown)</p>
          ) : liveLeft > 0 ? (
            <p className="mt-0.5 font-semibold tabular-nums">Ends in {formatLeft(liveLeft)}</p>
          ) : (
            <p className="mt-0.5 font-semibold text-[#F7E4EA]">Ended{dealOfTheDay?.hideWhenEnded === true ? ' — deal hidden from homepage' : ' — deal shown without timer'}</p>
          )}
          {liveTimerOn && <p className="text-xs text-white/70">{new Date(liveEndMs).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>}
        </div>
        }
      />

      {/* Show / hide */}
      <div className={`${card} flex items-center justify-between gap-4`}>
        <div>
          <p className="text-sm font-semibold text-[#2A1A26] flex items-center gap-2">
            Show Deal of the Day on homepage
            {enabled && <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Live</span>}
          </p>
          <p className="text-xs text-[#2A1A26]/60 mt-0.5">Appears right below the hero banner.</p>
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
            <h2 className="font-serif text-lg font-bold text-[#4B1D3F] flex items-center gap-2"><Clock className="h-5 w-5 text-current" /> Countdown timer</h2>
            <p className="text-xs text-[#2A1A26]/60 mt-0.5">Customers see a live countdown. It never restarts by itself; only you can start it again.</p>
          </div>
          <Toggle checked={showTimer} onChange={setShowTimer} label="Show countdown timer" />
        </div>

        {showTimer && (
          <>
            <div className="inline-flex rounded-full bg-[#F3EEF8] p-1">
              {([['duration', 'Run for hours'], ['exact', 'End at date & time']] as const).map(([mode, text]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTimerMode(mode)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${timerMode === mode ? 'bg-[#4B1D3F] text-white' : 'text-[#4B1D3F]'}`}
                >
                  {text}
                </button>
              ))}
            </div>

            {timerMode === 'duration' ? (
              <div className="flex flex-wrap gap-2">
                {DURATION_PRESETS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setDurationHours(h)}
                    className={`h-10 min-w-[64px] rounded-full border px-4 text-sm transition-colors cursor-pointer ${durationHours === h ? 'border-[#4B1D3F] bg-[#4B1D3F] text-white font-semibold' : 'border-[#4B1D3F]/20 text-[#2A1A26] hover:border-[#4B1D3F]'}`}
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
                  className="mt-1.5 w-full rounded-full border border-[#4B1D3F]/20 px-3.5 py-2.5 text-sm text-[#2A1A26] outline-none focus:border-[#4B1D3F]"
                />
              </div>
            )}

            <label className="flex items-start gap-3 rounded-xl bg-[#FBF7F3] p-3.5 cursor-pointer">
              <input type="checkbox" checked={hideWhenEnded} onChange={(e) => setHideWhenEnded(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#4B1D3F]" />
              <span className="text-sm text-[#2A1A26]">
                Hide the deal when the timer ends
                <span className="block text-xs text-[#2A1A26]/60">Off: the deal stays on the homepage without the countdown.</span>
              </span>
            </label>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleRestartTimer} className="h-11 rounded-full bg-[#4B1D3F] px-5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-[#3B1532] inline-flex items-center gap-2 cursor-pointer">
                <RefreshCw className="h-4 w-4 text-current" /> {liveTimerOn && liveLeft > 0 ? 'Restart timer now' : 'Start timer now'}
              </button>
              {liveTimerOn && (
                <button type="button" onClick={handleStopTimer} className="h-11 rounded-full border border-[#4B1D3F]/20 px-5 text-xs font-semibold uppercase tracking-wider text-[#4B1D3F] hover:bg-[#F3EEF8] inline-flex items-center gap-2 cursor-pointer">
                  <TimerOff className="h-4 w-4 text-current" /> Turn timer off
                </button>
              )}
            </div>
            <p className="text-xs text-[#2A1A26]/55 flex items-center gap-1.5">
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
            <h2 className="font-serif text-lg font-bold text-[#4B1D3F] flex items-center gap-2"><Zap className="h-5 w-5 text-current" /> Choose the deal product</h2>
            <p className="text-xs text-[#2A1A26]/60">One click makes it live{showTimer && !timerRunning ? ' and starts the timer' : ''}.</p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-52">
              <Search className="w-3.5 h-3.5 text-[#2A1A26]/40 absolute left-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="w-full pl-8 pr-3 py-2 rounded-full border border-[#4B1D3F]/15 text-sm outline-none focus:border-[#4B1D3F]"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 rounded-full border border-[#4B1D3F]/15 text-sm outline-none focus:border-[#4B1D3F] bg-white"
            >
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[420px] overflow-y-auto p-1">
          {filteredProducts.map((prod) => {
            const isActive = productId === prod.id && enabled;
            return (
              <div key={prod.id} className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${isActive ? 'border-[#4B1D3F] bg-[#F3EEF8] ring-1 ring-[#4B1D3F]' : 'border-[#4B1D3F]/10 bg-white hover:border-[#4B1D3F]/30'}`}>
                <div className="flex items-center gap-3">
                  <img src={getCleanImageUrl(prod.images?.[0] || prod.image, 160)} alt={prod.name} className="w-14 h-[70px] object-cover object-top rounded-lg shrink-0 bg-[#F3EEF8]" />
                  <div className="min-w-0">
                    <span className="text-[11px] text-[#9C7A45] uppercase tracking-wider block truncate">{prod.category}</span>
                    <h4 className="text-sm font-semibold text-[#2A1A26] line-clamp-2 leading-tight">{prod.name}</h4>
                    <p className="text-sm text-[#2A1A26]/70">₹{prod.price.toLocaleString('en-IN')}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleOneClickSelect(prod)}
                  className={`mt-3 w-full h-9 text-xs font-semibold uppercase tracking-wider rounded-full transition-colors cursor-pointer ${isActive ? 'bg-emerald-600 text-white' : 'bg-[#4B1D3F] text-white hover:bg-[#3B1532]'}`}
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
        <h2 className="font-serif text-lg font-bold text-[#4B1D3F]">Photo & text</h2>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
          <div className="md:col-span-4">
            <div className="relative w-full max-w-[220px] mx-auto aspect-[4/5] rounded-2xl overflow-hidden border border-[#4B1D3F]/10 bg-[#F3EEF8]">
              {previewImage ? (
                <img src={getCleanImageUrl(previewImage)} alt="Deal photo preview" className="w-full h-full object-cover object-top" />
              ) : (
                <div className="w-full h-full grid place-items-center text-[#2A1A26]/40"><ImageIcon className="w-8 h-8 text-current" /></div>
              )}
              {isUploading && (
                <div className="absolute inset-0 bg-[#2A1A26]/60 flex items-center justify-center gap-2 text-white text-xs font-semibold">
                  <Loader2 className="w-5 h-5 animate-spin text-current" /> Uploading...
                </div>
              )}
            </div>
          </div>
          <div className="md:col-span-8 space-y-4">
            <div>
              <span className={label}>Deal photo</span>
              <p className="text-xs text-[#2A1A26]/60 mt-1">Optional. Used only on the homepage deal; the product page keeps its own photos.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="h-10 px-4 bg-[#4B1D3F] hover:bg-[#3B1532] text-white rounded-full text-xs font-semibold flex items-center gap-2 cursor-pointer">
                  <Upload className="w-4 h-4 text-current" /> {bannerImage ? 'Replace photo' : 'Upload photo'}
                  <input type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} disabled={isUploading} />
                </label>
                {bannerImage && (
                  <button type="button" onClick={() => setBannerImage('')} className="h-10 px-4 rounded-full border border-[#4B1D3F]/20 text-xs font-semibold text-[#4B1D3F] hover:bg-[#F3EEF8] cursor-pointer">
                    Use product photo instead
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className={label} htmlFor="deal-label">Small label above the name</label>
              <input id="deal-label" type="text" value={badgeText} onChange={(e) => setBadgeText(e.target.value)} placeholder="Deal of the day"
                className="mt-1.5 w-full rounded-full border border-[#4B1D3F]/20 px-3.5 py-2.5 text-sm outline-none focus:border-[#4B1D3F]" />
            </div>
            <div>
              <label className={label} htmlFor="deal-subtitle">Short line (optional)</label>
              <input id="deal-subtitle" type="text" value={customSubtitle} onChange={(e) => setCustomSubtitle(e.target.value)} placeholder="Leave empty to use the product description"
                className="mt-1.5 w-full rounded-full border border-[#4B1D3F]/20 px-3.5 py-2.5 text-sm outline-none focus:border-[#4B1D3F]" />
            </div>
          </div>
        </div>
        {activeProduct && (
          <p className="text-xs text-[#2A1A26]/60">
            Price customers pay: <span className="font-semibold text-[#2A1A26]">₹{activeProduct.price.toLocaleString('en-IN')}</span> (the product's own price — change it from Products → Edit).
          </p>
        )}
        <button type="submit" disabled={isSaving}
          className="h-12 px-8 bg-[#4B1D3F] hover:bg-[#3B1532] text-white text-xs font-semibold uppercase tracking-wider rounded-full inline-flex items-center gap-2 cursor-pointer disabled:opacity-60">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin text-current" /> : <Save className="w-4 h-4 text-current" />}
          {isSaving ? 'Saving...' : showTimer && !timerRunning ? 'Save deal & start timer' : 'Save deal'}
        </button>
      </form>

      {activeProduct && (
        <p className="text-xs text-[#2A1A26]/55 flex items-center gap-1.5"><Eye className="h-3.5 w-3.5 text-current" /> Open the homepage to see the deal exactly as customers see it.</p>
      )}
    </div>
  );
};
