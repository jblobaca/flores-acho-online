import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('cliente','comerciante')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  occasion TEXT,
  color TEXT,
  description TEXT,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  bulk_min INTEGER,
  bulk_price_cents INTEGER,
  stock INTEGER NOT NULL CHECK (stock >= 0),
  stall TEXT NOT NULL,
  owner_id INTEGER REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'Pendiente de pago',
  district TEXT NOT NULL,
  address TEXT NOT NULL,
  delivery_date TEXT NOT NULL,
  delivery_slot TEXT NOT NULL,
  card_message TEXT,
  subtotal_cents INTEGER NOT NULL,
  delivery_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_price_cents INTEGER NOT NULL
);
`;

// [nombre, categoría, ocasión, color, descripción, precio, mínimo mayorista, precio mayorista, stock, puesto]
const SEED_PRODUCTS = [
  ['Rosa roja (docena)', 'Rosas', 'San Valentín', 'Rojo', 'Rosas rojas de tallo largo, cultivadas en Huaral.', 3000, 5, 2600, 200, 'Puesto 12 · Flores Doña Rosa'],
  ['Rosa blanca (docena)', 'Rosas', 'Todos los Santos', 'Blanco', 'Rosas blancas para ofrendas y eventos.', 2800, 5, 2400, 150, 'Puesto 12 · Flores Doña Rosa'],
  ['Girasol (ramo de 6)', 'Girasoles', 'Cumpleaños', 'Amarillo', 'Girasoles grandes, frescos del día.', 2200, 5, 1900, 120, 'Puesto 31 · Girasoles del Rímac'],
  ['Arreglo Día de la Madre', 'Arreglos', 'Día de la Madre', 'Rosado', 'Arreglo con rosas, claveles y follaje en base de cerámica.', 8500, 3, 7600, 40, 'Puesto 7 · Arreglos Lucía'],
  ['Corona fúnebre mediana', 'Coronas', 'Todos los Santos', 'Blanco', 'Corona de claveles y crisantemos de 60 cm.', 12000, 2, 11000, 25, 'Puesto 45 · Coronas Acho'],
  ['Clavel mixto (docena)', 'Claveles', 'Todos los Santos', 'Mixto', 'Claveles de colores variados.', 1500, 10, 1200, 300, 'Puesto 21 · Claveles Don Pepe'],
  ['Ramo de novia', 'Arreglos', 'Bodas', 'Blanco', 'Ramo de novia con rosas blancas y gypsophila.', 15000, 2, 13500, 15, 'Puesto 7 · Arreglos Lucía'],
  ['Lirios (ramo de 5)', 'Lirios', 'Aniversario', 'Rosado', 'Lirios orientales de aroma intenso.', 3500, 4, 3000, 60, 'Puesto 31 · Girasoles del Rímac'],
];

export function openDb(path = ':memory:', { seed = true } = {}) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  if (seed) {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM products').get();
    if (n === 0) {
      const insert = db.prepare(
        `INSERT INTO products
         (name, category, occasion, color, description, price_cents, bulk_min, bulk_price_cents, stock, stall)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      );
      for (const p of SEED_PRODUCTS) insert.run(...p);
    }
  }
  return db;
}
