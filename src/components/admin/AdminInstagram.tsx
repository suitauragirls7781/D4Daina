import React, { useEffect, useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { ArrowDown, ArrowUp, ExternalLink, Instagram, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import type { InstagramReel } from '../../types';
import { instagramEmbedUrl, instagramProfile, normalizeInstagramUrl } from '../../utils/instagram';
import { AdminPageHeader } from './kidsToysShared';

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <AdminPageHeader
        eyebrow={`Social · ${profile.handle}`}
        title="Instagram reels"
        icon={<Instagram className="text-current" />}
        description={'Paste links of your reels or posts. They play inside the homepage "Follow the Aura" section, in the order shown here.'}
        actions={
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            className="h-11 px-5 sag-btn-primary disabled:bg-sunken disabled:text-ink disabled:cursor-not-allowed text-sm flex items-center gap-2 shrink-0"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin text-current" /> : <Save className="w-4 h-4 text-current" />}
            <span>{isSaving ? 'Saving…' : isDirty ? 'Save & publish' : 'All changes saved'}</span>
          </button>
        }
      />

      {/* Add form */}
      <form onSubmit={handleAdd} className="bg-white rounded-2xl p-5 sm:p-6 border border-line space-y-3">
        <h2 className="text-base font-semibold text-ink">Add a reel</h2>
        <p className="text-sm text-ink-muted">
          On Instagram open the reel → tap ⋯ / Share → <strong>Copy link</strong>, then paste it below.
        </p>
        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="url"
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            placeholder="https://www.instagram.com/reel/…"
            className="sag-input h-12 flex-1 min-w-0"
            required
          />
          <input
            type="text"
            value={captionInput}
            onChange={(e) => setCaptionInput(e.target.value)}
            placeholder="Short caption (optional)"
            maxLength={120}
            className="sag-input h-12 md:w-64"
          />
          <button
            type="submit"
            className="h-11 px-6 sag-btn-primary text-sm flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4 text-current" />
            Add
          </button>
        </div>
        {isDirty && (
          <p className="inline-flex rounded-md bg-sale-tint px-3 py-1 text-xs font-semibold text-sale">You have unsaved changes. Click "Save &amp; Publish" to put them live.</p>
        )}
      </form>

      {/* List */}
      {draft.length === 0 ? (
        <div className="bg-white rounded-2xl px-6 py-14 border border-dashed border-line text-center text-sm text-ink-muted">
          <span className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-sunken text-ink flex items-center justify-center"><Instagram className="w-6 h-6 text-current" /></span>
          No reels yet. Until you add some, the homepage shows a "Follow us on Instagram" card linking to {profile.handle}.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {draft.map((reel, index) => (
            <div key={reel.url} className="bg-white rounded-2xl border border-line overflow-hidden flex flex-col">
              <div className="bg-page flex justify-center border-b border-line">
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
                  maxLength={120}
                  className="sag-input h-12"
                />
                <div className="flex items-center justify-between gap-2 mt-auto">
                  <span className="w-8 h-8 rounded-full bg-ink text-white text-sm font-semibold flex items-center justify-center">{index + 1}</span>
                  <div className="flex items-center gap-0.5">
                    <a href={reel.url} target="_blank" rel="noopener noreferrer" className="w-11 h-11 inline-flex items-center justify-center rounded-full text-ink hover:bg-sunken transition-colors" title="Open on Instagram" aria-label="Open on Instagram">
                      <ExternalLink className="w-4 h-4 text-current" />
                    </a>
                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="w-11 h-11 inline-flex items-center justify-center rounded-full text-ink hover:bg-sunken transition-colors disabled:opacity-30 cursor-pointer" title="Move up" aria-label="Move up">
                      <ArrowUp className="w-4 h-4 text-current" />
                    </button>
                    <button type="button" onClick={() => move(index, 1)} disabled={index === draft.length - 1} className="w-11 h-11 inline-flex items-center justify-center rounded-full text-ink hover:bg-sunken transition-colors disabled:opacity-30 cursor-pointer" title="Move down" aria-label="Move down">
                      <ArrowDown className="w-4 h-4 text-current" />
                    </button>
                    <button type="button" onClick={() => setDraft(draft.filter((r) => r.url !== reel.url))} className="w-11 h-11 inline-flex items-center justify-center rounded-full hover:bg-danger-tint transition-colors cursor-pointer" title="Remove" aria-label="Remove">
                      <Trash2 className="w-4 h-4 text-danger" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
