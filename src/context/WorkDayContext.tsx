import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  WorkDay,
  ShiftAssignment,
  Partner,
  DailyClosure,
  ClosureSummaryData,
  WeeklyMemberReport,
} from '../types/database';
import { calculateLiveDayStats } from '../lib/stats';
import { useAuth } from './AuthContext';

export function getBuenosAiresDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(date);
}

export function getDefaultDeclaredCollectorsForDate(dateStr: string): number {
  const parts = dateStr.split('-').map(Number);
  if (parts.length === 3 && !parts.some(isNaN)) {
    const [year, month, day] = parts;
    const dow = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
    if (dow === 6) return 2; // Sábado rotativo (2 personas)
    if (dow === 0) return 0; // Domingo
  }
  return 7; // Lunes a Viernes (equipo activo)
}

function mapPaymentIdToType(methodId: string): Partner['payment_type'] {
  if (methodId === 'debito') return 'debit_card';
  if (methodId === 'cbu') return 'bank_cbu';
  if (methodId === 'prepaga') return 'prepaid_wallet';
  return 'credit_card';
}

function mapPaymentTypeToDb(paymentType: string): { pts: number; methodId: string; methodName: string } {
  switch (paymentType) {
    case 'debit_card':
      return { pts: 0.7, methodId: 'debito', methodName: 'Tarjeta de débito' };
    case 'bank_cbu':
      return { pts: 0.6, methodId: 'cbu', methodName: 'CBU bancario' };
    case 'prepaid_wallet':
      return { pts: 0.4, methodId: 'prepaga', methodName: 'Tarjeta prepaga / Billetera virtual' };
    case 'credit_card':
    default:
      return { pts: 1.0, methodId: 'credito', methodName: 'Tarjeta de crédito' };
  }
}

function mapDbWeeklyReport(row: any): WeeklyMemberReport {
  return {
    id: `report-${row.year}-w${row.week_number}-${row.user_id}`,
    week_number: Number(row.week_number),
    year: Number(row.year),
    member_id: row.user_id,
    member_name: row.member_name,
    points_earned: Number(row.points_earned || 0),
    invalid_and_cancellations: Number(row.invalid_and_cancellations || 0),
    final_points: Number(row.final_points || 0),
    hours: Number(row.hours || 0),
    points_per_hour: row.points_per_hour !== null && row.points_per_hour !== undefined ? Number(row.points_per_hour) : null,
    total_amount: Number(row.total_amount || 0),
    final_partners: Number(row.final_partners || 0),
    average_amount: row.average_amount !== null && row.average_amount !== undefined ? Number(row.average_amount) : null,
    notes: row.notes || undefined,
    updated_at: row.updated_at || new Date().toISOString(),
  };
}

interface WorkDayContextType {
  todayStr: string;
  newDayNotice: string | null;
  currentWorkDay: WorkDay | null;
  historicalWorkDay: WorkDay | null;
  activeWorkDay: WorkDay | null;
  isViewingHistory: boolean;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  availableDates: string[];
  shifts: ShiftAssignment[];
  partners: Partner[];
  historicalClosure: DailyClosure | null;
  stats: ClosureSummaryData | null;
  loading: boolean;
  isConnected: boolean;
  myHours: number;
  updateMyHours: (hours: number) => Promise<{ error: any }>;
  updateMemberHours: (memberId: string, hours: number, targetDate?: string) => Promise<{ error: any }>;
  updateDeclaredCollectors: (count: number) => Promise<{ error: any }>;
  addPartner: (data: { age: number; amount: number; paymentType: string }) => Promise<{ data?: Partner; error?: any }>;
  updatePartner: (partnerId: string, data: { age: number; amount: number; paymentType: string }) => Promise<{ error: any }>;
  deletePartner: (partnerId: string) => Promise<{ error: any }>;
  closeCurrentDay: (auto?: boolean) => Promise<{ data?: DailyClosure; error?: any }>;
  reopenDay: (workDayId: string) => Promise<{ error: any }>;
  exitHistoricalView: () => void;
  refreshData: () => Promise<void>;
  weeklyReports: WeeklyMemberReport[];
  saveWeeklyReport: (report: WeeklyMemberReport) => Promise<{ error: any }>;
}

const WorkDayContext = createContext<WorkDayContextType>({} as WorkDayContextType);

