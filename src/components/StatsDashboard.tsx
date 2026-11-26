import React, { useEffect, useMemo, useState } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import {
  downloadCsv,
  exportRangeStatsToCsv,
  formatBuenosAiresDate,
  formatHours,
  formatNumber,
  formatPesos,
  formatPoints,
} from '../lib/stats';
import { getPresetDateRange } from '../lib/dateUtils';
import { StatsRangeResponse } from '../types/database';
import {
  AlertCircle,
  Award,
  Calendar,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  Filter,
  Landmark,
  Loader2,
  Target,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';

type PeriodFilter = 'today' | 'week' | 'month' | 'custom';

const PERIOD_OPTIONS: Array<{ id: PeriodFilter; label: string }> = [
  { id: 'today', label: 'Día actual' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
  { id: 'custom', label: 'Rango personalizado' },
];

export const StatsDashboard: React.FC = () => {
  const { stats, selectedDate, todayStr, getStatsByRange, loading } = useWorkDay();
  const { teamMembers, allProfiles } = useAuth();

  const [period, setPeriod] = useState<PeriodFilter>('today');
  const [customDates, setCustomDates] = useState<{ start: string; end: string } | null>(null);
  const [selectedCollectorId, setSelectedCollectorId] = useState<string>('ALL');
  const [rangeState, setRangeState] = useState<{
    key: string;
    data: StatsRangeResponse | null;
    error: string | null;
  } | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const customStart = customDates?.start ?? selectedDate;
  const customEnd = customDates?.end ?? selectedDate;

  const activeRange = useMemo(() => {
    if (period === 'today') {
      return { startStr: selectedDate, endStr: selectedDate };
    }
    if (period === 'week') {
      return getPresetDateRange('week', todayStr);
    }
    if (period === 'month') {
      return getPresetDateRange('month', todayStr);
    }
    return { startStr: customStart, endStr: customEnd };
  }, [period, selectedDate, todayStr, customStart, customEnd]);

  const isInvertedCustomRange =
    period === 'custom' &&
    Boolean(activeRange.startStr && activeRange.endStr && activeRange.startStr > activeRange.endStr);

  const isLiveTodayAll = period === 'today' && selectedCollectorId === 'ALL';
  const queryKey = `${activeRange.startStr}::${activeRange.endStr}::${selectedCollectorId}`;

  useEffect(() => {
    if (isLiveTodayAll || isInvertedCustomRange) return;
    if (!activeRange.startStr || !activeRange.endStr) return;

    let cancelled = false;
    const targetUserId = selectedCollectorId === 'ALL' ? null : selectedCollectorId;

    void (async () => {
      const { data, error } = await getStatsByRange(
        activeRange.startStr,
        activeRange.endStr,
        targetUserId
      );
      if (cancelled) return;
      setRangeState({
        key: queryKey,
        data,
        error,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isLiveTodayAll,
    isInvertedCustomRange,
    activeRange.startStr,
    activeRange.endStr,
    selectedCollectorId,
    queryKey,
    getStatsByRange,
  ]);

  const activeMembersAlpha = useMemo(
    () => [...teamMembers].sort((a, b) => a.display_name.localeCompare(b.display_name, 'es')),
    [teamMembers]
  );

  const inactiveMembersAlpha = useMemo(
    () =>
      allProfiles
        .filter((m) => !m.is_active)
        .sort((a, b) => a.display_name.localeCompare(b.display_name, 'es')),
    [allProfiles]
  );

  const selectedCollectorLabel = useMemo(() => {
    if (selectedCollectorId === 'ALL') return 'Equipo completo';
    return (
      allProfiles.find((m) => m.id === selectedCollectorId)?.display_name || 'Captador seleccionado'
    );
  }, [selectedCollectorId, allProfiles]);

  const isFetchingRange =
    !isLiveTodayAll && !isInvertedCustomRange && rangeState?.key !== queryKey;
  const currentRangeData = rangeState?.key === queryKey ? rangeState.data : null;
  const currentRangeError = rangeState?.key === queryKey ? rangeState.error : null;

  const handleExportCsv = async () => {
    if (isInvertedCustomRange || isExporting) return;
    setExportError(null);
    setIsExporting(true);

    try {
      let dataToExport = currentRangeData;
      if (!dataToExport) {
        const targetUserId = selectedCollectorId === 'ALL' ? null : selectedCollectorId;
        const { data, error } = await getStatsByRange(
          activeRange.startStr,
          activeRange.endStr,
          targetUserId
        );
        if (error || !data) {
          setExportError(error || 'No se pudo generar el CSV para el período seleccionado.');
          return;
        }
        dataToExport = data;
      }

      const csv = exportRangeStatsToCsv(dataToExport);
      const collectorSuffix =
        selectedCollectorId === 'ALL' ? 'equipo' : selectedCollectorId.slice(0, 8);
      downloadCsv(
        `msf_estadisticas_${activeRange.startStr}_${activeRange.endStr}_${collectorSuffix}.csv`,
        csv
      );
    } finally {
      setIsExporting(false);
    }
  };

  if (isLiveTodayAll && !stats && loading) {
    return (
      <div className="bg-white rounded-2xl border border-[#E2DBD0] p-6 text-center text-xs font-bold text-neutral-500">
        Cargando estadísticas...
      </div>
    );
  }

  // Resolver métricas unificadas (en vivo para Día actual + Todos, o desde getStatsByRange)
  const display = (() => {
    if (isLiveTodayAll && stats) {
      return {
        total_points: stats.total_points,
        total_partners: stats.total_partners,
        total_amount: stats.total_amount,
        total_hours: stats.total_hours,
        average_age: stats.average_age,
        declared_collectors: stats.declared_collectors,
        partners_per_collector: stats.averages.partners_per_collector,
        points_per_collector: stats.averages.points_per_collector,
        hours_per_collector: stats.averages.hours_per_collector,
        partners_per_hour: stats.averages.partners_per_hour,
        points_per_hour: stats.averages.points_per_hour,
        amount_per_hour: stats.averages.amount_per_hour,
        amount_per_partner: stats.averages.amount_per_partner,
        breakdown: stats.breakdown,
      };
    }

    if (currentRangeData) {
      const s = currentRangeData.summary;
      const activeInRange = currentRangeData.by_member.length;
      return {
        total_points: Number(s.total_points || 0),
        total_partners: Number(s.total_socios || 0),
        total_amount: Number(s.total_amount || 0),
        total_hours: Number(s.total_hours || 0),
        average_age: s.average_age,
        declared_collectors: selectedCollectorId === 'ALL' ? activeInRange : 1,
        partners_per_collector:
          selectedCollectorId === 'ALL' && activeInRange > 0
            ? Number((Number(s.total_socios || 0) / activeInRange).toFixed(2))
            : null,
        points_per_collector:
          selectedCollectorId === 'ALL' && activeInRange > 0
            ? Number((Number(s.total_points || 0) / activeInRange).toFixed(2))
            : null,
        hours_per_collector:
          selectedCollectorId === 'ALL' && activeInRange > 0
            ? Number((Number(s.total_hours || 0) / activeInRange).toFixed(2))
            : null,
        partners_per_hour: s.socios_per_hour,
        points_per_hour: s.points_per_hour,
        amount_per_hour: s.amount_per_hour ?? null,
        amount_per_partner: s.average_amount,
        breakdown: {
          credit_card: {
            count: Number(s.credito_count || 0),
            points: Number(s.credito_points || 0),
          },
          debit_card: {
            count: Number(s.debito_count || 0),
            points: Number(s.debito_points || 0),
          },
          bank_cbu: {
            count: Number(s.cbu_count || 0),
            points: Number(s.cbu_points || 0),
          },
          prepaid_wallet: {
            count: Number(s.prepaga_count || 0),
            points: Number(s.prepaga_points || 0),
          },
        },
      };
    }

    return {
      total_points: 0,
      total_partners: 0,
      total_amount: 0,
      total_hours: 0,
      average_age: null as number | null,
      declared_collectors: 0,
      partners_per_collector: null as number | null,
      points_per_collector: null as number | null,
      hours_per_collector: null as number | null,
      partners_per_hour: null as number | null,
      points_per_hour: null as number | null,
      amount_per_hour: null as number | null,
      amount_per_partner: null as number | null,
      breakdown: {
        credit_card: { count: 0, points: 0 },
        debit_card: { count: 0, points: 0 },
        bank_cbu: { count: 0, points: 0 },
        prepaid_wallet: { count: 0, points: 0 },
      },
    };
  })();

  const rangeDateBadge =
    activeRange.startStr === activeRange.endStr
      ? formatBuenosAiresDate(activeRange.startStr)
      : `${formatBuenosAiresDate(activeRange.startStr)} – ${formatBuenosAiresDate(activeRange.endStr)}`;

  return (
    <div className="space-y-4 sm:space-y-5 mb-5 w-full min-w-0">
      {/* BARRA DE FILTROS DE PERÍODO Y CAPTADOR */}
      <section className="bg-white rounded-2xl border border-[#E2DBD0] p-3.5 sm:p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#D6001C] shrink-0" />
            <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider">
              FILTROS DE ESTADÍSTICAS
            </h3>
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isInvertedCustomRange || isExporting}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2DBD0] bg-[#F7F3EE] hover:bg-neutral-100 disabled:opacity-50 text-xs font-black text-neutral-900 inline-flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
          >
            <Download className="w-4 h-4 text-[#D6001C] shrink-0" />
            <span>{isExporting ? 'Exportando CSV...' : 'Exportar CSV'}</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {PERIOD_OPTIONS.map((opt) => {
            const isSelected = period === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setPeriod(opt.id)}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#D6001C] border-[#D6001C] text-white shadow-2xs'
                    : 'bg-[#F7F3EE]/80 border-[#E2DBD0] text-neutral-700 hover:bg-[#F7F3EE]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="min-w-0">
            <label
              htmlFor="stats-collector-filter"
              className="block text-[11px] font-black uppercase text-neutral-500 mb-1"
            >
              Filtrar por captador
            </label>
            <select
              id="stats-collector-filter"
              aria-label="Filtrar por captador"
              value={selectedCollectorId}
              onChange={(e) => setSelectedCollectorId(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#E2DBD0] bg-[#F7F3EE]/60 text-base sm:text-xs font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[#D6001C] cursor-pointer"
            >
              <option value="ALL">Todos (Equipo completo)</option>
              {activeMembersAlpha.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
              {inactiveMembersAlpha.length > 0 && (
                <optgroup label="Históricos / Inactivos">
                  {inactiveMembersAlpha.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name} (Inactivo)
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {period === 'custom' && (
            <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2 min-w-0">
              <div className="min-w-0">
                <label
                  htmlFor="stats-custom-start"
                  className="block text-[11px] font-black uppercase text-neutral-500 mb-1"
                >
                  Desde
                </label>
                <input
                  id="stats-custom-start"
                  type="date"
                  value={customStart}
                  max={todayStr}
                  onChange={(e) =>
                    setCustomDates({
                      start: e.target.value,
                      end: customEnd,
                    })
                  }
                  className="w-full min-w-0 min-h-[44px] px-2.5 py-2 rounded-xl border border-[#E2DBD0] bg-[#F7F3EE]/60 text-base sm:text-xs font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
                />
              </div>
              <div className="min-w-0">
                <label
                  htmlFor="stats-custom-end"
                  className="block text-[11px] font-black uppercase text-neutral-500 mb-1"
                >
                  Hasta
                </label>
                <input
                  id="stats-custom-end"
                  type="date"
                  value={customEnd}
                  max={todayStr}
                  onChange={(e) =>
                    setCustomDates({
                      start: customStart,
                      end: e.target.value,
                    })
                  }
                  className="w-full min-w-0 min-h-[44px] px-2.5 py-2 rounded-xl border border-[#E2DBD0] bg-[#F7F3EE]/60 text-base sm:text-xs font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
                />
              </div>
            </div>
          )}
        </div>

        {isInvertedCustomRange && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs font-bold text-amber-900 flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              Rango de fechas inválido: la fecha de inicio no puede ser posterior a la fecha de fin.
            </span>
          </div>
        )}

        {(currentRangeError || exportError) && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-800 flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 text-[#D6001C] shrink-0" />
            <span>{exportError || currentRangeError}</span>
          </div>
        )}
      </section>

      {/* TARJETA HERO MSF RED - TOTAL DE PUNTOS */}
      <div className="rounded-2xl bg-gradient-to-br from-[#D6001C] via-[#c40019] to-[#990013] text-white p-4 sm:p-6 shadow-md shadow-red-500/15">
        <div className="flex items-center justify-between gap-2 opacity-90 mb-1 flex-wrap">
          <span className="text-[11px] sm:text-xs font-black uppercase tracking-widest flex items-center gap-1.5">
            <Award className="w-4 h-4 shrink-0" />
            <span>{period === 'today' ? 'TOTAL PUNTOS JORNADA' : 'TOTAL PUNTOS DEL PERÍODO'}</span>
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {selectedCollectorId !== 'ALL' && (
              <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-white/20">
                {selectedCollectorLabel}
              </span>
            )}
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-xs flex items-center gap-1">
              <Calendar className="w-3 h-3 shrink-0" /> {rangeDateBadge}
            </span>
          </div>
        </div>

        <div className="flex items-baseline justify-between gap-2 mt-2">
          <div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-4xl sm:text-5xl font-black tracking-tight leading-none">
                {formatNumber(display.total_points)}
              </span>
              <span className="text-xs sm:text-sm font-black px-2 py-0.5 rounded-full bg-white/20">
                {formatPoints(display.total_points)}
              </span>
              {isFetchingRange && (
                <Loader2 className="w-4 h-4 animate-spin text-white/80 shrink-0" />
              )}
            </div>
            <p className="text-xs opacity-90 mt-2 font-medium">
              {display.total_partners} {display.total_partners === 1 ? 'socio' : 'socios'} •{' '}
              {formatPesos(display.total_amount)}
            </p>
          </div>

          <div className="text-right">
            <div className="text-xl sm:text-2xl font-black">
              {formatPoints(display.points_per_hour)}
            </div>
            <div className="text-[10px] sm:text-[11px] uppercase tracking-wider opacity-85 font-bold">
              por hora
            </div>
          </div>
        </div>
      </div>

      {/* MÉTRICAS CLAVE EN CUADRÍCULA */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="bg-white rounded-xl border border-[#E2DBD0] p-3 sm:p-3.5 shadow-2xs">
          <div className="text-[10px] sm:text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Target className="w-3.5 h-3.5 text-neutral-400 shrink-0" /> Socios Totales
          </div>
          <div className="text-xl sm:text-2xl font-black text-neutral-900">
            {display.total_partners}
          </div>
          <div className="text-[10px] sm:text-[11px] text-neutral-500 mt-1 truncate">
            {display.partners_per_collector !== null
              ? `${formatNumber(display.partners_per_collector)} por captador`
              : `Prom: ${display.amount_per_partner !== null ? formatPesos(display.amount_per_partner) : 'N/D'}`}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#E2DBD0] p-3 sm:p-3.5 shadow-2xs">
          <div className="text-[10px] sm:text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <DollarSign className="w-3.5 h-3.5 text-neutral-400 shrink-0" /> Dinero Total
          </div>
          <div className="text-base sm:text-xl font-black text-neutral-900 truncate">
            {formatPesos(display.total_amount)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-neutral-500 mt-1 truncate">
            Prom:{' '}
            {display.amount_per_partner !== null
              ? formatPesos(display.amount_per_partner)
              : 'N/D'}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#E2DBD0] p-3 sm:p-3.5 shadow-2xs">
          <div className="text-[10px] sm:text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-neutral-400 shrink-0" /> Horas Totales
          </div>
          <div className="text-xl sm:text-2xl font-black text-neutral-900">
            {formatHours(display.total_hours)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-neutral-500 mt-1 truncate">
            {display.hours_per_collector !== null
              ? `Prom: ${formatHours(display.hours_per_collector)}/capt.`
              : `Soc/h: ${formatNumber(display.partners_per_hour)}`}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#E2DBD0] p-3 sm:p-3.5 shadow-2xs">
          <div className="text-[10px] sm:text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <UserCheck className="w-3.5 h-3.5 text-neutral-400 shrink-0" />{' '}
            {selectedCollectorId === 'ALL' ? 'Captadores' : 'Captador'}
          </div>
          <div className="text-xl sm:text-2xl font-black text-neutral-900">
            {display.declared_collectors}
          </div>
          <div className="text-[10px] sm:text-[11px] text-neutral-500 mt-1 truncate">
            {display.points_per_collector !== null &&
            display.points_per_collector !== undefined &&
            Number.isFinite(display.points_per_collector)
              ? `${formatPoints(display.points_per_collector)}/captador`
              : selectedCollectorId === 'ALL'
                ? 'N/D'
                : selectedCollectorLabel}
          </div>
        </div>
      </div>

      {/* PROMEDIOS POR HORA Y EDAD PROMEDIO DE SOCIOS */}
      <div className="bg-white rounded-2xl border border-[#E2DBD0] p-4 sm:p-5 shadow-2xs">
        <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider mb-3">
          {period === 'today' ? 'PROMEDIOS Y EDAD DE LA JORNADA' : 'PROMEDIOS Y EDAD DEL PERÍODO'}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 text-sm">
          <div className="p-2.5 sm:p-3 bg-[#F7F3EE] rounded-xl">
            <span className="text-[10px] sm:text-[11px] text-neutral-500 font-bold block uppercase">
              Edad Promedio:
            </span>
            <strong className="text-base sm:text-lg font-black text-neutral-900">
              {display.average_age !== null ? `${formatNumber(display.average_age, 1)} años` : 'N/D'}
            </strong>
          </div>
          <div className="p-2.5 sm:p-3 bg-[#F7F3EE] rounded-xl">
            <span className="text-[10px] sm:text-[11px] text-neutral-500 font-bold block uppercase">
              Socios / Hora:
            </span>
            <strong className="text-base sm:text-lg font-black text-neutral-900">
              {formatNumber(display.partners_per_hour)}
            </strong>
          </div>
          <div className="p-2.5 sm:p-3 bg-[#F7F3EE] rounded-xl">
            <span className="text-[10px] sm:text-[11px] text-neutral-500 font-bold block uppercase">
              Puntos / Hora:
            </span>
            <strong className="text-base sm:text-lg font-black text-neutral-900">
              {formatNumber(display.points_per_hour)}
            </strong>
          </div>
          <div className="p-2.5 sm:p-3 bg-[#F7F3EE] rounded-xl">
            <span className="text-[10px] sm:text-[11px] text-neutral-500 font-bold block uppercase">
              Dinero / Hora:
            </span>
            <strong className="text-base sm:text-lg font-black text-neutral-900 truncate block">
              {display.amount_per_hour !== null ? formatPesos(display.amount_per_hour) : 'N/D'}
            </strong>
          </div>
        </div>
      </div>

      {/* DESGLOSE POR MEDIO DE CAPTACIÓN */}
      <div className="bg-white rounded-2xl border border-[#E2DBD0] p-4 sm:p-5 shadow-2xs">
        <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider mb-3">
          DESGLOSE POR MEDIO DE CAPTACIÓN
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
          <div className="flex items-center justify-between p-3 rounded-xl border border-emerald-200 bg-emerald-50/50">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black text-neutral-900">Tarjeta de Crédito</h4>
                <p className="text-[10px] text-neutral-500 font-medium">1,0 pt c/u</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-black text-neutral-900">
                {display.breakdown.credit_card.count}{' '}
                {display.breakdown.credit_card.count === 1 ? 'socio' : 'socios'}
              </div>
              <div className="text-[11px] font-extrabold text-emerald-700">
                {formatPoints(display.breakdown.credit_card.points)}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-blue-200 bg-blue-50/50">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-100 text-blue-800 rounded-lg">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black text-neutral-900">Tarjeta de Débito</h4>
                <p className="text-[10px] text-neutral-500 font-medium">0,7 pts c/u</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-black text-neutral-900">
                {display.breakdown.debit_card.count}{' '}
                {display.breakdown.debit_card.count === 1 ? 'socio' : 'socios'}
              </div>
              <div className="text-[11px] font-extrabold text-blue-700">
                {formatPoints(display.breakdown.debit_card.points)}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-purple-200 bg-purple-50/50">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-purple-100 text-purple-800 rounded-lg">
                <Landmark className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black text-neutral-900">CBU / CVU Bancario</h4>
                <p className="text-[10px] text-neutral-500 font-medium">0,6 pts c/u</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-black text-neutral-900">
                {display.breakdown.bank_cbu.count}{' '}
                {display.breakdown.bank_cbu.count === 1 ? 'socio' : 'socios'}
              </div>
              <div className="text-[11px] font-extrabold text-purple-700">
                {formatPoints(display.breakdown.bank_cbu.points)}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-amber-200 bg-amber-50/50">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
                <Wallet className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black text-neutral-900">Prepaga / Billetera</h4>
                <p className="text-[10px] text-neutral-500 font-medium">0,4 pts c/u</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-black text-neutral-900">
                {display.breakdown.prepaid_wallet.count}{' '}
                {display.breakdown.prepaid_wallet.count === 1 ? 'socio' : 'socios'}
              </div>
              <div className="text-[11px] font-extrabold text-amber-700">
                {formatPoints(display.breakdown.prepaid_wallet.points)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* DETALLE POR CAPTADOR Y POR FECHA EN PERÍODOS / FILTRO INDIVIDUAL */}
      {!isLiveTodayAll && !isInvertedCustomRange && currentRangeData && (
        <div className="bg-white rounded-2xl border border-[#E2DBD0] p-4 sm:p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-[#D6001C] shrink-0" />
              <span>RENDIMIENTO DEL PERÍODO ({rangeDateBadge})</span>
            </h3>
            <span className="text-[11px] font-bold text-neutral-500">
              {currentRangeData.by_member.length}{' '}
              {currentRangeData.by_member.length === 1 ? 'captador' : 'captadores'} con actividad
            </span>
          </div>

          {currentRangeData.by_member.length === 0 ? (
            <p className="text-xs font-medium text-neutral-500 py-3 text-center bg-[#F7F3EE]/60 rounded-xl border border-[#E2DBD0]">
              No hay socios ni horas registradas para el filtro seleccionado.
            </p>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs min-w-[660px]">
                <thead>
                  <tr className="border-b border-[#E2DBD0] text-[10px] font-black text-neutral-500 uppercase tracking-wider bg-[#F7F3EE]/60">
                    <th className="py-2.5 px-2">Captador</th>
                    <th className="py-2.5 px-2 text-center">Horas</th>
                    <th className="py-2.5 px-2 text-center">Socios</th>
                    <th className="py-2.5 px-2 text-center">Edad Prom.</th>
                    <th className="py-2.5 px-2 text-center">Puntos</th>
                    <th className="py-2.5 px-2 text-right">Dinero</th>
                    <th className="py-2.5 px-2 text-center">Pts/h</th>
                    <th className="py-2.5 px-2 text-right">Dinero/h</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2DBD0]/60">
                  {currentRangeData.by_member.map((m) => (
                    <tr key={m.user_id} className="hover:bg-[#F7F3EE]/40">
                      <td className="py-2.5 px-2">
                        <div className="font-black text-neutral-900">{m.full_name}</div>
                        <div className="text-[10px] text-neutral-500">
                          CC:{m.credito_count} • DB:{m.debito_count} • CBU:{m.cbu_count} • PRE:
                          {m.prepaga_count}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center font-bold">{formatHours(m.hours)}</td>
                      <td className="py-2.5 px-2 text-center font-black">{m.socios_count}</td>
                      <td className="py-2.5 px-2 text-center font-medium">
                        {m.average_age !== null ? `${formatNumber(m.average_age, 1)} a` : 'N/D'}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span className="font-black text-[#D6001C] px-2 py-0.5 rounded-full bg-red-50">
                          {formatPoints(m.points)}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right font-bold">{formatPesos(m.amount)}</td>
                      <td className="py-2.5 px-2 text-center font-black">
                        {formatNumber(m.points_per_hour)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-bold">
                        {m.amount_per_hour != null ? formatPesos(m.amount_per_hour) : 'N/D'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeRange.startStr !== activeRange.endStr && currentRangeData.by_date.length > 0 && (
            <div className="pt-2 border-t border-[#E2DBD0]/70 space-y-2">
              <h4 className="text-[11px] font-black text-neutral-700 uppercase tracking-wider">
                Detalle diario del período
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {currentRangeData.by_date.map((d) => (
                  <div
                    key={d.operational_date}
                    className="p-2.5 rounded-xl bg-[#F7F3EE]/60 border border-[#E2DBD0] flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-black text-neutral-900 block">
                        {formatBuenosAiresDate(d.operational_date)}
                      </span>
                      <span className="text-[11px] text-neutral-600">
                        {d.socios_count} {d.socios_count === 1 ? 'socio' : 'socios'} •{' '}
                        {formatHours(d.hours)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-black text-[#D6001C] block">
                        {formatPoints(d.points)}
                      </span>
                      <span className="text-[11px] font-bold text-neutral-700">
                        {formatPesos(d.amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StatsDashboard;
