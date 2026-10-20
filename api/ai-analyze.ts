/**
 * /api/ai-analyze
 *
 * Analiza el código o descripción de un proyecto y devuelve:
 *  - Score de seguridad por módulo y global (0-100)
 *  - Hallazgos de seguridad (vulnerabilidades, malas prácticas)
 *  - Recomendaciones de arquitectura AWS
 *  - Estimación de costos mensuales/anuales
 *
 * POST body: { projectName, code?, description?, language?, region }
 */

interface FindingDef {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  title: string;
  description: string;
  recommendation: string;
  cweId?: string;
  pattern: RegExp;
  lineHint?: (match: RegExpExecArray) => string;
  /**
   * Consejo de endurecimiento, no vulnerabilidad. Se muestra pero no puntua.
   * Copia literal de src/lib/server/analyze.ts (ver el aviso de duplicacion).
   */
  advisory?: boolean;
  /**
   * Decide, con el contexto real de la linea, si lo encontrado es una
   * vulnerabilidad o solo un consejo. Se usa donde el regex es necesariamente
   * amplio: un "password: \"algo\"" puede ser una credencial o la etiqueta de
   * un campo de formulario, y "Math.random()" puede generar un token o elegir
   * el ancho de un esqueleto de carga. Nada se oculta: el hallazgo se sigue
   * viendo con su archivo y su linea, solo deja de bajar el puntaje.
   */
  advisoryWhen?: (ctx: { line: string; file: string; match: string }) => boolean;
  /**
   * A que lenguajes aplica la regla. Si no se indica, aplica a todos.
   *
   * Hace falta porque los patrones no viven solos en su lenguaje: la palabra
   * "service_role" es una credencial gravísima en un \.ts de cliente, pero es
   * algo completamente normal dentro de un GRANT en una migracion de Postgres.
   * Sin este filtro, cada regla de JS dispararia tambien sobre el SQL.
   */
  languages?: string[];
}

// ─── Patrones de análisis de seguridad ───────────────────────────────────────

// ─── Reglas de SQL y Supabase ────────────────────────────────────────────────
//
// El motor de patrones miraba solo Javascript. En un proyecto con Supabase el
// riesgo de verdad esta en las migraciones: si una tabla no tiene Row Level
// Security, la clave publica "anon" que viaja en el navegador puede leerla
// entera. Ese SQL ademas no llegaba ni a enviarse (ver la seleccion de archivos
// en ProjectAnalyzer), asi que no es que no se encontrara nada: es que no se
// miraba.
//
// Tres reglas son patrones normales. La cuarta, "tabla sin RLS", no cabe en un
// regex porque exige comparar dos conjuntos: las tablas que se crean y las que
// se protegen. Va aparte, como auditSqlModule().

const SQL_RULES: FindingDef[] = [
  {
    id: 'service-role-in-client',
    severity: 'critical',
    category: 'Secrets Management',
    title: 'Clave service_role accesible desde el cliente',
    description:
      'La clave service_role aparece en codigo de cliente. Esa clave evade por completo Row Level Security: con ella se pueden leer y modificar todas las tablas, saltandose las politicas. Es la diferencia entre "la base de datos esta protegida" y "no lo esta".',
    recommendation:
      'Revocarla en el panel de Supabase y mantenerla solo en el servidor, en una variable de entorno del backend. En el cliente solo debe existir la clave anon, que es publica por diseno y esta pensada para ir en el navegador.',
    cweId: 'CWE-798',
    pattern: /service_role/i,
    languages: ['TypeScript', 'JavaScript'],
  },
  {
    id: 'rls-permissive-write',
    severity: 'high',
    category: 'Access Control',
    title: 'Politica de escritura abierta a cualquiera',
    description:
      'Una politica usa USING (true) o WITH CHECK (true) sobre INSERT, UPDATE o DELETE. Eso permite que cualquiera escriba, cambie o borre filas sin ninguna condicion, incluso con la clave anonima.',
    recommendation:
      'Restringir la escritura al dueno de la fila: WITH CHECK (auth.uid() = user_id). Si la tabla solo la escribe el backend, deja la politica sin TO para el usuario y quita el acceso de escritura al rol anon.',
    cweId: 'CWE-862',
    pattern:
      /CREATE\s+POLICY[^;]{0,400}FOR\s+(?:ALL|INSERT|UPDATE|DELETE)[^;]{0,300}(?:USING|WITH\s+CHECK)\s*\(\s*(?:true|1)\s*\)/i,
    languages: ['SQL'],
  },
  {
    id: 'rls-permissive-read',
    severity: 'low',
    category: 'Access Control',
    title: 'Lectura publica sin restriccion',
    description:
      'Una politica permite leer toda la tabla sin condicion, incluso a usuarios anonimos. Puede ser intencionado (un catalogo publico), pero si la tabla guarda datos personales o de negocio es una fuga.',
    recommendation:
      'Confirma que solo haya datos publicos. Si hay informacion sensible, cambia a USING (auth.uid() = user_id) para los autenticados y deja la lectura anonima solo para lo que sea realmente publico.',
    cweId: 'CWE-639',
    pattern: /CREATE\s+POLICY[^;]{0,400}FOR\s+SELECT[^;]{0,300}USING\s*\(\s*(?:true|1)\s*\)/i,
    languages: ['SQL'],
  },
];

/**
 * Tablas creadas que nunca se protegen con Row Level Security.
 *
 * No cabe en un regex: hay que leer el modulo entero y comparar. Con la clave
 * anon dentro del bundle del navegador, una tabla sin RLS es una tabla publica.
 */
function auditSqlModule(module: FileModule, idPrefix: string) {
  if (module.language !== 'SQL') return [];

  const content = module.content;
  const out: SecurityFinding[] = [];

  const protectedTables = new Set<string>();
  const rlsRe =
    /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
  let m: RegExpExecArray | null;
  while ((m = rlsRe.exec(content)) !== null) protectedTables.add(m[1].toLowerCase());

  const createdRe =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;
  const seen = new Set<string>();

  while ((m = createdRe.exec(content)) !== null) {
    const name = m[1].toLowerCase();
    if (protectedTables.has(name) || seen.has(name)) continue;
    seen.add(name);

    const where = locate(module, m.index);

    out.push({
      id: `${idPrefix}-sql-no-rls-${name}`,
      severity: 'high',
      category: 'Access Control',
      title: `Tabla "${name}" sin Row Level Security`,
      description:
        `La tabla ${name} se crea pero nunca se le ejecuta ALTER TABLE ... ENABLE ROW LEVEL SECURITY. ` +
        'La clave anon viaja dentro del bundle del navegador y es publica por diseno, asi que sin RLS ' +
        'cualquiera que abra las herramientas de red del navegador puede leer o escribir todas sus filas.',
      recommendation:
        `Ejecuta ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY y crea politicas que comprueben ` +
        'la propiedad, del estilo USING (auth.uid() = user_id).',
      affectedModule: module.name,
      cweId: 'CWE-284',
      source: 'regex',
      file: where?.file,
      line: where?.line,
    });
  }

  return out;
}

