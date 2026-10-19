/**
 * Los controles de cumplimiento ahora se deciden por CWE, y los hallazgos que
 * la IA no pudo localizar no mueven el score.
 *
 * Los dos bugs que motivation esto, fijados aqui para que no vuelvan:
 *
 * 1. Los controles buscaban hallazgos por ID DE PATRON. Un hallazgo de la IA
 *    tiene un id como `ai-mod0-0-xss`, que el normalize /^mod\d+-/ no toca, asi
 *    que NINGUN hallazgo de la IA podia hacer fallar un control. En un analisis
 *    real eso daba 83% de cumplimiento con tres vulnerabilidades criticas
 *    abiertas, que es una contradiccion Manifesto.
 *
 * 2. Los hallazgos sin archivo contaban en los contadores de severidad. No se
 *    pueden abrir ni comprobar, asi que bajaban la nota por algo que el usuario
 *    no puede revisar.
 *
 * Uso:  node tests/unattributed.test.mjs
 */
import { analyzeCode, applyAiFindings } from '../src/lib/server/analyze.ts';

let fails = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'OK    ' : 'FALLO '} ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
};

const f = (path, content) => `// ===== FILE: ${path} =====\n${content}\n`;

/** Un hallazgo de la IA sin archivo: es el caso que fallaba. */
const aiSinArchivo = (cweId, severity = 'critical') => ({
  id: `ai-mod0-0-${cweId.toLowerCase()}`,
  severity,
  category: 'Access Control',
  title: `IA: ${cweId} sin verificar`,
  description: 'La IA lo detecto pero no dijo en que archivo.',
  recommendation: 'Revisar manualmente.',
  affectedModule: 'app/src',
  cweId,
  source: 'ai',
});

// ── 1. Un hallazgo de la IA SÍ puede hacer fallar un control (bug 1) ────────
// El código base declara autenticación Y una comprobación de autorización, para
// que los seis controles pasen antes de añadir nada. AUTHZ_RE busca palabras
// sueltas: "requireRole" no cuenta, porque \b no casa pegada a otra palabra.
const TARGET_BUENO = [
  'const express = require("express");',
  'const role = "admin";',
  'app.use(loginRequired, auth);',
  'app.get("/perfil", auth, checkPermission(role), (req, res) => res.json({ user: req.user }));',
].join('\n');

const base = analyzeCode({
  projectName: 'app',
  code: [
    f('app/src/auth.js', TARGET_BUENO),
  ].join('\n'),
});

const antes = base.complianceControls ?? [];
check('el proyecto base tiene los 6 controles', antes.length === 6, String(antes.length));
check(
  'y los seis pasan (declara auth y permisos)',
  antes.every((c) => c.passed),
  JSON.stringify(antes.filter((c) => !c.passed).map((c) => c.id))
);

const conIa = applyAiFindings(base, { 'app/src': [aiSinArchivo('CWE-639')] }, TARGET_BUENO);
const despues = conIa.complianceControls ?? [];
const authz = despues.find((c) => c.id === 'autorizacion');

check('un hallazgo de la IA con CWE-639 hace fallar Autorización', authz?.passed === false);
check(
  'el motivo lo explica y dice dónde',
  /dueño del recurso/i.test(authz?.detail ?? '') && /localizable|Detectado/.test(authz?.detail ?? ''),
  authz?.detail
);
check('y el cumplimiento baja', conIa.complianceScore < base.complianceScore,
  `${base.complianceScore}% -> ${conIa.complianceScore}%`);

// Y con el CWE de validación.
const conValidacion = applyAiFindings(base, { 'app/src': [aiSinArchivo('CWE-89')] }, TARGET_BUENO);
check('con CWE-89 falla Validación de entrada',
  conValidacion.complianceControls?.find((c) => c.id === 'validacion')?.passed === false);

// Un CWE que no corresponde a ningun control no debe romper nada.
const conCweRaro = applyAiFindings(base, { 'app/src': [aiSinArchivo('CWE-1104')] }, TARGET_BUENO);
check('un CWE fuera de los seis controles no altera nada',
  conCweRaro.complianceScore === base.complianceScore,
  `${conCweRaro.complianceScore} vs ${base.complianceScore}`);

// Un proyecto SIN señal de autenticacion debe fallar SOLO ese control, no los seis.
const sinAuth = analyzeCode({ projectName: 'app', code: f('app/src/x.js', 'export const n = 1;') });
// Sin senal de codigo fallan solo Autenticacion y Autorizacion, no los seis:
// la senal de texto solo aplica a esos dos controles.
check(
  'sin senal de codigo fallan solo Autenticacion y Autorizacion',
  JSON.stringify((sinAuth.complianceControls ?? []).filter((c) => !c.passed).map((c) => c.id).sort()) ===
    JSON.stringify(['autenticacion', 'autorizacion']),
  JSON.stringify((sinAuth.complianceControls ?? []).filter((c) => !c.passed).map((c) => c.id))
);

