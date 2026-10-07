// Design previews: every other page of the store in the same two looks (shop, menu, search, bag, address,
// order placed, tracking, sign in, account, wishlist, help and policy). Sample order numbers, names and
// addresses are marked as examples on the page; products and prices are real.
const title = (text, sub = '') => `<div style="padding:22px 16px 6px"><div class="h">${text}</div>${sub ? `<div class="m" style="margin-top:4px">${sub}</div>` : ''}</div>`;
const lineItem = (p, extra = '') => `<div class="r" style="align-items:flex-start;gap:13px">${ph(p, 'width:78px', 320)}<div class="f1" style="display:grid;gap:4px"><div class="nm">${p.s}</div><div class="m x">Size M · Sky blue</div>${pr(p)}${extra}</div></div>`;
const stepper = `<span class="r" style="gap:14px;border:1px solid var(--line);border-radius:var(--rb);height:32px;padding:0 11px;font-size:13px;width:max-content">−<b style="font-weight:600">1</b>+</span>`;
const input = (label, value = '') => `<div><div class="x" style="letter-spacing:.06em;text-transform:uppercase;color:var(--mut);margin-bottom:5px">${label}</div><div class="fld" style="${value ? 'color:var(--ink)' : ''}">${value || '&nbsp;'}</div></div>`;
const listRows = (rows) => `<div class="pd">${rows.map(([i, l, d]) => `<div class="row"><span style="color:var(--acc)">${ic(i, 20)}</span><span class="f1">${l}${d ? `<span class="m x" style="display:block;margin-top:1px">${d}</span>` : ''}</span>${ic('chev', 16)}</div>`).join('')}</div>`;

const SHOP = `
  ${header()}
  ${title('Suits', '11 styles')}
  <div class="sx pd" style="gap:8px;padding-top:8px;padding-bottom:14px">${['All', 'New arrivals', 'Bestsellers', 'Under ₹999'].map((l, n) => `<span class="chip${n ? '' : ' on'}" style="height:34px;font-size:12.5px">${l}</span>`).join('')}</div>
  <div class="r" style="border-top:1px solid var(--line);border-bottom:1px solid var(--line);font-size:12.5px;letter-spacing:.08em;text-transform:uppercase"><span class="f1" style="text-align:center;padding:12px 0">Filter</span><span style="width:1px;height:18px;background:var(--line)"></span><span class="f1" style="text-align:center;padding:12px 0">Sort: Featured</span></div>
  <div class="sec" style="padding-top:18px"><div class="g2">${card(P[1])}${card(P[0])}${card(P[4])}${card(P[3])}${card(P[2])}${card(P[5])}</div></div>
  ${nav('Shop')}`;

const MENU = `
  <div class="r sb" style="padding:13px 16px;border-bottom:1px solid var(--line);background:var(--card)"><span class="wm">Suit Aura Girls</span><span style="font-size:22px;line-height:1">×</span></div>
  <div class="pd" style="padding-top:16px;padding-bottom:16px;background:var(--alt)"><div class="r"><span style="width:40px;height:40px;border-radius:50%;border:1px solid var(--line);display:grid;place-items:center;background:var(--card)">${ic('user', 19)}</span><div class="f1"><div style="font-weight:600">Sign in</div><div class="m x">Track orders and keep your wishlist</div></div><span class="bt b1" style="height:38px;padding:0 16px">Sign in</span></div></div>
  <div class="pd">${[['Shop all', '26'], ['New arrivals', '25'], ['Offers', ''], ['Kids & toys', '5']].map(([l, c]) => `<div class="row"><span class="f1" style="font-family:Fraunces,serif;font-size:19px;font-weight:var(--hw)">${l}</span><span class="m x">${c}</span>${ic('chev', 16)}</div>`).join('')}</div>
  <div class="pd" style="padding-top:18px"><div class="lab">Collections</div><div class="r" style="flex-wrap:wrap;gap:8px;margin-top:10px">${['Suits', 'Co-ord sets', 'Anarkali', 'Dresses', 'Festive wear', 'Kurtis'].map((l) => `<span class="chip" style="height:34px;font-size:12.5px">${l}</span>`).join('')}</div></div>
  <div style="margin-top:18px;border-top:1px solid var(--line)">${listRows([['truck', 'Track order'], ['ret', 'Returns & exchange'], ['wa', 'Chat on WhatsApp', 'Mon to Sat']])}</div>
  <div class="m x" style="text-align:center;padding:16px;letter-spacing:.04em">Secure UPI payment · 7-day returns & exchange</div>`;

