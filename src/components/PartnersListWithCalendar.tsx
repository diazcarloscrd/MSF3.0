import React, { useState } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import { PAYMENT_METHOD_CONFIG } from '../types/database';
import { formatPesos, formatBuenosAiresDateTime, formatBuenosAiresDate } from '../lib/stats';
import { Trash2, Calendar as CalendarIcon, Filter, Clock } from 'lucide-react';

export const PartnersListWithCalendar: React.FC = () => {
  const {
    partners,
    deletePartner,
    isViewingHistory,
    selectedDate,
    setSelectedDate,
    availableDates,
  } = useWorkDay();
  const { currentMember, isAdmin } = useAuth();

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [filterMemberId, setFilterMemberId] = useState<string>('ALL');

  const filtered = partners.filter((p) => {
    if (filterMemberId !== 'ALL' && p.created_by_name !== filterMemberId && p.team_member_id !== filterMemberId) {
      return false;
    }
    return true;
  });

  const handleDelete = async (partnerId: string) => {
    await deletePartner(partnerId);
    setConfirmDeleteId(null);
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E2DBD0] p-4 sm:p-5 shadow-sm mb-6">
      {/* SELECTOR DE CALENDARIO / HISTORIAL */}
      <div className="p-3.5 bg-[#F7F3EE] rounded-xl border border-[#E2DBD0] mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-white rounded-lg text-[#D6001C] shadow-xs">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black text-neutral-900 uppercase tracking-wider">
              CONSULTAR POR FECHA / CALENDARIO
            </h4>
            <p className="text-[11px] text-neutral-500 font-medium">
              Viendo socios de: <strong className="text-neutral-800">{formatBuenosAiresDate(selectedDate)}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Selector nativo tipo date */}
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              if (e.target.value) setSelectedDate(e.target.value);
            }}
            className="h-10 px-3 text-xs font-black bg-white border border-[#E2DBD0] rounded-xl text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[#D6001C] cursor-pointer"
          />

          {isViewingHistory && (
            <button
              onClick={() => {
                const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
                setSelectedDate(today);
              }}
              className="h-10 px-3 bg-neutral-900 hover:bg-black text-white text-xs font-black rounded-xl whitespace-nowrap transition-all"
            >
              Hoy
            </button>
          )}
        </div>
      </div>

      {/* FECHAS DISPONIBLES RÁPIDAS */}
      {availableDates.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar mb-4 pb-1">
          <span className="text-[10px] font-black uppercase text-neutral-400 whitespace-nowrap mr-1">
            Días con socios:
          </span>
          {availableDates.slice(0, 7).map((d) => (
            <button
              key={d}
              onClick={() => setSelectedDate(d)}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
                selectedDate === d
                  ? 'bg-[#D6001C] text-white shadow-xs'
                  : 'bg-[#F7F3EE] text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              {formatBuenosAiresDate(d)}
            </button>
          ))}
        </div>
      )}

      {/* CABECERA Y FILTRO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pt-2 border-t border-neutral-100">
        <div>
          <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider flex items-center gap-2">
            HISTORIAL DE SOCIOS ({filtered.length})
          </h3>
          <p className="text-[11px] text-neutral-500 font-medium">
            Registros ordenados cronológicamente
          </p>
        </div>

        {/* Filtro por captador */}
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-neutral-400" />
          <select
            value={filterMemberId}
            onChange={(e) => setFilterMemberId(e.target.value)}
            className="text-xs font-bold bg-[#F7F3EE] border border-[#E2DBD0] rounded-lg px-2.5 py-1.5 text-neutral-800 focus:outline-none"
          >
            <option value="ALL">Todos los captadores</option>
            {Array.from(new Set(partners.map((p) => p.created_by_name || 'Captador'))).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* LISTADO */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-[#E2DBD0] rounded-xl">
          <p className="text-sm font-bold text-neutral-400">
            No se encontraron socios registrados para el {formatBuenosAiresDate(selectedDate)}.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((p) => {
            const config = PAYMENT_METHOD_CONFIG[p.payment_type] || {
              label: p.payment_type,
              points: p.points,
              badgeColor: 'bg-neutral-100 text-neutral-800',
            };

            const canDelete =
              isAdmin ||
              p.team_member_id === currentMember?.id ||
              p.created_by_name?.toLowerCase() === currentMember?.display_name.toLowerCase();

            const isConfirming = confirmDeleteId === p.id;

            return (
              <div
                key={p.id}
                className="p-3.5 rounded-xl border border-[#E2DBD0] bg-[#F7F3EE]/40 hover:bg-white transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-neutral-200 text-neutral-800 font-black text-xs flex items-center justify-center">
                    #{p.sequence_number}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black text-neutral-900">
                        {p.created_by_name || p.team_member?.display_name || 'Captador'}
                      </span>
                      <span className="text-[11px] font-bold text-neutral-600 bg-white px-2 py-0.5 rounded-md border border-[#E2DBD0]">
                        {p.age} años
                      </span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${config.badgeColor}`}>
                        {config.label} ({p.points} pt{p.points === 1 ? '' : 's'})
                      </span>
                    </div>

                    <div className="text-[11px] text-neutral-400 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatBuenosAiresDateTime(p.captured_at || p.created_at)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#E2DBD0]/60">
                  <span className="text-sm font-black text-neutral-900">
                    {formatPesos(p.contribution_amount || p.amount)}/mes
                  </span>

                  {canDelete && (
                    <div>
                      {isConfirming ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="px-2 py-1 text-[11px] font-black bg-[#D6001C] text-white rounded-lg hover:bg-red-700"
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 text-[11px] font-bold bg-neutral-200 text-neutral-700 rounded-lg"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(p.id)}
                          title="Eliminar socio"
                          className="p-1.5 text-neutral-400 hover:text-[#D6001C] rounded-lg hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
