/**
 * Superadmin de bootstrap.
 *
 * `SUPERADMIN_EMAIL` es la cuenta que se auto-promueve a `role='superadmin'` la
 * primera vez que inicia sesion. Es un valor fijo a proposito: el rol real vive
 * en `profiles.role` (lo aplican las politicas RLS de la migracion
 * 20261020000000), y esto es solo la semilla para no tener que tocar SQL a mano.
 *
 * El UPDATE lo autoriza la politica "Own profile update": el usuario solo
 * modifica su propia fila. Si el email no coincide, no pasa nada.
 *
 * Nota: el email viaja en el bundle del navegador. No es un secreto (es la
 * identidad de una cuenta, no una credencial), pero conviene saberlo. La
 * proteccion real la da RLS, no el ocultamiento de este valor.
 */
export const SUPERADMIN_EMAIL = 'YomarST@gmail.com';

export const isSuperadminEmail = (email: string | null | undefined): boolean =>
  typeof email === 'string' && email.trim().toLowerCase() === SUPERADMIN_EMAIL.toLowerCase();
