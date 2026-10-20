/**
 * /api/admin-delete-user
 *
 * Borra una cuenta de forma REAL: elimina el usuario de auth.users con la Admin
 * API de Supabase. Como las tablas de datos (proposals, cost_items,
 * project_analyses, user_preferences, profiles) referencian auth.users(id) con
 * ON DELETE CASCADE, borrar el usuario arrastra todos sus datos.
 *
 * Por que en el servidor: la Admin API exige la clave service_role, que NUNCA
 * puede estar en el navegador. Ademas se verifica aqui, con el token del que
 * llama, que sea superadmin antes de tocar nada: sin eso, cualquiera con una
 * sesion valida podria borrar cuentas.
 *
 * POST body: { userId }
 * Cabecera: Authorization: Bearer <access_token del superadmin>
 *
 * Respuesta: { deleted: true } | { error }
 */

import { createClient } from '@supabase/supabase-js';

/** Suficiente para un borrado; se deja explicito por claridad. */
export const maxDuration = 30;

/** Un id de Supabase es un UUID. Se valida antes de mandarlo a la Admin API. */
export const isValidUserId = (value: unknown): boolean =>
  typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value.trim());

/** Extrae el token del header Authorization. */
export const parseBearerToken = (header: unknown): string => {
  const raw = String(header || '');
  return raw.startsWith('Bearer ') ? raw.slice(7).trim() : '';
};

/**
 * URL y claves del proyecto. La publishable/anon se usa para verificar el token
 * del que llama (respeta RLS); la service_role solo para el borrado final. Ambas
 * viven en el entorno del servidor.
 *
 * Se aceptan tanto los nombres VITE_* (que ya existen para el cliente) como los
 * nombres sin prefijo, para no obligar a duplicar configuracion.
 */
function projectConfig() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    '';
  const anon =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    '';
  const service =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    '';
  return { url: url.trim(), anon: anon.trim(), service: service.trim() };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const { url, anon, service } = projectConfig();
  if (!url || !anon || !service) {
    res.status(500).json({
      error:
        'El servidor no tiene configurada SUPABASE_SERVICE_ROLE_KEY. Anade esa variable (secreta) en el entorno para poder eliminar cuentas.',
    });
    return;
  }

  // El token identifica a quien llama. Sin el no hay forma de autorizar.
  const token = parseBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: 'Falta el token de sesion.' });
    return;
  }

  let body: { userId?: string };
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ error: 'JSON invalido en el cuerpo de la solicitud.' });
    return;
  }

  const targetId = String(body?.userId || '').trim();
  if (!isValidUserId(targetId)) {
    res.status(400).json({ error: 'userId invalido.' });
    return;
  }

  // Cliente con el token del que llama: respeta RLS, asi que solo puede leer su
  // propio perfil. Sirve para confirmar que es superadmin.
  const callerClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser(token);
  if (userError || !userData?.user) {
    res.status(401).json({ error: 'Sesion invalida o expirada.' });
    return;
  }
  const callerId = userData.user.id;

  if (callerId === targetId) {
    res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
    return;
  }

  const { data: callerProfile, error: profileError } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle();

  if (profileError) {
    res.status(500).json({ error: `No se pudo verificar permisos: ${profileError.message}` });
    return;
  }
  if (callerProfile?.role !== 'superadmin') {
    res.status(403).json({ error: 'Solo un superadmin puede eliminar cuentas.' });
    return;
  }

  // A partir de aqui, el cliente con service_role. Salta RLS, por eso solo se
  // usa DESPUES de haber autorizado al que llama.
  const adminClient = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetId);
    if (deleteError) {
      res.status(502).json({ error: `No se pudo eliminar la cuenta: ${deleteError.message}` });
      return;
    }
    res.status(200).json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'error desconocido';
    res.status(500).json({ error: `No se pudo eliminar la cuenta: ${message}` });
  }
}
