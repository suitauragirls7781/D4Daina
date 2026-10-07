// Design previews for the owner: two premium looks drawn with the store's real products, prices, ratings,
// one real review, the live festive coupon and the four store facts. Nothing here is invented.
const MEDIA = 'https://media.suitauragirls.in/i/product-images/';
const img = (id, w = 640) => `${MEDIA}${id}/w${w}.webp`;
const rs = (n) => '₹' + n.toLocaleString('en-IN');
const P = [
  { s: 'Floral embroidered cold-shoulder kurti palazzo set', p: 850, m: 1499, d: 43, r: 4.7, c: 9, i: 'tfqqvjciw7oivdtfmzwx' },
  { s: 'Solid asymmetric kurta with white flared skirt', p: 850, m: 1999, d: 57, r: 4.8, c: 4, i: 'ccpc3qzsafzwwbffrreb' },
  { s: 'Embroidered cold shoulder kurta with white palazzo', p: 550, m: 999, d: 45, r: 4.0, c: 1, i: 'hq2aynnnjhesnmk5hzwl' },
  { s: 'Floral embroidered designer kurti palazzo set', p: 1350, m: 1999, d: 32, i: 'sdi821jghuv7hq5fhhaj' },
  { s: 'Royal blue crop top, flared skirt and floral jacket', p: 1299, m: 1899, d: 32, i: 'nmnzuj6tr9fy2qaooppg' },
  { s: 'Layered chiffon party wear maxi dress', p: 799, m: 1299, d: 38, i: 'aa7rnosywyyuhuq8izuk' },
];
const CATS = [['Suits', P[0]], ['Co-ord sets', P[4]], ['Dresses', P[5]], ['Kurta sets', P[1]]];
const FACTS = [['lock', 'Secure UPI payment'], ['ret', '7-day returns & exchange'], ['truck', 'Delivery across India'], ['wa', 'Help on WhatsApp']];
const PATHS = {
  lock: '<rect x="5" y="11" width="14" height="10" rx="1.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  ret: '<path d="M4 9h11a5 5 0 0 1 0 10H8"/><path d="M8 5 4 9l4 4"/>',
  wa: '<path d="M4 20l1.4-4.2A8 8 0 1 1 8.5 19z"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/>',
  home: '<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/>',
  grid: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
  chev: '<path d="m9 5 7 7-7 7"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  star: '<path d="m12 4 2.5 5 5.5.8-4 3.9.9 5.5L12 16.6 7.1 19.2 8 13.7 4 9.8 9.5 9z"/>',
  share: '<circle cx="6" cy="12" r="2.3"/><circle cx="18" cy="6" r="2.3"/><circle cx="18" cy="18" r="2.3"/><path d="m8.1 11 7.8-4M8.1 13l7.8 4"/>',
  insta: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.5"/>',
};
const ic = (n, s = 20, cls = '') => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" class="${cls}">${PATHS[n]}</svg>`;
const pr = (p, big) => `<span class="pr${big ? ' big' : ''}"><b>${rs(p.p)}</b><s>${rs(p.m)}</s><em>${p.d}% off</em></span>`;
const rt = (p) => (p.r ? `<span class="rt">${ic('star', 12, 'fl')}${p.r.toFixed(1)} (${p.c})</span>` : '');
const ph = (p, style = '', w = 640) => `<img class="ph" style="${style}" src="${img(p.i, w)}" alt="" loading="lazy">`;
const card = (p) => `<div><div style="position:relative">${ph(p)}<span style="position:absolute;top:8px;right:8px;width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.92);display:grid;place-items:center">${ic('heart', 15)}</span></div><div style="padding-top:9px;display:grid;gap:4px"><div class="nm">${p.s}</div>${rt(p)}${pr(p)}</div></div>`;
const head = (title, link = 'View all') => `<div class="r sb" style="align-items:flex-end;margin-bottom:16px"><div class="h sm">${title}</div><span class="lk">${link}</span></div>`;
const header = (back) => `
  <div class="r sb" style="padding:13px 16px;background:var(--card);border-bottom:1px solid var(--line)">
    ${ic(back ? 'back' : 'menu', 22)}
    <span class="wm">Suit Aura Girls</span>
    <span class="r" style="gap:14px">${ic('search', 21)}<span style="position:relative">${ic('bag', 21)}<i class="dot" style="font-style:normal">1</i></span></span>
  </div>`;
