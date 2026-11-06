import React, { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { WorkDay } from '../types/database';
import { useWorkDay } from '../context/WorkDayContext';
import { formatBuenosAiresDate } from '../lib/stats';
import { History, Calendar, ArrowLeft, ChevronRight, Lock } from 'lucide-react';

export const HistorySection: React.FC = () => {
  const { viewHistoricalDay, exitHistoricalView, isViewingHistory, activeWorkDay } = useWorkDay();
  const [days, setDays] = useState<WorkDay[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    if (!isSupabaseConfigured) {
      setDays([]);
      return;
    }
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('work_days')
        .select('*')
        .order('work_date', { ascending: false });

      if (!error && data) {
        setDays(data as WorkDay[]);
      }
    } catch (e) {
      console.warn('Error fetching work days history', e);
    } finally {
      setLoading(false);
    }
  };

  if (isViewingHistory) {
    return (
      <div className="bg-amber-500/10 border-2 border-amber-500 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-3 animate-fadeIn">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500 text-white rounded-xl">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider">
              CONSULTANDO JORNADA HISTÓRICA: {formatBuenosAiresDate(activeWorkDay?.work_date || '')}
            </h4>
            <p className="text-[11px] text-amber-800 font-medium">
              Estás visualizando datos archivados en modo solo lectura.
            </p>
          </div>
        </div>

        <button
          onClick={exitHistoricalView}
          className="w-full sm:w-auto px-4 py-2.5 bg-neutral-900 hover:bg-black text-white font-black text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          VOLVER A JORNADA ACTUAL
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider flex items-center gap-2">
            <History className="w-4 h-4 text-[#D6001C]" />
            HISTORIAL DE JORNADAS
          </h3>
          <p className="text-[11px] text-neutral-500 font-medium">
            Consultá jornadas anteriores sin alterar los datos actuales
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-6 text-xs text-neutral-400">Cargando historial...</div>
      ) : days.length === 0 ? (
        <div className="text-center py-6 text-xs text-neutral-400">
          No hay jornadas históricas archivadas aún. Al realizarse el cierre a las 00:00 se almacenarán aquí.
        </div>
      ) : (
        <div className="divide-y divide-neutral-100">
          {days.map((day) => (
            <div
              key={day.id}
              onClick={() => viewHistoricalDay(day)}
              className="py-3 px-2 flex items-center justify-between hover:bg-neutral-50 rounded-xl cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-neutral-100 rounded-lg text-neutral-600">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-black text-neutral-900 flex items-center gap-2">
                    {formatBuenosAiresDate(day.work_date)}
                    {day.status === 'CLOSED' ? (
                      <span className="text-[10px] font-bold text-neutral-500 flex items-center gap-0.5">
                        <Lock className="w-2.5 h-2.5" /> Cerrada
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-emerald-600">En curso</span>
                    )}
                  </div>
                  <div className="text-[11px] text-neutral-400">
                    Captadores declarados: {day.declared_collectors_count}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-neutral-400">
                <span className="text-xs font-bold text-neutral-600 hover:text-neutral-900 hidden sm:inline">
                  Ver detalle
                </span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
