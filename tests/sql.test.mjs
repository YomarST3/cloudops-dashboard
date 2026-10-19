/**
 * Reglas de SQL / Supabase.
 *
 * Estas reglas no existian: el motor solo miraba Javascript, y en un proyecto
 * con Supabase el riesgo esta en las migraciones. Una tabla sin Row Level
 * Security con la clave anon en el navegador es una tabla publica.
 *
 * Uso:  node tests/sql.test.mjs
 */
import { analyzeCode } from '../src/lib/server/analyze.ts';

let fails = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'OK    ' : 'FALLO '} ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
};

const f = (path, content) => `// ===== FILE: ${path} =====\n${content}\n`;
const flat = (r) => r.modules.flatMap((m) => m.findings);
const byId = (r, id) => flat(r).filter((x) => x.id.endsWith(id));
/** Los hallazgos de "tabla sin RLS" se identifican por el prefijo del id. */
const sinRlsAll = (r) => flat(r).filter((x) => x.id.includes('sql-no-rls-'));

// ── 1. Tabla sin RLS: el fallo mas grave y el que no cabe en un regex ────────
const sinRls = analyzeCode({
  projectName: 'app',
  code: f('app/supabase/migrations/001_init.sql', `
CREATE TABLE public.pedidos (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  total numeric
);
CREATE TABLE public.perfiles (
  id uuid PRIMARY KEY,
  nombre text
);
`),
});

const sinRlsFindings = sinRlsAll(sinRls);
check('detecta una tabla sin Row Level Security', sinRlsFindings.length === 2,
  `${sinRlsFindings.length} (pedidos + perfiles)`);
check('es una vulnerabilidad de severidad alta', sinRlsFindings.every((x) => x.severity === 'high'));
check('señala el archivo y la linea del CREATE TABLE',
  sinRlsFindings.every((x) => x.file?.endsWith('001_init.sql') && typeof x.line === 'number'),
  sinRlsFindings[0] ? `${sinRlsFindings[0].file}:${sinRlsFindings[0].line}` : '-');
check('el nombre de la tabla aparece en el titulo',
  sinRlsFindings.some((x) => x.title.includes('pedidos')) &&
  sinRlsFindings.some((x) => x.title.includes('perfiles')));

const conRls = analyzeCode({
  projectName: 'app',
  code: f('app/supabase/migrations/002.sql', `
CREATE TABLE public.pedidos (id uuid PRIMARY KEY, user_id uuid);
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own" ON public.pedidos FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TABLE public.categorias (id uuid);
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
`),
});
check('una tabla protegida con RLS y auth.uid() no genera hallazgo',
  sinRlsAll(conRls).length === 0, `${sinRlsAll(conRls).length}`);

// ── 2. service_role en el cliente: critico, y solo en cliente ────────────────
const enCliente = analyzeCode({
  projectName: 'app',
  code: f('app/src/lib/supabase.ts', `
const url = 'https://x.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, key);
`),
});
check('detecta service_role en codigo de cliente', byId(enCliente, 'service-role-in-client').length === 1);
check('con severidad critica',
  byId(enCliente, 'service-role-in-client')[0]?.severity === 'critical');

const enMigracion = analyzeCode({
  projectName: 'app',
  code: f('app/supabase/migrations/003.sql', `
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
`),
});
check('pero NO lo marca dentro de una migracion SQL',
  byId(enMigracion, 'service-role-in-client').length === 0,
  'la palabra es legitima en un GRANT de Postgres');

// ── 3. Politicas demasiado permisivas ────────────────────────────────────────
const escrituraAbierta = analyzeCode({
  projectName: 'app',
  code: f('app/supabase/migrations/004.sql', `
CREATE TABLE public.notas (id uuid, user_id uuid);
ALTER TABLE public.notas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos escriben" ON public.notas FOR INSERT TO anon USING (true);
CREATE POLICY "Todos borran" ON public.notas FOR DELETE TO authenticated USING (true);
`),
});
// Dos politicas abiertas de escritura son el mismo problema repetido: una sola
// tarjeta que dice x2, no dos tarjetas identicas.
check('detecta escritura abierta a anon con USING (true)',
  byId(escrituraAbierta, 'rls-permissive-write').length === 1,
  `${byId(escrituraAbierta, 'rls-permissive-write').length} tarjeta(s)`);
check('y cuenta las dos apariciones',
  byId(escrituraAbierta, 'rls-permissive-write')[0]?.occurrences === 2,
  String(byId(escrituraAbierta, 'rls-permissive-write')[0]?.occurrences));

