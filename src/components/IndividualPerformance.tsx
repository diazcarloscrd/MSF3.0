import React, { useState } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import { formatPesos, formatNumber } from '../lib/stats';
import { Edit3, Check, X } from 'lucide-react';

export const IndividualPerformance: React.FC = () => {
  const { stats, shifts, updateMemberHours } = useWorkDay();
  const { isAdmin, currentMember } = useAuth();

  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editHoursVal, setEditHoursVal] = useState<string>('');

  if (!stats) return null;

  const handleStartEdit = (memberName: string, currentHours: number) => {
    setEditingMemberId(memberName);
    setEditHoursVal(currentHours.toString());
  };

  const handleSaveEdit = async (memberId: string) => {
    const hours = parseFloat(editHoursVal.replace(',', '.'));
    if (!isNaN(hours) && hours >= 0 && hours <= 24) {
      await updateMemberHours(memberId, hours);
    }
    setEditingMemberId(null);
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E2DBD0] p-4 sm:p-5 shadow-2xs mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider">
            RENDIMIENTO INDIVIDUAL DEL EQUIPO
          </h3>
          <p className="text-[11px] text-neutral-500 font-medium">
            Horas, socios, edad promedio, puntos acumulados y productividad
          </p>
        </div>
      </div>

      {/* VISTA EN TARJETAS COMPACTAS PARA MÓVILES (iPhone, Samsung, Motorola) */}
      <div className="grid grid-cols-1 gap-2.5 md:hidden">
        {stats.team_performance.map((m) => {
          const isMe = currentMember?.display_name.toLowerCase() === m.name.toLowerCase();
          const isEditing = editingMemberId === m.name;
          const matchingShift = shifts.find(
            (s) =>
              s.team_member?.display_name.toLowerCase() === m.name.toLowerCase() ||
              s.team_member_name?.toLowerCase() === m.name.toLowerCase()
          );
          const canEditHours = isAdmin || isMe;

          return (
            <div
              key={m.name}
              className={`p-3 rounded-xl border transition-all ${
                isMe
                  ? 'border-[#D6001C]/40 bg-red-50/30'
                  : 'border-[#E2DBD0] bg-[#F7F3EE]/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-[#E2DBD0]/60">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-neutral-900">{m.name}</span>
                  {isMe && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-[#D6001C] text-white">
                      TÚ
                    </span>
                  )}
                </div>

                {/* HORAS EDITABLES EN MÓVIL */}
                <div className="flex items-center gap-1.5">
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.5"
                        min={0}
                        max={24}
                        value={editHoursVal}
                        onChange={(e) => setEditHoursVal(e.target.value)}
                        className="w-16 h-8 text-base text-center font-bold bg-white border border-neutral-300 rounded-lg"
                      />
                      <button
                        onClick={() => matchingShift && handleSaveEdit(matchingShift.team_member_id)}
                        className="p-1 bg-emerald-600 text-white rounded-md"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setEditingMemberId(null)}
                        className="p-1 bg-neutral-200 text-neutral-600 rounded-md"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span
                        className={`text-[11px] font-black px-2 py-0.5 rounded-md ${
                          m.hours === 0
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-white text-neutral-800 border border-[#E2DBD0]'
                        }`}
                      >
                        {m.hours}h
                      </span>
                      {canEditHours && matchingShift && (
                        <button
                          onClick={() => handleStartEdit(m.name, m.hours)}
                          className="p-1 text-neutral-500 hover:text-[#D6001C] rounded-md bg-white border border-[#E2DBD0]"
                          title="Editar horas"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}

                  <span className="text-xs font-black text-[#D6001C] bg-red-50 border border-red-200 px-2 py-0.5 rounded-md">
                    {m.points} pts
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1.5 text-center text-[11px]">
                <div className="bg-white p-1.5 rounded-lg border border-[#E2DBD0]/60">
                  <span className="text-[9px] text-neutral-400 font-bold block uppercase">Socios</span>
                  <strong className="font-black text-neutral-900">{m.partners_count}</strong>
                </div>
                <div className="bg-white p-1.5 rounded-lg border border-[#E2DBD0]/60">
                  <span className="text-[9px] text-neutral-400 font-bold block uppercase">Pts/Hora</span>
                  <strong className="font-black text-[#D6001C]">{formatNumber(m.points_per_hour)}</strong>
                </div>
                <div className="bg-white p-1.5 rounded-lg border border-[#E2DBD0]/60">
                  <span className="text-[9px] text-neutral-400 font-bold block uppercase">Edad Prom</span>
                  <strong className="font-bold text-neutral-700">{m.average_age !== null ? `${m.average_age}a` : 'N/D'}</strong>
                </div>
                <div className="bg-white p-1.5 rounded-lg border border-[#E2DBD0]/60">
                  <span className="text-[9px] text-neutral-400 font-bold block uppercase">Recaudado</span>
                  <strong className="font-bold text-neutral-800 truncate block">{formatPesos(m.amount)}</strong>
                </div>
              </div>

              <div className="mt-1.5 flex items-center justify-between text-[10px] text-neutral-500 px-0.5">
                <span>
                  CC: <strong>{m.credit_card_count}</strong> • DB: <strong>{m.debit_card_count}</strong> • CBU: <strong>{m.bank_cbu_count}</strong> • PRE: <strong>{m.prepaid_wallet_count}</strong>
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
        <table className="w-full text-left text-xs min-w-[660px]">
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
              const isMe = currentMember?.display_name.toLowerCase() === m.name.toLowerCase();
              const isEditing = editingMemberId === m.name;
              const matchingShift = shifts.find(
                (s) =>
                  s.team_member?.display_name.toLowerCase() === m.name.toLowerCase() ||
                  s.team_member_name?.toLowerCase() === m.name.toLowerCase()
              );
              const canEditHours = isAdmin || isMe;

              return (
                <tr
                  key={m.name}
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
                      CC:{m.credit_card_count} • DB:{m.debit_card_count} • CBU:{m.bank_cbu_count} • PRE:{m.prepaid_wallet_count}
                    </div>
                  </td>

                  <td className="py-3 px-2 text-center">
                    {isEditing ? (
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="number"
                          step="0.5"
                          min={0}
                          max={24}
                          value={editHoursVal}
                          onChange={(e) => setEditHoursVal(e.target.value)}
                          className="w-14 h-7 text-center font-bold bg-[#F7F3EE] border border-neutral-300 rounded"
                        />
                        <button
                          onClick={() => matchingShift && handleSaveEdit(matchingShift.team_member_id)}
                          className="p-1 text-emerald-600 hover:text-emerald-800 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingMemberId(null)}
                          className="p-1 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1">
                        <span
                          className={`font-black ${
                            m.hours === 0 ? 'text-amber-600' : 'text-neutral-900'
                          }`}
                        >
                          {m.hours}h
                        </span>
                        {canEditHours && matchingShift && (
                          <button
                            onClick={() => handleStartEdit(m.name, m.hours)}
                            className="text-neutral-400 hover:text-[#D6001C] p-0.5 cursor-pointer"
                            title="Editar horas"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-2 text-center font-black text-neutral-900">
                    {m.partners_count}
                  </td>

                  <td className="py-3 px-2 text-center font-bold text-neutral-700 bg-neutral-50/50">
                    {m.average_age !== null ? `${m.average_age} a` : 'N/D'}
                  </td>

                  <td className="py-3 px-2 text-center">
                    <span className="font-black text-[#D6001C] px-2 py-0.5 rounded-full bg-red-50">
                      {m.points}
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
