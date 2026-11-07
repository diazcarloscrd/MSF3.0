import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWorkDay } from '../context/WorkDayContext';
import { formatBuenosAiresDate } from '../lib/stats';
import { UserCheck, LogIn, LogOut, X, Shield } from 'lucide-react';

export const Header: React.FC = () => {
  const {
    currentMember,
    teamMembers,
    simulateSelectMember,
    isAdmin,
    isAuthenticated,
    signOut,
    showLoginModal,
    openLoginModal,
    closeLoginModal,
    signInWithCredentials,
  } = useAuth();
  const { isConnected, selectedDate } = useWorkDay();

  // Login form modal state
  const [loginUser, setLoginUser] = useState<string>('');
  const [loginPass, setLoginPass] = useState<string>('');
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginErr(null);
    setIsLoggingIn(true);
    const { error } = await signInWithCredentials(loginUser, loginPass);
    setIsLoggingIn(false);
    if (error) {
      setLoginErr(error);
    } else {
      setLoginUser('');
      setLoginPass('');
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-[#F7F3EE]/95 backdrop-blur-md border-b border-[#E2DBD0]">
        <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center justify-between">
          {/* BRAND */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#D6001C] flex items-center justify-center text-white font-black text-xs tracking-tighter shadow-sm">
              MSF
            </div>
            <div>
              <h1 className="text-xs sm:text-sm font-black text-neutral-900 tracking-tight leading-none">
                MÉDICOS SIN FRONTERAS
              </h1>
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mt-0.5">
                Control 3.0 • {formatBuenosAiresDate(selectedDate)}
              </p>
            </div>
          </div>

          {/* DERECHA: ESTADO, SELECTOR RÁPIDO DE ADMIN Y BOTÓN DINÁMICO LOGIN/LOGOUT */}
          <div className="flex items-center gap-2">
            {/* Live Indicator */}
            <div
              title={isConnected ? 'Sincronizado con Supabase en tiempo real' : 'Modo local activo'}
              className="flex items-center"
            >
              <span className="flex items-center gap-1 text-[10px] font-black text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-lg border border-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                <span className="hidden sm:inline">En Vivo</span>
              </span>
            </div>

            {/* MENÚ ADMINISTRADOR EXCLUSIVO: SOLO VISIBLE SI CARLOS (ADMIN) INICIÓ SESIÓN */}
            {isAuthenticated && isAdmin && (
              <div className="flex items-center bg-white rounded-xl px-2 py-1 border border-[#E2DBD0] shadow-xs">
                <Shield className="w-3.5 h-3.5 text-[#D6001C] mr-1" />
                <select
                  value={currentMember?.id || ''}
                  onChange={(e) => simulateSelectMember(e.target.value)}
                  className="text-xs font-black bg-transparent text-neutral-900 pr-1 py-0.5 focus:outline-none cursor-pointer max-w-[120px] sm:max-w-none"
                  title="Cambio rápido de captador (Exclusivo Administrador)"
                >
                  {teamMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.display_name} {member.role === 'ADMIN' ? '(ADMIN)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* BOTÓN DINÁMICO: SI ESTÁ LOGUEADO MUESTRA "CERRAR SESIÓN", SI NO MUESTRA "INICIAR SESIÓN" */}
            {isAuthenticated ? (
              <button
                type="button"
                onClick={signOut}
                title="Cerrar sesión del captador"
                className="px-2.5 py-1.5 bg-neutral-900 hover:bg-black text-white text-xs font-black rounded-xl shadow-xs flex items-center gap-1.5 transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Cerrar Sesión ({currentMember?.display_name})</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={openLoginModal}
                title="Iniciar sesión con contraseña"
                className="px-2.5 py-1.5 bg-[#D6001C] hover:bg-[#b80017] text-white text-xs font-black rounded-xl shadow-xs flex items-center gap-1.5 transition-all"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Iniciar Sesión</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* MODAL DE INICIO DE SESIÓN CON USUARIO Y CONTRASEÑA */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl border border-[#E2DBD0] shadow-xl max-w-sm w-full p-5 relative">
            <button
              onClick={closeLoginModal}
              className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-700 p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[#D6001C] text-white flex items-center justify-center font-black text-xs">
                MSF
              </div>
              <div>
                <h3 className="text-sm font-black text-neutral-900">Iniciar Sesión</h3>
                <p className="text-[11px] text-neutral-500 font-medium">Ingresá tu usuario y contraseña asignada</p>
              </div>
            </div>

            {loginErr && (
              <div className="mb-3 p-2.5 bg-red-50 border-l-4 border-[#D6001C] rounded-r-lg text-xs font-bold text-red-700">
                {loginErr}
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-black text-neutral-600 uppercase tracking-wider mb-1">
                  Usuario o Correo
                </label>
                <input
                  type="text"
                  placeholder="Ej: ariel, lucia, carlos"
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                  className="w-full h-11 px-3 text-xs font-bold bg-[#F7F3EE] border border-neutral-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-neutral-600 uppercase tracking-wider mb-1">
                  Contraseña
                </label>
                <input
                  type="password"
                  placeholder="Contraseña"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  className="w-full h-11 px-3 text-xs font-bold bg-[#F7F3EE] border border-neutral-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
                  required
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full h-11 bg-[#D6001C] hover:bg-[#b80017] disabled:bg-neutral-300 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5"
                >
                  {isLoggingIn ? 'Verificando...' : <><LogIn className="w-4 h-4" /> Entrar al Sistema</>}
                </button>
              </div>

              <p className="text-[10px] text-center text-neutral-400 mt-2">
                Médicos Sin Fronteras Argentina • Control de Jornada 3.0
              </p>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
