export type UserRole = 'ADMIN' | 'COLLECTOR';
export type WorkDayStatus = 'OPEN' | 'CLOSED';
export type PaymentMethodType = 'credit_card' | 'debit_card' | 'bank_cbu' | 'prepaid_wallet';
export type DbPaymentMethodId = 'credito' | 'debito' | 'cbu' | 'prepaga';

export interface PaymentMethodRule {
  payment_type: PaymentMethodType;
  label: string;
  points: number;
  is_active: boolean;
}

export interface DbProfileRow {
  user_id: string;
  username: string;
  full_name: string;
  role: 'admin' | 'captador';
  is_active: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  user_id?: string;
  username?: string;
  auth_user_id: string | null;
  email: string | null;
  full_name: string;
  role: UserRole;
  db_role?: 'admin' | 'captador';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  display_name: string;
  username: string;
  default_pass?: string;
  user_id?: string;
  profile_id: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DailySettings {
  operational_date: string; // YYYY-MM-DD
  hours_worked: number | null;
  captor_count: number | null;
  notes?: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface WorkDay {
  id: string;
  work_date: string; // YYYY-MM-DD
  status: WorkDayStatus;
  declared_collectors_count: number;
  opened_at: string;
  closed_at: string | null;
  auto_closed: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShiftAssignment {
  id: string;
  work_day_id?: string;
  operational_date: string; // YYYY-MM-DD
  team_member_id: string;
  team_member_name?: string;
  hours_worked: number;
  is_present: boolean;
  declared_at: string;
  created_at: string;
  updated_at: string;
  team_member?: TeamMember;
}

export interface Partner {
  id: string;
  work_day_id?: string;
  operational_date: string; // YYYY-MM-DD
  team_member_id: string;
  created_by: string | null;
  created_by_name: string;
  sequence_number: number;
  payment_type: PaymentMethodType;
  payment_method_id?: string;
  payment_method_name?: string;
  points: number;
  age: number;
  contribution_amount: number;
  amount?: number;
  contribution_frequency: string;
  captured_at: string;
  additional_fields?: Record<string, any>;
  client_request_id?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
  team_member?: TeamMember;
}

export type Socio = Partner;

export interface DailyAttendance {
  operational_date: string; // YYYY-MM-DD
  user_id: string;
  is_present: boolean;
  updated_at: string;
  updated_by: string | null;
}

export type DailyAttendanceRecord = DailyAttendance;

export interface DailyClosure {
  id?: string;
  work_day_id?: string;
  operational_date: string; // YYYY-MM-DD (PK in DB)
  work_date: string; // Alias for operational_date for UI compatibility
  summary_data: ClosureSummaryData;
  whatsapp_message: string;
  present_user_ids: string[];
  notes: string | null;
  status: WorkDayStatus;
  closed_by: string | null;
  closed_at: string;
  created_at?: string;
}

export interface MemberPerformance {
  member_id?: string;
  name: string;
  hours: number;
  partners_count: number;
  points: number;
  amount: number;
  average_age: number | null;
  credit_card_count: number;
  debit_card_count: number;
  bank_cbu_count: number;
  prepaid_wallet_count: number;
  partners_per_hour: number | null;
  points_per_hour: number | null;
  amount_per_hour: number | null;
}

export interface ClosureSummaryData {
  work_date: string;
  declared_collectors: number;
  total_hours: number;
  total_partners: number;
  total_points: number;
  total_amount: number;
  average_age: number | null;
  breakdown: {
    credit_card: { count: number; points: number };
    debit_card: { count: number; points: number };
    bank_cbu: { count: number; points: number };
    prepaid_wallet: { count: number; points: number };
  };
  averages: {
    partners_per_collector: number | null;
    points_per_collector: number | null;
    amount_per_collector: number | null;
    hours_per_collector: number | null;
    partners_per_hour: number | null;
    points_per_hour: number | null;
    amount_per_hour: number | null;
    amount_per_partner: number | null;
    points_per_partner: number | null;
  };
  team_performance: MemberPerformance[];
}

export interface WeeklyMemberReport {
  id: string;
  week_number: number;
  year: number;
  member_id: string;
  member_name: string;
  points_earned: number; // Puntos brutos generados
  invalid_and_cancellations: number; // Invalidas y bajas
  final_points: number; // Puntos finales = Puntos - Bajas
  hours: number; // Horas trabajadas
  points_per_hour: number | null; // P/H = Puntos finales / Horas
  total_amount: number; // Total dinero recaudado
  final_partners: number; // Socios finales
  average_amount: number | null; // Promedio = Dinero total / Socios finales
  notes?: string;
  updated_at: string;
}

export type AuditAction = 'INSERT' | 'UPDATE' | 'MOVE_DATE' | 'DELETE' | 'USER_ADMIN';

export interface AuditLogEntry {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_name: string;
  entity_type: string;
  entity_id: string;
  action: AuditAction | string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  summary: string;
}

export interface RangeStatsSummary {
  total_socios: number;
  total_points: number;
  total_amount: number;
  total_hours: number;
  average_age: number | null;
  credito_count: number;
  credito_points: number;
  debito_count: number;
  debito_points: number;
  cbu_count: number;
  cbu_points: number;
  prepaga_count: number;
  prepaga_points: number;
  socios_per_hour: number | null;
  points_per_hour: number | null;
  average_amount: number | null;
  amount_per_hour?: number | null;
}

export interface RangeStatsByMember {
  user_id: string;
  full_name: string;
  socios_count: number;
  points: number;
  amount: number;
  hours: number;
  average_age: number | null;
  credito_count: number;
  debito_count: number;
  cbu_count: number;
  prepaga_count: number;
  socios_per_hour: number | null;
  points_per_hour: number | null;
  average_amount: number | null;
  amount_per_hour?: number | null;
}

export interface RangeStatsByDate {
  operational_date: string;
  socios_count: number;
  points: number;
  amount: number;
  hours: number;
}

export interface RangeStatsHourRow {
  operational_date: string;
  user_id: string;
  hours_worked: number;
  updated_at: string;
}

export interface RangeStatsSocioRow {
  id: string;
  operational_date: string;
  age: number;
  amount: number;
  payment_method_id: DbPaymentMethodId | string;
  payment_method_name: string;
  points: number;
  created_at: string;
  created_by: string | null;
  created_by_name: string;
  updated_at: string;
  updated_by: string | null;
}

export interface StatsRangeResponse {
  start_date: string;
  end_date: string;
  user_id: string | null;
  summary: RangeStatsSummary;
  by_member: RangeStatsByMember[];
  by_date: RangeStatsByDate[];
  hours: RangeStatsHourRow[];
  socios: RangeStatsSocioRow[];
}

export type RangeStatsResult = StatsRangeResponse;

export type AdminTeamManagerRequest =
  | {
      action: 'create_member';
      full_name: string;
      username: string;
      password: string;
      role?: 'admin' | 'captador' | UserRole;
      email?: string;
      is_active?: boolean;
    }
  | {
      action: 'update_member';
      user_id: string;
      full_name?: string;
      role?: 'admin' | 'captador' | UserRole;
      is_active?: boolean;
    }
  | {
      action: 'reset_password';
      user_id: string;
      password: string;
      new_password?: string;
    };

export type AdminTeamManagerResponse =
  | { ok: true; action: 'create_member'; member: DbProfileRow }
  | { ok: true; action: 'update_member'; member: DbProfileRow }
  | { ok: true; action: 'reset_password'; user_id: string }
  | { ok?: false; error: string };

export type HybridWeeklyStatus = 'live' | 'confirmed' | 'outdated';

export interface HybridWeeklyRow {
  member_id: string;
  member_name: string;
  status: HybridWeeklyStatus;
  points_earned: number;
  invalid_and_cancellations: number;
  final_points: number;
  hours: number;
  points_per_hour: number | null;
  total_amount: number;
  final_partners: number;
  average_amount: number | null;
  live_points_earned: number;
  live_hours: number;
  live_total_amount: number;
  live_partners: number;
  saved_report?: WeeklyMemberReport;
}

export interface HybridWeeklySummary {
  year: number;
  week_number: number;
  rows: HybridWeeklyRow[];
  totals: {
    points_earned: number;
    invalid_and_cancellations: number;
    final_points: number;
    hours: number;
    points_per_hour: number | null;
    total_amount: number;
    final_partners: number;
    average_amount: number | null;
  };
}

export interface MovePartnersResult {
  movedCount: number;
  ownersMissingHours: { userId: string; name: string }[];
  error: string | null;
}

export const PAYMENT_METHOD_CONFIG: Record<PaymentMethodType, { label: string; points: number; badgeColor: string; description: string }> = {
  credit_card: {
    label: 'TARJETA DE CRÉDITO',
    points: 1.0,
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    description: '1,0 punto'
  },
  debit_card: {
    label: 'TARJETA DE DÉBITO',
    points: 0.7,
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
    description: '0,7 puntos'
  },
  bank_cbu: {
    label: 'CBU / CVU BANCARIO',
    points: 0.6,
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
    description: '0,6 puntos'
  },
  prepaid_wallet: {
    label: 'TARJETA PREPAGA / BILLETERA',
    points: 0.4,
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
    description: '0,4 puntos'
  }
};
