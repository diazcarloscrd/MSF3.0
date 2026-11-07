import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WorkDayProvider, useWorkDay } from './context/WorkDayContext';
import { Header } from './components/Header';
import { LoginPage } from './components/LoginPage';
import { DayTopControls } from './components/DayTopControls';
import { PartnerRegistrationForm } from './components/PartnerRegistrationForm';
import { TodayPartnersList } from './components/TodayPartnersList';
import { StatsDashboard } from './components/StatsDashboard';
import { IndividualPerformance } from './components/IndividualPerformance';
import { PartnersListWithCalendar } from './components/PartnersListWithCalendar';
import { DayClosureSection } from './components/DayClosureSection';
import { WeeklyClosingSection } from './components/WeeklyClosingSection';
import { formatBuenosAiresDate } from './lib/stats';
import {
  LayoutDashboard,
  UserPlus,
  ListOrdered,
  FileSpreadsheet,
  CalendarCheck,
  History,
  CheckCircle2,
} from 'lucide-react';

const MainAppContent: React.FC = () => {
  const { isAuthenticated, currentMember, loading: authLoading } = useAuth();
  const { isViewingHistory, selectedDate, exitHistoricalView, newDayNotice } = useWorkDay();
  const [activeTab, setActiveTab] = useState<'CARGA' | 'DASHBOARD' | 'SOCIOS' | 'CIERRE' | 'SEMANAL'>('CARGA');

  // Asegurar que al entrar o salir de la sesión se restablezca el zoom y el scroll en móviles
  useEffect(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      viewport.setAttribute(
        'content',
        'width=device-width, initial-scale=1.0, maximum-scale=1.0'
      );
      const timer = setTimeout(() => {
        viewport.setAttribute(
          'content',
          'width=device-width, initial-scale=1.0, maximum-scale=5.0'
        );
      }, 300);
      window.scrollTo(0, 0);
      return () => clearTimeout(timer);
    }
    window.scrollTo(0, 0);
  }, [isAuthenticated]);

  // Garantizar que la pestaña "Carga & Horas" siempre opere sobre la jornada activa de hoy
  useEffect(() => {
    if (activeTab === 'CARGA' && isViewingHistory) {
      exitHistoricalView();
    }
  }, [activeTab, isViewingHistory, exitHistoricalView]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F7F3EE] flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-[#D6001C] text-white font-black text-base tracking-tighter flex items-center justify-center shadow-md mb-3 animate-pulse">
          MSF
        </div>
        <p className="text-xs font-bold text-neutral-500">Verificando sesión...</p>
      </div>
    );
  }

  // Si el usuario no inició sesión con una sesión válida de Supabase, obligar LoginPage
  if (!isAuthenticated || !currentMember) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-[#F7F3EE] text-neutral-900 flex flex-col antialiased">
      {/* CONTENEDOR SUPERIOR STICKY UNIFICADO (EVITA SOLAPAMIENTOS EN CUALQUIER PANTALLA) */}
      <div className="sticky top-0 z-40 bg-[#F7F3EE]/95 backdrop-blur-md border-b border-[#E2DBD0] mb-4 sm:mb-5 shadow-2xs">
        <Header />

        {/* NAVEGACIÓN EN PESTAÑAS (ADAPTABLE A CUALQUIER CELULAR, TABLET O PC) */}
        <div className="max-w-4xl mx-auto px-3 sm:px-4">
          <nav className="flex items-center gap-1.5 sm:gap-2 py-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => {
                exitHistoricalView();
                setActiveTab('CARGA');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-black transition-all shrink-0 cursor-pointer ${
                activeTab === 'CARGA'
                  ? 'bg-[#D6001C] text-white shadow-xs'
                  : 'bg-white/90 text-neutral-700 hover:bg-white border border-[#E2DBD0]'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5 shrink-0" />
              <span>Carga & Horas</span>
            </button>

            <button
              onClick={() => setActiveTab('DASHBOARD')}
              className={`flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-black transition-all shrink-0 cursor-pointer ${
                activeTab === 'DASHBOARD'
                  ? 'bg-[#D6001C] text-white shadow-xs'
                  : 'bg-white/90 text-neutral-700 hover:bg-white border border-[#E2DBD0]'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
              <span>Estadísticas</span>
            </button>

            <button
              onClick={() => setActiveTab('SOCIOS')}
              className={`flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-black transition-all shrink-0 cursor-pointer ${
                activeTab === 'SOCIOS'
                  ? 'bg-[#D6001C] text-white shadow-xs'
                  : 'bg-white/90 text-neutral-700 hover:bg-white border border-[#E2DBD0]'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5 shrink-0" />
              <span>Socios & Calendario</span>
            </button>

            <button
              onClick={() => setActiveTab('CIERRE')}
              className={`flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-black transition-all shrink-0 cursor-pointer ${
                activeTab === 'CIERRE'
                  ? 'bg-[#D6001C] text-white shadow-xs'
                  : 'bg-white/90 text-neutral-700 hover:bg-white border border-[#E2DBD0]'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
              <span>Cierre WhatsApp</span>
            </button>

            <button
              onClick={() => setActiveTab('SEMANAL')}
              className={`flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-black transition-all shrink-0 cursor-pointer ${
                activeTab === 'SEMANAL'
                  ? 'bg-[#D6001C] text-white shadow-xs'
                  : 'bg-white/90 text-neutral-700 hover:bg-white border border-[#E2DBD0]'
              }`}
            >
              <CalendarCheck className="w-3.5 h-3.5 shrink-0" />
              <span>Planilla Semanal</span>
            </button>
          </nav>
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL */}
      <main className="max-w-4xl mx-auto w-full px-3 sm:px-4 pb-12 flex-1">
        {newDayNotice && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{newDayNotice}</span>
          </div>
        )}

        {isViewingHistory && (activeTab === 'DASHBOARD' || activeTab === 'CIERRE') && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
              <History className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                Consultando jornada histórica del <strong>{formatBuenosAiresDate(selectedDate)}</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={exitHistoricalView}
              className="px-3 py-1 bg-neutral-900 hover:bg-black text-white text-[11px] font-black rounded-lg cursor-pointer transition-colors"
            >
              Volver a Hoy
            </button>
          </div>
        )}

        {activeTab === 'CARGA' && (
          <div className="space-y-4">
            <DayTopControls />
            <PartnerRegistrationForm />
            <TodayPartnersList />
          </div>
        )}

        {activeTab === 'DASHBOARD' && (
          <div className="space-y-4">
            <StatsDashboard />
            <IndividualPerformance />
          </div>
        )}

        {activeTab === 'SOCIOS' && (
          <div>
            <PartnersListWithCalendar />
          </div>
        )}

        {activeTab === 'CIERRE' && (
          <div>
            <DayClosureSection />
          </div>
        )}

        {activeTab === 'SEMANAL' && (
          <div>
            <WeeklyClosingSection />
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="border-t border-[#E2DBD0] bg-white/40 py-4 px-4 text-center text-[11px] sm:text-xs text-neutral-500">
        Médicos Sin Fronteras Argentina • Sistema Interno de Captación 3.0 • F2F
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <WorkDayProvider>
        <MainAppContent />
      </WorkDayProvider>
    </AuthProvider>
  );
}
