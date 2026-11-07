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
  AlertCircle,
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

// Cálculo exacto ISO-8601 (semana y año ISO en hora de Buenos Aires)
export function getISOWeekAndYear(date: Date): { week: number; year: number } {
  const baStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(date);
  const [y, m, d] = baStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  const dayNr = (target.getUTCDay() + 6) % 7; // Lunes = 0, Domingo = 6
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // Jueves de esa semana ISO
  const isoYear = target.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / 604800000);
  return { week, year: isoYear };
}

export function getISOWeeksInYear(isoYear: number): number {
  const dec28 = new Date(Date.UTC(isoYear, 11, 28, 12, 0, 0));
  return getISOWeekAndYear(dec28).week;
}

export const WeeklyClosingSection: React.FC = () => {
  const { teamMembers, currentMember, isAdmin } = useAuth();
  const { weeklyReports, saveWeeklyReport, updateMemberHours } = useWorkDay();

  const nowIso = useMemo(() => getISOWeekAndYear(new Date()), []);
  const currentYear = nowIso.year;
  const maxWeeksInYear = useMemo(() => getISOWeeksInYear(currentYear), [currentYear]);
  const MIN_START_WEEK = 46; // Planilla activa a partir de la Semana 46 (Lunes 09/11/2026)

  const [selectedWeek, setSelectedWeek] = useState<number>(() =>
    currentYear === 2026 ? Math.max(MIN_START_WEEK, nowIso.week) : nowIso.week
  );
  const [selectedMemberId, setSelectedMemberId] = useState<string>(currentMember?.id || '');
  const [savedSuccess, setSavedSuccess] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSavingReport, setIsSavingReport] = useState<boolean>(false);
  const [isAutoCalculating, setIsAutoCalculating] = useState<boolean>(false);
  const [dailyBreakdown, setDailyBreakdown] = useState<DayBreakdown[]>([]);

  // Rango de fechas Lunes a Domingo para la semana ISO seleccionada
  const weekDays = useMemo(() => {
    const jan4 = new Date(Date.UTC(currentYear, 0, 4));
    const dayOfWeek = (jan4.getUTCDay() + 6) % 7; // Lunes = 0
    const mondayFirstWeek = new Date(jan4);
    mondayFirstWeek.setUTCDate(jan4.getUTCDate() - dayOfWeek);

    const targetMonday = new Date(mondayFirstWeek);
    targetMonday.setUTCDate(mondayFirstWeek.getUTCDate() + (selectedWeek - 1) * 7);

    const pad = (n: number) => n.toString().padStart(2, '0');
    const days: { dateStr: string; dayName: string; formattedDate: string }[] = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(targetMonday);
      d.setUTCDate(targetMonday.getUTCDate() + i);
      const dateStr = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      const formattedDate = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`;
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

  // Sincronizar captador seleccionado cuando cambia el integrante activo
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

  const canEditTargetMember = Boolean(
    targetMember && (isAdmin || targetMember.id === currentMember?.id)
  );

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
      setErrorMsg(null);

      try {
        // Consultar socios y horas diarias directamente desde PostgreSQL para toda la semana
        const [sociosRes, hoursRes] = await Promise.all([
          supabase
            .from('socios')
            .select('id, operational_date, amount, points, created_by, created_by_name')
            .gte('operational_date', weekDateRange.startStr)
            .lte('operational_date', weekDateRange.endStr),
          supabase
            .from('captor_daily_hours')
            .select('operational_date, user_id, hours_worked')
            .eq('user_id', member.id)
            .gte('operational_date', weekDateRange.startStr)
            .lte('operational_date', weekDateRange.endStr),
        ]);

        if (sociosRes.error) throw sociosRes.error;
        if (hoursRes.error) throw hoursRes.error;

        const weekSocios = sociosRes.data || [];
        const weekHours = hoursRes.data || [];
        const memberFirstName = member.display_name.toLowerCase().split(' ')[0];

        const breakdown: DayBreakdown[] = weekDays.map((wDay) => {
          const sociosOnDay = weekSocios.filter((s: any) => {
            const matchesDate = s.operational_date === wDay.dateStr;
            const matchesMember =
              s.created_by === member.id ||
              s.created_by_name?.toLowerCase() === member.display_name.toLowerCase() ||
              s.created_by_name?.toLowerCase().split(' ')[0] === memberFirstName;
            return matchesDate && matchesMember;
          });

          const ptsOnDay = Number(sociosOnDay.reduce((acc: number, s: any) => acc + Number(s.points || 0), 0).toFixed(2));
          const amtOnDay = Number(sociosOnDay.reduce((acc: number, s: any) => acc + Number(s.amount || 0), 0).toFixed(2));
          const countOnDay = sociosOnDay.length;

          const dbHourRow = weekHours.find((h: any) => h.operational_date === wDay.dateStr);
          const hrsOnDay = dbHourRow ? Number(dbHourRow.hours_worked || 0) : 0;

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

        const totalPts = Number(breakdown.reduce((acc, b) => acc + b.points, 0).toFixed(2));
        const totalAmt = Number(breakdown.reduce((acc, b) => acc + b.amount, 0).toFixed(2));
        const totalSocios = breakdown.reduce((acc, b) => acc + b.partnersCount, 0);
        const totalHrs = Number(breakdown.reduce((acc, b) => acc + b.hours, 0).toFixed(2));

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
      } catch (err: any) {
        console.warn('Error loading week data', err);
        setErrorMsg('No se pudieron cargar los datos semanales. Verificá tu conexión.');
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
  }, [selectedWeek, targetMember, loadWeekDataForMember]);

  // Modificación de horas por día individual persistida directamente en Supabase (captor_daily_hours)
  const handleUpdateDayHours = async (dateStr: string, newHours: number) => {
    if (!targetMember || !canEditTargetMember) return;
    const cleanHours = Math.max(0, Math.min(24, Number(newHours) || 0));
    setErrorMsg(null);

    const previousBreakdown = dailyBreakdown;
    const updatedBreakdown = dailyBreakdown.map((b) =>
      b.dateStr === dateStr ? { ...b, hours: cleanHours } : b
    );
    setDailyBreakdown(updatedBreakdown);

    const newTotalHours = Number(updatedBreakdown.reduce((acc, b) => acc + b.hours, 0).toFixed(2));
    setFormState((prev) => ({
      ...prev,
      hours: newTotalHours.toString(),
    }));

    const { error } = await updateMemberHours(targetMember.id, cleanHours, dateStr);
    if (error) {
      setDailyBreakdown(previousBreakdown);
      setErrorMsg(typeof error === 'string' ? error : 'Error al guardar las horas del día.');
    }
  };

  // Fórmulas Automáticas y Exactas
  const points_earned = parseFloat(formState.points_earned) || 0;
  const invalid_and_cancellations = parseFloat(formState.invalid_and_cancellations) || 0;
  const final_points = Number((points_earned - invalid_and_cancellations).toFixed(2));
  const hours = parseFloat(formState.hours) || 0;
  const total_amount = parseFloat(formState.total_amount) || 0;
  const final_partners = parseInt(formState.final_partners, 10) || 0;

  const points_per_hour = hours > 0 ? Number((final_points / hours).toFixed(2)) : null;
  const average_amount = final_partners > 0 ? Number((total_amount / final_partners).toFixed(2)) : null;

  const handleSave = async () => {
    if (!targetMember || !canEditTargetMember) return;
    setErrorMsg(null);
    setSavedSuccess(null);
    setIsSavingReport(true);

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

    const { error } = await saveWeeklyReport(report);
    setIsSavingReport(false);

    if (error) {
      setErrorMsg(typeof error === 'string' ? error : 'No se pudo guardar la planilla semanal.');
      return;
    }

    setSavedSuccess(`¡Planilla semanal de ${targetMember.display_name} guardada y sincronizada!`);
    setTimeout(() => setSavedSuccess(null), 3500);
  };

  const startWeekOption = currentYear === 2026 ? MIN_START_WEEK : 1;
  const weekOptions = Array.from(
    { length: Math.max(1, maxWeeksInYear - startWeekOption + 1) },
    (_, i) => startWeekOption + i
  );

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
            Semana {selectedWeek} ({weekDateRange.startStr} al {weekDateRange.endStr})
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
              {weekOptions.map((w) => (
                <option key={w} value={w}>
                  Semana {w} ({currentYear})
                </option>
              ))}
            </select>
          </div>

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

      {/* LEYENDA EXPLICATIVA PARA CAPTADORES */}
      <div className="mb-4 p-3 bg-[#F7F3EE] border border-[#E2DBD0] rounded-xl flex items-center gap-2.5 text-xs text-neutral-700">
        <Calendar className="w-4 h-4 text-[#D6001C] shrink-0" />
        <p className="font-medium">
          A medida que registres tus socios y tus horas trabajadas cada día, esta planilla calculará tu promedio semanal automáticamente.
        </p>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs font-bold text-red-700">
          <AlertCircle className="w-4 h-4 text-[#D6001C] shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {savedSuccess && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-800">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{savedSuccess}</span>
        </div>
      )}

      {/* 1. DESGLOSE DÍA POR DÍA DE LA SEMANA */}
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
                    disabled={!canEditTargetMember}
                    value={b.hours || ''}
                    placeholder="0"
                    onChange={(e) =>
                      handleUpdateDayHours(b.dateStr, parseFloat(e.target.value) || 0)
                    }
                    className="w-14 h-8 text-base sm:text-xs text-center font-black text-neutral-900 bg-[#F7F3EE] border border-[#E2DBD0] rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
                  />
                  <span className="text-[10px] font-bold text-neutral-400">hs</span>
                </div>
                {canEditTargetMember && (
                  b.hours === 0 ? (
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
                  )
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
                          disabled={!canEditTargetMember}
                          value={b.hours || ''}
                          placeholder="0"
                          onChange={(e) =>
                            handleUpdateDayHours(b.dateStr, parseFloat(e.target.value) || 0)
                          }
                          className="w-14 text-center font-black text-neutral-900 bg-[#F7F3EE] border border-[#E2DBD0] rounded-lg py-1 px-1 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
                        />
                        <span className="text-[10px] font-bold text-neutral-400">hs</span>
                      </div>

                      {canEditTargetMember && (
                        b.hours === 0 ? (
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
                        )
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

      {/* 2. PLANILLA SEMANAL OFICIAL */}
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

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-white p-3 rounded-xl border border-[#E2DBD0]">
            <span className="text-[10px] font-black uppercase text-neutral-500 block">SEMANA N°</span>
            <span className="text-xl font-black text-neutral-900">{selectedWeek}</span>
          </div>

          <div className="bg-white p-3 rounded-xl border border-[#E2DBD0]">
            <span className="text-[10px] font-black uppercase text-neutral-500 block">PUNTOS</span>
            <input
              type="number"
              step="0.1"
              disabled={!canEditTargetMember}
              value={formState.points_earned}
              onChange={(e) => setFormState({ ...formState, points_earned: e.target.value })}
              className="w-full text-xl font-black text-neutral-900 bg-transparent focus:outline-none border-b border-neutral-300 focus:border-[#D6001C]"
            />
          </div>

          <div className="bg-white p-3 rounded-xl border border-[#E2DBD0]">
            <span className="text-[10px] font-black uppercase text-neutral-500 block">INVÁLIDAS Y BAJAS</span>
            <input
              type="number"
              step="0.1"
              min="0"
              disabled={!canEditTargetMember}
              value={formState.invalid_and_cancellations}
              onChange={(e) => setFormState({ ...formState, invalid_and_cancellations: e.target.value })}
              className="w-full text-xl font-black text-neutral-900 bg-transparent focus:outline-none border-b border-neutral-300 focus:border-[#D6001C]"
            />
          </div>

          <div className="bg-red-50/70 p-3 rounded-xl border border-red-200">
            <span className="text-[10px] font-black uppercase text-[#D6001C] block">PUNTOS FINALES</span>
            <span className="text-xl font-black text-[#D6001C]">{final_points}</span>
          </div>

          <div className="bg-white p-3 rounded-xl border border-[#E2DBD0]">
            <span className="text-[10px] font-black uppercase text-neutral-500 block">HORAS</span>
            <input
              type="number"
              step="0.5"
              min="0"
              disabled={!canEditTargetMember}
              value={formState.hours}
              onChange={(e) => setFormState({ ...formState, hours: e.target.value })}
              className="w-full text-xl font-black text-neutral-900 bg-transparent focus:outline-none border-b border-neutral-300 focus:border-[#D6001C]"
            />
          </div>

          <div className="bg-red-50/70 p-3 rounded-xl border border-red-200">
            <span className="text-[10px] font-black uppercase text-[#D6001C] block">P / H</span>
            <span className="text-xl font-black text-[#D6001C]">
              {points_per_hour !== null ? formatNumber(points_per_hour) : 'N/D'}
            </span>
          </div>

          <div className="bg-white p-3 rounded-xl border border-[#E2DBD0]">
            <span className="text-[10px] font-black uppercase text-neutral-500 block">SOCIOS FINALES</span>
            <input
              type="number"
              min="0"
              disabled={!canEditTargetMember}
              value={formState.final_partners}
              onChange={(e) => setFormState({ ...formState, final_partners: e.target.value })}
              className="w-full text-xl font-black text-neutral-900 bg-transparent focus:outline-none border-b border-neutral-300 focus:border-[#D6001C]"
            />
          </div>

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
            <Award className="w-5 h-5 text-[#D6001C] shrink-0" />
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
            <Coins className="w-5 h-5 text-emerald-700 shrink-0" />
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
              min="0"
              disabled={!canEditTargetMember}
              value={formState.total_amount}
              onChange={(e) => setFormState({ ...formState, total_amount: e.target.value })}
              className="w-full text-right text-base sm:text-lg font-black text-neutral-900 bg-[#F7F3EE] px-3 py-1.5 rounded-lg border border-neutral-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
            />
          </div>
        </div>

        {canEditTargetMember && (
          <button
            type="button"
            disabled={isSavingReport}
            onClick={handleSave}
            className="w-full h-11 bg-[#D6001C] hover:bg-[#b80017] disabled:bg-neutral-300 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Save className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {isSavingReport
                ? 'GUARDANDO EN BASE DE DATOS...'
                : `GUARDAR PLANILLA DE ${targetMember?.display_name.toUpperCase()}`}
            </span>
          </button>
        )}
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
