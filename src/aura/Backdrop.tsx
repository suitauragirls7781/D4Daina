import { useEffect } from 'react';
import { addScrollFx, clamp, docTop, requestMeasure } from './scroll';

// The page's colour. Mount <Backdrop /> ONCE (the site frame does). It draws one fixed layer behind the page
// and keeps <body data-th="..."> equal to the theme of the section under the reader's eye:
//
//   <section data-th="ink"> ... </section>      paper | ink | blush | forest | rose | sand
//
// While a section is "under the eye" (its top has passed 45% of the screen height and its bottom has not;
// near the end of the page the eye slides down to the bottom edge), the backdrop cross-fades to that colour (a CSS transition on background-color) and the section variables
// --fg --inv --mu --hl --ac --sa --th switch with it, so text coloured through them (or simply inherited)
// follows. Sections stay transparent; a white card inside takes aura-lt. Where no themed section is under
// the eye the page is paper. The attribute is written only when the theme really changes.

export type AuraTheme = 'paper' | 'ink' | 'blush' | 'forest' | 'rose' | 'sand';
const THEMES: readonly string[] = ['paper', 'ink', 'blush', 'forest', 'rose', 'sand'];

interface Band { el: HTMLElement; top: number; bottom: number; theme: string; }
let bands: Band[] = [];
let current = '';
let pageHeight = 0;

const collect = () => {
  pageHeight = document.documentElement.scrollHeight;
  bands = Array.from(document.querySelectorAll<HTMLElement>('[data-th]'))
    .filter((el) => el !== document.body && THEMES.includes(el.dataset.th || '') && el.offsetParent !== null)
    .map((el) => { const top = docTop(el); return { el, top, bottom: top + el.offsetHeight, theme: el.dataset.th as string }; });
};

const apply = (theme: string) => {
  if (theme === current) return;
  current = theme;
  document.body.dataset.th = theme;
};

const pick = (y: number, vh: number) => {
  // A section that left the page (a route change) means the list is old
  if (bands.some((b) => !b.el.isConnected)) collect();
  // The eye sits at 45% of the screen; over the last half screen of the page it slides down to the bottom
  // edge, so a short last section (or the footer) still gets its colour
  const end = pageHeight - vh;
  const k = end > vh * 0.5 ? clamp((y - (end - vh * 0.5)) / (vh * 0.5)) : 0;
  const eye = y + vh * (0.45 + 0.55 * k) - 1;
  let theme = 'paper';
  for (const b of bands) if (b.top <= eye && b.bottom > eye) theme = b.theme;
  apply(theme);
};

/** Look for [data-th] sections again (after you added or removed one without the page changing size). */
export const refreshBackdrop = () => requestMeasure();

/**
 * The fixed backdrop. `watch`: anything that changes when the page changes (the pathname), so the sections
 * of the new page are picked up at once.
 */
export const Backdrop = ({ watch }: { watch?: unknown }) => {
  useEffect(() => {
    const stop = addScrollFx(document.body, ({ y, vh }) => pick(y, vh), { measure: collect });
    return () => { stop(); current = ''; delete document.body.dataset.th; };
  }, []);
  useEffect(() => { requestMeasure(); }, [watch]);
  return <div className="aura-bg" aria-hidden="true" />;
};