const SEARCH = `
  <div class="r" style="padding:12px 16px;border-bottom:1px solid var(--line);background:var(--card)">${ic('search', 20)}<span class="f1" style="font-size:15px;color:var(--mut)">Search suits, dresses…</span><span class="lk">Cancel</span></div>
  <div class="sec" style="padding-top:20px"><div class="lab">Trending now</div>
    <div class="sx" style="margin-top:12px">${[P[2], P[1], P[0], P[4]].map((p) => `<div style="width:112px">${ph(p, '', 320)}<div style="margin-top:7px;font-size:13px;font-weight:600">${rs(p.p)}</div></div>`).join('')}</div>
    <div class="lab" style="margin-top:26px">Collections</div>
    <div style="margin-top:4px">${[['Suits', 11], ['Co-ord sets', 4], ['Anarkali', 4], ['Dresses', 2], ['Kurtis', 2]].map(([l, c]) => `<div class="row"><span class="f1">${l}</span><span class="m x">${c}</span>${ic('chev', 15)}</div>`).join('')}</div>
  </div>`;

const BAG = `
  ${header(true)}
  ${title('Your bag', '2 items')}
  <div class="pd" style="padding-top:10px"><div class="x" style="background:var(--alt);padding:10px 12px;border-radius:var(--r);letter-spacing:.02em"><b style="font-weight:600;color:var(--acc)">You save ${rs(1798)}</b> on this order</div></div>
  <div class="pd" style="padding-top:18px;display:grid;gap:18px">${lineItem(P[0], `<div class="r sb" style="margin-top:4px">${stepper}<span class="lk">Remove</span></div>`)}<div class="hl"></div>${lineItem(P[1], `<div class="r sb" style="margin-top:4px">${stepper}<span class="lk">Remove</span></div>`)}</div>
  <div class="pd" style="margin-top:20px"><div class="box r" style="padding:12px 14px"><span style="color:var(--acc)">${ic('check', 18)}</span><span class="f1" style="font-size:13.5px">Code <b style="font-weight:600">DUSSEHRA</b> · extra 10% off</span><span class="lk">Apply</span></div></div>
  <div class="sec" style="padding-top:20px">
    <div class="kv"><span class="m">Item total</span><span>${rs(3498)}</span></div>
    <div class="kv"><span class="m">Discount</span><span style="color:var(--acc)">− ${rs(1798)}</span></div>
    <div class="kv"><span class="m">Delivery</span><span>Free</span></div>
    <div class="kv" style="margin-top:8px;padding-top:12px;border-top:1px solid var(--line);font-size:17px;font-weight:600"><span>Total</span><span>${rs(1700)}</span></div>
    <span class="bt b1 w" style="margin-top:18px;height:52px">Checkout</span>
    <div class="m x" style="text-align:center;margin-top:10px">Secure UPI payment · Cash on delivery available</div>
  </div>`;

