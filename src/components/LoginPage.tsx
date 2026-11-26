import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { normalizeUsername } from '../lib/authUtils';
import { LogIn, Eye, EyeOff, ShieldCheck, AlertCircle, Lock, User } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { signInWithCredentials, lastUsername } = useAuth();

  const [username, setUsername] = useState<string>(() => lastUsername || '');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeUsername(username);
    if (!normalized || !password.trim()) {
      setError('Por favor ingresá tu usuario y contraseña.');
      return;
    }

    // Cerrar teclado móvil y evitar que quede zoom activo al entrar
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    setError(null);
    setUsername(normalized);
    setIsSubmitting(true);
    const { error: authErr } = await signInWithCredentials(normalized, password);
    setIsSubmitting(false);

    if (authErr) {
      setError(typeof authErr === 'string' ? authErr : 'Usuario o contraseña incorrectos.');
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  };

  return (
    <div className="min-h-screen w-full min-w-0 overflow-x-clip bg-[#F7F3EE] text-neutral-900 flex flex-col justify-between p-4 sm:p-6 antialiased">
      {/* ESPACIADOR SUPERIOR PARA CENTRADO VERTICAL LIMPIO */}
      <div className="h-2" />

      {/* TARJETA CENTRAL DE LOGIN */}
      <div className="max-w-md w-full mx-auto my-auto py-4">
        <div className="bg-white rounded-3xl border border-[#E2DBD0] shadow-xl p-6 sm:p-8">
          {/* LOGO Y TÍTULO */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-[#D6001C] text-white font-black text-xl tracking-tighter flex items-center justify-center mx-auto mb-3 shadow-md shadow-red-500/20">
              MSF
            </div>
            <h1 className="text-lg sm:text-xl font-black text-neutral-900 tracking-tight">
              MÉDICOS SIN FRONTERAS
            </h1>
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mt-0.5">
              Control de Jornada &amp; Captación
            </p>
          </div>

          {/* AVISO PREVENTIVO */}
          <div className="mb-5 p-3 rounded-2xl bg-[#F7F3EE] border border-[#E2DBD0] flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-[#D6001C] shrink-0 mt-0.5" />
            <p className="text-[11px] sm:text-xs text-neutral-700 font-medium leading-relaxed">
              <strong className="font-black text-neutral-900">Identificación obligatoria:</strong> Ingresá con tu usuario y contraseña antes de cargar socios u horas para que queden registrados a tu nombre.
            </p>
          </div>

          {/* MENSAJE DE ERROR */}
          {error && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-xl bg-red-50 border-l-4 border-[#D6001C] flex items-center gap-2 text-xs font-bold text-red-700"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-[#D6001C]" />
              <span>{error}</span>
            </div>
          )}

          {/* FORMULARIO (text-base = 16px evita que iPhone/Android hagan zoom al escribir) */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="msf-login-username"
                className="block text-[11px] font-black text-neutral-600 uppercase tracking-wider mb-1.5"
              >
                Tu Usuario
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="msf-login-username"
                  type="text"
                  autoComplete="username"
                  placeholder="Ingresá tu usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full h-12 pl-10 pr-3 text-base font-bold text-neutral-900 bg-[#F7F3EE] border border-neutral-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D6001C] transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="msf-login-password"
                className="block text-[11px] font-black text-neutral-600 uppercase tracking-wider mb-1.5"
              >
                Contraseña
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="msf-login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Ingresá tu contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-12 pl-10 pr-12 text-base font-bold text-neutral-900 bg-[#F7F3EE] border border-neutral-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D6001C] transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-neutral-500 hover:text-neutral-800 rounded-lg cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-1">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[44px] h-12 bg-[#D6001C] hover:bg-[#b80017] disabled:bg-neutral-300 text-white font-black text-xs sm:text-sm uppercase tracking-wider rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 active:scale-[0.99] cursor-pointer"
              >
                {isSubmitting ? (
                  <span>Verificando acceso...</span>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Ingresar a la Jornada</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="text-center text-[11px] text-neutral-400 font-medium pb-2">
        Médicos Sin Fronteras Argentina • Equipo F2F
      </footer>
    </div>
  );
};
