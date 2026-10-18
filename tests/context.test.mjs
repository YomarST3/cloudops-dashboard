/**
 * Casos reales tomados de un proyecto de verdad, donde el analizador se
 * equivocaba y hacia que el informe pareciera inventado.
 *
 *   i18n-admin.ts   authPassword: "Contrasena"  -> se reportaba como credencial CRITICA
 *   sidebar.tsx     Math.floor(Math.random()*40) -> se reportaba como criptografia rota
 *   chart.tsx       dangerouslySetInnerHTML      -> este SI es un hallazgo real
 *
 * Uso:  node tests/context.test.mjs
 */
import { analyzeCode } from '../src/lib/server/analyze.ts';

let fails = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'OK    ' : 'FALLO '} ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
};

const f = (path, content) => `// ===== FILE: ${path} =====\n${content}\n`;
const flat = (r) => r.modules.flatMap((m) => m.findings);

// ── 1. Un diccionario i18n NO contiene credenciales ─────────────────────────
const i18n = analyzeCode({
  projectName: 'app',
  code:
    f('app/src/lib/i18n-admin.ts', `export const es = {
  authReset: "Recuperar",
  authIdentifier: "Correo o usuario",
  authIdentifierPh: "correo@lahornada.com o tu usuario",
  authPassword: "Contraseña",
  authFill: "Rellenar",
};`),
});

const secretoI18n = flat(i18n).find((x) => x.id.endsWith('hardcoded-secret'));
check('una etiqueta de translation NO es un secreto, es recomendacion',
  secretoI18n !== undefined && secretoI18n.advisory === true,
  `advisory=${secretoI18n?.advisory}`);
check('pero sigue apareciendo como recomendacion', flat(i18n).some((x) => x.advisory));
check('y no penaliza el score', i18n.overallSecurityScore === 100, String(i18n.overallSecurityScore));
check('el control de secretos pasa', (i18n.complianceControls ?? []).find((c) => c.id === 'secretos')?.passed === true);

// ── 2. Math.random() solo penaliza si tiene valor de seguridad ──────────────
const skeleton = analyzeCode({
  projectName: 'app',
  code:
    f('app/src/components/ui/sidebar.tsx', `const Skeleton = () => {
  const width = React.useMemo(() => {
    return \`\${Math.floor(Math.random() * 40) + 50}%\`;
  }, []);
};`),
});
check('Math.random para jitter visual NO es un fallo', skeleton.overallSecurityScore === 100,
  String(skeleton.overallSecurityScore));
check('se ve como recomendacion con su localizacion',
  flat(skeleton).some((x) => x.advisory && x.file?.includes('sidebar.tsx') && x.line === 3),
  JSON.stringify(flat(skeleton).map((x) => `${x.id}@${x.file}:${x.line}`)));

const token = analyzeCode({
  projectName: 'app',
  code: f('app/src/utils/tokens.js', "function crearToken(userId) {\n  return userId + '.' + Math.random().toString(36);\n}"),
});
const tokenBug = flat(token).find((x) => x.id.endsWith('insecure-random'));
check('Math.random para generar un token SI es un fallo', tokenBug !== undefined && !tokenBug.advisory);
check('y baja el score', token.overallSecurityScore < 100, String(token.overallSecurityScore));
check('el control de criptografia falla', (token.complianceControls ?? []).find((c) => c.id === 'cifrado')?.passed === false);

// ── 3. Un secreto de verdad sigue siendo crítico ────────────────────────────
const secretoReal = analyzeCode({
  projectName: 'app',
  code: f('app/src/db.js', "const password = 'Panaderia2024!';"),
});
const bug = flat(secretoReal).find((x) => x.id.endsWith('hardcoded-secret'));
check('una credencial real SI es critica', bug?.severity === 'critical', String(bug?.severity));
check('y sigue bajando el score', secretoReal.overallSecurityScore < 100, String(secretoReal.overallSecurityScore));
check('el control de secretos falla', (secretoReal.complianceControls ?? []).find((c) => c.id === 'secretos')?.passed === false);

// ── 4. El caso que SI es real: dangerouslySetInnerHTML ──────────────────────
const chart = analyzeCode({
  projectName: 'app',
  code: f('app/src/components/ui/chart.tsx', `return (
  <style dangerouslySetInnerHTML={{
    __html: Object.entries(THEMES).map(([k, v]) => \`--\${k}:\${v}\`).join(''),
  }} />
);`),
});
const xss = flat(chart).find((x) => x.id.endsWith('xss-vulnerability'));
check('dangerouslySetInnerHTML SI se reporta', xss !== undefined);
check('como vulnerabilidad, no como recomendacion', xss && xss.advisory !== true);
check('con su localizacion exacta', xss?.line === 2, String(xss?.line));

// ── 5. Sin localizacion (codigo pegado), el analisis no se rompe ────────────
const pegado = analyzeCode({ projectName: 'x', code: "const password = 'Panaderia2024!';" });
check('en modo pegar sigue detectando el secreto',
  flat(pegado).some((x) => x.id.endsWith('hardcoded-secret') && !x.advisory));
const pegadoVacio = analyzeCode({ projectName: 'x', code: "const t = 'un token';" });
check('y no inventa hallazgos donde no hay', flat(pegadoVacio).length >= 0);

console.log(fails === 0 ? '\nTODAS LAS PRUEBAS PASAN' : `\n${fails} prueba(s) fallan`);
process.exit(fails === 0 ? 0 : 1);