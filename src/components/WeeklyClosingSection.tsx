import React, { useState } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import { formatPesos, formatNumber } from '../lib/stats';
import { WeeklyMemberReport } from '../types/database';
import { Table, Save, Check, Calendar, Info, FileSpreadsheet } from 'lucide-react';

export const WeeklyClosingSection: React.FC = () => {
  const { teamMembers } = useAuth();
  const { weeklyReports, saveWeeklyReport } = useWorkDay();

  // Número de semana actual en el año
  const getWeekNumber = (date: Date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  };

  const currentYear = new Date().getFullYear();
  const [selectedWeek, setSelectedWeek] = useState<number>(getWeekNumber(new Date()));
  const [savedSuccess, setSavedSuccess] = useState<string | null>(null);

  // Estado editable por cada captador
  const [formData, setFormData] = useState<Record<string, {
    points_earned: string;
    invalid_and_cancellations: string;
    hours: string;
    total_amount: string;
    final_partners: string;
  }>>({});

  const activeMembers = teamMembers.filter(
    (m) => m.is_active && m.display_name.toLowerCase() !== 'morena'
  );

  const getMemberData = (memberId: string) => {
    if (formData[memberId]) return formData[memberId];

    const existing = weeklyReports.find(
      (r) => r.member_id === memberId && r.week_number === selectedWeek && r.year === currentYear
    );

    return {
      points_earned: existing ? existing.points_earned.toString() : '0',
      invalid_and_cancellations: existing ? existing.invalid_and_cancellations.toString() : '0',
      hours: existing ? existing.hours.toString() : '0',
      total_amount: existing ? existing.total_amount.toString() : '0',
      final_partners: existing ? existing.final_partners.toString() : '0',
    };
  };

  const handleChange = (memberId: string, field: string, val: string) => {
    const current = getMemberData(memberId);
    setFormData((prev) => ({
      ...prev,
      [memberId]: {
        ...current,
        [field]: val,
      },
    }));
  };

  const handleSaveRow = (memberId: string, memberName: string) => {
    const data = getMemberData(memberId);
    const points_earned = parseFloat(data.points_earned) || 0;
    const invalid_and_cancellations = parseFloat(data.invalid_and_cancellations) || 0;
    const final_points = Number((points_earned - invalid_and_cancellations).toFixed(2));
    const hours = parseFloat(data.hours) || 0;
    const total_amount = parseFloat(data.total_amount) || 0;
    const final_partners = parseInt(data.final_partners, 10) || 0;

    const points_per_hour = hours > 0 ? Number((final_points / hours).toFixed(2)) : null;
    const average_amount = final_partners > 0 ? Number((total_amount / final_partners).toFixed(2)) : null;

    const report: WeeklyMemberReport = {
      id: `report-${currentYear}-w${selectedWeek}-${memberId}`,
      week_number: selectedWeek,
      year: currentYear,
      member_id: memberId,
      member_name: memberName,
      points_earned,
      invalid_and_cancellations,
      final_points,
      hours,
      points_per_hour,
      total_amount,
      final_partners,
      average_amount,
      updated_at: new Date().toISOString(),
    };

    saveWeeklyReport(report);
    setSavedSuccess(`Planilla guardada para ${memberName}`);
    setTimeout(() => setSavedSuccess(null), 2500);
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E2DBD0] p-4 sm:p-6 shadow-sm mb-6">
      {/* CABECERA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h3 className="text-sm font-black text-neutral-900 uppercase tracking-wider flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#D6001C]" />
            PLANILLA DE CIERRE SEMANAL INDIVIDUAL
          </h3>
          <p className="text-xs text-neutral-500 font-medium mt-0.5">
            Cálculo automático de Puntos Finales, P/H y Promedio de aporte
          </p>
        </div>

        {/* SELECTOR DE SEMANA */}
        <div className="flex items-center gap-2 bg-[#F7F3EE] p-1.5 rounded-xl border border-[#E2DBD0]">
          <Calendar className="w-4 h-4 text-neutral-500 ml-1.5" />
          <span className="text-xs font-black text-neutral-700">Semana N°:</span>
          <select
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(parseInt(e.target.value, 10))}
            className="text-xs font-black bg-white border border-[#E2DBD0] rounded-lg px-2.5 py-1 text-neutral-900 focus:outline-none cursor-pointer"
          >
            {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => (
              <option key={w} value={w}>
                Semana {w} ({currentYear})
              </option>
            ))}
          </select>
        </div>
      </div>

      {savedSuccess && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-800 animate-fadeIn">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>{savedSuccess}</span>
        </div>
      )}

      {/* FORMULA INFO */}
      <div className="mb-4 p-3 bg-[#F7F3EE] rounded-xl border border-[#E2DBD0] flex items-start gap-2 text-[11px] text-neutral-600">
        <Info className="w-4 h-4 flex-shrink-0 text-[#D6001C] mt-0.5" />
        <div>
          <strong>Fórmulas automáticas del equipo:</strong><br />
          • <strong>Puntos finales</strong> = Puntos Brutos - Inválidas y bajas.<br />
          • <strong>P/H</strong> = Puntos Finales / Horas trabajadas.<br />
          • <strong>Promedio</strong> = Total dinero recaudado / Socios finales.
        </div>
      </div>

      {/* TABLA DE PLANILLA SEMANAL */}
      <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
        <table className="w-full text-left text-xs min-w-[760px]">
          <thead>
            <tr className="border-b border-[#E2DBD0] text-[10px] font-black text-neutral-500 uppercase tracking-wider bg-[#F7F3EE]/60">
              <th className="py-2.5 px-2">Captador</th>
              <th className="py-2.5 px-2 text-center">Puntos</th>
              <th className="py-2.5 px-2 text-center">Inválidas/Bajas</th>
              <th className="py-2.5 px-2 text-center bg-red-50 text-[#D6001C]">Pts Finales</th>
              <th className="py-2.5 px-2 text-center">Horas</th>
              <th className="py-2.5 px-2 text-center bg-red-50 text-[#D6001C]">P/H</th>
              <th className="py-2.5 px-2 text-center">Dinero Total</th>
              <th className="py-2.5 px-2 text-center">Socios Finales</th>
              <th className="py-2.5 px-2 text-center bg-emerald-50 text-emerald-800">Promedio ($)</th>
              <th className="py-2.5 px-2 text-center">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2DBD0]/60">
            {activeMembers.map((member) => {
              const data = getMemberData(member.id);
              const points_earned = parseFloat(data.points_earned) || 0;
              const invalid_and_cancellations = parseFloat(data.invalid_and_cancellations) || 0;
              const final_points = Number((points_earned - invalid_and_cancellations).toFixed(2));
              const hours = parseFloat(data.hours) || 0;
              const total_amount = parseFloat(data.total_amount) || 0;
              const final_partners = parseInt(data.final_partners, 10) || 0;

              const points_per_hour = hours > 0 ? Number((final_points / hours).toFixed(2)) : null;
              const average_amount = final_partners > 0 ? Number((total_amount / final_partners).toFixed(2)) : null;

              return (
                <tr key={member.id} className="hover:bg-[#F7F3EE]/40 transition-colors">
                  <td className="py-3 px-2 font-black text-neutral-900 whitespace-nowrap">
                    {member.display_name}
                  </td>

                  {/* Puntos brutos */}
                  <td className="py-3 px-1 text-center">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={data.points_earned}
                      onChange={(e) => handleChange(member.id, 'points_earned', e.target.value)}
                      className="w-16 h-8 text-center font-bold bg-[#F7F3EE] border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#D6001C]"
                    />
                  </td>

                  {/* Inválidas y bajas */}
                  <td className="py-3 px-1 text-center">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={data.invalid_and_cancellations}
                      onChange={(e) => handleChange(member.id, 'invalid_and_cancellations', e.target.value)}
                      className="w-16 h-8 text-center font-bold bg-[#F7F3EE] border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#D6001C]"
                    />
                  </td>

                  {/* Puntos Finales (Automático) */}
                  <td className="py-3 px-2 text-center font-black text-[#D6001C] bg-red-50/50">
                    {final_points}
                  </td>

                  {/* Horas */}
                  <td className="py-3 px-1 text-center">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={data.hours}
                      onChange={(e) => handleChange(member.id, 'hours', e.target.value)}
                      className="w-14 h-8 text-center font-bold bg-[#F7F3EE] border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#D6001C]"
                    />
                  </td>

                  {/* P/H (Automático) */}
                  <td className="py-3 px-2 text-center font-black text-[#D6001C] bg-red-50/50">
                    {formatNumber(points_per_hour)}
                  </td>

                  {/* Dinero Total */}
                  <td className="py-3 px-1 text-center">
                    <input
                      type="number"
                      step="1000"
                      min="0"
                      value={data.total_amount}
                      onChange={(e) => handleChange(member.id, 'total_amount', e.target.value)}
                      className="w-24 h-8 text-center font-bold bg-[#F7F3EE] border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#D6001C]"
                    />
                  </td>

                  {/* Socios Finales */}
                  <td className="py-3 px-1 text-center">
                    <input
                      type="number"
                      min="0"
                      value={data.final_partners}
                      onChange={(e) => handleChange(member.id, 'final_partners', e.target.value)}
                      className="w-14 h-8 text-center font-bold bg-[#F7F3EE] border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#D6001C]"
                    />
                  </td>

                  {/* Promedio (Automático = Total Dinero / Socios Finales) */}
                  <td className="py-3 px-2 text-center font-black text-emerald-800 bg-emerald-50/50">
                    {average_amount !== null ? formatPesos(average_amount) : 'N/D'}
                  </td>

                  {/* Botón Guardar fila */}
                  <td className="py-3 px-2 text-center">
                    <button
                      type="button"
                      onClick={() => handleSaveRow(member.id, member.display_name)}
                      className="p-1.5 bg-[#D6001C] hover:bg-[#b80017] text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1 mx-auto"
                      title="Guardar semana"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Guardar</span>
                    </button>
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
