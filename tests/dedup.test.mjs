// Que las cifras de un proyecto cuadren entre si.
//
// Antes cada figura usaba un criterio distinto: el score y el titular
// deduplicaban por patron SOLO, mientras que el desglose y la tabla por
// lenguaje sumaban los hallazgos crudos. Con un patron repetido en dos
// archivos salian tres problemas a la vez:
//
//   1. El titular decia 3 vulnerabilidades y la tabla por lenguaje 4.
//   2. La suma "100 - 25 - 15" del desglose no coincidia con el score mostrado.
//   3. PEOR: si la primera aparicion del patron era una recomendacion, se
//      tiraba el hallazgo REAL de la segunda. Un proyecto con una credencial
//      hardcodeada salia con 100/100 y "0 vulnerabilidades".
//
// Este test fija que las cuatro cifras salen del mismo calculo.

import { analyzeCode, applyAiFindings } from '../src/lib/server/analyze.ts';

let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK    ' : 'FALLO '} ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) fails += 1;
};

const f = (path, body) => `// ===== FILE: ${path} =====\n${body}`;
const sumaRestas = (r) => (r.scoreBreakdown ?? []).reduce((a, l) => a + l.penalty, 0);
const vulnerabilidadesPorLenguaje = (r) =>
  (r.coverage?.perLanguage ?? []).reduce((a, l) => a + l.vulnerabilities, 0);

// Dos credenciales que el contexto deja como vulnerabilidad REAL (no como
// recomendacion), en carpetas distintas para que sean dos modulos.
const REAL_1 = 'secreto1234';
const REAL_2 = 'mipassword123';
// Esta si se degrada a recomendacion: parece una frase, no un secreto.
const RECOMENDACION = 'otraClaveIgualDeMala';

// ── 1. El mismo patron en dos archivos: cuenta dos veces, con tope ────────────
const dosArchivos = analyzeCode({
  projectName: 'p',
  code: [
    f('src/a.js', `const password = "${REAL_1}";`),
    f('lib/b.js', `const password = "${REAL_2}";\nconst q = require("x");`),
  ].join('\n'),
});

check('el mismo patron en dos archivos son DOS vulnerabilidades',
  dosArchivos.totalFindings === 2, String(dosArchivos.totalFindings));
check('y los DOS archivos cuentan como afectados',
  dosArchivos.coverage.filesWithVulnerabilities === 2,
  String(dosArchivos.coverage.filesWithVulnerabilities));

// La primera aparicion resta 50 (critico); la repeticion, 5.
check('el score aplica la penalidad completa una sola vez (50 + 5)',
  dosArchivos.overallSecurityScore === 45,
  `score=${dosArchivos.overallSecurityScore} restas=${sumaRestas(dosArchivos)}`);

check('la tabla por lenguaje suma lo MISMO que el titular',
  vulnerabilidadesPorLenguaje(dosArchivos) === dosArchivos.totalFindings,
  `lenguajes=${vulnerabilidadesPorLenguaje(dosArchivos)} titular=${dosArchivos.totalFindings}`);

check('el desglose suma exactamente lo que se resta',
  100 - sumaRestas(dosArchivos) === dosArchivos.overallSecurityScore,
  `100 - ${sumaRestas(dosArchivos)} = ${dosArchivos.overallSecurityScore}`);

check('los contadores de severidad cuadran con el titular',
  dosArchivos.criticalFindings + dosArchivos.highFindings +
    dosArchivos.mediumFindings + dosArchivos.lowFindings === dosArchivos.totalFindings,
  `${dosArchivos.criticalFindings}+${dosArchivos.highFindings}+${dosArchivos.mediumFindings}+${dosArchivos.lowFindings}`);

check('la repeticion se explica en su linea del desglose',
  (dosArchivos.scoreBreakdown ?? []).some((l) => l.penalty === 5 && /repeticion/i.test(l.label)));

// ── 2. La recomendacion NO puede tapar el hallazgo real ──────────────────────
// Mismo patron en dos archivos, pero el segundo se degrada a recomendacion.
// Con el dedup viejo, si la recomendacion llegaba primero, el critico real se
// tiraba y el proyecto salia 100/100 con 0 vulnerabilidades.
const mezcla = analyzeCode({
  projectName: 'p',
  code: [
    f('src/a.js', `const password = "${RECOMENDACION}";`),
    f('lib/b.js', `const password = "${REAL_1}";`),
  ].join('\n'),
});
check('la recomendacion no tapa el hallazgo real de otro archivo',
  mezcla.totalFindings === 1 && mezcla.overallSecurityScore === 50,
  `total=${mezcla.totalFindings} score=${mezcla.overallSecurityScore}`);
check('y esa recomendacion sigue contando como tal, no desaparece',
  mezcla.advisoryCount >= 1, String(mezcla.advisoryCount));

// ── 3. Las repeticiones no hunden el score ───────────────────────────────────
const cinco = [1, 2, 3, 4, 5]
  .map((i) => f(`src/archivo${i}.js`, `const password = "${REAL_1}";`))
  .join('\n');
const muchas = analyzeCode({ projectName: 'p', code: cinco });
check('cinco archivos con el mismo critico dan 50 + 4x5 = 70, no 0',
  muchas.overallSecurityScore === 30,
  `score=${muchas.overallSecurityScore} restas=${sumaRestas(muchas)}`);
check('y siguen contando cinco archivos afectados',
  muchas.coverage.filesWithVulnerabilities === 5,
  String(muchas.coverage.filesWithVulnerabilities));

// ── 4. El mismo archivo no cuenta dos veces ──────────────────────────────────
const unArchivo = analyzeCode({
  projectName: 'p',
  code: f('src/a.js', `const password = "${REAL_1}";\nconst other = "${REAL_2}";`),
});
check('dos secretos en el MISMO archivo cuentan una sola vez',
  (unArchivo.scoreBreakdown ?? []).filter((l) => /Credenciales/i.test(l.label)).length === 1,
  String((unArchivo.scoreBreakdown ?? []).filter((l) => /Credenciales/i.test(l.label)).length));

// ── 5. La fusion con IA mantiene las mismas garantias ────────────────────────
const conIa = applyAiFindings(
  dosArchivos,
  {
    [dosArchivos.modules[0].moduleName]: [
      {
        id: 'ai-mod0-0-authz',
        severity: 'high',
        category: 'Access Control',
        title: 'IDOR en el endpoint de perfil',
        description: 'd',
        recommendation: 'r',
        affectedModule: dosArchivos.modules[0].moduleName,
        file: 'src/a.js',
        line: 3,
        cweId: 'CWE-639',
        source: 'ai',
      },
    ],
  },
  'app.use(auth);'
);

check('tras fusionar la IA, el desglose sigue sumando lo que se resta',
  100 - sumaRestas(conIa) === conIa.overallSecurityScore,
  `100 - ${sumaRestas(conIa)} = ${conIa.overallSecurityScore}`);
check('y la tabla por lenguaje sigue cuadrando con el titular',
  vulnerabilidadesPorLenguaje(conIa) === conIa.totalFindings,
  `lenguajes=${vulnerabilidadesPorLenguaje(conIa)} titular=${conIa.totalFindings}`);
check('el hallazgo de la IA cuenta con su archivo y linea',
  conIa.totalFindings === dosArchivos.totalFindings + 1,
  `${conIa.totalFindings} vs ${dosArchivos.totalFindings}`);

console.log('');
console.log(fails === 0 ? 'TODAS LAS PRUEBAS PASAN' : `${fails} prueba(s) fallan`);
process.exit(fails === 0 ? 0 : 1);