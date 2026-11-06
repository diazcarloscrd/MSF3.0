import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { WorkDay, ShiftAssignment, Partner, DailyClosure, ClosureSummaryData } from '../types/database';
import { calculateLiveDayStats, generateWhatsAppReport } from '../lib/stats';
import { useAuth } from './AuthContext';

interface WorkDayContextType {
  currentWorkDay: WorkDay | null;
  historicalWorkDay: WorkDay | null;
  activeWorkDay: WorkDay | null;
  isViewingHistory: boolean;
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
  deletePartner: (partnerId: string) => Promise<{ error: any }>;
  closeCurrentDay: (auto?: boolean) => Promise<{ data?: DailyClosure; error?: any }>;
  reopenDay: (workDayId: string) => Promise<{ error: any }>;
  viewHistoricalDay: (workDay: WorkDay) => Promise<void>;
  exitHistoricalView: () => void;
  refreshData: () => Promise<void>;
}

const WorkDayContext = createContext<WorkDayContextType>({} as WorkDayContextType);

const getTodayDateString = () => {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
};

export const WorkDayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentMember, teamMembers, isAdmin } = useAuth();
  
  const todayStr = getTodayDateString();

  const [currentWorkDay, setCurrentWorkDay] = useState<WorkDay>({
    id: 'local-today-day',
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

  const [historicalWorkDay, setHistoricalWorkDay] = useState<WorkDay | null>(null);
  const [shifts, setShifts] = useState<ShiftAssignment[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [historicalClosure, setHistoricalClosure] = useState<DailyClosure | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(isSupabaseConfigured);

  const isViewingHistory = !!historicalWorkDay;
  const activeWorkDay = historicalWorkDay || currentWorkDay;

  // Initialize from Supabase if configured
  const fetchOrCreateCurrentDay = useCallback(async () => {
    if (!isSupabaseConfigured) return;

    try {
      const today = getTodayDateString();

      const { data: existingDay } = await supabase
        .from('work_days')
        .select('*')
        .eq('work_date', today)
        .maybeSingle();

      if (existingDay) {
        setCurrentWorkDay(existingDay);
        return existingDay;
      } else {
        const { data: newDay } = await supabase
          .from('work_days')
          .insert({
            work_date: today,
            status: 'OPEN',
            declared_collectors_count: 0,
            opened_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (newDay) {
          setCurrentWorkDay(newDay);
          return newDay;
        }
      }
    } catch (e) {
      console.warn('Using resilient day state:', e);
    }
    return null;
  }, []);

  const loadDayData = useCallback(async (dayId: string) => {
    if (!isSupabaseConfigured) return;

    try {
      const [{ data: shiftsData }, { data: partnersData }] = await Promise.all([
        supabase
          .from('shift_assignments')
          .select('*, team_member:team_members(*)')
          .eq('work_day_id', dayId),
        supabase
          .from('partners')
          .select('*, team_member:team_members(*)')
          .eq('work_day_id', dayId)
          .order('sequence_number', { ascending: false }),
      ]);

      if (shiftsData) setShifts(shiftsData);
      if (partnersData) setPartners(partnersData);
    } catch (e) {
      console.warn('Error loading day data, keeping existing state', e);
    }
  }, []);

  const refreshData = useCallback(async () => {
    if (activeWorkDay?.id) {
      await loadDayData(activeWorkDay.id);
    }
  }, [activeWorkDay?.id, loadDayData]);

  useEffect(() => {
    if (isSupabaseConfigured) {
      fetchOrCreateCurrentDay().then((day) => {
        if (day) loadDayData(day.id);
      });
    }
  }, [fetchOrCreateCurrentDay, loadDayData]);

  // Realtime subscriptions
  useEffect(() => {
    if (!isSupabaseConfigured || !activeWorkDay?.id) return;

    const channel = supabase
      .channel(`work_day_${activeWorkDay.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'partners', filter: `work_day_id=eq.${activeWorkDay.id}` },
        () => loadDayData(activeWorkDay.id)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shift_assignments', filter: `work_day_id=eq.${activeWorkDay.id}` },
        () => loadDayData(activeWorkDay.id)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'work_days', filter: `id=eq.${activeWorkDay.id}` },
        (payload) => {
          if (!isViewingHistory) {
            setCurrentWorkDay(payload.new as WorkDay);
          } else {
            setHistoricalWorkDay(payload.new as WorkDay);
          }
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeWorkDay?.id, isViewingHistory, loadDayData]);

  // Current member's hours
  const myShift = shifts.find((s) => s.team_member_id === currentMember?.id);
  const myHours = myShift ? Number(myShift.hours_worked) : 0;

  // Actions
  const updateMemberHours = async (memberId: string, hours: number) => {
    if (!activeWorkDay) return { error: 'No active work day' };
    const numHours = Number(hours);
    if (isNaN(numHours) || numHours < 0 || numHours > 24) {
      return { error: 'Horas inválidas (debe ser entre 0 y 24)' };
    }

    try {
      if (isSupabaseConfigured) {
        const existing = shifts.find((s) => s.team_member_id === memberId);
        if (existing) {
          await supabase
            .from('shift_assignments')
            .update({ hours_worked: numHours, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        } else {
          await supabase.from('shift_assignments').insert({
            work_day_id: activeWorkDay.id,
            team_member_id: memberId,
            hours_worked: numHours,
            is_present: true,
          });
        }
      }

      // Local state update
      setShifts((prev) => {
        const found = prev.find((s) => s.team_member_id === memberId);
        const mem = teamMembers.find((m) => m.id === memberId);
        if (found) {
          return prev.map((s) => (s.team_member_id === memberId ? { ...s, hours_worked: numHours } : s));
        }
        return [
          ...prev,
          {
            id: `shift-${Date.now()}-${memberId}`,
            work_day_id: activeWorkDay.id,
            team_member_id: memberId,
            hours_worked: numHours,
            is_present: true,
            declared_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            team_member: mem,
          },
        ];
      });

      return { error: null };
    } catch (err: any) {
      return { error: err.message || err };
    }
  };

  const updateMyHours = async (hours: number) => {
    if (!currentMember) return { error: 'Debe identificarse primero' };
    return updateMemberHours(currentMember.id, hours);
  };

  const updateDeclaredCollectors = async (count: number) => {
    if (!activeWorkDay) return { error: 'No active work day' };
    if (!isAdmin) return { error: 'Solo el administrador puede modificar este valor' };

    try {
      if (isSupabaseConfigured) {
        await supabase
          .from('work_days')
          .update({ declared_collectors_count: count })
          .eq('id', activeWorkDay.id);
      }

      if (!isViewingHistory) {
        setCurrentWorkDay((prev) => ({ ...prev, declared_collectors_count: count }));
      } else {
        setHistoricalWorkDay((prev) => (prev ? { ...prev, declared_collectors_count: count } : null));
      }
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
    if (!activeWorkDay) return { error: 'No active work day' };
    if (activeWorkDay.status === 'CLOSED' && !isAdmin) {
      return { error: 'La jornada está cerrada' };
    }
    if (!currentMember) return { error: 'Debe identificarse para registrar un socio' };

    let pts = 0;
    switch (paymentType) {
      case 'credit_card':
        pts = 1.0;
        break;
      case 'debit_card':
        pts = 0.7;
        break;
      case 'bank_cbu':
        pts = 0.6;
        break;
      case 'prepaid_wallet':
        pts = 0.4;
        break;
    }

    const nextSeq = partners.length > 0 ? Math.max(...partners.map((p) => p.sequence_number)) + 1 : 1;

    const newPartner: Partner = {
      id: `partner-${Date.now()}`,
      work_day_id: activeWorkDay.id,
      team_member_id: currentMember.id,
      created_by: null,
      sequence_number: nextSeq,
      payment_type: paymentType as any,
      points: pts,
      age,
      contribution_amount: amount,
      contribution_frequency: 'monthly',
      captured_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      team_member: currentMember,
    };

    try {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('partners')
          .insert({
            work_day_id: activeWorkDay.id,
            team_member_id: currentMember.id,
            age,
            contribution_amount: amount,
            payment_type: paymentType as any,
            points: pts,
            sequence_number: nextSeq,
          })
          .select('*, team_member:team_members(*)')
          .single();

        if (error) throw error;
        if (data) {
          setPartners((prev) => [data as Partner, ...prev]);
          return { data: data as Partner };
        }
      }

      setPartners((prev) => [newPartner, ...prev]);
      return { data: newPartner };
    } catch (err: any) {
      return { error: err.message || err };
    }
  };

  const deletePartner = async (partnerId: string) => {
    const p = partners.find((item) => item.id === partnerId);
    if (!p) return { error: 'Registro no encontrado' };

    if (!isAdmin && p.team_member_id !== currentMember?.id) {
      return { error: 'No tienes permiso para eliminar socios de otros captadores' };
    }

    try {
      if (isSupabaseConfigured) {
        await supabase.from('partners').delete().eq('id', partnerId);
      }
      setPartners((prev) => prev.filter((item) => item.id !== partnerId));
      return { error: null };
    } catch (err: any) {
      return { error: err.message || err };
    }
  };

  const closeCurrentDay = async (auto = false) => {
    if (!currentWorkDay) return { error: 'No hay jornada activa' };

    try {
      const liveStats = calculateLiveDayStats(
        currentWorkDay.declared_collectors_count,
        partners,
        shifts,
        teamMembers,
        currentWorkDay.work_date
      );

      const waMsg = generateWhatsAppReport(liveStats);

      const closureData: DailyClosure = {
        id: `closure-${Date.now()}`,
        work_day_id: currentWorkDay.id,
        work_date: currentWorkDay.work_date,
        summary_data: liveStats,
        whatsapp_message: waMsg,
        closed_by: null,
        closed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      if (isSupabaseConfigured) {
        await supabase.from('daily_closures').upsert({
          work_day_id: currentWorkDay.id,
          work_date: currentWorkDay.work_date,
          summary_data: liveStats,
          whatsapp_message: waMsg,
          closed_at: new Date().toISOString(),
        });

        await supabase
          .from('work_days')
          .update({ status: 'CLOSED', closed_at: new Date().toISOString(), auto_closed: auto })
          .eq('id', currentWorkDay.id);
      }

      setCurrentWorkDay((prev) => ({ ...prev, status: 'CLOSED' }));
      return { data: closureData };
    } catch (err: any) {
      return { error: err.message || err };
    }
  };

  const reopenDay = async (workDayId: string) => {
    if (!isAdmin) return { error: 'Solo Carlos (ADMIN) puede reabrir jornadas' };

    try {
      if (isSupabaseConfigured) {
        await supabase
          .from('work_days')
          .update({ status: 'OPEN', closed_at: null })
          .eq('id', workDayId);
      }

      if (historicalWorkDay && historicalWorkDay.id === workDayId) {
        setHistoricalWorkDay((prev) => (prev ? { ...prev, status: 'OPEN' } : null));
      }
      if (currentWorkDay && currentWorkDay.id === workDayId) {
        setCurrentWorkDay((prev) => ({ ...prev, status: 'OPEN' }));
      }

      return { error: null };
    } catch (err: any) {
      return { error: err.message || err };
    }
  };

  const viewHistoricalDay = async (workDay: WorkDay) => {
    setLoading(true);
    setHistoricalWorkDay(workDay);

    if (isSupabaseConfigured) {
      const { data: closure } = await supabase
        .from('daily_closures')
        .select('*')
        .eq('work_day_id', workDay.id)
        .maybeSingle();

      setHistoricalClosure(closure as DailyClosure);
      await loadDayData(workDay.id);
    }
    setLoading(false);
  };

  const exitHistoricalView = () => {
    setHistoricalWorkDay(null);
    setHistoricalClosure(null);
  };

  const stats = activeWorkDay
    ? calculateLiveDayStats(
        activeWorkDay.declared_collectors_count,
        partners,
        shifts,
        teamMembers,
        activeWorkDay.work_date
      )
    : null;

  return (
    <WorkDayContext.Provider
      value={{
        currentWorkDay,
        historicalWorkDay,
        activeWorkDay,
        isViewingHistory,
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
        deletePartner,
        closeCurrentDay,
        reopenDay,
        viewHistoricalDay,
        exitHistoricalView,
        refreshData,
      }}
    >
      {children}
    </WorkDayContext.Provider>
  );
};

export const useWorkDay = () => useContext(WorkDayContext);
