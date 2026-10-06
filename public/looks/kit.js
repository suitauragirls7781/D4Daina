// Shared pieces of the design previews. Products, prices, the coupon and the store facts are the store's
// real ones (read from the live catalogue on 6 Oct 2026); nothing here is sent or saved anywhere.
const CL = 'https://res.cloudinary.com/lvc3kqwu/image/upload/';
const img = (path, w = 480) => `${CL}f_auto,q_auto,c_limit,w_${w}/${path}`;
const P1 = {
  name: 'Floral Embroidered Cold-Shoulder Kurti Palazzo Combo Set', short: 'Floral Embroidered Kurti Palazzo Set',
  price: 850, mrp: 1499, off: 43, rating: '4.7', reviews: 9, fabric: 'Soft fabric with embroidered floral detailing',
  sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL'], colours: ['Sky Blue', 'Red', 'Yellow', 'Pink', 'Royal Blue'],
  photos: ['v1791013609/suitauragirls/product-images/tfqqvjciw7oivdtfmzwx.png', 'v1791013619/suitauragirls/product-images/yp174jwmtcu46gf1tt79.png', 'v1791013627/suitauragirls/product-images/ds1jjn0nap2x5nv3lzsk.png', 'v1791013637/suitauragirls/product-images/k4yaut87ayp11ixbdrzs.png', 'v1791013646/suitauragirls/product-images/yvy0aja6ziejzci0xrxo.png'],
};
const P2 = { name: 'Heavy Mirror Work Organza Peplum Dhoti Suit Set', short: 'Mirror Work Peplum Dhoti Suit Set', price: 700, mrp: 1099, off: 36, size: 'L', colour: 'Sage Green', photo: 'v1790663060/suitauragirls/product-images/mmv35lul8e8swrk14qt4.jpg' };
const P3 = { name: 'Solid Colored Asymmetric Kurta with White Flared Skirt Set', price: 850, mrp: 1999, off: 57, photo: 'v1790841439/suitauragirls/product-images/ccpc3qzsafzwwbffrreb.png' };
// A bag of two styles: 850 + 700 = 1,550; coupon AURA10 (10% off above 999) = 155; delivery is free; to pay 1,395
const BAG = { items: 1550, mrp: 2598, coupon: 155, total: 1395, saved: 1203 };
const rs = (n) => '₹' + n.toLocaleString('en-IN');
const LOGO = '/suit-aura-mark-132.webp';

