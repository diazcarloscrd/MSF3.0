import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useWorkDay } from '../context/WorkDayContext';
import { formatBuenosAiresDate } from '../lib/stats';
import { Shield, UserCheck, Wifi, WifiOff, LogOut } from 'lucide-react';

export const Header: React.FC = () => {
  const { currentMember, teamMembers, simulateSelectMember, isAdmin, signOut } = useAuth();
  const { isConnected, activeWorkDay } = useWorkDay();

  const buenosAiresToday = formatBuenosAiresDate(
    activeWorkDay?.work_date ||
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
  );

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-neutral-200">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* LOGO & BRAND */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#D6001C] flex items-center justify-center text-white font-black text-sm tracking-tighter shadow-sm">
            MSF
          </div>
          <div>
            <h1 className="text-sm font-black text-neutral-900 tracking-tight leading-none">
              MÉDICOS SIN FRONTERAS
            </h1>
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-0.5">
              Control de Jornada 3.0 • {buenosAiresToday}
            </p>
          </div>
        </div>

        {/* SELECTOR DE CAPTADOR & STATUS */}
        <div className="flex items-center gap-2.5">
          {/* Status Realtime */}
          <div
            title={isConnected ? 'Conectado en tiempo real' : 'Reconectando con Supabase...'}
            className="flex items-center"
          >
            {isConnected ? (
              <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="hidden sm:inline">En Vivo</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                <WifiOff className="w-3 h-3 text-amber-600" />
                <span className="hidden sm:inline">Reconectando</span>
              </span>
            )}
          </div>

          {/* Selector de Usuario Activo */}
          <div className="flex items-center bg-neutral-100 rounded-xl p-1 border border-neutral-200">
            <UserCheck className="w-3.5 h-3.5 text-neutral-500 ml-1 mr-1" />
            <select
              value={currentMember?.id || ''}
              onChange={(e) => simulateSelectMember(e.target.value)}
              className="text-xs font-black bg-transparent text-neutral-900 pr-2 py-1 focus:outline-none cursor-pointer"
            >
              <option value="" disabled>
                Identificarse...
              </option>
              {teamMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.display_name} {member.role === 'ADMIN' ? '(ADMIN)' : ''}
                </option>
              ))}
            </select>
          </div>

          {currentMember && (
            <button
              onClick={signOut}
              title="Cerrar sesión"
              className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-100 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

