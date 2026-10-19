/**
 * api/_analyze.ts
 *
 * Motor del analisis estatico (regex). No es un endpoint: son funciones puras
 * que usan tanto /api/ai-analyze como /api/ai-review.
 *
 * /api/ai-review lo necesita porque, al sumar los hallazgos de Gemini, debe
 * RECALCULAR el puntaje con la misma formula. Si el calculo viviera dentro del
 * handler de ai-analyze, la IA no se podria fusionar sin duplicar la logica y
 * el resultado puntuaria distinto segun quien lo recomponga.
 */

import type {
  ModuleAnalysis,
  ProjectAnalysisResult,
  SecurityFinding,
  SecurityFindingSeverity,
} from '../../types/cloud';

import {
  buildFolderModules,
  buildSingleModule,
  locate,
  parseFiles,
  type FileModule,
} from './modules.ts';

// ─── Formula de puntaje ──────────────────────────────────────────────────────
//
// Vive aqui y no dentro de un handler porque la usan los dos endpoints: el
// analisis estatico al puntuar cada modulo, y la revision con IA al recalcular
// ese mismo puntaje tras anadir sus hallazgos. Una sola formula, un solo
// resultado, sea cual sea quien anada hallazgos.

const PENALTIES: Record<SecurityFindingSeverity, number> = {
  critical: 25,
  high: 15,
  medium: 8,
  low: 3,
  info: 1,
};

/** Los hallazgos que puntuan son los que son vulnerabilidades. */
function scored(findings: SecurityFinding[]): SecurityFinding[] {
  return findings.filter((f) => !f.advisory);
}

/** Arranca en 100 y descuenta por severidad, sin bajar de 0. */
function scoreOf(findings: SecurityFinding[]): number {
  const penalty = scored(findings).reduce((acc, f) => acc + (PENALTIES[f.severity] ?? 0), 0);
  return Math.max(0, 100 - penalty);
}

