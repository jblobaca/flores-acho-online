import { randomBytes } from 'node:crypto';
import { openDb } from './db.js';
import { createApp } from './app.js';

const isProd = process.env.NODE_ENV === 'production';
let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (isProd) {
    console.error('JWT_SECRET es obligatorio en producción');
    process.exit(1);
  }
  jwtSecret = randomBytes(32).toString('hex'); // solo desarrollo: cambia en cada arranque
}

const db = openDb(process.env.DB_PATH || ':memory:');
const app = createApp(db, { jwtSecret });
const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Flores de Acho Online escuchando en el puerto ${port}`));
