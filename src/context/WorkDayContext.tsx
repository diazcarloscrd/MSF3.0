import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  ClosureSummaryData,
  DailyAttendance,
  DailyClosure,
  MovePartnersResult,
  Partner,
  ShiftAssignment,
  StatsRangeResponse,
  WeeklyMemberReport,
  WorkDay,
  WorkDayStatus,
} from '../types/database';
import {
  calculateLiveDayStats,
  enrichRangeStats,
  generateWhatsAppReport,
} from '../lib/stats';
import {
  getBuenosAiresDateString,
  getDefaultDeclaredCollectorsForDate,
  isValidDateString,
  isValidPastOrTodayDate,
} from '../lib/dateUtils';
import {
  QueuedPartnerSubmission,
  enqueueOfflinePartner,
  flushOfflineQueue,
  generateClientRequestId,
  getOfflineQueue,
  isNetworkError,
  registerOnlineQueueFlush,
} from '../lib/offlineQueue';
import { useAuth } from './AuthContext';

function mapPaymentIdToType(methodId: string): Partner['payment_type'] {
  if (methodId === 'debito') return 'debit_card';
  if (methodId === 'cbu') return 'bank_cbu';
  if (methodId === 'prepaga') return 'prepaid_wallet';
  return 'credit_card';
}

function mapPaymentTypeToDb(paymentType: string): {
  pts: number;
  methodId: string;
  methodName: string;
} {
  switch (paymentType) {
    case 'debit_card':
      return { pts: 0.7, methodId: 'debito', methodName: 'Tarjeta de débito' };
    case 'bank_cbu':
      return { pts: 0.6, methodId: 'cbu', methodName: 'CBU bancario' };
    case 'prepaid_wallet':
      return {
        pts: 0.4,
        methodId: 'prepaga',
        methodName: 'Tarjeta prepaga / Billetera virtual',
      };
    case 'credit_card':
    default:
      return { pts: 1.0, methodId: 'credito', methodName: 'Tarjeta de crédito' };
  }
}

function mapDbSocioToPartner(s: any, sequenceNumber = 1): Partner {
  return {
    id: s.id,
    operational_date: s.operational_date,
    team_member_id: s.created_by,
    created_by: s.created_by,
    created_by_name: s.created_by_name || 'Captador',
    sequence_number: sequenceNumber,
    payment_type: mapPaymentIdToType(s.payment_method_id),
    payment_method_id: s.payment_method_id,
    payment_method_name: s.payment_method_name,
    points: Number(s.points || 0),
    age: Number(s.age || 0),
    contribution_amount: Number(s.amount || 0),
    amount: Number(s.amount || 0),
    contribution_frequency: 'monthly',
    captured_at: s.created_at,
    client_request_id: s.client_request_id ?? null,
    updated_by: s.updated_by ?? null,
    created_at: s.created_at,
    updated_at: s.updated_at,
  };
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
    points_per_hour:
      row.points_per_hour !== null && row.points_per_hour !== undefined
        ? Number(row.points_per_hour)
        : null,
    total_amount: Number(row.total_amount || 0),
    final_partners: Number(row.final_partners || 0),
    average_amount:
      row.average_amount !== null && row.average_amount !== undefined
        ? Number(row.average_amount)
        : null,
    notes: row.notes || undefined,
    updated_at: row.updated_at || new Date().toISOString(),
  };
}

function mapDbDailyClosure(row: any): DailyClosure {
  return {
    id: `closure-${row.operational_date}`,
    operational_date: row.operational_date,
    work_date: row.operational_date,
    summary_data: row.summary_data as ClosureSummaryData,
    whatsapp_message: row.whatsapp_message,
    present_user_ids: Array.isArray(row.present_user_ids) ? row.present_user_ids : [],
    notes: row.notes ?? null,
    status: (row.status as WorkDayStatus) || 'CLOSED',
    closed_by: row.closed_by ?? null,
    closed_at: row.closed_at,
    created_at: row.closed_at,
  };
}

export interface AddPartnerInput {
  age: number;
  amount: number;
  paymentType: string;
  targetDate?: string;
  clientRequestId?: string;
}

