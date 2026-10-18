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
}

// ─── Patrones de análisis de seguridad ───────────────────────────────────────

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
 * Localiza un offset del contenido del modulo: devuelve archivo y linea real.
 * Copia literal de src/lib/server/modules.ts (ver el aviso de duplicacion).
 */
function locate(module: FileModule, offset: number): { file: string; line: number } | null {
  if (module.spans.length === 0) return null;

  const line = module.content.slice(0, offset).split('\n').length;
  const span = module.spans.find((s) => line >= s.startLine && line <= s.endLine);
  if (!span) return null;

  return { file: span.path, line: line - span.startLine + 1 };
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
  critical: 25,
  high: 15,
  medium: 8,
  low: 3,
  info: 1,
};

/** Los hallazgos que puntuan son los que son vulnerabilidades. */
function scored(findings: { advisory?: boolean; severity: keyof typeof PENALTIES }[]) {
  return findings.filter((f) => !f.advisory);
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
}

const SEV_PENALTY: Record<'critical' | 'high' | 'medium' | 'low' | 'info', number> = {
  critical: 25,
  high: 15,
  medium: 8,
  low: 3,
  info: 1,
};

/** "src/routes/auth.js:4", o el modulo si el hallazgo no tiene archivo. */
function loc(f: { file?: string; line?: number; affectedModule: string }): string {
  if (!f.file) return f.affectedModule;
  return f.line ? `${f.file}:${f.line}` : f.file;
}

/**
 * Las restas del score, una linea por hallazgo puntuable. Sirve para que la
 * interfaz pueda enseñar "100 - 25 - 15 = 60" en vez de un 60 suelto.
 */
function buildScoreBreakdown(findings: { advisory?: boolean; title: string; severity: keyof typeof SEV_PENALTY; file?: string; line?: number; affectedModule: string }[]): ScoreLine[] {
  return findings
    .filter((f) => !f.advisory)
    .map((f) => ({
      label: `${f.title} — ${loc(f)}`,
      severity: f.severity,
      penalty: SEV_PENALTY[f.severity] ?? 0,
    }))
    .sort((a, b) => b.penalty - a.penalty);
}

// Senales de codigo para los controles que no dependen de un hallazgo
// concreto: que exista autenticacion o autorizacion no se deduce de un regex.
const AUTH_RE = /\b(auth|login|signIn|sign_in|signUp|jwt|oauth|session|cookie|currentUser|current_user|getSession|verifyToken|passport)\b/i;
const AUTHZ_RE = /\b(authorize|authorization|permission|permissions|role|roles|isAdmin|owner|owner_id|auth\.uid\(\)|user_id|canAccess|rls|row level security|create policy)\b/i;

/**
 * Seis controles de cumplimiento. Cada uno mira hallazgos reales (con su
 * localizacion) o señales de código, y explica por qué pasa o falla.
 */
function buildComplianceControls(
  target: string,
  findings: { id: string; advisory?: boolean; title: string; file?: string; line?: number; affectedModule: string }[]
): ComplianceControl[] {
  const real = findings.filter((f) => !f.advisory);

  const hit = (...wanted: string[]): { advisory?: boolean; file?: string; line?: number; affectedModule: string }[] =>
    real.filter((f) => wanted.includes(f.id.replace(/^mod\d+-/, '')));

  const failsBecause = (list: ReturnType<typeof hit>): string =>
    list.length === 1
      ? `Detectado en ${loc(list[0])}.`
      : `Detectado en ${list.length} sitios, el primero en ${loc(list[0])}.`;

  const ok = (): string => 'No se detectó ningún problema de este tipo.';

  return [
    {
      id: 'autenticacion',
      label: 'Autenticación',
      passed: AUTH_RE.test(target),
      detail: AUTH_RE.test(target)
        ? 'El código usa algún mecanismo de autenticación (login, JWT o sesión).'
        : 'No se encontró login, JWT ni gestión de sesiones: cualquiera que alcance la aplicación entra.',
    },
    {
      id: 'autorizacion',
      label: 'Autorización',
      passed: AUTHZ_RE.test(target),
      detail: AUTHZ_RE.test(target)
        ? 'Hay comprobaciones de permisos o de propiedad del recurso.'
        : 'No se comprueba quién puede ver cada dato: un usuario autenticado podría leer lo de otro.',
    },
    {
      id: 'secretos',
      label: 'Gestión de secretos',
      passed: hit('hardcoded-secret').length === 0,
      detail: hit('hardcoded-secret').length === 0
        ? ok()
        : `Contraseñas o claves escritas en el código. ${failsBecause(hit('hardcoded-secret'))}`,
    },
    {
      id: 'cifrado',
      label: 'Criptografía',
      passed: hit('weak-crypto', 'insecure-random').length === 0,
      detail: hit('weak-crypto', 'insecure-random').length === 0
        ? ok()
        : `Algoritmo obsoleto o aleatoriedad no criptográfica. ${failsBecause(hit('weak-crypto', 'insecure-random'))}`,
    },
    {
      id: 'transporte',
      label: 'Transporte',
      passed: hit('missing-https').length === 0,
      detail: hit('missing-https').length === 0
        ? ok()
        : `Datos enviados por http:// sin cifrar. ${failsBecause(hit('missing-https'))}`,
    },
    {
      id: 'validacion',
      label: 'Validación de entrada',
      passed: hit('sql-injection', 'xss-vulnerability', 'insecure-deserialization', 'prototype-pollution', 'open-redirect').length === 0,
      detail: hit('sql-injection', 'xss-vulnerability', 'insecure-deserialization', 'prototype-pollution', 'open-redirect').length === 0
        ? ok()
        : `Entrada de usuario sin tratar. ${failsBecause(hit('sql-injection', 'xss-vulnerability', 'insecure-deserialization', 'prototype-pollution', 'open-redirect'))}`,
    },
  ];
}

