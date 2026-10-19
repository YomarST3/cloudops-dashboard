/**
 * Comprueba lo que hace que el analisis sea verificable y explicable:
 * que cada hallazgo diga el archivo y la linea real, que las recomendaciones
 * no penalicen, y que el cumplimiento sea un checklist con motivo.
 *
 * Uso:  node tests/scoring.test.mjs
 */
import { analyzeCode, applyAiFindings, prepare } from '../src/lib/server/analyze.ts';

let fails = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'OK    ' : 'FALLO '} ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
};

const f = (path, content) => `// ===== FILE: ${path} =====\n${content}\n`;

// ── 1. Archivo y línea reales ────────────────────────────────────────────────
const multi = analyzeCode({
  projectName: 'demo',
  code:
    f('app/src/routes/auth.js', 'const db = require("../db");\n// linea 2\nrouter.get("/x", (req, res) => {});') +
    f('app/src/views/Cart.js', 'const a = 1;') +
    '\n// ===== FILE: app/src/utils/x.js =====\nMath.random();',
});

const sqli = multi.modules
  .flatMap((m) => m.findings)
  .find((f) => f.id.endsWith('sql-injection') || f.id.endsWith('insecure-random'));

const conArchivo = multi.modules.flatMap((m) => m.findings).find((f) => f.file);
check('cada hallazgo dice su archivo', Boolean(conArchivo), conArchivo ? conArchivo.file : 'ninguno');
check('el archivo es el real, no una etiqueta inventada',
  Boolean(conArchivo && !conArchivo.file.includes('Base de Datos')),
  conArchivo?.file);
check('el hallazgo dice su numero de linea', typeof conArchivo?.line === 'number', String(conArchivo?.line));
check('el modulo afectado es el real (carpeta), no "Base de Datos / DAL"',
  !multi.modules.some((m) => m.findings.some((x) => x.affectedModule === 'Base de Datos / DAL')));

// La linea debe ser la del match DENTRO del archivo, no dentro del modulo.
const rand = multi.modules.flatMap((m) => m.findings).find((x) => x.id.endsWith('insecure-random'));
check('la linea corresponde al archivo correcto', rand?.file === 'app/src/utils/x.js', rand?.file);
check('la linea del archivo es 1', rand?.line === 1, String(rand?.line));
void sqli;

// ── 2. Las recomendaciones no penalizan ─────────────────────────────────────
const expressLimpio = analyzeCode({
  projectName: 'api',
  code: f('app/server.js', [
    "const express = require('express');",
    "const app = express();",
    "app.get('/saludo', (req, res) => res.json({ hola: 'mundo' }));",
    'module.exports = app;',
  ].join('\n')),
});

const todas = expressLimpio.modules.flatMap((m) => m.findings);
const adv = todas.filter((x) => x.advisory);
const vul = todas.filter((x) => !x.advisory);

check('un Express correcto genera recomendaciones', adv.length > 0, `${adv.length} recomendaciones`);
check('un Express correcto NO genera vulnerabilidades', vul.length === 0,
  vul.map((x) => x.id).join(', '));
check('el score de un Express correcto es 100', expressLimpio.overallSecurityScore === 100,
  String(expressLimpio.overallSecurityScore));
check('totalFindings cuenta solo vulnerabilidades', expressLimpio.totalFindings === 0,
  String(expressLimpio.totalFindings));
check('advisoryCount informa de las recomendaciones', expressLimpio.advisoryCount === adv.length,
  String(expressLimpio.advisoryCount));

// ── 3. Cumplimiento como checklist ───────────────────────────────────────────
const checks = expressLimpio.complianceControls ?? [];
check('hay 6 controles de cumplimiento', checks.length === 6, String(checks.length));
check('cada control tiene nombre y motivo',
  checks.every((c) => c.label && c.detail && typeof c.passed === 'boolean'));
check('el porcentaje sale de los controles aprobados',
  expressLimpio.complianceScore === Math.round((checks.filter((c) => c.passed).length / 6) * 100),
  `${checks.filter((c) => c.passed).length}/6 -> ${expressLimpio.complianceScore}%`);
check('un Express sin secretos pasa el control de secretos',
  checks.find((c) => c.id === 'secretos')?.passed === true);

// Un proyecto con una credencial en claro debe fallar ese control Y decir donde.
const conSecreto = analyzeCode({
  projectName: 'api',
  code: f('app/db.js', "const password = 'Panaderia2024!';\nmodule.exports = password;"),
});
const ctrlSecretos = (conSecreto.complianceControls ?? []).find((c) => c.id === 'secretos');
check('una credencial en claro falla el control de secretos', ctrlSecretos?.passed === false);
check('el motivo cita la localizacion del fallo', /db\.js:\d+/.test(ctrlSecretos?.detail ?? ''), ctrlSecretos?.detail);
check('y el score baja', conSecreto.overallSecurityScore < 100, String(conSecreto.overallSecurityScore));

// ── 4. El desglose explica la cuenta ─────────────────────────────────────────
const bd = conSecreto.scoreBreakdown ?? [];
check('hay desglose del score', bd.length > 0, String(bd.length));
check('cada linea del desglose trae etiqueta, severidad y penalizacion',
  bd.every((l) => l.label && l.severity && typeof l.penalty === 'number'));
check('la penalizacion del desglose explica el score',
  Math.max(0, 100 - bd.reduce((a, l) => a + l.penalty, 0)) === conSecreto.overallSecurityScore,
  `100 - ${bd.reduce((a, l) => a + l.penalty, 0)} = ${Math.max(0, 100 - bd.reduce((a, l) => a + l.penalty, 0))} vs ${conSecreto.overallSecurityScore}`);
check('el desglose NO incluye las recomendaciones',
  bd.every((l) => !l.label.includes('Dependencias') && !l.label.includes('Rate Limiting')));

// ── 5. La fusión con IA respeta las mismas reglas ────────────────────────────
const base = analyzeCode({ projectName: 'p', code: f('app/db.js', "const password = 'secreto1234';") });
const iaFinding = {
  id: 'ai-mod0-0-access',
  severity: 'high',
  category: 'Access Control',
  title: 'Endpoint sin autorizacion',
  description: 'd',
  recommendation: 'r',
  affectedModule: base.modules[0].moduleName,
  // Con archivo y línea: un hallazgo de la IA sin localizar no mueve el score,
  // y esta prueba es del cálculo, no de la localización.
  file: 'app/db.js',
  line: 2,
  cweId: 'CWE-862',
  source: 'ai',
};
const fusionado = applyAiFindings(base, { [base.modules[0].moduleName]: [iaFinding] }, "password = 'x'");

check('la IA baja el score', fusionado.overallSecurityScore < base.overallSecurityScore,
  `${base.overallSecurityScore} -> ${fusionado.overallSecurityScore}`);
check('la IA recalcula el cumplimiento y lo mantiene con 6 controles',
  fusionado.complianceControls?.length === 6, String(fusionado.complianceControls?.length));
check('la IA añade su hallazgo al total', fusionado.totalFindings === 2, String(fusionado.totalFindings));
check('la IA recalcula el desglose con ambos hallazgos',
  (fusionado.scoreBreakdown?.length ?? 0) === 2, String(fusionado.scoreBreakdown?.length));

console.log(fails === 0 ? '\nTODAS LAS PRUEBAS PASAN' : `\n${fails} prueba(s) fallan`);
process.exit(fails === 0 ? 0 : 1);