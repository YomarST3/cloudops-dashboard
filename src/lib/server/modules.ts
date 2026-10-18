/**
 * api/_modules.ts
 *
 * Parsing compartido del proyecto: detecta lenguaje, framework y agrupa los
 * archivos en modulos por carpeta.
 *
 * Lo usan tanto /api/ai-analyze (regex) como /api/ai-review (Gemini). Ambos
 * endpoints TIENEN que obtener exactamente los mismos limites de modulo, o los
 * hallazgos de la IA quedarian adjudicados a carpetas distintas de las que uso
 * el analisis estatico y la fusion en la interfaz no tendria sentido.
 *
 * El prefijo `_` evita que Vercel despliegue esto como una funcion propia.
 */

// ─── Detección de lenguaje, framework y módulos ─────────────────────────────
//
// El frontend ya envía cada archivo delimitado por un marcador
// `// ===== FILE: ruta =====`, así que el lenguaje se deduce de la extensión
// en lugar de adivinarlo con regex sobre el texto. Los regex quedan solo para
// el framework, que no se puede leer de la extensión.

const EXTENSION_LANGUAGE: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript',
  mts: 'TypeScript',
  cts: 'TypeScript',
  js: 'JavaScript',
  jsx: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  py: 'Python',
  java: 'Java',
  cs: 'C#',
  go: 'Go',
  php: 'PHP',
  rb: 'Ruby',
  rs: 'Rust',
  c: 'C',
  h: 'C',
  cpp: 'C++',
  hpp: 'C++',
  swift: 'Swift',
  kt: 'Kotlin',
  vue: 'Vue',
  svelte: 'Svelte',
  html: 'HTML',
  css: 'CSS',
  sql: 'SQL',
};

const languageOfPath = (path: string): string => {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_LANGUAGE[ext] ?? 'Texto';
};

/**
 * El lenguaje de un modulo es el de la extension que mas lineas aporta. Asi una
 * carpeta con un `.ts` de configuracion y 20 `.tsx` no se reporta como mixta.
 */
const dominantLanguage = (files: { path: string; content: string }[]): string => {
  const weight = new Map<string, number>();
  for (const file of files) {
    const lang = languageOfPath(file.path);
    const lines = file.content.split('\n').filter((l) => l.trim()).length;
    weight.set(lang, (weight.get(lang) ?? 0) + lines);
  }
  let best = 'Texto';
  let bestWeight = -1;
  for (const [lang, w] of weight) {
    if (w > bestWeight) {
      best = lang;
      bestWeight = w;
    }
  }
  return best;
};