function statusOf(findings: SecurityFinding[]): ModuleAnalysis['status'] {
  const real = scored(findings);
  return real.some((f) => f.severity === 'critical')
    ? 'critical'
    : real.some((f) => f.severity === 'high')
      ? 'warning'
      : 'secure';
}

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
   * Antes estos patrones (`dependency-vulnerable`, `env-not-validated`,
   * `no-rate-limit`) disparaban en practicamente cualquier proyecto y hacian que
   * hasta codigo correcto saliera con 80 puntos, que es justo lo que hacia
   * Hueco el analisis.
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
function buildScoreBreakdown(findings: { advisory?: boolean; title: string; severity: keyof typeof SEV_PENALTY; file?: string; line?: number; affectedModule: string; occurrences?: number }[]): ScoreLine[] {
  return findings
    .filter((f) => !f.advisory)
    .map((f) => ({
      label: `${f.title} — ${loc(f)}`,
      severity: f.severity,
      penalty: SEV_PENALTY[f.severity] ?? 0,
      occurrences: f.occurrences,
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
  findings: { file?: string; advisory?: boolean }[];
  rulesApplied: number;
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

  const filesWithFindings = new Set(withFile.map((f) => f.file as string)).size;
  const filesWithVulnerabilities = new Set(
    withFile.filter((f) => !f.advisory).map((f) => f.file as string)
  ).size;

  // Hallazgos que el modelo detecto pero sin decir en que archivo estan. No se
  // pueden atribuir a un archivo, asi que no entran en los porcentajes, pero SÍ
  // cuentan para el total. Sin esta cifra aparte, la pantalla puede mostrar
  // "0% de los archivos" y "1 hallazgo" a la vez, que es lo que hace que un
  // informe parezca no cuadrar.
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
  // Traduce el offset del match a archivo y linea reales. Sin esto un hallazgo
  // no se puede señalar en el codigo, que es lo que hacia el analisis
  // inverificable.
  const where = locate(module, match.index);

  // El subsistema ("Base de Datos / DAL") que daba cada patron se ha
  // eliminado: era una etiqueta inventada que no coincidia con el modulo real y
  // ocupaba el sitio del dato util. El tipo de problema sigue en `category`.

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

// ─── Análisis completo ───────────────────────────────────────────────────────

export interface AnalyzeInput {
  projectName?: string;
  code?: string;
  description?: string;
  language?: string;
  /**
   * Se acepta y se documenta, pero las recomendaciones de servicios no dependen
   * de la region: los precios reales los resuelve el dashboard con la Price List
   * API (ver src/lib/analysis-pricing.ts).
   */
  region?: string;
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


/**
 * Normaliza la entrada y decide que se analiza.
 *
 * La exporta /api/ai-review porque Gemini necesita el CONTENIDO de cada modulo,
 * y ese contenido no viaja en la respuesta del analisis (seria duplicar el
 * codigo entero del proyecto otra vez por la red). Al pasar los dos endpoints
 * por aqui, los limites de modulo no pueden divergir entre si: si divergieran,
 * los hallazgos de la IA quedarian adjudicados a carpetas distintas de las que
 * usa el regex.
 */
export interface PreparedAnalysis {
  projectName: string;
  description: string;
  inputType: 'code' | 'description';
  analysisTarget: string;
  fileModules: FileModule[];
  languageOverride?: string;
}

export function prepare(input: AnalyzeInput = {}): PreparedAnalysis {
  const projectName = (input.projectName || 'Proyecto Sin Nombre').trim();
  const code = (input.code || '').trim();
  const description = (input.description || '').trim();
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

  return {
    projectName,
    description,
    inputType,
    analysisTarget,
    fileModules:
      sourceFiles.length > 0
        ? buildFolderModules(sourceFiles)
        : [buildSingleModule(analysisTarget, projectName)],
    // `input.language` es el override manual del desplegable: si viene, manda sobre
    // la extensión de los archivos.
    languageOverride: input.language?.trim() || undefined,
  };
}

/**
 * Corre el analisis estatico completo. Es la funcion que /api/ai-analyze expone
 * tal cual, y que /api/ai-review vuelve a ejecutar antes de sumar los hallazgos
 * de Gemini, para partir del mismo resultado y recalcular sobre el.
 */
export function analyzeCode(input: AnalyzeInput = {}): ProjectAnalysisResult {
  const { projectName, description, inputType, analysisTarget, fileModules, languageOverride } =
    prepare(input);

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
  const scoreBreakdown = buildScoreBreakdown(
    analyzedModules.flatMap((m) => m.findings)
  );
  const advisoryCount = dedupedFindings.filter((f) => f.advisory).length;

  // Cifras de cobertura: cuanto del proyecto esta afectado de verdad. Son las
  // que dicen algo comprobable, a diferencia del indice 0-100, que solo indica
  // cuantos de los 15 patrones dispararon.
  const coverage = buildCoverage({
    filesAnalyzed: analyzedModules.reduce((a, m) => a + (m.fileCount ?? 0), 0),
    totalLines: analysisTarget.split('\n').length,
    findings: dedupedFindings,
    rulesApplied: SECURITY_PATTERNS.length + SQL_RULES.length,
    perLanguage: buildLanguageCoverage(analyzedModules),
  });

  // Determinar tamaño de infraestructura según código/descripción
  const linesOfCode = analysisTarget.split('\n').length;
  const infrastructureSize = (linesOfCode < 100
    ? 'small'
    : linesOfCode < 500
      ? 'medium'
      : linesOfCode < 2000
        ? 'large'
        : 'enterprise') satisfies ProjectAnalysisResult['infrastructureSize'];

  const recommendedServices = buildAwsRecommendations(analysisTarget, description, dedupedFindings);

  const totalMonthly = recommendedServices.reduce((a, s) => a + s.estimatedMonthlyCost, 0);

  // Contadores: solo vulnerabilidades. Las recomendaciones van aparte y no
  // restan, o cualquier proyecto real saldria con una carrera de puntos que
  // en realidad son "tienes imports".
  const vulnFindings = dedupedFindings.filter((f) => !f.advisory);

  const countBySeverity = (sev: SecurityFindingSeverity) =>
    vulnFindings.filter((f) => f.severity === sev).length;

  const critical = countBySeverity('critical');
  const high = countBySeverity('high');

  return {
    id: `analysis-${Date.now()}`,
    projectName,
    analyzedAt: new Date().toISOString(),
    overallSecurityScore: overallScore,
    totalFindings: vulnFindings.length,
    criticalFindings: critical,
    highFindings: high,
    mediumFindings: countBySeverity('medium'),
    lowFindings: countBySeverity('low'),
    modules: analyzedModules,
    summary: buildSummary(overallScore, critical, high, vulnFindings.length),
    infrastructureSize,
    recommendedServices,
    estimatedTotalMonthlyCost: Math.round(totalMonthly * 100) / 100,
    estimatedTotalAnnualCost: Math.round(totalMonthly * 12 * 100) / 100,
    complianceScore,
    complianceControls,
    scoreBreakdown,
    advisoryCount,
    coverage,
    inputType,
    languages,
    frameworks,
  };
}

// ─── Fusión de hallazgos de IA ───────────────────────────────────────────────

/**
 * Anade los hallazgos de Gemini a un analisis ya calculado y RECALCULA todo lo
 * que depende de ellos: score por modulo, estado, score global, compliance,
 * contadores y resumen. Se recalcula porque el usuario quiere un unico
 * puntaje que tenga en cuenta las dos capas, no dos puntajes distintos.
 *
 * DEDUPLICACION POR CWE
 * Las dos capas detectan a veces lo mismo: el regex marca una inyeccion SQL y
 * Gemini la vuelve a marcar con el mismo CWE. Si se sumaran ambas, el mismo
 * fallo se penalizaria dos veces y el score se hundiria sin motivo (en una
 * prueba real el score paso de 67 a 37 solo por eso).
 *
 * Por eso, antes de fusionar, se descarta el hallazgo de IA cuyo CWE ya
 * aparezca entre los del regex **de ese mismo modulo**. El alcance es el
 * modulo y no el proyecto entero a proposito: el mismo CWE en dos carpetas
 * distintas son dos fallos distintos y ambos deben contar. Los hallazgos de IA
 * sin CWE, o con un CWE que el regex no vio, se conservan siempre, que es
 * justo el caso interesante (por ejemplo un IDOR).
 *
 * Los ids de los hallazgos de IA empiezan por `ai-mod...`, y la normalizacion
 * de deduplicacion es `replace(/^mod\d+-/, '')`: ese prefijo no se quita, asi
 * que cada hallazgo de IA conserva su clave propia y sobrevive al dedup. Los
 * regex siguen deduplicandose entre si igual que hasta ahora.
 */
export function applyAiFindings(
  base: ProjectAnalysisResult,
  aiByModule: Record<string, SecurityFinding[]>,
  /** El codigo analizado: los controles de autenticacion y autorizacion se
   * deducen de señales del texto, no de los hallazgos. */
  target = ''
): ProjectAnalysisResult {
  const modules = base.modules.map((m) => {
    const extra = aiByModule[m.moduleName] ?? [];
    if (extra.length === 0) return m;

    // Las recomendaciones del regex no cuentan como cobertura: si el unico CWE que
    // "cubre" una IA es el de "tienes imports", su hallazgo es nuevo de verdad.
    const regexCwes = new Set(
      m.findings.filter((f) => !f.advisory).map((f) => f.cweId).filter((c): c is string => Boolean(c))
    );
    const fresh = extra.filter((f) => !f.cweId || !regexCwes.has(f.cweId));
    // Si todo lo que traia la IA ya estaba cubierto por el regex, el modulo se
    // devuelve intacto: ni hallazgos nuevos ni recalculo de score.
    if (fresh.length === 0) return m;

    const findings = [...m.findings, ...fresh];
    return { ...m, findings, securityScore: scoreOf(findings), status: statusOf(findings) };
  });

  const seen = new Set<string>();
  const dedupedFindings = modules.flatMap((m) => m.findings).filter((f) => {
    const key = f.id.replace(/^mod\d+-/, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const totalLines = modules.reduce((a, m) => a + m.linesAnalyzed, 0) || 1;
  const overallScore = Math.round(
    modules.reduce((acc, m) => acc + m.securityScore * m.linesAnalyzed, 0) / totalLines
  );

  const vulnFindings = dedupedFindings.filter((f) => !f.advisory);
  const advisoryCount = vulnFindings.length === 0 ? 0 : dedupedFindings.length - vulnFindings.length;

  // El cumplimiento se recalcula entero con los mismos seis controles y sobre
  // los hallazgos ya fusionados, para que el resultado de la IA no use una
  // metrica distinta a la del regex.
  const complianceControls = buildComplianceControls(target || ' ', vulnFindings);
  const complianceScore = complianceScoreOf(complianceControls);

  const countBySeverity = (sev: SecurityFindingSeverity) =>
    vulnFindings.filter((f) => f.severity === sev).length;

  const critical = countBySeverity('critical');
  const high = countBySeverity('high');

  return {
    ...base,
    overallSecurityScore: overallScore,
    totalFindings: vulnFindings.length,
    criticalFindings: critical,
    highFindings: high,
    mediumFindings: countBySeverity('medium'),
    lowFindings: countBySeverity('low'),
    complianceScore,
    complianceControls,
    advisoryCount,
    scoreBreakdown: buildScoreBreakdown(modules.flatMap((m) => m.findings)),
    coverage: buildCoverage({
      // El total de archivos se conserva del analisis original: los modulos no
      // cambian al fusionar, solo sus hallazgos.
      filesAnalyzed: base.coverage?.filesAnalyzed ?? modules.reduce((a, m) => a + (m.fileCount ?? 0), 0),
      totalLines: (target || ' ').split('\n').length,
      findings: dedupedFindings,
      rulesApplied: base.coverage?.rulesApplied ?? SECURITY_PATTERNS.length + SQL_RULES.length,
      // La cobertura por lenguaje se recalcula con los hallazgos ya fusionados,
      // o la IA apareceria como si no hubiera_found nada.
      perLanguage: buildLanguageCoverage(modules),
    }),
    modules,
    summary: buildSummary(overallScore, critical, high, vulnFindings.length),
  };
}
