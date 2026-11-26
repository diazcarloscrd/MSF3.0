import React, { useState, useEffect } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatHours, formatNumber } from '../lib/stats';
import {
  formatShortDate,
  getYesterdayDateString,
  isValidPastOrTodayDate,
} from '../lib/dateUtils';
import { Clock, Users, AlertTriangle, Check, Edit2, X } from 'lucide-react';

export interface HoursSyncSignal {
  bump: number;
  date?: string;
  userId?: string;
  hours?: number;
}

export interface DayTopControlsProps {
  targetDate?: string;
  hoursSync?: HoursSyncSignal;
  onHoursChanged?: (date: string, hours: number) => void;
}

function parseHoursInput(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return NaN;
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed;
  return parseFloat(normalized);
}

export const DayTopControls: React.FC<DayTopControlsProps> = ({
  targetDate,
  hoursSync,
  onHoursChanged,
}) => {
  const {
    myHours,
    updateMyHours,
    activeWorkDay,
    updateDeclaredCollectors,
    partners,
    shifts,
    todayStr,
  } = useWorkDay();
  const { currentMember } = useAuth();

  const effectiveDate =
    targetDate && isValidPastOrTodayDate(targetDate, todayStr) ? targetDate : todayStr;
  const isTodayTarget = effectiveDate === todayStr;
  const yesterdayStr = getYesterdayDateString(todayStr);

  // Horas de fechas pasadas para el captador activo
  const [pastHoursState, setPastHoursState] = useState<{
    date: string;
    userId: string;
    hours: number;
    bump: number;
  } | null>(null);

  const syncBump = hoursSync?.bump ?? 0;

  useEffect(() => {
    if (isTodayTarget || !currentMember || !isValidPastOrTodayDate(effectiveDate, todayStr)) {
      return;
    }

    let cancelled = false;
    supabase
      .from('captor_daily_hours')
      .select('hours_worked')
      .eq('operational_date', effectiveDate)
      .eq('user_id', currentMember.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) {
          setPastHoursState({
            date: effectiveDate,
            userId: currentMember.id,
            hours: data ? Number(data.hours_worked || 0) : 0,
            bump: syncBump,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveDate, isTodayTarget, currentMember, todayStr, syncBump]);

  const hasSyncedPastOverride =
    !isTodayTarget &&
    currentMember !== null &&
    hoursSync !== undefined &&
    hoursSync.date === effectiveDate &&
    hoursSync.userId === currentMember.id &&
    hoursSync.hours !== undefined &&
    (!pastHoursState ||
      pastHoursState.date !== effectiveDate ||
      pastHoursState.userId !== currentMember.id ||
      pastHoursState.bump < hoursSync.bump);

  const displayHours = isTodayTarget
    ? myHours
    : hasSyncedPastOverride
      ? hoursSync!.hours!
      : pastHoursState &&
          currentMember &&
          pastHoursState.date === effectiveDate &&
          pastHoursState.userId === currentMember.id
        ? pastHoursState.hours
        : 0;

  // Estados de Horas (se inicializan al abrir edición, evitando set-state-in-effect)
  const [hoursVal, setHoursVal] = useState<string>(() => displayHours.toString());
  const [editingHoursForDate, setEditingHoursForDate] = useState<string | null>(null);
  const isEditingHours = editingHoursForDate === effectiveDate;
  const [isSavingHours, setIsSavingHours] = useState<boolean>(false);

  // Estados de Captadores
  const declared = activeWorkDay?.declared_collectors_count || 0;
  const [collectorsVal, setCollectorsVal] = useState<string>(() => declared.toString());
  const [isEditingCollectors, setIsEditingCollectors] = useState<boolean>(false);
  const [isSavingCollectors, setIsSavingCollectors] = useState<boolean>(false);
  const [controlError, setControlError] = useState<string | null>(null);

  // Alertas
  const myPartnersCount = partners.filter((p) => {
    if (!currentMember) return false;
    if (p.created_by) return p.created_by === currentMember.id;
    return p.team_member_id === currentMember.id;
  }).length;
  const hasZeroHoursWithPartners = isTodayTarget && myHours === 0 && myPartnersCount > 0;

  const membersWithHours = shifts.filter((s) => Number(s.hours_worked) > 0).length;

  const handleSaveHours = async () => {
    const num = parseHoursInput(hoursVal);
    if (isNaN(num) || num < 0 || num > 24) {
      setControlError('Ingresá una cantidad de horas válida entre 0 y 24.');
      return;
    }
    setControlError(null);
    setIsSavingHours(true);
    const { error } = await updateMyHours(num, effectiveDate);
    setIsSavingHours(false);
    if (error) {
      setControlError(typeof error === 'string' ? error : 'Error al guardar horas.');
      return;
    }
    if (!isTodayTarget && currentMember) {
      setPastHoursState({
        date: effectiveDate,
        userId: currentMember.id,
        hours: num,
        bump: syncBump + 1,
      });
    }
    onHoursChanged?.(effectiveDate, num);
    setEditingHoursForDate(null);
  };

  const handleQuickHours = async (hours: number) => {
    setControlError(null);
    setHoursVal(hours.toString());
    setIsSavingHours(true);
    const { error } = await updateMyHours(hours, effectiveDate);
    setIsSavingHours(false);
    if (error) {
      setControlError(typeof error === 'string' ? error : 'Error al guardar horas.');
      return;
    }
    if (!isTodayTarget && currentMember) {
      setPastHoursState({
        date: effectiveDate,
        userId: currentMember.id,
        hours,
        bump: syncBump + 1,
      });
    }
    onHoursChanged?.(effectiveDate, hours);
    setEditingHoursForDate(null);
  };

  const handleSaveCollectors = async () => {
    const count = parseInt(collectorsVal, 10);
    if (isNaN(count) || count < 0) {
      setControlError('Ingresá una cantidad válida de captadores (0 o más).');
      return;
    }
    setControlError(null);
    setIsSavingCollectors(true);
    const { error } = await updateDeclaredCollectors(count);
    setIsSavingCollectors(false);
    if (error) {
      setControlError(typeof error === 'string' ? error : 'Error al actualizar captadores.');
      return;
    }
    setIsEditingCollectors(false);
  };

  return (
    <div className="space-y-3 mb-4 sm:mb-5">
      {/* DOS RECUADROS UNO AL LADO DEL OTRO EN TABLET/PC, APILADOS EN MÓVIL */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 1. RECUADRO MIS HORAS */}
        <div className="bg-white rounded-2xl border border-[#E2DBD0] p-3.5 sm:p-4 shadow-xs flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-2 bg-[#F7F3EE] rounded-xl text-[#D6001C] shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-[11px] sm:text-xs font-black text-neutral-900 uppercase tracking-wider truncate">
                  {isTodayTarget
                    ? 'MIS HORAS DE HOY'
                    : effectiveDate === yesterdayStr
                      ? `MIS HORAS (AYER ${formatShortDate(effectiveDate)})`
                      : `MIS HORAS (${formatShortDate(effectiveDate)})`}
                </h3>
                <span className="text-[11px] font-bold text-neutral-500 block truncate">
                  {currentMember?.display_name || 'Sin identificar'}
                </span>
              </div>
            </div>

            {!isEditingHours && (
              <button
                type="button"
                onClick={() => {
                  setControlError(null);
                  setHoursVal(displayHours.toString());
                  setEditingHoursForDate(effectiveDate);
                }}
                className="min-h-[44px] min-w-[44px] text-xs font-bold text-neutral-700 hover:text-[#D6001C] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#F7F3EE]/80 hover:bg-neutral-100 border border-[#E2DBD0] transition-colors shrink-0 cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5 shrink-0" />
                <span>Editar</span>
              </button>
            )}
          </div>

          {isEditingHours ? (
            <div className="space-y-2.5 mt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  max={24}
                  value={hoursVal}
                  onChange={(e) => setHoursVal(e.target.value)}
                  className="w-20 h-11 px-2 text-base sm:text-sm font-black text-center bg-[#F7F3EE] border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
                />
                <span className="text-xs font-bold text-neutral-600">hs</span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveHours}
                    disabled={isSavingHours}
                    className="min-h-[44px] min-w-[44px] px-3.5 py-2 bg-[#D6001C] text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-[#b80017] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>Guardar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingHoursForDate(null)}
                    aria-label="Cancelar edición de horas"
                    title="Cancelar"
                    className="min-h-[44px] min-w-[44px] w-11 h-11 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 font-bold text-xs rounded-xl flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  disabled={isSavingHours}
                  onClick={() => handleQuickHours(4)}
                  className="min-h-[44px] min-w-[44px] px-3 py-2 text-xs font-black rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors cursor-pointer"
                >
                  4h (Jornada)
                </button>
                <button
                  type="button"
                  disabled={isSavingHours}
                  onClick={() => handleQuickHours(3)}
                  className="min-h-[44px] min-w-[44px] px-3 py-2 text-xs font-bold rounded-xl bg-[#F7F3EE] hover:bg-neutral-200 text-neutral-700 transition-colors cursor-pointer"
                >
                  3h
                </button>
                <button
                  type="button"
                  disabled={isSavingHours}
                  onClick={() => handleQuickHours(2)}
                  className="min-h-[44px] min-w-[44px] px-3 py-2 text-xs font-bold rounded-xl bg-[#F7F3EE] hover:bg-neutral-200 text-neutral-700 transition-colors cursor-pointer"
                >
                  2h
                </button>
                <button
                  type="button"
                  disabled={isSavingHours}
                  onClick={() => handleQuickHours(0)}
                  className="min-h-[44px] min-w-[44px] px-3 py-2 text-xs font-black rounded-xl bg-neutral-100 hover:bg-amber-50 hover:text-amber-800 text-neutral-600 border border-neutral-300 transition-colors cursor-pointer"
                  title="Marcar franco rotativo o día no trabajado"
                >
                  0h (Franco)
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-baseline justify-between gap-2 mt-1.5 pt-1.5 border-t border-neutral-100 flex-wrap">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-neutral-900 tracking-tight">
                  {formatNumber(displayHours)}
                </span>
                <span className="text-[11px] font-bold text-neutral-500 uppercase">
                  {displayHours === 1 ? 'hora' : 'horas'}
                </span>
              </div>
              <span
                className={`text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                  displayHours > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {displayHours > 0 ? `${formatHours(displayHours)} activa` : '0 h (Franco / Sin turno)'}
              </span>
            </div>
          )}
        </div>

        {/* 2. RECUADRO CANTIDAD DE CAPTADORES */}
        <div className="bg-white rounded-2xl border border-[#E2DBD0] p-3.5 sm:p-4 shadow-xs flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-2 bg-[#F7F3EE] rounded-xl text-[#D6001C] shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-[11px] sm:text-xs font-black text-neutral-900 uppercase tracking-wider truncate">
                  CAPTADORES PRESENTES
                </h3>
                <span className="text-[11px] font-bold text-neutral-500 block truncate">
                  Modificable por el equipo
                </span>
              </div>
            </div>

            {!isEditingCollectors && (
              <button
                type="button"
                onClick={() => {
                  setControlError(null);
                  setCollectorsVal(declared.toString());
                  setIsEditingCollectors(true);
                }}
                className="min-h-[44px] min-w-[44px] text-xs font-bold text-neutral-700 hover:text-[#D6001C] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#F7F3EE]/80 hover:bg-neutral-100 border border-[#E2DBD0] transition-colors shrink-0 cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5 shrink-0" />
                <span>Modificar</span>
              </button>
            )}
          </div>

          {isEditingCollectors ? (
            <div className="flex items-center gap-2 flex-wrap mt-1 pt-1">
              <input
                type="number"
                min={0}
                max={50}
                value={collectorsVal}
                onChange={(e) => setCollectorsVal(e.target.value)}
                className="w-20 h-11 px-2 text-base sm:text-sm font-black text-center bg-[#F7F3EE] border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
              />
              <span className="text-xs font-bold text-neutral-600">pers.</span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveCollectors}
                  disabled={isSavingCollectors}
                  className="min-h-[44px] min-w-[44px] px-3.5 py-2 bg-[#D6001C] text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-[#b80017] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>Guardar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingCollectors(false)}
                  aria-label="Cancelar edición de captadores"
                  title="Cancelar"
                  className="min-h-[44px] min-w-[44px] w-11 h-11 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 font-bold text-xs rounded-xl flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-baseline justify-between gap-2 mt-1.5 pt-1.5 border-t border-neutral-100 flex-wrap">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-neutral-900 tracking-tight">
                  {declared}
                </span>
                <span className="text-[11px] font-bold text-neutral-500 uppercase">
                  {declared === 1 ? 'captador' : 'presentes'}
                </span>
              </div>
              <div className="text-right text-[11px] text-neutral-500">
                Con horas: <strong className="text-neutral-800">{membersWithHours}</strong>
              </div>
            </div>
          )}
        </div>
      </div>

      {controlError && (
        <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700">
          {controlError}
        </div>
      )}

      {/* AVISO DE CERO HORAS CON SOCIOS */}
      {hasZeroHoursWithPartners && (
        <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <strong>¡Atención {currentMember?.display_name}!</strong> Has registrado {myPartnersCount} socio(s) pero tus horas de hoy figuran en 0 h.
            Tocá <strong>Editar</strong> arriba para ingresar tus horas trabajadas y calcular bien tus promedios.
          </div>
        </div>
      )}
    </div>
  );
};
