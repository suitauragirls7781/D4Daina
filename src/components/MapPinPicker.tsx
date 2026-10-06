import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Crosshair, Loader2, Search } from 'lucide-react';
import { PinIcon } from './StoreIcons';
import type { Map as LeafletMap } from 'leaflet';
import { PlaceResult, reversePlace, searchPlaces } from '../lib/addressBook';

/**
 * Location step of the address sheet: search, "use current location" and a map with a fixed centre pin.
 * Leaflet (and its CSS) is loaded only when this component mounts, so it never enters the main bundle.
 * Map tiles and address lookups come from OpenStreetMap (Nominatim is kept to one request per second).
 */

const INDIA_CENTER: [number, number] = [22.5, 79];
const INDIA_ZOOM = 5;
/** Below this zoom the pin covers a whole town, so we do not guess an address. */
const MIN_DETAIL_ZOOM = 14;
const PLACE_ZOOM = 17;
const REVERSE_DEBOUNCE_MS = 800;


const MapPin: React.FC<{ lifted: boolean }> = ({ lifted }) => (
  <div className="pointer-events-none absolute left-1/2 top-1/2 z-[500] -translate-x-1/2 -translate-y-full" aria-hidden="true">
    <svg
      width="36"
      height="46"
      viewBox="0 0 36 46"
      className={`block transition-transform duration-200 ${lifted ? '-translate-y-2' : ''}`}
      style={{ filter: 'drop-shadow(0 2px 3px rgba(27, 26, 23, 0.35))' }}
    >
      <path d="M18 1C8.6 1 1 8.5 1 17.8 1 30.4 18 45 18 45s17-14.6 17-27.2C35 8.5 27.4 1 18 1z" fill="#5B3FD1" stroke="#FFFFFF" strokeWidth="2" />
      <circle cx="18" cy="17.5" r="6" fill="#FFFFFF" />
    </svg>
    <span className="absolute left-1/2 -bottom-1 w-2 h-2 -translate-x-1/2 rounded-full bg-ink/50" />
  </div>
);

