# Flores de Acho Online

MVP del marketplace del **Mercado de Flores de Acho** (Rímac, Lima): catálogo en línea, carrito, pedido con costo de delivery por zona y precios mayoristas.

## Historias de usuario cubiertas (Jira `FLOR`)
| Historia | Funcionalidad |
|---|---|
| HU-01 / HU-02 | Registro e inicio de sesión (JWT, contraseñas con bcrypt) |
| HU-04 / HU-06 | Detalle, búsqueda y filtros del catálogo |
| HU-05 | Publicación de productos (solo rol `comerciante`) |
| HU-07 | Precio mayorista por volumen |
| HU-09 / HU-10 | Carrito y checkout (dirección, fecha, franja, mensaje) |
| HU-12 | Historial de pedidos |
| HU-18 | Costo y tiempo de delivery por distrito |

## Stack
Node.js 22 · Express · SQLite (`node:sqlite`) · JWT · Helmet · frontend HTML/JS sin dependencias · Docker · GitHub Actions · Render.

## Ejecutar en local
```bash
npm ci
cp .env.example .env     # define JWT_SECRET
npm start                # http://localhost:3000
npm test                 # 13 pruebas con cobertura
```

## API
| Método y ruta | Descripción |
|---|---|
| `GET /api/health` | Estado del servicio |
| `POST /api/auth/register`, `POST /api/auth/login` | Cuenta y sesión |
| `GET /api/products?q=&category=&occasion=&maxPrice=` | Catálogo con filtros |
| `GET /api/products/:id` | Detalle |
| `POST /api/products` | Publicar producto (comerciante) |
| `GET /api/delivery/quote?district=` | Costo y tiempo de entrega |
| `POST /api/orders`, `GET /api/orders` | Crear y listar pedidos (requiere sesión) |

## Seguridad aplicada
- Contraseñas con bcrypt; JWT HS256 de 2 h; `JWT_SECRET` obligatorio en producción.
- Helmet (CSP y cabeceras), límite de tasa global y más estricto en login/registro, cuerpo JSON ≤ 20 KB.
- Consultas SQL parametrizadas; validación de todas las entradas; el frontend usa `textContent` (sin `innerHTML`).
- Rol `admin` no se puede crear por la API; solo `comerciante` publica productos.
- Pipeline: Semgrep (SAST), `npm audit`, Gitleaks (secretos), Trivy (imagen) y Dependabot.

## Ramas y flujo
- `main`: producción. Solo recibe cambios por Pull Request y despliega al pasar el pipeline.
- `test`: integración y pruebas. Las ramas de trabajo se fusionan aquí y luego se abre PR `test` → `main`.

## Pipeline (`.github/workflows/ci-cd.yml`)
`build-test` → (`sast`, `dependencias`, `secretos` en paralelo) → `contenedor` (Docker + Trivy) → `deploy` (solo `main`, dispara Render y hace smoke test a `/api/health`).

Secretos y variables necesarios en GitHub: secreto `RENDER_DEPLOY_HOOK`, variable `APP_URL`.

## Limitaciones del MVP
Pago en línea, repartidores y seguimiento aún no están implementados (Sprints 2–4 del backlog). La base de datos vive en memoria por defecto: se reinicia al reiniciar el servicio.
