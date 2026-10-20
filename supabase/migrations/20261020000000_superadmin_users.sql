-- Superadmin + activacion de usuarios
--
-- Un superadmin es un usuario cuyo `profiles.role = 'superadmin'`. Se marca a
-- mano en la base de datos (no hay interfaz para auto-promoverse). Los usuarios
-- desactivados (`is_active = false`) no pueden iniciar sesion: la comprobacion
-- vive en el cliente (src/hooks/useAuth.tsx), que los expulsa tras autenticarse.
--
-- `email` se copia a profiles desde auth.users en el trigger handle_new_user
-- para que el panel de administracion pueda listar cuentas sin acceso a la API
-- de admin (que requiere service_role).

-- ─── Columnas nuevas ─────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'superadmin'));

ALTER TABLE public.profiles
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.profiles
  ADD COLUMN email TEXT;

-- ─── Helper is_superadmin ────────────────────────────────────────────────────
-- SECURITY DEFINER + STABLE: lee profiles sin pasar por RLS y evita recursion
-- cuando las politicas de las demas tablas lo invocan.

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'superadmin'
  );
$$;

-- ─── Politicas RLS: superadmin ve y gestiona todo ────────────────────────────

-- profiles: el superadmin lee y actualiza cualquier perfil (activar/desactivar).
DROP POLICY IF EXISTS "Superadmin read profiles" ON public.profiles;
CREATE POLICY "Superadmin read profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_superadmin());

DROP POLICY IF EXISTS "Superadmin update profiles" ON public.profiles;
CREATE POLICY "Superadmin update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- proposals / cost_items / project_analyses / user_preferences:
-- se anade una politica adicional de superadmin. Las politicas existentes de
-- "solo lo mio" siguen vigentes para usuarios normales (Postgres combina las
-- politicas permisivas con OR).

DROP POLICY IF EXISTS "Superadmin all proposals" ON public.proposals;
CREATE POLICY "Superadmin all proposals" ON public.proposals
  FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS "Superadmin all cost items" ON public.cost_items;
CREATE POLICY "Superadmin all cost items" ON public.cost_items
  FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS "Superadmin all project analyses" ON public.project_analyses;
CREATE POLICY "Superadmin all project analyses" ON public.project_analyses
  FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS "Superadmin all preferences" ON public.user_preferences;
CREATE POLICY "Superadmin all preferences" ON public.user_preferences
  FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- ─── Trigger: copiar email al crear el perfil ────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;
