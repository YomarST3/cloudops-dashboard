/**
 * CloudOps Dashboard - servidor de produccion portable.
 *
 * Los archivos de `api/` NO son codigo que se ejecute por si solo: son
 * funciones serverless y solo las ejecuta el runtime de Vercel. En cualquier
 * otro sitio (contenedor, nginx, servidor estatico) la carpeta `api/` no hace
 * nada y `/api/analizar` cae en el fallback de la SPA, que devuelve el
 * index.html. El navegador recibe HTML donde esperaba JSON y revienta con
 * "Unexpected token '<'".
 *
 * Este servidor evita eso ejecutando los mismos handlers, en el mismo proceso
 * que sirve la SPA. Sin dependencias externas: solo `node:http`.
 *
 * Uso:
 *   npm run build     (genera dist/)
 *   npm start         (node server.mjs)
 *
 * Variables opcionales: PORT (3000), HOST (0.0.0.0).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const API_DIR = path.join(ROOT, 'api');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Node 22.18+ ejecuta .ts de forma nativa (type stripping estable). Sin esto
// el import de api/*.ts falla y el unico sintoma seria un 500 opaco.
const NODE_MAJOR = Number(process.versions.node.split('.')[0]);
const NODE_MINOR = Number(process.versions.node.split('.')[1]);
if (NODE_MAJOR < 22 || (NODE_MAJOR === 22 && NODE_MINOR < 18)) {
  console.warn(
    `[aviso] Node ${process.versions.node} es anterior a 22.18. Los handlers de api/*.ts ` +
      `necesitan type stripping nativo; en versiones antiguas no se ejecutaran.`
  );
}

if (!fs.existsSync(DIST)) {
  console.error(
    `[error] No existe ${DIST}. Ejecuta "npm run build" antes de arrancar el servidor.`
  );
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** Solo nombres simples: impide que '..' o '/' escapen de api/. */
const VALID_NAME = /^[a-z0-9-]+$/i;
const handlerCache = new Map();

async function loadHandler(name) {
  if (!VALID_NAME.test(name)) return null;
  if (handlerCache.has(name)) return handlerCache.get(name);

  const file = path.join(API_DIR, `${name}.ts`);
  if (!fs.existsSync(file)) return null;

  const mod = await import(pathToFileUrl(file));
  const handler = mod.default;
  if (typeof handler !== 'function') {
    throw new Error(`api/${name}.ts no exporta un handler por defecto`);
  }
  handlerCache.set(name, handler);
  return handler;
}

function pathToFileUrl(filePath) {
  return new URL(`file://${filePath.split(path.sep).join('/')}`).href;
}

function toQuery(url) {
  const query = {};
  for (const [key, value] of url.searchParams) query[key] = value;
  return query;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf-8');
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Los handlers de api/ estan escritos con la firma de Vercel (req, res).
 * Node ya trae setHeader y end; solo faltan status() y json().
 */
function decorate(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(data));
  };
  return res;
}

function sendJson(res, code, data) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

async function handleApi(req, res, url) {
  const name = url.pathname.slice('/api/'.length);

  if (!name || name.includes('/')) {
    sendJson(res, 404, { error: 'Ruta de API no encontrada' });
    return;
  }

  let handler;
  try {
    handler = await loadHandler(name);
  } catch (error) {
    console.error(`[api] ${name}:`, error);
    sendJson(res, 500, { error: `No se pudo cargar api/${name}.ts` });
    return;
  }

  if (!handler) {
    // Importante: JSON de verdad, no el index.html. Devolver el HTML aqui es
    // justo lo que produce el error "Unexpected token '<'" en el navegador.
    sendJson(res, 404, { error: `No existe la funcion api/${name}.ts` });
    return;
  }

  const method = (req.method || 'GET').toUpperCase();
  const body = ['POST', 'PUT', 'PATCH'].includes(method) ? await readBody(req) : undefined;

  try {
    await handler(
      { method, headers: req.headers, query: toQuery(url), body },
      decorate(res)
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api] ${name}:`, message);
    if (!res.headersSent) {
      sendJson(res, 500, { error: `Error ejecutando api/${name}.ts`, detail: message });
    } else {
      res.end();
    }
  }
}

function sendFile(res, filePath, statusCode = 200) {
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  res.statusCode = statusCode;
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader(
    'Cache-Control',
    ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
  );
  res.setHeader('Content-Length', stat.size);
  fs.createReadStream(filePath).pipe(res);
}

/**
 * Sirve dist/ y aplica el fallback de la SPA.
 *
 * Regla: si la ruta pide un archivo con extension y no existe, es un 404 real.
 * Si es una ruta de navegacion (`/planning`, `/costs`...), devuelve el
 * index.html para que el enrutador del cliente la resuelva. Devolver el HTML
 * tambien para assets rotos es lo que hace que el error parezca de API.
 */
async function serveStatic(res, pathname) {
  const decoded = decodeURIComponent(pathname);
  const target = path.resolve(DIST, `.${decoded}`);

  if (target !== DIST && !target.startsWith(DIST + path.sep)) {
    sendJson(res, 403, { error: 'Ruta no permitida' });
    return;
  }

  let isFile = false;
  try {
    isFile = fs.statSync(target).isFile();
  } catch {
    isFile = false;
  }

  if (isFile) {
    sendFile(res, target);
    return;
  }

  const looksLikeAsset = path.extname(decoded) !== '';
  if (looksLikeAsset) {
    sendJson(res, 404, { error: 'Archivo no encontrado', path: decoded });
    return;
  }

  const indexPath = path.join(DIST, 'index.html');
  if (!fs.existsSync(indexPath)) {
    sendJson(res, 404, { error: 'No se encontro dist/index.html' });
    return;
  }
  sendFile(res, indexPath);
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  } catch {
    sendJson(res, 400, { error: 'URL invalida' });
    return;
  }

  try {
    // El orden importa: /api/ se resuelve ANTES del fallback de la SPA.
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(res, url.pathname);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[server]', message);
    if (!res.headersSent) sendJson(res, 500, { error: 'Error interno del servidor' });
    else res.end();
  }
});

// Las funciones de AWS hacen fetch a endpoints externos y pueden tardar.
server.headersTimeout = 0;
server.requestTimeout = 0;

server.listen(PORT, HOST, () => {
  console.log(`CloudOps Dashboard escuchando en http://${HOST}:${PORT}`);
  console.log(`  SPA:  ${DIST}`);
  console.log(`  API:  ${API_DIR}`);
});