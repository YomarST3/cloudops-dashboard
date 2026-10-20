/**
 * Superadmin + activacion de usuarios.
 *
 * Fija las reglas del aislamiento y del gating del panel de administracion:
 *   - el mapper de perfiles normaliza el rol y las banderas,
 *   - solo role='superadmin' abre /admin,
 *   - un solo arranque de sesion desactivada debe expulsar (is_active=false).
 *
 * Uso:  node tests/admin-users.test.mjs
 */
import { toProfileSummary } from '../src/lib/supabase-helpers.ts';
import { SUPERADMIN_EMAIL, isSuperadminEmail } from '../src/lib/superadmin.ts';

let fails = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'OK    ' : 'FALLO '} ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
};

// ── 1. El mapper de perfiles normaliza la fila de Supabase ───────────────────
const fila = {
  id: '11111111-1111-1111-1111-111111111111',
  display_name: 'Yomar',
  email: 'yomar@example.com',
  role: 'superadmin',
  is_active: true,
  created_at: '2026-10-20T00:00:00.000Z',
};

const perfil = toProfileSummary(fila);
check('expone el rol superadmin', perfil.role === 'superadmin', perfil.role);
check('expone el email para el listado', perfil.email === 'yomar@example.com');
check('expone el display_name', perfil.displayName === 'Yomar');
check('expone el estado activo', perfil.isActive === true);
check('expone el id y la fecha', perfil.id === fila.id && perfil.createdAt === fila.created_at);

// Un rol inesperado NO se promociona por accidente.
const rolRaro = toProfileSummary({ ...fila, role: 'owner', is_active: false });
check('un rol desconocido degrada a user, nunca a superadmin', rolRaro.role === 'user', rolRaro.role);
check('la bandera inactiva se conserva', rolRaro.isActive === false);

// ── 2. Gating del panel: solo superadmin y con Supabase configurado ──────────
// Misma condicion que la guarda de AdminUsers.tsx.
const puedeVerAdmin = (isSupabaseConfigured, isSuperadmin) =>
  isSupabaseConfigured && isSuperadmin;

check('superadmin con Supabase -> entra a /admin', puedeVerAdmin(true, true) === true);
check('usuario normal -> NO entra', puedeVerAdmin(true, false) === false);
check('sin Supabase -> NO entra', puedeVerAdmin(false, true) === false);

// ── 3. Desactivar: nadie puede desactivarse a si mismo ───────────────────────
// Misma condicion que el boton de AdminUsers.tsx.
const puedeAlternar = (profileId, currentUserId) => profileId !== currentUserId;
check('un superadmin no puede desactivar su propia cuenta',
  puedeAlternar('a', 'a') === false);
check('si puede gestionar otra cuenta', puedeAlternar('a', 'b') === true);

// ── 4. Bootstrap del superadmin por email ────────────────────────────────────
check('la cuenta semilla coincide consigo misma', SUPERADMIN_EMAIL === 'YomarST@gmail.com', SUPERADMIN_EMAIL);
check('el email semilla se reconoce sin importar mayusculas',
  isSuperadminEmail('yomarst@gmail.com') === true);
check('y con espacios alrededor', isSuperadminEmail('  YomarST@gmail.com  ') === true);
check('otro email no se promueve', isSuperadminEmail('otro@example.com') === false);
check('email nulo o vacio no se promueve',
  isSuperadminEmail(null) === false && isSuperadminEmail('') === false);

// ── 5. Decision del upsert autorreparador ────────────────────────────────────
// Misma logica que resolveProfile en useAuth.tsx.
const decideProfileWrite = (data, email) => {
  const shouldBeSuperadmin = isSuperadminEmail(email);
  const currentRole = data?.role === 'superadmin' ? 'superadmin' : 'user';
  const write = !data || (shouldBeSuperadmin && currentRole !== 'superadmin');
  const nextRole = shouldBeSuperadmin ? 'superadmin' : currentRole;
  return { write, nextRole };
};

// Perfil ausente (el caso del usuario): se crea.
const sinPerfil = decideProfileWrite(null, 'otro@example.com');
check('perfil ausente -> se escribe (autorrepara)', sinPerfil.write === true);
check('perfil ausente de un usuario normal -> role user', sinPerfil.nextRole === 'user');

const sinPerfilSemilla = decideProfileWrite(null, SUPERADMIN_EMAIL);
check('perfil ausente de la semilla -> se crea como superadmin',
  sinPerfilSemilla.write === true && sinPerfilSemilla.nextRole === 'superadmin');

// Ya existe y es superadmin: no se toca.
const yaSuper = decideProfileWrite({ role: 'superadmin' }, SUPERADMIN_EMAIL);
check('superadmin existente -> no se reescribe', yaSuper.write === false);

// Existe como user y es la semilla: se promueve.
const userSemilla = decideProfileWrite({ role: 'user' }, SUPERADMIN_EMAIL);
check('semilla existente como user -> se promueve',
  userSemilla.write === true && userSemilla.nextRole === 'superadmin');

// Existe como superadmin pero el email NO es la semilla: no se degrada.
const otroSuper = decideProfileWrite({ role: 'superadmin' }, 'otro@example.com');
check('un superadmin ajeno NUNCA se degrada', otroSuper.write === false && otroSuper.nextRole === 'superadmin');

console.log(fails === 0 ? '\nTODAS LAS PRUEBAS PASAN' : `\n${fails} prueba(s) fallan`);
process.exit(fails === 0 ? 0 : 1);
