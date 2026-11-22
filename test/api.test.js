import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp, unitPrice } from '../src/app.js';
import { quoteDelivery } from '../src/delivery.js';

let server, base;
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

before(async () => {
  const app = createApp(openDb(':memory:'), { jwtSecret: 'test-secret', rateLimitMax: 10_000 });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
}

async function register(email, role = 'cliente') {
  const r = await call('/api/auth/register', { method: 'POST', body: { name: 'Ana Prueba', email, password: 'clave-segura-1', role } });
  assert.equal(r.status, 201);
  return r.body.token;
}

const orderBody = (items, extra = {}) => ({
  items, district: 'Miraflores', address: 'Av. Larco 123', deliveryDate: tomorrow, deliverySlot: '09:00-12:00', ...extra,
});

// ---------- unitarias ----------
test('unitPrice aplica precio mayorista desde el mínimo (HU-07)', () => {
  const p = { price_cents: 3000, bulk_min: 5, bulk_price_cents: 2600 };
  assert.equal(unitPrice(p, 4), 3000);
  assert.equal(unitPrice(p, 5), 2600);
  assert.equal(unitPrice({ price_cents: 100 }, 99), 100);
});

test('quoteDelivery ignora tildes y mayúsculas y rechaza zonas sin cobertura (HU-18)', () => {
  assert.equal(quoteDelivery('RÍMAC').covered, true);
  assert.equal(quoteDelivery('  miraflores ').costCents, 1500);
  assert.equal(quoteDelivery('Arequipa').covered, false);
});

// ---------- integración ----------
test('GET /api/health responde ok y envía cabeceras de seguridad de helmet', async () => {
  const r = await call('/api/health');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { status: 'ok' });
  assert.ok(r.headers.get('content-security-policy'));
  assert.equal(r.headers.get('x-powered-by'), null);
});

test('registro: crea cuenta, rechaza correo duplicado y contraseña corta (HU-01)', async () => {
  await register('dup@correo.com');
  const dup = await call('/api/auth/register', { method: 'POST', body: { name: 'Otra', email: 'DUP@correo.com', password: 'clave-segura-1' } });
  assert.equal(dup.status, 409);
  const corta = await call('/api/auth/register', { method: 'POST', body: { name: 'Ana', email: 'x@correo.com', password: '123' } });
  assert.equal(corta.status, 400);
  const admin = await call('/api/auth/register', { method: 'POST', body: { name: 'Ana', email: 'adm@correo.com', password: 'clave-segura-1', role: 'admin' } });
  assert.equal(admin.status, 400);
});

test('login: acepta credenciales correctas y rechaza incorrectas (HU-02)', async () => {
  await register('login@correo.com');
  const ok = await call('/api/auth/login', { method: 'POST', body: { email: 'login@correo.com', password: 'clave-segura-1' } });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  const mal = await call('/api/auth/login', { method: 'POST', body: { email: 'login@correo.com', password: 'incorrecta1' } });
  assert.equal(mal.status, 401);
});

test('catálogo: búsqueda, filtros y detalle (HU-04, HU-06)', async () => {
  const todos = await call('/api/products');
  assert.ok(todos.body.length >= 8);
  const rosas = await call('/api/products?q=rosa');
  assert.ok(rosas.body.length > 0 && rosas.body.every((p) => /rosa/i.test(p.name + p.description)));
  const combo = await call('/api/products?occasion=Todos%20los%20Santos&maxPrice=50');
  assert.ok(combo.body.every((p) => p.occasion === 'Todos los Santos' && p.priceCents <= 5000));
  const vacio = await call('/api/products?q=zzzzzz');
  assert.deepEqual(vacio.body, []);
  const detalle = await call('/api/products/1');
  assert.equal(detalle.body.id, 1);
  assert.equal((await call('/api/products/9999')).status, 404);
  assert.equal((await call('/api/products?maxPrice=abc')).status, 400);
});

