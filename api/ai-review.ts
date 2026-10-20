/**
 * /api/ai-review
 *
 * Segunda capa del analizador: revisa el mismo proyecto con Google Gemini y
 * fusiona sus hallazgos con los del analisis estatico, recalculando el puntaje
 * para que exista un unico score que tenga en cuenta las dos capas.
 *
 * Va separado de /api/ai-analyze a proposito. Una funcion serverless de Vercel
 * tiene 60 segundos y aqui se hacen hasta 15 llamadas a Gemini (una por
 * modulo): mezclarlas con el regex haria que, al agotarse el tiempo, se perdiera
 * tambien el resultado del regex, que es el que siempre funciona.
 *
 * POST body: { projectName, code?, description?, language?, region }
 *
 * Nunca falla de forma fatal. Sin clave, sin cuota o con Gemini caido, devuelve
 * un aviso y el cliente conserva intacto el analisis estatico que ya tenia.
 */

import type { SecurityFinding, SecurityFindingSeverity } from '../src/types/cloud';
import { analyzeCode, applyAiFindings, prepare, type AnalyzeInput } from '../src/lib/server/analyze.ts';

/**
 * 60 es el maximo de Vercel en los planes gratuita. Se exporta para que la
 * plataforma no corte la funcion antes de tiempo con su propio valor por
 * defecto, que es menor.
 */
export const maxDuration = 60;

/**
 * Flash-Lite: el unico con cupo diario amplio en el plan gratuito, y el unico
 * que responde de forma consistente dentro del tiempo de una funcion serverless.
 *
 * Se probo flash (con thinking) porque promete mas profundidad, pero en vivo
 * tarda 28-75 s por modulo y devuelve 503 con frecuencia: no cabe en los 60 s de
 * Vercel y dejaba la revision con 0 hallazgos. Lite responde en ~1 s y detecta
 * igual los fallos de flujo (IDOR, autorizacion ausente) que se le piden abajo.
 */
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Cortar un modulo enorme mantiene la respuesta manejable y el gasto acotado. */
const MAX_CHARS_PER_MODULE = 80_000;

/** Techo de hallazgos por modulo: evita que un modulo contamine el informe. */
const MAX_FINDINGS_PER_MODULE = 12;

/** Margen antes del corte de Vercel, para poder responder con lo que haya. */
const DEADLINE_MS = 56_000;

/** Cuatro a la vez: menos de 15 modulos y margen de sobra dentro de los 60 s. */
const CONCURRENCY = 4;

/**
 * Base de la espera antes de reintentar un 429/503, en milisegundos. Es
 * configurable para que las pruebas no tengan que esperar segundos reales.
 */
function retryBaseMs(): number {
  const v = Number(process.env.GEMINI_RETRY_MS);
  return Number.isFinite(v) && v >= 0 ? v : 4_000;
}

const SEVERITIES: SecurityFindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];

/**
 * Lee la clave de Gemini.
 *
 * En Vercel la variable ya viene en process.env. En local (`npm run dev` con
 * Vite, o `node server.mjs`) las funciones se ejecutan dentro del proceso de
 * Node, que no carga el .env por su cuenta: de ahi process.loadEnvFile(), que
 * existe en Node 20.12+ y no requiere instalar nada. Si no hay .env (Vercel),
 * falla y se ignora, porque en ese caso la clave ya esta en process.env.
 */
function geminiKey(): string | undefined {
  if (!process.env.GEMINI_API_KEY) {
    try {
      process.loadEnvFile();
    } catch {
      // Sin .env en disco: normal en Vercel y en Docker. No es un error.
    }
  }
  return process.env.GEMINI_API_KEY?.trim() || undefined;
}

function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

