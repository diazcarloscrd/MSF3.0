import React, { useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { WorkDayProvider, useWorkDay } from './context/WorkDayContext';
import { Header } from './components/Header';
import { PartnerRegistrationForm } from './components/PartnerRegistrationForm';
import { MyHoursCard } from './components/MyHoursCard';
import { CollectorsCountAdmin } from './components/CollectorsCountAdmin';
import { StatsDashboard } from './components/StatsDashboard';
import { IndividualPerformance } from './components/IndividualPerformance';
import { PartnersList } from './components/PartnersList';
import { DayClosureSection } from './components/DayClosureSection';
import { HistorySection } from './components/HistorySection';
import { LayoutDashboard, UserPlus, ListOrdered, FileSpreadsheet, History as HistoryIcon } from 'lucide-react';

const MainAppContent: React.FC = () => {
  const { isViewingHistory } = useWorkDay();
  const [activeTab, setActiveTab] = useState<'CARGA' | 'DASHBOARD' | 'SOCIOS' | 'CIERRE' | 'HISTORIAL'>('CARGA');

  return (
    <div className="min-h-screen bg-[#F7F4F3] text-neutral-900 flex flex-col antialiased">
      <Header />

      {/* HISTORIAL BANNER SI ESTÁ ACTIVO */}
      <div className="max-w-4xl mx-auto w-full px-4 pt-4">
        <HistorySection />
      </div>

      {/* NAVEGACIÓN EN PESTAÑAS (OPTIMIZADA MOBILE-FIRST) */}
      <div className="sticky top-[57px] z-30 bg-[#F7F4F3]/90 backdrop-blur-md border-b border-neutral-200/80 mb-5">
        <div className="max-w-4xl mx-auto px-4">
          <nav className="flex space-x-1 sm:space-x-2 py-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab('CARGA')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all flex-shrink-0 ${
                activeTab === 'CARGA'
                  ? 'bg-[#D6001C] text-white shadow-sm'
                  : 'bg-white/80 text-neutral-700 hover:bg-white'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Carga & Horas</span>
            </button>

            <button
              onClick={() => setActiveTab('DASHBOARD')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all flex-shrink-0 ${
                activeTab === 'DASHBOARD'
                  ? 'bg-[#D6001C] text-white shadow-sm'
                  : 'bg-white/80 text-neutral-700 hover:bg-white'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Estadísticas</span>
            </button>

            <button
              onClick={() => setActiveTab('SOCIOS')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all flex-shrink-0 ${
                activeTab === 'SOCIOS'
                  ? 'bg-[#D6001C] text-white shadow-sm'
                  : 'bg-white/80 text-neutral-700 hover:bg-white'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>Listado</span>
            </button>

            <button
              onClick={() => setActiveTab('CIERRE')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all flex-shrink-0 ${
                activeTab === 'CIERRE'
                  ? 'bg-[#D6001C] text-white shadow-sm'
                  : 'bg-white/80 text-neutral-700 hover:bg-white'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Cierre WhatsApp</span>
            </button>

            <button
              onClick={() => setActiveTab('HISTORIAL')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all flex-shrink-0 ${
                activeTab === 'HISTORIAL'
                  ? 'bg-[#D6001C] text-white shadow-sm'
                  : 'bg-white/80 text-neutral-700 hover:bg-white'
              }`}
            >
              <HistoryIcon className="w-3.5 h-3.5" />
              <span>Historial</span>
            </button>
          </nav>
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL */}
      <main className="max-w-4xl mx-auto w-full px-4 pb-12 flex-1">
        {activeTab === 'CARGA' && (
          <div className="space-y-4">
            <MyHoursCard />
            <PartnerRegistrationForm />
            <CollectorsCountAdmin />
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
            <PartnersList />
          </div>
        )}

        {activeTab === 'CIERRE' && (
          <div>
            <DayClosureSection />
          </div>
        )}

        {activeTab === 'HISTORIAL' && (
          <div>
            <HistorySection />
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="border-t border-neutral-200/80 bg-white/50 py-4 text-center text-xs text-neutral-400">
        Médicos Sin Fronteras Argentina • Sistema Interno de Captación 3.0 • Buenos Aires
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
