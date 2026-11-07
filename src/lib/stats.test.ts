import { describe, it, expect } from 'vitest';
import { calculateLiveDayStats, generateWhatsAppReport } from './stats';
import { normalizeUsername, usernameToEmail, OFFICIAL_TEAM_MEMBERS } from '../context/AuthContext';
import { getBuenosAiresDateString, getDefaultDeclaredCollectorsForDate } from '../context/WorkDayContext';
import { getISOWeekAndYear, getISOWeeksInYear } from '../components/WeeklyClosingSection';
import { Partner, ShiftAssignment, TeamMember } from '../types/database';

describe('MSF 3.0 - Motor Estadístico, Horario Argentino, Auth y Semana 46', () => {
  const mockTeamMembers: TeamMember[] = [
    { id: '1', display_name: 'Ariel', username: 'ariel', profile_id: null, role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
    { id: '2', display_name: 'Lucia', username: 'lucia', profile_id: null, role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
    { id: '3', display_name: 'Rosario', username: 'rosario', profile_id: null, role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
  ];

  it('calcula puntajes oficiales exactos: CC=1.0, DB=0.7, CBU=0.6, PRE=0.4', () => {
    const partners: Partner[] = [
      { id: 'p1', operational_date: '2026-11-09', team_member_id: '1', created_by_name: 'Ariel', sequence_number: 1, payment_type: 'credit_card', points: 1.0, age: 25, contribution_amount: 10000, contribution_frequency: 'monthly', captured_at: '', created_at: '', updated_at: '', created_by: null },
      { id: 'p2', operational_date: '2026-11-09', team_member_id: '1', created_by_name: 'Ariel', sequence_number: 2, payment_type: 'credit_card', points: 1.0, age: 30, contribution_amount: 10000, contribution_frequency: 'monthly', captured_at: '', created_at: '', updated_at: '', created_by: null },
      { id: 'p3', operational_date: '2026-11-09', team_member_id: '1', created_by_name: 'Ariel', sequence_number: 3, payment_type: 'debit_card', points: 0.7, age: 28, contribution_amount: 10000, contribution_frequency: 'monthly', captured_at: '', created_at: '', updated_at: '', created_by: null },
      { id: 'p4', operational_date: '2026-11-09', team_member_id: '1', created_by_name: 'Ariel', sequence_number: 4, payment_type: 'debit_card', points: 0.7, age: 40, contribution_amount: 10000, contribution_frequency: 'monthly', captured_at: '', created_at: '', updated_at: '', created_by: null },
      { id: 'p5', operational_date: '2026-11-09', team_member_id: '1', created_by_name: 'Ariel', sequence_number: 5, payment_type: 'debit_card', points: 0.7, age: 35, contribution_amount: 10000, contribution_frequency: 'monthly', captured_at: '', created_at: '', updated_at: '', created_by: null },
      { id: 'p6', operational_date: '2026-11-09', team_member_id: '1', created_by_name: 'Ariel', sequence_number: 6, payment_type: 'bank_cbu', points: 0.6, age: 50, contribution_amount: 10000, contribution_frequency: 'monthly', captured_at: '', created_at: '', updated_at: '', created_by: null },
      { id: 'p7', operational_date: '2026-11-09', team_member_id: '1', created_by_name: 'Ariel', sequence_number: 7, payment_type: 'prepaid_wallet', points: 0.4, age: 22, contribution_amount: 10000, contribution_frequency: 'monthly', captured_at: '', created_at: '', updated_at: '', created_by: null },
      { id: 'p8', operational_date: '2026-11-09', team_member_id: '1', created_by_name: 'Ariel', sequence_number: 8, payment_type: 'prepaid_wallet', points: 0.4, age: 24, contribution_amount: 10000, contribution_frequency: 'monthly', captured_at: '', created_at: '', updated_at: '', created_by: null },
    ];

    const shifts: ShiftAssignment[] = [
      { id: 's1', operational_date: '2026-11-09', team_member_id: '1', hours_worked: 4, is_present: true, declared_at: '', created_at: '', updated_at: '' },
    ];

    const stats = calculateLiveDayStats(1, partners, shifts, mockTeamMembers, '2026-11-09');

    expect(stats.total_partners).toBe(8);
    expect(stats.total_points).toBe(5.5);
    expect(stats.total_amount).toBe(80000);
    expect(stats.total_hours).toBe(4);
    expect(stats.average_age).toBe(31.8);
    expect(stats.averages.points_per_hour).toBe(1.38);
  });

  it('maneja 0 horas sin división por cero y formatea N/D en WhatsApp', () => {
    const partners: Partner[] = [
      { id: 'p1', operational_date: '2026-11-09', team_member_id: '3', created_by_name: 'Rosario', sequence_number: 1, payment_type: 'credit_card', points: 1.0, age: 30, contribution_amount: 15000, contribution_frequency: 'monthly', captured_at: '', created_at: '', updated_at: '', created_by: null },
    ];

    const shifts: ShiftAssignment[] = [
      { id: 's3', operational_date: '2026-11-09', team_member_id: '3', hours_worked: 0, is_present: false, declared_at: '', created_at: '', updated_at: '' },
    ];

    const stats = calculateLiveDayStats(1, partners, shifts, mockTeamMembers, '2026-11-09');

    expect(stats.total_hours).toBe(0);
    expect(stats.averages.partners_per_hour).toBeNull();
    expect(stats.averages.points_per_hour).toBeNull();

    const report = generateWhatsAppReport(stats);
    expect(report).toContain('Horas totales: 0');
    expect(report).toContain('Socios por hora: N/D');
    expect(report).toContain('Rosario:');
    expect(report).toContain('Puntos/hora: N/D');
  });

  it('excluye permanentemente a Morena y valida UUIDv4 reales para los 8 usuarios oficiales', () => {
    const stats = calculateLiveDayStats(0, [], [], OFFICIAL_TEAM_MEMBERS, '2026-11-09');
    const names = stats.team_performance.map((t) => t.name.toLowerCase());
    expect(names).not.toContain('morena');
    expect(OFFICIAL_TEAM_MEMBERS).toHaveLength(8);

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const member of OFFICIAL_TEAM_MEMBERS) {
      expect(member.id).toMatch(uuidRegex);
      expect((member as any).default_pass).toBeUndefined();
    }
  });

  it('normaliza tildes y espacios en login móvil (Lucía -> lucia, Nicolás -> nicolas, Carlos Diaz -> carlos)', () => {
    expect(normalizeUsername('  Lucía ')).toBe('lucia');
    expect(normalizeUsername('Nicolás')).toBe('nicolas');
    expect(normalizeUsername('Carlos Díaz')).toBe('carlos');
    expect(usernameToEmail('Emilce')).toBe('emilce@msfc-user.invalid');
    expect(usernameToEmail('Rosario')).toBe('rosario@msfc-user.invalid');
  });

  it('detecta el cambio exacto de jornada a las 00:00 hs de Buenos Aires (UTC-3)', () => {
    // 23:59:59 del Lunes 09/11/2026 en Buenos Aires = 02:59:59Z del 10/11/2026 UTC
    const beforeMidnight = new Date('2026-11-10T02:59:59.000Z');
    // 00:00:01 del Martes 10/11/2026 en Buenos Aires = 03:00:01Z del 10/11/2026 UTC
    const afterMidnight = new Date('2026-11-10T03:00:01.000Z');

    expect(getBuenosAiresDateString(beforeMidnight)).toBe('2026-11-09');
    expect(getBuenosAiresDateString(afterMidnight)).toBe('2026-11-10');

    // Valores por defecto de captadores presentes por día de semana
    expect(getDefaultDeclaredCollectorsForDate('2026-11-09')).toBe(7); // Lunes
    expect(getDefaultDeclaredCollectorsForDate('2026-11-14')).toBe(2); // Sábado rotativo
    expect(getDefaultDeclaredCollectorsForDate('2026-11-15')).toBe(0); // Domingo
  });

  it('calcula con exactitud la Semana 46 (Lunes 09/11/2026 al Domingo 15/11/2026) y las 53 semanas ISO de 2026', () => {
    const monNov9 = new Date('2026-11-09T15:00:00.000Z');
    const sunNov15 = new Date('2026-11-15T15:00:00.000Z');
    const satNov7 = new Date('2026-11-07T15:00:00.000Z');

    expect(getISOWeekAndYear(satNov7)).toEqual({ week: 45, year: 2026 });
    expect(getISOWeekAndYear(monNov9)).toEqual({ week: 46, year: 2026 });
    expect(getISOWeekAndYear(sunNov15)).toEqual({ week: 46, year: 2026 });
    expect(getISOWeeksInYear(2026)).toBe(53);
  });
});