const SYSTEM_PROMPT = [
  'Eres un analista de seguridad de codigo senior. Revisas un modulo y reportas',
  'vulnerabilidades reales que esten escritas en ese codigo.',
  '',
  'Responde EXCLUSIVAMENTE con un objeto JSON con esta forma exacta:',
  '{"findings":[{"severity":"critical|high|medium|low|info",',
  '"category":"Injection","title":"titulo corto",',
  '"description":"por que es un problema y por que importa",',
  '"lineHint":"archivo:linea o la expresion concreta",',
  '"recommendation":"como corregirlo de forma concreta",',
  '"cweId":"CWE-89"}]}',
  '',
  'Trabajas en DOS CAPAS, y hay que cubrir las dos:',
  '1. SEGURIDAD DE FLUJO: sigue el dato de principio a fin. Quien puede llamar a',
  '   esta funcion, si se comprueba la sesion y el permiso ANTES de tocar datos,',
  '   si la entrada del usuario llega a una consulta, a una ruta de archivo o al',
  '   HTML sin sanear, y si un usuario puede leer o modificar filas de otro',
  '   (IDOR). Esto es lo que un analizador de patrones NO puede ver.',
  '2. LOGICA DE NEGOCIO: precios o cantidades que vienen del cliente sin',
  '   recalcular en el servidor, estados que se pueden saltar (pagar sin stock,',
  '   cancelar tras completar), limites de intentos o de cupo que nadie aplica,',
  '   y confianza en una confirmacion hecha solo en el navegador.',
  '',
  'Reglas importantes:',
  '- El modulo puede contener varios archivos, cada uno encabezado por una linea',
  '  "===== FILE: ruta =====". Cita SIEMPRE la ruta y la linea DENTRO de ese',
  '  archivo (las lineas de cada archivo empiezan en 1), no la linea del',
  '  volcado completo.',
  '- Si el modulo esta limpio, responde {"findings":[]} sin texto alrededor.',
  '- No inventes problemas ni supongas codigo que no aparece. Sin evidencia en el',
  '  codigo mostrado, no hay hallazgo.',
  '- No repitas lo que un analizador de patrones ya encuentra de forma obvia',
  '  (require de paquetes, console.log). Céntrate en lo que exige entender el',
  '  flujo: autorizacion, validacion de entrada, secretos, exposure de datos.',
  '- Como maximo 12 hallazgos, ordenados del mas grave al menos grave.',
].join('\n');

// ─── Foco por stack ──────────────────────────────────────────────────────────
//
// Un unico prompt generico encuentra poco en un proyecto moderno: el acceso a
// datos no va por db.query() sino por supabase.from().select(), asi que los
// patrones de backend clasico no aplican. Estos bloques le dicen al modelo que
// mirar donde de verdad esta el riesgo en cada stack.
//
// Los CWE usados son intencionadamente conservative: se reportan cosas que se
// pueden Demonstrate leyendo el codigo, no sospechas que necesitarian ejecutar
// la app para confirmarse.

// En Supabase la vulnerabilidad casi nunca es SQL injection: es que las tablas
// no estan protegidas y cualquiera puede leerlas con la clave publica anon.
const SUPABASE_FOCUS = [
  'Este proyecto usa SUPABASE. Busca sobre todo esto:',
  '- RLS (Row Level Security): una tabla sin "ENABLE ROW LEVEL SECURITY", o con',
  '  politicas que solo comprueban que el usuario esta logueado pero NO que la',
  '  fila sea suya. Eso permite que un usuario autenticado lea o modifique datos',
  '  de otros. Busca el filtro por auth.uid() / user_id en cada politica.',
  '- Claves: la clave "anon" en el cliente es NORMAL en Supabase (es publica por',
  '  diseno) y NO es un hallazgo. En cambio, una clave "service_role" en codigo de',
  '  cliente SI lo es: evade RLS por completo y hay que marcarla critical.',
  '- Consultas .select(), .update() o .delete() sin filtrar por el id del usuario',
  '  actual: si devuelven todas las filas, cualquiera puede ver las de otros.',
  '- Autorizacion comprobada solo al renderizar un componente, en vez de en la',
  '  capa de datos o en el servidor: se puede saltar entrando por la URL.',
  '- En archivos de migracion SQL, revisa tambien los CREATE POLICY y los ALTER',
  '  TABLE ... ENABLE ROW LEVEL SECURITY que falten.',
].join('\n');