const I = {
  menu: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.600-7 10-7 10z"/></svg>',
  bag: '<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6L5 8zM9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.500"/><path d="M16 16l4 4"/></svg>',
  share: '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="2.500"/><circle cx="17" cy="6" r="2.500"/><circle cx="17" cy="18" r="2.500"/><path d="M8.200 11l6.600-3.700M8.200 13l6.600 3.700"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2.500"/><path d="M8 10V7.500a4 4 0 0 1 8 0V10"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M9 7l-4 4 4 4"/><path d="M5 11h9a5 5 0 0 1 0 10h-3"/></svg>',
  truck: '<svg viewBox="0 0 24 24"><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7z"/><circle cx="7.500" cy="17.500" r="1.800"/><circle cx="17.500" cy="17.500" r="1.800"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M4 19l1.500-4A8 8 0 1 1 9 18.500L4 19z"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s7-6.200 7-11.500A7 7 0 0 0 5 9.500C5 14.800 12 21 12 21z"/><circle cx="12" cy="9.500" r="2.500"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  tag: '<svg viewBox="0 0 24 24"><path d="M4 4h7l9 9-7 7-9-9V4z"/><circle cx="8" cy="8" r="1.300"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 6v12M6 12h12"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.500-4 5-5 8-5s6.500 1 8 5"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 8l8 5 8-5"/></svg>',
  box: '<svg viewBox="0 0 24 24"><path d="M4 8l8-4 8 4v8l-8 4-8-4V8z"/><path d="M4 8l8 4 8-4M12 12v8"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
  insta: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.500"/><circle cx="16.700" cy="7.300" r=".6"/></svg>',
  star: '<svg viewBox="0 0 24 24" style="fill:currentColor;stroke:none"><path d="M12 3.500l2.600 5.300 5.900.9-4.300 4.100 1 5.800L12 16.900 6.800 19.600l1-5.800L3.500 9.700l5.900-.9L12 3.500z"/></svg>',
  ruler: '<svg viewBox="0 0 24 24"><path d="M3 16L16 3l5 5L8 21l-5-5z"/><path d="M7 12l2 2M10 9l2 2M13 6l2 2"/></svg>',
  google: '<svg viewBox="0 0 24 24" style="stroke:none"><path fill="#4285F4" d="M21.600 12.200c0-.7-.1-1.300-.2-1.900H12v3.700h5.400a4.600 4.600 0 0 1-2 3v2.500h3.200c1.900-1.700 3-4.300 3-7.300z"/><path fill="#34A853" d="M12 22c2.700 0 5-.9 6.600-2.400l-3.200-2.500c-.9.600-2 1-3.400 1-2.600 0-4.800-1.800-5.600-4.100H3.100v2.600A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.400 14a6 6 0 0 1 0-3.900V7.500H3.100a10 10 0 0 0 0 9l3.300-2.500z"/><path fill="#EA4335" d="M12 6c1.500 0 2.800.5 3.800 1.500l2.900-2.800A10 10 0 0 0 3.100 7.500l3.300 2.600C7.200 7.800 9.400 6 12 6z"/></svg>',
  wa: '<svg viewBox="0 0 24 24" style="stroke:none;fill:#25D366"><path d="M12 3a9 9 0 0 0-7.700 13.600L3 21l4.500-1.200A9 9 0 1 0 12 3zm5.200 12.700c-.2.600-1.300 1.200-1.800 1.200-.5.100-1 .2-3.300-.7-2.800-1.100-4.500-3.900-4.700-4.100-.1-.2-1.100-1.500-1.100-2.800s.7-2 1-2.300c.2-.3.500-.3.700-.3h.5c.2 0 .4 0 .6.500l.9 2.100c.1.200.1.400 0 .5l-.4.600c-.1.200-.3.300-.1.600.2.300.8 1.300 1.700 2.100 1.200 1 2.100 1.300 2.400 1.500.3.100.5.100.6-.1l.8-1c.2-.2.400-.2.600-.1l2 .9c.3.200.5.200.5.400.1.100.1.600-.1 1z"/></svg>',
};

const miniHeader = (count = 2) => `<div class="mini-hd"><div class="pl"><img src="${LOGO}" alt=""><div class="f1"><div class="nm">SUIT AURA <b>GIRLS</b></div><div class="sub">Delivery across India</div></div><span class="ic">${I.heart}</span><span class="ic">${I.bag}${count ? `<span class="dot">${count}</span>` : ''}</span></div></div>`;
const priceLine = (p, big = 22) => `<span class="num"><span class="xb" style="font-size:${big}px">${rs(p.price)}</span> <span class="strike t13">${rs(p.mrp)}</span> <span class="salec xb t13">${p.off}% off</span></span>`;
const stars = (n = 5) => `<span class="row" style="color:var(--star)">${Array.from({ length: n }, () => I.star.replace('<svg', '<svg style="width:15px;height:15px;fill:currentColor;stroke:none"')).join('')}</span>`;
const FACTS = [['lock', 'Secure UPI payment'], ['back', '7-day returns & exchange'], ['truck', 'Delivery across India'], ['chat', 'Chat with us on WhatsApp']];

/** Draws the page: a dark strip with the instruction, then one numbered phone frame per option. */
const render = (what, opts, note = '') => {
  document.body.innerHTML = `<div class="top">${what} ke 5 design. Jo pasand aaye uska number batao (1–5). Do ko mila bhi sakte ho. <a href="/looks/">Sab preview</a><div class="jump">${opts.map((_, i) => `<a href="#o${i + 1}">${i + 1}</a>`).join('')}</div></div>
<div class="wrap">${opts.map(([title, text, html], i) => `<section class="opt" id="o${i + 1}"><h2><b>${i + 1}</b>${title}</h2><p>${text}</p><div class="frame">${html}</div></section>`).join('')}</div>
<p class="note">Yeh sirf design ke namoone hain; button kaam nahi karte. Product, daam, coupon aur store ki baatein asli hain. ${note}</p>`;
};
