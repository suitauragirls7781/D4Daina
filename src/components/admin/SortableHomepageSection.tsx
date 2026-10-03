import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Eye, EyeOff, Sparkles, Flame, LayoutGrid, Award, TrendingUp, Gift, ShieldCheck, Star, Layers, ChevronRight } from 'lucide-react';
import { AdminTab } from '../../types';
import { tone, ui } from './kidsToysShared';

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
      className={`pl-1 pr-3 py-2 sm:pr-3.5 rounded-xl border transition-colors duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-x-3 gap-y-1.5 ${
        isDragging ? 'shadow-[var(--sag-shadow-pop)]' : ''
      } ${
        isEnabled
          ? 'bg-white border-line'
          : 'bg-page border-line'
      }`}
    >
      <div className="flex items-center gap-1 min-w-0">
        <div {...attributes} {...listeners} title="Drag to reorder" aria-label={`Drag to reorder ${sec.title}`} className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing text-ink-muted hover:text-ink hover:bg-sunken transition-colors touch-none">
          <GripVertical className="w-5 h-5 text-current" />
        </div>

        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-7 h-7 rounded-md flex items-center justify-center font-bold text-[13px] sag-num shrink-0 ${
            isEnabled ? 'bg-ink text-white' : 'bg-sunken-deep text-ink-muted'
          }`}>
            {index + 1}
          </div>

          <div aria-hidden="true" className={`w-9 h-9 rounded-[10px] hidden min-[420px]:flex items-center justify-center shrink-0 ${
            isEnabled ? 'bg-sunken' : 'bg-white border border-line'
          }`}>
            {getSectionIcon(sec.key)}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h4 className={`text-sm leading-5 font-semibold truncate ${isEnabled ? 'text-ink' : 'text-ink-muted'}`}>
                {sec.title}
              </h4>
              {isEnabled ? (
                <span className={`shrink-0 ${ui.badge} ${tone.ok}`}>
                  Active
                </span>
              ) : (
                <span className={`shrink-0 ${ui.badge} ${tone.muted}`}>
                  Hidden
                </span>
              )}
            </div>
            <p className="text-[13px] leading-[18px] text-ink-muted mt-0.5 line-clamp-2 sm:line-clamp-1">
              {getSectionDescription(sec.key)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 pl-11 sm:pl-0 shrink-0">
        {shortcut && isEnabled && (
          <button
            type="button"
            onClick={() => setAdminTab(shortcut.tab)}
            className={`${ui.small} whitespace-nowrap`}
          >
            <span>{shortcut.label}</span>
            <ChevronRight className="w-3.5 h-3.5 text-current" />
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
          className="h-11 md:h-9 pl-3 pr-2 rounded-[10px] text-[13px] font-semibold transition-colors flex items-center gap-2 cursor-pointer border-[1.5px] border-control bg-white hover:bg-sunken text-ink"
        >
          {isEnabled ? <Eye className="w-4 h-4 text-ink" /> : <EyeOff className="w-4 h-4 text-ink-muted" />}
          <span className="w-12 text-left">{isEnabled ? 'Visible' : 'Hidden'}</span>
          <span className={`relative w-9 h-5 rounded-full transition-colors ${isEnabled ? 'bg-brand' : 'bg-control'}`} aria-hidden="true">
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-4' : ''}`} />
          </span>
        </button>
      </div>
    </div>
  );
};
