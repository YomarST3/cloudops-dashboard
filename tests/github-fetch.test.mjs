/**
 * Comprueba la validacion de URLs de GitHub y la extraccion de archivos del
 * zipball.
 *
 * Lo importante aqui son dos cosas que no se ven a simple vista:
 *  1. Que solo se acepten URLs del tipo github.com/owner/repo: si se colara una
 *     subruta o un host ajeno, el `fetch` del servidor seria un SSRF.
 *  2. Que se quite la carpeta raiz que mete GitHub al empaquetar (`owner-repo-sha/`)
 *     y que se ignoren node_modules/dist/...: sin eso, las rutas del informe no
 *     coinciden con las del proyecto y no se puede citar `archivo:linea`.
 *
 * Uso:  node tests/github-fetch.test.mjs
 */
import JSZip from 'jszip';
import { parseGitHubUrl, isIgnoredPath, extractCodeFiles, CODE_EXTENSIONS } from '../api/github-fetch.ts';

let fails = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'OK    ' : 'FALLO '} ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
};

// ── 1. parseGitHubUrl: solo la forma exacta ─────────────────────────────────
check('acepta una URL normal', !!parseGitHubUrl('https://github.com/facebook/react'));
check('acepta con .git al final', parseGitHubUrl('https://github.com/facebook/react.git')?.repo === 'react');
check('acepta con barra final',
  parseGitHubUrl('https://github.com/facebook/react/')?.repo === 'react');

const conSubruta = parseGitHubUrl('https://github.com/facebook/react/tree/main/packages');
check('rechaza subrutas (antes serian una descarga arbitraria)', conSubruta === null);

const hostAjeno = parseGitHubUrl('https://evil.com/facebook/react');
check('rechaza hosts que no son github.com', hostAjeno === null);

const sinRepo = parseGitHubUrl('https://github.com/facebook');
check('rechaza una URL sin repositorio', sinRepo === null);

check('rechaza texto que no es URL', parseGitHubUrl('facebook/react') === null);
check('rechaza query string pegada', parseGitHubUrl('https://github.com/a/b?x=1') === null);

// ── 2. isIgnoredPath ────────────────────────────────────────────────────────
check('ignora node_modules', isIgnoredPath('node_modules/react/index.js'));
check('ignora dist', isIgnoredPath('dist/bundle.js'));
check('ignora .git', isIgnoredPath('.git/config'));
check('no ignora el codigo real', !isIgnoredPath('src/app/main.ts'));

// ── 3. extractCodeFiles: quita la raiz y filtra ─────────────────────────────
const zip = new JSZip();
zip.file('repo-abc123/src/index.ts', 'export const a = 1;');
zip.file('repo-abc123/src/util.js', 'module.exports = {};');
zip.file('repo-abc123/node_modules/dep/index.js', 'ignored');
zip.file('repo-abc123/dist/bundle.js', 'ignored');
zip.file('repo-abc123/README.md', 'no es codigo');
zip.file('repo-abc123/schema.sql', 'CREATE TABLE t (id int);');

const zipData = await zip.generateAsync({ type: 'arraybuffer' });
const { files, skipped } = await extractCodeFiles(zipData);

const paths = files.map((f) => f.path).sort();
check('extrae solo archivos de codigo',
  paths.join(',') === 'schema.sql,src/index.ts,src/util.js',
  paths.join(','));
check('quita la carpeta raiz del zipball',
  files.every((f) => !f.path.startsWith('repo-abc123/')),
  paths.join(','));
check('incluye el SQL', files.some((f) => f.path === 'schema.sql'));
check('el contenido sobrevive',
  files.find((f) => f.path === 'src/index.ts')?.content === 'export const a = 1;');
check('cuenta los omitidos', skipped >= 3, String(skipped));
check('el orden es estable (por ruta)',
  files.map((f) => f.path).join(',') === [...paths].join(','));

// ── 4. Un zip sin codigo no rompe ───────────────────────────────────────────
const zipVacio = new JSZip();
zipVacio.file('repo-x/README.md', 'hola');
zipVacio.file('repo-x/LICENSE', 'MIT');
const vacio = await extractCodeFiles(await zipVacio.generateAsync({ type: 'arraybuffer' }));
check('un repo sin codigo devuelve lista vacia', vacio.files.length === 0);
check('y todo queda contado como omitido', vacio.skipped === 2, String(vacio.skipped));

// ── 5. CODE_EXTENSIONS coherente ────────────────────────────────────────────
check('incluye las extensiones clave',
  ['ts', 'tsx', 'js', 'py', 'sql', 'go'].every((e) => CODE_EXTENSIONS.has(e)));

console.log(fails === 0 ? '\nTODAS LAS PRUEBAS PASAN' : `\n${fails} prueba(s) fallan`);
process.exit(fails === 0 ? 0 : 1);
