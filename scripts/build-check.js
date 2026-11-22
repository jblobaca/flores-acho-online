// Etapa "build": verifica que los módulos compilan/cargan y que existen los assets del frontend.
import { existsSync } from 'node:fs';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

for (const f of ['public/index.html', 'public/app.js', 'public/styles.css']) {
  if (!existsSync(f)) throw new Error(`Falta ${f}`);
}
createApp(openDb(':memory:'), { jwtSecret: 'build-check' });
console.log('Build OK: módulos cargados y assets presentes');
