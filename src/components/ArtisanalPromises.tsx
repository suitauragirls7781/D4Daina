import React from 'react';
import { Assurance } from './Assurance';
import { HOME_WRAP } from './HomeSections';

/**
 * Homepage "promises" strip. It shows the four facts the store stands behind (worded once, in Assurance.tsx):
 * secure online payment, 7-day returns & exchange, delivery across India and WhatsApp help.
 * No fabric, weaving or dispatch-time claims are made here, because the owner has not confirmed any.
 */
export const ArtisanalPromises: React.FC = () => (
  <section id="artisanal-promises-strip" aria-label="Shopping with us" className="w-full py-4 lg:py-8">
    <div className={HOME_WRAP}>
      <Assurance variant="grid" whatsappMessage="Hi Suit Aura Girls, I need some help." />
    </div>
  </section>
);
