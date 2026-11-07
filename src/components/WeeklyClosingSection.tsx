import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatPesos, formatNumber } from '../lib/stats';
import { WeeklyMemberReport } from '../types/database';
import {
  Save,
  Check,
  Calendar,
  FileSpreadsheet,
  RefreshCw,
  UserCheck,
  Calculator,
  Clock,
  Coins,
  Award,
} from 'lucide-react';

interface DayBreakdown {
  dateStr: string;
  dayName: string;
  partnersCount: number;
  points: number;
  amount: number;
  hours: number;
}

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export const WeeklyClosingSection: React.FC = () => {
  const { teamMembers, currentMember, isAdmin } = useAuth();
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
  const MIN_START_WEEK = 46; // La planilla semanal comienza oficialmente desde la Semana 46 (Lunes 09/11)
  const [selectedWeek, setSelectedWeek] = useState<number>(() =>
    Math.max(MIN_START_WEEK, getISOWeek(new Date()))
  );
  const [selectedMemberId, setSelectedMemberId] = useState<string>(currentMember?.id || '');
  const [savedSuccess, setSavedSuccess] = useState<string | null>(null);
  const [isAutoCalculating, setIsAutoCalculating] = useState<boolean>(false);
  const [dailyBreakdown, setDailyBreakdown] = useState<DayBreakdown[]>([]);

  // Rango de fechas Lunes a Domingo para la semana ISO seleccionada
  const weekDays = useMemo(() => {
    const jan4 = new Date(currentYear, 0, 4);
    const dayOfWeek = (jan4.getDay() + 6) % 7; // Lunes = 0
    const mondayFirstWeek = new Date(jan4);
    mondayFirstWeek.setDate(jan4.getDate() - dayOfWeek);

    const targetMonday = new Date(mondayFirstWeek);
    targetMonday.setDate(mondayFirstWeek.getDate() + (selectedWeek - 1) * 7);

    const pad = (n: number) => n.toString().padStart(2, '0');
    const days: { dateStr: string; dayName: string; formattedDate: string }[] = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(targetMonday);
      d.setDate(targetMonday.getDate() + i);
      const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const formattedDate = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
      days.push({
        dateStr,
        dayName: DAY_NAMES[i],
        formattedDate,
      });
    }

    return days;
  }, [selectedWeek, currentYear]);

  const weekDateRange = useMemo(() => {
    const startStr = weekDays[0]?.dateStr || '';
    const endStr = weekDays[6]?.dateStr || '';
    return { startStr, endStr };
  }, [weekDays]);

  // Actualizar selección cuando cambie el captador logueado
  useEffect(() => {
    if (currentMember?.id && !selectedMemberId) {
      setSelectedMemberId(currentMember.id);
    }
  }, [currentMember?.id, selectedMemberId]);

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

  const loadWeekDataForMember = useCallback(
    async (member: typeof targetMember) => {
      if (!member) return;
      setIsAutoCalculating(true);

      try {
        // 1. Obtener socios de la base de datos de Supabase para toda la semana
        const { data: weekSocios } = await supabase
          .from('socios')
          .select('*')
          .gte('operational_date', weekDateRange.startStr)
          .lte('operational_date', weekDateRange.endStr);

        const memberFirstName = member.display_name.toLowerCase().split(' ')[0];

        // 2. Construir desglose diario (a partir de Semana 46)
        const breakdown: DayBreakdown[] = weekDays.map((wDay) => {
          const sociosOnDay = (weekSocios || []).filter((s) => {
            const matchesDate = s.operational_date === wDay.dateStr;
            const matchesMember =
              s.created_by === member.id ||
              s.created_by_name?.toLowerCase().includes(memberFirstName);
            return matchesDate && matchesMember;
          });

          const ptsOnDay = Number(sociosOnDay.reduce((acc, s) => acc + Number(s.points || 0), 0).toFixed(2));
          const amtOnDay = Number(sociosOnDay.reduce((acc, s) => acc + Number(s.amount || 0), 0).toFixed(2));
          const countOnDay = sociosOnDay.length;

          // Leer horas guardadas en localStorage por el captador en cada jornada
          let hrsOnDay = 0;
          const shiftKey = `msf_shifts_${wDay.dateStr}`;
          const savedShifts = localStorage.getItem(shiftKey);
          if (savedShifts) {
            try {
              const arr = JSON.parse(savedShifts);
              const sh = arr.find(
                (x: any) =>
                  x.team_member_id === member.id ||
                  x.team_member_name?.toLowerCase().includes(memberFirstName)
              );
              if (sh) hrsOnDay = Number(sh.hours_worked || 0);
            } catch {}
          }

          return {
            dateStr: wDay.dateStr,
            dayName: `${wDay.dayName} ${wDay.formattedDate}`,
            partnersCount: countOnDay,
            points: ptsOnDay,
            amount: amtOnDay,
            hours: hrsOnDay,
          };
        });

        setDailyBreakdown(breakdown);

        // 3. Totales de la semana
        const totalPts = Number(breakdown.reduce((acc, b) => acc + b.points, 0).toFixed(2));
        const totalAmt = Number(breakdown.reduce((acc, b) => acc + b.amount, 0).toFixed(2));
        const totalSocios = breakdown.reduce((acc, b) => acc + b.partnersCount, 0);
        const totalHrs = Number(breakdown.reduce((acc, b) => acc + b.hours, 0).toFixed(2));

        // 4. Si ya existía un reporte semanal guardado, cargar bajas
        const existing = weeklyReports.find(
          (r) =>
            r.member_id === member.id &&
            r.week_number === selectedWeek &&
            r.year === currentYear
        );

        setFormState({
          points_earned: totalPts.toString(),
          invalid_and_cancellations: existing ? existing.invalid_and_cancellations.toString() : '0',
          hours: totalHrs > 0 ? totalHrs.toString() : existing ? existing.hours.toString() : '0',
          total_amount: totalAmt.toString(),
          final_partners: totalSocios.toString(),
        });
      } catch (err) {
        console.warn('Error loading week data', err);
      } finally {
        setIsAutoCalculating(false);
      }
    },
    [weekDateRange, weekDays, selectedWeek, currentYear, weeklyReports]
  );

  useEffect(() => {
    if (targetMember) {
      loadWeekDataForMember(targetMember);
    }
  }, [selectedWeek, targetMember?.id, loadWeekDataForMember]);

  // Modificación de horas por día individual
  const handleUpdateDayHours = (dateStr: string, newHours: number) => {
    if (!targetMember) return;
    const cleanHours = Math.max(0, Math.min(24, newHours));

    // Actualizar breakdown
    const updatedBreakdown = dailyBreakdown.map((b) => {
      if (b.dateStr === dateStr) {
        return { ...b, hours: cleanHours };
      }
      return b;
    });
    setDailyBreakdown(updatedBreakdown);

    // Sumar total de horas de la semana
    const newTotalHours = Number(updatedBreakdown.reduce((acc, b) => acc + b.hours, 0).toFixed(2));
    setFormState((prev) => ({
      ...prev,
      hours: newTotalHours.toString(),
    }));

    // Persistir horas en localStorage para ese día
    try {
      const shiftKey = `msf_shifts_${dateStr}`;
      const saved = localStorage.getItem(shiftKey);
      let arr: any[] = saved ? JSON.parse(saved) : [];
      const memberFirstName = targetMember.display_name.toLowerCase().split(' ')[0];
      const idx = arr.findIndex(
        (x: any) =>
          x.team_member_id === targetMember.id ||
          x.team_member_name?.toLowerCase().includes(memberFirstName)
      );

      if (idx >= 0) {
        arr[idx].hours_worked = cleanHours;
      } else {
        arr.push({
          id: `shift-${dateStr}-${targetMember.id}`,
          operational_date: dateStr,
          team_member_id: targetMember.id,
          team_member_name: targetMember.display_name,
          hours_worked: cleanHours,
          is_present: cleanHours > 0,
        });
      }
      localStorage.setItem(shiftKey, JSON.stringify(arr));
    } catch (e) {
      console.warn('Error persisting day hours', e);
    }
  };

  // Fórmulas Automáticas y Exactas
  const points_earned = parseFloat(formState.points_earned) || 0;
  const invalid_and_cancellations = parseFloat(formState.invalid_and_cancellations) || 0;
  const final_points = Number((points_earned - invalid_and_cancellations).toFixed(2));
  const hours = parseFloat(formState.hours) || 0;
  const total_amount = parseFloat(formState.total_amount) || 0;
  const final_partners = parseInt(formState.final_partners, 10) || 0;

  // P/H Semanal = Puntos Finales de la semana / Horas Totales de la semana
  const points_per_hour = hours > 0 ? Number((final_points / hours).toFixed(2)) : null;

  // Promedio Dinero/Socio = Total Recaudado / Socios Finales
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
    setSavedSuccess(`¡Planilla semanal de ${targetMember.display_name} guardada exitosamente!`);
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
            Semana {selectedWeek} ({weekDateRange.startStr} al {weekDateRange.endStr}) • Auditoría Matemática Exacta
          </p>
        </div>

        {/* SELECTOR DE SEMANA (DESDE SEMANA 46) Y CAPTADOR */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-[#F7F3EE] p-1.5 rounded-xl border border-[#E2DBD0]">
            <Calendar className="w-4 h-4 text-neutral-500 ml-1" />
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(parseInt(e.target.value, 10))}
              className="text-xs font-black bg-white border border-[#E2DBD0] rounded-lg px-2.5 py-1 text-neutral-900 focus:outline-none cursor-pointer"
            >
              {Array.from({ length: 52 - MIN_START_WEEK + 1 }, (_, i) => MIN_START_WEEK + i).map((w) => (
                <option key={w} value={w}>
                  Semana {w} ({currentYear})
                </option>
              ))}
            </select>
          </div>

          {/* SELECTOR DE CAPTADOR: EXCLUSIVO DE ADMIN (CARLOS) */}
          {isAdmin ? (
            <div className="flex items-center gap-1.5 bg-[#F7F3EE] p-1.5 rounded-xl border border-[#E2DBD0]">
              <UserCheck className="w-4 h-4 text-[#D6001C] ml-1" />
              <select
                value={targetMember?.id || ''}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="text-xs font-black bg-white border border-[#E2DBD0] rounded-lg px-2.5 py-1 text-neutral-900 focus:outline-none cursor-pointer"
                title="Seleccionar captador para auditar planilla (Exclusivo Administrador)"
              >
                {activeMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name} {m.role === 'ADMIN' ? '(ADMIN)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-[#F7F3EE] px-3 py-1.5 rounded-xl border border-[#E2DBD0]">
              <UserCheck className="w-4 h-4 text-[#D6001C]" />
              <span className="text-xs font-black text-neutral-900">{targetMember?.display_name}</span>
            </div>
          )}
        </div>
      </div>

      {/* AVISO CLARO DE INICIO DESDE SEMANA 46 */}
      <div className="mb-4 p-3 bg-[#F7F3EE] border border-[#E2DBD0] rounded-xl flex items-center gap-2.5 text-xs text-neutral-700">
        <Calendar className="w-4 h-4 text-[#D6001C] flex-shrink-0" />
        <p className="font-medium">
          <strong className="font-black text-neutral-900">Planilla Semanal activa desde la Semana 46 (Lunes 09/11):</strong>{' '}
          A medida que registres tus socios y tus horas trabajadas cada día, esta planilla calculará tu promedio semanal automáticamente sin errores ni datos de semanas anteriores.
        </p>
      </div>

      {savedSuccess && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-800 animate-fadeIn">
          <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{savedSuccess}</span>
        </div>
      )}

      {/* 1. DESGLOSE DÍA POR DÍA DE LA SEMANA (FOTO 1 - PLANILLA DIARIA DE CONTROL) */}
      <div className="mb-6 bg-[#F7F3EE]/40 border border-[#E2DBD0] rounded-2xl p-3.5 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#D6001C] shrink-0" />
            <h4 className="text-xs font-black text-neutral-800 uppercase tracking-wider">
              REGISTRO DIARIO DE LA SEMANA: {targetMember?.display_name.toUpperCase()}
            </h4>
          </div>
          <span className="text-[11px] font-bold text-neutral-500">
            Ingresá las horas de cada día trabajado para que sumen automáticamente
          </span>
        </div>

        {/* VISTA MÓVIL COMPACTA DÍA POR DÍA */}
        <div className="space-y-2 sm:hidden">
          {dailyBreakdown.map((b) => (
            <div
              key={b.dateStr}
              className="p-2.5 bg-white rounded-xl border border-[#E2DBD0] flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-black text-neutral-900">{b.dayName}</span>
                  {b.dayName.toLowerCase().includes('sábado') && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                      Rotativo
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-neutral-500 mt-0.5 flex items-center gap-2">
                  <span>Socios: <strong className="text-neutral-800">{b.partnersCount}</strong></span>
                  <span>•</span>
                  <span>Pts: <strong className="text-[#D6001C]">{b.points.toFixed(1)}</strong></span>
                  <span>•</span>
                  <span className="truncate">{formatPesos(b.amount)}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <div className="inline-flex items-center gap-1">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="24"
                    value={b.hours || ''}
                    placeholder="0"
                    onChange={(e) =>
                      handleUpdateDayHours(b.dateStr, parseFloat(e.target.value) || 0)
                    }
                    className="w-12 h-8 text-xs text-center font-black text-neutral-900 bg-[#F7F3EE] border border-[#E2DBD0] rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
                  />
                  <span className="text-[10px] font-bold text-neutral-400">hs</span>
                </div>
                {b.hours === 0 ? (
                  <button
                    type="button"
                    onClick={() => handleUpdateDayHours(b.dateStr, 4)}
                    className="px-2 py-1 text-[10px] font-black rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-pointer"
                  >
                    +4h
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleUpdateDayHours(b.dateStr, 0)}
                    className="px-2 py-1 text-[10px] font-bold rounded-lg bg-neutral-100 text-neutral-600 border border-neutral-200 cursor-pointer"
                  >
                    0h
                  </button>
                )}
              </div>
            </div>
          ))}
          <div className="p-2.5 bg-[#F7F3EE] rounded-xl border border-[#E2DBD0] flex items-center justify-between text-xs font-black text-neutral-900">
            <span>TOTAL SEMANA:</span>
            <span>{final_partners} soc • {points_earned} pts • <strong className="text-[#D6001C]">{hours} hs</strong></span>
          </div>
        </div>

        {/* VISTA TABLA PARA TABLET Y PC */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[550px]">
            <thead>
              <tr className="border-b border-[#E2DBD0] text-[10px] font-black text-neutral-500 uppercase tracking-wider bg-white">
                <th className="py-2 px-2.5">Día y Fecha</th>
                <th className="py-2 px-2.5 text-center">Socios</th>
                <th className="py-2 px-2.5 text-center">Puntos</th>
                <th className="py-2 px-2.5 text-right">Recaudado</th>
                <th className="py-2 px-2.5 text-center text-[#D6001C]">Horas Trabajadas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2DBD0]/60 bg-white">
              {dailyBreakdown.map((b) => (
                <tr key={b.dateStr} className="hover:bg-[#F7F3EE]/40 transition-colors">
                  <td className="py-2.5 px-2.5 font-bold text-neutral-900">
                    <div className="flex items-center gap-1.5">
                      <span>{b.dayName}</span>
                      {b.dayName.toLowerCase().includes('sábado') && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                          Rotativo (2 pers.)
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-2.5 text-center font-bold">
                    {b.partnersCount > 0 ? (
                      <span className="inline-block px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-800">
                        {b.partnersCount}
                      </span>
                    ) : (
                      <span className="text-neutral-400">0</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2.5 text-center font-black text-neutral-800">
                    {b.points > 0 ? b.points.toFixed(1) : '0.0'}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-medium text-neutral-700">
                    {formatPesos(b.amount)}
                  </td>
                  <td className="py-2.5 px-2.5 text-center">
                    <div className="inline-flex items-center justify-center gap-1.5 flex-wrap">
                      <div className="inline-flex items-center gap-1">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="24"
                          value={b.hours || ''}
                          placeholder="0"
                          onChange={(e) =>
                            handleUpdateDayHours(b.dateStr, parseFloat(e.target.value) || 0)
                          }
                          className="w-14 text-center font-black text-neutral-900 bg-[#F7F3EE] border border-[#E2DBD0] rounded-lg py-1 px-1 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
                        />
                        <span className="text-[10px] font-bold text-neutral-400">hs</span>
                      </div>

                      {/* Botones de acción rápida: 4h o Franco (0h) */}
                      {b.hours === 0 ? (
                        <button
                          type="button"
                          onClick={() => handleUpdateDayHours(b.dateStr, 4)}
                          className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-pointer"
                          title="Cargar jornada de 4 horas"
                        >
                          +4h
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleUpdateDayHours(b.dateStr, 0)}
                          className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-neutral-100 hover:bg-amber-50 hover:text-amber-800 text-neutral-600 border border-neutral-200 cursor-pointer"
                          title="Marcar franco rotativo (0 horas)"
                        >
                          Franco (0h)
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#E2DBD0] bg-[#F7F3EE] font-black text-xs text-neutral-900">
                <td className="py-2.5 px-2.5 uppercase">Totales Semanales</td>
                <td className="py-2.5 px-2.5 text-center text-neutral-900">{final_partners} socios</td>
                <td className="py-2.5 px-2.5 text-center text-neutral-900">{points_earned} pts</td>
                <td className="py-2.5 px-2.5 text-right text-emerald-800">{formatPesos(total_amount)}</td>
                <td className="py-2.5 px-2.5 text-center text-[#D6001C] font-black">{hours} hs</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 2. PLANILLA SEMANAL OFICIAL (FOTO 2 - CIERRE DE SEMANA) */}
      <div className="bg-[#F7F3EE]/60 border-2 border-[#E2DBD0] rounded-2xl p-4 sm:p-5 mb-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-4 border-b border-[#E2DBD0] pb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#D6001C] shrink-0"></span>
            <span className="text-xs font-black uppercase text-neutral-800">
              PLANILLA DE CIERRE SEMANAL: {targetMember?.display_name.toUpperCase()} (SEMANA {selectedWeek})
            </span>
          </div>

          <button
            type="button"
            onClick={() => loadWeekDataForMember(targetMember)}
            disabled={isAutoCalculating}
            className="text-xs font-bold text-neutral-600 hover:text-[#D6001C] flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#E2DBD0] hover:bg-neutral-50 transition-colors cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAutoCalculating ? 'animate-spin' : ''}`} />
            <span>Recalcular datos</span>
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
            <span className="text-xl font-black text-[#D6001C]">
              {points_per_hour !== null ? formatNumber(points_per_hour) : 'N/D'}
            </span>
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

        {/* EXPLICACIÓN MATEMÁTICA Y AUDITORÍA EN TIEMPO REAL */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div className="p-3 bg-white rounded-xl border border-[#E2DBD0] flex items-center gap-2.5">
            <Award className="w-5 h-5 text-[#D6001C] flex-shrink-0" />
            <div>
              <span className="text-[10px] font-black uppercase text-neutral-500 block">FÓRMULA P/H SEMANAL</span>
              <p className="text-xs font-bold text-neutral-900">
                {final_points} pts finales ÷ {hours} hs totales ={' '}
                <span className="text-[#D6001C] font-black">
                  {points_per_hour !== null ? formatNumber(points_per_hour) : '0.00'} P/H
                </span>
              </p>
            </div>
          </div>

          <div className="p-3 bg-white rounded-xl border border-[#E2DBD0] flex items-center gap-2.5">
            <Coins className="w-5 h-5 text-emerald-700 flex-shrink-0" />
            <div>
              <span className="text-[10px] font-black uppercase text-neutral-500 block">
                FÓRMULA PROMEDIO RECAUDACIÓN
              </span>
              <p className="text-xs font-bold text-neutral-900">
                {formatPesos(total_amount)} ÷ {final_partners} socios ={' '}
                <span className="text-emerald-700 font-black">
                  {average_amount !== null ? formatPesos(average_amount) : '$0'} / socio
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* DINERO TOTAL RECAUDADO */}
        <div className="bg-white p-3.5 rounded-xl border border-[#E2DBD0] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-4">
          <div>
            <span className="text-[11px] font-black uppercase text-neutral-600 block">
              TOTAL DINERO RECAUDADO EN LA SEMANA
            </span>
            <span className="text-[11px] text-neutral-400">
              Suma de aportes de la semana: base para el cálculo del promedio
            </span>
          </div>
          <div className="w-full sm:w-40">
            <input
              type="number"
              step="1000"
              value={formState.total_amount}
              onChange={(e) => setFormState({ ...formState, total_amount: e.target.value })}
              className="w-full text-right text-base sm:text-lg font-black text-neutral-900 bg-[#F7F3EE] px-3 py-1.5 rounded-lg border border-neutral-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
            />
          </div>
        </div>

        {/* BOTÓN GUARDAR */}
        <button
          type="button"
          onClick={handleSave}
          className="w-full h-11 bg-[#D6001C] hover:bg-[#b80017] text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <Save className="w-4 h-4 shrink-0" />
          <span className="truncate">GUARDAR PLANILLA DE {targetMember?.display_name.toUpperCase()}</span>
        </button>
      </div>

      {/* 3. RESUMEN DE TODOS LOS CAPTADORES */}
      <div>
        <h4 className="text-xs font-black text-neutral-800 uppercase tracking-wider mb-2.5 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-neutral-600" />
          <span>PLANILLA SEMANA {selectedWeek} – EQUIPO COMPLETO</span>
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
                      {isAdmin || m.id === currentMember?.id ? (
                        <button
                          type="button"
                          onClick={() => setSelectedMemberId(m.id)}
                          className="text-[11px] font-bold text-neutral-600 hover:text-[#D6001C] underline cursor-pointer"
                        >
                          Ver / Editar
                        </button>
                      ) : (
                        <span className="text-[11px] text-neutral-400">—</span>
                      )}
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
