import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ShieldCheck, Users, Loader2, UserCheck, UserX, AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../integrations/supabase/client';
import { adminDeleteUser } from '../lib/awsApi';
import { toProfileSummary, type ProfileSummary } from '../lib/supabase-helpers';

/**
 * Panel de administracion: solo visible para superadmins. Lista los perfiles y
 * permite activar/desactivar cuentas. La lectura y el UPDATE los autoriza la
 * politica RLS "Superadmin ..." (ver migracion 20261020000000).
 */
export const AdminUsers: React.FC = () => {
  const { user, isSuperadmin, isSupabaseConfigured } = useAuth();

  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** Cuenta pendiente de confirmar borrado: abre el modal propio. */
  const [confirmTarget, setConfirmTarget] = useState<ProfileSummary | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('profiles')
        .select('id, display_name, email, role, is_active, created_at')
        .order('created_at', { ascending: false });

      if (queryError) throw new Error(queryError.message);
      setProfiles((data ?? []).map(toProfileSummary));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la lista de usuarios.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSuperadmin) return;
    void load();
  }, [isSuperadmin, load]);

  const toggleActive = async (profile: ProfileSummary) => {
    if (profile.id === user?.id) return;
    setPendingId(profile.id);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ is_active: !profile.isActive })
        .eq('id', profile.id);
      if (updateError) throw new Error(updateError.message);
      setProfiles((prev) =>
        prev.map((p) => (p.id === profile.id ? { ...p, isActive: !p.isActive } : p))
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el usuario.');
    } finally {
      setPendingId(null);
    }
  };

  /**
   * Borra la cuenta de verdad (auth.users via Admin API). El boton abre el modal
   * de confirmacion (confirmTarget); esto solo se ejecuta al aceptar.
   */
  const performDelete = async (profile: ProfileSummary) => {
    if (profile.id === user?.id) return;
    setConfirmTarget(null);
    setDeletingId(profile.id);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sesión no válida. Vuelve a iniciar sesión.');

      const result = await adminDeleteUser(profile.id, token);
      if (result.error) throw new Error(result.error);
      setProfiles((prev) => prev.filter((p) => p.id !== profile.id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el usuario.');
    } finally {
      setDeletingId(null);
    }
  };

  // Guarda de acceso: sin Supabase no hay perfiles, y un no-superadmin va al dashboard.
  if (!isSupabaseConfigured || !isSuperadmin) return <Navigate to="/dashboard" replace />;

  const activeCount = profiles.filter((p) => p.isActive).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <ShieldCheck className="w-5 h-5" />
            <span className="text-xs font-bold uppercase tracking-wider">Administración</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
            Gestión de usuarios
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Activa o desactiva cuentas. Un usuario desactivado no puede iniciar sesión.
          </p>
        </div>

        <button
          onClick={() => void load()}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
        <Users className="w-4 h-4" />
        {profiles.length} {profiles.length === 1 ? 'cuenta' : 'cuentas'} · {activeCount} activas
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Cargando usuarios…
          </div>
        ) : profiles.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            No hay usuarios registrados todavía.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Rol</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => {
                  const isSelf = profile.id === user?.id;
                  return (
                    <tr
                      key={profile.id}
                      className="border-b border-slate-50 dark:border-slate-800/60 last:border-0"
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800 dark:text-slate-100">
                          {profile.displayName || 'Sin nombre'}
                          {isSelf && (
                            <span className="ml-2 text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400">
                              Tú
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 truncate max-w-[16rem]">
                          {profile.email || profile.id}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            profile.role === 'superadmin'
                              ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {profile.role === 'superadmin' ? 'Superadmin' : 'Usuario'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            profile.isActive
                              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                              : 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400'
                          }`}
                        >
                          {profile.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => void toggleActive(profile)}
                            disabled={isSelf || pendingId === profile.id || deletingId === profile.id}
                            title={isSelf ? 'No puedes desactivar tu propia cuenta' : undefined}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                              profile.isActive
                                ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50'
                                : 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                            }`}
                          >
                            {pendingId === profile.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : profile.isActive ? (
                              <UserX className="w-3.5 h-3.5" />
                            ) : (
                              <UserCheck className="w-3.5 h-3.5" />
                            )}
                            {profile.isActive ? 'Desactivar' : 'Activar'}
                          </button>

                          <button
                            onClick={() => setConfirmTarget(profile)}
                            disabled={isSelf || deletingId === profile.id || pendingId === profile.id}
                            title={isSelf ? 'No puedes eliminar tu propia cuenta' : 'Eliminar cuenta y todos sus datos'}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {deletingId === profile.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Fondo oscuro: clic fuera cancela. */}
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => (deletingId ? null : setConfirmTarget(null))}
          />

          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-md bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 shrink-0 rounded-2xl bg-red-50 dark:bg-red-950/50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Eliminar cuenta
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Esta acción es permanente y no se puede deshacer.
                </p>
              </div>
            </div>

            <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cuenta a eliminar
              </p>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                {confirmTarget.email || confirmTarget.displayName || confirmTarget.id}
              </p>
              <p className="text-[11px] text-red-600 dark:text-red-400 mt-2">
                Se borrarán también sus propuestas, costos y análisis de proyecto.
              </p>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmTarget(null)}
                disabled={Boolean(deletingId)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => void performDelete(confirmTarget)}
                disabled={Boolean(deletingId)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 transition-colors"
              >
                {deletingId ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                {deletingId ? 'Eliminando…' : 'Eliminar cuenta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
