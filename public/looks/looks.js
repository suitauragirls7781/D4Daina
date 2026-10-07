// Design previews for the owner: shared pieces. Products, prices, ratings, reviews, the coupon and the store
// facts below are the store's real ones (read from its database on 2026-10-07); nothing here is invented.
const MEDIA = 'https://media.suitauragirls.in/i/product-images/';
const img = (id, w = 480) => `${MEDIA}${id}/w${w}.webp`;
const rs = (n) => '₹' + n.toLocaleString('en-IN');
const P = [
  { s: 'Cold-shoulder kurti palazzo combo set', n: 'Floral Embroidered Cold-Shoulder Kurti Palazzo Combo Set', p: 850, m: 1499, d: 43, r: 4.7, c: 9, i: 'tfqqvjciw7oivdtfmzwx', col: 10, best: 1 },
  { s: 'Asymmetric kurta with white flared skirt', n: 'Solid Colored Asymmetric Kurta with White Flared Skirt Set', p: 850, m: 1999, d: 57, r: 4.8, c: 4, i: 'ccpc3qzsafzwwbffrreb', col: 7, best: 1 },
  { s: 'Embroidered cold shoulder kurta palazzo set', n: 'Embroidered Cold Shoulder Asymmetric Kurta with White Palazzo Set', p: 550, m: 999, d: 45, r: 4.0, c: 1, i: 'hq2aynnnjhesnmk5hzwl', col: 5, best: 1 },
  { s: 'Floral designer kurti palazzo set', n: 'Floral Embroidered Designer Kurti Palazzo Set', p: 1350, m: 1999, d: 32, i: 'sdi821jghuv7hq5fhhaj', col: 5 },
  { s: 'Royal blue crop top, skirt and jacket', n: 'Royal Blue Crop Top and Flared Skirt with Floral Jacket', p: 1299, m: 1899, d: 32, i: 'nmnzuj6tr9fy2qaooppg', col: 2 },
  { s: 'Layered chiffon party maxi dress', n: 'Layered Chiffon Party Wear Maxi Dress', p: 799, m: 1299, d: 38, i: 'aa7rnosywyyuhuq8izuk', col: 5 },
  { s: 'Black kurta with matching sharara', n: 'Black Kurta with Scalloped Edges and Matching Sharara Set', p: 750, m: 1199, d: 37, i: 'xcdweiucjaay6gxxhff7', col: 3 },
  { s: 'Princess party gown', n: 'Princess Party Gown', p: 799, m: 999, d: 20, i: 'ey9bsq3lnlnsprb4r55d', col: 1 },
];
// Collections with the number of published styles in each
const CATS = [['Suits', 7, P[0]], ['Dresses', 2, P[5]], ['Co-ord sets', 1, P[4]], ['Baby girls', 3, P[7]]];
// Real reviews from verified purchases on the store
const R = [
  { n: 'Hasina', l: 'Delhi', r: 5, t: 'पहली बार यहां से order किया था, थोड़ा doubt था। लेकिन suit मिलने के बाद अच्छा लगा।' },
  { n: 'Riya Meena', l: 'Jaipur', r: 5, t: 'Suit bahut pyara hai, colour bhi bilkul same mila. Fitting bhi achhi hai 😊' },
  { n: 'Kajal', l: 'Delhi', r: 5, t: 'Parcel mil gaya. Quality achhi hai aur colour bhi same hai. Mujhe personally kaafi pasand aaya' },
  { n: 'Neha Sharma', l: 'Bangalore', r: 5, t: 'Suit mujhe kaafi achha laga ❤️ Colour exactly picture jaisa hai aur fitting bhi nice hai.' },
];
const REVIEWS = { avg: '4.7', n: 27, five: 19, four: 8 };
const FACTS = [['lock', 'Secure UPI payment', 'Online payment only'], ['ret', '7-day returns & exchange', 'Easy request from My orders'], ['truck', 'Delivery across India', 'Tracked on this site'], ['wa', 'Help on WhatsApp', 'Chat with the store']];
const LOGO = '/suit-aura-mark-132.webp';