const nav = (on) => `<div class="nav">${[['home', 'Home'], ['grid', 'Shop'], ['heart', 'Wishlist'], ['bag', 'Bag'], ['user', 'Account']].map(([i, l]) => `<span class="${l === on ? 'on' : ''}">${ic(i, 20)}${l}</span>`).join('')}</div>`;
const facts = () => `<div class="g2" style="gap:14px 10px">${FACTS.map(([i, a]) => `<div class="r" style="gap:9px"><span style="color:var(--acc)">${ic(i, 19)}</span><span style="font-size:12.5px;line-height:1.3">${a}</span></div>`).join('')}</div>`;

const HOME = `
  <div class="ann">Dussehra Dhamaka · Extra 10% off with code DUSSEHRA · Till 20 Oct</div>
  ${header()}
  <div>${ph(P[2], 'border-radius:0;aspect-ratio:1/1', 828)}</div>
  <div class="sec" style="text-align:center;padding-top:22px">
    <div class="lab">New season</div>
    <div class="h" style="margin-top:8px">Embroidered cold shoulder kurta with white palazzo</div>
    <div style="display:flex;justify-content:center;margin-top:10px">${pr(P[2], 1)}</div>
    <div class="r" style="margin-top:16px"><span class="bt b1 f1">Shop now</span><span class="bt b2 f1">Explore</span></div>
  </div>
  <div class="sec hl" style="padding-top:20px;padding-bottom:20px">${facts()}</div>
  <div class="sec hl">${head('Shop by category')}
    <div class="sx">${CATS.map(([n, p]) => `<div style="width:108px">${ph(p, 'aspect-ratio:3/4', 320)}<div style="font-size:13px;margin-top:8px;text-align:center">${n}</div></div>`).join('')}</div>
  </div>
  <div class="sec hl">${head('Bestsellers')}<div class="g2">${card(P[0])}${card(P[1])}${card(P[3])}${card(P[4])}</div>
    <span class="bt b2 w" style="margin-top:20px">View all styles</span>
  </div>
  <div class="sec" style="background:var(--alt);text-align:center">
    <div class="lab">Real customers</div>
    <div style="display:flex;justify-content:center;gap:2px;color:var(--accbg);margin-top:10px">${ic('star', 15, 'fl').repeat(5)}</div>
    <div class="h sm" style="font-style:italic;font-weight:400;margin-top:10px;line-height:1.4">"Suit bahut pyara hai, colour bhi bilkul same mila. Fitting bhi achhi hai."</div>
    <div class="m" style="margin-top:10px">Riya Meena, Jaipur · Verified purchase</div>
    <div class="m x" style="margin-top:12px;letter-spacing:.04em">4.7 out of 5 from 27 reviews</div>
  </div>
  <div class="sec">
    <div class="box" style="padding:16px"><div class="r" style="align-items:stretch;gap:14px"><div style="width:38%">${ph(P[2], '', 320)}</div><div class="f1" style="display:grid;gap:6px;align-content:center"><div class="lab">Deal of the day</div><div class="nm">${P[2].s}</div>${pr(P[2])}<div class="x" style="color:var(--acc);font-weight:600">You save ${rs(449)}</div><span class="bt b1" style="height:40px;margin-top:4px">View deal</span></div></div></div>
  </div>
  <div class="foot">
    <div class="wm" style="color:#fff">Suit Aura Girls</div>
    <div class="m" style="margin-top:6px">Ethnic wear · Delivery across India</div>
    <div class="g2" style="margin-top:20px;gap:12px 10px;font-size:13px">${['Track order', 'Returns & exchange', 'Shipping', 'Contact us', 'Size guide', 'Privacy'].map((l) => `<span>${l}</span>`).join('')}</div>
    <div class="r" style="margin-top:20px;gap:16px">${ic('insta', 20)}${ic('wa', 20)}</div>
    <div class="m x" style="margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,.18)">Secure UPI payment by Razorpay · Cash on delivery available · © Suit Aura Girls</div>
  </div>
  ${nav('Home')}`;