const NEXT_FOCUS = [
  'Este proyecto usa NEXT.JS o un stack de React con API. Busca sobre todo:',
  '- Server Actions y Route Handlers que no comprueban sesion antes de leer o',
  '  escribir datos (CWE-862: control de acceso solo en la vista).',
  '- Secretos expuestos al navegador con el prefijo NEXT_PUBLIC_ (CWE-798).',
  '- Endpoints /api que aceptan entrada y la pasan a una consulta sin validar.',
].join('\n');

const EXPRESS_FOCUS = [
  'Este proyecto usa EXPRESS/NODE. Busca sobre todo:',
  '- Inyeccion SQL por concatenacion de entrada en la consulta (CWE-89).',
  '- Rutas sin autenticacion que devuelven datos de otros usuarios (CWE-639).',
  '- CORS con comodin, redirecciones abiertas y eval() con datos externos.',
].join('\n');

const GENERIC_FOCUS = [
  'Este proyecto no encaja en un stack conocido. Busca autorizacion ausente,',
  'validacion de entrada, secretos escritos en el codigo y datos expuestos.',
].join('\n');

/**
 * El foco se decide sobre el PROYECTO entero, no por modulo: en una app de
 * Supabase, un modulo que solo llama a `supabase.from()` sigue necesitando las
 * preguntas de RLS aunque no mencione la palabra "policy".
 */
