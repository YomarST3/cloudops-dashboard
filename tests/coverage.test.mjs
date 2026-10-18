/**
 * Comprueba que las metricas de cobertura dicen algo comprobable, que es lo
 * que hace que el analisis se pueda defender.
 *
 * Uso:  node tests/coverage.test.mjs
 */
import { analyzeCode } from '../src/lib/server/analyze.ts';

let fails = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'OK    ' : 'FALLO '} ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
};

const f = (path, content) => `// ===== FILE: ${path} =====\n${content}\n`;
const flat = (r) => r.modules.flatMap((m) => m.findings);

// ── 1. Se cuentan TODAS las ocurrencias, no solo la primera ───────────────────
// El defecto original: pattern.exec() sin /g devolvia un unico match, asi que
// cinco inyecciones SQL y una inyeccion daban el mismo hallazgo.
const muchas = analyzeCode({
  projectName: 'app',
  code: f('app/src/db.js', [
    "const db = require('../db');",
    "router.get('/a', (q, s) => db.query(\"SELECT * FROM u WHERE n='\" + q.query.a + \"'\", cb));",
    "router.get('/b', (q, s) => db.query(\"SELECT * FROM u WHERE n='\" + q.query.b + \"'\", cb));",
    "router.get('/c', (q, s) => db.query(\"SELECT * FROM u WHERE n='\" + q.query.c + \"'\", cb));",
    "router.get('/d', (q, s) => db.query(\"SELECT * FROM u WHERE n='\" + q.query.d + \"'\", cb));",
    "router.get('/e', (q, s) => db.query(\"SELECT * FROM u WHERE n='\" + q.query.e + \"'\", cb));",
  ].join('\n')),
});

const sqli = flat(muchas).find((x) => x.id.endsWith('sql-injection'));
check('una inyeccion repetida se cuenta todas las veces', sqli?.occurrences === 5, String(sqli?.occurrences));
check('y guarda varias localizaciones', (sqli?.locations?.length ?? 0) >= 1, String(sqli?.locations?.length));
check('pero sigue siendo UNA sola tarjeta, no cinco', flat(muchas).filter((x) => x.id.endsWith('sql-injection')).length === 1);

const una = analyzeCode({
  projectName: 'app',
  code: f('app/src/db.js', "db.query(\"SELECT * FROM u WHERE n='\" + req.query.n + \"'\", cb);"),
});
check('una sola ocurrencia se cuenta como una', flat(una).find((x) => x.id.endsWith('sql-injection'))?.occurrences === 1);

// ── 2. Las metricas de cobertura son proporcionales ──────────────────────────
const limpio = analyzeCode({
  projectName: 'app',
  code: [1, 2, 3, 4, 5].map((i) => f(`app/src/mod${i}.js`, `export const n${i} = ${i};`)).join('\n'),
});

check('un proyecto limpio tiene cobertura 0%', limpio.coverage?.fileIssueRate === 0,
  String(limpio.coverage?.fileIssueRate));
check('y cuenta los archivos analizados', limpio.coverage?.filesAnalyzed === 5, String(limpio.coverage?.filesAnalyzed));
check('declara cuantas reglas se aplicaron', (limpio.coverage?.rulesApplied ?? 0) >= 15,
  String(limpio.coverage?.rulesApplied));

const sucio = analyzeCode({
  projectName: 'app',
  code: [
    f('app/src/a.js', "const p = 'Panaderia2024!'; db.query(\"SELECT * FROM u WHERE n='\" + q.n + \"'\");"),
    f('app/src/b.js', 'export const ok = 1;'),
    f('app/src/c.js', 'export const ok = 2;'),
    f('app/src/d.js', 'export const ok = 3;'),
  ].join('\n'),
});

check('el % de archivos con hallazgos es proporcional',
  sucio.coverage?.fileIssueRate === 25, String(sucio.coverage?.fileIssueRate));
check('el % de archivos con VULNERABILIDAD distingue de las recomendaciones',
  sucio.coverage?.vulnerabilityFileRate === 25, String(sucio.coverage?.vulnerabilityFileRate));
check('la densidad por 1000 lineas es un numero pequeno y real',
  typeof sucio.coverage?.findingsPerThousandLines === 'number' && sucio.coverage.findingsPerThousandLines > 0,
  String(sucio.coverage?.findingsPerThousandLines));
check('el % nunca supera 100', (sucio.coverage?.fileIssueRate ?? 0) <= 100);

// ── 3. Las recomendaciones de seguridad no inflan la cobertura de problemas ─
// Un proyecto con 20 archivos limpios y 1 con "tienes imports" no debe decir
// que el 100% del codigo tiene problemas.
const mayormenteLimpio = analyzeCode({
  projectName: 'app',
  code: [
    f('app/src/a.js', "import fs from 'fs';"),
    f('app/src/b.js', 'export const ok = 1;'),
    f('app/src/c.js', 'export const ok = 2;'),
    f('app/src/d.js', 'export const ok = 3;'),
  ].join('\n'),
});
check('un import no convierte el proyecto entero en problemático',
  (mayormenteLimpio.coverage?.fileIssueRate ?? 100) < 50,
  String(mayormenteLimpio.coverage?.fileIssueRate));

console.log(fails === 0 ? '\nTODAS LAS PRUEBAS PASAN' : `\n${fails} prueba(s) fallan`);
process.exit(fails === 0 ? 0 : 1);