/**
 * Eliminar cuentas desde el panel de superadmin.
 *
 * El borrado real (auth.admin.deleteUser) solo puede probarse contra un Supabase
 * vivo, asi que aqui se fijan las piezas que si son deterministas y son las que
 * protegen el endpoint: la validacion del id y el parseo del token.
 *
 * Uso:  node tests/admin-delete-user.test.mjs
 */
import { isValidUserId, parseBearerToken } from '../api/admin-delete-user.ts';

let fails = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'OK    ' : 'FALLO '} ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
};

// ── 1. Validacion del userId objetivo ────────────────────────────────────────
check('un UUID v4 valido pasa', isValidUserId('11111111-1111-1111-1111-111111111111') === true);
check('acepta hexadecimal y guiones', isValidUserId('ABCDEF01-2345-6789-abcd-ef0123456789') === true);
check('rechaza una cadena vacia', isValidUserId('') === false);
check('rechaza un id corto', isValidUserId('123') === false);
check('rechaza una inyeccion con espacios', isValidUserId('1; DROP TABLE profiles') === false);
check('rechaza nulo y no-string', isValidUserId(null) === false && isValidUserId(42) === false);
check('un id con 37 caracteres no pasa', isValidUserId('11111111-1111-1111-1111-1111111111111') === false);

// ── 2. Parseo del token del que llama ────────────────────────────────────────
check('extrae el token de un header Bearer', parseBearerToken('Bearer abc.def.ghi') === 'abc.def.ghi');
check('header vacio -> cadena vacia', parseBearerToken('') === '');
check('header sin Bearer -> cadena vacia', parseBearerToken('abc.def.ghi') === '');
check('header nulo -> cadena vacia', parseBearerToken(undefined) === '');
check('recorta espacios alrededor del token', parseBearerToken('Bearer   tok  ') === 'tok');

console.log(fails === 0 ? '\nTODAS LAS PRUEBAS PASAN' : `\n${fails} prueba(s) fallan`);
process.exit(fails === 0 ? 0 : 1);
