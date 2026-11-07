import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, Shield, UserCheck, ChevronDown, Check } from 'lucide-react';

export const Header: React.FC = () => {
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
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-2">
        {/* IZQUIERDA: SOLO LOGO MSF LIMPIO */}
        <div
          className="h-8 px-2.5 rounded-xl bg-[#D6001C] flex items-center justify-center text-white font-black text-xs tracking-tighter shadow-xs shrink-0 select-none"
          title="Médicos Sin Fronteras Argentina"
        >
          MSF
        </div>

        {/* DERECHA: LIBRITO INSTRUCTIVO, USUARIO / SELECTOR ADMIN Y BOTÓN SALIR */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* LIBRITO DEL INSTRUCTIVO */}
          <a
            href="/instructivo.html"
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir Instructivo de Uso"
            className="h-8 px-2.5 bg-white hover:bg-neutral-100 text-neutral-800 text-xs font-black rounded-xl border border-[#E2DBD0] shadow-2xs flex items-center justify-center gap-1 transition-all shrink-0"
          >
            <span className="text-sm leading-none">📘</span>
            <span className="hidden sm:inline text-[11px]">Instructivo</span>
          </a>

          {/* SI ES ADMIN (CARLOS): SELECTOR DESPLEGABLE LIMPIO SIN AUTO-ZOOM */}
          {isAdmin ? (
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="h-8 px-2.5 bg-white hover:bg-neutral-50 rounded-xl border border-[#E2DBD0] shadow-2xs flex items-center gap-1.5 text-xs font-black text-neutral-900 cursor-pointer transition-all"
                title="Cambiar captador activo (Exclusivo Administrador)"
              >
                <Shield className="w-3.5 h-3.5 text-[#D6001C] shrink-0" />
                <span className="max-w-[110px] sm:max-w-[150px] truncate">
                  {currentMember?.display_name}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-2xl border border-[#E2DBD0] shadow-xl py-1.5 z-50">
                  <div className="px-3 py-1 text-[10px] font-black uppercase tracking-wider text-neutral-400 border-b border-neutral-100">
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
                        className={`w-full px-3 py-2 text-left text-xs font-bold flex items-center justify-between hover:bg-[#F7F3EE] transition-colors cursor-pointer ${
                          isSelected ? 'text-[#D6001C] bg-red-50/50 font-black' : 'text-neutral-800'
                        }`}
                      >
                        <span>
                          {member.display_name} {member.role === 'ADMIN' ? '(Admin)' : ''}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-[#D6001C]" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* SI ES CAPTADOR: NOMBRE CONECTADO CLARO */
            <div className="h-8 flex items-center gap-1.5 bg-white px-2.5 rounded-xl border border-[#E2DBD0] shadow-2xs">
              <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="text-xs font-black text-neutral-800 max-w-[100px] sm:max-w-[150px] truncate">
                {currentMember?.display_name}
              </span>
            </div>
          )}

          {/* BOTÓN SALIR */}
          <button
            type="button"
            onClick={signOut}
            title={`Cerrar sesión (${currentMember?.display_name})`}
            className="h-8 px-2.5 bg-neutral-900 hover:bg-black text-white text-xs font-black rounded-xl shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span>Salir</span>
          </button>
        </div>
      </div>
    </header>
  );
};
