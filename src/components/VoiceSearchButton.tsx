import React, { useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
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
      title={listening ? 'Listening… tap to stop' : undefined}
      className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center cursor-pointer transition-opacity ${listening ? 'bg-brand text-[color:var(--sag-on-gold)] ring-1 ring-highlight' : 'text-ink-muted hover:opacity-70'} ${className}`}>
      {/* Listening is shown by the emerald fill with a champagne edge and a square "stop" mark; nothing pulses */}
      {listening
        ? <Square className="w-3.5 h-3.5 fill-current" strokeWidth={1.75} aria-hidden="true" />
        : <Mic className="w-[18px] h-[18px]" strokeWidth={1.75} aria-hidden="true" />}
    </button>
  );
};
