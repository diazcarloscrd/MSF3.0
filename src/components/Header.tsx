import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useWorkDay } from '../context/WorkDayContext';
import { formatBuenosAiresDate } from '../lib/stats';
import { LogOut, Shield, UserCheck } from 'lucide-react';

export const Header: React.FC = () => {
  const {
    currentMember,
    teamMembers,
    simulateSelectMember,
    isAdmin,
    signOut,
  } = useAuth();
  const { isConnected, selectedDate } = useWorkDay();

  return (
    <header className="border-b border-[#E2DBD0]/80">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-2">
        {/* BRAND */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#D6001C] flex items-center justify-center text-white font-black text-[11px] sm:text-xs tracking-tighter shadow-xs shrink-0">
            MSF
          </div>
          <div className="min-w-0">
            <h1 className="text-[11px] sm:text-sm font-black text-neutral-900 tracking-tight leading-tight truncate">
              MÉDICOS SIN FRONTERAS
            </h1>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider leading-tight truncate">
              Control 3.0 • {formatBuenosAiresDate(selectedDate)}
            </p>
          </div>
        </div>

        {/* DERECHA: ESTADO, USUARIO CONECTADO Y BOTÓN SALIR COMPACTO */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Live Indicator */}
          <div
            title={isConnected ? 'Sincronizado con Supabase en tiempo real' : 'Modo local activo'}
            className="flex items-center"
          >
            <span className="flex items-center gap-1 text-[10px] font-black text-emerald-800 bg-emerald-100/70 px-1.5 sm:px-2 py-1 rounded-lg border border-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
              <span className="hidden md:inline">En Vivo</span>
            </span>
          </div>

          {/* BOTÓN DE AYUDA / INSTRUCTIVO PDF */}
          <a
            href="/instructivo.html"
            target="_blank"
            rel="noopener noreferrer"
            title="Ver Instructivo de Uso (PDF / Guía)"
            className="px-2 py-1 bg-white hover:bg-neutral-100 text-neutral-700 text-[11px] font-black rounded-xl border border-[#E2DBD0] shadow-2xs flex items-center gap-1 transition-all shrink-0"
          >
            <span>📘</span>
            <span className="hidden lg:inline">Guía</span>
          </a>

          {/* SI ES ADMIN (CARLOS): SELECTOR RÁPIDO DE CAPTADOR */}
          {isAdmin ? (
            <div className="flex items-center bg-white rounded-xl px-2 py-1 border border-[#E2DBD0] shadow-2xs">
              <Shield className="w-3.5 h-3.5 text-[#D6001C] mr-1 shrink-0" />
              <select
                value={currentMember?.id || ''}
                onChange={(e) => simulateSelectMember(e.target.value)}
                className="text-[11px] sm:text-xs font-black bg-transparent text-neutral-900 pr-1 py-0.5 focus:outline-none cursor-pointer max-w-[105px] sm:max-w-[160px] truncate"
                title="Cambio rápido de captador (Exclusivo Administrador)"
              >
                {teamMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.display_name} {member.role === 'ADMIN' ? '(ADMIN)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            /* SI ES CAPTADOR: BADGE VISIBLE CON SU NOMBRE */
            <div className="flex items-center gap-1 bg-white px-2 sm:px-2.5 py-1 rounded-xl border border-[#E2DBD0] shadow-2xs">
              <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="text-[11px] sm:text-xs font-black text-neutral-800 max-w-[85px] sm:max-w-[140px] truncate">
                {currentMember?.display_name}
              </span>
            </div>
          )}

          {/* BOTÓN SALIR COMPACTO Y PROPORCIONADO */}
          <button
            type="button"
            onClick={signOut}
            title={`Cerrar sesión (${currentMember?.display_name})`}
            className="px-2 sm:px-2.5 py-1.5 bg-neutral-900 hover:bg-black text-white text-[11px] sm:text-xs font-black rounded-xl shadow-2xs flex items-center gap-1 transition-all cursor-pointer shrink-0"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </div>
    </header>
  );
};
