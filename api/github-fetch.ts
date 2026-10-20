/**
 * /api/github-fetch
 *
 * Descarga un repositorio publico de GitHub y devuelve solo sus archivos de
 * codigo, con la ruta real de cada uno, listos para el mismo analizador que un
 * ZIP subido a mano.
 *
 * Va en el servidor y no en el navegador a proposito: la API de GitHub no manda
 * cabeceras CORS para todas las operaciones, asi que hacerlo desde el cliente
 * fallaria de forma intermitente en produccion. Ademas aqui se centralizan los
 * limites (tamano, numero de archivos) y no se expone ningun token.
 *
 * POST body: { url }
 * Respuesta: { owner, repo, branch, files: [{ path, content, size }], skipped }
 */

import JSZip from 'jszip';

/**
 * 60 es el maximo de Vercel en el plan gratuito. La descarga del zipball es una
 * sola peticion, asi que un repo normal entra de sobra; se deja explicito para
 * que Vercel no corte antes con su valor por defecto.
 */
export const maxDuration = 60;

/** Extensiones que se aceptan. Las mismas que CODE_EXTENSIONS del cliente. */
export const CODE_EXTENSIONS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'py', 'java', 'cs', 'go', 'php', 'rb',
  'cpp', 'c', 'h', 'rs', 'swift', 'kt',
  'vue', 'svelte', 'html', 'sql',
]);

/** Carpetas que se ignoran: artefactos de build y dependencias, no codigo. */
export const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  '__pycache__', '.venv', 'venv', 'vendor', 'target',
  '.idea', '.vscode', 'coverage', '.cache',
  '.output', '.wrangler', '.svelte-kit', '.astro', '.turbo', '.vercel',
]);

const MAX_FILE_BYTES = 200 * 1024; // 200 KB por archivo
const MAX_ZIP_BYTES = 60 * 1024 * 1024; // 60 MB de zip como techo de descarga
const MAX_FILES = 500; // techo de archivos devueltos

/**
 * Valida la URL y extrae owner/repo.
 *
 * Se acepta EXCLUSIVAMENTE el host github.com con la forma owner/repo. Cualquier
 * subruta, query o host ajeno se rechaza: sin esto, un `fetch` a una URL que
 * llega del cliente es un SSRF en toda regla.
 */
export function parseGitHubUrl(input: string): { owner: string; repo: string } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') return null;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  // Una query o un hash no forman parte de una URL de repo. Se rechaza en vez de
  // ignorarlo, para que la intencion del usuario no se pierda en silencio.
  if (url.search || url.hash) return null;

  const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (parts.length !== 2) return null;

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;

  return { owner, repo };
}

const extensionOf = (path: string): string => path.split('.').pop()?.toLowerCase() ?? '';

/** Un archivo se ignora si CUALQUIER segmento de su ruta es una carpeta vetada. */
export function isIgnoredPath(path: string): boolean {
  return path.split('/').some((part) => IGNORE_DIRS.has(part));
}

export interface FetchedFile {
  path: string;
  content: string;
  size: number;
}

export interface ExtractResult {
  files: FetchedFile[];
  skipped: number;
}

/**
 * Extrae de un zip los archivos de codigo, con su ruta real.
 *
 * GitHub mete todo el repo bajo una carpeta raiz `owner-repo-sha/`; se quita ese
 * prefijo para que las rutas sean las del proyecto (`src/app.ts` y no
 * `owner-repo-sha/src/app.ts`), que es lo que necesita el informe para poder
 * citar `archivo:linea`.
 */
export async function extractCodeFiles(zipData: ArrayBuffer): Promise<ExtractResult> {
  const zip = await JSZip.loadAsync(zipData);
  const files: FetchedFile[] = [];
  let skipped = 0;

  const entries = Object.entries(zip.files).filter(([, entry]) => !entry.dir);

  for (const [rawPath, entry] of entries) {
    // Quita la carpeta raiz que pone GitHub al empaquetar el zipball.
    const path = rawPath.replace(/^[^/]+\//, '');

    if (!path) continue;

    if (isIgnoredPath(path)) {
      skipped += 1;
      continue;
    }

    if (!CODE_EXTENSIONS.has(extensionOf(path))) {
      skipped += 1;
      continue;
    }

    if (files.length >= MAX_FILES) {
      skipped += 1;
      continue;
    }

    const blob = await entry.async('arraybuffer');
    if (blob.byteLength > MAX_FILE_BYTES) {
      skipped += 1;
      continue;
    }

    files.push({
      path,
      content: new TextDecoder('utf-8', { fatal: false }).decode(blob),
      size: blob.byteLength,
    });
  }

  // Orden estable por ruta: sin esto, dos ejecuciones del mismo repo dan listas
  // en distinto orden y el reparto por lenguaje del cliente cambia sin motivo.
  files.sort((a, b) => a.path.localeCompare(b.path));

  return { files, skipped };
}

/** El branch por defecto del repo, o undefined si el repo no existe / es privado. */
async function defaultBranch(owner: string, repo: string): Promise<string | undefined> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { 'User-Agent': 'CloudOpsDashboard', Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { default_branch?: string };
  return data.default_branch;
}

export default async function handler(req: any, res: any) {
  const allowOrigin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  let body: { url?: string };
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ error: 'JSON invalido en el cuerpo de la solicitud.' });
    return;
  }

  const parsed = parseGitHubUrl(String(body?.url ?? ''));
  if (!parsed) {
    res.status(400).json({
      error:
        'URL de GitHub invalida. Se espera el formato https://github.com/usuario/repositorio.',
    });
    return;
  }

  const { owner, repo } = parsed;

  try {
    // La resolucion del branch por defecto tambien sirve de comprobacion de que
    // el repo existe y es publico: un 404 aqui (repo inexistente o privado) se
    // traduce a un mensaje claro en vez de dejar caer la descarga.
    const branch = await defaultBranch(owner, repo);
    if (!branch) {
      res.status(404).json({
        error: `No se pudo acceder a ${owner}/${repo}. Comprueba que existe y que es publico.`,
      });
      return;
    }

    const zipRes = await fetch(
      `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${encodeURIComponent(branch)}`,
      {
        headers: { 'User-Agent': 'CloudOpsDashboard' },
        signal: AbortSignal.timeout(40_000),
      }
    );

    if (!zipRes.ok) {
      res.status(502).json({ error: `GitHub respondio HTTP ${zipRes.status} al descargar el repositorio.` });
      return;
    }

    const length = Number(zipRes.headers.get('content-length') || 0);
    if (length > MAX_ZIP_BYTES) {
      res.status(413).json({ error: 'El repositorio es demasiado grande para analizarlo.' });
      return;
    }

    const zipData = await zipRes.arrayBuffer();
    if (zipData.byteLength > MAX_ZIP_BYTES) {
      res.status(413).json({ error: 'El repositorio es demasiado grande para analizarlo.' });
      return;
    }

    const { files, skipped } = await extractCodeFiles(zipData);

    if (files.length === 0) {
      res.status(200).json({
        owner,
        repo,
        branch,
        files: [],
        skipped,
        error: 'No se encontro codigo fuente en el repositorio (o todo estaba en carpetas ignoradas).',
      });
      return;
    }

    res.status(200).json({ owner, repo, branch, files, skipped });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'error desconocido';
    const timeout = message.includes('timeout') || message.includes('abort');
    res.status(504).json({
      error: timeout
        ? 'La descarga del repositorio tardo demasiado. Prueba con un repo mas pequeno.'
        : `No se pudo descargar el repositorio: ${message}`,
    });
  }
}