const SECURITY_PATTERNS: FindingDef[] = [
  {
    id: 'sql-injection',
    severity: 'critical',
    category: 'Injection',
    title: 'Posible Inyección SQL',
    description: 'Se detecta concatenación directa de entrada del usuario en consultas SQL, lo que puede permitir a un atacante manipular la base de datos.',
    recommendation: 'Usar consultas parametrizadas (prepared statements) o un ORM que las maneje automáticamente. Nunca concatenar strings en consultas SQL.',
    cweId: 'CWE-89',
    pattern: /(?:query|execute|sql|db\.run|connection\.query)\s*\(\s*[`"'].*?\+|\$\{.*?\}.*?(?:SELECT|INSERT|UPDATE|DELETE|DROP|WHERE)/i,
    lineHint: (m) => `Línea cerca de: "${m[0].substring(0, 60)}..."`,
  },
  {
    id: 'hardcoded-secret',
    severity: 'critical',
    category: 'Secrets Management',
    title: 'Credenciales Hardcodeadas',
    description: 'Se encontraron contraseñas, tokens o claves de API escritas directamente en el código fuente.',
    recommendation: 'Mover todas las credenciales a variables de entorno (.env) y usar AWS Secrets Manager o AWS Systems Manager Parameter Store para producción.',
    cweId: 'CWE-798',
    pattern: /(?:password|passwd|secret|api_?key|apikey|token|auth_?token|private_?key)\s*[:=]\s*["'][^"']{6,}/i,
    lineHint: (m) => `Secreto detectado: "${m[0].substring(0, 50).replace(/(["'][^"']{3})[^"']*(["'])/g, '$1***$2')}..."`,
    advisoryWhen: hardcodedSecretIsAdvisory,
  },
  {
    id: 'xss-vulnerability',
    severity: 'high',
    category: 'XSS',
    title: 'Riesgo de Cross-Site Scripting (XSS)',
    description: 'El código inserta contenido HTML sin sanitizar, lo que permite a un atacante inyectar scripts maliciosos.',
    recommendation: 'Sanitizar toda entrada del usuario antes de renderizar en HTML. Usar DOMPurify, evitar innerHTML con datos externos y aplicar Content Security Policy (CSP).',
    cweId: 'CWE-79',
    pattern: /(?:innerHTML|document\.write|\.html\()\s*[^;]*(?:\+|`|\$\{)/i,
    lineHint: () => 'Uso de innerHTML con contenido dinámico',
  },
  {
    id: 'weak-crypto',
    severity: 'high',
    category: 'Cryptography',
    title: 'Algoritmo Criptográfico Débil',
    description: 'Se detecta uso de MD5 o SHA-1, que son algoritmos obsoletos y vulnerables a colisiones.',
    recommendation: 'Migrar a SHA-256 o SHA-3 para hashing. Para contraseñas usar bcrypt, argon2 o PBKDF2 con al menos 10 rondas.',
    cweId: 'CWE-327',
    pattern: /(?:md5|sha1|createHash\(['"]md5['"]|createHash\(['"]sha1['"])/i,
  },
  {
    id: 'insecure-random',
    severity: 'medium',
    category: 'Cryptography',
    title: 'Generación de Números Aleatorios Inseguros',
    description: 'Math.random() no es criptográficamente seguro. Usar para tokens, sesiones o IDs puede ser predecible.',
    recommendation: 'Usar crypto.randomUUID(), crypto.randomBytes() (Node.js) o window.crypto.getRandomValues() para valores de seguridad.',
    cweId: 'CWE-338',
    pattern: /Math\.random\(\)/,
    advisoryWhen: insecureRandomIsAdvisory,
  },
  {
    id: 'cors-wildcard',
    severity: 'high',
    category: 'Access Control',
    title: 'CORS con Comodín (*)',
    description: 'La política CORS permite peticiones de cualquier origen, exponiendo la API a ataques cross-origin.',
    recommendation: 'Definir explícitamente los orígenes permitidos en lugar de usar *. En AWS, configurar CORS específico en API Gateway o CloudFront.',
    cweId: 'CWE-942',
    pattern: /Access-Control-Allow-Origin['":\s]+\*|cors\(\s*\)/,
  },
  {
    id: 'no-auth-check',
    severity: 'high',
    category: 'Authentication',
    title: 'Endpoint sin Verificación de Autenticación',
    description: 'Se detectan rutas de API sin middleware de autenticación, que podrían exponer datos sensibles.',
    recommendation: 'Implementar middleware de autenticación JWT o Cognito antes de cada endpoint protegido. Usar AWS API Gateway con authorizers.',
    cweId: 'CWE-306',
    pattern: /(?:app\.(?:get|post|put|delete|patch)|router\.(?:get|post|put|delete|patch))\s*\([^)]+\)\s*(?:\n|.){0,30}(?:req\s*,\s*res)/,
    advisory: true,
  },
  {
    id: 'console-log-sensitive',
    severity: 'medium',
    category: 'Information Disclosure',
    title: 'Logs con Datos Sensibles',
    description: 'Se registran contraseñas, tokens o información personal en console.log, lo que puede exponer datos en logs de producción.',
    recommendation: 'Eliminar todos los console.log en producción. Usar un sistema de logging estructurado (Winston, Pino) con AWS CloudWatch Logs y redactar campos sensibles.',
    cweId: 'CWE-532',
    pattern: /console\.(?:log|error|warn|info)\s*\([^)]*(?:password|token|secret|key|auth|credit|ssn|email|user)/i,
  },
  {
    id: 'prototype-pollution',
    severity: 'high',
    category: 'Injection',
    title: 'Posible Contaminación de Prototipo',
    description: 'El uso de Object.assign o spread con datos no validados puede llevar a prototype pollution en JavaScript.',
    recommendation: 'Validar y sanitizar los datos de entrada antes de asignar a objetos. Usar Object.create(null) para objetos de configuración críticos.',
    cweId: 'CWE-1321',
    pattern: /Object\.assign\s*\(\s*(?:req\.body|JSON\.parse)/,
  },
  {
    id: 'open-redirect',
    severity: 'medium',
    category: 'Redirect',
    title: 'Redirección Abierta',
    description: 'Se detecta redirección usando parámetros del usuario sin validación, que puede ser explotada para phishing.',
    recommendation: 'Validar las URLs de redirección contra una lista blanca de dominios permitidos.',
    cweId: 'CWE-601',
    pattern: /res\.redirect\s*\(\s*req\.(?:query|body|params)/,
  },
  {
    id: 'no-rate-limit',
    severity: 'medium',
    category: 'Denial of Service',
    title: 'Sin Rate Limiting',
    description: 'La API no implementa límites de tasa, lo que la hace vulnerable a ataques de fuerza bruta y DDoS.',
    recommendation: 'Implementar rate limiting con express-rate-limit o similar. En AWS, usar API Gateway throttling y AWS WAF.',
    cweId: 'CWE-770',
    pattern: /(?:express|app)\s*=\s*(?:express|require\(['"]express['"])\s*\(\s*\)(?:(?!\brateLimit\b).)*$/s,
    advisory: true,
  },
  {
    id: 'insecure-deserialization',
    severity: 'high',
    category: 'Deserialization',
    title: 'Deserialización Insegura',
    description: 'eval() o Function() con datos externos puede ejecutar código arbitrario del atacante.',
    recommendation: 'Nunca usar eval() con datos del usuario. Usar JSON.parse() con validación de esquema.',
    cweId: 'CWE-502',
    pattern: /eval\s*\(\s*(?:req\.|JSON|data|input|body)/,
  },
  {
    id: 'missing-https',
    severity: 'medium',
    category: 'Transport Security',
    title: 'URLs HTTP sin Cifrar',
    description: 'Se usan URLs HTTP en lugar de HTTPS para comunicaciones internas o externas.',
    recommendation: 'Forzar HTTPS en todas las comunicaciones. Configurar HSTS y usar AWS ACM para certificados TLS.',
    cweId: 'CWE-319',
    pattern: /(?:fetch|axios|http\.get|request)\s*\(\s*['"]http:\/\/(?!localhost)/,
  },
  {
    id: 'env-not-validated',
    severity: 'low',
    category: 'Configuration',
    title: 'Variables de Entorno sin Validación',
    description: 'Se accede a process.env sin verificar que los valores existan, lo que puede causar fallos silenciosos en producción.',
    recommendation: 'Validar las variables de entorno al inicio de la aplicación usando zod, joi o envalid. Documentar todas las variables requeridas.',
    cweId: 'CWE-20',
    pattern: /process\.env\.\w+(?!\s*\?\?|\s*\|\||\s*\!)/,
    advisory: true,
  },
  {
    id: 'dependency-vulnerable',
    severity: 'info',
    category: 'Dependencies',
    title: 'Gestión de Dependencias',
    description: 'Se detectan imports de paquetes. Sin información del lockfile no es posible verificar si existen CVEs activos.',
    recommendation: 'Ejecutar npm audit o snyk test regularmente. Activar Dependabot en GitHub para actualizaciones automáticas de seguridad.',
    cweId: 'CWE-1104',
    pattern: /require\s*\(['"](?!\.\/|\.\.\/)[a-z@]/,
    advisory: true,
  },
];

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

function detectFramework(content: string): string | undefined {
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

interface SourceFile {
  path: string;
  content: string;
}

/** Separa el blob respetando los marcadores que emite el frontend. */
function parseFiles(code: string): SourceFile[] {
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

const MAX_MODULES = 20;

// Tipo SOLO: se borra al compilar, asi que no afecta a que este fichero sea
// autocontenido en tiempo de ejecucion.
import type { SecurityFinding } from '../src/types/cloud';

interface FileSpan {
  path: string;
  /** Lineas 1-based del contenido del modulo. */
  startLine: number;
  endLine: number;
}

interface FileModule {
  name: string;
  content: string;
  language: string;
  framework?: string;
  fileCount: number;
  /**
   * Que archivo ocupa que rango de lineas dentro de `content`. Copia literal de
   * src/lib/server/modules.ts: este fichero esta duplicado a proposito porque
   * Vercel compila cada funcion de api/ por separado. La prueba de paridad de
   * tests/ falla si las dos copias divergen.
   */
  spans: FileSpan[];
}

/**
 * Localiza un offset del contenido del modulo: devuelve archivo, linea real y
 * el texto de esa linea. Copia literal de src/lib/server/modules.ts (ver el
 * aviso de duplicacion).
 */
function locate(
  module: FileModule,
  offset: number
): { file: string; line: number; text: string } | null {
  if (module.spans.length === 0) return null;

  const before = module.content.slice(0, offset);
  const line = before.split('\n').length;
  const span = module.spans.find((s) => line >= s.startLine && line <= s.endLine);
  if (!span) return null;

  // La línea COMPLETA, no la que empieza en el match: las palabras que deciden
  // si el hallazgo es real suelen estar ANTES de donde casó el regex.
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
function buildFolderModules(files: SourceFile[]): FileModule[] {
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

    // Copia literal de src/lib/server/modules.ts (ver el aviso de duplicacion).
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
function buildSingleModule(code: string, projectName: string): FileModule {
  return {
    name: projectName || 'Código enviado',
    content: code,
    language: guessLanguageFromContent(code),
    framework: detectFramework(code),
    fileCount: 1,
    // Copia literal de src/lib/server/modules.ts (ver el aviso de duplicacion).
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

// ─── Formula de puntaje ──────────────────────────────────────────────────────
//
// Copia literal de src/lib/server/analyze.ts (ver el aviso de duplicacion).
// Vive aqui y no dentro del handler porque la usan los dos endpoints: el
// analisis estatico al puntuar cada modulo, y la revision con IA al recalcular
// ese mismo puntaje tras anadir sus hallazgos.

const PENALTIES: Record<'critical' | 'high' | 'medium' | 'low' | 'info', number> = {
  critical: 50,
  high: 25,
  medium: 8,
  low: 3,
  info: 1,
};

/** Los hallazgos que puntuan son los que son vulnerabilidades. */
/**
 * Los que mueven el score: ni los consejos de hardening ni los hallazgos de la IA
 * sin archivo, que no se pueden comprobar. Un hallazgo de REGEX sin archivo si
 * cuenta: en el modo pegar no hay nombres de archivo, pero el usuario pegó ese
 * codigo y puede verlo entero.
 */
function puntua(f: {
  advisory?: boolean;
  source?: 'regex' | 'ai';
  file?: string;
}): boolean {
  return !f.advisory && (f.source !== 'ai' || Boolean(f.file));
}

function scored(findings: {
  advisory?: boolean;
  severity: keyof typeof PENALTIES;
  source?: 'regex' | 'ai';
  file?: string;
}[]) {
  return findings.filter(puntua);
}

/** Arranca en 100 y descuenta por severidad, sin bajar de 0. */
function scoreOf(findings: { advisory?: boolean; severity: keyof typeof PENALTIES }[]): number {
  const penalty = scored(findings).reduce((acc, f) => acc + (PENALTIES[f.severity] ?? 0), 0);
  return Math.max(0, 100 - penalty);
}

function statusOf(findings: { advisory?: boolean; severity: keyof typeof PENALTIES }[]) {
  const real = scored(findings);
  return real.some((f) => f.severity === 'critical')
    ? ('critical' as const)
    : real.some((f) => f.severity === 'high')
      ? ('warning' as const)
      : ('secure' as const);
}

// ─── Cumplimiento y desglose del score ──────────────────────────────────────
//
// Antes el "cumplimiento" era 100 menos diez por cada categoria distinta de
// vulnerabilidad. Eso no significaba nada: un proyecto con veinte inyecciones
// SQL (una sola categoria) puntuaba MEJOR que uno con tres problemas
// distintos. Ademas, como las categorias de ruido contaban, casi todo proyecto
// real salia por debajo de 70 sin tener un solo fallo.
//
// Ahora son seis controles con nombre, aprobado/fallo y el motivo. Un
// porcentaje que significa "el 60% de lo que decidimos contar" no se puede
// defender; "4 de 6 controles, y este falla porque no hay RLS" si.

interface ComplianceControl {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

interface ScoreLine {
  label: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  penalty: number;
  /** Cuantas veces se repite el problema en ese modulo. */
  occurrences?: number;
}

/** "src/routes/auth.js:4", o el modulo si el hallazgo no tiene archivo. */
function loc(f: { file?: string; line?: number; affectedModule: string }): string {
  if (!f.file) return f.affectedModule;
  return f.line ? `${f.file}:${f.line}` : f.file;
}

/** Lo que resta cada repeticion extra del MISMO patron en otro archivo. */
const REPEAT_PENALTY = 5;

/**
 * Score del proyecto: parte de 100 y descuenta. Se deduplica por (patron,
 * archivo) y no por patron solo: el mismo patron en dos archivos son dos
 * problemas, y si la primera aparicion era una recomendacion, la version por
 * patron solo tiraba el hallazgo REAL de la segunda y dejaba el proyecto en
 * 100/100. La primera aparicion resta su penalizacion completa y cada archivo
 * extra resta REPEAT_PENALTY, para que 50 secretos no hundan el score a 0.
 *
 * El desglose se genera aqui con las penalizaciones reales: la suma de sus
 * lineas es exactamente lo que se resta, y la pantalla puede ensenar
 * "100 - 25 - 5 = 70" sin que la cuenta mienta.
 *
 * Es generica para devolver los hallazgos con SU tipo completo (siguen
 * necesitando category y lo demas para buildAwsRecommendations).
 */
function scoreProject<
  T extends {
    id: string;
    title: string;
    severity: keyof typeof PENALTIES;
    file?: string;
    line?: number;
    affectedModule: string;
    occurrences?: number;
    advisory?: boolean;
    source?: 'regex' | 'ai';
  }
>(findings: T[]): {
  score: number;
  breakdown: ScoreLine[];
  deduped: T[];
} {
  const seen = new Set<string>();
  const seenPatterns = new Set<string>();
  const breakdown: ScoreLine[] = [];
  const deduped: T[] = [];
  let penalty = 0;

  /** Los archivos reales del hallazgo, o su modulo si no tiene archivo. */
  const filesOf = (f: {
    file?: string;
    locations?: { file: string }[];
    affectedModule: string;
  }): string[] => {
    const files = new Set<string>();
    if (f.file) files.add(f.file);
    for (const l of f.locations ?? []) files.add(l.file);
    return files.size > 0 ? Array.from(files) : [f.affectedModule];
  };

  for (const f of findings) {
    const pattern = f.id.replace(/^mod\d+-/, '');

    // Un mismo hallazgo abarca varios archivos cuando el patron se repite en
    // ellos: se cuenta como problema en CADA uno. Los archivos del mismo modulo
    // comparten `name`, asi que un dedup por nombre fundiria los cinco en uno y
    // ademas dejaria que una recomendacion tapara al critico real.
    let seenAny = false;
    const pendientes: string[] = [];
    for (const file of filesOf(f)) {
      const key = `${pattern}@@${file}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!seenAny) {
        seenAny = true;
        deduped.push(f);
      } else {
        pendientes.push(file);
      }
    }
    if (!seenAny) continue;
    if (!puntua(f)) continue;

    // La penalizacion completa la paga el patron en su PRIMER archivo, sin
    // importar el orden; los siguientes pagan el tope, que evita que 50
    // secretos hundan el score a 0.
    const base = PENALTIES[f.severity] ?? 0;
    const count = 1 + pendientes.length;
    let value = 0;
    let pagoCompleto = false;
    for (let i = 0; i < count; i += 1) {
      const first = !seenPatterns.has(pattern);
      seenPatterns.add(pattern);
      if (first) {
        pagoCompleto = true;
        value += base;
      } else {
        value += Math.min(REPEAT_PENALTY, base);
      }
    }
    if (value <= 0) continue;

    penalty += value;
    breakdown.push({
      label: firstLabel(f, pagoCompleto, count),
      severity: f.severity,
      penalty: value,
      occurrences: f.occurrences,
    });
  }

  breakdown.sort((a, b) => b.penalty - a.penalty);
  return { score: Math.max(0, 100 - penalty), breakdown, deduped };
}

/**
 * Etiqueta del desglose. Cuando un hallazgo abarca varios archivos hay que
 * decirlo: la suma de la linea (varias veces la penalidad) no coincidiria con
 * un relato de "un problema, 50 puntos".
 */
function firstLabel(
  f: { title: string; severity: keyof typeof PENALTIES; file?: string; line?: number; affectedModule: string },
  primeraEsCompleta: boolean,
  archivosContados: number
): string {
  const nombre = primeraEsCompleta ? f.title : `${f.title} (repeticion del patron)`;
  if (archivosContados === 1) return `${nombre} - ${loc(f)}`;
  const valor = PENALTIES[f.severity] ?? 0;
  const extra = (archivosContados - 1) * Math.min(REPEAT_PENALTY, valor);
  return `${nombre} en ${archivosContados} archivos - ${loc(f)} (${valor} + ${extra})`;
}

// Senales de codigo para los controles que no dependen de un hallazgo
// concreto: que exista autenticacion o autorizacion no se deduce de un regex.
const AUTH_RE = /\b(auth|login|signIn|sign_in|signUp|jwt|oauth|session|cookie|currentUser|current_user|getSession|verifyToken|passport)\b/i;
const AUTHZ_RE = /\b(authorize|authorization|permission|permissions|role|roles|isAdmin|owner|owner_id|auth\.uid\(\)|user_id|canAccess|rls|row level security|create policy)\b/i;

/**
 * Seis controles de cumplimiento. Cada uno mira hallazgos reales (con su
 * localizacion) o señales de código, y explica por qué pasa o falla.
 */
/**
 * Los controles se decidian por ID DE PATRON: hit('sql-injection',
 * 'xss-vulnerability', ...). Eso funciona para los hallazgos estaticos, pero un
 * hallazgo de la IA tiene un id como `ai-mod0-0-xss`, y el normalize
 * `replace(/^mod\d+-/, '')` no le quita el prefijo `ai-`. Resultado: NINGUN
 * hallazgo de la IA podia hacer fallar un control, y el cumplimiento se
 * mantenia alto con hallazgos criticos abiertos.
 *
 * El CWE es lo que ambas capas comparten: lo dice el propio hallazgo y no
 * depende de que capa lo produjo. Por eso los controles se deciden por CWE.
 */
const CONTROL_CWES = {
  autenticacion: ['CWE-287', 'CWE-306', 'CWE-384'],
  autorizacion: ['CWE-862', 'CWE-863', 'CWE-639', 'CWE-284', 'CWE-285'],
  secretos: ['CWE-798', 'CWE-259', 'CWE-321'],
  cifrado: ['CWE-327', 'CWE-338', 'CWE-916', 'CWE-326'],
  transporte: ['CWE-319', 'CWE-311'],
  validacion: ['CWE-89', 'CWE-79', 'CWE-502', 'CWE-1321', 'CWE-601'],
} satisfies Record<string, string[]>;

type ControlId = keyof typeof CONTROL_CWES;

interface ControlFinding {
  id: string;
  cweId?: string;
  advisory?: boolean;
  title: string;
  file?: string;
  line?: number;
  affectedModule: string;
  source?: 'regex' | 'ai';
}

/**
 * Un control se puede fallar por dos vias: un hallazgo con el CWE que le
 * corresponde, o, en autenticacion y autorizacion, por la ausencia de senal
 * en el codigo. Se mezclan las dos porque las dos son reales: que no haya
 * comprobacion de permisos es un fallo aunque nadie lo haya detectado.
 */
function buildComplianceControls(
  target: string,
  findings: ControlFinding[]
): ComplianceControl[] {
  // Los controles miran TODOS los hallazgos no recomendados,Esteincluding los
  // que la IA no pudo localizar: un riesgo que nadie puede abrir sigue siendo
  // un riesgo. Los contadores de severidad y el score, en cambio, solo cuentan
  // los verificables. Son dos preguntas distintas.
  const real = findings.filter((f) => !f.advisory);

  const byCwe = (control: ControlId) =>
    real.filter((f) => f.cweId && CONTROL_CWES[control].includes(f.cweId));

  const failsBecause = (list: ControlFinding[]): string => {
    const first = list[0];
    const where = first.file ? loc(first) : 'sin archivo localizable';
    const extra = list.length > 1 ? ` y ${list.length - 1} más` : '';
    return `Detectado ${where}${extra}.`;
  };

  const ok = (): string => 'No se detectó ningún problema de este tipo.';

  const fromCwe = (
    control: ControlId,
    label: string,
    sinCwe: string,
    /**
     * Señal de código que hace pasar el control cuando ningún hallazgo lo
     * marca. Solo tiene sentido en autenticación y autorización, donde la
     * ausencia de la señal ES el fallo. En secretos, cifrado, transporte o
     * validación no hay nada que buscar en el texto: si no hay hallazgo, el
     * control se cumple. Por eso antes de arreglarlo, un proyecto sin una sola
     * señal de autenticación fallia los seis controles a la vez.
     */
    signal?: { re: RegExp; present: string; absent: string }
  ): ComplianceControl => {
    const hits = byCwe(control);
    if (hits.length > 0) {
      return { id: control, label, passed: false, detail: `${sinCwe} ${failsBecause(hits)}` };
    }
    if (!signal) return { id: control, label, passed: true, detail: ok() };
    const present = signal.re.test(target);
    return { id: control, label, passed: present, detail: present ? signal.present : signal.absent };
  };

  return [
    fromCwe('autenticacion', 'Autenticación', 'Falta autenticación en alguna parte del sistema.', {
      re: AUTH_RE,
      present: 'El código usa algún mecanismo de autenticación (login, JWT o sesión).',
      absent: 'No se encontró login, JWT ni gestión de sesiones: cualquiera que alcance la aplicación entra.',
    }),
    fromCwe('autorizacion', 'Autorización', 'Falta comprobar quién es el dueño del recurso.', {
      re: AUTHZ_RE,
      present: 'Hay comprobaciones de permisos o de propiedad del recurso.',
      absent: 'No se comprueba quién puede ver cada dato: un usuario autenticado podría leer lo de otro.',
    }),
    fromCwe('secretos', 'Gestión de secretos', 'Contraseñas o claves escritas en el código.'),
    fromCwe('cifrado', 'Criptografía', 'Algoritmo obsoleto o aleatoriedad no criptográfica.'),
    fromCwe('transporte', 'Transporte', 'Datos enviados por http:// sin cifrar.'),
    fromCwe('validacion', 'Validación de entrada', 'Entrada de usuario sin tratar.'),
  ];
}

function complianceScoreOf(controls: ComplianceControl[]): number {
  if (controls.length === 0) return 100;
  const passed = controls.filter((c) => c.passed).length;
  return Math.round((passed / controls.length) * 100);
}

// ─── Contexto: real o solo consejo ───────────────────────────────────────────
//
// El problema que resuelve esto: algunos regex son inevitably laxos, y un
// patron flojo produce falsos positivos que arruinan el analisis. Se comprobo
// en un proyecto real: `authPassword: "Contrasena"` dentro de un diccionario
// i18n salia como CREDENCIAL CRITICA, y un `Math.random()` que solo elegia el
// ancho de un esqueleto de carga salia como criptografia rota.
//
// La alternativa a afinar el regex hasta hacerlo ilegible es dejar el regex
// amplio y decidir aqui, con el contexto real de la linea, si lo que se ha
// encontrado es una vulnerabilidad de verdad o un consejo de buena practica.
//
// Importante: nada se oculta. Un hallazgo marcado como recomendacion se sigue
// mostrando en pantalla y en el PDF, con su archivo y su linea. Lo unico que
// deja de hacer es bajar el puntaje.

/** Un valor que parece una credencial y no una frase. */
function looksLikeSecretValue(value: string): boolean {
  return /[0-9]/.test(value) || /[_\-./+=]{2,}/.test(value) || value.length >= 24;
}

/** Archivos que guardan textos de la interfaz, no credenciales. */
const TRANSLATION_PATH =
  /(^|[\\/])(i18n|locale|locales|loc|translation|translations|lang|languages|strings)([\\/._-]|$)/i;

/** Palabras que delatan que la aleatoriedad se usa con fines de seguridad. */
const SECURITY_WORD =
  /\b(token|secret|session|password|passwd|key|salt|nonce|otp|jwt|csrf|reset|uuid|identifier|user_?id)\b/i;

interface FindingContext {
  /** Texto de la linea donde se ha encontrado, o el propio match si no hay linea. */
  line: string;
  file: string;
  /** El texto exacto que hizo casar el regex. */
  match: string;
}

const firstQuoted = (text: string): string => {
  const m = text.match(/["'`]([^"'`]*)["'`]/);
  return m ? m[1] : '';
};

/**
 * Un "secreto" solo cuenta como vulnerabilidad si el valor parece una
 * credencial. Se mantiene amplio a proposito: una contraseña debil como "admin"
 * se cuela como recomendacion, pero SE MUESTRA, que es preferible a declarar
 * critico un texto de traduccion.
 */
function hardcodedSecretIsAdvisory({ line, file }: FindingContext): boolean {
  if (file && TRANSLATION_PATH.test(file)) return true;
  const value = firstQuoted(line);
  if (!value) return false;
  return !looksLikeSecretValue(value);
}

/**
 * Math.random() solo es un problema cuando genera algo con valor de seguridad.
 * Usarlo para el ancho de un esqueleto, un color o una animacion es correcto.
 */
function insecureRandomIsAdvisory({ line }: FindingContext): boolean {
  return !SECURITY_WORD.test(line);
}

// ─── Conteo real de ocurrencias ──────────────────────────────────────────────
//
// El motor usaba pattern.exec(content), que devuelve UN solo match: un modulo
// con cinco inyecciones SQL generaba el mismo hallazgo que uno con una. Eso
// hacia que el analisis no distinguiera un fallo aislado de un problema
// generalizado, y hacia que el indice 0-100 fuera casi binario.
//
// Ahora se cuentan todas las apariciones, se guarda el total y las primeras
// localizaciones. Sigue habiendo UNA tarjeta por patron y modulo (veinte
// tarjetas de lo mismo no ayudan a nadie), pero la tarjeta dice cuantas veces
// ocurre y donde, y las metricas de cobertura usan el total real.

/** Cuantas localizaciones se guardan por hallazgo. */
const MAX_LOCATIONS = 5;

/**
 * Ejecuta el patron en modo global y devuelve todas las coincidencias.
 *
 * Se crea un RegExp nuevo con flag /g porque uno con /g es stateful (guarda
 * lastIndex) y reutilizarlo daria resultados alternos. Los patrones que casan
 * cadena vacia se saltan con un avance manual, o el bucle no termina.
 */
function matchAll(
  pattern: RegExp,
  content: string
): { total: number; offsets: number[] } {
  const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
  const re = new RegExp(pattern.source, flags);

  let total = 0;
  const offsets: number[] = [];
  let m: RegExpExecArray | null;

  while ((m = re.exec(content)) !== null) {
    total++;
    // Solo guardamos las primeras: un patron puede aparecer miles de veces y
    // guardarlas todas haria la respuesta enorme sin aportar nada.
    if (offsets.length < MAX_LOCATIONS) offsets.push(m.index);
    if (m[0].length === 0) re.lastIndex++;
  }

  return { total, offsets };
}

// ─── Metricas de cobertura ───────────────────────────────────────────────────

interface CoverageInput {
  /** Que se reviso en cada lenguaje, para poder decirlo. */
  perLanguage?: ReturnType<typeof buildLanguageCoverage>;
  filesAnalyzed: number;
  totalLines: number;
  findings: {
    id: string;
    file?: string;
    line?: number;
    advisory?: boolean;
    locations?: { file: string; line: number }[];
  }[];
  rulesApplied: number;
}

/** Todos los archivos donde aparece el hallazgo: el principal y sus copias. */
function findingFiles(f: { file?: string; locations?: { file: string }[] }): string[] {
  const files = new Set<string>();
  if (f.file) files.add(f.file);
  for (const l of f.locations ?? []) files.add(l.file);
  return Array.from(files);
}

/**
 * Cuanto del proyecto esta afectado de verdad. Son las cifras que publican las
 * herramientas comerciales, y las que un humano puede comprobar: "el 2,9% de
 * los archivos tiene alguna observacion" se defiende; "95/100 de seguridad" no.
 */
/**
 * Que se reviso en cada lenguaje.
 *
 * Es la linea que distingue "no encontre nada" de "no mire". Con SQL en el
 * proyecto, sin esto la pantalla decia lo mismo en los dos casos, que es
 * exactamente el tipo de ambiguedad que hace que un informe no se pueda
 * defender: si preguntan "revisaste las migraciones", no hay forma de responder.
 */
function buildLanguageCoverage(modules: {
  moduleName: string;
  language: string;
  fileCount?: number;
  findings: { advisory?: boolean }[];
}[]): {
  language: string;
  files: number;
  rules: number;
  detections: number;
  vulnerabilities: number;
}[] {
  const byLang = new Map<string, { files: number; detections: number; vulnerabilities: number }>();

  for (const m of modules) {
    const entry = byLang.get(m.language) ?? { files: 0, detections: 0, vulnerabilities: 0 };
    entry.files += m.fileCount ?? 0;
    entry.detections += m.findings.length;
    entry.vulnerabilities += m.findings.filter((f) => !f.advisory).length;
    byLang.set(m.language, entry);
  }

  return Array.from(byLang.entries())
    .map(([language, v]) => ({
      language,
      files: v.files,
      // Las reglas de SQL solo cuentan para SQL: son las que evitan que
      // "service_role" sea critica en cada GRANT de una migracion.
      rules: language === 'SQL'
        ? SECURITY_PATTERNS.length + SQL_RULES.length
        : SECURITY_PATTERNS.filter((p) => !p.languages || p.languages.includes(language)).length,
      detections: v.detections,
      vulnerabilities: v.vulnerabilities,
    }))
    .sort((a, b) => b.files - a.files);
}

function buildCoverage(input: CoverageInput) {
  const withFile = input.findings.filter((f) => Boolean(f.file));

  // Las cifras por archivo siguen el MISMO criterio que el score: se agrupa por
  // (patron, archivo). Antes contaban por hallazgo, y con un patron repetido en
  // cinco archivos salian "1 hallazgo" y "1 archivo afectado" aunque estuvieran
  // los cinco. Las apariciones son las que guarda el motor en `locations`.
  const unique = new Map<string, CoverageInput['findings'][number]>();
  for (const f of input.findings) {
    const pattern = f.id.replace(/^mod\d+-/, '');
    for (const file of findingFiles(f)) {
      const key = `${pattern}@@${file}`;
      if (!unique.has(key)) unique.set(key, f);
    }
  }
  const units = Array.from(unique.values());

  const filesWithFindings = new Set(units.flatMap(findingFiles)).size;
  const filesWithVulnerabilities = new Set(
    units.filter((f) => !f.advisory).flatMap(findingFiles)
  ).size;

  // Hallazgos que el modelo detecto pero sin decir en que archivo estan. No se
  // pueden atribuir a un archivo, asi que no entran en los porcentajes, pero SI
  // cuentan para el total. Sin esta cifra aparte, la pantalla puede mostrar
  // "0% de los archivos" y "1 hallazgo" a la vez.
  const unattributedFindings = input.findings.length - withFile.length;

  const rate = (n: number) =>
    input.filesAnalyzed > 0 ? Math.round((n / input.filesAnalyzed) * 1000) / 10 : 0;

  return {
    filesAnalyzed: input.filesAnalyzed,
    filesWithFindings,
    filesWithVulnerabilities,
    fileIssueRate: rate(filesWithFindings),
    vulnerabilityFileRate: rate(filesWithVulnerabilities),
    findingsPerThousandLines:
      input.totalLines > 0
        ? Math.round((input.findings.length / input.totalLines) * 1000 * 100) / 100
        : 0,
    rulesApplied: input.rulesApplied,
    unattributedFindings,
    perLanguage: input.perLanguage,
  };
}

// ─── Motor de análisis ───────────────────────────────────────────────────────

function analyzeModule(
  module: FileModule,
  idPrefix: string,
  languageOverride?: string
): {
  moduleName: string;
  language: string;
  framework?: string;
  fileCount: number;
  linesAnalyzed: number;
  securityScore: number;
  findings: SecurityFinding[];
  status: 'secure' | 'warning' | 'critical';
} {
  const content = module.content;
  const findings: SecurityFinding[] = [];

  const moduleLanguage = languageOverride || module.language;

  // Las reglas de SQL se recorren con las demas: comparten el mismo motor de
  // conteo, severidad y localizacion, y el filtro de languages las mantiene
  // separadas de las de Javascript.
  for (const def of [...SECURITY_PATTERNS, ...SQL_RULES]) {
    // Una regla de JS no debe disparar sobre SQL ni al reves. Sin este filtro,
    // "service_role" seria critica en cada migracion de Postgres que la menciona.
    if (def.languages && !def.languages.includes(moduleLanguage)) continue;

    // Se cuentan TODAS las apariciones, no solo la primera. Antes un modulo con
    // cinco inyecciones SQL y otro con una daban exactamente el mismo hallazgo.
    const { total, offsets } = matchAll(def.pattern, content);
    if (total === 0) continue;

    const first = def.pattern.exec(content);
    if (!first) continue;

    findings.push(
      buildFinding(def, first, `${idPrefix}-${def.id}`, module, { total, offsets })
    );
  }

  // Score y estado: los calcula scoreOf/statusOf, la MISMA formula que aplica
  // la revision con IA al fusionar sus hallazgos.
  findings.push(...auditSqlModule(module, idPrefix));

  const rawScore = scoreOf(findings);
  const linesAnalyzed = content.split('\n').filter((l) => l.trim().length > 0).length;

  const status = statusOf(findings);

  return {
    moduleName: module.name,
    language: languageOverride || module.language,
    framework: module.framework,
    fileCount: module.fileCount,
    linesAnalyzed,
    securityScore: rawScore,
    findings,
    status,
  };
}

function buildFinding(
  def: FindingDef,
  match: RegExpExecArray,
  id: string,
  module: FileModule,
  counts: { total: number; offsets: number[] }
) {
  // Traduce el offset del match a archivo y linea reales.
  const where = locate(module, match.index);

  // Cada offset se traduce a su archivo y linea, para poder abrir varias
  // apariciones del mismo problema de un vistazo.
  const extraLocations: { file: string; line: number }[] = [];
  for (const offset of counts.offsets.slice(1)) {
    const at = locate(module, offset);
    if (at) extraLocations.push({ file: at.file, line: at.line });
  }

  return {
    id,
    severity: def.severity,
    category: def.category,
    title: def.title,
    description: def.description,
    affectedModule: module.name,
    lineHint: def.lineHint ? def.lineHint(match) : undefined,
    recommendation: def.recommendation,
    cweId: def.cweId,
    file: where?.file,
    line: where?.line,
    occurrences: counts.total,
    locations: extraLocations.length > 0 ? extraLocations : undefined,
    advisory:
      def.advisory === true ||
      (def.advisoryWhen ? def.advisoryWhen({ line: where?.text || match[0], file: where?.file || '', match: match[0] }) : false)
        ? true
        : undefined,
    source: 'regex' as const,
  };
}

// ─── Recomendaciones de arquitectura AWS ─────────────────────────────────────

interface ServiceRec {
  serviceId: string;
  serviceName: string;
  awsService: string;
  reason: string;
  estimatedMonthlyCost: number;
  priority: 'required' | 'recommended' | 'optional';
  category: string;
}

function buildAwsRecommendations(
  code: string,
  description: string,
  findings: Array<{ severity: string; category: string }>
): ServiceRec[] {
  const recs: ServiceRec[] = [];

  const hasAuth = /auth|login|jwt|session|oauth/i.test(code + description);
  const hasDB = /database|sql|mongodb|postgres|mysql|dynamo/i.test(code + description);
  const hasFiles = /upload|file|storage|bucket|image|video|blob/i.test(code + description);
  const hasCdn = /static|asset|html|css|react|frontend|spa/i.test(code + description);
  const hasApi = /api|rest|graphql|endpoint|route|express|flask|fastapi/i.test(code + description);
  const hasQueue = /queue|async|event|kafka|rabbit|message|worker/i.test(code + description);
  const hasCache = /cache|redis|memcache|session|fast/i.test(code + description);
  const hasSecurityIssue = findings.some((f) => ['critical', 'high'].includes(f.severity));
  const hasSecrets = findings.some((f) => f.category === 'Secrets Management');
  const hasCors = findings.some((f) => f.category === 'Access Control');
  const hasRateLimit = findings.some((f) => f.category === 'Denial of Service');

  // EC2 / Lambda
  if (hasApi || code.length > 100) {
    const useLambda = !/monolith|full.?stack|django|rails|spring/i.test(code + description);
    if (useLambda) {
      recs.push({
        serviceId: 'lambda',
        serviceName: 'AWS Lambda',
        awsService: 'Lambda',
        reason: 'Ejecutar la lógica del backend sin gestionar servidores. Escala automáticamente y es costo-eficiente para APIs.',
        estimatedMonthlyCost: 4.5,
        priority: 'required',
        category: 'Compute',
      });
    } else {
      recs.push({
        serviceId: 'ec2',
        serviceName: 'Amazon EC2',
        awsService: 'EC2',
        reason: 'Servidor de aplicación para el backend. Recomendado para aplicaciones con estado o que requieren control del runtime.',
        estimatedMonthlyCost: 60.0,
        priority: 'required',
        category: 'Compute',
      });
    }
  }

  // API Gateway
  if (hasApi) {
    recs.push({
      serviceId: 'apigateway',
      serviceName: 'Amazon API Gateway',
      awsService: 'API Gateway',
      reason: `Gateway para gestionar y asegurar los endpoints. ${hasCors ? 'Necesario para resolver el problema de CORS detectado.' : ''} ${hasRateLimit ? 'Incluye throttling nativo para rate limiting.' : ''}`.trim(),
      estimatedMonthlyCost: 12.0,
      priority: 'required',
      category: 'Networking',
    });
  }

  // RDS / DynamoDB
  if (hasDB) {
    const useDynamo = /dynamo|nosql|document|flexible/i.test(code + description);
    if (useDynamo) {
      recs.push({
        serviceId: 'dynamodb',
        serviceName: 'Amazon DynamoDB',
        awsService: 'DynamoDB',
        reason: 'Base de datos NoSQL serverless con escalabilidad automática. Ideal para datos estructurados con acceso de alta velocidad.',
        estimatedMonthlyCost: 25.0,
        priority: 'required',
        category: 'Database',
      });
    } else {
      recs.push({
        serviceId: 'rds',
        serviceName: 'Amazon RDS (PostgreSQL)',
        awsService: 'RDS',
        reason: 'Base de datos relacional administrada. AWS gestiona backups, parches y failover automático.',
        estimatedMonthlyCost: 80.0,
        priority: 'required',
        category: 'Database',
      });
    }
  }

  // S3
  if (hasFiles || hasCdn) {
    recs.push({
      serviceId: 's3',
      serviceName: 'Amazon S3',
      awsService: 'S3',
      reason: 'Almacenamiento de archivos estáticos, assets, uploads y backups. Altamente disponible y bajo costo.',
      estimatedMonthlyCost: 5.0,
      priority: 'required',
      category: 'Storage',
    });
  }

  // CloudFront
  if (hasCdn) {
    recs.push({
      serviceId: 'cloudfront',
      serviceName: 'Amazon CloudFront',
      awsService: 'CloudFront',
      reason: 'CDN global para distribuir el frontend y reducir latencia. Integra WAF para protección adicional.',
      estimatedMonthlyCost: 18.0,
      priority: 'recommended',
      category: 'Content Delivery',
    });
  }

  // Cognito (si hay auth)
  if (hasAuth) {
    recs.push({
      serviceId: 'cognito',
      serviceName: 'Amazon Cognito',
      awsService: 'Cognito',
      reason: 'Gestión de identidades y autenticación segura (OAuth 2.0, MFA, JWT). Reemplaza la autenticación manual detectada.',
      estimatedMonthlyCost: 10.0,
      priority: 'recommended',
      category: 'Security',
    });
  }

  // Secrets Manager (si hay secrets hardcodeados)
  if (hasSecrets || hasSecurityIssue) {
    recs.push({
      serviceId: 'secretsmanager',
      serviceName: 'AWS Secrets Manager',
      awsService: 'Secrets Manager',
      reason: 'Almacenar credenciales detectadas en el código de forma segura. Rotación automática de secretos.',
      estimatedMonthlyCost: 2.5,
      priority: 'required',
      category: 'Security',
    });
  }

  // WAF (si hay problemas de CORS o injection)
  if (hasCors || findings.some((f) => f.category === 'Injection' || f.category === 'XSS')) {
    recs.push({
      serviceId: 'waf',
      serviceName: 'AWS WAF',
      awsService: 'WAF',
      reason: 'Firewall de aplicaciones web. Filtra inyecciones SQL y XSS detectadas en el análisis de seguridad.',
      estimatedMonthlyCost: 15.0,
      priority: 'recommended',
      category: 'Security',
    });
  }

  // ElastiCache (si hay cache)
  if (hasCache) {
    recs.push({
      serviceId: 'elasticache',
      serviceName: 'Amazon ElastiCache (Redis)',
      awsService: 'ElastiCache',
      reason: 'Caché en memoria para reducir la carga en la base de datos y mejorar el rendimiento de la API.',
      estimatedMonthlyCost: 35.0,
      priority: 'recommended',
      category: 'Database',
    });
  }

  // SQS (si hay queues)
  if (hasQueue) {
    recs.push({
      serviceId: 'sqs',
      serviceName: 'Amazon SQS',
      awsService: 'SQS',
      reason: 'Cola de mensajes serverless para desacoplar componentes y procesar tareas asíncronas de forma confiable.',
      estimatedMonthlyCost: 3.0,
      priority: 'recommended',
      category: 'Messaging',
    });
  }

  // CloudWatch (siempre recomendado)
  recs.push({
    serviceId: 'cloudwatch',
    serviceName: 'Amazon CloudWatch',
    awsService: 'CloudWatch',
    reason: 'Monitoreo de logs, métricas y alarmas. Esencial para observabilidad en producción y auditoría de seguridad.',
    estimatedMonthlyCost: 8.0,
    priority: 'recommended',
    category: 'Monitoring',
  });

  // IAM (siempre requerido)
  recs.push({
    serviceId: 'iam',
    serviceName: 'AWS IAM',
    awsService: 'IAM',
    reason: 'Control de acceso granular para todos los servicios AWS. Obligatorio para implementar el principio de menor privilegio.',
    estimatedMonthlyCost: 0,
    priority: 'required',
    category: 'Security',
  });

  // VPC
  recs.push({
    serviceId: 'vpc',
    serviceName: 'Amazon VPC',
    awsService: 'VPC',
    reason: 'Red privada virtual para aislar los recursos del proyecto. Subredes privadas para base de datos y backend.',
    estimatedMonthlyCost: 0,
    priority: 'required',
    category: 'Networking',
  });

  return recs;
}

/**
 * "1 hallazgo" / "3 hallazgos". El resumen se lee en voz alta en una
 * presentacion, y "Se identificaron 1 hallazgos" suena a error delatar.
 */
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function buildSummary(overallScore: number, critical: number, high: number, total: number): string {
  return overallScore >= 85
    ? `El proyecto tiene una postura de seguridad buena (${overallScore}/100). Se detectaron ${plural(total, 'observación menor', 'observaciones menores')} que conviene resolver antes del despliegue.`
    : overallScore >= 60
      ? `El proyecto requiere atención en seguridad (${overallScore}/100). Se identificaron ${plural(critical + high, 'hallazgo crítico/alto', 'hallazgos críticos/altos')} que deben corregirse obligatoriamente antes de subir a producción.`
      : `El proyecto presenta vulnerabilidades serias (${overallScore}/100). Con ${plural(critical, 'hallazgo crítico', 'hallazgos críticos')} y ${plural(high, 'alto', 'altos')}, el código NO debe desplegarse sin corregir los problemas identificados.`;
}

// ─── Handler principal ───────────────────────────────────────────────────────

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

  let body: {
    projectName?: string;
    code?: string;
    description?: string;
    language?: string;
    region?: string;
  };

  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ error: 'JSON inválido en el cuerpo de la solicitud.' });
    return;
  }

  const projectName = (body.projectName || 'Proyecto Sin Nombre').trim();
  const code = (body.code || '').trim();
  const description = (body.description || '').trim();
  // `region` se acepta y se documenta, pero las recomendaciones de servicios
  // no dependen de la region: los precios reales los resuelve el dashboard con
  // la Price List API (ver src/lib/analysis-pricing.ts).
  const inputType: 'code' | 'description' = code.length > 20 ? 'code' : 'description';

  // Si solo hay descripción, fabricar un fragmento de código sintético para análisis
  const analysisTarget =
    inputType === 'code'
      ? code
      : `
// Proyecto: ${projectName}
// Descripción: ${description}
const express = require('express');
const app = express();
app.get('/api/data', (req, res) => { res.json({ data: req.query.input }); });
app.listen(3000);
      `.trim();

  const sourceFiles = parseFiles(analysisTarget);
  const fileModules =
    sourceFiles.length > 0
      ? buildFolderModules(sourceFiles)
      : [buildSingleModule(analysisTarget, projectName)];

  // `body.language` es el override manual del desplegable: si viene, manda sobre
  // la extensión de los archivos.
  const languageOverride = body.language?.trim() || undefined;

  const analyzedModules = fileModules.map((m, i) => analyzeModule(m, `mod${i}`, languageOverride));

  const languages = Array.from(new Set(analyzedModules.map((m) => m.language)));
  const frameworks = Array.from(
    new Set(analyzedModules.map((m) => m.framework).filter((f): f is string => Boolean(f)))
  );

  // Score global y deduplicacion en un solo paso: mismo calculo que el motor
  // compartido de src/lib/server/analyze.ts, o el navegador y la API dan
  // resultados distintos para el MISMO codigo (lo comprueba tests/parity).
  const { score: overallScore, breakdown: scoreBreakdown, deduped: dedupedFindings } =
    scoreProject(analyzedModules.flatMap((m) => m.findings));
  const dedupedSet = new Set(dedupedFindings);

  // Cumplimiento: seis controles con aprobado/fallo y su motivo, en vez del
  // antiguo "100 menos diez por cada categoría de vulnerabilidad", que no
  // significaba nada explicable.
  const complianceControls = buildComplianceControls(analysisTarget, dedupedFindings);
  const complianceScore = complianceScoreOf(complianceControls);

  const advisoryCount = dedupedFindings.filter((f) => f.advisory).length;

  // Cifras de cobertura: cuanto del proyecto esta afectado de verdad. Son las
  // que dicen algo comprobable, a diferencia del indice 0-100, que solo indica
  // cuantos de los 15 patrones dispararon.
  const coverage = buildCoverage({
    filesAnalyzed: analyzedModules.reduce((a, m) => a + (m.fileCount ?? 0), 0),
    totalLines: analysisTarget.split('\n').length,
    findings: dedupedFindings,
    rulesApplied: SECURITY_PATTERNS.length + SQL_RULES.length,
    perLanguage: buildLanguageCoverage(
      analyzedModules.map((m) => ({ ...m, findings: m.findings.filter((f) => dedupedSet.has(f)) }))
    ),
  });

  // Determinar tamaño de infraestructura según código/descripción
  const linesOfCode = analysisTarget.split('\n').length;
  const infraSize: 'small' | 'medium' | 'large' | 'enterprise' =
    linesOfCode < 100 ? 'small' : linesOfCode < 500 ? 'medium' : linesOfCode < 2000 ? 'large' : 'enterprise';

  const recommendedServices = buildAwsRecommendations(
    analysisTarget,
    description,
    dedupedFindings
  );

  const totalMonthly = recommendedServices.reduce((a, s) => a + s.estimatedMonthlyCost, 0);

  // Contadores: solo vulnerabilidades. Las recomendaciones se muestran aparte y
  // no restan, o cualquier proyecto real saldria con una carrera de puntos que
  // en realidad son "tienes imports".
  const locatedFindings = dedupedFindings.filter((f) => !f.advisory && f.file);
  const unattributed = dedupedFindings.filter((f) => !f.advisory && !f.file);

  const countBySeverity = (sev: string) =>
    locatedFindings.filter((f) => f.severity === sev).length;

  const result = {
    id: `analysis-${Date.now()}`,
    projectName,
    analyzedAt: new Date().toISOString(),
    overallSecurityScore: overallScore,
    totalFindings: locatedFindings.length,
    criticalFindings: countBySeverity('critical'),
    highFindings: countBySeverity('high'),
    mediumFindings: countBySeverity('medium'),
    lowFindings: countBySeverity('low'),
    modules: analyzedModules,
    summary: buildSummary(overallScore, countBySeverity('critical'), countBySeverity('high'), locatedFindings.length),
    infrastructureSize: infraSize,
    recommendedServices,
    estimatedTotalMonthlyCost: Math.round(totalMonthly * 100) / 100,
    estimatedTotalAnnualCost: Math.round(totalMonthly * 12 * 100) / 100,
    complianceScore,
    complianceControls,
    scoreBreakdown,
    advisoryCount,
    unattributedFindingsDetail: unattributed,
    coverage,
    inputType,
    languages,
    frameworks,
  };

  res.status(200).json(result);
}