const PRODUCT = `
  ${header(true)}
  <div style="position:relative">${ph(P[0], 'border-radius:0', 828)}<span style="position:absolute;bottom:12px;right:12px;background:rgba(255,255,255,.92);font-size:11px;padding:3px 8px;border-radius:99px;letter-spacing:.04em">1 / 6</span></div>
  <div class="sx" style="padding:10px 16px 0">${[P[0], P[1], P[3], P[4], P[5]].map((p, n) => ph(p, `width:56px;${n ? 'opacity:.75' : 'outline:1px solid var(--ink);outline-offset:2px'}`, 160)).join('')}</div>
  <div class="sec" style="padding-top:18px">
    <div class="r sb" style="align-items:flex-start"><div class="f1"><div class="lab">Bestseller</div><div style="font-size:17px;line-height:1.35;margin-top:6px">Floral Embroidered Cold-Shoulder Kurti Palazzo Combo Set</div></div><span class="r" style="gap:12px;padding-top:4px">${ic('heart', 21)}${ic('share', 20)}</span></div>
    <div class="r" style="margin-top:10px">${pr(P[0], 1)}</div>
    <div class="r" style="margin-top:4px">${rt(P[0])}<span class="m x">· You save ${rs(649)}</span></div>
    <div class="box" style="margin-top:14px;padding:11px 13px;font-size:12.5px;line-height:1.5;background:var(--alt);border-color:transparent"><b style="font-weight:600">15% off</b> when you pay online · Extra 10% with code <b style="font-weight:600">DUSSEHRA</b><br>Cash on delivery available: ${rs(99)} online to confirm</div>
    <div class="r sb" style="margin-top:20px"><span style="font-size:13px"><b style="font-weight:600">Colour</b> · Sky blue</span></div>
    <div class="r" style="margin-top:10px;gap:12px">${['#9DC7E8', '#C8324A', '#E9C75A', '#F2A1B8', '#2B4C9B', '#E8D5BE'].map((c, n) => `<span class="sw${n ? '' : ' on'}" style="background:${c}"></span>`).join('')}</div>
    <div class="r sb" style="margin-top:20px"><span style="font-size:13px;font-weight:600">Size</span><span class="lk">Size guide</span></div>
    <div class="r" style="margin-top:10px;gap:8px;flex-wrap:wrap">${['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((s) => `<span class="chip${s === 'M' ? ' on' : ''}">${s}</span>`).join('')}</div>
    <span class="bt b1 w" style="margin-top:22px;height:52px">Buy now · ${rs(850)}</span>
    <span class="bt b2 w" style="margin-top:10px;height:52px">Add to bag</span>
    <div style="margin-top:22px;padding-top:18px;border-top:1px solid var(--line)">${facts()}</div>
    <div style="margin-top:18px;border-top:1px solid var(--line)">${['Product details', 'Delivery & returns', 'Reviews (9)'].map((l) => `<div class="row"><span class="f1">${l}</span>${ic('plus', 17)}</div>`).join('')}</div>
  </div>
  <div class="r" style="padding:10px 16px 12px;border-top:1px solid var(--line);background:var(--card)"><div><div class="m x">Total</div><b style="font-size:17px;font-weight:600">${rs(850)}</b></div><span class="bt b2 f1" style="height:46px">Add to bag</span><span class="bt b1 f1" style="height:46px">Buy now</span></div>`;

