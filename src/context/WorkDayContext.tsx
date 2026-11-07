import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
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

interface WorkDayContextType {
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
  updateMemberHours: (memberId: string, hours: number) => Promise<{ error: any }>;
  updateDeclaredCollectors: (count: number) => Promise<{ error: any }>;
  addPartner: (data: { age: number; amount: number; paymentType: string }) => Promise<{ data?: Partner; error?: any }>;
  updatePartner: (partnerId: string, data: { age: number; amount: number; paymentType: string }) => Promise<{ error: any }>;
  deletePartner: (partnerId: string) => Promise<{ error: any }>;
  closeCurrentDay: (auto?: boolean) => Promise<{ data?: DailyClosure; error?: any }>;
  reopenDay: (workDayId: string) => Promise<{ error: any }>;
  exitHistoricalView: () => void;
  refreshData: () => Promise<void>;
  weeklyReports: WeeklyMemberReport[];
  saveWeeklyReport: (report: WeeklyMemberReport) => void;
}

const WorkDayContext = createContext<WorkDayContextType>({} as WorkDayContextType);

const getTodayBuenosAiresDate = () => {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
};

const WEEKLY_STORAGE_KEY = 'msf_weekly_reports_v1';

export const WorkDayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentMember, teamMembers, isAdmin } = useAuth();

  const todayStr = getTodayBuenosAiresDate();
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [availableDates, setAvailableDates] = useState<string[]>([todayStr]);

  const [currentWorkDay, setCurrentWorkDay] = useState<WorkDay>({
    id: 'workday-' + todayStr,
    work_date: todayStr,
    status: 'OPEN',
    declared_collectors_count: 7,
    opened_at: new Date().toISOString(),
    closed_at: null,
    auto_closed: false,
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const [shifts, setShifts] = useState<ShiftAssignment[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [historicalClosure, setHistoricalClosure] = useState<DailyClosure | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [weeklyReports, setWeeklyReports] = useState<WeeklyMemberReport[]>([]);

  const isViewingHistory = selectedDate !== todayStr;
  const activeWorkDay = currentWorkDay;

  // Cargar reportes semanales desde storage
  useEffect(() => {
    try {
      const savedWeekly = localStorage.getItem(WEEKLY_STORAGE_KEY);
      if (savedWeekly) {
        setWeeklyReports(JSON.parse(savedWeekly));
      }
    } catch (e) {
      console.warn('Error reading storage', e);
    }
  }, []);

  const saveWeeklyReport = (report: WeeklyMemberReport) => {
    setWeeklyReports((prev) => {
      const idx = prev.findIndex(
        (r) => r.week_number === report.week_number && r.year === report.year && r.member_id === report.member_id
      );
      let updated: WeeklyMemberReport[];
      if (idx >= 0) {
        updated = [...prev];
        updated[idx] = report;
      } else {
        updated = [...prev, report];
      }
      try {
        localStorage.setItem(WEEKLY_STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.warn('Error saving weekly report', e);
      }
      return updated;
    });
  };

  // Cargar fechas disponibles de socios
  const loadAvailableDates = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('socios')
        .select('operational_date')
        .order('operational_date', { ascending: false });

      if (data && data.length > 0) {
        const unique = Array.from(new Set([todayStr, ...data.map((d: any) => d.operational_date)]));
        setAvailableDates(unique);
      }
    } catch (err) {
      console.warn('Could not load dates from socios', err);
    }
  }, [todayStr]);

  // Cargar socios y configuración de la fecha seleccionada
  const loadDayData = useCallback(async (dateToLoad: string) => {
    setLoading(true);
    try {
      // 1. Fetch socios
      const { data: sociosData } = await supabase
        .from('socios')
        .select('*')
        .eq('operational_date', dateToLoad)
        .order('created_at', { ascending: false });

      if (sociosData) {
        const mappedPartners: Partner[] = sociosData.map((s: any, idx: number) => {
          let pType = 'credit_card';
          if (s.payment_method_id === 'debito') pType = 'debit_card';
          if (s.payment_method_id === 'cbu') pType = 'bank_cbu';
          if (s.payment_method_id === 'prepaga') pType = 'prepaid_wallet';

          return {
            id: s.id,
            operational_date: s.operational_date,
            team_member_id: s.created_by,
            created_by: s.created_by,
            created_by_name: s.created_by_name || 'Captador',
            sequence_number: sociosData.length - idx,
            payment_type: pType as any,
            points: Number(s.points || 0),
            age: Number(s.age || 0),
            contribution_amount: Number(s.amount || 0),
            amount: Number(s.amount || 0),
            contribution_frequency: 'monthly',
            captured_at: s.created_at,
            created_at: s.created_at,
            updated_at: s.updated_at,
          };
        });
        setPartners(mappedPartners);
      }

      // 2. Fetch daily_settings for captor_count
      const { data: settingsData } = await supabase
        .from('daily_settings')
        .select('*')
        .eq('operational_date', dateToLoad)
        .maybeSingle();

      const declaredCount = settingsData?.captor_count ?? 7;

      setCurrentWorkDay((prev) => ({
        ...prev,
        work_date: dateToLoad,
        declared_collectors_count: declaredCount,
      }));

      // 3. Load shifts for this date
      const savedShiftsKey = `msf_shifts_${dateToLoad}`;
      const savedLocalShifts = localStorage.getItem(savedShiftsKey);
      if (savedLocalShifts) {
        setShifts(JSON.parse(savedLocalShifts));
      } else {
        const initialShifts: ShiftAssignment[] = teamMembers.map((m) => ({
          id: `shift-${dateToLoad}-${m.id}`,
          operational_date: dateToLoad,
          team_member_id: m.id,
          team_member_name: m.display_name,
          hours_worked: 0,
          is_present: true,
          declared_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          team_member: m,
        }));
        setShifts(initialShifts);
      }
    } catch (e) {
      console.warn('Error loading day data', e);
    } finally {
      setLoading(false);
    }
  }, [teamMembers]);

  useEffect(() => {
    loadAvailableDates();
  }, [loadAvailableDates]);

  useEffect(() => {
    loadDayData(selectedDate);
  }, [selectedDate, loadDayData]);

  // Realtime subscription on socios table
  useEffect(() => {
    const channel = supabase
      .channel('realtime-socios')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'socios' },
        (payload: any) => {
          if (payload.new?.operational_date === selectedDate || payload.old?.operational_date === selectedDate) {
            loadDayData(selectedDate);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_settings' },
        () => loadDayData(selectedDate)
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate, loadDayData]);

  const refreshData = async () => {
    await loadDayData(selectedDate);
  };

  const myShift = shifts.find(
    (s) =>
      s.team_member_id === currentMember?.id ||
      s.team_member_name?.toLowerCase() === currentMember?.display_name.toLowerCase()
  );
  const myHours = myShift ? Number(myShift.hours_worked) : 0;

  const updateMemberHours = async (memberId: string, hours: number) => {
    const numHours = Number(hours);
    if (isNaN(numHours) || numHours < 0 || numHours > 24) {
      return { error: 'Horas inválidas (debe ser entre 0 y 24)' };
    }

    const targetMemberObj = teamMembers.find((m) => m.id === memberId);
    const updated = shifts.map((s) => {
      if (
        s.team_member_id === memberId ||
        (targetMemberObj && s.team_member_name?.toLowerCase() === targetMemberObj.display_name.toLowerCase())
      ) {
        return { ...s, hours_worked: numHours, updated_at: new Date().toISOString() };
      }
      return s;
    });

    setShifts(updated);
    localStorage.setItem(`msf_shifts_${selectedDate}`, JSON.stringify(updated));
    return { error: null };
  };

  const updateMyHours = async (hours: number) => {
    if (!currentMember) return { error: 'Debe identificarse primero' };
    return updateMemberHours(currentMember.id, hours);
  };

  // Cantidad de captadores: Ahora modificable por cualquiera del equipo
  const updateDeclaredCollectors = async (count: number) => {
    const numCount = parseInt(String(count), 10);
    if (isNaN(numCount) || numCount < 0) return { error: 'Número inválido' };

    try {
      await supabase.from('daily_settings').upsert({
        operational_date: selectedDate,
        captor_count: numCount,
        updated_at: new Date().toISOString(),
        updated_by: currentMember?.id || null,
      });

      setCurrentWorkDay((prev) => ({ ...prev, declared_collectors_count: numCount }));
      return { error: null };
    } catch (err: any) {
      return { error: err.message || err };
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
    if (!currentMember) return { error: 'Debe identificarse para registrar un socio' };

    let pts = 0;
    let methodId = 'credito';
    let methodName = 'Tarjeta de crédito';

    switch (paymentType) {
      case 'credit_card':
        pts = 1.0;
        methodId = 'credito';
        methodName = 'Tarjeta de crédito';
        break;
      case 'debit_card':
        pts = 0.7;
        methodId = 'debito';
        methodName = 'Tarjeta de débito';
        break;
      case 'bank_cbu':
        pts = 0.6;
        methodId = 'cbu';
        methodName = 'CBU bancario';
        break;
      case 'prepaid_wallet':
        pts = 0.4;
        methodId = 'prepaga';
        methodName = 'Tarjeta prepaga / Billetera virtual';
        break;
    }

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
        .select()
        .single();

      if (error) {
        console.warn('Error inserting partner to Supabase, saving locally:', error);
      }

      await loadDayData(selectedDate);
      return { data: data as any };
    } catch (err: any) {
      return { error: err.message || err };
    }
  };

  // Modificar socio (Captador puede modificar sus propios socios; Admin puede modificar cualquiera)
  const updatePartner = async (
    partnerId: string,
    data: { age: number; amount: number; paymentType: string }
  ) => {
    const p = partners.find((item) => item.id === partnerId);
    if (!p) return { error: 'Registro no encontrado' };

    if (!isAdmin && p.team_member_id !== currentMember?.id && p.created_by_name !== currentMember?.display_name) {
      return { error: 'No tienes permiso para modificar socios de otros captadores' };
    }

    let pts = 0;
    let methodId = 'credito';
    let methodName = 'Tarjeta de crédito';

    switch (data.paymentType) {
      case 'credit_card':
        pts = 1.0;
        methodId = 'credito';
        methodName = 'Tarjeta de crédito';
        break;
      case 'debit_card':
        pts = 0.7;
        methodId = 'debito';
        methodName = 'Tarjeta de débito';
        break;
      case 'bank_cbu':
        pts = 0.6;
        methodId = 'cbu';
        methodName = 'CBU bancario';
        break;
      case 'prepaid_wallet':
        pts = 0.4;
        methodId = 'prepaga';
        methodName = 'Tarjeta prepaga / Billetera virtual';
        break;
    }

    try {
      const { error } = await supabase
        .from('socios')
        .update({
          age: data.age,
          amount: data.amount,
          payment_method_id: methodId,
          payment_method_name: methodName,
          points: pts,
          updated_at: new Date().toISOString(),
          updated_by: currentMember?.id || null,
        })
        .eq('id', partnerId);

      if (error) throw error;
      await loadDayData(selectedDate);
      return { error: null };
    } catch (err: any) {
      return { error: err.message || err };
    }
  };

  // Eliminar socio (Captador sus propios socios; Admin todos)
  const deletePartner = async (partnerId: string) => {
    const p = partners.find((item) => item.id === partnerId);
    if (!p) return { error: 'Registro no encontrado' };

    if (!isAdmin && p.team_member_id !== currentMember?.id && p.created_by_name !== currentMember?.display_name) {
      return { error: 'No tienes permiso para eliminar socios de otros captadores' };
    }

    try {
      await supabase.from('socios').delete().eq('id', partnerId);
      await loadDayData(selectedDate);
      return { error: null };
    } catch (err: any) {
      return { error: err.message || err };
    }
  };

  const closeCurrentDay = async (_auto = false) => {
    return { data: undefined };
  };

  const reopenDay = async (_workDayId: string) => {
    return { error: null };
  };

  const exitHistoricalView = () => {
    setSelectedDate(todayStr);
  };

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
        currentWorkDay,
        historicalWorkDay: isViewingHistory ? currentWorkDay : null,
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
