import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../integrations/supabase/client';
import { isSuperadminEmail } from '../lib/superadmin';

export type UserRole = 'user' | 'superadmin';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  /** true mientras se recupera la sesion inicial. Evita un destello de /login. */
  isLoading: boolean;
  /** false si faltan las variables de entorno: el dashboard va en modo local. */
  isSupabaseConfigured: boolean;
  /** Rol del usuario segun profiles.role. 'user' en modo local o sin perfil. */
  role: UserRole;
  /** false si el superadmin desactivo la cuenta. */
  isActive: boolean;
  /** Atajo para el gating de la interfaz de administracion. */
  isSuperadmin: boolean;
  /** Mensaje de cuenta desactivada para mostrar en /login. */
  disabledMessage: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(isSupabaseConfigured);
  const [role, setRole] = useState<UserRole>('user');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [disabledMessage, setDisabledMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let active = true;

    /**
     * Consulta profiles y expulsa la sesion si la cuenta esta desactivada.
     * Se hace aqui (y no en un efecto aparte) para que `isLoading` no baje hasta
     * tener el veredicto: asi un usuario desactivado nunca ve un frame del
     * dashboard antes de ser expulsado.
     */
    const resolveProfile = async (nextSession: Session | null) => {
      if (!nextSession) {
        if (!active) return;
        setRole('user');
        setIsActive(true);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', nextSession.user.id)
        .maybeSingle();

      if (error) {
        // Sin lectura del perfil no bloqueamos: RLS ya protege los datos. El
        // usuario entra como 'user' normal.
        if (!active) return;
        setRole('user');
        setIsActive(true);
        setIsLoading(false);
        return;
      }

      const activeFlag = data?.is_active ?? true;

      if (!activeFlag) {
        await supabase.auth.signOut();
        if (!active) return;
        setRole('user');
        setIsActive(false);
        setDisabledMessage('Tu cuenta esta desactivada. Contacta al administrador.');
        setIsLoading(false);
        return;
      }

      /**
       * Bootstrap del superadmin + autorreparacion del perfil.
       *
       * Un usuario puede existir en auth.users sin fila en profiles: el trigger
       * handle_new_user solo dispara con usuarios NUEVOS, asi que una cuenta
       * creada antes de aplicar la migracion se queda sin perfil. Sin fila no
       * hay role, y sin role no hay superadmin.
       *
       * Hacemos upsert (no update): si la fila falta se crea (lo autoriza la
       * politica "Own profile insert") y si existe se reutiliza. El rol solo se
       * eleva para el email semilla; nunca se degrada a un superadmin existente.
       */
      const email = nextSession.user.email ?? null;
      const shouldBeSuperadmin = isSuperadminEmail(email);
      const currentRole = (data?.role as UserRole) ?? 'user';

      if (!data || (shouldBeSuperadmin && currentRole !== 'superadmin')) {
        const nextRole: UserRole = shouldBeSuperadmin ? 'superadmin' : currentRole;
        const { error: upsertError } = await supabase
          .from('profiles')
          .upsert(
            {
              id: nextSession.user.id,
              email,
              display_name: data ? undefined : (email ? email.split('@')[0] : null),
              role: nextRole,
              is_active: data ? undefined : true,
            },
            { onConflict: 'id' }
          );
        if (!upsertError) {
          if (!active) return;
          setRole(nextRole);
          setIsActive(true);
          setDisabledMessage(null);
          setIsLoading(false);
          return;
        }
      }

      if (!active) return;
      setRole(currentRole);
      setIsActive(true);
      setDisabledMessage(null);
      setIsLoading(false);
    };

    // Sin sesion guardada, getSession resuelve al instante y isLoading baja.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      void resolveProfile(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Llamar a otras APIs de Supabase dentro de este callback puede
      // deadlockear el cliente. Solo actualizamos estado; el resto de la app
      // reacciona por efectos con [session] como dependencia.
      if (!active) return;
      setSession(nextSession);
      void resolveProfile(nextSession);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) throw new Error(error.message);
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      isSupabaseConfigured,
      role,
      isActive,
      isSuperadmin: role === 'superadmin',
      disabledMessage,
      signIn,
      signUp,
      signOut,
      sendPasswordReset,
    }),
    [session, isLoading, role, isActive, disabledMessage, signIn, signUp, signOut, sendPasswordReset]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  return context;
};