const ADDRESS = `
  <div class="r" style="padding:13px 16px;background:var(--card);border-bottom:1px solid var(--line)">${ic('back', 22)}<span class="f1 r" style="justify-content:center;gap:7px;font-size:13px;letter-spacing:.08em;text-transform:uppercase">${ic('lock', 15)}Secure checkout</span><span class="lk">Help</span></div>
  <div class="r" style="justify-content:center;gap:10px;padding:14px 16px 0;font-size:11.5px;letter-spacing:.1em;text-transform:uppercase"><b style="font-weight:600">1 Address</b><span style="width:26px;height:1px;background:var(--line)"></span><span class="m">2 Payment</span></div>
  ${title('Where should we deliver?')}
  <div class="sec" style="padding-top:12px;display:grid;gap:14px">
    ${input('Mobile number')}${input('Full name')}${input('Email (for your receipt)')}
    <div class="g2" style="gap:12px">${input('PIN code', '302001')}${input('City', 'Jaipur')}</div>
    ${input('House no., street, area')}
    <span class="bt b1 w" style="height:52px;margin-top:4px">${ic('lock', 16)}Continue to payment</span>
    <div class="m x" style="text-align:center">7-day returns & exchange · Help on WhatsApp</div>
  </div>`;

const PLACED = `
  ${header()}
  <div class="sec" style="text-align:center;padding-top:34px">
    <span style="width:54px;height:54px;border-radius:50%;border:1px solid var(--ink);display:inline-grid;place-items:center">${ic('check', 24)}</span>
    <div class="lab" style="margin-top:16px">Order confirmed</div>
    <div class="h" style="margin-top:8px">Thank you, it's yours</div>
    <div class="m" style="margin-top:8px">Order SAG-XXXXXX (example) · Receipt sent to your email</div>
  </div>
  <div class="pd"><div class="box" style="padding:14px">${lineItem(P[0])}<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line)"><div class="kv"><span class="m">Paid by UPI</span><span style="font-weight:600">${rs(722)}</span></div><div class="kv"><span class="m">Deliver to</span><span>Jaipur 302001</span></div></div></div></div>
  <div class="sec" style="display:grid;gap:10px"><span class="bt b1 w" style="height:50px">Track order</span><span class="bt b2 w" style="height:50px">Continue shopping</span></div>`;