const FRAMEWORK_RULES: Array<[string, RegExp]> = [
  ['Next.js', /from\s+['"]next(?:\/|['"])/],
  ['React', /from\s+['"]react(?:\/|['"])|from\s+['"]react-dom(?:\/|['"])|@tanstack\/react-/],
  ['Vue', /from\s+['"]vue(?:\/|['"])|createApp\s*\(/],
  ['Svelte', /from\s+['"]svelte(?:\/|['"])/],
  ['Angular', /@angular\/core|@Component\s*\(/],
  ['Node.js/Express', /require\s*\(['"]express['"]\)|from\s+['"]express['"]/],
  ['FastAPI', /from\s+fastapi|import\s+fastapi/],
  ['Django', /from\s+django|import\s+django/],
  ['Flask', /from\s+flask|import\s+flask/],
  ['Laravel', /Illuminate\\Http|use\s+Illuminate/],
];

export function detectFramework(content: string): string | undefined {
  for (const [label, re] of FRAMEWORK_RULES) {
    if (re.test(content)) return label;
  }
  return undefined;
}

const FILE_MARKER = /^\/\/ ===== FILE: (.+?) =====$/;

const BUILD_DIRS = ['dist', 'build', '.next', '.output', '.wrangler', '.svelte-kit', '.astro'];

/** Carpetas que son codigo fuente, nunca la raiz del proyecto. */
const SOURCE_DIRS = ['src', 'app', 'lib', 'source', 'pages', 'components', 'server', 'client', 'api'];

/**
 * Un ZIP suele traer la carpeta del proyecto dentro ("mi-app/src/main.tsx"), y
 * esa raiz sobra en los nombres de los modulos. Pero solo se puede quitar si
 * TODOS los archivos la comparten y no es una carpeta de codigo habitual.
 */
function computeRootPrefix(paths: string[]): string {
  if (paths.length === 0) return '';
  const first = paths[0].split('/').filter(Boolean)[0];
  if (!first) return '';

  const shared = paths.every((p) => p.split('/').filter(Boolean)[0] === first);
  if (!shared) return '';
  if (SOURCE_DIRS.includes(first.toLowerCase())) return '';

  return first;
}

function normalizePath(raw: string, rootPrefix: string): string {
  const clean = raw.replace(/\\/g, '/').replace(/^\.\//, '');
  const segments = clean.split('/').filter(Boolean);

  const stripped =
    rootPrefix && segments[0] === rootPrefix ? segments.slice(1) : segments;
  const filtered = stripped.filter((seg) => !BUILD_DIRS.includes(seg));

  return filtered.join('/') || stripped.join('/') || clean;
}

export interface SourceFile {
  path: string;
  content: string;
}

/** Separa el blob respetando los marcadores que emite el frontend. */
export function parseFiles(code: string): SourceFile[] {
  const lines = code.split('\n');
  const files: SourceFile[] = [];
  let currentPath: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentPath) {
      files.push({ path: currentPath, content: buffer.join('\n') });
    }
    currentPath = null;
    buffer = [];
  };

  for (const line of lines) {
    const marker = FILE_MARKER.exec(line);
    if (marker) {
      flush();
      currentPath = marker[1].trim();
      continue;
    }
    if (currentPath) buffer.push(line);
  }
  flush();

  return files.filter((f) => f.content.trim().length > 0);
}

/**
 * Tope de modulos por analisis. Es tambien el techo de peticiones a Gemini:
 * cada modulo consume una request, asi que 20 deja muy holgado el limite
 * gratuito diario (500) incluso analizando proyecto tras proyecto.
 *
 * Este valor esta duplicado en api/ai-analyze.ts, que no importa nada (Vercel
 * compila cada funcion por separado). Si los dos se desincronizan, los modulos
 * se agruparian distinto en cada endpoint y los hallazgos de la IA caerian en
 * carpetas equivocadas. La prueba de paridad de tests/ falla si eso ocurre.
 */
export const MAX_MODULES = 20;

export interface FileModule {
  name: string;
  content: string;
  language: string;
  framework?: string;
  fileCount: number;
  /**
   * Que archivo ocupa que rango de lineas dentro de `content`.
   *
   * Un modulo son varios archivos pegados con '\n\n', y al pegarlos se perdia
   * donde acababa cada uno. Por eso no habia forma de señalar un hallazgo en el
   * codigo: solo se sabia la carpeta. Con estos rangos, el offset de un match
   * se traduce a "archivo + linea", que es lo que hace el analisis verificable.
   */
  spans: FileSpan[];
}

/** Rango ocupado por un archivo dentro del contenido de un modulo. */
export interface FileSpan {
  path: string;
  /** Lineas 1-based del contenido del modulo. */
  startLine: number;
  endLine: number;
}

/**
 * Localiza un offset del contenido del modulo: devuelve archivo, linea real y
 * el texto de esa linea, que hace falta para decidir si un hallazgo es real o
 * solo un consejo (un `Password: "Contraseña"` en un diccionario i18n y una
 * credencial de verdad se detectan con el mismo regex).
 *
 * Devuelve null si el offset cae fuera de todo span.
 */
export function locate(
  module: FileModule,
  offset: number
): { file: string; line: number; text: string } | null {
  if (module.spans.length === 0) return null;

  const before = module.content.slice(0, offset);
  const line = before.split('\n').length;
  const span = module.spans.find((s) => line >= s.startLine && line <= s.endLine);
  if (!span) return null;

  // La línea COMPLETA, no la que empieza en el match: las palabras que deciden
  // si el hallazgo es real ("token", "password") suelen estar ANTES de donde
  // casó el regex.
  const lineStart = before.lastIndexOf('\n') + 1;
  const lineEnd = module.content.indexOf('\n', offset);
  const text = module.content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();

  return { file: span.path, line: line - span.startLine + 1, text };
}

/**
 * Un modulo por carpeta. Para un proyecto real esto describe la arquitectura
 * (src/routes, components/ui, lib) y da muchas mas ejecuciones por patron de
 * seguridad que los tres cortes por lineas que se usaban antes.
 */
export function buildFolderModules(files: SourceFile[]): FileModule[] {
  const rootPrefix = computeRootPrefix(files.map((f) => f.path));
  const groups = new Map<string, SourceFile[]>();

  for (const file of files) {
    const dir = normalizePath(file.path, rootPrefix);
    const key = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '.';
    const bucket = groups.get(key);
    if (bucket) bucket.push(file);
    else groups.set(key, [file]);
  }

  const toModule = (name: string, groupFiles: SourceFile[]): FileModule => {
    const content = groupFiles.map((f) => f.content).join('\n\n');

    // Se reconstruye la tabla de archivos mientras se pega el contenido. Cada
    // archivo ocupa lineas consecutiveas, asi que basta con ir sumando las
    // lineas de cada uno mas la linea en blanco del separador.
    const spans: FileSpan[] = [];
    let cursor = 1;
    for (const f of groupFiles) {
      const lines = f.content.split('\n').length;
      spans.push({ path: f.path, startLine: cursor, endLine: cursor + lines - 1 });
      cursor += lines + 1; // +1 por el separador
    }

    return {
      name,
      content,
      language: dominantLanguage(groupFiles),
      framework: detectFramework(content),
      fileCount: groupFiles.length,
      spans,
    };
  };

  const modules = Array.from(groups.entries())
    .map(([dir, groupFiles]) => toModule(dir === '.' ? '(raiz)' : dir, groupFiles))
    .sort((a, b) => b.content.split('\n').length - a.content.split('\n').length);

  if (modules.length <= MAX_MODULES) return modules;

  const head = modules.slice(0, MAX_MODULES - 1);
  const tail = modules.slice(MAX_MODULES - 1);
  head.push(toModule('otros', tail.flatMap((m) => m.content.split('\n\n').map((c) => ({ path: 'x.ts', content: c })))));
  head[head.length - 1].fileCount = tail.reduce((acc, m) => acc + m.fileCount, 0);
  return head;
}

/**
 * Sin marcadores (codigo pegado a mano o modo descripcion) no hay rutas que
 * agrupar: se devuelve un unico modulo con el nombre del proyecto.
 */
export function buildSingleModule(code: string, projectName: string): FileModule {
  return {
    name: projectName || 'Código enviado',
    content: code,
    language: guessLanguageFromContent(code),
    framework: detectFramework(code),
    fileCount: 1,
    // Sin marcadores no hay nombres de archivo: un unico span que cubre todo el
    // contenido hace que locate() devuelva null en vez de inventar un archivo.
    spans: [],
  };
}

/** Fallback para entradas sin nombre de archivo. */
function guessLanguageFromContent(code: string): string {
  if (/^\s*(?:def |from \w+ import |import \w+)/m.test(code) && !/\{|=>|function/.test(code.slice(0, 400))) {
    return 'Python';
  }
  if (/:\s*(?:string|number|boolean)\b|\binterface\s+\w+|:\s*\w+\s*=>/.test(code)) return 'TypeScript';
  if (/require\s*\(['"]|module\.exports|console\.log/.test(code)) return 'JavaScript';
  if (/<\?php/.test(code)) return 'PHP';
  if (/public\s+static\s+void\s+main/.test(code)) return 'Java';
  if (/package\s+main|func\s+main\s*\(/.test(code)) return 'Go';
  if (/using\s+System|namespace\s+\w+/.test(code)) return 'C#';
  return 'JavaScript';
}