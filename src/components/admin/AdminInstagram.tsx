import React, { useEffect, useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { ArrowDown, ArrowUp, ExternalLink, Instagram, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import type { InstagramReel } from '../../types';
import { instagramEmbedUrl, instagramProfile, normalizeInstagramUrl } from '../../utils/instagram';

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
      <div className="bg-[#241D1B] p-6 rounded-2xl border border-[#9A6A3A]/40 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-[#9A6A3A]/50 rounded-full text-xs font-bold text-[#E9D7B9]">
            <Instagram className="w-4 h-4" />
            <span>{profile.handle}</span>
          </div>
          <h1 className="font-serif font-black text-2xl text-white">Instagram Reels</h1>
          <p className="text-xs text-[#F1E8DF]/80 font-sans max-w-xl">
            Paste links of your reels or posts. They play inside the homepage "Follow the Aura" section, in the order shown here.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !isDirty}
          className="px-5 py-2.5 bg-[#C5A572] hover:bg-[#D6B884] disabled:opacity-50 disabled:cursor-not-allowed text-[#211C1A] text-xs font-bold rounded-xl flex items-center gap-2 transition cursor-pointer shrink-0"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{isSaving ? 'SAVING…' : isDirty ? 'SAVE & PUBLISH' : 'ALL CHANGES SAVED'}</span>
        </button>
      </div>

      {/* Add form */}
      <form onSubmit={handleAdd} className="bg-white rounded-2xl p-5 border border-[#9A6A3A]/35 shadow-xs space-y-3">
        <h2 className="text-sm font-serif font-bold text-[#211C1A]">Add a reel</h2>
        <p className="text-xs text-gray-600">
          On Instagram open the reel → tap ⋯ / Share → <strong>Copy link</strong>, then paste it below.
        </p>
        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="url"
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            placeholder="https://www.instagram.com/reel/…"
            className="flex-1 px-4 py-2.5 rounded-xl border border-[#9A6A3A]/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A572]"
            required
          />
          <input
            type="text"
            value={captionInput}
            onChange={(e) => setCaptionInput(e.target.value)}
            placeholder="Short caption (optional)"
            maxLength={120}
            className="md:w-64 px-4 py-2.5 rounded-xl border border-[#9A6A3A]/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A572]"
          />
          <button
            type="submit"
            className="px-5 py-2.5 bg-[#3D0F1F] hover:bg-[#561A2E] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            ADD
          </button>
        </div>
        {isDirty && (
          <p className="text-xs font-semibold text-amber-700">You have unsaved changes. Click "Save &amp; Publish" to put them live.</p>
        )}
      </form>

      {/* List */}
      {draft.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 border border-dashed border-[#9A6A3A]/40 text-center text-sm text-gray-600">
          No reels yet. Until you add some, the homepage shows a "Follow us on Instagram" card linking to {profile.handle}.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {draft.map((reel, index) => (
            <div key={reel.url} className="bg-white rounded-2xl border border-[#9A6A3A]/30 shadow-xs overflow-hidden flex flex-col">
              <div className="bg-[#FAF7F2] flex justify-center">
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
                  className="w-full px-3 py-2 rounded-lg border border-[#9A6A3A]/30 text-xs focus:outline-none focus:ring-2 focus:ring-[#C5A572]"
                />
                <div className="flex items-center justify-between gap-2 mt-auto">
                  <span className="text-[11px] font-bold text-gray-500">#{index + 1}</span>
                  <div className="flex items-center gap-1.5">
                    <a href={reel.url} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg border border-[#9A6A3A]/30 hover:bg-[#FAF7F2]" title="Open on Instagram">
                      <ExternalLink className="w-4 h-4 text-[#211C1A]" />
                    </a>
                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="p-2 rounded-lg border border-[#9A6A3A]/30 hover:bg-[#FAF7F2] disabled:opacity-30 cursor-pointer" title="Move up">
                      <ArrowUp className="w-4 h-4 text-[#211C1A]" />
                    </button>
                    <button type="button" onClick={() => move(index, 1)} disabled={index === draft.length - 1} className="p-2 rounded-lg border border-[#9A6A3A]/30 hover:bg-[#FAF7F2] disabled:opacity-30 cursor-pointer" title="Move down">
                      <ArrowDown className="w-4 h-4 text-[#211C1A]" />
                    </button>
                    <button type="button" onClick={() => setDraft(draft.filter((r) => r.url !== reel.url))} className="p-2 rounded-lg border border-rose-200 hover:bg-rose-50 cursor-pointer" title="Remove">
                      <Trash2 className="w-4 h-4 text-rose-700" />
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
