import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

/**
 * Cliente de Supabase para CloudOps Dashboard.
 *
 * Se usa unicamente la publishable key: la seguridad la garantiza RLS, no la
 * clave, asi que no hace falta ningun cliente con service_role en este proyecto.
 *
 * Vite inyecta las variables VITE_* en tiempo de build, asi que hay que
 * declararlas en `src/vite-env.d.ts` para que TypeScript las vea.
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/**
 * Si esto es false, el dashboard entra en "modo local": guarda en localStorage
 * en vez de Supabase. Permite clonar el repo y arrancarlo sin credenciales.
 */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

export const missingSupabaseEnvVars = (): string[] => {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
  if (!SUPABASE_PUBLISHABLE_KEY) missing.push('VITE_SUPABASE_PUBLISHABLE_KEY');
  return missing;
};

let client: SupabaseClient<Database> | null = null;

function createSupabaseClient(): SupabaseClient<Database> {
  const missing = missingSupabaseEnvVars();
  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno de Supabase: ${missing.join(', ')}. ` +
        'Copia .env.example a .env y rellena los valores.'
    );
  }

  return createClient<Database>(SUPABASE_URL as string, SUPABASE_PUBLISHABLE_KEY as string, {
    auth: {
      storage: window.localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

/**
 * Singleton perezoso: se construye en el primer uso, no al importar el modulo.
 *
 * Importar como:
 *   import { supabase } from '../integrations/supabase/client';
 */
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop, receiver) {
    if (!client) client = createSupabaseClient();
    return Reflect.get(client, prop, receiver);
  },
});