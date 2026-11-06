export type UserRole = 'ADMIN' | 'COLLECTOR';
export type WorkDayStatus = 'OPEN' | 'CLOSED';
export type PaymentMethodType = 'credit_card' | 'debit_card' | 'bank_cbu' | 'prepaid_wallet';

export interface PaymentMethodRule {
  payment_type: PaymentMethodType;
  label: string;
  points: number;
  is_active: boolean;
}

export interface Profile {
  id: string;
  auth_user_id: string | null;
  email: string | null;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  display_name: string;
  profile_id: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
  work_day_id: string;
  team_member_id: string;
  hours_worked: number;
  is_present: boolean;
  declared_at: string;
  created_at: string;
  updated_at: string;
  team_member?: TeamMember;
}

export interface Partner {
  id: string;
  work_day_id: string;
  team_member_id: string;
  created_by: string | null;
  sequence_number: number;
  payment_type: PaymentMethodType;
  points: number;
  age: number;
  contribution_amount: number;
  contribution_frequency: string;
  captured_at: string;
  additional_fields?: Record<string, any>;
  created_at: string;
  updated_at: string;
  team_member?: TeamMember;
}

export interface DailyClosure {
  id: string;
  work_day_id: string;
  work_date: string;
  summary_data: ClosureSummaryData;
  whatsapp_message: string;
  closed_by: string | null;
  closed_at: string;
  created_at: string;
}

export interface MemberPerformance {
  name: string;
  hours: number;
  partners_count: number;
  points: number;
  amount: number;
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