export const WorkDayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, currentMember, teamMembers, isAdmin } = useAuth();

  const initialToday = getBuenosAiresDateString();
  const [todayStr, setTodayStr] = useState<string>(initialToday);
  const todayStrRef = useRef<string>(initialToday);

  const [selectedDate, setSelectedDate] = useState<string>(initialToday);
  const selectedDateRef = useRef<string>(initialToday);
  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  const [availableDates, setAvailableDates] = useState<string[]>([initialToday]);
  const [newDayNotice, setNewDayNotice] = useState<string | null>(null);

  const [currentWorkDay, setCurrentWorkDay] = useState<WorkDay>({
    id: 'workday-' + initialToday,
    work_date: initialToday,
    status: 'OPEN',
    declared_collectors_count: getDefaultDeclaredCollectorsForDate(initialToday),
    opened_at: new Date().toISOString(),
    closed_at: null,
    auto_closed: false,
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const [shifts, setShifts] = useState<ShiftAssignment[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [historicalClosure] = useState<DailyClosure | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [weeklyReports, setWeeklyReports] = useState<WeeklyMemberReport[]>([]);

  const isViewingHistory = selectedDate !== todayStr;
  const activeWorkDay: WorkDay = {
    ...currentWorkDay,
    status: isViewingHistory ? 'CLOSED' : 'OPEN',
  };

  const fetchOperationalDate = useCallback(async (): Promise<string> => {
    try {
      const { data, error } = await supabase.rpc('get_operational_date');
      if (!error && typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data)) {
        return data;
      }
    } catch {}
    return getBuenosAiresDateString();
  }, []);

  const buildShiftsFromDb = useCallback(
    (dateStr: string, dbHoursRows: any[]) => {
      return teamMembers.map((m) => {
        const matchedRow = (dbHoursRows || []).find((r: any) => r.user_id === m.id);
        const hrs = matchedRow ? Number(matchedRow.hours_worked || 0) : 0;
        return {
          id: `shift-${dateStr}-${m.id}`,
          operational_date: dateStr,
          team_member_id: m.id,
          team_member_name: m.display_name,
          hours_worked: hrs,
          is_present: hrs > 0,
          declared_at: matchedRow?.updated_at || new Date().toISOString(),
          created_at: matchedRow?.updated_at || new Date().toISOString(),
          updated_at: matchedRow?.updated_at || new Date().toISOString(),
          team_member: m,
        };
      });
    },
    [teamMembers]
  );

  // Cargar fechas históricas con socios registrados
  const loadAvailableDates = useCallback(
    async (baseToday?: string) => {
      if (!isAuthenticated) return;
      const activeToday = baseToday || todayStrRef.current;
      try {
        const { data } = await supabase
          .from('socios')
          .select('operational_date')
          .order('operational_date', { ascending: false });

        const unique = Array.from(
          new Set([activeToday, ...(data || []).map((d: any) => d.operational_date)])
        ).sort((a, b) => b.localeCompare(a));
        setAvailableDates(unique);
      } catch (err) {
        console.warn('Could not load available dates', err);
      }
    },
    [isAuthenticated]
  );

  // Cargar reportes semanales desde PostgreSQL
  const loadWeeklyReports = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const { data, error } = await supabase
        .from('weekly_reports')
        .select('*')
        .order('year', { ascending: false })
        .order('week_number', { ascending: false });

      if (!error && data) {
        setWeeklyReports(data.map(mapDbWeeklyReport));
      }
    } catch (err) {
      console.warn('Could not load weekly reports', err);
    }
  }, [isAuthenticated]);

  const saveWeeklyReport = async (report: WeeklyMemberReport): Promise<{ error: any }> => {
    if (!isAuthenticated) return { error: 'Debes iniciar sesión.' };

    try {
      const { data, error } = await supabase
        .from('weekly_reports')
        .upsert(
          {
            year: report.year,
            week_number: report.week_number,
            user_id: report.member_id,
            member_name: report.member_name,
            points_earned: report.points_earned,
            invalid_and_cancellations: report.invalid_and_cancellations,
            final_points: report.final_points,
            hours: report.hours,
            points_per_hour: report.points_per_hour,
            total_amount: report.total_amount,
            final_partners: report.final_partners,
            average_amount: report.average_amount,
            notes: report.notes || null,
          },
          { onConflict: 'year,week_number,user_id' }
        )
        .select('*')
        .single();

      if (error) {
        return { error: error.message || 'No se pudo guardar la planilla semanal.' };
      }

      const savedMapped = mapDbWeeklyReport(data);
      setWeeklyReports((prev) => {
        const idx = prev.findIndex(
          (r) =>
            r.week_number === savedMapped.week_number &&
            r.year === savedMapped.year &&
            r.member_id === savedMapped.member_id
        );
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = savedMapped;
          return next;
        }
        return [...prev, savedMapped];
      });

      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Error al guardar la planilla semanal.' };
    }
  };

  // Cargar socios, horas individuales y configuración de una fecha desde PostgreSQL
  const loadDayData = useCallback(
    async (dateToLoad: string) => {
      if (!isAuthenticated) return;
      setLoading(true);
      try {
        const [sociosRes, settingsRes, hoursRes] = await Promise.all([
          supabase
            .from('socios')
            .select('*')
            .eq('operational_date', dateToLoad)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false }),
          supabase
            .from('daily_settings')
            .select('*')
            .eq('operational_date', dateToLoad)
            .maybeSingle(),
          supabase
            .from('captor_daily_hours')
            .select('operational_date, user_id, hours_worked, updated_at')
            .eq('operational_date', dateToLoad),
        ]);

        if (sociosRes.error) throw sociosRes.error;
        if (settingsRes.error) throw settingsRes.error;
        if (hoursRes.error) throw hoursRes.error;

        const sociosData = sociosRes.data || [];
        const mappedPartners: Partner[] = sociosData.map((s: any, idx: number) => ({
          id: s.id,
          operational_date: s.operational_date,
          team_member_id: s.created_by,
          created_by: s.created_by,
          created_by_name: s.created_by_name || 'Captador',
          sequence_number: sociosData.length - idx,
          payment_type: mapPaymentIdToType(s.payment_method_id),
          payment_method_id: s.payment_method_id,
          payment_method_name: s.payment_method_name,
          points: Number(s.points || 0),
          age: Number(s.age || 0),
          contribution_amount: Number(s.amount || 0),
          amount: Number(s.amount || 0),
          contribution_frequency: 'monthly',
          captured_at: s.created_at,
          created_at: s.created_at,
          updated_at: s.updated_at,
        }));
        setPartners(mappedPartners);

        const settingsRow = settingsRes.data;
        const declaredCount =
          settingsRow?.captor_count !== null && settingsRow?.captor_count !== undefined
            ? Number(settingsRow.captor_count)
            : getDefaultDeclaredCollectorsForDate(dateToLoad);

        setCurrentWorkDay((prev) => ({
          ...prev,
          id: 'workday-' + dateToLoad,
          work_date: dateToLoad,
          status: dateToLoad === todayStrRef.current ? 'OPEN' : 'CLOSED',
          declared_collectors_count: declaredCount,
        }));

        setShifts(buildShiftsFromDb(dateToLoad, hoursRes.data || []));
      } catch (e) {
        console.warn('Error loading day data from Supabase', e);
      } finally {
        setLoading(false);
      }
    },
    [isAuthenticated, buildShiftsFromDb]
  );

  // Limpiar estado al cerrar sesión
  useEffect(() => {
    if (!isAuthenticated) {
      setPartners([]);
      setShifts([]);
      setWeeklyReports([]);
      const freshToday = getBuenosAiresDateString();
      todayStrRef.current = freshToday;
      setTodayStr(freshToday);
      setSelectedDate(freshToday);
      return;
    }

    loadAvailableDates();
    loadWeeklyReports();
  }, [isAuthenticated, loadAvailableDates, loadWeeklyReports]);

  // Cargar datos cuando cambia la fecha seleccionada o la sesión
  useEffect(() => {
    if (isAuthenticated) {
      loadDayData(selectedDate);
    }
  }, [isAuthenticated, selectedDate, loadDayData]);

  // Control automático de cambio de jornada a las 00:00 hs (America/Argentina/Buenos_Aires)
  // Los socios y horas del día finalizado quedan guardados en PostgreSQL bajo su operational_date,
  // y al cruzar las 00:00 el panel principal limpia los contadores e inicia la nueva jornada en 0.
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    const verifyOperationalDay = async () => {
      const serverToday = await fetchOperationalDate();
      if (cancelled) return;

      if (serverToday !== todayStrRef.current) {
        const previousToday = todayStrRef.current;
        todayStrRef.current = serverToday;
        setTodayStr(serverToday);

        // Si estaba en la jornada activa (no explorando una fecha antigua), avanzar al nuevo día en blanco
        if (selectedDateRef.current === previousToday) {
          setPartners([]);
          setShifts(buildShiftsFromDb(serverToday, []));
          setSelectedDate(serverToday);
          setNewDayNotice(`Comenzó una nueva jornada (${serverToday}). Los registros anteriores quedaron guardados en el historial.`);
          setTimeout(() => setNewDayNotice(null), 6000);
        }

        await loadAvailableDates(serverToday);
        if (selectedDateRef.current === serverToday) {
          await loadDayData(serverToday);
        }
      }
    };

    verifyOperationalDay();
    const intervalId = setInterval(verifyOperationalDay, 20000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        verifyOperationalDay();
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('online', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('online', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [isAuthenticated, fetchOperationalDate, buildShiftsFromDb, loadAvailableDates, loadDayData]);

  // Suscripción Realtime en todas las tablas operativas
  useEffect(() => {
    if (!isAuthenticated) return;

    const channel = supabase
      .channel(`msf3-live-${selectedDate}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'socios' },
        (payload: any) => {
          if (
            payload.new?.operational_date === selectedDate ||
            payload.old?.operational_date === selectedDate ||
            !payload.new?.operational_date
          ) {
            loadDayData(selectedDate);
            loadAvailableDates();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_settings' },
        (payload: any) => {
          if (payload.new?.operational_date === selectedDate || payload.old?.operational_date === selectedDate) {
            loadDayData(selectedDate);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'captor_daily_hours' },
        (payload: any) => {
          if (payload.new?.operational_date === selectedDate || payload.old?.operational_date === selectedDate) {
            loadDayData(selectedDate);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'weekly_reports' },
        () => {
          loadWeeklyReports();
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') {
          loadDayData(selectedDate);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, selectedDate, loadDayData, loadAvailableDates, loadWeeklyReports]);

  const refreshData = async () => {
    await Promise.all([loadDayData(selectedDate), loadAvailableDates(), loadWeeklyReports()]);
  };

  const myShift = shifts.find(
    (s) =>
      s.team_member_id === currentMember?.id ||
      s.team_member_name?.toLowerCase() === currentMember?.display_name.toLowerCase()
  );
  const myHours = myShift ? Number(myShift.hours_worked) : 0;

  const updateMemberHours = async (memberId: string, hours: number, targetDate?: string) => {
    if (!isAuthenticated || !currentMember) {
      return { error: 'Debes iniciar sesión primero.' };
    }

    const numHours = Number(hours);
    if (isNaN(numHours) || numHours < 0 || numHours > 24) {
      return { error: 'Horas inválidas (debe ser entre 0 y 24).' };
    }

    if (!isAdmin && memberId !== currentMember.id) {
      return { error: 'Solo podés editar tus propias horas trabajadas.' };
    }

    const effectiveDate = targetDate || selectedDate;

    try {
      const { error } = await supabase.from('captor_daily_hours').upsert(
        {
          operational_date: effectiveDate,
          user_id: memberId,
          hours_worked: numHours,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'operational_date,user_id' }
      );

      if (error) {
        return { error: error.message || 'No se pudieron guardar las horas en la base de datos.' };
      }

      if (effectiveDate === selectedDate) {
        setShifts((prev) =>
          prev.map((s) =>
            s.team_member_id === memberId
              ? { ...s, hours_worked: numHours, is_present: numHours > 0, updated_at: new Date().toISOString() }
              : s
          )
        );
      }

      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Error de conexión al guardar horas.' };
    }
  };

  const updateMyHours = async (hours: number) => {
    if (!currentMember) return { error: 'Debe identificarse primero.' };
    return updateMemberHours(currentMember.id, hours);
  };

  const updateDeclaredCollectors = async (count: number) => {
    if (!isAuthenticated || !currentMember) return { error: 'Debes iniciar sesión.' };

    const numCount = parseInt(String(count), 10);
    if (isNaN(numCount) || numCount < 0) return { error: 'Número inválido.' };

    try {
      const { error } = await supabase
        .from('daily_settings')
        .upsert(
          {
            operational_date: selectedDate,
            captor_count: numCount,
          },
          { onConflict: 'operational_date' }
        );

      if (error) {
        return { error: error.message || 'No se pudo guardar la cantidad de captadores.' };
      }

      setCurrentWorkDay((prev) => ({ ...prev, declared_collectors_count: numCount }));
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Error de conexión.' };
    }
  };

  const addPartner = async ({
    age,
    amount,
    paymentType,
  }: {
    age: number;
    amount: number;
    paymentType: string;
  }) => {
    if (!isAuthenticated || !currentMember) {
      return { error: 'Debe identificarse para registrar un socio.' };
    }

    const { pts, methodId, methodName } = mapPaymentTypeToDb(paymentType);

    try {
      const { data, error } = await supabase
        .from('socios')
        .insert({
          operational_date: selectedDate,
          age,
          amount,
          payment_method_id: methodId,
          payment_method_name: methodName,
          points: pts,
          created_by: currentMember.id,
          created_by_name: currentMember.display_name,
        })
        .select('*')
        .single();

      if (error || !data) {
        return { error: error?.message || 'No se pudo confirmar el registro en la base de datos.' };
      }

      await Promise.all([loadDayData(selectedDate), loadAvailableDates()]);
      return { data: data as any };
    } catch (err: any) {
      return { error: err?.message || 'Error de conexión al guardar el socio.' };
    }
  };

  const updatePartner = async (
    partnerId: string,
    data: { age: number; amount: number; paymentType: string }
  ) => {
    const p = partners.find((item) => item.id === partnerId);
    if (!p) return { error: 'Registro no encontrado.' };

    if (!isAdmin && p.team_member_id !== currentMember?.id) {
      return { error: 'No tienes permiso para modificar socios de otros captadores.' };
    }

    const { pts, methodId, methodName } = mapPaymentTypeToDb(data.paymentType);

    try {
      const { data: savedRow, error } = await supabase
        .from('socios')
        .update({
          age: data.age,
          amount: data.amount,
          payment_method_id: methodId,
          payment_method_name: methodName,
          points: pts,
        })
        .eq('id', partnerId)
        .select('*')
        .maybeSingle();

      if (error) return { error: error.message || 'Error al actualizar el socio.' };
      if (!savedRow) return { error: 'No tienes permiso o el registro ya no existe.' };

      await loadDayData(selectedDate);
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Error de conexión al modificar socio.' };
    }
  };

  const deletePartner = async (partnerId: string) => {
    const p = partners.find((item) => item.id === partnerId);
    if (!p) return { error: 'Registro no encontrado.' };

    if (!isAdmin && p.team_member_id !== currentMember?.id) {
      return { error: 'No tienes permiso para eliminar socios de otros captadores.' };
    }

    try {
      const { data: deletedRow, error } = await supabase
        .from('socios')
        .delete()
        .eq('id', partnerId)
        .select('id')
        .maybeSingle();

      if (error) return { error: error.message || 'Error al eliminar el socio.' };
      if (!deletedRow) return { error: 'No tienes permiso o el registro ya fue eliminado.' };

      await Promise.all([loadDayData(selectedDate), loadAvailableDates()]);
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Error de conexión al eliminar socio.' };
    }
  };

  const closeCurrentDay = async (_auto = false) => {
    return { data: undefined, error: null };
  };

  const reopenDay = async (_workDayId: string) => {
    return { error: null };
  };

  const exitHistoricalView = useCallback(() => {
    setSelectedDate(todayStrRef.current);
  }, []);

  const stats = calculateLiveDayStats(
    currentWorkDay.declared_collectors_count,
    partners,
    shifts,
    teamMembers,
    selectedDate
  );

  return (
    <WorkDayContext.Provider
      value={{
        todayStr,
        newDayNotice,
        currentWorkDay,
        historicalWorkDay: isViewingHistory ? activeWorkDay : null,
        activeWorkDay,
        isViewingHistory,
        selectedDate,
        setSelectedDate,
        availableDates,
        shifts,
        partners,
        historicalClosure,
        stats,
        loading,
        isConnected,
        myHours,
        updateMyHours,
        updateMemberHours,
        updateDeclaredCollectors,
        addPartner,
        updatePartner,
        deletePartner,
        closeCurrentDay,
        reopenDay,
        exitHistoricalView,
        refreshData,
        weeklyReports,
        saveWeeklyReport,
      }}
    >
      {children}
    </WorkDayContext.Provider>
  );
};

export const useWorkDay = () => useContext(WorkDayContext);
