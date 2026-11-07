import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogIn, Eye, EyeOff, ShieldCheck, AlertCircle, Lock, User } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { signInWithCredentials } = useAuth();

  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Por favor ingresá tu usuario y contraseña.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    const { error: authErr } = await signInWithCredentials(username, password);
    setIsSubmitting(false);

    if (authErr) {
      setError(typeof authErr === 'string' ? authErr : 'Usuario o contraseña incorrectos.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F3EE] text-neutral-900 flex flex-col justify-between p-4 sm:p-6 antialiased">
      {/* BARRA SUPERIOR SIMPLE */}
      <div className="max-w-md w-full mx-auto pt-2 sm:pt-6 flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 border border-[#E2DBD0] shadow-xs">
          <span className="w-2 h-2 rounded-full bg-[#D6001C] animate-pulse"></span>
          <span className="text-[11px] font-black uppercase tracking-wider text-neutral-700">
            Sistema F2F • Versión 3.0
          </span>
        </div>

        <a
          href="/instructivo.html"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white hover:bg-neutral-100 border border-[#E2DBD0] text-[11px] font-black text-[#D6001C] shadow-xs transition-all"
        >
          <span>📘 Instructivo de Uso</span>
        </a>
      </div>

      {/* TARJETA CENTRAL DE LOGIN */}
      <div className="max-w-md w-full mx-auto my-auto py-6">
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
              Control de Jornada & Captación
            </p>
          </div>

          {/* AVISO PREVENTIVO */}
          <div className="mb-5 p-3 rounded-2xl bg-[#F7F3EE] border border-[#E2DBD0] flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-[#D6001C] shrink-0 mt-0.5" />
            <p className="text-[11px] sm:text-xs text-neutral-700 font-medium leading-relaxed">
              <strong className="font-black text-neutral-900">Identificación obligatoria:</strong> Ingresá con tu usuario antes de cargar socios u horas para que queden registrados a tu nombre.
            </p>
          </div>

          {/* MENSAJE DE ERROR */}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border-l-4 border-[#D6001C] flex items-center gap-2 text-xs font-bold text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#D6001C]" />
              <span>{error}</span>
            </div>
          )}

          {/* FORMULARIO */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-black text-neutral-600 uppercase tracking-wider mb-1.5">
                Tu Usuario (Nombre)
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  autoComplete="username"
                  placeholder="Ej: ariel, lucia, emilce..."
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full h-11 pl-10 pr-3 text-sm font-bold text-neutral-900 bg-[#F7F3EE] border border-neutral-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D6001C] transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-black text-neutral-600 uppercase tracking-wider mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Ingresá tu contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 pl-10 pr-10 text-sm font-bold text-neutral-900 bg-[#F7F3EE] border border-neutral-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D6001C] transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-1"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-1">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-11 bg-[#D6001C] hover:bg-[#b80017] disabled:bg-neutral-300 text-white font-black text-xs sm:text-sm uppercase tracking-wider rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 active:scale-[0.99] cursor-pointer"
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

          {/* ACCESO RÁPIDO DE NOMBRES (AYUDA VISUAL) */}
          <div className="mt-6 pt-4 border-t border-neutral-100">
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider text-center mb-2">
              Tocá tu nombre para autocompletar usuario
            </p>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {['Ariel', 'Lucia', 'Emilce', 'Selena', 'Brenda', 'Rosario', 'Nicolas', 'Carlos'].map((name) => {
                const lower = name.toLowerCase();
                const isSelected = username.toLowerCase() === lower;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setUsername(lower);
                      setError(null);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#D6001C] text-white shadow-xs'
                        : 'bg-[#F7F3EE] text-neutral-700 hover:bg-neutral-200 border border-[#E2DBD0]'
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="text-center text-[11px] text-neutral-400 font-medium pb-2">
        Médicos Sin Fronteras Argentina • Equipo F2F
      </footer>
    </div>
  );
};
