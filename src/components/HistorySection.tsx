import React from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { formatBuenosAiresDate } from '../lib/stats';
import { History, Calendar, ArrowLeft } from 'lucide-react';

export const HistorySection: React.FC = () => {
  const { isViewingHistory, selectedDate, setSelectedDate, availableDates } = useWorkDay();

  return (
    <div className="bg-white rounded-2xl border border-[#E2DBD0] p-4 sm:p-5 shadow-sm mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider flex items-center gap-2">
            <History className="w-4 h-4 text-[#D6001C]" />
            HISTORIAL DE JORNADAS
          </h3>
          <p className="text-[11px] text-neutral-500 font-medium">
            Seleccioná cualquier jornada anterior para revisar sus métricas y socios
          </p>
        </div>

        {isViewingHistory && (
          <button
            onClick={() => {
              const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
              setSelectedDate(today);
            }}
            className="px-3 py-1.5 bg-neutral-900 text-white font-black text-xs rounded-xl flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver a Hoy
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
        {availableDates.map((dateStr) => {
          const isSelected = selectedDate === dateStr;
          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => setSelectedDate(dateStr)}
              className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                isSelected
                  ? 'border-[#D6001C] bg-red-50 text-[#D6001C] font-black'
                  : 'border-[#E2DBD0] bg-[#F7F3EE]/50 hover:bg-[#F7F3EE] text-neutral-800 font-bold'
              }`}
            >
              <Calendar className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs">{formatBuenosAiresDate(dateStr)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