// --- 5. no-auth-check estaba invertido -----------------------------------------
// Comprobado con casos reales: marcaba como vulnerabilidad ALTA una ruta que SI
// tiene autenticacion, y no decia nada de una que no la tiene. Un regex no puede
// saber si una ruta esta autenticada: el middleware puede aplicarse con app.use()
// en otro sitio, con un router o a traves de un helper. Por eso es una
// recomendacion y no una vulnerabilidad.
const conAuth = analyzeCode({
  projectName: 'app',
  code: f('app/server.js', [
    "const express = require('express');",
    'const app = express();',
    "app.get('/perfil', auth, (req, res) => res.json({ user: req.user }));",
  ].join('\n')),
});
const conAuthHit = conAuth.modules.flatMap((m) => m.findings).find((x) => x.id.endsWith('no-auth-check'));
check('una ruta CON autenticacion no se marca como vulnerabilidad',
  conAuthHit === undefined || conAuthHit.advisory === true,
  conAuthHit ? `advisory=${conAuthHit.advisory}` : 'no detectado');
check('y no rompe el control de Autenticacion',
  conAuth.complianceControls?.find((c) => c.id === 'autenticacion')?.passed === true);

// ── 2. Sin archivo: no mueven score ni contadores (bug 2) ───────────────────
const limpio = analyzeCode({
  projectName: 'app',
  code: f('app/src/a.js', 'export const ok = 1;'),
});
check('el proyecto limpio no tiene nada', limpio.totalFindings === 0 && limpio.coverage?.vulnerabilityFileRate === 0);

const conSinArchivo = applyAiFindings(limpio, { 'app/src': [aiSinArchivo('CWE-862')] }, 'export const ok = 1;');

check('un hallazgo sin archivo NO cuenta en totalFindings',
  conSinArchivo.totalFindings === 0, String(conSinArchivo.totalFindings));
check('ni en el score',
  conSinArchivo.overallSecurityScore === limpio.overallSecurityScore,
  `${limpio.overallSecurityScore} -> ${conSinArchivo.overallSecurityScore}`);
check('ni en el titular de archivos afectados',
  conSinArchivo.coverage?.vulnerabilityFileRate === 0,
  `${conSinArchivo.coverage?.vulnerabilityFileRate}%`);
check('ni en los contadores de severidad',
  conSinArchivo.criticalFindings === 0 && conSinArchivo.highFindings === 0);
check('pero SI se contabiliza aparte',
  conSinArchivo.coverage?.unattributedFindings === 1,
  String(conSinArchivo.coverage?.unattributedFindings));
check('y se expone su detalle para poder mostrarlos',
  (conSinArchivo.unattributedFindingsDetail?.length ?? 0) === 1,
  String(conSinArchivo.unattributedFindingsDetail?.length));
check('Y a pesar de eso puede hacer fallar un control',
  conSinArchivo.complianceControls?.find((c) => c.id === 'autorizacion')?.passed === false);

// ── 3. Con archivo: sí cuenta, como siempre ─────────────────────────────────
const conArchivo = applyAiFindings(
  limpio,
  {
    'app/src': [
      {
        ...aiSinArchivo('CWE-862'),
        file: 'app/src/a.js',
        line: 3,
      },
    ],
  },
  'export const ok = 1;'
);
check('con archivo y línea sí cuenta en totalFindings',
  conArchivo.totalFindings === 1, String(conArchivo.totalFindings));
check('y baja el score', conArchivo.overallSecurityScore < limpio.overallSecurityScore);
check('y aparece en el titular de archivos',
  conArchivo.coverage?.filesWithVulnerabilities === 1,
  `${conArchivo.coverage?.vulnerabilityFileRate}%`);
check('y ya no queda como sin localizar',
  conArchivo.coverage?.unattributedFindings === 0);

// ── 4. Lo verificable manda sobre lo no verificable ─────────────────────────
const ambos = applyAiFindings(
  limpio,
  {
    'app/src': [
      { ...aiSinArchivo('CWE-89', 'high'), file: 'app/src/a.js', line: 2 },
      aiSinArchivo('CWE-862'),
    ],
  },
  'export const ok = 1;'
);
check('con 1 verificable y 1 sin localizar, el titular cuenta solo el verificable',
  ambos.coverage?.filesWithVulnerabilities === 1 && ambos.totalFindings === 1,
  `vulns=${ambos.totalFindings} sinLocalizar=${ambos.coverage?.unattributedFindings}`);
// Este proyecto no declara autenticación, así que ese control falla legítimamente.
// Fallan tres: autenticacion (por señal), autorizacion y validacion (por la IA).
check(
  'los controles tienen en cuenta los dos hallazgos de la IA',
  ['autorizacion', 'validacion'].every((id) =>
    (ambos.complianceControls ?? []).some((c) => c.id === id && !c.passed)
  ),
  JSON.stringify((ambos.complianceControls ?? []).filter((c) => !c.passed).map((c) => c.id))
);

console.log(fails === 0 ? '\nTODAS LAS PRUEBAS PASAN' : `\n${fails} prueba(s) fallan`);
process.exit(fails === 0 ? 0 : 1);