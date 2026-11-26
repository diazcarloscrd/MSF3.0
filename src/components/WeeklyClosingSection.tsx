import React, { useEffect, useMemo, useState } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  calculateHybridWeeklyData,
  downloadCsv,
  exportWeeklyToCsv,
  formatHours,
  formatNumber,
  formatPesos,
  formatPoints,
  generateWeeklyWhatsAppReport,
} from '../lib/stats';
import {
  formatBuenosAiresDate,
  getISOWeekAndYear,
  getISOWeekDateRange,
  getISOWeekDays,
  getISOWeeksInYear,
} from '../lib/dateUtils';
import { WeeklyMemberReport } from '../types/database';
import {
  AlertCircle,
  Award,
  Calculator,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Copy,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Save,
  UserCheck,
} from 'lucide-react';

interface DayBreakdown {
  dateStr: string;
  dayName: string;
  partnersCount: number;
  points: number;
  amount: number;
  hours: number;
}

interface WeekSocioRow {
  id: string;
  operational_date: string;
  amount: number;
  points: number;
  created_by: string | null;
  created_by_name?: string;
}

interface WeekHourRow {
  operational_date: string;
  user_id: string;
  hours_worked: number;
}

interface FormState {
  points_earned: string;
  invalid_and_cancellations: string;
  hours: string;
  total_amount: string;
  final_partners: string;
}

const MIN_START_WEEK_2026 = 46; // Planilla activa a partir de la Semana 46 (Lunes 09/11/2026)

function getInitialIsoFromTodayStr(todayStr: string): { year: number; week: number } {
  const [y, m, d] = todayStr.split('-').map(Number);
  if (!y || !m || !d) return { year: 2026, week: MIN_START_WEEK_2026 };
  return getISOWeekAndYear(new Date(Date.UTC(y, m - 1, d, 15, 0, 0)));
}

