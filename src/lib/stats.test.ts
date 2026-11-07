import { describe, it, expect } from 'vitest';
import { calculateLiveDayStats, generateWhatsAppReport } from './stats';
import { Partner, ShiftAssignment, TeamMember } from '../types/database';

describe('MSF 3.0 Stats Calculation Engine', () => {
  const mockTeamMembers: TeamMember[] = [
    { id: '1', display_name: 'Ariel', username: 'ariel', profile_id: null, role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
    { id: '2', display_name: 'Lucía', username: 'lucia', profile_id: null, role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
    { id: '3', display_name: 'Rosario', username: 'rosario', profile_id: null, role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
  ];

  it('calculates points correctly according to official weights: CC=1.0, DB=0.7, CBU=0.6, PRE=0.4', () => {
    const partners: Partner[] = [
      { id: 'p1', operational_date: '2026-11-06', team_member_id: '1', created_by_name: 'Ariel', sequence_number: 1, payment_type: 'credit_card', points: 1.0, age: 25, contribution_amount: 10000, contribution_frequency: 'monthly', captured_at: '', created_at: '', updated_at: '', created_by: null },
      { id: 'p2', operational_date: '2026-11-06', team_member_id: '1', created_by_name: 'Ariel', sequence_number: 2, payment_type: 'credit_card', points: 1.0, age: 30, contribution_amount: 10000, contribution_frequency: 'monthly', captured_at: '', created_at: '', updated_at: '', created_by: null },
      { id: 'p3', operational_date: '2026-11-06', team_member_id: '1', created_by_name: 'Ariel', sequence_number: 3, payment_type: 'debit_card', points: 0.7, age: 28, contribution_amount: 10000, contribution_frequency: 'monthly', captured_at: '', created_at: '', updated_at: '', created_by: null },
      { id: 'p4', operational_date: '2026-11-06', team_member_id: '1', created_by_name: 'Ariel', sequence_number: 4, payment_type: 'debit_card', points: 0.7, age: 40, contribution_amount: 10000, contribution_frequency: 'monthly', captured_at: '', created_at: '', updated_at: '', created_by: null },
      { id: 'p5', operational_date: '2026-11-06', team_member_id: '1', created_by_name: 'Ariel', sequence_number: 5, payment_type: 'debit_card', points: 0.7, age: 35, contribution_amount: 10000, contribution_frequency: 'monthly', captured_at: '', created_at: '', updated_at: '', created_by: null },
      { id: 'p6', operational_date: '2026-11-06', team_member_id: '1', created_by_name: 'Ariel', sequence_number: 6, payment_type: 'bank_cbu', points: 0.6, age: 50, contribution_amount: 10000, contribution_frequency: 'monthly', captured_at: '', created_at: '', updated_at: '', created_by: null },
      { id: 'p7', operational_date: '2026-11-06', team_member_id: '1', created_by_name: 'Ariel', sequence_number: 7, payment_type: 'prepaid_wallet', points: 0.4, age: 22, contribution_amount: 10000, contribution_frequency: 'monthly', captured_at: '', created_at: '', updated_at: '', created_by: null },
      { id: 'p8', operational_date: '2026-11-06', team_member_id: '1', created_by_name: 'Ariel', sequence_number: 8, payment_type: 'prepaid_wallet', points: 0.4, age: 24, contribution_amount: 10000, contribution_frequency: 'monthly', captured_at: '', created_at: '', updated_at: '', created_by: null },
    ];

    const shifts: ShiftAssignment[] = [
      { id: 's1', operational_date: '2026-11-06', team_member_id: '1', hours_worked: 4, is_present: true, declared_at: '', created_at: '', updated_at: '' },
    ];

    const stats = calculateLiveDayStats(1, partners, shifts, mockTeamMembers, '2026-11-06');

    expect(stats.total_partners).toBe(8);
    expect(stats.total_points).toBe(5.5);
    expect(stats.total_amount).toBe(80000);
    expect(stats.total_hours).toBe(4);
    expect(stats.average_age).toBe(31.8); // (25+30+28+40+35+50+22+24)/8 = 254/8 = 31.75 -> 31.8
    expect(stats.averages.points_per_hour).toBe(1.38);
  });

  it('handles zero hours correctly without division by zero', () => {
    const partners: Partner[] = [
      { id: 'p1', operational_date: '2026-11-06', team_member_id: '3', created_by_name: 'Rosario', sequence_number: 1, payment_type: 'credit_card', points: 1.0, age: 30, contribution_amount: 15000, contribution_frequency: 'monthly', captured_at: '', created_at: '', updated_at: '', created_by: null },
    ];

    const shifts: ShiftAssignment[] = [
      { id: 's3', operational_date: '2026-11-06', team_member_id: '3', hours_worked: 0, is_present: true, declared_at: '', created_at: '', updated_at: '' },
    ];

    const stats = calculateLiveDayStats(1, partners, shifts, mockTeamMembers, '2026-11-06');

    expect(stats.total_hours).toBe(0);
    expect(stats.averages.partners_per_hour).toBeNull();
    expect(stats.averages.points_per_hour).toBeNull();

    const rosarioPerf = stats.team_performance.find((m) => m.name === 'Rosario');
    expect(rosarioPerf?.hours).toBe(0);
    expect(rosarioPerf?.partners_per_hour).toBeNull();
    expect(rosarioPerf?.points_per_hour).toBeNull();

    const report = generateWhatsAppReport(stats);
    expect(report).toContain('Horas totales: 0');
    expect(report).toContain('Socios por hora: N/D');
    expect(report).toContain('Rosario:');
    expect(report).toContain('Socios/hora: N/D');
    expect(report).toContain('Puntos/hora: N/D');
    expect(report).toContain('Dinero/hora: N/D');
  });

  it('never includes Morena in team performance list', () => {
    const stats = calculateLiveDayStats(0, [], [], mockTeamMembers, '2026-11-06');
    const names = stats.team_performance.map((t) => t.name.toLowerCase());
    expect(names).not.toContain('morena');
  });
});