const option = (on, title, detail, amount, tag = '') => `<div class="box" style="padding:14px;${on ? 'border-color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)' : ''}"><div class="r" style="align-items:flex-start"><span style="width:18px;height:18px;border-radius:50%;border:1px solid var(--ink);display:grid;place-items:center;margin-top:2px">${on ? '<i style="width:10px;height:10px;border-radius:50%;background:var(--pri);display:block"></i>' : ''}</span><div class="f1"><div style="font-weight:600;font-size:14.5px">${title} ${tag}</div><div class="m" style="margin-top:2px">${detail}</div></div><b style="font-weight:600;font-size:15px">${amount}</b></div></div>`;
const PAY = `
  <div class="r" style="padding:13px 16px;background:var(--card);border-bottom:1px solid var(--line)">${ic('back', 22)}<span class="f1 r" style="justify-content:center;gap:7px;font-size:13px;letter-spacing:.08em;text-transform:uppercase">${ic('lock', 15)}Secure checkout</span><span class="lk">Help</span></div>
  <div class="r ctr" style="justify-content:center;gap:10px;padding:14px 16px 0;font-size:11.5px;letter-spacing:.1em;text-transform:uppercase"><span class="m">1 Address</span><span style="width:26px;height:1px;background:var(--line)"></span><b style="font-weight:600">2 Payment</b></div>
  <div class="sec" style="padding-top:18px">
    <div class="box" style="padding:12px"><div class="r">${ph(P[0], 'width:54px', 160)}<div class="f1"><div class="nm" style="-webkit-line-clamp:1">${P[0].s}</div><div class="m x" style="margin-top:2px">Size M · Sky blue · Qty 1</div></div><span class="lk">Edit</span></div></div>
    <div class="box" style="padding:12px 14px;margin-top:10px"><div class="r sb"><span class="lab">Deliver to</span><span class="lk">Change</span></div><div style="font-size:13.5px;margin-top:6px">Riya Sharma, Jaipur 302001</div></div>
    <div class="h sm" style="margin-top:24px">How would you like to pay?</div>
    <div style="display:grid;gap:10px;margin-top:14px">
      ${option(true, 'Pay online now', '15% off · Free delivery', rs(722), '<span style="font-size:10.5px;font-weight:600;letter-spacing:.06em;color:var(--acc);margin-left:6px;text-transform:uppercase">Save ' + rs(227) + '</span>')}
      ${option(false, 'Cash on delivery', `${rs(99)} now, ${rs(850)} in cash at delivery`, rs(949))}
    </div>
    <div style="margin-top:22px;padding-top:16px;border-top:1px solid var(--line)">
      <div class="kv"><span class="m">Item total</span><span>${rs(1499)}</span></div>
      <div class="kv"><span class="m">Discount</span><span style="color:var(--acc)">− ${rs(649)}</span></div>
      <div class="kv"><span class="m">Online payment (15%)</span><span style="color:var(--acc)">− ${rs(128)}</span></div>
      <div class="kv"><span class="m">Delivery</span><span>Free</span></div>
      <div class="kv" style="margin-top:8px;padding-top:12px;border-top:1px solid var(--line);font-size:17px;font-weight:600"><span>To pay</span><span>${rs(722)}</span></div>
    </div>
    <span class="bt b1 w" style="margin-top:18px;height:54px">${ic('lock', 16)}Pay ${rs(722)} by UPI</span>
    <div class="m x" style="text-align:center;margin-top:10px">Secured by Razorpay · 7-day returns & exchange</div>
    <div style="text-align:center;margin-top:16px"><span class="lk">Trouble paying? Chat with us on WhatsApp</span></div>
  </div>`;

const LOOKS = [
  { id: 'noir', name: 'Look 1 · Noir & Champagne', a: '#161514', b: '#A6824A', text: 'Safed page, gehri kaali likhai aur thoda sa champagne gold. Seedhe kone, patli line, chhote capital label. Bade international fashion brand jaisa saaf aur keemti.' },
  { id: 'rose', name: 'Look 2 · Rosewood & Ivory', a: '#6A1B33', b: '#B08A47', text: 'Garam ivory page, gehra rosewood (maroon) aur purana sona. Halke gol kone aur classic serif. Indian ethnic boutique jaisa shaahi aur apna-sa.' },
];
const root = document.documentElement;
const setLook = (id) => {
  const look = LOOKS.find((l) => l.id === id) || LOOKS[0];
  root.dataset.look = look.id;
  try { localStorage.setItem('sag-look', look.id); } catch { /* private window */ }
  document.querySelectorAll('#looks button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.look === look.id)));
  document.getElementById('lookName').textContent = look.name;
  document.getElementById('lookText').textContent = look.text;
};
document.getElementById('looks').innerHTML = LOOKS.map((l) => `<button data-look="${l.id}"><i style="background:linear-gradient(90deg,${l.a} 50%,${l.b} 50%)"></i>${l.name}</button>`).join('');
const SCREENS = [['Home page (header to footer)', HOME], ['Product page', PRODUCT], ['Payment', PAY]];
const render = () => { document.getElementById('main').innerHTML = SCREENS.map(([t, html], n) => `<section class="scr"><h2>${n + 1}. ${t}</h2><div class="frame">${html}</div></section>`).join(''); };
document.getElementById('looks').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setLook(b.dataset.look); });
let saved = '';
try { saved = localStorage.getItem('sag-look') || ''; } catch { /* private window */ }
setLook(new URLSearchParams(location.search).get('look') || saved || 'noir');