export interface AddPartnerResult {
  data?: Partner;
  duplicate?: boolean;
  queued?: boolean;
  isNetworkError?: boolean;
  clientRequestId?: string;
  error?: any;
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
  hoursByUser: Record<string, number>;
  partners: Partner[];
  declaredCollectorsCount: number;
  dailySettingsNotes: string;
  dailyAttendance: DailyAttendance[];
  dailyClosure: DailyClosure | null;
  historicalClosure: DailyClosure | null;
  isDailyClosureOutdated: boolean;
  stats: ClosureSummaryData | null;
  loading: boolean;
  hasInitialLoaded: boolean;
  isConnected: boolean;
  myHours: number;
  pendingOfflinePartners: QueuedPartnerSubmission[];
  updateMyHours: (hours: number, targetDate?: string) => Promise<{ error: any }>;
  updateMemberHours: (memberId: string, hours: number, targetDate?: string) => Promise<{ error: any }>;
  updateDeclaredCollectors: (count: number) => Promise<{ error: any }>;
  saveDailyNotes: (notes: string) => Promise<{ error: any }>;
  setAttendance: (userId: string, isPresent: boolean) => Promise<{ error: string | null }>;
  syncAttendanceFromActivity: () => Promise<{ error: string | null }>;
  addPartner: (
    data: AddPartnerInput,
    targetDate?: string,
    clientRequestId?: string
  ) => Promise<AddPartnerResult>;
  updatePartner: (
    partnerId: string,
    data: { age: number; amount: number; paymentType: string }
  ) => Promise<{ error: any }>;
  deletePartner: (partnerId: string) => Promise<{ error: any }>;
  movePartnersToDate: (
    partnerIds: string[],
    targetDate: string
  ) => Promise<MovePartnersResult>;
  closeCurrentDay: (
    presentUserIdsOrAuto?: string[] | boolean,
    notes?: string
  ) => Promise<{ data?: DailyClosure; error?: any }>;
  reopenDay: (workDayId: string) => Promise<{ error: any }>;
  exitHistoricalView: () => void;
  refreshData: () => Promise<void>;
  getStatsByRange: (
    startDate: string,
    endDate: string,
    userId?: string | null
  ) => Promise<{ data: StatsRangeResponse | null; error: string | null }>;
  retryOfflineQueue: () => Promise<{ sent: number; deduplicated: number; failed: number }>;
  weeklyReports: WeeklyMemberReport[];
  saveWeeklyReport: (report: WeeklyMemberReport) => Promise<{ error: any }>;
}

const WorkDayContext = createContext<WorkDayContextType>({} as WorkDayContextType);