const stages = [['Order placed', 'done'], ['Packed', 'done'], ['Shipped', 'now'], ['Delivered', '']];
const TRACK = `
  ${header(true)}
  ${title('Track order', 'SAG-XXXXXX (example)')}
  <div class="sec" style="padding-top:14px">
    <div class="box" style="padding:16px"><div class="lab">On the way</div><div class="h sm" style="margin-top:6px">Your order is shipped</div>
      <div class="r" style="gap:4px;margin-top:16px">${stages.map(([, s]) => `<span class="f1" style="height:3px;background:${s ? 'var(--pri)' : 'var(--line)'}"></span>`).join('')}</div>
      <div class="r sb x" style="margin-top:8px;color:var(--mut)">${stages.map(([l, s]) => `<span style="${s === 'now' ? 'color:var(--ink);font-weight:600' : ''}">${l}</span>`).join('')}</div>
    </div>
    <div style="margin-top:20px">${stages.filter(([, s]) => s).map(([l, s]) => `<div class="r" style="align-items:flex-start;padding:10px 0;gap:12px"><span style="width:18px;height:18px;border-radius:50%;margin-top:2px;display:grid;place-items:center;${s === 'now' ? 'border:1px solid var(--ink)' : 'background:var(--pri);color:var(--on)'}">${s === 'now' ? '<i style="width:8px;height:8px;border-radius:50%;background:var(--pri);display:block"></i>' : ic('check', 11)}</span><div class="f1"><div style="font-size:14px;font-weight:${s === 'now' ? 600 : 400}">${l}</div><div class="m x">The order's real date and time</div></div></div>`).join('')}</div>
    <div class="box" style="padding:12px;margin-top:14px">${lineItem(P[0])}</div>
    <div class="r" style="margin-top:16px"><span class="bt b1 f1">Courier tracking</span><span class="bt b2 f1">Help</span></div>
  </div>`;

const LOGIN = `
  ${header(true)}
  <div class="sec" style="text-align:center;padding-top:40px">
    <img src="/suit-aura-mark-132.webp" width="66" height="66" alt="" style="margin:0 auto;border-radius:50%;border:1px solid var(--line)">
    <div class="h" style="margin-top:18px">Welcome</div>
    <div class="m" style="margin-top:6px">Sign in to track orders and keep your wishlist.</div>
    <div style="display:grid;gap:12px;margin-top:24px;text-align:left">
      <span class="bt b2 w" style="height:50px;text-transform:none;letter-spacing:0;font-size:14.5px"><b style="font-size:16px">G</b> Continue with Google</span>
      <div class="r"><span class="f1" style="height:1px;background:var(--line)"></span><span class="m x">or</span><span class="f1" style="height:1px;background:var(--line)"></span></div>
      ${input('Email')}
      <span class="bt b1 w" style="height:50px">Send code</span>
    </div>
    <div class="m x" style="margin-top:14px">No password needed.</div>
  </div>`;

const ACCOUNT = `
  ${header()}
  ${title('My account', 'riya@example.com (example)')}
  <div class="sec" style="padding-top:14px"><div class="box" style="padding:14px"><div class="r sb"><span class="lab">Latest order</span><span class="x" style="font-weight:600">Shipped</span></div><div style="margin-top:12px">${lineItem(P[0])}</div><span class="bt b1 w" style="height:44px;margin-top:14px">Track order</span></div></div>
  <div style="border-top:1px solid var(--line)">${listRows([['bag', 'My orders'], ['heart', 'Wishlist'], ['home', 'Addresses'], ['ret', 'Returns & exchange'], ['wa', 'Help on WhatsApp']])}</div>
  <div class="pd" style="padding-top:18px;padding-bottom:22px"><span class="lk">Sign out</span></div>
  ${nav('Account')}`;

const WISH = `
  ${header()}
  ${title('Wishlist', '2 saved styles')}
  <div class="sec" style="padding-top:16px"><div class="g2">${[P[1], P[4]].map((p) => `<div>${ph(p)}<div style="padding-top:9px;display:grid;gap:5px"><div class="nm">${p.s}</div>${pr(p)}<span class="bt b2" style="height:38px;margin-top:4px">Move to bag</span></div></div>`).join('')}</div></div>
  ${nav('Wishlist')}`;

const HELP = `
  ${header(true)}
  <div style="padding:22px 16px 0"><div class="lab">Policy</div><div class="h" style="margin-top:6px">Returns & exchange</div></div>
  <div class="sec" style="padding-top:16px">
    <div class="box" style="padding:14px;background:var(--alt);border-color:transparent"><div style="font-weight:600;font-size:13.5px">In short</div>${['Ask within 7 days of delivery', 'Request it from My account → Orders', 'Refund after our quality check'].map((t) => `<div class="r" style="margin-top:9px;gap:9px;font-size:13.5px"><span style="color:var(--acc)">${ic('check', 16)}</span>${t}</div>`).join('')}</div>
    <div style="margin-top:20px">${['7-day return and exchange window', 'Eligibility conditions', 'How to request', 'Refunds and exchanges'].map((l, n) => `<div class="row"><span class="m x" style="width:18px">${n + 1}</span><span class="f1">${l}</span>${ic('plus', 16)}</div>`).join('')}</div>
    <div class="box" style="padding:14px;margin-top:20px"><div class="r"><span style="color:var(--acc)">${ic('wa', 22)}</span><div class="f1"><div style="font-weight:600">Need help?</div><div class="m x">Chat with us on WhatsApp</div></div><span class="bt b1" style="height:40px;padding:0 16px">Chat</span></div></div>
  </div>
  <div class="foot"><div class="wm" style="color:#fff">Suit Aura Girls</div><div class="g2" style="margin-top:16px;gap:12px 10px;font-size:13px">${['Track order', 'Shipping', 'Contact us', 'Terms'].map((l) => `<span>${l}</span>`).join('')}</div></div>`;

SCREENS.push(['Shop page', SHOP], ['Menu', MENU], ['Search', SEARCH], ['Bag', BAG], ['Checkout: address', ADDRESS], ['Order placed', PLACED], ['Order tracking', TRACK], ['Sign in', LOGIN], ['My account', ACCOUNT], ['Wishlist', WISH], ['Help and policy', HELP]);
render();
