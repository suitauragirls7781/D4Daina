import React, { useEffect, useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { Flame, Save, RefreshCw, Search, Eye, Upload, Loader2, Image as ImageIcon, TimerOff, CalendarClock } from 'lucide-react';
import { getCleanImageUrl } from '../../utils/imageHelper';
import { deleteImages, uploadImage } from '../../lib/dataStore';
import { AdminPageHeader } from './adminShared';
import { CheckRow, Empty, Panel, Pill, SaveBar, SwitchRow, Tile, Tiles, kit } from './AdminPaymentGateways';
import { DealTicketPreview, PhoneFrame, PreviewBadge } from './storefrontPreview';

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

const label = 'sag-label';

export const AdminDealOfTheDay: React.FC = () => {
  const { products: allAdminProducts = [], dealOfTheDay, updateDealOfTheDay, homepageSections = [] } = useAdmin();
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

  // What shoppers see right now, from the saved deal
  const siteOn = Boolean(dealOfTheDay?.enabled);
  const endedAndHidden = siteOn && liveTimerOn && liveLeft <= 0 && dealOfTheDay?.hideWhenEnded === true;
  const liveProduct = products.find((p) => p.id === dealOfTheDay?.productId);
  const endsAtText = liveTimerOn ? new Date(liveEndMs).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '';

  // The preview: the ticket the home page would draw with the choices in the form. The clock is the running
  // timer's real end; a timer that has not started yet is shown as it would run if saved now.
  const draftEndMs = (() => {
    if (!showTimer) return 0;
    if (timerRunning) return liveEndMs;
    if (timerMode === 'exact') { const ms = new Date(exactEnd).getTime(); return Number.isFinite(ms) ? ms : 0; }
    return now + durationHours * 3600000;
  })();
  const sectionOn = homepageSections.length === 0 || homepageSections.some((s) => s.key === 'dealOfTheDay' && s.enabled !== false);
  const draftUnsaved = Boolean(dealOfTheDay) && (
    enabled !== Boolean(dealOfTheDay?.enabled) || productId !== (dealOfTheDay?.productId || '') || (bannerImage || '') !== (dealOfTheDay?.bannerImage || '')
    || showTimer !== (dealOfTheDay?.showTimer !== false) || (showTimer && !timerRunning)
  );
  const previewNote = !enabled
    ? 'The deal is switched off: the home page leaves it out.'
    : !sectionOn
    ? 'The Deal of the day section is switched off in Homepage sections, so the home page leaves it out.'
    : showTimer && !timerRunning
    ? 'The clock shows how the timer would run if you save now.'
    : showTimer
    ? 'The clock is the real timer on the site; it never restarts by itself.'
    : 'No timer: the ticket is shown without a clock.';

  return (
    <div className="space-y-5">
      {/* Header */}
      <AdminPageHeader
        eyebrow="Offers"
        title="Deal of the Day"
        icon={<Flame className="text-current" />}
        description="One product shown as today's deal on the homepage. Pick the product, add a photo and control the countdown shoppers see."
        actions={
          <Pill role="status" tone={!siteOn ? 'off' : endedAndHidden ? 'soon' : 'live'}>
            {!siteOn ? 'Off' : endedAndHidden ? 'Timer ended: hidden from the site' : 'Live on the site'}
          </Pill>
        }
      />

      <Tiles className="!grid-cols-1 sm:!grid-cols-2">
        <Tile
          label="Deal product"
          value={<span className="block text-lg leading-7 line-clamp-2">{liveProduct ? liveProduct.name : 'None chosen'}</span>}
          note={liveProduct ? `Shoppers pay ₹${liveProduct.price.toLocaleString('en-IN')}` : 'Choose one below'}
        />
        <div role="status" className="sag-glass min-w-0 px-4 py-3.5">
          <p className="text-xs leading-4 font-medium text-ink-muted">Timer on the site</p>
          {!dealOfTheDay?.enabled ? (
            <p className="mt-1 text-lg leading-7 font-semibold text-ink">Deal is hidden</p>
          ) : !liveTimerOn ? (
            <p className="mt-1 text-lg leading-7 font-semibold text-ink">No timer (deal shown without countdown)</p>
          ) : liveLeft > 0 ? (
            <p className="mt-1 text-[26px] leading-8 font-semibold text-ink sag-num">Ends in {formatLeft(liveLeft)}</p>
          ) : (
            <p className="mt-1 text-lg leading-7 font-semibold text-sale">Ended{dealOfTheDay?.hideWhenEnded === true ? ' — deal hidden from homepage' : ' — deal shown without timer'}</p>
          )}
          {liveTimerOn && <p className="mt-0.5 text-xs leading-4 text-ink-muted sag-num">{endsAtText}</p>}
        </div>
      </Tiles>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
      <aside id="deal-preview" aria-label="Deal preview" className="xl:order-2 xl:sticky xl:top-24 sag-glass p-4 min-w-0">
        <h3 className={kit.h2}>How the home page shows it</h3>
        <div className="mt-2"><PreviewBadge unsaved={draftUnsaved} /></div>
        <div className="mt-4">
          <PhoneFrame label="Phone preview of the deal of the day" screenClassName="!bg-sunken">
            <div className={`px-3 pt-2 pb-6 ${!enabled || !sectionOn ? 'opacity-40 grayscale' : ''}`}>
              {activeProduct
                ? <DealTicketPreview product={activeProduct} photo={bannerImage} endMs={draftEndMs} timerOn={showTimer} />
                : <p className="px-3 py-12 text-center text-sm text-ink-muted">Choose a product to see the ticket.</p>}
            </div>
          </PhoneFrame>
          <p role="status" className={`mt-3 ${kit.hint}`}>{previewNote}</p>
        </div>
      </aside>
      <div className="space-y-5 min-w-0">
      {/* Show / hide */}
      <Panel title="On the homepage" hint="The switch saves by itself, straight away.">
        <SwitchRow
          label="Show Deal of the Day on homepage"
          hint="Turn this off to take the deal off the homepage."
          checked={enabled}
          ariaLabel="Show deal on homepage"
          onChange={(val) => {
            setEnabled(val);
            updateDealOfTheDay({ enabled: val });
            showToast(val ? 'Deal section shown' : 'Deal section hidden', 'info');
          }}
        />
      </Panel>

      {/* Product picker */}
      <Panel
        title="1. Choose the deal product"
        hint={`One tap on "Set as deal" makes it live${showTimer && !timerRunning ? ' and starts the timer' : ''}.`}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 min-[420px]:grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="relative min-w-0">
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

          {filteredProducts.length === 0 ? (
            <p className={kit.note}>{products.length === 0 ? 'There are no products yet. Add one in Products first.' : 'No product matches this search.'}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[460px] overflow-y-auto overscroll-contain p-0.5">
              {filteredProducts.map((prod) => {
                const isActive = productId === prod.id && enabled;
                return (
                  <div key={prod.id} className={`p-3 rounded-[16px] border flex flex-col justify-between ${isActive ? 'border-brand bg-brand-wash' : 'border-line bg-sunken'}`}>
                    <div className="flex items-center gap-3">
                      <img src={getCleanImageUrl(prod.images?.[0] || prod.image, 160)} alt={prod.name} loading="lazy" className="w-14 aspect-[4/5] object-cover object-top rounded-[16px] shrink-0 bg-sunken" />
                      <div className="min-w-0">
                        <span className="block truncate text-xs text-ink-muted">{prod.category}</span>
                        <h4 className="text-sm font-medium text-ink line-clamp-2 leading-tight">{prod.name}</h4>
                        <p className="mt-0.5 text-sm font-semibold text-ink sag-num">₹{prod.price.toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOneClickSelect(prod)}
                      aria-pressed={isActive}
                      className="sag-chip mt-3 w-full h-11 text-sm"
                    >
                      {isActive ? 'Current deal' : 'Set as deal'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Panel>

      {/* Timer */}
      <Panel title="2. Countdown timer" hint="Customers see a live countdown. It never restarts by itself; only you can start it again.">
        <div className="space-y-5">
          <SwitchRow
            label="Show a countdown with the deal"
            hint="Off: the deal is shown without a clock."
            checked={showTimer}
            onChange={setShowTimer}
            ariaLabel="Show countdown timer"
            onText="On"
          />

          {showTimer && (
            <>
              <div>
                <p className={label}>How the timer ends</p>
                <div role="group" aria-label="How the timer ends" className="flex sm:inline-flex gap-2">
                  {([['duration', 'Run for hours'], ['exact', 'End at date & time']] as const).map(([mode, text]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setTimerMode(mode)}
                      aria-pressed={timerMode === mode}
                      className="sag-chip flex-1 sm:flex-none h-11 px-4 text-sm"
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>

              {timerMode === 'duration' ? (
                <div>
                  <p className={label}>Run for</p>
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

              <p className={`${kit.note} flex items-start gap-2 sag-num`}>
                <CalendarClock className="h-4 w-4 shrink-0 mt-0.5 text-brand" />
                <span>
                  {timerMode === 'duration'
                    ? `Will end on ${new Date(now + durationHours * 3600000).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} if started now.`
                    : exactEnd ? `Will end on ${new Date(exactEnd).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.` : 'Choose a date and time.'}
                </span>
              </p>

              <CheckRow
                label="Hide the deal when the timer ends"
                hint="Off: the deal stays on the homepage without the countdown."
                checked={hideWhenEnded}
                onChange={setHideWhenEnded}
              />

              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap gap-2">
                <button type="button" onClick={handleRestartTimer} className={kit.outline}>
                  <RefreshCw className="h-4 w-4 text-current" /> {liveTimerOn && liveLeft > 0 ? 'Restart timer now' : 'Start timer now'}
                </button>
                {liveTimerOn && (
                  <button type="button" onClick={handleStopTimer} className={kit.outline}>
                    <TimerOff className="h-4 w-4 text-current" /> Turn timer off
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </Panel>

      {/* Photo & text */}
      <form onSubmit={handleSaveForm} className="space-y-5">
        <Panel title="3. Photo and text" hint="How the deal looks on the homepage. The product page keeps its own photos.">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
            <div className="md:col-span-4">
              <div className="w-full max-w-[220px] mx-auto aspect-[4/5] rounded-[16px] overflow-hidden border border-line bg-sunken">
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
                <p className={kit.hint}>Optional. Used only on the homepage deal; the product page keeps its own photos.</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label className={`sag-btn-outline h-11 px-4 text-sm gap-2 cursor-pointer ${isUploading ? 'opacity-60 cursor-wait' : ''}`}>
                    <Upload className="w-4 h-4 text-current" /> {bannerImage ? 'Replace photo' : 'Upload photo'}
                    <input type="file" accept="image/*" className="sr-only" onChange={handleBannerUpload} disabled={isUploading} />
                  </label>
                  {bannerImage && (
                    <button type="button" onClick={() => setBannerImage('')} className="sag-link min-h-11">
                      Use product photo instead
                    </button>
                  )}
                </div>
              </div>
              <p className={kit.note}>The ticket on the home page always says "Deal of the day" and shows the product's name. The two lines below are saved for later and are not shown on the site now.</p>
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
              {activeProduct && (
                <p className={`${kit.note} sag-num`}>
                  Price customers pay: <span className="font-semibold text-ink">₹{activeProduct.price.toLocaleString('en-IN')}</span> (the product's own price — change it from Products → Edit).
                </p>
              )}
            </div>
          </div>
        </Panel>

        {products.length === 0 && (
          <Empty icon={<Flame />} title="No products yet">Add a product in Products, then come back to make it the deal.</Empty>
        )}

        <SaveBar
          note={activeProduct
            ? <span className="inline-flex items-start gap-1.5"><Eye className="h-3.5 w-3.5 shrink-0 mt-0.5 text-current" /> Open the homepage to see the deal exactly as customers see it.</span>
            : undefined}
        >
          <button type="submit" disabled={isSaving} className={kit.primary}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin text-current" /> : <Save className="w-4 h-4 text-current" />}
            {isSaving ? 'Saving...' : showTimer && !timerRunning ? 'Save deal & start timer' : 'Save deal'}
          </button>
        </SaveBar>
      </form>
      </div>
      </div>
    </div>
  );
};