const lecturaPublica = analyzeCode({
  projectName: 'app',
  code: f('app/supabase/migrations/005.sql', `
CREATE TABLE public.categorias (id uuid, nombre text);
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cualquiera lee" ON public.categorias FOR SELECT TO anon, authenticated USING (true);
`),
});
check('detecta lectura publica sin restriccion',
  byId(lecturaPublica, 'rls-permissive-read').length === 1);
check('pero como observacion de severidad baja, no como fallo critico',
  byId(lecturaPublica, 'rls-permissive-read')[0]?.severity === 'low');

const politicaCorrecta = analyzeCode({
  projectName: 'app',
  code: f('app/supabase/migrations/006.sql', `
CREATE TABLE public.ordenes (id uuid, user_id uuid);
ALTER TABLE public.ordenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo suyas" ON public.ordenes FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_staff(auth.uid()));
`),
});
check('una politica con auth.uid() no genera ninguno de los tres hallazgos',
  byId(politicaCorrecta, 'rls-permissive-read').length === 0 &&
    byId(politicaCorrecta, 'rls-permissive-write').length === 0 &&
    byId(politicaCorrecta, 'ordenes').length === 0);

// ── 4. Aislamiento entre lenguajes ──────────────────────────────────────────
// Sin el filtro `languages`, service_role y las reglas de policy se dispararían
// sobre cualquier archivo.
const jsConPolicy = analyzeCode({
  projectName: 'app',
  code: f('app/src/db.js', 'const q = "CREATE POLICY x ON y USING (true)";'),
});
check('las reglas de policy no disparan sobre Javascript',
  byId(jsConPolicy, 'rls-permissive-read').length === 0 &&
    byId(jsConPolicy, 'rls-permissive-write').length === 0);

// Un secreto dentro de una migracion SI es un hallazgo: las reglas de JS que
// tienen sentido fuera de JS (una contrasena escrita en texto plano) se siguen
// aplicando. Lo que no debe pasar es lo contrario: una regla de Postgres
// disparando sobre un archivo de Javascript, comprobado mas arriba.
const sqlConJs = analyzeCode({
  projectName: 'app',
  code: f('app/supabase/migrations/007.sql', "UPDATE usuarios SET password = 'ClaveTemporal2024' WHERE email = 'admin@x.com';"),
});
check('una credencial escrita en una migracion SI se detecta',
  byId(sqlConJs, 'hardcoded-secret').length === 1,
  `${byId(sqlConJs, 'hardcoded-secret').length}`);

// ── 5. Sin SQL no cambia nada ────────────────────────────────────────────────
const soloJs = analyzeCode({
  projectName: 'app',
  code: f('app/src/a.js', "const password = 'Panaderia2024!';"),
});
check('un proyecto sin SQL se comporta como antes',
  soloJs.coverage?.filesAnalyzed === 1 && soloJs.totalFindings === 1,
  `${soloJs.totalFindings} hallazgo(s)`);

// ── 6. El bug que cruzaba sentencias ────────────────────────────────────────
// El patron usaba [\s\S]{0,500}, que atraviesa el punto y coma: emparejaba el
// "FOR SELECT" de una politica correcta con el "USING (true)" de la siguiente.
// En el proyecto real marco tres veces "escritura abierta" en migraciones que no
// tienen ni una politica abierta. Este test lo fija para que no vuelva.
const cruzandoSentencias = analyzeCode({
  projectName: 'app',
  code: f('app/supabase/migrations/100_perfiles.sql', `
CREATE POLICY "Own profile read" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_staff(auth.uid()));
CREATE POLICY "Own profile insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
CREATE POLICY "Read categories" ON public.categories FOR SELECT TO anon USING (true);
`),
});
check(
  'una politica correcta seguida de otra abierta NO genera escritura abierta',
  byId(cruzandoSentencias, 'rls-permissive-write').length === 0,
  `${byId(cruzandoSentencias, 'rls-permissive-write').length} (debe ser 0)`
);
check(
  'pero si detecta la lectura publica real de la tercera politica',
  byId(cruzandoSentencias, 'rls-permissive-read').length === 1,
  `${byId(cruzandoSentencias, 'rls-permissive-read').length}`
);

// Y al reves: una escritura abierta real debe seguir detectandose.
const conSeparador = analyzeCode({
  projectName: 'app',
  code: f('app/supabase/migrations/101.sql', `
CREATE POLICY "Admin manages" ON public.categorias FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Todos insertan" ON public.notas FOR INSERT TO anon USING (true);
`),
});
check('la escritura abierta real sigue detectandose',
  byId(conSeparador, 'rls-permissive-write').length === 1,
  `${byId(conSeparador, 'rls-permissive-write').length}`);

console.log(fails === 0 ? '\nTODAS LAS PRUEBAS PASAN' : `\n${fails} prueba(s) fallan`);
process.exit(fails === 0 ? 0 : 1);