test('solo un comerciante puede publicar productos (HU-05)', async () => {
  const cliente = await register('cli@correo.com');
  const comer = await register('com@correo.com', 'comerciante');
  const body = { name: 'Orquídea', category: 'Orquídeas', price: 45.5, stock: 10, stall: 'Puesto 99' };
  assert.equal((await call('/api/products', { method: 'POST', body })).status, 401);
  assert.equal((await call('/api/products', { method: 'POST', body, token: cliente })).status, 403);
  const ok = await call('/api/products', { method: 'POST', body, token: comer });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.priceCents, 4550);
  assert.equal((await call('/api/products', { method: 'POST', body: { ...body, price: -1 }, token: comer })).status, 400);
});

test('delivery: cotiza por zona y avisa fuera de cobertura (HU-18)', async () => {
  const ok = await call('/api/delivery/quote?district=Miraflores');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.costCents, 1500);
  const fuera = await call('/api/delivery/quote?district=Cusco');
  assert.equal(fuera.status, 422);
});

test('pedido: requiere sesión, calcula mayorista + delivery y descuenta stock (HU-09, HU-10)', async () => {
  const body = orderBody([{ productId: 1, qty: 5 }]);
  assert.equal((await call('/api/orders', { method: 'POST', body })).status, 401);
  const token = await register('pedido@correo.com');
  const antes = (await call('/api/products/1')).body.stock;
  const r = await call('/api/orders', { method: 'POST', body, token });
  assert.equal(r.status, 201);
  assert.equal(r.body.subtotalCents, 5 * 2600); // precio mayorista
  assert.equal(r.body.deliveryCents, 1500);
  assert.equal(r.body.totalCents, 5 * 2600 + 1500);
  assert.equal(r.body.status, 'Pendiente de pago');
  assert.equal((await call('/api/products/1')).body.stock, antes - 5);
  const mis = await call('/api/orders', { token });
  assert.equal(mis.body.length, 1);
  assert.equal(mis.body[0].items[0].qty, 5);
});

test('pedido: stock insuficiente hace rollback sin descontar nada', async () => {
  const token = await register('stock@correo.com');
  const s3 = (await call('/api/products/3')).body.stock;
  const r = await call('/api/orders', { method: 'POST', token, body: orderBody([{ productId: 3, qty: 1 }, { productId: 4, qty: 99_999 }]) });
  assert.equal(r.status, 400); // cantidad fuera de rango
  const r2 = await call('/api/orders', { method: 'POST', token, body: orderBody([{ productId: 3, qty: 1 }, { productId: 7, qty: 500 }]) });
  assert.equal(r2.status, 409);
  assert.equal((await call('/api/products/3')).body.stock, s3);
});

test('pedido: valida fecha pasada, franja y cobertura (HU-10, HU-18)', async () => {
  const token = await register('valida@correo.com');
  const items = [{ productId: 6, qty: 1 }];
  assert.equal((await call('/api/orders', { method: 'POST', token, body: orderBody(items, { deliveryDate: '2020-01-01' }) })).status, 400);
  assert.equal((await call('/api/orders', { method: 'POST', token, body: orderBody(items, { deliverySlot: '03:00-04:00' }) })).status, 400);
  assert.equal((await call('/api/orders', { method: 'POST', token, body: orderBody(items, { district: 'Cusco' }) })).status, 422);
  assert.equal((await call('/api/orders', { method: 'POST', token, body: orderBody([]) })).status, 400);
});

test('seguridad: token manipulado y JSON inválido son rechazados', async () => {
  assert.equal((await call('/api/orders', { token: 'abc.def.ghi' })).status, 401);
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{malo' });
  assert.equal(res.status, 400);
});

test('seguridad: SQL injection en búsqueda no rompe ni filtra datos', async () => {
  const r = await call("/api/products?q=' OR 1=1 --");
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, []);
});
