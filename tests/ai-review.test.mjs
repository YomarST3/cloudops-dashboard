import handler from '../api/ai-review.ts';

const CODE = [
  '// ===== FILE: app/src/routes/auth.js =====',
  'const db = require("../db");',
  'router.post("/login", (req, res) => {',
  '  db.query("SELECT * FROM u WHERE p=\'" + req.body.p + "\'", (e, r) => res.json(r));',
  '});',
  '// ===== FILE: app/src/views/cart.js =====',
  'el.innerHTML = items;',
  '// ===== FILE: app/server.js =====',
  'app.get("/api/d", (req, res) => res.redirect(req.query.next));',
].join('\n');

const INPUT = { projectName: 'panaderia', code: CODE };

function mockRes() {
  const r = { status: 200, body: null };
  r.setHeader = () => {};
  r.status = (c) => { r.status = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}

async function call(env, fetchImpl, input = INPUT) {
  for (const k of ['GEMINI_API_KEY', 'GEMINI_MODEL']) delete process.env[k];
  Object.assign(process.env, env);
  globalThis.fetch = fetchImpl;

  // El handler llama a process.loadEnvFile() cuando no encuentra la clave, y en
  // este repositorio .env ya tiene una GEMINI_API_KEY real. Sin este sellado, el
  // caso "sin clave" cargaría la del desarrollador y la prueba mentiría. Se anula
  // la carga para que las variables sean solo las que fija cada caso.
  const realLoadEnvFile = process.loadEnvFile;
  process.loadEnvFile = () => {};

  try {
    const res = mockRes();
    await handler({ method: 'POST', headers: { origin: 'http://x' }, body: JSON.stringify(input) }, res);
    return res.body;
  } finally {
    process.loadEnvFile = realLoadEnvFile;
  }
}

const okBody = (n) => ({
  candidates: [{
    content: {
      parts: [{
        text: JSON.stringify({
          findings: Array.from({ length: n }, (_, i) => ({
            severity: ['critical', 'high', 'medium', 'low', 'info'][i % 5],
            category: `Cat${i}`,
            title: `Hallazgo IA ${i}`,
            description: `Descripcion del hallazgo ${i}`,
            lineHint: `archivo.js:${10 + i}`,
            recommendation: `Arreglar el hallazgo ${i}`,
            // CWE unico por hallazgo: el camino feliz no debe chocar con la
            // deduplicacion, que se prueba aparte con CWEs deliberadamente
            // repetidos. Ninguno de estos existe en los patrones del regex.
            cweId: `CWE-90${i}`,
          })),
        }),
      }],
    },
  }],
});

const okFetch = () => Promise.resolve({ status: 200, ok: true, json: async () => okBody(2) });

let fails = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'OK    ' : 'FALLO '} ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
};

// 1. Sin clave: respuesta temprana, sin resultado y sin tocar nada.
const sinClave = await call({}, okFetch);
check('sin clave -> aiEnabled false', sinClave.aiEnabled === false);
check('sin clave -> no devuelve result', sinClave.result === undefined);
check('sin clave -> avisa de la falta de clave', /GEMINI_API_KEY/.test(sinClave.aiError || ''));

// 2. Clave valida: la IA anade hallazgos, se reetiquetan y el puntaje baja.
const ok = await call({ GEMINI_API_KEY: 'AIza-fake' }, okFetch);
check('con clave -> aiEnabled true', ok.aiEnabled === true);
check('con clave -> modelo por defecto', ok.aiModel === 'gemini-3.5-flash-lite');
check('con clave -> sin error', !ok.aiError, ok.aiError || '');
check('con clave -> 6 hallazgos IA (3 modulos x 2)', ok.aiFindingCount === 6, `got ${ok.aiFindingCount}`);
const aiTagged = ok.result.modules.flatMap((m) => m.findings).filter((f) => f.source === 'ai');
check('hallazgos de IA etiquetados source=ai', aiTagged.length === 6, `got ${aiTagged.length}`);
check('todos los ids de IA empiezan por ai-mod', aiTagged.every((f) => f.id.startsWith('ai-mod')));
check(
  'los hallazgos de IA sobreviven al dedup (totalFindings)',
  ok.result.totalFindings >= 6,
  `totalFindings=${ok.result.totalFindings}`
);
check('el puntaje global baja al anadir hallazgos', ok.result.overallSecurityScore < 100, `score=${ok.result.overallSecurityScore}`);
check('result trae los metadatos de IA', ok.result.aiEnabled === true && ok.result.aiFindingCount === 6);

// 3. Cuota agotada (429) en el primer modulo.
let llamadas = 0;
const r429 = await call({ GEMINI_API_KEY: 'AIza-fake' }, () => {
  llamadas++;
  return Promise.resolve({ status: 429, ok: false, json: async () => ({}) });
});
check('429 -> aiError de limite diario', /limite diario/i.test(r429.aiError || ''), r429.aiError || '');
check('429 -> no se insiste de mas', llamadas <= 2, `llamadas=${llamadas}`);
check('429 -> el regex sigue intacto', r429.result.totalFindings > 0 && r429.result.modules.length === 3);