function complianceScoreOf(controls: ComplianceControl[]): number {
  if (controls.length === 0) return 100;
  const passed = controls.filter((c) => c.passed).length;
  return Math.round((passed / controls.length) * 100);
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
  findings: ReturnType<typeof buildFinding>[];
  status: 'secure' | 'warning' | 'critical';
} {
  const content = module.content;
  const findings: ReturnType<typeof buildFinding>[] = [];

  for (const def of SECURITY_PATTERNS) {
    const match = def.pattern.exec(content);
    if (match) {
      findings.push(buildFinding(def, match, `${idPrefix}-${def.id}`, module));
    }
  }

  // Score y estado: los calcula scoreOf/statusOf, la MISMA formula que aplica
  // la revision con IA al fusionar sus hallazgos.
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
  module: FileModule
) {
  // Traduce el offset del match a archivo y linea reales.
  const where = locate(module, match.index);

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
    advisory: def.advisory ? true : undefined,
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

  // Deduplicar hallazgos por id global del proyecto
  const allFindings = analyzedModules.flatMap((m) => m.findings);
  const seenCategories = new Set<string>();
  const dedupedFindings = allFindings.filter((f) => {
    const key = f.id.replace(/^mod\d+-/, '');
    if (seenCategories.has(key)) return false;
    seenCategories.add(key);
    return true;
  });

  // Score global: promedio ponderado de módulos (más líneas = más peso)
  const totalLines = analyzedModules.reduce((a, m) => a + m.linesAnalyzed, 0) || 1;
  const weightedScore =
    analyzedModules.reduce((acc, m) => acc + m.securityScore * m.linesAnalyzed, 0) / totalLines;
  const overallScore = Math.round(weightedScore);

  // Cumplimiento: seis controles con aprobado/fallo y su motivo, en vez del
  // antiguo "100 menos diez por cada categoría de vulnerabilidad", que no
  // significaba nada explicable.
  const complianceControls = buildComplianceControls(analysisTarget, dedupedFindings);
  const complianceScore = complianceScoreOf(complianceControls);

  // La cuenta del score, una línea por hallazgo puntuable.
  const scoreBreakdown = buildScoreBreakdown(analyzedModules.flatMap((m) => m.findings));
  const advisoryCount = dedupedFindings.filter((f) => f.advisory).length;

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
  const vulnFindings = dedupedFindings.filter((f) => !f.advisory);

  const countBySeverity = (sev: string) =>
    vulnFindings.filter((f) => f.severity === sev).length;

  const result = {
    id: `analysis-${Date.now()}`,
    projectName,
    analyzedAt: new Date().toISOString(),
    overallSecurityScore: overallScore,
    totalFindings: vulnFindings.length,
    criticalFindings: countBySeverity('critical'),
    highFindings: countBySeverity('high'),
    mediumFindings: countBySeverity('medium'),
    lowFindings: countBySeverity('low'),
    modules: analyzedModules,
    summary:
      overallScore >= 85
        ? `El proyecto tiene una postura de seguridad buena (${overallScore}/100). Se detectaron ${vulnFindings.length} observaciones menores que conviene resolver antes del despliegue.`
        : overallScore >= 60
          ? `El proyecto requiere atención en seguridad (${overallScore}/100). Se identificaron ${countBySeverity('critical') + countBySeverity('high')} hallazgos críticos/altos que deben corregirse obligatoriamente antes de subir a producción.`
          : `El proyecto presenta vulnerabilidades serias (${overallScore}/100). Con ${countBySeverity('critical')} hallazgos críticos y ${countBySeverity('high')} altos, el código NO debe desplegarse sin corregir los problemas identificados.`,
    infrastructureSize: infraSize,
    recommendedServices,
    estimatedTotalMonthlyCost: Math.round(totalMonthly * 100) / 100,
    estimatedTotalAnnualCost: Math.round(totalMonthly * 12 * 100) / 100,
    complianceScore,
    complianceControls,
    scoreBreakdown,
    advisoryCount,
    inputType,
    languages,
    frameworks,
  };

  res.status(200).json(result);
}
