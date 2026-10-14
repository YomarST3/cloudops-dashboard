import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Ejecuta las serverless functions de `api/` durante `vite dev`.
 *
 * Vite no las ejecuta: las sirve como archivos .ts y el navegador recibe su
 * codigo fuente en vez de JSON. Este plugin las carga con ssrLoadModule y las
 * adapta de la firma de Vercel (req, res) a las de Node.
 *
 * En produccion esto no interviene: Vercel despliega `api/` por su cuenta.
 * Se ejecuta el mismo codigo en ambos entornos, asi que no pueden divergir.
 */

const API_PREFIX = '/api/';

interface VercelLikeRequest {
  method?: string;
  headers: IncomingMessage['headers'];
  query: Record<string, string>;
  body?: unknown;
}

interface VercelLikeResponse extends ServerResponse {
  status: (code: number) => VercelLikeResponse;
  json: (data: unknown) => void;
}

type VercelHandler = (
  req: VercelLikeRequest,
  res: VercelLikeResponse
) => Promise<void> | void;

function toVercelQuery(url: string | undefined): Record<string, string> {
  const query: Record<string, string> = {};
  if (!url) return query;
  for (const [key, value] of new URL(url, 'http://localhost').searchParams) {
    query[key] = value;
  }
  return query;
}

/** Anade los metodos que Vercel anade al prototype de res y Node no. */
function decorateResponse(res: ServerResponse): VercelLikeResponse {
  const decorated = res as VercelLikeResponse;

  decorated.status = (code: number) => {
    res.statusCode = code;
    return decorated;
  };

  decorated.json = (data: unknown) => {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(data));
  };

  return decorated;
}

function handlerPathFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const pathname = url.split('?')[0];

  if (!pathname.startsWith(API_PREFIX)) return null;

  const name = pathname.slice(API_PREFIX.length).replace(/\.ts$/, '');
  // Solo nombres simples: evita que '..' o '/' escapen de la carpeta api/.
  if (!/^[a-z0-9-]+$/i.test(name)) return null;

  return `${API_PREFIX}${name}.ts`;
}

function sendInternalError(server: ViteDevServer, err: unknown, res: ServerResponse): void {
  const message = err instanceof Error ? err.message : String(err);
  server.config.logger.error(`[api-dev] ${message}`);
  if (!res.headersSent) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }
  res.end(
    JSON.stringify({
      error: 'No se pudo ejecutar la funcion en desarrollo',
      detail: message
    })
  );
}

export function apiDev(): Plugin {
  return {
    name: 'cloudops:api-dev',
    apply: 'serve',
    configureServer(server) {
      // Middleware temprano: si se registrara tarde, el middleware de
      // archivos estaticos de Vite ya habria servido api/*.ts como JS.
      server.middlewares.use(async (req, res, next) => {
        const modulePath = handlerPathFromUrl(req.url);
        if (!modulePath) {
          next();
          return;
        }

        try {
          const mod = (await server.ssrLoadModule(modulePath)) as {
            default?: VercelHandler;
          };
          const handler = mod?.default;

          if (typeof handler !== 'function') {
            throw new Error(`${modulePath} no exporta un handler por defecto`);
          }

          // Leer body para métodos POST/PUT/PATCH
          let body: unknown = undefined;
          const method = (req.method || 'GET').toUpperCase();
          if (['POST', 'PUT', 'PATCH'].includes(method)) {
            body = await new Promise<unknown>((resolve, reject) => {
              const chunks: Buffer[] = [];
              req.on('data', (chunk: Buffer) => chunks.push(chunk));
              req.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf-8');
                if (!raw) { resolve(undefined); return; }
                try { resolve(JSON.parse(raw)); }
                catch { resolve(raw); }
              });
              req.on('error', reject);
            });
          }

          const vercelReq: VercelLikeRequest = {
            method: req.method,
            headers: req.headers,
            query: toVercelQuery(req.url),
            body,
          };

          await handler(vercelReq, decorateResponse(res));
        } catch (error) {
          sendInternalError(server, error, res);
        }
      });
    }
  };
}

export default apiDev;