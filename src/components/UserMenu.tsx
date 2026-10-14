import React, { useState } from 'react';
import { LogOut, User, Database, ChevronDown, Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useCloud } from '../context/CloudContext';

/**
 * Menu de usuario del Header: identidad real de Supabase y estado de la
 * persistencia (Supabase vs cache local).
 */
export const UserMenu: React.FC = () => {
  const { user, signOut } = useAuth();
  const { isRemoteEnabled, isSyncing } = useCloud();

  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const email = user?.email ?? '';
  const initial = email ? email.charAt(0).toUpperCase() : '?';

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-700 hover:opacity-90 transition-opacity"
        title="Menú de usuario"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-sm shrink-0">
          {initial}
        </div>
        <div className="hidden md:block text-left">
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block leading-tight max-w-[10rem] truncate">
            {email || 'Sesión local'}
          </span>
          <span className="text-[10px] text-slate-400 block leading-tight">
            {isRemoteEnabled ? 'Datos en Supabase' : 'Modo local'}
          </span>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden md:block" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-50 p-2 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Sesión activa
              </span>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-1 truncate">
                {email || 'Sin cuenta (modo local)'}
              </p>
            </div>

            {/* Estado de persistencia */}
            <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-start gap-2.5">
              {isRemoteEnabled ? (
                <>
                  <Database className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Sincronizado con Supabase
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {isSyncing ? 'Sincronizando…' : 'Tus datos están guardados y aislados por RLS.'}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <User className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Modo local
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Sin sesión o sin variables de entorno: se guarda en localStorage.
                    </p>
                  </div>
                </>
              )}
            </div>

            {user && (
              <button
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="w-full mt-1 flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 transition-colors"
              >
                {isSigningOut ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogOut className="w-4 h-4" />
                )}
                <span>{isSigningOut ? 'Cerrando sesión...' : 'Cerrar sesión'}</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};