export const WorkDayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, currentMember, teamMembers, isAdmin } = useAuth();

  const initialToday = getBuenosAiresDateString();
  const [todayStr, setTodayStr] = useState<string>(initialToday);
  const todayStrRef = useRef<string>(initialToday);

  const [selectedDate, setSelectedDateState] = useState<string>(initialToday);
  const selectedDateRef = useRef<string>(initialToday);
  const dayLoadSeqRef = useRef<number>(0);
  const loadedSocioIdsRef = useRef<Set<string>>(new Set());

  const setSelectedDate = useCallback((date: string) => {
    if (date !== selectedDateRef.current) {
      loadedSocioIdsRef.current = new Set();
    }
    selectedDateRef.current = date;
    setSelectedDateState(date);
  }, []);

  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  const [availableDates, setAvailableDates] = useState<string[]>([initialToday]);
  const [newDayNotice, setNewDayNotice] = useState<string | null>(null);

  const [currentWorkDay, setCurrentWorkDay] = useState<WorkDay>(() => {
    const nowIso = new Date().toISOString();
    return {
      id: 'workday-' + initialToday,
      work_date: initialToday,
      status: 'OPEN',
      declared_collectors_count: getDefaultDeclaredCollectorsForDate(initialToday),
      opened_at: nowIso,
      closed_at: null,
      auto_closed: false,
      notes: null,
      created_at: nowIso,
      updated_at: nowIso,
    };
  });

  const [shifts, setShifts] = useState<ShiftAssignment[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [dailySettingsNotes, setDailySettingsNotes] = useState<string>('');
  const [dailyAttendance, setDailyAttendance] = useState<DailyAttendance[]>([]);
  const [dailyClosure, setDailyClosure] = useState<DailyClosure | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [hasInitialLoaded, setHasInitialLoaded] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [weeklyReports, setWeeklyReports] = useState<WeeklyMemberReport[]>([]);
  const [offlineVersion, setOfflineVersion] = useState<number>(0);

  const pendingOfflinePartners = useMemo(() => {
    void offlineVersion;
    return isAuthenticated ? getOfflineQueue(currentMember?.id) : [];
  }, [offlineVersion, currentMember?.id, isAuthenticated]);

  const refreshPendingOffline = useCallback(() => {
    setOfflineVersion((v) => v + 1);
  }, []);

  const isViewingHistory = selectedDate !== todayStr;
  const activeWorkDay: WorkDay = {
    ...currentWorkDay,
    status: dailyClosure?.status || (isViewingHistory ? 'CLOSED' : 'OPEN'),
    closed_at: dailyClosure?.closed_at || null,
    notes: dailySettingsNotes || null,
  };

  const activeCollectorsCount = useMemo(() => {
    const count = teamMembers.filter((m) => m.is_active && m.role !== 'ADMIN').length;
    return count > 0 ? count : 7;
  }, [teamMembers]);

  const fetchOperationalDate = useCallback(async (): Promise<string> => {
    try {
      const { data, error } = await supabase.rpc('get_operational_date');
      if (!error && typeof data === 'string' && isValidDateString(data)) {
        return data;
      }
    } catch {
      // Fall back to local Buenos Aires date calculation
    }
    return getBuenosAiresDateString();
  }, []);

  const buildShiftsFromDb = useCallback(
    (
      dateStr: string,
      dbHoursRows: any[],
      dbAttendanceRows: DailyAttendance[] = [],
      dayPartners: Partner[] = []
    ): ShiftAssignment[] => {
      return teamMembers.map((m) => {
        const matchedHour = (dbHoursRows || []).find((r: any) => r.user_id === m.id);
        const hrs = matchedHour ? Number(matchedHour.hours_worked || 0) : 0;
        const matchedAtt = (dbAttendanceRows || []).find((a) => a.user_id === m.id);
        const hasPartner = dayPartners.some(
          (p) => p.created_by === m.id || p.team_member_id === m.id
        );
        const isPresent = matchedAtt
          ? Boolean(matchedAtt.is_present)
          : hrs > 0 || hasPartner;

        return {
          id: `shift-${dateStr}-${m.id}`,
          operational_date: dateStr,
          team_member_id: m.id,
          team_member_name: m.display_name,
          hours_worked: hrs,
          is_present: isPresent,
          declared_at:
            matchedAtt?.updated_at || matchedHour?.updated_at || new Date().toISOString(),
          created_at: matchedHour?.updated_at || new Date().toISOString(),
          updated_at: matchedHour?.updated_at || new Date().toISOString(),
          team_member: m,
        };
      });
    },
    [teamMembers]
  );

  // Cargar fechas operativas disponibles vía RPC (evita el tope de 1000 filas de PostgREST)
  const loadAvailableDates = useCallback(
    async (baseToday?: string) => {
      if (!isAuthenticated) return;
      const activeToday = baseToday || todayStrRef.current;
      try {
        const { data, error } = await supabase.rpc('get_available_operational_dates');
        if (error) {
          console.warn('Could not load available dates via RPC', error);
          setAvailableDates((prev) =>
            Array.from(new Set([activeToday, ...prev])).sort((a, b) => b.localeCompare(a))
          );
          return;
        }

        const rpcDates = Array.isArray(data)
          ? data.filter((d): d is string => typeof d === 'string' && isValidDateString(d))
          : [];
        const unique = Array.from(new Set([activeToday, ...rpcDates])).sort((a, b) =>
          b.localeCompare(a)
        );
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

  // Cargar socios, horas individuales, configuración, asistencia y cierre de una fecha desde PostgreSQL
  const loadDayData = useCallback(
    async (dateToLoad: string) => {
      if (!isAuthenticated) return;
      const seq = ++dayLoadSeqRef.current;
      setLoading(true);
      try {
        const [sociosRes, settingsRes, hoursRes, attendanceRes, closureRes] = await Promise.all([
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
          supabase
            .from('daily_attendance')
            .select('operational_date, user_id, is_present, updated_at, updated_by')
            .eq('operational_date', dateToLoad),
          supabase
            .from('daily_closures')
            .select('*')
            .eq('operational_date', dateToLoad)
            .maybeSingle(),
        ]);

        if (sociosRes.error) throw sociosRes.error;
        if (settingsRes.error) throw settingsRes.error;
        if (hoursRes.error) throw hoursRes.error;
        if (attendanceRes.error) throw attendanceRes.error;
        if (closureRes.error) throw closureRes.error;

        if (seq !== dayLoadSeqRef.current || dateToLoad !== selectedDateRef.current) {
          return;
        }

        const sociosData = sociosRes.data || [];
        const mappedPartners: Partner[] = sociosData.map((s: any, idx: number) =>
          mapDbSocioToPartner(s, sociosData.length - idx)
        );
        loadedSocioIdsRef.current = new Set(mappedPartners.map((p) => p.id));
        setPartners(mappedPartners);

        const settingsRow = settingsRes.data;
        const declaredCount =
          settingsRow?.captor_count !== null && settingsRow?.captor_count !== undefined
            ? Number(settingsRow.captor_count)
            : getDefaultDeclaredCollectorsForDate(dateToLoad, activeCollectorsCount);
        const notesValue = settingsRow?.notes ? String(settingsRow.notes) : '';
        setDailySettingsNotes(notesValue);

        const mappedClosure = closureRes.data ? mapDbDailyClosure(closureRes.data) : null;
        setDailyClosure(mappedClosure);

        setCurrentWorkDay((prev) => ({
          ...prev,
          id: 'workday-' + dateToLoad,
          work_date: dateToLoad,
          status:
            mappedClosure?.status ||
            (dateToLoad === todayStrRef.current ? 'OPEN' : 'CLOSED'),
          declared_collectors_count: declaredCount,
          closed_at: mappedClosure?.closed_at || null,
          notes: notesValue || null,
        }));

        const attendanceRows = (attendanceRes.data || []) as DailyAttendance[];
        setDailyAttendance(attendanceRows);

        setShifts(
          buildShiftsFromDb(
            dateToLoad,
            hoursRes.data || [],
            attendanceRows,
            mappedPartners
          )
        );
      } catch (e) {
        console.warn('Error loading day data from Supabase', e);
      } finally {
        if (seq === dayLoadSeqRef.current && dateToLoad === selectedDateRef.current) {
          setLoading(false);
          setHasInitialLoaded(true);
        }
      }
    },
    [isAuthenticated, activeCollectorsCount, buildShiftsFromDb]
  );

  // Limpiar estado al cerrar sesión
  useEffect(() => {
    if (!isAuthenticated) {
      dayLoadSeqRef.current += 1;
      loadedSocioIdsRef.current = new Set();
      setPartners([]);
      setShifts([]);
      setWeeklyReports([]);
      setDailyAttendance([]);
      setDailyClosure(null);
      setDailySettingsNotes('');
      setLoading(false);
      setHasInitialLoaded(false);
      const freshToday = getBuenosAiresDateString();
      todayStrRef.current = freshToday;
      setTodayStr(freshToday);
      setSelectedDate(freshToday);
      return;
    }

    loadAvailableDates();
    loadWeeklyReports();
  }, [isAuthenticated, loadAvailableDates, loadWeeklyReports, setSelectedDate]);

  // Cargar datos cuando cambia la fecha seleccionada o la sesión
  useEffect(() => {
    if (isAuthenticated) {
      loadDayData(selectedDate);
    }
  }, [isAuthenticated, selectedDate, loadDayData]);

  // Control automático de cambio de jornada a las 00:00 hs (America/Argentina/Buenos_Aires)
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

        if (selectedDateRef.current === previousToday) {
          loadedSocioIdsRef.current = new Set();
          setPartners([]);
          setShifts(buildShiftsFromDb(serverToday, [], [], []));
          setDailyAttendance([]);
          setDailyClosure(null);
          setDailySettingsNotes('');
          setSelectedDate(serverToday);
          setNewDayNotice(
            `Comenzó una nueva jornada (${serverToday}). Los registros anteriores quedaron guardados en el historial.`
          );
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
  }, [isAuthenticated, fetchOperationalDate, buildShiftsFromDb, loadAvailableDates, loadDayData, setSelectedDate]);

  // Suscripción Realtime en todas las tablas operativas (incluyendo daily_attendance y daily_closures)
  useEffect(() => {
    if (!isAuthenticated) return;

    const channel = supabase
      .channel(`msf3-live-${selectedDate}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'socios' },
        (payload: any) => {
          const newRow = payload?.new;
          const oldRow = payload?.old;
          if (
            newRow?.operational_date === selectedDate ||
            oldRow?.operational_date === selectedDate ||
            (newRow?.id && loadedSocioIdsRef.current.has(newRow.id)) ||
            (oldRow?.id && loadedSocioIdsRef.current.has(oldRow.id))
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
          if (
            payload.new?.operational_date === selectedDate ||
            payload.old?.operational_date === selectedDate
          ) {
            loadDayData(selectedDate);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'captor_daily_hours' },
        (payload: any) => {
          if (
            payload.new?.operational_date === selectedDate ||
            payload.old?.operational_date === selectedDate
          ) {
            loadDayData(selectedDate);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_attendance' },
        (payload: any) => {
          if (
            payload.new?.operational_date === selectedDate ||
            payload.old?.operational_date === selectedDate
          ) {
            loadDayData(selectedDate);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_closures' },
        (payload: any) => {
          if (
            payload.new?.operational_date === selectedDate ||
            payload.old?.operational_date === selectedDate
          ) {
            loadDayData(selectedDate);
            loadAvailableDates();
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

  const hoursByUser = useMemo(() => {
    const map: Record<string, number> = {};
    for (const shift of shifts) {
      map[shift.team_member_id] = Number(shift.hours_worked || 0);
    }
    return map;
  }, [shifts]);

  const myShift = shifts.find(
    (s) =>
      s.team_member_id === currentMember?.id ||
      (!s.team_member_id &&
        s.team_member_name?.toLowerCase() === currentMember?.display_name.toLowerCase())
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
    if (!isValidPastOrTodayDate(effectiveDate, todayStrRef.current)) {
      return { error: 'No podés cargar horas para una fecha futura.' };
    }

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
              ? {
                  ...s,
                  hours_worked: numHours,
                  is_present: numHours > 0 ? true : s.is_present,
                  updated_at: new Date().toISOString(),
                }
              : s
          )
        );
      }

      await loadAvailableDates();
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Error de conexión al guardar horas.' };
    }
  };

  const updateMyHours = async (hours: number, targetDate?: string) => {
    if (!currentMember) return { error: 'Debe identificarse primero.' };
    return updateMemberHours(currentMember.id, hours, targetDate);
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

  const saveDailyNotes = async (notes: string) => {
    if (!isAuthenticated || !currentMember) return { error: 'Debes iniciar sesión.' };
    const normalized = notes.trim() ? notes : null;

    try {
      const { error } = await supabase
        .from('daily_settings')
        .upsert(
          {
            operational_date: selectedDate,
            notes: normalized,
            updated_at: new Date().toISOString(),
            updated_by: currentMember.id,
          },
          { onConflict: 'operational_date' }
        );

      if (error) {
        return { error: error.message || 'No se pudieron guardar las observaciones.' };
      }

      setDailySettingsNotes(notes);
      setCurrentWorkDay((prev) => ({ ...prev, notes: normalized }));
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Error de conexión al guardar observaciones.' };
    }
  };

  const setAttendance = async (
    userId: string,
    isPresent: boolean
  ): Promise<{ error: string | null }> => {
    if (!isAuthenticated || !currentMember) {
      return { error: 'Debes iniciar sesión.' };
    }

    if (!isValidPastOrTodayDate(selectedDate, todayStrRef.current)) {
      return { error: 'No podés registrar asistencia para una fecha futura.' };
    }

    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('daily_attendance')
        .upsert(
          {
            operational_date: selectedDate,
            user_id: userId,
            is_present: isPresent,
            updated_at: nowIso,
            updated_by: currentMember.id,
          },
          { onConflict: 'operational_date,user_id' }
        )
        .select('operational_date, user_id, is_present, updated_at, updated_by')
        .single();

      if (error) {
        return { error: error.message || 'No se pudo actualizar la asistencia.' };
      }

      const savedRow: DailyAttendance = data as DailyAttendance;
      setDailyAttendance((prev) => {
        const idx = prev.findIndex((r) => r.user_id === userId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = savedRow;
          return next;
        }
        return [...prev, savedRow];
      });

      setShifts((prev) =>
        prev.map((s) =>
          s.team_member_id === userId ? { ...s, is_present: isPresent, updated_at: nowIso } : s
        )
      );

      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Error de conexión al actualizar asistencia.' };
    }
  };

  const syncAttendanceFromActivity = async (): Promise<{ error: string | null }> => {
    if (!isAuthenticated || !currentMember) {
      return { error: 'Debes iniciar sesión.' };
    }

    const activeUserIds = new Set<string>();
    shifts.forEach((s) => {
      if (Number(s.hours_worked || 0) > 0) {
        activeUserIds.add(s.team_member_id);
      }
    });
    partners.forEach((p) => {
      if (p.created_by) activeUserIds.add(p.created_by);
      else if (p.team_member_id) activeUserIds.add(p.team_member_id);
    });

    if (activeUserIds.size === 0) {
      return { error: null };
    }

    try {
      const nowIso = new Date().toISOString();
      const rows = Array.from(activeUserIds).map((uid) => ({
        operational_date: selectedDate,
        user_id: uid,
        is_present: true,
        updated_at: nowIso,
        updated_by: currentMember.id,
      }));

      const { error } = await supabase
        .from('daily_attendance')
        .upsert(rows, { onConflict: 'operational_date,user_id' });

      if (error) {
        return { error: error.message || 'No se pudo sincronizar la asistencia.' };
      }

      await loadDayData(selectedDate);
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Error de conexión al sincronizar asistencia.' };
    }
  };

  const addPartner = async (
    data: AddPartnerInput,
    targetDate?: string,
    clientRequestId?: string
  ): Promise<AddPartnerResult> => {
    if (!isAuthenticated || !currentMember) {
      return { error: 'Debe identificarse para registrar un socio.' };
    }

    const effectiveDate = targetDate || data.targetDate || selectedDate;
    if (!isValidPastOrTodayDate(effectiveDate, todayStrRef.current)) {
      return { error: 'No podés registrar ni mover socios a una fecha futura.' };
    }

    const requestId = clientRequestId || data.clientRequestId || generateClientRequestId();
    const { pts, methodId, methodName } = mapPaymentTypeToDb(data.paymentType);

    const queueOnNetworkFailure = () => {
      enqueueOfflinePartner({
        clientRequestId: requestId,
        userId: currentMember.id,
        userName: currentMember.display_name,
        age: data.age,
        amount: data.amount,
        paymentType: data.paymentType,
        targetDate: effectiveDate,
      });
      refreshPendingOffline();
    };

    try {
      const { data: insertedRow, error } = await supabase
        .from('socios')
        .insert({
          operational_date: effectiveDate,
          age: data.age,
          amount: data.amount,
          payment_method_id: methodId,
          payment_method_name: methodName,
          points: pts,
          created_by: currentMember.id,
          created_by_name: currentMember.display_name,
          client_request_id: requestId,
        })
        .select('*')
        .single();

      if (error) {
        if (error.code === '23505') {
          const { data: existingRow } = await supabase
            .from('socios')
            .select('*')
            .eq('client_request_id', requestId)
            .maybeSingle();

          await Promise.all([loadDayData(selectedDate), loadAvailableDates()]);
          return {
            data: existingRow ? mapDbSocioToPartner(existingRow, partners.length + 1) : undefined,
            duplicate: true,
            clientRequestId: requestId,
            error: null,
          };
        }

        if (isNetworkError(error)) {
          queueOnNetworkFailure();
          return {
            queued: true,
            isNetworkError: true,
            clientRequestId: requestId,
            error:
              'Sin conexión. El socio quedó guardado localmente en pendientes de sincronizar.',
          };
        }

        return {
          error: error.message || 'No se pudo confirmar el registro en la base de datos.',
        };
      }

      if (!insertedRow) {
        return { error: 'No se pudo confirmar el registro en la base de datos.' };
      }

      await Promise.all([loadDayData(selectedDate), loadAvailableDates()]);
      return {
        data: mapDbSocioToPartner(insertedRow, partners.length + 1),
        clientRequestId: requestId,
        error: null,
      };
    } catch (err: any) {
      if (isNetworkError(err)) {
        queueOnNetworkFailure();
        return {
          queued: true,
          isNetworkError: true,
          clientRequestId: requestId,
          error:
            'Sin conexión. El socio quedó guardado localmente en pendientes de sincronizar.',
        };
      }
      return { error: err?.message || 'Error de conexión al guardar el socio.' };
    }
  };

  const updatePartner = async (
    partnerId: string,
    data: { age: number; amount: number; paymentType: string }
  ) => {
    const p = partners.find((item) => item.id === partnerId);
    if (!p) return { error: 'Registro no encontrado.' };

    if (!isAdmin && p.created_by !== currentMember?.id && p.team_member_id !== currentMember?.id) {
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

    if (!isAdmin && p.created_by !== currentMember?.id && p.team_member_id !== currentMember?.id) {
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

  const movePartnersToDate = async (
    partnerIds: string[],
    targetDate: string
  ): Promise<MovePartnersResult> => {
    if (!isAuthenticated || !currentMember) {
      return { movedCount: 0, ownersMissingHours: [], error: 'Debes iniciar sesión.' };
    }

    if (!partnerIds || partnerIds.length === 0) {
      return {
        movedCount: 0,
        ownersMissingHours: [],
        error: 'Seleccioná al menos un socio para mover.',
      };
    }

    if (!isValidPastOrTodayDate(targetDate, todayStrRef.current)) {
      return {
        movedCount: 0,
        ownersMissingHours: [],
        error: 'No podés registrar ni mover socios a una fecha futura.',
      };
    }

    try {
      const { data: updatedRows, error } = await supabase
        .from('socios')
        .update({ operational_date: targetDate })
        .in('id', partnerIds)
        .select('id, created_by, created_by_name');

      if (error) {
        return {
          movedCount: 0,
          ownersMissingHours: [],
          error: error.message || 'No se pudieron mover los socios.',
        };
      }

      if (!updatedRows || updatedRows.length === 0) {
        return {
          movedCount: 0,
          ownersMissingHours: [],
          error: 'No tenés permiso para mover esos socios o ya no existen.',
        };
      }

      const ownerMap = new Map<string, string>();
      for (const row of updatedRows as Array<{
        id: string;
        created_by: string | null;
        created_by_name: string | null;
      }>) {
        if (row.created_by && !ownerMap.has(row.created_by)) {
          const memberMatch = teamMembers.find((m) => m.id === row.created_by);
          ownerMap.set(
            row.created_by,
            memberMatch?.display_name || row.created_by_name || 'Captador'
          );
        }
      }

      const ownersMissingHours: { userId: string; name: string }[] = [];
      const ownerIds = Array.from(ownerMap.keys());

      if (ownerIds.length > 0) {
        const { data: targetHours } = await supabase
          .from('captor_daily_hours')
          .select('user_id, hours_worked')
          .eq('operational_date', targetDate)
          .in('user_id', ownerIds);

        const hoursMap = new Map<string, number>();
        for (const row of targetHours || []) {
          hoursMap.set(row.user_id, Number(row.hours_worked || 0));
        }

        for (const [uid, name] of ownerMap.entries()) {
          if ((hoursMap.get(uid) ?? 0) <= 0) {
            ownersMissingHours.push({ userId: uid, name });
          }
        }
      }

      await Promise.all([loadDayData(selectedDate), loadAvailableDates()]);
      return {
        movedCount: updatedRows.length,
        ownersMissingHours,
        error: null,
      };
    } catch (err: any) {
      return {
        movedCount: 0,
        ownersMissingHours: [],
        error: err?.message || 'Error de conexión al mover socios.',
      };
    }
  };

  const stats = useMemo(
    () =>
      calculateLiveDayStats(
        currentWorkDay.declared_collectors_count,
        partners,
        shifts,
        teamMembers,
        selectedDate
      ),
    [currentWorkDay.declared_collectors_count, partners, shifts, teamMembers, selectedDate]
  );

  const isDailyClosureOutdated = useMemo(() => {
    if (!dailyClosure) return false;
    const saved = dailyClosure.summary_data;
    if (!saved) return true;

    const savedPresentIds = Array.from(new Set(dailyClosure.present_user_ids || [])).sort();
    const currentPresentIds = Array.from(
      new Set(shifts.filter((s) => s.is_present).map((s) => s.team_member_id))
    ).sort();
    const attendanceChanged =
      savedPresentIds.length !== currentPresentIds.length ||
      savedPresentIds.some((id, idx) => id !== currentPresentIds[idx]);

    return (
      attendanceChanged ||
      saved.total_partners !== stats.total_partners ||
      Math.abs(Number(saved.total_points || 0) - stats.total_points) > 0.009 ||
      Math.abs(Number(saved.total_amount || 0) - stats.total_amount) > 0.009 ||
      Math.abs(Number(saved.total_hours || 0) - stats.total_hours) > 0.009 ||
      Number(saved.declared_collectors || 0) !== stats.declared_collectors ||
      (dailyClosure.notes ?? '').trim() !== dailySettingsNotes.trim()
    );
  }, [dailyClosure, shifts, stats, dailySettingsNotes]);

  const closeCurrentDay = async (
    presentUserIdsOrAuto?: string[] | boolean,
    notes?: string
  ): Promise<{ data?: DailyClosure; error?: any }> => {
    if (!isAuthenticated || !currentMember) {
      return { error: 'Debes iniciar sesión para cerrar la jornada.' };
    }

    if (!isValidPastOrTodayDate(selectedDate, todayStrRef.current)) {
      return { error: 'No podés cerrar una fecha futura.' };
    }

    const presentUserIds = Array.isArray(presentUserIdsOrAuto)
      ? presentUserIdsOrAuto
      : shifts.filter((s) => s.is_present).map((s) => s.team_member_id);

    const effectiveNotes = notes !== undefined ? notes : dailySettingsNotes;
    const cleanNotes = effectiveNotes.trim() ? effectiveNotes.trim() : null;

    const liveSummary = calculateLiveDayStats(
      currentWorkDay.declared_collectors_count,
      partners,
      shifts,
      teamMembers,
      selectedDate
    );
    const waMessage = generateWhatsAppReport(liveSummary, {
      presentMemberIds: presentUserIds,
      notes: cleanNotes,
    });

    try {
      const { data: savedRow, error } = await supabase
        .from('daily_closures')
        .upsert(
          {
            operational_date: selectedDate,
            summary_data: liveSummary,
            whatsapp_message: waMessage,
            present_user_ids: presentUserIds,
            notes: cleanNotes,
            status: 'CLOSED',
          },
          { onConflict: 'operational_date' }
        )
        .select('*')
        .single();

      if (error || !savedRow) {
        return { error: error?.message || 'No se pudo guardar el cierre de jornada.' };
      }

      if (notes !== undefined && notes !== dailySettingsNotes) {
        await saveDailyNotes(notes);
      }

      const mapped = mapDbDailyClosure(savedRow);
      setDailyClosure(mapped);
      setCurrentWorkDay((prev) => ({
        ...prev,
        status: mapped.status,
        closed_at: mapped.closed_at,
        notes: mapped.notes,
      }));

      await loadAvailableDates();
      return { data: mapped, error: null };
    } catch (err: any) {
      return { error: err?.message || 'Error de conexión al guardar el cierre.' };
    }
  };

  const reopenDay = async (workDayId: string) => {
    if (!isAuthenticated || !currentMember) {
      return { error: 'Debes iniciar sesión.' };
    }

    const targetDate = workDayId.replace(/^(closure-|workday-)/, '') || selectedDate;
    if (!dailyClosure || dailyClosure.operational_date !== targetDate) {
      return { error: null };
    }

    try {
      const { data, error } = await supabase
        .from('daily_closures')
        .update({ status: 'OPEN' })
        .eq('operational_date', targetDate)
        .select('*')
        .maybeSingle();

      if (error) {
        return { error: error.message || 'No se pudo reabrir la jornada.' };
      }

      if (data) {
        setDailyClosure(mapDbDailyClosure(data));
      }
      setCurrentWorkDay((prev) => ({ ...prev, status: 'OPEN', closed_at: null }));
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Error de conexión al reabrir la jornada.' };
    }
  };

  const getStatsByRange = useCallback(
    async (
      startDate: string,
      endDate: string,
      userId?: string | null
    ): Promise<{ data: StatsRangeResponse | null; error: string | null }> => {
      if (!isAuthenticated) {
        return { data: null, error: 'Debes iniciar sesión.' };
      }
      if (!isValidDateString(startDate) || !isValidDateString(endDate) || startDate > endDate) {
        return { data: null, error: 'Rango de fechas inválido.' };
      }

      try {
        const { data, error } = await supabase.rpc('get_stats_by_range', {
          p_start: startDate,
          p_end: endDate,
          p_user_id: userId || null,
        });

        if (error) {
          return { data: null, error: error.message || 'No se pudieron consultar las estadísticas.' };
        }

        if (!data) {
          return { data: null, error: 'Sin respuesta del servidor.' };
        }

        return { data: enrichRangeStats(data as StatsRangeResponse), error: null };
      } catch (err: any) {
        return {
          data: null,
          error: err?.message || 'Error de conexión al consultar estadísticas.',
        };
      }
    },
    [isAuthenticated]
  );

  const retryOfflineQueue = useCallback(async (): Promise<{
    sent: number;
    deduplicated: number;
    failed: number;
  }> => {
    if (!isAuthenticated || !currentMember) {
      return { sent: 0, deduplicated: 0, failed: 0 };
    }

    const summary = await flushOfflineQueue(async (item) => {
      const { pts, methodId, methodName } = mapPaymentTypeToDb(item.paymentType);
      try {
        const { error } = await supabase
          .from('socios')
          .insert({
            operational_date: item.targetDate,
            age: item.age,
            amount: item.amount,
            payment_method_id: methodId,
            payment_method_name: methodName,
            points: pts,
            created_by: item.userId,
            created_by_name: item.userName || currentMember.display_name,
            client_request_id: item.clientRequestId,
          })
          .select('id')
          .single();

        if (!error) {
          return { ok: true };
        }

        if (error.code === '23505') {
          return { ok: true, duplicate: true };
        }

        return {
          ok: false,
          retryable: isNetworkError(error),
          error: error.message || 'Error al sincronizar socio pendiente.',
        };
      } catch (err: any) {
        return {
          ok: false,
          retryable: isNetworkError(err),
          error: err?.message || 'Error de conexión al sincronizar.',
        };
      }
    }, currentMember.id);

    refreshPendingOffline();
    if (summary.sent + summary.deduplicated > 0) {
      await Promise.all([loadDayData(selectedDateRef.current), loadAvailableDates()]);
    }
    return {
      sent: summary.sent,
      deduplicated: summary.deduplicated,
      failed: summary.failed,
    };
  }, [isAuthenticated, currentMember, loadDayData, loadAvailableDates, refreshPendingOffline]);

  useEffect(() => {
    if (!isAuthenticated || !currentMember) return;
    return registerOnlineQueueFlush(() => {
      if (getOfflineQueue(currentMember.id).length > 0) {
        void retryOfflineQueue();
      }
    });
  }, [isAuthenticated, currentMember, retryOfflineQueue]);

  const exitHistoricalView = useCallback(() => {
    setSelectedDate(todayStrRef.current);
  }, [setSelectedDate]);

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
        hoursByUser,
        partners,
        declaredCollectorsCount: activeWorkDay.declared_collectors_count,
        dailySettingsNotes,
        dailyAttendance,
        dailyClosure,
        historicalClosure: dailyClosure,
        isDailyClosureOutdated,
        stats,
        loading,
        hasInitialLoaded,
        isConnected,
        myHours,
        pendingOfflinePartners,
        updateMyHours,
        updateMemberHours,
        updateDeclaredCollectors,
        saveDailyNotes,
        setAttendance,
        syncAttendanceFromActivity,
        addPartner,
        updatePartner,
        deletePartner,
        movePartnersToDate,
        closeCurrentDay,
        reopenDay,
        exitHistoricalView,
        refreshData,
        getStatsByRange,
        retryOfflineQueue,
        weeklyReports,
        saveWeeklyReport,
      }}
    >
      {children}
    </WorkDayContext.Provider>
  );
};

export const useWorkDay = () => useContext(WorkDayContext);
