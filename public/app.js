// Frontend sin dependencias. Se construye el DOM con textContent para evitar XSS.
const $ = (id) => document.getElementById(id);
const money = (c) => `S/ ${(c / 100).toFixed(2)}`;
const state = { token: sessionStorage.getItem('token'), user: JSON.parse(sessionStorage.getItem('user') || 'null'), cart: new Map(), products: [], quote: null };

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  Object.assign(n, props);
  for (const k of kids) n.append(k);
  return n;
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error inesperado');
  return data;
}

function say(text, ok) {
  const m = $('msg');
  m.textContent = text;
  m.className = ok ? 'ok' : 'bad';
}

function renderSession() {
  $('who').textContent = state.user ? `Hola, ${state.user.name} (${state.user.role})` : 'No has iniciado sesión';
  $('btn-auth').hidden = !!state.user;
  $('btn-orders').hidden = !state.user;
  $('btn-logout').hidden = !state.user;
}

function renderProducts() {
  const grid = $('grid');
  grid.replaceChildren();
  if (!state.products.length) grid.append(el('p', { textContent: 'No encontramos productos con esos filtros.' }));
  for (const p of state.products) {
    const add = el('button', { type: 'button', textContent: p.stock > 0 ? 'Agregar al carrito' : 'Agotado', disabled: p.stock <= 0 });
    add.addEventListener('click', () => addToCart(p));
    grid.append(el('article', { className: 'card' },
      el('h3', { textContent: p.name }),
      el('span', { className: 'meta', textContent: `${p.category} · ${p.occasion ?? ''} · ${p.stall}` }),
      el('p', { textContent: p.description ?? '' }),
      el('span', { className: 'price', textContent: money(p.priceCents) }),
      p.bulkMin ? el('span', { className: 'bulk', textContent: `Mayorista: ${money(p.bulkPriceCents)} c/u desde ${p.bulkMin}` }) : '',
      el('span', { className: 'meta', textContent: p.stock > 0 ? `Stock: ${p.stock}` : 'Sin stock' }),
      add));
  }
}

function unit(p, qty) {
  return p.bulkMin && qty >= p.bulkMin ? p.bulkPriceCents : p.priceCents;
}

function renderCart() {
  const list = $('cart-list');
  list.replaceChildren();
  let sub = 0;
  for (const [id, { p, qty }] of state.cart) {
    sub += unit(p, qty) * qty;
    const input = el('input', { type: 'number', min: 1, max: p.stock, value: qty, ariaLabel: `Cantidad de ${p.name}` });
    input.addEventListener('change', () => {
      const v = Math.min(Math.max(parseInt(input.value, 10) || 1, 1), p.stock);
      state.cart.set(id, { p, qty: v });
      renderCart();
    });
    const rm = el('button', { type: 'button', className: 'secondary', textContent: '✕', ariaLabel: `Quitar ${p.name}` });
    rm.addEventListener('click', () => { state.cart.delete(id); renderCart(); });
    list.append(el('li', {}, el('span', { textContent: `${p.name} · ${money(unit(p, qty))}` }), input, rm));
  }
  $('cart-empty').hidden = state.cart.size > 0;
  $('checkout').hidden = state.cart.size === 0;
  const delivery = state.quote ? state.quote.costCents : 0;
  $('total').textContent = money(sub + delivery);
}

function addToCart(p) {
  const cur = state.cart.get(p.id)?.qty ?? 0;
  if (cur + 1 > p.stock) return say('No hay más stock de este producto', false);
  state.cart.set(p.id, { p, qty: cur + 1 });
  say('', true);
  renderCart();
}

async function loadProducts() {
  const params = new URLSearchParams();
  if ($('q').value.trim()) params.set('q', $('q').value.trim());
  if ($('category').value) params.set('category', $('category').value);
  if ($('maxPrice').value) params.set('maxPrice', $('maxPrice').value);
  try {
    state.products = await api(`/products?${params}`);
    renderProducts();
  } catch (e) { say(e.message, false); }
}

async function init() {
  renderSession();
  const all = await api('/products');
  const cats = [...new Set(all.map((p) => p.category))];
  for (const c of cats) $('category').append(el('option', { value: c, textContent: c }));
  state.products = all;
  renderProducts();
  const opts = await api('/delivery/options');
  $('district').append(el('option', { value: '', textContent: 'Elige tu distrito' }));
  for (const d of opts.districts) $('district').append(el('option', { value: d, textContent: d }));
  for (const s of opts.slots) $('slot').append(el('option', { value: s, textContent: s }));
  $('date').min = new Date().toISOString().slice(0, 10);
  renderCart();
}

$('filters').addEventListener('submit', (e) => { e.preventDefault(); loadProducts(); });

$('district').addEventListener('change', async () => {
  state.quote = null;
  $('quote').textContent = '';
  if ($('district').value) {
    try {
      state.quote = await api(`/delivery/quote?district=${encodeURIComponent($('district').value)}`);
      $('quote').textContent = `Delivery: ${money(state.quote.costCents)} · llega en ~${state.quote.etaMin} min`;
    } catch (e) { $('quote').textContent = e.message; }
  }
  renderCart();
});

$('checkout').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.user) { $('auth-dialog').showModal(); return say('Inicia sesión para confirmar tu pedido', false); }
  try {
    const r = await api('/orders', { method: 'POST', body: {
      items: [...state.cart].map(([productId, { qty }]) => ({ productId, qty })),
      district: $('district').value, address: $('address').value, deliveryDate: $('date').value,
      deliverySlot: $('slot').value, cardMessage: $('message').value || null,
    } });
    say(`Pedido #${r.id} creado: ${money(r.totalCents)} (${r.status}).`, true);
    state.cart.clear();
    renderCart();
    loadProducts();
  } catch (err) { say(err.message, false); }
});

async function auth(kind) {
  const body = { email: $('a-email').value, password: $('a-pass').value };
  if (kind === 'register') Object.assign(body, { name: $('a-name').value, role: $('a-role').value });
  try {
    const r = await api(`/auth/${kind}`, { method: 'POST', body });
    state.token = r.token; state.user = r.user;
    sessionStorage.setItem('token', r.token);
    sessionStorage.setItem('user', JSON.stringify(r.user));
    $('auth-dialog').close();
    renderSession();
    say(`Bienvenido, ${r.user.name}`, true);
  } catch (err) { $('a-msg').textContent = err.message; }
}
$('auth-form').addEventListener('submit', (e) => {
  e.preventDefault();
  auth(e.submitter?.value === 'register' ? 'register' : 'login');
});
$('btn-auth').addEventListener('click', () => { $('a-msg').textContent = ''; $('auth-dialog').showModal(); });
$('a-cancel').addEventListener('click', () => $('auth-dialog').close());
$('btn-logout').addEventListener('click', () => {
  state.token = null; state.user = null; sessionStorage.clear(); renderSession();
});
$('btn-orders').addEventListener('click', async () => {
  const list = $('orders-list');
  list.replaceChildren();
  try {
    const orders = await api('/orders');
    if (!orders.length) list.append(el('li', { textContent: 'Aún no tienes pedidos.' }));
    for (const o of orders) {
      list.append(el('li', { textContent: `#${o.id} · ${o.status} · ${o.deliveryDate} ${o.deliverySlot} · ${o.district} · ${money(o.totalCents)} — ${o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}` }));
    }
  } catch (e) { list.append(el('li', { textContent: e.message })); }
  $('orders-dialog').showModal();
});
$('o-close').addEventListener('click', () => $('orders-dialog').close());

init().catch((e) => say(e.message, false));
