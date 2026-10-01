import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Eye, EyeOff, Sparkles, Flame, LayoutGrid, Award, TrendingUp, Gift, ShieldCheck, Star, Layers, ChevronRight } from 'lucide-react';
import { AdminTab } from '../../types';

interface SortableSectionProps {
  sec: any; // Using any for now based on previous code
  index: number;
  shortcut: { label: string; tab: AdminTab } | null;
  isEnabled: boolean;
  getSectionIcon: (key: string) => React.ReactNode;
  getSectionDescription: (key: string) => string;
  setAdminTab: (tab: AdminTab) => void;
  toggleHomepageSection: (id: string) => Promise<void>;
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
}

export const SortableHomepageSection: React.FC<SortableSectionProps> = ({ 
  sec, index, shortcut, isEnabled, getSectionIcon, getSectionDescription, setAdminTab, toggleHomepageSection, showToast 
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sec.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-3 sm:p-3.5 rounded-2xl border transition-colors duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
        isDragging ? 'shadow-[0_12px_32px_-12px_rgba(42,26,38,0.35)]' : ''
      } ${
        isEnabled
          ? 'bg-white border-[#4B1D3F]/10 hover:border-[#4B1D3F]/25'
          : 'bg-[#FBF7F3] border-dashed border-[#4B1D3F]/20'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div {...attributes} {...listeners} title="Drag to reorder" className="w-9 h-11 shrink-0 rounded-xl flex items-center justify-center cursor-grab active:cursor-grabbing text-[#4B1D3F]/50 hover:text-[#4B1D3F] hover:bg-[#F3EEF8] transition-colors touch-none">
          <GripVertical className="w-5 h-5 text-current" />
        </div>

        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center font-serif font-semibold text-sm shrink-0 ${
            isEnabled ? 'bg-[#4B1D3F] text-white' : 'bg-[#E6DDF0] text-[#2A1A26]/60'
          }`}>
            {index + 1}
          </div>

          <div className={`w-10 h-10 rounded-xl hidden min-[420px]:flex items-center justify-center shrink-0 ${
            isEnabled ? 'bg-[#F3EEF8]' : 'bg-white border border-[#4B1D3F]/10 opacity-70'
          }`}>
            {getSectionIcon(sec.key)}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h4 className={`text-sm font-semibold truncate ${isEnabled ? 'text-[#2A1A26]' : 'text-[#2A1A26]/55'}`}>
                {sec.title}
              </h4>
              {isEnabled ? (
                <span className="shrink-0 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Active
                </span>
              ) : (
                <span className="shrink-0 text-[11px] font-semibold text-[#8A2E55] bg-[#F7E4EA] px-2 py-0.5 rounded-full">
                  Hidden
                </span>
              )}
            </div>
            <p className="text-xs text-[#2A1A26]/60 mt-0.5 line-clamp-2 sm:line-clamp-1">
              {getSectionDescription(sec.key)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pl-11 sm:pl-0 shrink-0">
        {shortcut && isEnabled && (
          <button
            type="button"
            onClick={() => setAdminTab(shortcut.tab)}
            className="h-9 px-3.5 whitespace-nowrap bg-white hover:bg-[#F3EEF8] text-[#4B1D3F] rounded-full text-xs font-semibold transition-colors flex items-center gap-1 border border-[#4B1D3F]/20 cursor-pointer"
          >
            <span>{shortcut.label}</span>
            <ChevronRight className="w-3 h-3 text-current" />
          </button>
        )}
        
        <button
          type="button"
          onClick={async () => {
            await toggleHomepageSection(sec.id);
            showToast(`Section "${sec.title}" is now ${!isEnabled ? 'Visible' : 'Hidden'} on storefront.`, 'info');
          }}
          aria-pressed={isEnabled}
          title={isEnabled ? 'Visible: tap to hide' : 'Hidden: tap to show'}
          className="h-9 pl-3 pr-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer border border-[#4B1D3F]/15 bg-white hover:bg-[#F3EEF8] text-[#2A1A26]/80"
        >
          {isEnabled ? <Eye className="w-3.5 h-3.5 text-[#4B1D3F]" /> : <EyeOff className="w-3.5 h-3.5 text-[#2A1A26]/50" />}
          <span className="w-12 text-left">{isEnabled ? 'Visible' : 'Hidden'}</span>
          <span className={`relative w-9 h-5 rounded-full transition-colors ${isEnabled ? 'bg-[#4B1D3F]' : 'bg-[#E6DDF0]'}`} aria-hidden="true">
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${isEnabled ? 'translate-x-4' : ''}`} />
          </span>
        </button>
      </div>
    </div>
  );
};
