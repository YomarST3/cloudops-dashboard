/**
 * Compara los DOS motores del analizador y falla si divergen.
 *
 * El motor esta duplicado a proposito: Vercel compila cada fichero de api/ por
 * separado sin empaquetar sus imports, asi que api/ai-analyze.ts tiene que ser
 * autocontenido y no puede importar nada de src/lib/server/. El precio es que
 * la misma logica esta escrita dos veces, y esta prueba es lo unico que
 * avisa cuando una copia se queda atras.
 *
 * Si alguna vez divergen, los dos endpoints agruparian los modulos de forma
 * distinta y los hallazgos de la IA caerian en carpetas equivocadas.
 *
 * Uso:  node tests/parity.test.mjs
 */
import { analyzeCode } from '../src/lib/server/analyze.ts';
import aiAnalyze from '../api/ai-analyze.ts';

function mockRes() {
  const r = { status: 200, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.status = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}

const f = (path, content) => `// ===== FILE: ${path} =====\n${content}\n`;

const CASES = {
  'multi-archivo (carpetas)': {
    projectName: 'panaderia',
    code: [
      f('panaderia-buddy/src/routes/auth.js', `const express = require('express');
const router = express.Router();
const db = require('../db');
router.post('/login', (req, res) => {
  const sql = "SELECT * FROM usuarios WHERE pwd='" + req.body.pwd + "'";
  db.query(sql, (e, r) => res.json(r));
});
module.exports = router;`),
      f('panaderia-buddy/src/views/cart.js', `function render(cart) {
  document.getElementById('c').innerHTML = cart.items.map(i => i.name).join('');
  const token = localStorage.getItem('t');
  console.log('user token', token);
}`),
      f('panaderia-buddy/src/lib/crypto.js', `const c = require('crypto');
const hash = c.createHash('md5').update(pw).digest('hex');
const nonce = Math.random();
module.exports = { hash, nonce };`),
      f('panaderia-buddy/server.js', `const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.get('/api/d', (req, res) => { res.redirect(req.query.next); });
fetch('http://api.bank.com/pay', { method: 'POST' });
app.listen(3000);`),
      f('panaderia-buddy/README.md', '# Panaderia'),
    ].join('\n'),
  },
  'un solo archivo': {
    projectName: 'api-unica',
    code: 'app.post("/x", (req, res) => { eval(req.body.code); });\nconst a = process.env.KEY;',
  },
  'solo descripcion': { projectName: 'tienda', description: 'Tienda online con login y pagos' },
  'vacio': { projectName: 'nada', code: '   ' },
  'override de lenguaje': {
    projectName: 'mixto',
    language: 'Python',
    code: [f('src/a.ts', 'const x: string = "1";'), f('src/b.py', 'def h():\n    return 1')].join('\n'),
  },
  'react limpio': {
    projectName: 'web',
    code: [f('app/src/App.tsx', "import React from 'react';\nexport default () => <div>hola</div>;")].join('\n'),
  },
  'supabase con rls': {
    projectName: 'app',
    code: [
      f('app/src/lib/api.ts', "import { supabase } from './sb';\nexport const q = () => supabase.from('pedidos').select('*');"),
      f('app/supabase/migrations/001.sql', 'CREATE TABLE pedidos (id uuid);\nALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;'),
    ].join('\n'),
  },
};

const norm = (o) => {
  const c = JSON.parse(JSON.stringify(o));
  delete c.id;
  delete c.analyzedAt;
  return JSON.stringify(c, null, 1);
};

let fails = 0;
for (const [name, input] of Object.entries(CASES)) {
  const res = mockRes();
  await aiAnalyze(
    { method: 'POST', headers: { origin: 'http://x' }, body: JSON.stringify(input) },
    res
  );
  const neu = analyzeCode(JSON.parse(JSON.stringify(input)));

  if (res.status !== 200) {
    console.log(`FALLO  ${name}: el motor de api/ devolvio ${res.status}`);
    fails++;
    continue;
  }

  const a = norm(res.body);
  const b = norm(neu);
  if (a === b) {
    console.log(
      `OK     ${name}  (${neu.modules.length} modulos, score ${neu.overallSecurityScore}, ` +
        `${neu.totalFindings} hallazgos, compliance ${neu.complianceScore}%)`
    );
  } else {
    fails++;
    console.log(`DIFIERE ${name}`);
    const al = a.split('\n');
    const bl = b.split('\n');
    for (let i = 0; i < Math.max(al.length, bl.length); i++) {
      if (al[i] !== bl[i]) console.log(`   - api/: ${al[i]}\n   + src/: ${bl[i]}`);
    }
  }
}

console.log(
  fails === 0
    ? '\nPARIDAD TOTAL: los dos motores se comportan igual'
    : `\n${fails} caso(s) con diferencias entre los dos motores`
);
process.exit(fails === 0 ? 0 : 1);