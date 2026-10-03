/** Used only until the owner saves a support email in Admin -> Settings -> Store Details. */
export const DEFAULT_SUPPORT_EMAIL = 'contact.suitauragirls@gmail.com';

export const SUPPORT_PHONE = '8739835310';
export const SUPPORT_PHONE_DISPLAY = '+91 87398 35310';
export const SUPPORT_WHATSAPP_NUMBER = `91${SUPPORT_PHONE}`;

export const STORE_ADDRESS_LINES = [
  'Shop No. 23,',
  'Asansol Junction Railway Station, Station Road,',
  'Asansol, Paschim Bardhaman,',
  'West Bengal - 713301, India.',
] as const;

export const STORE_ADDRESS = STORE_ADDRESS_LINES.join(' ');
export const STORE_MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(STORE_ADDRESS)}`;
export const STORE_INSTAGRAM_URL = 'https://www.instagram.com/suit_aura_girls/';

export const createSupportWhatsAppUrl = (message: string) =>
  `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
