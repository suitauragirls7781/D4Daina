import React, { useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import { useDiscovery } from '../utils/discovery';

const Recognition = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;

/** Mic button that turns speech into a search phrase. Hidden where the browser has no speech support. */
export const VoiceSearchButton: React.FC<{ onResult: (text: string) => void; className?: string }> = ({ onResult, className = '' }) => {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const { features } = useDiscovery();
  if (!Recognition || !features.voiceSearch) return null;

  const start = () => {
    if (listening) { recRef.current?.stop(); return; }
    const rec = new Recognition();
    rec.lang = 'en-IN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      const text = String(e.results?.[0]?.[0]?.transcript || '').trim();
      if (text) onResult(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };

  return (
    <button type="button" onClick={start} aria-label={listening ? 'Stop voice search' : 'Search by voice'} aria-pressed={listening}
      className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors ${listening ? 'bg-brand text-white animate-pulse' : 'text-ink hover:bg-sunken'} ${className}`}>
      <Mic className="w-4 h-4" />
    </button>
  );
};