// 4. Gemini devuelve basura que no es JSON.
const basura = await call({ GEMINI_API_KEY: 'AIza-fake' }, () =>
  Promise.resolve({
    status: 200,
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: 'Hola, aqui tienes tu analisis.' }] } }] }),
  })
);
check('basura -> 0 hallazgos IA', basura.aiFindingCount === 0);
check('basura -> el regex sigue intacto', basura.result.totalFindings > 0);
check('basura -> avisar de que fallo', !!basura.aiError);

// 5. Clave invalida (401) en todos los modulos.
const r401 = await call({ GEMINI_API_KEY: 'AIza-fake' }, () =>
  Promise.resolve({ status: 401, ok: false, json: async () => ({}) })
);
check('401 -> 0 hallazgos IA', r401.aiFindingCount === 0);
check('401 -> mensaje de fallo global', /no pudo revisar/i.test(r401.aiError || ''), r401.aiError || '');
check('401 -> el regex sigue intacto', r401.result.totalFindings > 0);

// 6. Fallo PARCIAL: el primer modulo responde 500, los otros dos bien.
// Con concurrencia 2 el orden de llamadas es 0,1,2, asi que solo muere el 0.
let parcialN = 0;
const parcial = await call({ GEMINI_API_KEY: 'AIza-fake' }, () => {
  parcialN++;
  return parcialN === 1
    ? Promise.resolve({ status: 500, ok: false, json: async () => ({}) })
    : Promise.resolve({ status: 200, ok: true, json: async () => okBody(1) });
});
check('parcial -> 2 hallazgos IA de los 2 modulos que respondieron', parcial.aiFindingCount === 2, `got ${parcial.aiFindingCount}`);
check('parcial -> avisa del fallo parcial', /fallo en 1 de 3/i.test(parcial.aiError || ''), parcial.aiError || '');
check('parcial -> los modulos buenos conservan sus hallazgos', parcial.result.modules.filter((m) => m.findings.some((f) => f.source === 'ai')).length === 2);

// 7. Modelo configurable por entorno.
const otro = await call({ GEMINI_API_KEY: 'AIza-fake', GEMINI_MODEL: 'gemini-3.8-flash' }, okFetch);
check('modelo configurable por entorno', otro.aiModel === 'gemini-3.8-flash');

// 8. Respuesta con forma inesperada (array suelto, sin envolver) tambien vale,
//    y los campos invalidos se normalizan en lugar de contaminar el resultado.
const suelto = await call({ GEMINI_API_KEY: 'AIza-fake' }, () =>
  Promise.resolve({
    status: 200,
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify([{ severity: 'urgent', title: 'Suelto', description: 'D', recommendation: 'R', cweId: 'CWE-nope' }]) }] } }],
    }),
  })
);
const iaSuelto = suelto.result.modules.flatMap((m) => m.findings).filter((f) => f.source === 'ai');
check('array sin envolver -> se acepta', suelto.aiFindingCount === 3, `got ${suelto.aiFindingCount}`);
check('severity fuera de rango cae a medium', iaSuelto.every((f) => f.severity === 'medium'), iaSuelto.map((f) => f.severity).join(','));
check('cweId con formato invalido se descarta', iaSuelto.every((f) => f.cweId === undefined));

// 9. Un hallazgo sin title no sirve de nada: se descarta en vez de mostrar un card vacio.
const sinTitle = await call({ GEMINI_API_KEY: 'AIza-fake' }, () =>
  Promise.resolve({
    status: 200,
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ findings: [{ severity: 'low', description: 'D' }] }) }] } }],
    }),
  })
);
check('hallazgo sin title se descarta', sinTitle.aiFindingCount === 0, `got ${sinTitle.aiFindingCount}`);

// ── 10. Deduplicación por CWE ───────────────────────────────────────────────
// El regex ya marca CWE-89 (sql-injection) en src/routes. Si Gemini devuelve
// el mismo CWE para ese módulo, debe descartarse; uno distinto se conserva.
const dupBody = (cwes) => ({
  candidates: [{
    content: {
      parts: [{
        text: JSON.stringify({
          findings: cwes.map((c, i) => ({
            severity: 'high', category: `Cat${i}`, title: `IA ${c}`,
            description: 'd', recommendation: 'r', cweId: c,
          })),
        }),
      }],
    },
  }],
});

const dedupe = await call({ GEMINI_API_KEY: 'AIza-fake' }, () =>
  Promise.resolve({ status: 200, ok: true, json: async () => dupBody(['CWE-89', 'CWE-639']) })
);
const rutas = dedupe.result.modules.find((m) => m.moduleName === 'app/src/routes');
const iaRutas = rutas.findings.filter((f) => f.source === 'ai');
check('dedupe: el CWE ya cubierto por el regex se descarta', !iaRutas.some((f) => f.cweId === 'CWE-89'));
check('dedupe: un CWE nuevo si entra', iaRutas.some((f) => f.cweId === 'CWE-639'));
check('dedupe: en el modulo cubierto queda solo el CWE nuevo', iaRutas.length === 1 && iaRutas[0].cweId === 'CWE-639');

