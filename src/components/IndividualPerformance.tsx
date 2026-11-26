import React, { useState } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import {
  formatHours,
  formatNumber,
  formatPesos,
  formatPoints,
} from '../lib/stats';
import { StatsRangeResponse } from '../types/database';
import { Check, Edit3, X } from 'lucide-react';

interface IndividualPerformanceProps {
  rangeStats?: StatsRangeResponse | null;
}

export const IndividualPerformance: React.FC<IndividualPerformanceProps> = () => {
  const { stats, shifts, updateMemberHours } = useWorkDay();
  const { isAdmin, currentMember } = useAuth();

  const [editingMemberKey, setEditingMemberKey] = useState<string | null>(null);
  const [editHoursVal, setEditHoursVal] = useState<string>('');

  if (!stats) return null;

  const handleStartEdit = (memberKey: string, currentHours: number) => {
    setEditingMemberKey(memberKey);
    setEditHoursVal(currentHours.toString());
  };

  const handleSaveEdit = async (memberId: string) => {
    const hours = parseFloat(editHoursVal.replace(',', '.'));
    if (!isNaN(hours) && hours >= 0 && hours <= 24) {
      await updateMemberHours(memberId, hours);
    }
    setEditingMemberKey(null);
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E2DBD0] p-4 sm:p-5 shadow-2xs mb-6 w-full min-w-0">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider">
            RENDIMIENTO INDIVIDUAL DEL EQUIPO
          </h3>
          <p className="text-[11px] text-neutral-500 font-medium">
            Horas, socios, edad promedio, puntos acumulados y productividad de la jornada
          </p>
        </div>
      </div>

      {/* VISTA EN TARJETAS COMPACTAS PARA MÓVILES */}
      <div className="grid grid-cols-1 gap-2.5 md:hidden">
        {stats.team_performance.map((m) => {
          const memberKey = m.member_id || m.name;
          const isMe = Boolean(
            currentMember &&
              (m.member_id
                ? m.member_id === currentMember.id
                : currentMember.display_name.toLowerCase() === m.name.toLowerCase())
          );
          const isEditing = editingMemberKey === memberKey;
          const matchingShift = shifts.find(
            (s) =>
              (m.member_id && s.team_member_id === m.member_id) ||
              s.team_member?.display_name.toLowerCase() === m.name.toLowerCase() ||
              s.team_member_name?.toLowerCase() === m.name.toLowerCase()
          );
          const canEditHours = isAdmin || isMe;

          return (
            <div
              key={memberKey}
              className={`p-3 rounded-xl border transition-all ${
                isMe
                  ? 'border-[#D6001C]/40 bg-red-50/30'
                  : 'border-[#E2DBD0] bg-[#F7F3EE]/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-[#E2DBD0]/60 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-neutral-900">{m.name}</span>
                  {isMe && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-[#D6001C] text-white">
                      TÚ
                    </span>
                  )}
                </div>

                {/* HORAS EDITABLES EN MÓVIL */}
                <div className="flex items-center gap-2 flex-wrap">
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.5"
                        min={0}
                        max={24}
                        aria-label={`Horas trabajadas de ${m.name}`}
                        value={editHoursVal}
                        onChange={(e) => setEditHoursVal(e.target.value)}
                        className="w-20 min-h-[44px] text-base text-center font-bold bg-white border border-neutral-300 rounded-lg px-2"
                      />
                      <button
                        type="button"
                        aria-label={`Guardar horas de ${m.name}`}
                        onClick={() =>
                          matchingShift && handleSaveEdit(matchingShift.team_member_id)
                        }
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center bg-emerald-600 text-white rounded-lg cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Cancelar edición de horas de ${m.name}`}
                        onClick={() => setEditingMemberKey(null)}
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center bg-neutral-200 text-neutral-700 rounded-lg cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[11px] font-black px-2 py-1 rounded-md ${
                          m.hours === 0
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-white text-neutral-800 border border-[#E2DBD0]'
                        }`}
                      >
                        {formatHours(m.hours)}
                      </span>
                      {canEditHours && matchingShift && (
                        <button
                          type="button"
                          onClick={() => handleStartEdit(memberKey, m.hours)}
                          aria-label={`Editar horas de ${m.name}`}
                          title="Editar horas"
                          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-neutral-600 hover:text-[#D6001C] rounded-lg bg-white border border-[#E2DBD0] cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}

                  <span className="text-xs font-black text-[#D6001C] bg-red-50 border border-red-200 px-2 py-1 rounded-md">
                    {formatPoints(m.points)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1.5 text-center text-[11px]">
                <div className="bg-white p-1.5 rounded-lg border border-[#E2DBD0]/60">
                  <span className="text-[9px] text-neutral-400 font-bold block uppercase">
                    Socios
                  </span>
                  <strong className="font-black text-neutral-900">{m.partners_count}</strong>
                </div>
                <div className="bg-white p-1.5 rounded-lg border border-[#E2DBD0]/60">
                  <span className="text-[9px] text-neutral-400 font-bold block uppercase">
                    Pts/Hora
                  </span>
                  <strong className="font-black text-[#D6001C]">
                    {formatNumber(m.points_per_hour)}
                  </strong>
                </div>
                <div className="bg-white p-1.5 rounded-lg border border-[#E2DBD0]/60">
                  <span className="text-[9px] text-neutral-400 font-bold block uppercase">
                    Edad Prom
                  </span>
                  <strong className="font-bold text-neutral-700">
                    {m.average_age !== null ? `${formatNumber(m.average_age, 1)} a` : 'N/D'}
                  </strong>
                </div>
                <div className="bg-white p-1.5 rounded-lg border border-[#E2DBD0]/60">
                  <span className="text-[9px] text-neutral-400 font-bold block uppercase">
                    Recaudado
                  </span>
                  <strong className="font-bold text-neutral-800 truncate block">
                    {formatPesos(m.amount)}
                  </strong>
                </div>
              </div>

              <div className="mt-1.5 flex items-center justify-between text-[10px] text-neutral-500 px-0.5">
                <span>
                  CC: <strong>{m.credit_card_count}</strong> • DB:{' '}
                  <strong>{m.debit_card_count}</strong> • CBU: <strong>{m.bank_cbu_count}</strong>{' '}
                  • PRE: <strong>{m.prepaid_wallet_count}</strong>
                </span>
                <span>
                  Soc/h: <strong>{formatNumber(m.partners_per_hour)}</strong>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* VISTA EN TABLA PARA TABLETS Y COMPUTADORAS */}
      <div className="hidden md:block overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
        <table className="w-full text-left text-xs min-w-[680px]">
          <thead>
            <tr className="border-b border-[#E2DBD0] text-[10px] font-black text-neutral-500 uppercase tracking-wider bg-[#F7F3EE]/60">
              <th className="py-2.5 px-2">Captador</th>
              <th className="py-2.5 px-2 text-center">Horas</th>
              <th className="py-2.5 px-2 text-center">Socios</th>
              <th className="py-2.5 px-2 text-center">Edad Prom.</th>
              <th className="py-2.5 px-2 text-center">Puntos</th>
              <th className="py-2.5 px-2 text-right">Dinero</th>
              <th className="py-2.5 px-2 text-center">Socios/h</th>
              <th className="py-2.5 px-2 text-center">Pts/h</th>
              <th className="py-2.5 pl-2 text-right">Dinero/h</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2DBD0]/60">
            {stats.team_performance.map((m) => {
              const memberKey = m.member_id || m.name;
              const isMe = Boolean(
                currentMember &&
                  (m.member_id
                    ? m.member_id === currentMember.id
                    : currentMember.display_name.toLowerCase() === m.name.toLowerCase())
              );
              const isEditing = editingMemberKey === memberKey;
              const matchingShift = shifts.find(
                (s) =>
                  (m.member_id && s.team_member_id === m.member_id) ||
                  s.team_member?.display_name.toLowerCase() === m.name.toLowerCase() ||
                  s.team_member_name?.toLowerCase() === m.name.toLowerCase()
              );
              const canEditHours = isAdmin || isMe;

              return (
                <tr
                  key={memberKey}
                  className={`hover:bg-[#F7F3EE]/40 transition-colors ${
                    isMe ? 'bg-red-50/40 font-semibold' : ''
                  }`}
                >
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-black text-neutral-900">{m.name}</span>
                      {isMe && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-[#D6001C] text-white">
                          TÚ
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-neutral-400 mt-0.5">
                      CC:{m.credit_card_count} • DB:{m.debit_card_count} • CBU:{m.bank_cbu_count} •
                      PRE:{m.prepaid_wallet_count}
                    </div>
                  </td>

                  <td className="py-3 px-2 text-center">
                    {isEditing ? (
                      <div className="flex items-center justify-center gap-2">
                        <input
                          type="number"
                          step="0.5"
                          min={0}
                          max={24}
                          aria-label={`Horas trabajadas de ${m.name}`}
                          value={editHoursVal}
                          onChange={(e) => setEditHoursVal(e.target.value)}
                          className="w-16 min-h-[44px] text-center font-bold bg-[#F7F3EE] border border-neutral-300 rounded-lg px-2"
                        />
                        <button
                          type="button"
                          aria-label={`Guardar horas de ${m.name}`}
                          onClick={() =>
                            matchingShift && handleSaveEdit(matchingShift.team_member_id)
                          }
                          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Cancelar edición de horas de ${m.name}`}
                          onClick={() => setEditingMemberKey(null)}
                          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-neutral-600 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 rounded-lg cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <span
                          className={`font-black ${
                            m.hours === 0 ? 'text-amber-600' : 'text-neutral-900'
                          }`}
                        >
                          {formatHours(m.hours)}
                        </span>
                        {canEditHours && matchingShift && (
                          <button
                            type="button"
                            onClick={() => handleStartEdit(memberKey, m.hours)}
                            aria-label={`Editar horas de ${m.name}`}
                            title="Editar horas"
                            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-neutral-500 hover:text-[#D6001C] rounded-lg border border-transparent hover:border-[#E2DBD0] cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-2 text-center font-black text-neutral-900">
                    {m.partners_count}
                  </td>

                  <td className="py-3 px-2 text-center font-bold text-neutral-700 bg-neutral-50/50">
                    {m.average_age !== null ? `${formatNumber(m.average_age, 1)} a` : 'N/D'}
                  </td>

                  <td className="py-3 px-2 text-center">
                    <span className="font-black text-[#D6001C] px-2 py-0.5 rounded-full bg-red-50">
                      {formatPoints(m.points)}
                    </span>
                  </td>

                  <td className="py-3 px-2 text-right font-bold text-neutral-800">
                    {formatPesos(m.amount)}
                  </td>

                  <td className="py-3 px-2 text-center font-bold text-neutral-600">
                    {formatNumber(m.partners_per_hour)}
                  </td>

                  <td className="py-3 px-2 text-center font-black text-neutral-900">
                    {formatNumber(m.points_per_hour)}
                  </td>

                  <td className="py-3 pl-2 text-right font-bold text-neutral-700">
                    {m.amount_per_hour !== null ? formatPesos(m.amount_per_hour) : 'N/D'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default IndividualPerformance;
