import React, { useState, useEffect, useMemo } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatPesos, formatNumber } from '../lib/stats';
import { WeeklyMemberReport } from '../types/database';
import { Save, Check, Calendar, Info, FileSpreadsheet, RefreshCw, UserCheck } from 'lucide-react';

export const WeeklyClosingSection: React.FC = () => {
  const { teamMembers, currentMember } = useAuth();
  const { weeklyReports, saveWeeklyReport } = useWorkDay();

  // Cálculo exacto ISO-8601 de semana del año
  const getISOWeek = (date: Date) => {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7; // Lunes = 0, Domingo = 6
    target.setDate(target.getDate() - dayNr + 3); // Jueves más cercano
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  };

  const currentYear = new Date().getFullYear();
  const [selectedWeek, setSelectedWeek] = useState<number>(getISOWeek(new Date()));
  const [selectedMemberId, setSelectedMemberId] = useState<string>(currentMember?.id || '');
  const [savedSuccess, setSavedSuccess] = useState<string | null>(null);
  const [isAutoCalculating, setIsAutoCalculating] = useState<boolean>(false);

  // Rango de fechas Lunes a Domingo para la semana ISO seleccionada
  const weekDateRange = useMemo(() => {
    // Encontrar el lunes de la semana ISO
    const jan4 = new Date(currentYear, 0, 4);
    const dayOfWeek = (jan4.getDay() + 6) % 7; // Lunes = 0
    const mondayFirstWeek = new Date(jan4);
    mondayFirstWeek.setDate(jan4.getDate() - dayOfWeek);

    const targetMonday = new Date(mondayFirstWeek);
    targetMonday.setDate(mondayFirstWeek.getDate() + (selectedWeek - 1) * 7);

    const targetSunday = new Date(targetMonday);
    targetSunday.setDate(targetMonday.getDate() + 6);

    const pad = (n: number) => n.toString().padStart(2, '0');
    const startStr = `${targetMonday.getFullYear()}-${pad(targetMonday.getMonth() + 1)}-${pad(targetMonday.getDate())}`;
    const endStr = `${targetSunday.getFullYear()}-${pad(targetSunday.getMonth() + 1)}-${pad(targetSunday.getDate())}`;

    return { startStr, endStr };
  }, [selectedWeek, currentYear]);

  // Actualizar selección cuando cambie el captador logueado
  useEffect(() => {
    if (currentMember?.id) {
      setSelectedMemberId(currentMember.id);
    }
  }, [currentMember?.id]);

  const activeMembers = useMemo(() => {
    return teamMembers.filter((m) => m.is_active && m.display_name.toLowerCase() !== 'morena');
  }, [teamMembers]);

  const targetMember = useMemo(() => {
    return activeMembers.find((m) => m.id === selectedMemberId) || activeMembers[0];
  }, [activeMembers, selectedMemberId]);

  const [formState, setFormState] = useState<{
    points_earned: string;
    invalid_and_cancellations: string;
    hours: string;
    total_amount: string;
    final_partners: string;
  }>({
    points_earned: '0',
    invalid_and_cancellations: '0',
    hours: '0',
    total_amount: '0',
    final_partners: '0',
  });

  const loadWeekDataForMember = async (member: typeof targetMember) => {
    if (!member) return;

    // 1. Revisar si ya hay un reporte guardado para esta semana
    const existing = weeklyReports.find(
      (r) =>
        r.member_id === member.id &&
        r.week_number === selectedWeek &&
        r.year === currentYear
    );

    if (existing) {
      setFormState({
        points_earned: existing.points_earned.toString(),
        invalid_and_cancellations: existing.invalid_and_cancellations.toString(),
        hours: existing.hours.toString(),
        total_amount: existing.total_amount.toString(),
        final_partners: existing.final_partners.toString(),
      });
      return;
    }

    // 2. Si no hay reporte guardado, autocalcular con la base de datos de Supabase
    await autoAggregateFromDatabase(member);
  };

  const autoAggregateFromDatabase = async (member: typeof targetMember) => {
    if (!member) return;
    setIsAutoCalculating(true);
    try {
      // Buscar socios de ese captador en la semana (Lunes a Domingo)
      const { data: weekSocios } = await supabase
        .from('socios')
        .select('*')
        .gte('operational_date', weekDateRange.startStr)
        .lte('operational_date', weekDateRange.endStr);

      const memberSocios = (weekSocios || []).filter(
        (s) =>
          s.created_by === member.id ||
          s.created_by_name?.toLowerCase().includes(member.display_name.toLowerCase().split(' ')[0])
      );

      const totalPts = Number(memberSocios.reduce((sum, s) => sum + Number(s.points || 0), 0).toFixed(2));
      const totalAmt = Number(memberSocios.reduce((sum, s) => sum + Number(s.amount || 0), 0).toFixed(2));
      const totalSocios = memberSocios.length;

      // Buscar horas trabajadas en las jornadas de esa semana
      let totalHrs = 0;
      for (let i = 0; i <= 6; i++) {
        const d = new Date(weekDateRange.startStr + 'T12:00:00Z');
        d.setDate(d.getDate() + i);
        const pad = (n: number) => n.toString().padStart(2, '0');
        const dStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

        const saved = localStorage.getItem(`msf_shifts_${dStr}`);
        if (saved) {
          try {
            const arr = JSON.parse(saved);
            const sh = arr.find(
              (x: any) =>
                x.team_member_id === member.id ||
                x.team_member_name?.toLowerCase().includes(member.display_name.toLowerCase().split(' ')[0])
            );
            if (sh) totalHrs += Number(sh.hours_worked || 0);
          } catch {}
        }
      }

      setFormState({
        points_earned: totalPts.toString(),
        invalid_and_cancellations: '0',
        hours: totalHrs > 0 ? totalHrs.toString() : '0',
        total_amount: totalAmt.toString(),
        final_partners: totalSocios.toString(),
      });
    } catch (e) {
      console.warn('Error autocalculating week', e);
    } finally {
      setIsAutoCalculating(false);
    }
  };

  useEffect(() => {
    if (targetMember) {
      loadWeekDataForMember(targetMember);
    }
  }, [selectedWeek, targetMember?.id]);

  // Fórmulas Automáticas y Exactas
  const points_earned = parseFloat(formState.points_earned) || 0;
  const invalid_and_cancellations = parseFloat(formState.invalid_and_cancellations) || 0;
  const final_points = Number((points_earned - invalid_and_cancellations).toFixed(2));
  const hours = parseFloat(formState.hours) || 0;
  const total_amount = parseFloat(formState.total_amount) || 0;
  const final_partners = parseInt(formState.final_partners, 10) || 0;

  const points_per_hour = hours > 0 ? Number((final_points / hours).toFixed(2)) : null;
  const average_amount = final_partners > 0 ? Number((total_amount / final_partners).toFixed(2)) : null;

  const handleSave = () => {
    if (!targetMember) return;

    const report: WeeklyMemberReport = {
      id: `report-${currentYear}-w${selectedWeek}-${targetMember.id}`,
      week_number: selectedWeek,
      year: currentYear,
      member_id: targetMember.id,
      member_name: targetMember.display_name,
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
    setSavedSuccess(`¡Planilla semanal guardada para ${targetMember.display_name}!`);
    setTimeout(() => setSavedSuccess(null), 3000);
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E2DBD0] p-4 sm:p-6 shadow-sm mb-6">
      {/* CABECERA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h3 className="text-sm sm:text-base font-black text-neutral-900 uppercase tracking-wider flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-[#D6001C]" />
            PROMEDIO SEMANAL INDIVIDUAL
          </h3>
          <p className="text-xs text-neutral-500 font-medium mt-0.5">
            Semana {selectedWeek} ({weekDateRange.startStr} al {weekDateRange.endStr}) • Autocompletado exacto
          </p>
        </div>

        {/* SELECTOR DE SEMANA Y CAPTADOR */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-[#F7F3EE] p-1.5 rounded-xl border border-[#E2DBD0]">
            <Calendar className="w-4 h-4 text-neutral-500 ml-1" />
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

          <div className="flex items-center gap-1.5 bg-[#F7F3EE] p-1.5 rounded-xl border border-[#E2DBD0]">
            <UserCheck className="w-4 h-4 text-neutral-500 ml-1" />
            <select
              value={targetMember?.id || ''}
              onChange={(e) => setSelectedMemberId(e.target.value)}
              className="text-xs font-black bg-white border border-[#E2DBD0] rounded-lg px-2.5 py-1 text-neutral-900 focus:outline-none cursor-pointer"
            >
              {activeMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {savedSuccess && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-800 animate-fadeIn">
          <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{savedSuccess}</span>
        </div>
      )}

      {/* PLANILLA SEMANAL OFICIAL */}
      <div className="bg-[#F7F3EE]/50 border-2 border-[#E2DBD0] rounded-2xl p-4 sm:p-5 mb-5">
        <div className="flex items-center justify-between mb-4 border-b border-[#E2DBD0] pb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#D6001C]"></span>
            <span className="text-xs font-black uppercase text-neutral-800">
              PLANILLA DE CIERRE: {targetMember?.display_name} (SEMANA {selectedWeek})
            </span>
          </div>

          <button
            type="button"
            onClick={() => autoAggregateFromDatabase(targetMember)}
            disabled={isAutoCalculating}
            className="text-xs font-bold text-neutral-600 hover:text-[#D6001C] flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-[#E2DBD0] hover:bg-neutral-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAutoCalculating ? 'animate-spin' : ''}`} />
            <span>Recalcular con base de datos</span>
          </button>
        </div>

        {/* CAMPOS EXACTOS DE LA PLANILLA OFICIAL (FOTO 2) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {/* SEMANA N° */}
          <div className="bg-white p-3 rounded-xl border border-[#E2DBD0]">
            <span className="text-[10px] font-black uppercase text-neutral-500 block">SEMANA N°</span>
            <span className="text-xl font-black text-neutral-900">{selectedWeek}</span>
          </div>

          {/* PUNTOS BRUTOS */}
          <div className="bg-white p-3 rounded-xl border border-[#E2DBD0]">
            <span className="text-[10px] font-black uppercase text-neutral-500 block">PUNTOS</span>
            <input
              type="number"
              step="0.1"
              value={formState.points_earned}
              onChange={(e) => setFormState({ ...formState, points_earned: e.target.value })}
              className="w-full text-xl font-black text-neutral-900 bg-transparent focus:outline-none border-b border-neutral-300 focus:border-[#D6001C]"
            />
          </div>

          {/* INVALIDAS Y BAJAS */}
          <div className="bg-white p-3 rounded-xl border border-[#E2DBD0]">
            <span className="text-[10px] font-black uppercase text-neutral-500 block">INVÁLIDAS Y BAJAS</span>
            <input
              type="number"
              step="0.1"
              value={formState.invalid_and_cancellations}
              onChange={(e) => setFormState({ ...formState, invalid_and_cancellations: e.target.value })}
              className="w-full text-xl font-black text-neutral-900 bg-transparent focus:outline-none border-b border-neutral-300 focus:border-[#D6001C]"
            />
          </div>

          {/* PUNTOS FINALES (AUTOMÁTICO) */}
          <div className="bg-red-50/70 p-3 rounded-xl border border-red-200">
            <span className="text-[10px] font-black uppercase text-[#D6001C] block">PUNTOS FINALES</span>
            <span className="text-xl font-black text-[#D6001C]">{final_points}</span>
          </div>

          {/* HORAS */}
          <div className="bg-white p-3 rounded-xl border border-[#E2DBD0]">
            <span className="text-[10px] font-black uppercase text-neutral-500 block">HORAS</span>
            <input
              type="number"
              step="0.5"
              value={formState.hours}
              onChange={(e) => setFormState({ ...formState, hours: e.target.value })}
              className="w-full text-xl font-black text-neutral-900 bg-transparent focus:outline-none border-b border-neutral-300 focus:border-[#D6001C]"
            />
          </div>

          {/* P/H (AUTOMÁTICO) */}
          <div className="bg-red-50/70 p-3 rounded-xl border border-red-200">
            <span className="text-[10px] font-black uppercase text-[#D6001C] block">P / H</span>
            <span className="text-xl font-black text-[#D6001C]">{formatNumber(points_per_hour)}</span>
          </div>

          {/* SOCIOS FINALES */}
          <div className="bg-white p-3 rounded-xl border border-[#E2DBD0]">
            <span className="text-[10px] font-black uppercase text-neutral-500 block">SOCIOS FINALES</span>
            <input
              type="number"
              value={formState.final_partners}
              onChange={(e) => setFormState({ ...formState, final_partners: e.target.value })}
              className="w-full text-xl font-black text-neutral-900 bg-transparent focus:outline-none border-b border-neutral-300 focus:border-[#D6001C]"
            />
          </div>

          {/* PROMEDIO (AUTOMÁTICO: DINERO / SOCIOS FINALES) */}
          <div className="bg-emerald-50/80 p-3 rounded-xl border border-emerald-300">
            <span className="text-[10px] font-black uppercase text-emerald-800 block">PROMEDIO ($/SOCIO)</span>
            <span className="text-lg font-black text-emerald-800 truncate block">
              {average_amount !== null ? formatPesos(average_amount) : 'N/D'}
            </span>
          </div>
        </div>

        {/* DINERO TOTAL RECAUDADO */}
        <div className="bg-white p-3.5 rounded-xl border border-[#E2DBD0] flex items-center justify-between mb-4">
          <div>
            <span className="text-[11px] font-black uppercase text-neutral-600 block">
              TOTAL DINERO RECAUDADO EN LA SEMANA
            </span>
            <span className="text-[11px] text-neutral-400">
              Base para el cálculo del promedio (Total Dinero / Socios Finales)
            </span>
          </div>
          <div className="w-36">
            <input
              type="number"
              step="1000"
              value={formState.total_amount}
              onChange={(e) => setFormState({ ...formState, total_amount: e.target.value })}
              className="w-full text-right text-lg font-black text-neutral-900 bg-[#F7F3EE] px-3 py-1.5 rounded-lg border border-neutral-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
            />
          </div>
        </div>

        {/* BOTÓN GUARDAR */}
        <button
          type="button"
          onClick={handleSave}
          className="w-full h-12 bg-[#D6001C] hover:bg-[#b80017] text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          <span>GUARDAR PROMEDIO SEMANAL DE {targetMember?.display_name.toUpperCase()}</span>
        </button>
      </div>

      {/* RESUMEN DE TODOS LOS CAPTADORES */}
      <div>
        <h4 className="text-xs font-black text-neutral-800 uppercase tracking-wider mb-2.5">
          PLANILLA SEMANA {selectedWeek} – EQUIPO COMPLETO
        </h4>
        <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
          <table className="w-full text-left text-xs min-w-[700px]">
            <thead>
              <tr className="border-b border-[#E2DBD0] text-[10px] font-black text-neutral-500 uppercase tracking-wider bg-[#F7F3EE]/60">
                <th className="py-2 px-2">Captador</th>
                <th className="py-2 px-2 text-center">Puntos</th>
                <th className="py-2 px-2 text-center">Inv/Bajas</th>
                <th className="py-2 px-2 text-center text-[#D6001C]">Pts Finales</th>
                <th className="py-2 px-2 text-center">Horas</th>
                <th className="py-2 px-2 text-center text-[#D6001C]">P/H</th>
                <th className="py-2 px-2 text-center">Socios</th>
                <th className="py-2 px-2 text-right">Promedio ($)</th>
                <th className="py-2 px-2 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2DBD0]/60">
              {activeMembers.map((m) => {
                const rep = weeklyReports.find(
                  (r) => r.member_id === m.id && r.week_number === selectedWeek && r.year === currentYear
                );
                const isSelected = m.id === targetMember?.id;

                return (
                  <tr
                    key={m.id}
                    className={`hover:bg-[#F7F3EE]/50 transition-colors ${
                      isSelected ? 'bg-red-50/50 font-bold' : ''
                    }`}
                  >
                    <td className="py-2.5 px-2 font-black text-neutral-900">
                      {m.display_name}
                      {isSelected && (
                        <span className="ml-1.5 text-[9px] font-black px-1.5 py-0.5 rounded bg-[#D6001C] text-white">
                          ACTIVO
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-center">{rep ? rep.points_earned : '-'}</td>
                    <td className="py-2.5 px-2 text-center">{rep ? rep.invalid_and_cancellations : '-'}</td>
                    <td className="py-2.5 px-2 text-center font-black text-[#D6001C]">
                      {rep ? rep.final_points : '-'}
                    </td>
                    <td className="py-2.5 px-2 text-center">{rep ? `${rep.hours}h` : '-'}</td>
                    <td className="py-2.5 px-2 text-center font-black text-[#D6001C]">
                      {rep ? formatNumber(rep.points_per_hour) : '-'}
                    </td>
                    <td className="py-2.5 px-2 text-center font-black">{rep ? rep.final_partners : '-'}</td>
                    <td className="py-2.5 px-2 text-right font-black text-emerald-800">
                      {rep && rep.average_amount !== null ? formatPesos(rep.average_amount) : '-'}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedMemberId(m.id)}
                        className="text-[11px] font-bold text-neutral-600 hover:text-[#D6001C] underline"
                      >
                        Ver / Editar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