export const MapPinPicker: React.FC<{
  onConfirm: (place: PlaceResult) => void;
  onManual: () => void;
}> = ({ onConfirm, onManual }) => {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const reverseTimer = useRef<number>(0);
  const reverseAbort = useRef<AbortController | null>(null);

  const [mapState, setMapState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [tilesBlocked, setTilesBlocked] = useState(false);
  const [moving, setMoving] = useState(false);
  const [zoomedIn, setZoomedIn] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState('');
  const [locating, setLocating] = useState(false);

  const [detected, setDetected] = useState<PlaceResult | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState('');

  const cancelReverse = () => {
    window.clearTimeout(reverseTimer.current);
    reverseAbort.current?.abort();
    reverseAbort.current = null;
  };

  const lookupAt = (lat: number, lon: number, delay: number) => {
    cancelReverse();
    setDetecting(true);
    setDetectError('');
    reverseTimer.current = window.setTimeout(() => {
      const controller = new AbortController();
      reverseAbort.current = controller;
      reversePlace(lat, lon, controller.signal)
        .then((place) => {
          if (controller.signal.aborted) return;
          setDetected(place ? { ...place, lat, lon } : null);
          setDetectError(place ? '' : 'We could not find an address at this spot. Move the pin a little, or enter the address manually.');
        })
        .catch((err) => {
          if (err?.name === 'AbortError' || controller.signal.aborted) return;
          setDetected(null);
          setDetectError('Address lookup is unavailable right now. Please enter the address manually.');
        })
        .finally(() => { if (!controller.signal.aborted) setDetecting(false); });
    }, delay);
  };
  const lookupAtRef = useRef(lookupAt);
  lookupAtRef.current = lookupAt;

  // Load Leaflet + CSS lazily and create the map
  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')])
      .then(([mod]) => {
        if (disposed || !mapEl.current) return;
        const L = ((mod as any).default ?? mod) as typeof import('leaflet');
        const map = L.map(mapEl.current, { center: INDIA_CENTER, zoom: INDIA_ZOOM, zoomControl: true, attributionControl: true });
        mapRef.current = map;
        map.attributionControl.setPrefix(false);
        let loaded = 0;
        let failed = 0;
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
        })
          .on('tileload', () => { loaded += 1; setTilesBlocked(false); })
          .on('tileerror', () => { failed += 1; if (!loaded && failed >= 4) setTilesBlocked(true); })
          .addTo(map);

        map.on('movestart', () => { setMoving(true); cancelReverse(); });
        map.on('moveend', () => {
          setMoving(false);
          const zoom = map.getZoom();
          setZoomedIn(zoom >= MIN_DETAIL_ZOOM);
          if (zoom < MIN_DETAIL_ZOOM) { cancelReverse(); setDetecting(false); setDetected(null); setDetectError(''); return; }
          const c = map.getCenter();
          lookupAtRef.current(Number(c.lat.toFixed(6)), Number(c.lng.toFixed(6)), REVERSE_DEBOUNCE_MS);
        });

        // The sheet animates in, so re-measure once it has settled and whenever it resizes
        window.setTimeout(() => map.invalidateSize(), 250);
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => map.invalidateSize());
          resizeObserver.observe(mapEl.current);
        }
        setMapState('ready');
      })
      .catch((err) => {
        console.warn('Map could not load:', err);
        if (!disposed) setMapState('error');
      });
    return () => {
      disposed = true;
      cancelReverse();
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Debounced search (500 ms); addressBook.ts keeps Nominatim to one request per second
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) { setResults([]); setSearching(false); return; }
    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchPlaces(q, controller.signal)
        .then((rows) => { setResults(rows); setMessage(rows.length ? '' : 'No places found. Try a nearby area or landmark, or enter the address manually.'); })
        .catch((err) => { if (err?.name !== 'AbortError') setMessage('Location search is unavailable right now. Please enter the address manually.'); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 500);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  /** Moves the map (the pin lookup then runs on moveend); without a map, uses the place as found. */
  const goTo = (lat: number, lon: number, fallback?: PlaceResult | null) => {
    const map = mapRef.current;
    if (map) {
      map.setView([lat, lon], Math.max(map.getZoom(), PLACE_ZOOM));
    } else if (fallback) {
      setDetected(fallback);
      setDetectError('');
    } else {
      lookupAt(lat, lon, 0);
    }
  };

  const pickResult = (place: PlaceResult) => {
    setResults([]);
    setQuery('');
    setMessage('');
    if (place.lat !== undefined && place.lon !== undefined) goTo(place.lat, place.lon, place);
    else { setDetected(place); setDetectError(''); }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMessage('Location is not supported by this browser. Please search or enter the address manually.');
      return;
    }
    setLocating(true);
    setMessage('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        goTo(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        setLocating(false);
        setMessage(error.code === error.PERMISSION_DENIED
          ? 'Location permission was denied. Allow location access in your browser settings, or search for your area instead.'
          : 'Could not get your location. Please search for your area or enter the address manually.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const hint = mapState === 'ready' && !zoomedIn && !detected
    ? 'Search or use your current location, then drag the map so the pin sits on your door.'
    : '';

  // Caution note: sale-tint fill with a sale-line left rule, ink text
  const note = 'rounded-control border-l-4 border-sale-line bg-sale-tint px-3.5 py-3 text-sm leading-5 text-ink';

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="sag-label">Search area, street or locality</span>
        <span className="relative block">
          <Search className="w-5 h-5 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={1.75} aria-hidden="true" />
          <input
            data-autofocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Sector 21, Gurugram"
            autoComplete="off"
            className="sag-input pl-11 pr-11"
          />
          {searching && <Loader2 className="w-[18px] h-[18px] animate-spin text-ink-muted absolute right-3.5 top-1/2 -translate-y-1/2" aria-label="Searching" />}
        </span>
      </label>

      {results.length > 0 && (
        <ul className="rounded-control border border-line bg-white divide-y divide-line overflow-hidden" aria-label="Places found">
          {results.map((place) => (
            <li key={place.id}>
              <button type="button" onClick={() => pickResult(place)} className="w-full min-h-[52px] text-left flex items-start gap-3 px-3.5 py-3 text-ink hover:bg-sunken cursor-pointer transition-colors">
                <PinIcon className="w-5 h-5 shrink-0" live={false} />
                <span className="min-w-0 text-sm leading-5 text-ink break-words">{place.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={useCurrentLocation} disabled={locating} className="sag-btn-outline w-full h-12 px-4 gap-2 text-[15px]">
        {locating ? <Loader2 className="w-[18px] h-[18px] animate-spin text-current" aria-hidden="true" /> : <Crosshair className="w-[18px] h-[18px] text-current" strokeWidth={1.75} aria-hidden="true" />}
        {locating ? 'Finding your location…' : 'Use current location'}
      </button>

      {message && <p role="status" className={note}>{message}</p>}

      {mapState === 'error' ? (
        <p role="status" className={note}>
          The map could not load right now. You can still search above, use your current location, or enter the address manually.
        </p>
      ) : (
        <div className="relative isolate h-[260px] sm:h-[320px] rounded-card overflow-hidden border border-line bg-sunken">
          <div ref={mapEl} className="absolute inset-0 z-0" role="application" aria-label="Map. Drag to move the pin to your delivery spot." />
          {mapState === 'loading' && (
            <div className="absolute inset-0 z-[600] flex items-center justify-center gap-2 text-sm text-ink-muted">
              <Loader2 className="w-5 h-5 animate-spin text-ink-muted" aria-hidden="true" /> Loading map…
            </div>
          )}
          {mapState === 'ready' && <MapPin lifted={moving} />}
          {tilesBlocked && (
            <p role="status" className="absolute left-3 right-3 top-3 z-[600] rounded-control bg-white px-3 py-2 text-[13px] leading-[18px] text-ink border border-line">
              Map images could not load on this network. You can still search, use your location, or enter the address manually.
            </p>
          )}
        </div>
      )}

      {hint && <p className="text-[13px] leading-[18px] text-ink-muted">{hint}</p>}

      {(detected || detecting || detectError) && (
        <div className="sag-card p-4 space-y-3" aria-live="polite">
          <p className="flex items-center gap-2 text-sm leading-5 font-semibold text-ink"><PinIcon className="w-5 h-5 shrink-0" live={false} /> Deliver to</p>
          {detecting ? (
            <p className="flex items-center gap-2 text-sm leading-5 text-ink-muted"><Loader2 className="w-[18px] h-[18px] animate-spin text-ink-muted" aria-hidden="true" /> Finding the address at the pin…</p>
          ) : detectError ? (
            <p className="flex items-start gap-2 text-sm leading-5 font-medium text-danger"><AlertCircle className="w-[18px] h-[18px] mt-px shrink-0" aria-hidden="true" />{detectError}</p>
          ) : detected ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm leading-5">
              {([
                ['Area', [detected.street, detected.area].filter(Boolean).join(', ')],
                ['City', detected.city],
                ['District', detected.district],
                ['State', detected.state],
                ['PIN', detected.pincode],
              ] as const).map(([label, value]) => (
                <React.Fragment key={label}>
                  <dt className="text-ink-muted">{label}</dt>
                  <dd className="text-ink min-w-0 break-words">{value || <span className="text-ink-faint">Not found</span>}</dd>
                </React.Fragment>
              ))}
            </dl>
          ) : null}
          <p className="text-[13px] leading-[18px] text-ink-muted">You can correct anything on the next step.</p>
          <button
            type="button"
            disabled={!detected || detecting}
            onClick={() => detected && onConfirm(detected)}
            className="sag-btn-primary w-full h-12 px-4"
          >
            Confirm location
          </button>
        </div>
      )}

      <button type="button" onClick={onManual} className="sag-link w-full justify-center">
        Enter address manually
      </button>
    </div>
  );
};

export default MapPinPicker;
