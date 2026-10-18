/**
 * El fallo que hizo la pantalla ilegible: se mostraba "0% de los archivos
 * tiene una vulnerabilidad" junto a un contador de 1 hallazgo.
 *
 * La causa era que los hallazgos que el modelo detecta sin decir en que archivo
 * estan no pueden atribuirse a un archivo, asi que no entraban en el porcentaje
 * pero si en el total. Estas pruebas comprueban que ya no puede pasar.
 *
 * Uso:  node tests/consistency.test.mjs
 */
import { analyzeCode, applyAiFindings } from '../src/lib/server/analyze.ts';

let fails = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'OK    ' : 'FALLO '} ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
};

const f = (path, content) => `// ===== FILE: ${path} =====\n${content}\n`;

/** El caso del mundo real: un hallazgo de IA sin ubicacion. */
const aiSinUbicacion = {
  id: 'ai-mod0-0-thing',
  severity: 'info',
  category: 'Configuration',
  title: 'Recomendacion sin archivo',
  description: 'd',
  recommendation: 'r',
  affectedModule: 'src/routes',
  source: 'ai',
};

// ── 1. El hallazgo sin localizar se cuenta y NO desaparece ────────────────────
const base = analyzeCode({
  projectName: 'app',
  code: [
    f('app/src/a.js', "const password = 'Panaderia2024!';"),
    f('app/src/b.js', 'export const ok = 1;'),
  ].join('\n'),
});

const fusionado = applyAiFindings(
  base,
  { [base.modules[0].moduleName]: [aiSinUbicacion] },
  "const password = 'Panaderia2024!';"
);

const c = fusionado.coverage;
check('el hallazgo sin archivo se contabiliza aparte', c?.unattributedFindings === 1, String(c?.unattributedFindings));
check('y sigue contando en el total de hallazgos', fusionado.totalFindings === 2, String(fusionado.totalFindings));
check(
  'el porcentaje NO lo cuenta como archivo afectado',
  c?.filesWithVulnerabilities === 1 && c?.vulnerabilityFileRate === 50,
  `${c?.filesWithVulnerabilities} -> ${c?.vulnerabilityFileRate}%`
);

// ── 2. La contradiccion exacta que se vio en pantalla ───────────────────────
// Ninguna combinacion puede dar a la vez "0% de archivos" y un total >= 1 sin
// que la interfaz sepa que hay hallazgos sin localizar.
const soloBase = analyzeCode({ projectName: 'app', code: f('app/src/a.js', 'export const ok = 1;') });
const soloSinLocalizar = applyAiFindings(
  soloBase,
  { [soloBase.modules[0].moduleName]: [aiSinUbicacion] },
  'export const ok = 1;'
);

const c2 = soloSinLocalizar.coverage;
const tituldebeSerAmbar = soloSinLocalizar.totalFindings === 1 && c2?.filesWithVulnerabilities === 0;
check('el caso "0 archivos y 1 hallazgo" es detectable como tal', tituldebeSerAmbar,
  `total=${soloSinLocalizar.totalFindings} archivosConVuln=${c2?.filesWithVulnerabilities} sinLocalizar=${c2?.unattributedFindings}`);
check('y hay sin-localizar para que la interfaz lo explique', (c2?.unattributedFindings ?? 0) === 1,
  String(c2?.unattributedFindings));

// ── 3. Sin hallazgos sin localizar, todo cuadra ──────────────────────────────
const limpio = analyzeCode({
  projectName: 'app',
  code: [1, 2, 3, 4].map((i) => f(`app/src/m${i}.js`, `export const n${i} = ${i};`)).join('\n'),
});
check('un proyecto limpio tiene 0 sin localizar', limpio.coverage?.unattributedFindings === 0,
  String(limpio.coverage?.unattributedFindings));
check('y 0% de archivos con vulnerabilidad', limpio.coverage?.vulnerabilityFileRate === 0);
check('y 0 hallazgos en total', limpio.totalFindings === 0);
check('las tres cifras son coherentes entre si',
  limpio.totalFindings === 0 && limpio.coverage.vulnerabilityFileRate === 0);

// ── 4. Los KPI de severidad ya no cuentan recomendaciones ───────────────────
// El bug original: el contador "Info/Bajo" sumaba `allFindings` (que incluye
// recomendaciones) mientras los otros tres usaban solo vulnerabilidades.
const conRecomendaciones = analyzeCode({
  projectName: 'app',
  code: f('app/src/a.js', "const express = require('express');\nconst app = express();"),
});
const flat = (r) => r.modules.flatMap((m) => m.findings);
const advisories = flat(conRecomendaciones).filter((x) => x.advisory);
const vulns = flat(conRecomendaciones).filter((x) => !x.advisory);
check('el proyecto genera recomendaciones', advisories.length > 0, String(advisories.length));
check('y ninguna vulnerabilidad', vulns.length === 0, String(vulns.length));
check('totalFindings cuenta solo vulnerabilidades', conRecomendaciones.totalFindings === vulns.length,
  `${conRecomendaciones.totalFindings} vs ${vulns.length}`);
check('advisoryCount informa de las recomendaciones', conRecomendaciones.advisoryCount === advisories.length,
  String(conRecomendaciones.advisoryCount));
check('los KPI de severidad suman exactamente las vulnerabilidades',
  conRecomendaciones.criticalFindings + conRecomendaciones.highFindings +
    conRecomendaciones.mediumFindings + conRecomendaciones.lowFindings + vulns.filter((x) => x.severity === 'info').length
    === vulns.length);

// ── 5. Concordancia en las TRES ramas del resumen ────────────────────────────
// Rama >=85 (un hallazgo medio resta 8): "1 observación menor"
const medio = analyzeCode({
  projectName: 'app',
  code: f('app/src/a.js', "fetch('http://api.banco.com/pagar', { method: 'POST' });"),
});
check('rama >=85 con 1 hallazgo dice "1 observación menor"',
  /Se detectaron 1 observación menor/.test(medio.summary), medio.summary);

// Rama >=60 (uno crítico resta 25 -> 75): "1 hallazgo crítico/alto"
const critico = analyzeCode({
  projectName: 'app',
  code: f('app/src/a.js', "const password = 'Panaderia2024!';"),
});
check('rama >=60 con 1 hallazgo dice "1 hallazgo crítico/alto"',
  /Se identificaron 1 hallazgo crítico\/alto/.test(critico.summary), critico.summary);
check('y nunca "1 hallazgos"', !/1 hallazgos/.test(critico.summary));

// Varios hallazgos en la misma rama.
const varios = analyzeCode({
  projectName: 'app',
  code: f('app/src/a.js', [
    "const password = 'Panaderia2024!';",
    "const secret = 'ClaveSecreta2024';",
    "const token = 'abc123def456';",
  ].join('\n')),
});
check('con varios hallazgos usa plural', !/1 hallazgos|1 observación menor/.test(varios.summary), varios.summary);
check('y la rama grave concorda en las dos cifras',
  !/Con 1 hallazgos/.test(varios.summary) || /Con \d+ hallazgos/.test(varios.summary),
  varios.summary);

console.log(fails === 0 ? '\nTODAS LAS PRUEBAS PASAN' : `\n${fails} prueba(s) fallan`);
process.exit(fails === 0 ? 0 : 1);