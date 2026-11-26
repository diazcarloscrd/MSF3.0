import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, Shield, UserCheck, ChevronDown, Check } from 'lucide-react';

export interface HeaderProps {
  onBeforeSignOut?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onBeforeSignOut }) => {
  const {
    currentMember,
    teamMembers,
    simulateSelectMember,
    isAdmin,
    signOut,
  } = useAuth();

  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  return (
    <header className="border-b border-[#E2DBD0]/80">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-2 flex items-center justify-between gap-2 min-w-0">
        {/* IZQUIERDA: SOLO LOGO MSF LIMPIO */}
        <div
          className="min-h-[44px] px-3 rounded-xl bg-[#D6001C] flex items-center justify-center text-white font-black text-xs tracking-tighter shadow-xs shrink-0 select-none"
          title="Médicos Sin Fronteras Argentina"
        >
          MSF
        </div>

        {/* DERECHA: LIBRITO INSTRUCTIVO, USUARIO / SELECTOR ADMIN Y BOTÓN SALIR */}
        <div className="flex items-center justify-end gap-2 min-w-0 flex-wrap">
          {/* LIBRITO DEL INSTRUCTIVO */}
          <a
            href="/instructivo.html"
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir Instructivo de Uso"
            aria-label="Instructivo de uso"
            className="min-h-[44px] min-w-[44px] px-2.5 sm:px-3 bg-white hover:bg-neutral-100 text-neutral-800 text-xs font-black rounded-xl border border-[#E2DBD0] shadow-2xs flex items-center justify-center gap-1.5 transition-all shrink-0"
          >
            <span className="text-sm leading-none" aria-hidden="true">📘</span>
            <span className="hidden sm:inline text-[11px]">Instructivo</span>
          </a>

          {/* SI ES ADMIN: SELECTOR DESPLEGABLE LIMPIO SIN AUTO-ZOOM */}
          {isAdmin ? (
            <div className="relative min-w-0" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="min-h-[44px] min-w-[44px] px-2.5 sm:px-3 bg-white hover:bg-neutral-50 rounded-xl border border-[#E2DBD0] shadow-2xs flex items-center gap-1.5 text-xs font-black text-neutral-900 cursor-pointer transition-all"
                title="Cambiar captador activo (Exclusivo Administrador)"
              >
                <Shield className="w-3.5 h-3.5 text-[#D6001C] shrink-0" />
                <span className="max-w-[76px] sm:max-w-[160px] truncate">
                  {currentMember?.display_name}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 shrink-0 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-1.5 w-56 bg-white rounded-2xl border border-[#E2DBD0] shadow-xl py-1.5 z-50 max-h-80 overflow-y-auto">
                  <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-neutral-400 border-b border-neutral-100">
                    Cambiar Captador
                  </div>
                  {teamMembers.map((member) => {
                    const isSelected = member.id === currentMember?.id;
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => {
                          simulateSelectMember(member.id);
                          setMenuOpen(false);
                        }}
                        className={`w-full min-h-[44px] px-3 py-2 text-left text-xs font-bold flex items-center justify-between gap-2 hover:bg-[#F7F3EE] transition-colors cursor-pointer ${
                          isSelected ? 'text-[#D6001C] bg-red-50/50 font-black' : 'text-neutral-800'
                        }`}
                      >
                        <span className="truncate">
                          {member.display_name} {member.role === 'ADMIN' ? '(Admin)' : ''}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-[#D6001C] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* SI ES CAPTADOR: NOMBRE CONECTADO CLARO */
            <div className="min-h-[44px] flex items-center gap-1.5 bg-white px-2.5 sm:px-3 rounded-xl border border-[#E2DBD0] shadow-2xs min-w-0">
              <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="text-xs font-black text-neutral-800 max-w-[76px] sm:max-w-[160px] truncate">
                {currentMember?.display_name}
              </span>
            </div>
          )}

          {/* BOTÓN SALIR */}
          <button
            type="button"
            onClick={() => {
              onBeforeSignOut?.();
              signOut();
            }}
            title={`Cerrar sesión (${currentMember?.display_name})`}
            className="min-h-[44px] min-w-[44px] px-3 bg-neutral-900 hover:bg-black text-white text-xs font-black rounded-xl shadow-2xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span>Salir</span>
          </button>
        </div>
      </div>
    </header>
  );
};
