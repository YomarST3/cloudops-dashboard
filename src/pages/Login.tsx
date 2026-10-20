import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Cloud, LogIn, UserPlus, AlertTriangle, Loader2, KeyRound, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { missingSupabaseEnvVars } from '../integrations/supabase/client';

type Mode = 'signin' | 'signup';

export const Login: React.FC = () => {
  const { signIn, signUp, sendPasswordReset, isSupabaseConfigured, session, disabledMessage } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setInfo(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setInfo(null);

    if (!email.trim() || !password) {
      setError('Completa el correo y la contraseña.');
      return;
    }
    if (mode === 'signup' && password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
        setInfo('Cuenta creada. Entrando al dashboard...');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la operación.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError('Escribe tu correo primero para recibir el enlace de recuperación.');
      return;
    }
    setIsResetting(true);
    try {
      await sendPasswordReset(email.trim());
      setInfo('Te enviamos el enlace de recuperación a tu correo.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el correo.');
    } finally {
      setIsResetting(false);
    }
  };

  const missingEnv = isSupabaseConfigured ? [] : missingSupabaseEnvVars();

  // Ya hay sesión: no tiene sentido mostrar el formulario.
  if (session) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120] text-[#1E293B] dark:text-slate-100 flex items-center justify-center p-4 font-sans transition-colors duration-200">
      <div className="w-full max-w-md">
        {/* Marca */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mb-4 shadow-lg shadow-blue-600/30">
            <Cloud className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#1E293B] dark:text-white">CloudOps Dashboard</h1>
          <p className="text-sm text-[#64748B] dark:text-slate-400 mt-1">
            Planificación, costos y seguridad en la nube AWS
          </p>
        </div>

        {/* Tarjeta */}
        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-8 shadow-sm">
          {missingEnv.length > 0 ? (
            <div className="flex items-start gap-3 mb-6 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  Supabase no está configurado
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-300/90 mt-1">
                  Faltan las variables <code className="font-mono">{missingEnv.join(', ')}</code>. Copia{' '}
                  <code className="font-mono">.env.example</code> a <code className="font-mono">.env</code> y
                  rellena los valores del proyecto de Supabase.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Selector de modo */}
              <div className="flex gap-2 mb-6 p-1 bg-[#F1F5F9] dark:bg-slate-800/60 rounded-2xl">
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className={`flex-1 py-2 px-4 text-sm font-semibold rounded-xl transition-all ${
                    mode === 'signin'
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-[#64748B] dark:text-slate-400'
                  }`}
                >
                  Iniciar sesión
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className={`flex-1 py-2 px-4 text-sm font-semibold rounded-xl transition-all ${
                    mode === 'signup'
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-[#64748B] dark:text-slate-400'
                  }`}
                >
                  Crear cuenta
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-xs font-bold text-[#1E293B] dark:text-slate-200 mb-2">
                    Correo electrónico
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@correo.com"
                    className="w-full px-4 py-3 bg-white dark:bg-slate-900/60 border border-slate-300 dark:border-slate-600 rounded-xl text-sm text-[#1E293B] dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-xs font-bold text-[#1E293B] dark:text-slate-200 mb-2">
                    Contraseña
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 bg-white dark:bg-slate-900/60 border border-slate-300 dark:border-slate-600 rounded-xl text-sm text-[#1E293B] dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors"
                  />
                  {mode === 'signup' && (
                    <p className="text-[11px] text-[#64748B] dark:text-slate-500 mt-1.5">
                      Mínimo 6 caracteres.
                    </p>
                  )}
                </div>

                {disabledMessage && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">{disabledMessage}</p>
                  </div>
                )}

                {error && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                  </div>
                )}

                {info && (
                  <div className="flex items-start gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">{info}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:dark:bg-slate-700 text-white font-bold text-sm rounded-xl shadow-md shadow-blue-600/30 hover:shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : mode === 'signin' ? (
                    <LogIn className="w-4 h-4" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  <span>
                    {isSubmitting
                      ? 'Procesando...'
                      : mode === 'signin'
                        ? 'Entrar al dashboard'
                        : 'Crear cuenta'}
                  </span>
                </button>
              </form>

              <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={isResetting}
                  className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-[#64748B] dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50 transition-colors"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  {isResetting ? 'Enviando...' : '¿Olvidaste tu contraseña?'}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-[11px] text-[#94A3B8] dark:text-slate-600 text-center mt-6 leading-relaxed">
          Cada cuenta tiene sus propias propuestas, costos y análisis, aislados con
          Row Level Security en Supabase.
        </p>
      </div>
    </div>
  );
};