// El alcance de la deduplicación es el MÓDULO: si el regex ya marcó CWE-89 en
// app/src/routes, el hallazgo de IA para ese módulo no vuelve a penalizar, pero
// sí cuentan los de los otros módulos, donde el regex no vio nada.
const nada = await call({ GEMINI_API_KEY: 'AIza-fake' }, () =>
  Promise.resolve({ status: 200, ok: true, json: async () => dupBody([]) })
);
const soloDup = await call({ GEMINI_API_KEY: 'AIza-fake' }, () =>
  Promise.resolve({ status: 200, ok: true, json: async () => dupBody(['CWE-89']) })
);
const rutasSoloDup = soloDup.result.modules.find((m) => m.moduleName === 'app/src/routes');
const rutasNada = nada.result.modules.find((m) => m.moduleName === 'app/src/routes');
check(
  'dedupe: el modulo ya cubierto por el regex no altera su score',
  rutasSoloDup.securityScore === rutasNada.securityScore,
  `dup=${rutasSoloDup.securityScore} vs nada=${rutasNada.securityScore}`
);
check('dedupe: ese modulo no gana hallazgos nuevos', rutasSoloDup.findings.every((f) => f.source !== 'ai'));
check('dedupe: en otro modulo el mismo CWE si cuenta (fallo distinto)',
  soloDup.aiFindingCount > 0, `got ${soloDup.aiFindingCount}`);

check('dedupe: el hallazgo nuevo si hace bajar el score', dedupe.result.overallSecurityScore < nada.result.overallSecurityScore,
  `nuevo=${dedupe.result.overallSecurityScore} vs nada=${nada.result.overallSecurityScore}`);

// ── 11. El prompt se adapta al stack ─────────────────────────────────────────
let sentBody = '';
const capture = (src) => (_url, init) => {
  sentBody = init.body;
  return Promise.resolve({ status: 200, ok: true, json: async () => dupBody(['CWE-639']) });
};

const SUPABASE_INPUT = {
  projectName: 'app',
  code: [
    '// ===== FILE: app/src/lib/api.ts =====',
    "import { supabase } from '../integrations/supabase/client';",
    "export const rows = await supabase.from('pedidos').select('*');",
    '// ===== FILE: app/supabase/migrations/001.sql =====',
    'CREATE TABLE pedidos (id uuid primary key, user_id uuid);',
  ].join('\n'),
};

const supa = await call({ GEMINI_API_KEY: 'AIza-fake' }, capture(SUPABASE_INPUT), SUPABASE_INPUT);
check('prompt: detecta Supabase y lo dice', /SUPABASE/.test(sentBody));
check('prompt: avisa de que la clave anon NO es un hallazgo', /anon.*NORMAL|NORMAL.*anon/i.test(sentBody));
check('prompt: pide revisar RLS', /RLS/i.test(sentBody));

await call({ GEMINI_API_KEY: 'AIza-fake' }, capture(INPUT), INPUT);
check('prompt: en proyecto sin stack conocido usa el foco generico', /no encaja en un stack conocido/.test(sentBody));

// ── 12. La IA también dice archivo y línea cuando puede ─────────────────────
// El modelo mete la localizacion dentro de lineHint como texto; si no se
// extrae a campos estructurados, el hallazgo no se puede abrir en el codigo.
const locBody = (hint) => ({
  candidates: [{
    content: {
      parts: [{
        text: JSON.stringify({
          findings: [{
            severity: 'high', category: 'Access Control', title: 'Sin autorizacion',
            description: 'd', recommendation: 'r', cweId: 'CWE-862', lineHint: hint,
          }],
        }),
      }],
    },
  }],
});

const locCases = [
  ['app/src/routes/auth.js:42', 'app/src/routes/auth.js', 42],
  ['src/db.ts:7', 'src/db.ts', 7],
  ['supabase/migrations/001.sql, línea 18', 'supabase/migrations/001.sql', 18],
  ['en src/lib/x.js linea 9', 'src/lib/x.js', 9],
  ['src/components/Table.tsx', 'src/components/Table.tsx', undefined],
  ['línea 55', undefined, 55],
  ['sin ninguna ubicacion', undefined, undefined],
];

for (const [hint, file, line] of locCases) {
  const r = await call({ GEMINI_API_KEY: 'AIza-fake' }, () =>
    Promise.resolve({ status: 200, ok: true, json: async () => locBody(hint) })
  );
  const f = r.result.modules.flatMap((m) => m.findings).find((x) => x.source === 'ai');
  check(
    `localizacion IA: "${hint}"`,
    f?.file === file && f?.line === line,
    `-> file=${f?.file} line=${f?.line}`
  );
}

console.log(fails === 0 ? '\nTODAS LAS PRUEBAS PASAN' : `\n${fails} prueba(s) fallan`);
process.exit(fails === 0 ? 0 : 1);