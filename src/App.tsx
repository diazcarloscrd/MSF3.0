import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { TeamManagementSection } from './components/TeamManagementSection';
import { AuditLogSection } from './components/AuditLogSection';
import { formatBuenosAiresDate } from './lib/stats';
import { isValidPastOrTodayDate } from './lib/dateUtils';
import {
  LayoutDashboard,
  UserPlus,
  ListOrdered,
  FileSpreadsheet,
  CalendarCheck,
  History,
  CheckCircle2,
  Users,
  ClipboardList,
} from 'lucide-react';

type AppTab =
  | 'CARGA'
  | 'DASHBOARD'
  | 'SOCIOS'
  | 'CIERRE'
  | 'SEMANAL'
  | 'EQUIPO'
  | 'AUDITORIA';

const MainAppContent: React.FC = () => {
  const { isAuthenticated, currentMember, isAdmin, loading: authLoading } = useAuth();
  const {
    isViewingHistory,
    selectedDate,
    todayStr,
    exitHistoricalView,
    newDayNotice,
    loading: workDayLoading,
    hasInitialLoaded,
  } = useWorkDay();
  const [activeTab, setActiveTab] = useState<AppTab>('CARGA');
  const [cargaDateState, setCargaDateState] = useState<{
    memberId: string;
    date: string;
  } | null>(null);
  const [hoursSync, setHoursSync] = useState<{
    bump: number;
    date?: string;
    userId?: string;
    hours?: number;
  }>({ bump: 0 });
  const mainRef = useRef<HTMLElement>(null);

  const effectiveTab: AppTab =
    !isAdmin && (activeTab === 'EQUIPO' || activeTab === 'AUDITORIA')
      ? 'CARGA'
      : activeTab;

  const cargaTargetDate =
    isAuthenticated &&
    currentMember &&
    cargaDateState &&
    cargaDateState.memberId === currentMember.id &&
    isValidPastOrTodayDate(cargaDateState.date, todayStr)
      ? cargaDateState.date
      : todayStr;

  const handleCargaTargetDateChange = useCallback(
    (nextDate: string) => {
      if (!currentMember) return;
      const validDate = isValidPastOrTodayDate(nextDate, todayStr) ? nextDate : todayStr;
      setCargaDateState((prev) =>
        prev && prev.memberId === currentMember.id && prev.date === validDate
          ? prev
          : { memberId: currentMember.id, date: validDate }
      );
    },
    [currentMember, todayStr]
  );

  const handleHoursChanged = useCallback(
    (updatedDate?: string, updatedHours?: number) => {
      setHoursSync((prev) => ({
        bump: prev.bump + 1,
        date: updatedDate,
        userId: currentMember?.id,
        hours: updatedHours,
      }));
    },
    [currentMember?.id]
  );

  const resetScroll = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, []);

  // Restablecer foco y scroll al cambiar estado de autenticación
  useEffect(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    resetScroll();
  }, [isAuthenticated, resetScroll]);

  // Resetear scroll al cambiar de pestaña
  useEffect(() => {
    resetScroll();
  }, [effectiveTab, resetScroll]);

  // Garantizar que la pestaña "Carga & Horas" siempre opere sobre la jornada activa de hoy
  useEffect(() => {
    if (effectiveTab === 'CARGA' && isViewingHistory) {
      exitHistoricalView();
    }
  }, [effectiveTab, isViewingHistory, exitHistoricalView]);

  const handleSelectTab = (tab: AppTab) => {
    if (tab === 'CARGA') {
      exitHistoricalView();
    } else {
      setCargaDateState(null);
    }
    setActiveTab(tab);
    resetScroll();
  };

  if (authLoading) {
    return (
      <div className="min-h-screen w-full min-w-0 overflow-x-clip bg-[#F7F3EE] flex flex-col items-center justify-center p-4">
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

  const tabClass = (tab: AppTab) =>
    `min-h-[44px] flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] sm:text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
      effectiveTab === tab
        ? 'bg-[#D6001C] text-white shadow-xs'
        : 'bg-white/90 text-neutral-700 hover:bg-white border border-[#E2DBD0]'
    }`;

  return (
    <div className="min-h-screen w-full min-w-0 overflow-x-clip bg-[#F7F3EE] text-neutral-900 flex flex-col antialiased">
      {/* CONTENEDOR SUPERIOR STICKY UNIFICADO (EVITA SOLAPAMIENTOS EN CUALQUIER PANTALLA) */}
      <div className="sticky top-0 z-40 bg-[#F7F3EE]/95 backdrop-blur-md border-b border-[#E2DBD0] mb-4 sm:mb-5 shadow-2xs">
        <Header
          onBeforeSignOut={() => {
            setCargaDateState(null);
            setActiveTab('CARGA');
          }}
        />

        {/* NAVEGACIÓN EN PESTAÑAS (ADAPTABLE SIN RECORTE EN MÓVIL NI DESKTOP) */}
        <div className="max-w-4xl mx-auto px-3 sm:px-4">
          <nav className="flex flex-wrap items-center gap-2 py-2" aria-label="Navegación principal">
            <button
              type="button"
              onClick={() => handleSelectTab('CARGA')}
              className={tabClass('CARGA')}
            >
              <UserPlus className="w-3.5 h-3.5 shrink-0" />
              <span>Carga &amp; Horas</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('DASHBOARD')}
              className={tabClass('DASHBOARD')}
            >
              <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
              <span>Estadísticas</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('SOCIOS')}
              className={tabClass('SOCIOS')}
            >
              <ListOrdered className="w-3.5 h-3.5 shrink-0" />
              <span>Socios &amp; Calendario</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('CIERRE')}
              className={tabClass('CIERRE')}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
              <span>Cierre WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('SEMANAL')}
              className={tabClass('SEMANAL')}
            >
              <CalendarCheck className="w-3.5 h-3.5 shrink-0" />
              <span>Planilla Semanal</span>
            </button>

            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => handleSelectTab('EQUIPO')}
                  className={tabClass('EQUIPO')}
                >
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span>Equipo</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectTab('AUDITORIA')}
                  className={tabClass('AUDITORIA')}
                >
                  <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                  <span>Auditoría</span>
                </button>
              </>
            )}
          </nav>
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL */}
      <main ref={mainRef} className="max-w-4xl mx-auto w-full min-w-0 px-3 sm:px-4 pb-12 flex-1">
        {newDayNotice && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{newDayNotice}</span>
          </div>
        )}

        {isViewingHistory && (effectiveTab === 'DASHBOARD' || effectiveTab === 'CIERRE') && (
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
              className="min-h-[44px] px-3.5 py-2 bg-neutral-900 hover:bg-black text-white text-xs font-black rounded-xl cursor-pointer transition-colors"
            >
              Volver a Hoy
            </button>
          </div>
        )}

        {!hasInitialLoaded && workDayLoading ? (
          <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Cargando jornada">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="h-28 rounded-2xl bg-white border border-[#E2DBD0] p-4 space-y-3">
                <div className="h-4 w-32 bg-[#EFE9E0] rounded" />
                <div className="h-7 w-24 bg-[#EFE9E0] rounded" />
              </div>
              <div className="h-28 rounded-2xl bg-white border border-[#E2DBD0] p-4 space-y-3">
                <div className="h-4 w-36 bg-[#EFE9E0] rounded" />
                <div className="h-7 w-24 bg-[#EFE9E0] rounded" />
              </div>
            </div>
            <div className="rounded-2xl bg-white border border-[#E2DBD0] p-5 space-y-4">
              <div className="h-5 w-48 bg-[#EFE9E0] rounded" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-11 bg-[#EFE9E0] rounded-xl" />
                <div className="h-11 bg-[#EFE9E0] rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="h-16 bg-[#EFE9E0] rounded-xl" />
                <div className="h-16 bg-[#EFE9E0] rounded-xl" />
              </div>
              <div className="h-11 bg-[#EFE9E0] rounded-xl" />
            </div>
          </div>
        ) : (
          <>
            {effectiveTab === 'CARGA' && (
              <div className="space-y-4">
                <DayTopControls
                  targetDate={cargaTargetDate}
                  hoursSync={hoursSync}
                  onHoursChanged={handleHoursChanged}
                />
                <PartnerRegistrationForm
                  onTargetDateChange={handleCargaTargetDateChange}
                  hoursSync={hoursSync}
                  onHoursChanged={handleHoursChanged}
                />
                <TodayPartnersList />
              </div>
            )}

            {effectiveTab === 'DASHBOARD' && (
              <div className="space-y-4">
                <StatsDashboard />
                <IndividualPerformance />
              </div>
            )}

            {effectiveTab === 'SOCIOS' && (
              <div>
                <PartnersListWithCalendar />
              </div>
            )}

            {effectiveTab === 'CIERRE' && (
              <div>
                <DayClosureSection />
              </div>
            )}

            {effectiveTab === 'SEMANAL' && (
              <div>
                <WeeklyClosingSection />
              </div>
            )}

            {isAdmin && effectiveTab === 'EQUIPO' && (
              <div>
                <TeamManagementSection />
              </div>
            )}

            {isAdmin && effectiveTab === 'AUDITORIA' && (
              <div>
                <AuditLogSection />
              </div>
            )}
          </>
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
