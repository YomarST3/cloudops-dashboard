-- CloudOps Dashboard - Esquema completo de base de datos (Supabase / PostgreSQL)
--
-- Dump consolidado de supabase/migrations/. Ejecutar en un proyecto Supabase
-- vacio. Alternativa recomendada: `supabase db push` (respeta el historial).
--
-- Aplica este archivo DESPUES de crear el proyecto en supabase.com y de
-- desactivar la confirmacion de email (Authentication -> Providers -> Email).

-- 20261012000000_cloudops_init.sql

-- ─── Tipos enumerados ─────────────────────────────────────────────────────────
-- Reflejan las uniones de src/types/cloud.ts.

CREATE TYPE public.service_category AS ENUM (
  'Compute',
  'Storage',
  'Database',
  'Security',
  'Networking',
  'Content Delivery',
  'Monitoring'
);

CREATE TYPE public.availability_level AS ENUM (
  'Básica',
  'Media',
  'Alta'
);

CREATE TYPE public.proposal_status AS ENUM (
  'Aprobada',
  'En revisión',
  'Borrador'
);

CREATE TYPE public.theme_preference AS ENUM (
  'dark',
  'light'
);

-- ─── profiles ────────────────────────────────────────────────────────────────

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'superadmin')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own profile read" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Own profile insert" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Own profile update" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- 20261020000000_superadmin_users.sql
-- El superadmin es un usuario con profiles.role = 'superadmin' (se marca a mano).
-- is_superadmin() es SECURITY DEFINER para leer profiles sin recursion de RLS.
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

CREATE POLICY "Superadmin read profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_superadmin());
CREATE POLICY "Superadmin update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

-- ─── proposals ───────────────────────────────────────────────────────────────

CREATE TABLE public.proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  solution_name TEXT NOT NULL,
  app_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  selected_region TEXT NOT NULL DEFAULT 'us-east-1',
  estimated_users INTEGER NOT NULL DEFAULT 0 CHECK (estimated_users >= 0),
  availability public.availability_level NOT NULL DEFAULT 'Media',
  selected_services TEXT[] NOT NULL DEFAULT '{}',
  migration_goal TEXT NOT NULL DEFAULT '',
  created_at DATE NOT NULL DEFAULT CURRENT_DATE,
  status public.proposal_status NOT NULL DEFAULT 'En revisión',
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX proposals_user_idx ON public.proposals (user_id, inserted_at DESC);

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own proposals" ON public.proposals
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Superadmin all proposals" ON public.proposals
  FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposals TO authenticated;

-- ─── cost_items ───────────────────────────────────────────────────────────────

CREATE TABLE public.cost_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  category public.service_category NOT NULL DEFAULT 'Compute',
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  estimated_hours INTEGER NOT NULL DEFAULT 720 CHECK (estimated_hours >= 0),
  unit_cost NUMERIC(12, 4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  monthly_cost NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (monthly_cost >= 0),
  annual_cost NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (annual_cost >= 0),
  notes TEXT,
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX cost_items_user_idx ON public.cost_items (user_id, inserted_at);

ALTER TABLE public.cost_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own cost items" ON public.cost_items
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Superadmin all cost items" ON public.cost_items
  FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_items TO authenticated;

-- ─── project_analyses ─────────────────────────────────────────────────────────
-- El ProjectAnalysisResult completo (modulos, hallazgos, servicios sugeridos)
-- se guarda en `payload` para no perder detalle al evolucionar el analizador.
-- Las columnas planas son solo para ordenar y mostrar sin parsear el jsonb.

CREATE TABLE public.project_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  overall_security_score INTEGER NOT NULL DEFAULT 0,
  total_findings INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL
);

CREATE INDEX project_analyses_user_idx ON public.project_analyses (user_id, analyzed_at DESC);

ALTER TABLE public.project_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own project analyses" ON public.project_analyses
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Superadmin all project analyses" ON public.project_analyses
  FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_analyses TO authenticated;

-- ─── user_preferences ─────────────────────────────────────────────────────────
-- Region activa, origen del mapa y tema. Una fila por usuario.
-- `seeded_at` marca que ya se sembraron los costos y propuestas iniciales: sin
-- el, un usuario que los borre a proposito se los volveriamos a insertar.

CREATE TABLE public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  region_code TEXT NOT NULL DEFAULT 'us-east-1',
  origin JSONB,
  theme public.theme_preference NOT NULL DEFAULT 'light',
  seeded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own preferences" ON public.user_preferences
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Superadmin all preferences" ON public.user_preferences
  FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

GRANT SELECT, INSERT, UPDATE ON public.user_preferences TO authenticated;

-- ─── Triggers ─────────────────────────────────────────────────────────────────

-- Crea perfil y fila de preferencias al registrarse. Los costos y propuestas
-- iniciales se siembran desde el cliente (src/data/*.ts) para que la fuente de
-- verdad de esos valores siga siendo el codigo y no el SQL.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)), NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at automático en preferencias
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_user_preferences ON public.user_preferences;
CREATE TRIGGER touch_user_preferences
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();