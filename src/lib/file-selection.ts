/**
 * Que archivos entran en el analisis, y cuales se quedan fuera.
 *
 * Vive fuera del componente a proposito: es logica pura con una consecuencia
 * importante, y poder comprobarla con la lista real de archivos es la unica
 * forma de saber que no se esta dejando fuera un lenguaje entero.
 *
 * El fallo que motiva esto: la seleccion era una bolsa unica de 400.000
 * caracteres que se gastaba el primero que encontraba en el ZIP, y el orden del
 * ZIP no significa nada. En un proyecto con Supabase, con mucho TypeScript al
 * principio y las migraciones al final, los 50 archivos de SQL se quedaban
 * fuera sin avisar. El analizador no informaba de "no hay problemas en la base
 * de datos": es que nunca habia visto la base de datos.
 */

export interface LoadedFile {
  name: string;
  path: string;
  size: number;
  content: string;
  skipped?: boolean;
  skipReason?: string;
}

/** Limite de texto que se envia al analizador. */
export const MAX_TOTAL_CHARS = 800_000;

/**
 * Reparto minimo garantizado a cada lenguaje, en fraccion del presupuesto.
 * Sin esto, un proyecto con mucho Javascript deja sin sitio al SQL.
 */
export const LANGUAGE_SHARE = 0.15;

/**
 * Carpetas que contienen el nucleo del proyecto. Antes solo Javascript, lo que
 * hacia que las migraciones quedaran SIEMPRE al final de la cola. Una carpeta
 * de migraciones o de esquema nunca debe ser lo ultimo que se mira.
 */
export const SOURCE_DIRS = [
  'src/',
  'app/',
  'lib/',
  'pages/',
  'components/',
  'server/',
  'supabase/',
  'migrations/',
  'prisma/',
  'db/',
  'database/',
];

export interface FileSelection {
  code: string;
  /** Archivos que SI se enviaron. */
  sent: number;
  /** Archivos que se quedaron fuera por el limite. */
  dropped: number;
  /** Archivos enviados por lenguaje: { code: 68, SQL: 50 }. */
  perLanguage: Record<string, number>;
  /** Archivos dejados fuera por lenguaje. */
  droppedPerLanguage: Record<string, number>;
}

/** Nombre de grupo: 'SQL' para migraciones, 'code' para el resto. */
export function languageGroup(path: string): 'SQL' | 'code' {
  return path.toLowerCase().endsWith('.sql') ? 'SQL' : 'code';
}

const rank = (path: string) => {
  const idx = SOURCE_DIRS.findIndex((d) => path.startsWith(d) || path.includes(`/${d}`));
  return idx === -1 ? SOURCE_DIRS.length : idx;
};

const costOf = (f: LoadedFile) => f.content.length + f.path.length + 24;

/**
 * Reparte el presupuesto de forma justa entre lenguajes.
 *
 * Cada lenguaje recibe primero una cuota garantizada, y despues el presupuesto
 * sobrante se reparte entre los que aun tengan hueco, en el orden de prioridad.
 * Asi, con 122 archivos de TypeScript y 50 de SQL, ninguno se queda sin
 * analizar aunque uno se lleve la mayor parte del proyecto.
 */
export function selectFiles(files: LoadedFile[], budget = MAX_TOTAL_CHARS): FileSelection {
  const included = files.filter((f) => !f.skipped && f.content.trim());

  // Orden estable y reproducible: primero por lenguaje, luego por carpeta
  // relevante y por ruta. El analisis da igual al orden del ZIP.
  const ordered = included.slice().sort((a, b) => {
    const byLang = languageGroup(a.path).localeCompare(languageGroup(b.path));
    if (byLang !== 0) return byLang;
    const byRank = rank(a.path) - rank(b.path);
    return byRank !== 0 ? byRank : a.path.localeCompare(b.path);
  });

  const groups = new Map<string, LoadedFile[]>();
  for (const file of ordered) {
    const key = languageGroup(file.path);
    const bucket = groups.get(key);
    if (bucket) bucket.push(file);
    else groups.set(key, [file]);
  }

  const chosen = new Set<LoadedFile>();

  // 1) Cuota minima garantizada por lenguaje.
  //
  // Aqui NO se cuentan descartes: un archivo que se queda fuera de la cuota
  // puede entrar despues en la fase 2, y si se marcara como excluido aqui su
  // cuenta quedaria desfasada para siempre. El recuento real se hace al final,
  // a partir de `chosen`.
  const reserved = Math.floor(budget * LANGUAGE_SHARE);
  const used = new Map<string, number>();

  for (const [lang, bucket] of groups) {
    let local = 0;
    for (const file of bucket) {
      if (local + costOf(file) > reserved) break;
      chosen.add(file);
      local += costOf(file);
    }
    used.set(lang, local);
  }

  const totalChars = () => [...used.values()].reduce((a, b) => a + b, 0);

  // 2) El presupuesto sobrante se reparte por turnos: en cada vuelta cada
  // lenguaje coge UN archivo. Si se llenara cada grupo hasta agotar su turno,
  // el primero de la lista ("code" va antes que "SQL") se llevaria todo el
  // sobrante y las migraciones volverian a quedarse fuera, que es exactamente
  // el fallo que se quiere evitar.
  let quedan = budget - totalChars();
  let progreso = true;

  while (quedan > 0 && progreso) {
    progreso = false;
    for (const bucket of groups.values()) {
      const next = bucket.find((f) => !chosen.has(f));
      if (!next) continue;
      const cost = costOf(next);
      if (cost > quedan) continue;
      chosen.add(next);
      quedan -= cost;
      const lang = languageGroup(next.path);
      used.set(lang, (used.get(lang) ?? 0) + cost);
      progreso = true;
    }
  }

  // Recuento final, derivado de lo que realmente se eligio.
  const perLanguage: Record<string, number> = {};
  const droppedPerLanguage: Record<string, number> = {};
  for (const [lang, bucket] of groups) {
    const chosenInLang = bucket.filter((f) => chosen.has(f)).length;
    perLanguage[lang] = chosenInLang;
    droppedPerLanguage[lang] = bucket.length - chosenInLang;
  }

  const parts = ordered
    .filter((f) => chosen.has(f))
    .map((f) => `// ===== FILE: ${f.path} =====\n${f.content}`);

  return {
    code: parts.join('\n\n'),
    sent: chosen.size,
    dropped: included.length - chosen.size,
    perLanguage,
    droppedPerLanguage,
  };
}

/** Nombre legible del grupo, para mostrarlo en la interfaz. */
export const LANGUAGE_LABEL: Record<string, string> = {
  code: 'Código',
  SQL: 'SQL',
};