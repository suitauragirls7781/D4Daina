import React from 'react';
import { Assurance } from './Assurance';
import { HOME_WRAP } from './HomeSections';

/**
 * Homepage "promises" strip. It shows the four facts the store stands behind (worded once, in Assurance.tsx):
 * secure online payment, 45-day returns & exchange, delivery across India and WhatsApp help.
 * No fabric, weaving or dispatch-time claims are made here, because the owner has not confirmed any.
 * A forest section: the page takes that colour while it is under the reader's eye, and the facts follow it.
 */
export const ArtisanalPromises: React.FC = () => (
  <section id="artisanal-promises-strip" aria-label="Shopping with us" data-th="forest" className="w-full py-16 lg:py-24">
    <div className={HOME_WRAP}>
      <Assurance variant="grid" whatsappMessage="Hi Suit Aura Girls, I need some help." />
    </div>
  </section>
);
