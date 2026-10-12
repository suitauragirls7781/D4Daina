import React, { useEffect, useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { ArrowDown, ArrowUp, ExternalLink, Instagram, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import type { InstagramReel } from '../../types';
import { instagramEmbedUrl, instagramProfile, normalizeInstagramUrl } from '../../utils/instagram';
import { AdminPageHeader } from './adminShared';
import { Empty, Panel, Pill, SaveBar, Tile, Tiles, kit } from './AdminPaymentGateways';

const MAX_REELS = 24;

export const AdminInstagram: React.FC = () => {
  const { instagramReels = [], updateInstagramReels, storeSettings } = useAdmin();
  const { showToast } = useShop();
  const [draft, setDraft] = useState<InstagramReel[]>(instagramReels);
  const [linkInput, setLinkInput] = useState('');
  const [captionInput, setCaptionInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const profile = instagramProfile(storeSettings?.instagramUrl);

  // Pick up changes saved from another device while there are no unsaved edits here
  const isDirty = JSON.stringify(draft) !== JSON.stringify(instagramReels);
  useEffect(() => {
    if (!isDirty) setDraft(instagramReels);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instagramReels]);

  const handleAdd = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = normalizeInstagramUrl(linkInput);
    if (!parsed) {
      showToast('Paste a valid Instagram reel or post link, e.g. https://www.instagram.com/reel/ABC123/', 'error');
      return;
    }
    if (draft.some((reel) => reel.url === parsed.url)) {
      showToast('This reel is already in the list.', 'error');
      return;
    }
    if (draft.length >= MAX_REELS) {
      showToast(`You can show up to ${MAX_REELS} reels.`, 'error');
      return;
    }
    setDraft([{ id: parsed.code, url: parsed.url, caption: captionInput.trim() }, ...draft]);
    setLinkInput('');
    setCaptionInput('');
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.length) return;
    const next = [...draft];
    [next[index], next[target]] = [next[target], next[index]];
    setDraft(next);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateInstagramReels(draft);
      showToast('Instagram reels saved. They are now live on every device.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Could not save reels. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const liveCount = instagramReels.length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <AdminPageHeader
        eyebrow={`Social · ${profile.handle}`}
        title="Instagram reels"
        icon={<Instagram className="text-current" />}
        description={'Paste links of your reels or posts. They play inside the homepage "Follow the Aura" section, in the order shown here.'}
        actions={
          <Pill role="status" tone={liveCount > 0 ? 'live' : 'off'}>
            {liveCount > 0 ? 'Live on the site' : 'No reels on the site yet'}
          </Pill>
        }
      />

      <Tiles className="lg:!grid-cols-2 max-w-2xl">
        <Tile label="On the site now" value={liveCount} note={liveCount === 0 ? `The homepage shows a "Follow us" card for ${profile.handle}` : 'Reels and posts saved'} />
        <Tile label="In this list" value={<>{draft.length} <span className="text-base font-medium text-ink-muted">of {MAX_REELS}</span></>} note={isDirty ? 'Not saved yet' : 'Same as the site'} />
      </Tiles>

      {/* Add form */}
      <Panel
        title="Add a reel"
        hint={<>On Instagram open the reel → tap ⋯ / Share → <strong className="text-ink">Copy link</strong>, then paste it below.</>}
      >
        <form onSubmit={handleAdd} className="flex flex-col md:flex-row gap-3">
          <input
            type="url"
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            placeholder="https://www.instagram.com/reel/…"
            aria-label="Instagram reel link"
            className="sag-input h-12 md:flex-1 min-w-0"
            required
          />
          <input
            type="text"
            value={captionInput}
            onChange={(e) => setCaptionInput(e.target.value)}
            placeholder="Short caption (optional)"
            aria-label="Reel caption (optional)"
            maxLength={120}
            className="sag-input h-12 md:w-64"
          />
          <button
            type="submit"
            className={kit.outline}
          >
            <Plus className="w-4 h-4 text-current" />
            Add
          </button>
        </form>
      </Panel>

      {/* List */}
      {draft.length === 0 ? (
        <Empty icon={<Instagram />} title="No reels yet">
          Until you add some, the homepage shows a "Follow us on Instagram" card linking to {profile.handle}.
        </Empty>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {draft.map((reel, index) => (
            <div key={reel.url} className="sag-glass overflow-hidden flex flex-col">
              <div className="bg-sunken flex justify-center border-b border-line">
                <iframe
                  src={instagramEmbedUrl(reel)}
                  title={reel.caption || `Instagram reel ${index + 1}`}
                  className="w-full max-w-[340px] h-[420px] border-0"
                  loading="lazy"
                  scrolling="no"
                  allow="encrypted-media; picture-in-picture"
                />
              </div>
              <div className="p-4 space-y-3 flex-1 flex flex-col">
                <input
                  type="text"
                  value={reel.caption || ''}
                  onChange={(e) => setDraft(draft.map((r) => (r.url === reel.url ? { ...r, caption: e.target.value } : r)))}
                  placeholder="Caption (optional)"
                  aria-label={`Caption for reel ${index + 1} (optional)`}
                  maxLength={120}
                  className="sag-input h-12"
                />
                <div className="flex items-center justify-between gap-2 mt-auto">
                  <span className="text-xs leading-4 font-bold uppercase tracking-[0.08em] text-brand sag-num">Reel {index + 1}</span>
                  <div className="flex items-center gap-0.5">
                    <a href={reel.url} target="_blank" rel="noopener noreferrer" className={kit.iconBtn} title="Open on Instagram" aria-label="Open on Instagram">
                      <ExternalLink className="w-4 h-4 text-current" />
                    </a>
                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className={kit.iconBtn} title="Move up" aria-label="Move up">
                      <ArrowUp className="w-4 h-4 text-current" />
                    </button>
                    <button type="button" onClick={() => move(index, 1)} disabled={index === draft.length - 1} className={kit.iconBtn} title="Move down" aria-label="Move down">
                      <ArrowDown className="w-4 h-4 text-current" />
                    </button>
                    <button type="button" onClick={() => setDraft(draft.filter((r) => r.url !== reel.url))} className={kit.iconBtnDanger} title="Remove" aria-label="Remove">
                      <Trash2 className="w-4 h-4 text-current" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <SaveBar note={isDirty ? <span className="font-medium text-brand">You have unsaved changes. Click "Save &amp; publish" to put them live.</span> : 'Everything here is on the site.'}>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !isDirty}
          className={kit.primary}
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin text-current" /> : <Save className="w-4 h-4 text-current" />}
          <span>{isSaving ? 'Saving…' : isDirty ? 'Save & publish' : 'All changes saved'}</span>
        </button>
      </SaveBar>
    </div>
  );
};