const PATHS = {
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  ret: '<path d="M4 9h11a5 5 0 0 1 0 10H8"/><path d="M8 5 4 9l4 4"/>',
  wa: '<path d="M4 20l1.4-4.2A8 8 0 1 1 8.5 19z"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/>',
  home: '<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  chev: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m5 9 7 7 7-7"/>',
  shield: '<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="m9 12 2.2 2.2L15 10.5"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  box: '<path d="M4 8 12 4l8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  tag: '<path d="M4 4h8l8 8-8 8-8-8z"/><circle cx="9" cy="9" r="1.5"/>',
  phone: '<path d="M6 3h4l1.5 5-2.5 1.5a11 11 0 0 0 5.5 5.5L16 12.5l5 1.5v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  star: '<path d="m12 4 2.5 5 5.5.8-4 3.9.9 5.5L12 16.6 7.1 19.2 8 13.7 4 9.8 9.5 9z"/>',
  insta: '<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.5"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 11 7.6-4M8.2 13l7.6 4"/>',
};
const ic = (name, size = 20, cls = '') => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" class="${cls}">${PATHS[name]}</svg>`;
const stars = (n = 5, size = 13) => `<span class="r" style="gap:1px;color:var(--c2)">${ic('star', size, 'fl').repeat(n)}</span>`;
const pr = (p, big) => `<span class="prc${big ? ' big' : ''}"><b>${rs(p.p)}</b><s>${rs(p.m)}</s><em>${p.d}% off</em></span>`;
const rt = (p) => (p.r ? `<span class="rt">${p.r.toFixed(1)} ★ <i>(${p.c})</i></span>` : '');
const ph = (p, style = '', w = 480) => `<img class="ph" style="${style}" src="${img(p.i, w)}" alt="" loading="lazy">`;
const cir = (name, size = 40, cls = 't1', icon = 20) => `<span class="cir ${cls}" style="width:${size}px;height:${size}px">${ic(name, icon)}</span>`;
const logo = (size = 40) => `<img class="logo" src="${LOGO}" width="${size}" height="${size}" alt="">`;
const brand = (style = '') => `<span class="br" style="${style}">SUIT AURA <b>GIRLS</b></span>`;
const safe = (text = 'Secure UPI payment · 7-day returns & exchange') => `<p class="m x r ctr" style="gap:5px">${ic('lock', 13)}${text}</p>`;
const factRows = () => FACTS.map(([i, a, b]) => `<div class="r" style="gap:10px">${cir(i, 38, 't1', 19)}<div class="f1"><div class="t" style="font-size:13px">${a}</div><div class="m x">${b}</div></div></div>`).join('');

// The three product cards (section 5), reused wherever a list of products is drawn
const cardRow = (p) => `<div class="card r" style="padding:8px;gap:11px;align-items:stretch"><div style="width:40%">${ph(p, 'border-radius:13px')}</div><div class="f1 c" style="gap:5px;padding:3px 0">${p.best ? '<span><span class="bd">Bestseller</span></span>' : ''}<div class="nm" style="-webkit-line-clamp:3">${p.n}</div><div>${rt(p)}</div>${pr(p)}<span class="bt s b3" style="margin-top:auto">${ic('bag', 15)}Add to bag</span></div></div>`;
const cardGrid = (p) => `<div class="card" style="overflow:hidden"><div style="position:relative">${ph(p)}<span class="cir wh" style="position:absolute;top:7px;right:7px;width:30px;height:30px">${ic('heart', 16)}</span></div><div class="c" style="padding:8px 9px 10px;gap:4px"><div class="nm">${p.s}</div><div class="r" style="gap:5px">${rt(p)}${p.best ? '<span class="bd">Bestseller</span>' : ''}</div>${pr(p)}</div></div>`;
const cardBig = (p) => `<div class="card" style="overflow:hidden"><div style="position:relative">${ph(p, 'aspect-ratio:1/1', 640)}<span class="cir wh" style="position:absolute;top:9px;right:9px;width:36px;height:36px">${ic('heart', 18)}</span></div><div class="c pd" style="gap:6px"><div class="r sb">${p.best ? '<span class="bd">Bestseller</span>' : '<span class="bd">New</span>'}${rt(p)}</div><div class="t">${p.n}</div>${pr(p, 1)}<div class="m">${p.col} colours · Sizes XS to XXL</div><div class="r" style="margin-top:4px"><span class="bt b2 f1">Buy now</span><span class="bt b3 f1">Add to bag</span></div>${safe()}</div></div>`;
const mini = (p, width = 132) => `<div style="width:${width}px" class="c" style="gap:5px">${ph(p, 'border-radius:14px')}<div class="nm" style="margin-top:6px">${p.s}</div>${pr(p)}</div>`;

const S = [];
