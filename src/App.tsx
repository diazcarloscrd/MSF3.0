import React, { useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { WorkDayProvider } from './context/WorkDayContext';
import { Header } from './components/Header';
import { DayTopControls } from './components/DayTopControls';
import { PartnerRegistrationForm } from './components/PartnerRegistrationForm';
import { StatsDashboard } from './components/StatsDashboard';
import { IndividualPerformance } from './components/IndividualPerformance';
import { PartnersListWithCalendar } from './components/PartnersListWithCalendar';
import { DayClosureSection } from './components/DayClosureSection';
import { WeeklyClosingSection } from './components/WeeklyClosingSection';
import {
  LayoutDashboard,
  UserPlus,
  ListOrdered,
  FileSpreadsheet,
  CalendarCheck,
} from 'lucide-react';

const MainAppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'CARGA' | 'DASHBOARD' | 'SOCIOS' | 'CIERRE' | 'SEMANAL'>('CARGA');

  return (
    <div className="min-h-screen bg-[#F7F3EE] text-neutral-900 flex flex-col antialiased">
      <Header />

      {/* NAVEGACIÓN EN PESTAÑAS (OPTIMIZADA MOBILE-FIRST) */}
      <div className="sticky top-[53px] z-30 bg-[#F7F3EE]/95 backdrop-blur-md border-b border-[#E2DBD0] mb-5">
        <div className="max-w-4xl mx-auto px-4">
          <nav className="flex space-x-1.5 sm:space-x-2 py-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab('CARGA')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all flex-shrink-0 ${
                activeTab === 'CARGA'
                  ? 'bg-[#D6001C] text-white shadow-xs'
                  : 'bg-white/90 text-neutral-700 hover:bg-white border border-[#E2DBD0]'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Carga & Horas</span>
            </button>

            <button
              onClick={() => setActiveTab('DASHBOARD')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all flex-shrink-0 ${
                activeTab === 'DASHBOARD'
                  ? 'bg-[#D6001C] text-white shadow-xs'
                  : 'bg-white/90 text-neutral-700 hover:bg-white border border-[#E2DBD0]'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Estadísticas</span>
            </button>

            <button
              onClick={() => setActiveTab('SOCIOS')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all flex-shrink-0 ${
                activeTab === 'SOCIOS'
                  ? 'bg-[#D6001C] text-white shadow-xs'
                  : 'bg-white/90 text-neutral-700 hover:bg-white border border-[#E2DBD0]'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>Socios & Calendario</span>
            </button>

            <button
              onClick={() => setActiveTab('CIERRE')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all flex-shrink-0 ${
                activeTab === 'CIERRE'
                  ? 'bg-[#D6001C] text-white shadow-xs'
                  : 'bg-white/90 text-neutral-700 hover:bg-white border border-[#E2DBD0]'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Cierre WhatsApp</span>
            </button>

            <button
              onClick={() => setActiveTab('SEMANAL')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all flex-shrink-0 ${
                activeTab === 'SEMANAL'
                  ? 'bg-[#D6001C] text-white shadow-xs'
                  : 'bg-white/90 text-neutral-700 hover:bg-white border border-[#E2DBD0]'
              }`}
            >
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>Planilla Semanal</span>
            </button>
          </nav>
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL */}
      <main className="max-w-4xl mx-auto w-full px-4 pb-12 flex-1">
        {activeTab === 'CARGA' && (
          <div className="space-y-4">
            {/* 1. Cantidad de captadores y horas arriba en dos recuadros lado a lado */}
            <DayTopControls />

            {/* 2. Formulario de socios responsive optimizado */}
            <PartnerRegistrationForm />

            {/* 3. Historial de socios en la parte inferior */}
            <PartnersListWithCalendar />
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
      <footer className="border-t border-[#E2DBD0] bg-white/40 py-4 text-center text-xs text-neutral-500">
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