function detectFocus(modules: { content: string }[]): string[] {
  const all = modules.map((m) => m.content).join('\n');
  const focus: string[] = [];

  if (/supabase/i.test(all)) focus.push(SUPABASE_FOCUS);
  if (/from\s+['"]next(?:\/|['"])|next\/config/i.test(all)) focus.push(NEXT_FOCUS);
  if (/require\s*\(['"]express['"]\)|from\s+['"]express['"]|require\(['"]next['"]\)/i.test(all)) {
    focus.push(EXPRESS_FOCUS);
  }

  return focus.length > 0 ? focus : [GENERIC_FOCUS];
}

interface RawFinding {
  severity?: string;
  category?: string;
  title?: string;
  description?: string;
  lineHint?: string;
  recommendation?: string;
  cweId?: string;
}

const str = (v: unknown, max = 400): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

/**
 * Gemini suele devolver la localizacion dentro de lineHint, como "app/db.ts:12"
 * o "src/routes/auth.js, línea 42". Se intenta extraer a campos estructurados
 * para que el hallazgo se pueda abrir en el codigo igual que uno del regex: si
 * solo se muestra el texto suelto, no hay forma de comprobarlo.
 */
function parseLocation(hint: string): { file?: string; line?: number } {
  if (!hint) return {};

  const withColon = hint.match(/([\w./\\-]+\.[a-z]{1,5}):(\d{1,6})/i);
  if (withColon) {
    return { file: withColon[1].replace(/^.*?(?=(src|app|lib|api|pages|server|supabase)\/)/, ''), line: Number(withColon[2]) };
  }

  const fileThenLine = hint.match(/([\w./\\-]+\.[a-z]{1,5})[^\d\n]{0,12}(?:línea|linea|line)\s*(\d{1,6})/i);
  if (fileThenLine) {
    return { file: fileThenLine[1], line: Number(fileThenLine[2]) };
  }

  const lineOnly = hint.match(/(?:^|\s)(?:línea|linea|line)\s*(\d{1,6})/i);
  if (lineOnly) return { line: Number(lineOnly[1]) };

  // Solo el nombre de archivo, sin linea.
  const fileOnly = hint.match(/(?:^|\s)((?:[\w-]+\/)+[\w.-]+\.[a-z]{1,5})\b/);
  if (fileOnly) return { file: fileOnly[1] };

  return {};
}

/** Convierte la respuesta del modelo en hallazgos validos, o la descarta. */
function toFindings(raw: unknown, moduleName: string, idPrefix: string): SecurityFinding[] {
  // El prompt pide { findings: [...] }, pero JSON mode no garantiza la envoltura.
  // Se aceptan las dos formas y cualquier otra se descarta como vacia.
  const wrapped = (raw ?? {}) as { findings?: unknown };
  const list: RawFinding[] = Array.isArray(raw)
    ? (raw as RawFinding[])
    : Array.isArray(wrapped.findings)
      ? (wrapped.findings as RawFinding[])
      : [];

  const out: SecurityFinding[] = [];

  for (const item of list.slice(0, MAX_FINDINGS_PER_MODULE)) {
    if (!item || typeof item !== 'object') continue;

    const title = str(item.title, 160);
    const description = str(item.description);
    // Sin titulo o sin descripcion el hallazgo no sirve de nada: mejor fewer.
    if (!title || !description) continue;

    const severity = SEVERITIES.includes(item.severity as SecurityFindingSeverity)
      ? (item.severity as SecurityFindingSeverity)
      : 'medium';

    const category = str(item.category, 60) || 'Security';
    const recommendation = str(item.recommendation) || 'Revisar y corregir manualmente.';
    const cweId = /^CWE-\d+$/i.test(str(item.cweId, 12)) ? str(item.cweId, 12).toUpperCase() : undefined;
    const hint = str(item.lineHint, 120);
    const where = parseLocation(hint);

    out.push({
      // El id lleva `ai-mod...` a proposito: la deduplicacion normaliza con
      // replace(/^mod\d+-/, ''), que no toca este prefijo, asi que cada hallazgo
      // de la IA conserva su clave y sobrevive al dedup.
      id: `${idPrefix}-${out.length}-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20)}`,
      severity,
      category,
      title,
      description,
      affectedModule: moduleName,
      lineHint: hint || undefined,
      file: where.file,
      line: where.line,
      recommendation,
      cweId,
      source: 'ai',
    });
  }

  return out;
}

interface ModuleOutcome {
  moduleName: string;
  findings: SecurityFinding[];
  error?: string;
}

/**
 * Anota el contenido del modulo con la ruta de cada archivo, para que el modelo
 * pueda citar "archivo:linea".
 *
 * El modulo es varios archivos pegados con '\n\n' y sin marca entre ellos. Sin
 * esta anotacion el modelo solo ve lineas de un volcado continuo y no puede
 * decir en que archivo esta cada cosa; el numero de linea que devuelve tampoco
 * sirve, porque cada archivo reinicia su cuenta. Con los marcadores y las lineas
 * relativas por archivo, `lineHint` pasa a ser una ubicacion real.
 */
function annotate(
  content: string,
  spans: { path: string; startLine: number; endLine: number }[]
): string {
  if (spans.length === 0) return content;
  const lines = content.split('\n');

  // Se recorre de atras hacia adelante para insertar sin desplazar los indices
  // de los spans que quedan por procesar.
  const chunks: string[] = [];
  for (let i = spans.length - 1; i >= 0; i -= 1) {
    const span = spans[i];
    const body = lines.slice(span.startLine - 1, span.endLine).join('\n');
    // Lineas 1..N DENTRO de este archivo, no del volcado.
    const numerado = body
      .split('\n')
      .map((l, n) => `${n + 1}: ${l}`)
      .join('\n');
    chunks.unshift(`===== FILE: ${span.path} =====\n${numerado}`);
  }
  return chunks.join('\n\n');
}

/**
 * Una llamada a Gemini. Nunca lanza: cualquier fallo (red, 4xx, 429, timeout o
 * una respuesta que no es JSON) se convierte en `error`, para que un fallo
 * puntual no tire abajo el analisis completo.
 */
async function reviewModule(
  key: string,
  model: string,
  module: { name: string; content: string; language: string; framework?: string; spans?: { path: string; startLine: number; endLine: number }[] },
  idPrefix: string,
  focus: string[],
  deadlineAt?: number
): Promise<ModuleOutcome> {
  const outcome: ModuleOutcome = { moduleName: module.name, findings: [] };

  const anotado = annotate(module.content, module.spans ?? []);
  const content =
    anotado.length > MAX_CHARS_PER_MODULE
      ? anotado.slice(0, MAX_CHARS_PER_MODULE) +
        `\n// [contenido truncado en ${MAX_CHARS_PER_MODULE} caracteres]`
      : anotado;

  const where = `Modulo: ${module.name} (${module.language}${
    module.framework ? ` / ${module.framework}` : ''
  })`;

  const body = JSON.stringify({
    contents: [
      {
        parts: [
          {
            text: `${SYSTEM_PROMPT}\n\n${focus.join('\n\n')}\n\n${where}\n\n\`\`\`\n${content}\n\`\`\``,
          },
        ],
      },
    ],
    // JSON mode en vez de response_schema: el esquema estructurado de
    // Gemini es un subconjunto de JSON Schema y su formato ha cambiado entre
    // versiones de la API. JSON mode es estable, y toFindings() valida y
    // normaliza la respuesta igualmente.
    generationConfig: { response_mime_type: 'application/json' },
  });

/**
 * Timeout de UNA llamada a Gemini. Los modelos con thinking (flash) tardan mas
 * que lite: con 25 s la llamada se abortaba SIEMPRE y la revision terminaba con
 * 0 hallazgos. 45 s deja margen para la respuesta mas lenta, y como los modulos
 * van en paralelo y el corte global es 56 s, un modulo lento no arrastra al
 * resto (el worker comprueba el deadline antes de cada llamada, no dentro).
 */
const CALL_TIMEOUT_MS = 45_000;

const send = () =>
  fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    body,
  });

  try {
    let response = await send();

    // 429 = limite por minuto (reintentar recupera el modulo; solo si vuelve a
    // pasar es el diario). 503 = el modelo esta sobrecargado ("high demand"),
    // que es transitorio y se cobra caro: sin reintento, un pico de Google deja
    // la revision con 0 hallazgos y el informe parece decir "todo limpio".
    // Ambos se reintentan UNA vez; el segundo intento tambien espera el doble.
    let intento = 0;
    while ((response.status === 429 || response.status === 503) && intento < 2) {
      // Solo se reintenta si de verdad queda presupuesto: un reintento que
      // empiece cerca del corte global (60 s de Vercel) moriria a medio camino
      // y devolveria un error peor que el original.
      const espera = retryBaseMs() * (intento + 1);
      if (deadlineAt && Date.now() + espera + CALL_TIMEOUT_MS > deadlineAt) break;
      intento += 1;
      await new Promise((r) => setTimeout(r, espera));
      response = await send();
    }

    if (response.status === 429) {
      return { ...outcome, error: 'limite-diario' };
    }
    if (response.status === 503) {
      return { ...outcome, error: 'modelo-saturado' };
    }
    if (!response.ok) {
      return { ...outcome, error: `Gemini respondio HTTP ${response.status}` };
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { ...outcome, error: 'Gemini no devolvio contenido' };

    outcome.findings = toFindings(JSON.parse(text), module.name, idPrefix);
    return outcome;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'error desconocido';
    return { ...outcome, error: message.includes('timeout') || message.includes('abort') ? 'timeout' : message };
  }
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

  // Sin clave se responde de inmediato y SIN tocar el resultado que el cliente
  // ya tiene del regex. No hace falta volver a ejecutar el analisis estatico.
  const key = geminiKey();
  if (!key) {
    res.status(200).json({
      aiEnabled: false,
      aiModel: geminiModel(),
      aiFindingCount: 0,
      aiError:
        'Sin GEMINI_API_KEY configurada. El analisis se quedo en la capa estatica (regex).',
    });
    return;
  }

  const model = geminiModel();

  let body: AnalyzeInput;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ error: 'JSON inválido en el cuerpo de la solicitud.' });
    return;
  }

  // Se parte del MISMO analisis estatico que ya vio el cliente, para que la
  // fusion parta de un estado identico y solo cambien los hallazgos de la IA.
  const base = analyzeCode(body ?? {});

  // El codigo que se manda a Gemini sale de prepare(), el mismo recorrido que
  // usa analyzeCode: mismo orden de modulos, mismos limites, mismo contenido.
  const prepared = prepare(body ?? {});

  const targets = prepared.fileModules.map((m, i) => ({
    index: i,
    name: m.name,
    content: m.content,
    language: m.language,
    framework: m.framework,
    spans: m.spans,
  }));

  // El foco se decide UNA vez sobre el proyecto entero y se reutiliza en todas
  // las llamadas, para que los 20 modulos se pregunten lo mismo.
  const focus = detectFocus(targets);

  const started = Date.now();
  const outcomes = new Array<ModuleOutcome | undefined>(targets.length);
  let cursor = 0;

  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= targets.length) return;

      // Corta el resto si se acabo el margen: preferimos responder con los
      // modulos revisados que no devolver un error por timeout de la plataforma.
      if (Date.now() - started > DEADLINE_MS) {
        outcomes[i] = { moduleName: targets[i].name, findings: [], error: 'sin-tiempo' };
        continue;
      }

      const outcome = await reviewModule(
        key,
        model,
        targets[i],
        `ai-mod${i}`,
        focus,
        started + DEADLINE_MS + 8_000
      );
      outcomes[i] = outcome;

      // Cuota agotada: no insistir con los modulos que faltan.
      if (outcome.error === 'limite-diario') {
        for (let j = i + 1; j < targets.length; j++) {
          outcomes[j] = { moduleName: targets[j].name, findings: [], error: 'limite-diario' };
        }
        cursor = targets.length;
        return;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));

  const aiByModule: Record<string, SecurityFinding[]> = {};
  for (const outcome of outcomes) {
    if (outcome?.findings.length) {
      aiByModule[outcome.moduleName] = outcome.findings;
    }
  }

  const problems = outcomes.filter(
    (o) => o?.error && !['limite-diario', 'modelo-saturado'].includes(o.error)
  ).length;
  const rateLimited = outcomes.some((o) => o?.error === 'limite-diario');
  const saturado = outcomes.some((o) => o?.error === 'modelo-saturado');
  const noTime = outcomes.some((o) => o?.error === 'sin-tiempo');

  let aiError: string | undefined;
  if (rateLimited) {
    aiError =
      'Se alcanzo el limite diario de requests de Gemini: la revision se completo solo en parte. Prueba manana o cambia a otro modelo.';
  } else if (saturado) {
    aiError =
      'El modelo de Gemini esta saturado ahora mismo (demanda alta en Google): la revision no cubrio todos los modulos. Vuelve a intentarlo en unos minutos.';
  } else if (noTime) {
    aiError = 'El analisis con IA se quedo sin tiempo y no cubrio todos los modulos.';
  } else if (problems > 0 && problems === outcomes.length) {
    aiError = 'Gemini no pudo revisar el proyecto. El analisis estatico se mantiene intacto.';
  } else if (problems > 0) {
    aiError = `Gemini fallo en ${problems} de ${outcomes.length} modulos; el resto se reviso con normalidad.`;
  }

  const merged = applyAiFindings(base, aiByModule, prepared.analysisTarget);

  // Se cuenta DESPUES de fusionar, no antes. applyAiFindings descarta los
  // hallazgos de IA cuyo CWE ya cubria el regex, asi que contar en este punto lo
  // que devolvio Gemini-diria un numero mayor que el de hallazgos que el
  // usuario ve de verdad en pantalla.
  const aiFindingCount = merged.modules
    .flatMap((m) => m.findings)
    .filter((f) => f.source === 'ai').length;

  res.status(200).json({
    aiEnabled: true,
    aiModel: model,
    aiFindingCount,
    aiError,
    result: { ...merged, aiEnabled: true, aiModel: model, aiFindingCount, aiError },
  });
}