export const WeeklyClosingSection: React.FC = () => {
  const { teamMembers, currentMember, isAdmin } = useAuth();
  const { todayStr, weeklyReports, saveWeeklyReport, updateMemberHours } = useWorkDay();

  const [selectedYear, setSelectedYear] = useState<number>(() =>
    Math.max(2026, getInitialIsoFromTodayStr(todayStr).year)
  );
  const [selectedWeek, setSelectedWeek] = useState<number>(() => {
    const iso = getInitialIsoFromTodayStr(todayStr);
    return iso.year === 2026 ? Math.max(MIN_START_WEEK_2026, iso.week) : iso.week;
  });
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [reloadTick, setReloadTick] = useState<number>(0);

  const [weekData, setWeekData] = useState<{
    rangeKey: string;
    socios: WeekSocioRow[];
    hours: WeekHourRow[];
    error: string | null;
  } | null>(null);

  const [editsByKey, setEditsByKey] = useState<Record<string, Partial<FormState>>>({});
  const [savedSuccess, setSavedSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSavingReport, setIsSavingReport] = useState<boolean>(false);
  const [isBatchConfirming, setIsBatchConfirming] = useState<boolean>(false);
  const [copiedWhatsApp, setCopiedWhatsApp] = useState<boolean>(false);

  const yearOptions = useMemo(() => {
    const isoYear = getInitialIsoFromTodayStr(todayStr).year;
    return Array.from(new Set([2026, 2027, isoYear, isoYear + 1])).sort((a, b) => a - b);
  }, [todayStr]);

  const maxWeeksInYear = useMemo(() => getISOWeeksInYear(selectedYear), [selectedYear]);
  const startWeekOption = selectedYear === 2026 ? MIN_START_WEEK_2026 : 1;

  const weekOptions = useMemo(
    () =>
      Array.from(
        { length: Math.max(1, maxWeeksInYear - startWeekOption + 1) },
        (_, i) => startWeekOption + i
      ),
    [maxWeeksInYear, startWeekOption]
  );

  const weekDays = useMemo(
    () => getISOWeekDays(selectedYear, selectedWeek),
    [selectedYear, selectedWeek]
  );

  const weekDateRange = useMemo(
    () => getISOWeekDateRange(selectedYear, selectedWeek),
    [selectedYear, selectedWeek]
  );

  const rangeKey = `${weekDateRange.startStr}..${weekDateRange.endStr}..${reloadTick}`;
  const isLoadingWeek = weekData?.rangeKey !== rangeKey;
  const activeWeekData = weekData?.rangeKey === rangeKey ? weekData : null;

  useEffect(() => {
    if (!weekDateRange.startStr || !weekDateRange.endStr) return;
    let cancelled = false;

    void (async () => {
      try {
        const [sociosRes, hoursRes] = await Promise.all([
          supabase
            .from('socios')
            .select('id, operational_date, amount, points, created_by, created_by_name')
            .gte('operational_date', weekDateRange.startStr)
            .lte('operational_date', weekDateRange.endStr),
          supabase
            .from('captor_daily_hours')
            .select('operational_date, user_id, hours_worked')
            .gte('operational_date', weekDateRange.startStr)
            .lte('operational_date', weekDateRange.endStr),
        ]);

        if (cancelled) return;
        if (sociosRes.error) throw sociosRes.error;
        if (hoursRes.error) throw hoursRes.error;

        setWeekData({
          rangeKey,
          socios: (sociosRes.data || []) as WeekSocioRow[],
          hours: (hoursRes.data || []) as WeekHourRow[],
          error: null,
        });
      } catch {
        if (cancelled) return;
        setWeekData({
          rangeKey,
          socios: [],
          hours: [],
          error: 'No se pudieron cargar los datos semanales. Verificá tu conexión.',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [weekDateRange.startStr, weekDateRange.endStr, rangeKey]);

  const activeMembers = useMemo(
    () => teamMembers.filter((m) => m.is_active),
    [teamMembers]
  );

  const effectiveMemberId = useMemo(() => {
    if (selectedMemberId && activeMembers.some((m) => m.id === selectedMemberId)) {
      return selectedMemberId;
    }
    if (currentMember?.id && activeMembers.some((m) => m.id === currentMember.id)) {
      return currentMember.id;
    }
    return activeMembers[0]?.id || '';
  }, [selectedMemberId, activeMembers, currentMember]);

  const targetMember = useMemo(
    () => activeMembers.find((m) => m.id === effectiveMemberId) || activeMembers[0],
    [activeMembers, effectiveMemberId]
  );

  const canEditTargetMember = Boolean(
    targetMember && (isAdmin || targetMember.id === currentMember?.id)
  );

  const hybridWeekly = useMemo(
    () =>
      calculateHybridWeeklyData({
        year: selectedYear,
        weekNumber: selectedWeek,
        members: activeMembers,
        weekSocios: activeWeekData?.socios || [],
        weekHours: activeWeekData?.hours || [],
        savedReports: weeklyReports,
      }),
    [selectedYear, selectedWeek, activeMembers, activeWeekData, weeklyReports]
  );

  const hasOutdated = useMemo(
    () => hybridWeekly.rows.some((r) => r.status === 'outdated'),
    [hybridWeekly]
  );

  const dailyBreakdown: DayBreakdown[] = useMemo(() => {
    if (!targetMember) return [];
    const weekSocios = activeWeekData?.socios || [];
    const weekHours = activeWeekData?.hours || [];

    return weekDays.map((wDay) => {
      const sociosOnDay = weekSocios.filter((s) => {
        const matchesDate = s.operational_date === wDay.dateStr;
        const matchesMember = s.created_by
          ? s.created_by === targetMember.id
          : s.created_by_name?.toLowerCase() === targetMember.display_name.toLowerCase();
        return matchesDate && matchesMember;
      });

      const ptsOnDay = Number(
        sociosOnDay.reduce((acc, s) => acc + Number(s.points || 0), 0).toFixed(2)
      );
      const amtOnDay = Number(
        sociosOnDay.reduce((acc, s) => acc + Number(s.amount || 0), 0).toFixed(2)
      );
      const dbHourRow = weekHours.find(
        (h) => h.operational_date === wDay.dateStr && h.user_id === targetMember.id
      );

      return {
        dateStr: wDay.dateStr,
        dayName: `${wDay.dayName} ${wDay.formattedDate}`,
        partnersCount: sociosOnDay.length,
        points: ptsOnDay,
        amount: amtOnDay,
        hours: dbHourRow ? Number(dbHourRow.hours_worked || 0) : 0,
      };
    });
  }, [targetMember, activeWeekData, weekDays]);

  const formEditKey = `${selectedYear}-w${selectedWeek}-${targetMember?.id || 'none'}`;
  const targetHybridRow = useMemo(
    () => hybridWeekly.rows.find((r) => r.member_id === targetMember?.id),
    [hybridWeekly, targetMember]
  );

  const baseFormState: FormState = useMemo(() => {
    const livePts = Number(dailyBreakdown.reduce((acc, b) => acc + b.points, 0).toFixed(2));
    const liveAmt = Number(dailyBreakdown.reduce((acc, b) => acc + b.amount, 0).toFixed(2));
    const liveSoc = dailyBreakdown.reduce((acc, b) => acc + b.partnersCount, 0);
    const liveHrs = Number(dailyBreakdown.reduce((acc, b) => acc + b.hours, 0).toFixed(2));
    const existing = targetHybridRow?.saved_report;

    return {
      points_earned: livePts.toString(),
      invalid_and_cancellations: existing
        ? Number(existing.invalid_and_cancellations || 0).toString()
        : '0',
      hours: liveHrs.toString(),
      total_amount: liveAmt.toString(),
      final_partners: liveSoc.toString(),
    };
  }, [dailyBreakdown, targetHybridRow]);

  const currentEdits = editsByKey[formEditKey];
  const formState: FormState = {
    points_earned: currentEdits?.points_earned ?? baseFormState.points_earned,
    invalid_and_cancellations:
      currentEdits?.invalid_and_cancellations ?? baseFormState.invalid_and_cancellations,
    hours: currentEdits?.hours ?? baseFormState.hours,
    total_amount: currentEdits?.total_amount ?? baseFormState.total_amount,
    final_partners: currentEdits?.final_partners ?? baseFormState.final_partners,
  };

  const updateFormField = (field: keyof FormState, value: string) => {
    setEditsByKey((prev) => ({
      ...prev,
      [formEditKey]: {
        ...(prev[formEditKey] || {}),
        [field]: value,
      },
    }));
  };

  const handleYearChange = (nextYear: number) => {
    const nextStart = nextYear === 2026 ? MIN_START_WEEK_2026 : 1;
    const nextMax = getISOWeeksInYear(nextYear);
    setSelectedYear(nextYear);
    setSelectedWeek((prev) => Math.max(nextStart, Math.min(nextMax, prev)));
  };

  const handleUpdateDayHours = async (dateStr: string, newHours: number) => {
    if (!targetMember || !canEditTargetMember) return;
    const cleanHours = Math.max(0, Math.min(24, Number(newHours) || 0));
    setActionError(null);

    const prevWeekData = weekData;
    setWeekData((prev) => {
      if (!prev || prev.rangeKey !== rangeKey) return prev;
      const idx = prev.hours.findIndex(
        (h) => h.operational_date === dateStr && h.user_id === targetMember.id
      );
      const nextHours = [...prev.hours];
      if (idx >= 0) {
        nextHours[idx] = { ...nextHours[idx], hours_worked: cleanHours };
      } else {
        nextHours.push({
          operational_date: dateStr,
          user_id: targetMember.id,
          hours_worked: cleanHours,
        });
      }
      return { ...prev, hours: nextHours };
    });

    const { error } = await updateMemberHours(targetMember.id, cleanHours, dateStr);
    if (error) {
      setWeekData(prevWeekData);
      setActionError(typeof error === 'string' ? error : 'Error al guardar las horas del día.');
    }
  };

  // Fórmulas Automáticas y Exactas
  const points_earned = parseFloat(formState.points_earned.replace(',', '.')) || 0;
  const invalid_and_cancellations =
    parseFloat(formState.invalid_and_cancellations.replace(',', '.')) || 0;
  const final_points = Number((points_earned - invalid_and_cancellations).toFixed(2));
  const hours = parseFloat(formState.hours.replace(',', '.')) || 0;
  const total_amount = parseFloat(formState.total_amount.replace(',', '.')) || 0;
  const final_partners = parseInt(formState.final_partners, 10) || 0;

  const points_per_hour = hours > 0 ? Number((final_points / hours).toFixed(2)) : null;
  const average_amount =
    final_partners > 0 ? Number((total_amount / final_partners).toFixed(2)) : null;

  const handleConfirmAllTeam = async () => {
    if (!isAdmin || isBatchConfirming || hybridWeekly.rows.length === 0) return;
    setActionError(null);
    setSavedSuccess(null);
    setIsBatchConfirming(true);

    try {
      const nowIso = new Date().toISOString();
      for (const row of hybridWeekly.rows) {
        const invalids = Number(row.saved_report?.invalid_and_cancellations || 0);
        const rowFinalPoints = Number((row.live_points_earned - invalids).toFixed(2));
        const rowPph =
          row.live_hours > 0 ? Number((rowFinalPoints / row.live_hours).toFixed(2)) : null;
        const rowAvgAmt =
          row.live_partners > 0
            ? Number((row.live_total_amount / row.live_partners).toFixed(2))
            : null;

        const report: WeeklyMemberReport = {
          id: `report-${selectedYear}-w${selectedWeek}-${row.member_id}`,
          week_number: selectedWeek,
          year: selectedYear,
          member_id: row.member_id,
          member_name: row.member_name,
          points_earned: row.live_points_earned,
          invalid_and_cancellations: invalids,
          final_points: rowFinalPoints,
          hours: row.live_hours,
          points_per_hour: rowPph,
          total_amount: row.live_total_amount,
          final_partners: row.live_partners,
          average_amount: rowAvgAmt,
          notes: row.saved_report?.notes,
          updated_at: nowIso,
        };

        const { error } = await saveWeeklyReport(report);
        if (error) {
          setActionError(
            typeof error === 'string'
              ? error
              : `No se pudo confirmar la planilla de ${row.member_name}.`
          );
          return;
        }
      }

      setEditsByKey({});
      setSavedSuccess(
        `¡Planilla semanal de Semana ${selectedWeek} (${selectedYear}) confirmada para todo el equipo!`
      );
      setTimeout(() => setSavedSuccess(null), 4000);
    } finally {
      setIsBatchConfirming(false);
    }
  };

  const handleSave = async () => {
    if (!targetMember || !canEditTargetMember) return;
    setActionError(null);
    setSavedSuccess(null);
    setIsSavingReport(true);

    const report: WeeklyMemberReport = {
      id: `report-${selectedYear}-w${selectedWeek}-${targetMember.id}`,
      week_number: selectedWeek,
      year: selectedYear,
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
      setActionError(typeof error === 'string' ? error : 'No se pudo guardar la planilla semanal.');
      return;
    }

    setEditsByKey((prev) => {
      const next = { ...prev };
      delete next[formEditKey];
      return next;
    });

    setSavedSuccess(`¡Planilla semanal de ${targetMember.display_name} guardada y sincronizada!`);
    setTimeout(() => setSavedSuccess(null), 3500);
  };

  const handleCopyWeeklyWhatsApp = async () => {
    if (isLoadingWeek) return;
    try {
      const text = generateWeeklyWhatsAppReport(hybridWeekly, weekDateRange);
      await navigator.clipboard.writeText(text);
      setCopiedWhatsApp(true);
      setTimeout(() => setCopiedWhatsApp(false), 2500);
    } catch {
      setActionError('No se pudo copiar el resumen semanal al portapapeles.');
    }
  };

  const handleExportWeeklyCsv = () => {
    if (isLoadingWeek) return;
    const csv = exportWeeklyToCsv(hybridWeekly);
    downloadCsv(`msf_planilla_semanal_${selectedYear}_s${selectedWeek}.csv`, csv);
  };

  const displayError = actionError || activeWeekData?.error || null;

  return (
    <div className="bg-white rounded-2xl border border-[#E2DBD0] p-4 sm:p-6 shadow-sm mb-6 w-full min-w-0 space-y-5">
      {/* CABECERA Y SELECTORES DE AÑO + SEMANA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm sm:text-base font-black text-neutral-900 uppercase tracking-wider flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-[#D6001C] shrink-0" />
            <span>PLANILLA SEMANAL</span>
          </h3>
          <p className="text-xs text-neutral-500 font-medium mt-0.5">
            Semana {selectedWeek} / {selectedYear} ({formatBuenosAiresDate(weekDateRange.startStr)}{' '}
            al {formatBuenosAiresDate(weekDateRange.endStr)})
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-[#F7F3EE] p-1.5 rounded-xl border border-[#E2DBD0]">
            <label htmlFor="weekly-year-select" className="sr-only">
              Año
            </label>
            <select
              id="weekly-year-select"
              aria-label="Año"
              value={selectedYear}
              onChange={(e) => handleYearChange(parseInt(e.target.value, 10))}
              className="min-h-[44px] text-base sm:text-xs font-black bg-white border border-[#E2DBD0] rounded-lg px-2.5 py-1 text-neutral-900 focus:outline-none cursor-pointer"
            >
              {yearOptions.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-[#F7F3EE] p-1.5 rounded-xl border border-[#E2DBD0]">
            <Calendar className="w-4 h-4 text-neutral-500 ml-1 shrink-0" />
            <label htmlFor="weekly-week-select" className="sr-only">
              Semana
            </label>
            <select
              id="weekly-week-select"
              aria-label="Semana"
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(parseInt(e.target.value, 10))}
              className="min-h-[44px] text-base sm:text-xs font-black bg-white border border-[#E2DBD0] rounded-lg px-2.5 py-1 text-neutral-900 focus:outline-none cursor-pointer"
            >
              {weekOptions.map((w) => (
                <option key={w} value={w}>
                  Semana {w} ({selectedYear})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {displayError && (
        <div
          role="alert"
          className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs font-bold text-red-700"
        >
          <AlertCircle className="w-4 h-4 text-[#D6001C] shrink-0" />
          <span>{displayError}</span>
        </div>
      )}

      {savedSuccess && (
        <div
          role="status"
          className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-800"
        >
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{savedSuccess}</span>
        </div>
      )}

      {/* SECCIÓN 1: TABLA HÍBRIDA EQUIPO COMPLETO (SIEMPRE ARRIBA DEL EDITOR INDIVIDUAL) */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <h4 className="text-xs font-black text-neutral-900 uppercase tracking-wider flex items-center gap-2">
            <Calculator className="w-4 h-4 text-[#D6001C] shrink-0" />
            <span>PLANILLA SEMANA {selectedWeek} – EQUIPO COMPLETO</span>
          </h4>

          {/* BOTONES DE ACCIÓN GLOBALES (CONFIRM FIRST PARA ADMIN) */}
          <div className="flex flex-wrap items-center gap-2.5">
            {isAdmin && (
              <button
                type="button"
                disabled={isBatchConfirming || isLoadingWeek}
                onClick={handleConfirmAllTeam}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D6001C] hover:bg-[#b80017] disabled:bg-neutral-300 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {isBatchConfirming
                    ? 'Confirmando planilla...'
                    : hasOutdated
                      ? 'Recalcular y Confirmar Planilla'
                      : 'Confirmar Planilla Semanal'}
                </span>
              </button>
            )}

            <button
              type="button"
              disabled={isLoadingWeek}
              onClick={handleCopyWeeklyWhatsApp}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#25D366] hover:bg-[#20ba59] disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {copiedWhatsApp ? (
                <>
                  <Check className="w-4 h-4 shrink-0" />
                  <span>¡Resumen Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 shrink-0" />
                  <span>Copiar WhatsApp</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isLoadingWeek}
              onClick={handleExportWeeklyCsv}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#F7F3EE] hover:bg-neutral-100 disabled:opacity-50 border border-[#E2DBD0] text-neutral-900 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-[#D6001C] shrink-0" />
              <span>Exportar CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setReloadTick((prev) => prev + 1)}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white hover:bg-neutral-50 border border-[#E2DBD0] text-neutral-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingWeek ? 'animate-spin' : ''}`} />
              <span>Actualizar datos</span>
            </button>
          </div>
        </div>

        {/* UNA SOLA TABLA UNIFICADA PARA MÓVIL Y DESKTOP */}
        <div className="overflow-x-auto w-full rounded-xl border border-[#E2DBD0]">
          <table className="w-full text-left text-xs min-w-[760px]">
            <thead>
              <tr className="border-b border-[#E2DBD0] text-[10px] font-black text-neutral-500 uppercase tracking-wider bg-[#F7F3EE]/80">
                <th className="py-2.5 px-2.5">Captador</th>
                <th className="py-2.5 px-2 text-center">Estado</th>
                <th className="py-2.5 px-2 text-center">Puntos</th>
                <th className="py-2.5 px-2 text-center">Inv/Bajas</th>
                <th className="py-2.5 px-2 text-center text-[#D6001C]">Pts Finales</th>
                <th className="py-2.5 px-2 text-center">Horas</th>
                <th className="py-2.5 px-2 text-center text-[#D6001C]">P/H</th>
                <th className="py-2.5 px-2 text-center">Socios</th>
                <th className="py-2.5 px-2 text-right">Recaudado</th>
                <th className="py-2.5 px-2 text-right">Promedio ($)</th>
                <th className="py-2.5 px-2 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2DBD0]/60 bg-white">
              {hybridWeekly.rows.map((row) => {
                const isSelected = row.member_id === targetMember?.id;
                const statusBadge =
                  row.status === 'confirmed'
                    ? {
                        label: 'Confirmada',
                        cls: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                      }
                    : row.status === 'outdated'
                      ? {
                          label: 'Desactualizada — recalcular',
                          cls: 'bg-amber-100 text-amber-900 border-amber-300',
                        }
                      : {
                          label: 'En vivo',
                          cls: 'bg-blue-50 text-blue-800 border-blue-200',
                        };

                return (
                  <tr
                    key={row.member_id}
                    className={`hover:bg-[#F7F3EE]/50 transition-colors ${
                      isSelected ? 'bg-red-50/40 font-semibold' : ''
                    }`}
                  >
                    <td className="py-2.5 px-2.5 font-black text-neutral-900">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{row.member_name}</span>
                        {isSelected && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-[#D6001C] text-white">
                            ACTIVO
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span
                        className={`inline-block text-[10px] font-black px-2 py-0.5 rounded-full border ${statusBadge.cls}`}
                      >
                        {statusBadge.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-center font-bold">
                      {formatNumber(row.points_earned)}
                    </td>
                    <td className="py-2.5 px-2 text-center font-medium">
                      {formatNumber(row.invalid_and_cancellations)}
                    </td>
                    <td className="py-2.5 px-2 text-center font-black text-[#D6001C]">
                      {formatNumber(row.final_points)}
                    </td>
                    <td className="py-2.5 px-2 text-center font-bold">{formatHours(row.hours)}</td>
                    <td className="py-2.5 px-2 text-center font-black text-[#D6001C]">
                      {formatNumber(row.points_per_hour)}
                    </td>
                    <td className="py-2.5 px-2 text-center font-black">{row.final_partners}</td>
                    <td className="py-2.5 px-2 text-right font-bold text-neutral-800">
                      {formatPesos(row.total_amount)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-black text-emerald-800">
                      {row.average_amount !== null ? formatPesos(row.average_amount) : 'N/D'}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      {isAdmin || row.member_id === currentMember?.id ? (
                        <button
                          type="button"
                          onClick={() => setSelectedMemberId(row.member_id)}
                          className="min-h-[44px] px-3 py-1.5 rounded-lg text-[11px] font-black text-neutral-700 hover:text-[#D6001C] hover:bg-[#F7F3EE] border border-transparent hover:border-[#E2DBD0] cursor-pointer"
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
            <tfoot>
              <tr className="border-t-2 border-[#E2DBD0] bg-[#F7F3EE] font-black text-xs text-neutral-900">
                <td className="py-3 px-2.5 uppercase">Totales del Equipo</td>
                <td className="py-3 px-2 text-center text-neutral-500">—</td>
                <td className="py-3 px-2 text-center">
                  {formatNumber(hybridWeekly.totals.points_earned)}
                </td>
                <td className="py-3 px-2 text-center">
                  {formatNumber(hybridWeekly.totals.invalid_and_cancellations)}
                </td>
                <td className="py-3 px-2 text-center text-[#D6001C]">
                  {formatNumber(hybridWeekly.totals.final_points)}
                </td>
                <td className="py-3 px-2 text-center text-[#D6001C]">
                  {formatHours(hybridWeekly.totals.hours)}
                </td>
                <td className="py-3 px-2 text-center text-[#D6001C]">
                  {formatNumber(hybridWeekly.totals.points_per_hour)}
                </td>
                <td className="py-3 px-2 text-center">{hybridWeekly.totals.final_partners}</td>
                <td className="py-3 px-2 text-right text-emerald-800">
                  {formatPesos(hybridWeekly.totals.total_amount)}
                </td>
                <td className="py-3 px-2 text-right text-emerald-800">
                  {hybridWeekly.totals.average_amount !== null
                    ? formatPesos(hybridWeekly.totals.average_amount)
                    : 'N/D'}
                </td>
                <td className="py-3 px-2 text-center text-neutral-400">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* SECCIÓN 2: REGISTRO DIARIO INDIVIDUAL Y EDITOR */}
      <section className="space-y-4 pt-2 border-t border-[#E2DBD0]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h4 className="text-xs font-black text-neutral-800 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#D6001C] shrink-0" />
              <span>REGISTRO DIARIO INDIVIDUAL: {targetMember?.display_name.toUpperCase()}</span>
            </h4>
            <p className="text-[11px] font-medium text-neutral-500">
              Ingresá las horas de cada día trabajado para que sumen automáticamente
            </p>
          </div>

          {isAdmin ? (
            <div className="flex items-center gap-1.5 bg-[#F7F3EE] p-1.5 rounded-xl border border-[#E2DBD0]">
              <UserCheck className="w-4 h-4 text-[#D6001C] ml-1 shrink-0" />
              <label htmlFor="weekly-member-select" className="sr-only">
                Seleccionar captador
              </label>
              <select
                id="weekly-member-select"
                aria-label="Seleccionar captador"
                value={targetMember?.id || ''}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="min-h-[44px] text-base sm:text-xs font-black bg-white border border-[#E2DBD0] rounded-lg px-2.5 py-1 text-neutral-900 focus:outline-none cursor-pointer"
              >
                {activeMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name} {m.role === 'ADMIN' ? '(ADMIN)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-[#F7F3EE] px-3 py-2 rounded-xl border border-[#E2DBD0]">
              <UserCheck className="w-4 h-4 text-[#D6001C] shrink-0" />
              <span className="text-xs font-black text-neutral-900">
                {targetMember?.display_name}
              </span>
            </div>
          )}
        </div>

        {/* DESGLOSE DÍA POR DÍA */}
        <div className="bg-[#F7F3EE]/40 border border-[#E2DBD0] rounded-2xl p-3.5 sm:p-4">
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
                  <div className="text-[10px] text-neutral-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>
                      Socios: <strong className="text-neutral-800">{b.partnersCount}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Pts:{' '}
                      <strong className="text-[#D6001C]">{formatPoints(b.points)}</strong>
                    </span>
                    <span>•</span>
                    <span className="truncate">{formatPesos(b.amount)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="24"
                    aria-label={`Horas de ${b.dayName}`}
                    disabled={!canEditTargetMember}
                    value={b.hours || ''}
                    placeholder="0"
                    onChange={(e) =>
                      handleUpdateDayHours(
                        b.dateStr,
                        parseFloat(e.target.value.replace(',', '.')) || 0
                      )
                    }
                    className="w-16 min-h-[44px] text-base text-center font-black text-neutral-900 bg-[#F7F3EE] border border-[#E2DBD0] rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
                  />
                  {canEditTargetMember &&
                    (b.hours === 0 ? (
                      <button
                        type="button"
                        onClick={() => handleUpdateDayHours(b.dateStr, 4)}
                        className="min-h-[44px] min-w-[44px] px-2.5 text-[11px] font-black rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-pointer"
                      >
                        +4h
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleUpdateDayHours(b.dateStr, 0)}
                        className="min-h-[44px] min-w-[44px] px-2.5 text-[11px] font-bold rounded-lg bg-neutral-100 text-neutral-700 border border-neutral-200 cursor-pointer"
                      >
                        0h
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>

          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[560px]">
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
                    <td className="py-2.5 px-2.5 text-center font-bold">{b.partnersCount}</td>
                    <td className="py-2.5 px-2.5 text-center font-black text-neutral-800">
                      {formatNumber(b.points)}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-medium text-neutral-700">
                      {formatPesos(b.amount)}
                    </td>
                    <td className="py-2.5 px-2.5 text-center">
                      <div className="inline-flex items-center justify-center gap-2 flex-wrap">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="24"
                          aria-label={`Horas de ${b.dayName}`}
                          disabled={!canEditTargetMember}
                          value={b.hours || ''}
                          placeholder="0"
                          onChange={(e) =>
                            handleUpdateDayHours(
                              b.dateStr,
                              parseFloat(e.target.value.replace(',', '.')) || 0
                            )
                          }
                          className="w-16 min-h-[44px] text-center font-black text-neutral-900 bg-[#F7F3EE] border border-[#E2DBD0] rounded-lg px-2 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
                        />
                        {canEditTargetMember &&
                          (b.hours === 0 ? (
                            <button
                              type="button"
                              onClick={() => handleUpdateDayHours(b.dateStr, 4)}
                              className="min-h-[44px] min-w-[44px] px-2.5 text-[11px] font-bold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-pointer"
                              title="Cargar jornada de 4 horas"
                            >
                              +4h
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleUpdateDayHours(b.dateStr, 0)}
                              className="min-h-[44px] min-w-[44px] px-2.5 text-[11px] font-bold rounded-lg bg-neutral-100 hover:bg-amber-50 hover:text-amber-800 text-neutral-700 border border-neutral-200 cursor-pointer"
                              title="Marcar franco rotativo (0 horas)"
                            >
                              Franco (0h)
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FORMULARIO INDIVIDUAL DE PLANILLA */}
        <div className="bg-[#F7F3EE]/60 border-2 border-[#E2DBD0] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-[#E2DBD0] pb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#D6001C] shrink-0" />
            <span className="text-xs font-black uppercase text-neutral-800">
              CIERRE INDIVIDUAL: {targetMember?.display_name.toUpperCase()} (SEMANA {selectedWeek})
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3 rounded-xl border border-[#E2DBD0]">
              <span className="text-[10px] font-black uppercase text-neutral-500 block">
                SEMANA N°
              </span>
              <span className="text-xl font-black text-neutral-900">{selectedWeek}</span>
            </div>

            <div className="bg-white p-3 rounded-xl border border-[#E2DBD0]">
              <label
                htmlFor="weekly-points-earned"
                className="text-[10px] font-black uppercase text-neutral-500 block"
              >
                PUNTOS
              </label>
              <input
                id="weekly-points-earned"
                type="number"
                step="0.1"
                disabled={!canEditTargetMember}
                value={formState.points_earned}
                onChange={(e) => updateFormField('points_earned', e.target.value)}
                className="w-full text-xl font-black text-neutral-900 bg-transparent focus:outline-none border-b border-neutral-300 focus:border-[#D6001C]"
              />
            </div>

            <div className="bg-white p-3 rounded-xl border border-[#E2DBD0]">
              <label
                htmlFor="weekly-invalids"
                className="text-[10px] font-black uppercase text-neutral-500 block"
              >
                INVÁLIDAS Y BAJAS
              </label>
              <input
                id="weekly-invalids"
                type="number"
                step="0.1"
                min="0"
                disabled={!canEditTargetMember}
                value={formState.invalid_and_cancellations}
                onChange={(e) => updateFormField('invalid_and_cancellations', e.target.value)}
                className="w-full text-xl font-black text-neutral-900 bg-transparent focus:outline-none border-b border-neutral-300 focus:border-[#D6001C]"
              />
            </div>

            <div className="bg-red-50/70 p-3 rounded-xl border border-red-200">
              <span className="text-[10px] font-black uppercase text-[#D6001C] block">
                PUNTOS FINALES
              </span>
              <span className="text-xl font-black text-[#D6001C]">
                {formatNumber(final_points)}
              </span>
            </div>

            <div className="bg-white p-3 rounded-xl border border-[#E2DBD0]">
              <label
                htmlFor="weekly-hours"
                className="text-[10px] font-black uppercase text-neutral-500 block"
              >
                HORAS
              </label>
              <input
                id="weekly-hours"
                type="number"
                step="0.5"
                min="0"
                disabled={!canEditTargetMember}
                value={formState.hours}
                onChange={(e) => updateFormField('hours', e.target.value)}
                className="w-full text-xl font-black text-neutral-900 bg-transparent focus:outline-none border-b border-neutral-300 focus:border-[#D6001C]"
              />
            </div>

            <div className="bg-red-50/70 p-3 rounded-xl border border-red-200">
              <span className="text-[10px] font-black uppercase text-[#D6001C] block">P / H</span>
              <span className="text-xl font-black text-[#D6001C]">
                {formatNumber(points_per_hour)}
              </span>
            </div>

            <div className="bg-white p-3 rounded-xl border border-[#E2DBD0]">
              <label
                htmlFor="weekly-final-partners"
                className="text-[10px] font-black uppercase text-neutral-500 block"
              >
                SOCIOS FINALES
              </label>
              <input
                id="weekly-final-partners"
                type="number"
                min="0"
                disabled={!canEditTargetMember}
                value={formState.final_partners}
                onChange={(e) => updateFormField('final_partners', e.target.value)}
                className="w-full text-xl font-black text-neutral-900 bg-transparent focus:outline-none border-b border-neutral-300 focus:border-[#D6001C]"
              />
            </div>

            <div className="bg-emerald-50/80 p-3 rounded-xl border border-emerald-300">
              <span className="text-[10px] font-black uppercase text-emerald-800 block">
                PROMEDIO ($/SOCIO)
              </span>
              <span className="text-lg font-black text-emerald-800 truncate block">
                {average_amount !== null ? formatPesos(average_amount) : 'N/D'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 bg-white rounded-xl border border-[#E2DBD0] flex items-center gap-2.5">
              <Award className="w-5 h-5 text-[#D6001C] shrink-0" />
              <div>
                <span className="text-[10px] font-black uppercase text-neutral-500 block">
                  FÓRMULA P/H SEMANAL
                </span>
                <p className="text-xs font-bold text-neutral-900">
                  {formatPoints(final_points)} ÷ {formatHours(hours)} ={' '}
                  <span className="text-[#D6001C] font-black">
                    {formatNumber(points_per_hour)} P/H
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
                  {formatPesos(total_amount)} ÷ {final_partners}{' '}
                  {final_partners === 1 ? 'socio' : 'socios'} ={' '}
                  <span className="text-emerald-700 font-black">
                    {average_amount !== null ? formatPesos(average_amount) : 'N/D'} / socio
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-[#E2DBD0] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <label
                htmlFor="weekly-total-amount"
                className="text-[11px] font-black uppercase text-neutral-600 block"
              >
                TOTAL DINERO RECAUDADO EN LA SEMANA
              </label>
              <span className="text-[11px] text-neutral-400">
                Suma de aportes de la semana: base para el cálculo del promedio
              </span>
            </div>
            <div className="w-full sm:w-40">
              <input
                id="weekly-total-amount"
                type="number"
                step="1000"
                min="0"
                disabled={!canEditTargetMember}
                value={formState.total_amount}
                onChange={(e) => updateFormField('total_amount', e.target.value)}
                className="w-full min-h-[44px] text-right text-base sm:text-lg font-black text-neutral-900 bg-[#F7F3EE] px-3 py-1.5 rounded-lg border border-neutral-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
              />
            </div>
          </div>

          {canEditTargetMember && (
            <button
              type="button"
              disabled={isSavingReport}
              onClick={handleSave}
              className="w-full min-h-[44px] h-11 bg-neutral-900 hover:bg-black disabled:bg-neutral-300 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
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
      </section>
    </div>
  );
};

export default WeeklyClosingSection;
