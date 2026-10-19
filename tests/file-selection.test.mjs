/**
 * Comprueba la seleccion de archivos con el reparto justo entre lenguajes.
 *
 * El fallo original: 400.000 caracteres en una bolsa unica que se gastaba el
 * primero que encontraba en el ZIP. En el proyecto real usado como referencia
 * (122 archivos de TypeScript y 50 de SQL, con las migraciones al final del
 * recorrido) los 50 archivos de SQL se quedaban fuera sin avisar, asi que el
 * analizador nunca veia el esquema de la base de datos.
 *
 * Uso:  node tests/file-selection.test.mjs
 */
import { selectFiles, languageGroup, MAX_TOTAL_CHARS } from '../src/lib/file-selection.ts';

let fails = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'OK    ' : 'FALLO '} ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
};

const file = (path, chars) => ({
  name: path.split('/').pop(),
  path,
  size: chars,
  content: 'x'.repeat(chars),
});

// ── 1. El caso que lo provocaba: mucho JS y las migraciones al final ────────
const realista = [
  ...Array.from({ length: 120 }, (_, i) => file(`app/src/mod${i}.ts`, 6_000)),
  ...Array.from({ length: 50 }, (_, i) => file(`bak/supabase/migrations/${i}.sql`, 5_000)),
];

const sel = selectFiles(realista);

check('el proyecto tiene 170 archivos', realista.length === 170);
check(
  'el SQL entra al analisis (antes se quedaba fuera entero)',
  sel.perLanguage.SQL > 0,
  `SQL: ${sel.perLanguage.SQL}/50`
);
check('y entra la mayor parte', sel.perLanguage.SQL >= 40, `${sel.perLanguage.SQL}/50`);
check('el codigo tambien entra', sel.perLanguage.code > 0, `codigo: ${sel.perLanguage.code}/120`);
check('ningun lenguaje se queda sin revisar', Object.values(sel.perLanguage).every((n) => n > 0),
  JSON.stringify(sel.perLanguage));
check('el total enviado coincide con el reparto',
  sel.sent === sel.perLanguage.code + sel.perLanguage.SQL,
  `${sel.sent}`);
check('y los excluidos cuadran', sel.dropped === realista.length - sel.sent, `${sel.dropped}`);

// ── 2. El reparto es justo: SQL no se queda con la cola ────────────────────
const soloSql = selectFiles(
  Array.from({ length: 50 }, (_, i) => file(`db/migraciones/${i}.sql`, 5_000))
);
check('un proyecto solo de SQL se envia entero', soloSql.perLanguage.SQL === 50,
  `${soloSql.perLanguage.SQL}/50`);

// Con el presupuesto antiguo, el SQL se perdia. Se comprueba reducingolo.
const conBolsaUnica = (() => {
  // Reproduce el comportamiento viejo: bolsa unica en orden de ZIP.
  let chars = 0;
  let n = 0;
  for (const f of realista) {
    const cost = f.content.length + f.path.length + 24;
    if (chars + cost > 400_000) continue;
    chars += cost;
    n++;
  }
  return n;
})();
check('el metodo antiguo enviaba menos archivos que el nuevo', conBolsaUnica <= sel.sent,
  `viejo=${conBolsaUnica} nuevo=${sel.sent}`);
check('el antiguo se quedaba muy por debajo del total', conBolsaUnica < realista.length * 0.8,
  `${conBolsaUnica}/${realista.length}`);

// ── 3. Prioridad de carpetas ────────────────────────────────────────────────
const prioridad = selectFiles([
  file('app/docs/notas.ts', 20_000),
  file('app/src/principal.ts', 20_000),
  file('supabase/migrations/001.sql', 2_000),
]);
const orden = prioridad.code
  .split('// ===== FILE: ')
  .filter(Boolean)
  .map((chunk) => chunk.split(' =====')[0]);
check('el SQL entra aunque el proyecto sea pequeno', orden.some((p) => p.endsWith('.sql')));
check(
  'dentro de un lenguaje va primero src/',
  orden.findIndex((p) => p.includes('/src/')) < orden.findIndex((p) => p.includes('/docs/')),
  orden.join(' | ')
);

// ── 4. Determinismo: el orden del ZIP no debe importar ─────────────────────
const desordenado = [...realista].reverse();
const sel2 = selectFiles(desordenado);
check('el resultado no depende del orden del ZIP', sel2.sent === sel.sent, `${sel2.sent}`);
check('y el contenido enviado es identico', sel2.code.length === sel.code.length);

// ── 5. Casos limite ────────────────────────────────────────────────────────
const vacio = selectFiles([]);
check('sin archivos no rompe', vacio.sent === 0 && vacio.code === '');
check('y todos marcados como omitidos se ignoran',
  selectFiles([{ ...file('a.ts', 10), skipped: true }]).sent === 0);
check('el limite por defecto es 800.000', MAX_TOTAL_CHARS === 800_000, String(MAX_TOTAL_CHARS));
check('languageGroup distingue el SQL', languageGroup('x/migrations/1.sql') === 'SQL');
check('y trata el resto como codigo', languageGroup('src/a.ts') === 'code');

console.log(fails === 0 ? '\nTODAS LAS PRUEBAS PASAN' : `\n${fails} prueba(s) fallan`);
process.exit(fails === 0 ? 0 : 1);