import { describe, it, expect } from 'vitest';
import {
  buildCsvContent,
  calculateHybridWeeklyData,
  calculateLiveDayStats,
  enrichRangeStats,
  escapeCsvCell,
  exportPartnersToCsv,
  exportRangeStatsToCsv,
  exportWeeklyToCsv,
  formatHours,
  formatNumber,
  formatPesos,
  formatPoints,
  generateWeeklyWhatsAppReport,
  generateWhatsAppReport,
} from './stats';
import {
  Partner,
  ShiftAssignment,
  StatsRangeResponse,
  TeamMember,
  WeeklyMemberReport,
} from '../types/database';

describe('MSF 3.0 - Motor Estadístico, Formato es-AR, Híbrido Semanal y CSV', () => {
  const mockTeamMembers: TeamMember[] = [
    { id: '1', display_name: 'Ariel', username: 'ariel', profile_id: null, role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
    { id: '2', display_name: 'Lucia', username: 'lucia', profile_id: null, role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
    { id: '3', display_name: 'Rosario', username: 'rosario', profile_id: null, role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
    { id: '4', display_name: 'Morena', username: 'morena', profile_id: null, role: 'COLLECTOR', is_active: false, created_at: '', updated_at: '' },
  ];

  it('calcula puntajes oficiales exactos: CC=1.0, DB=0.7, CBU=0.6, PRE=0.4 y excluye inactivos', () => {
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

    const names = stats.team_performance.map((t) => t.name.toLowerCase());
    expect(names).not.toContain('morena');
    expect(stats.team_performance.find((t) => t.name === 'Ariel')?.member_id).toBe('1');
  });

  it('formatea números, horas, pesos y singular/plural de puntos en es-AR', () => {
    expect(formatNumber(1.4)).toBe('1,4');
    expect(formatNumber(48.8, 1)).toBe('48,8');
    expect(formatNumber(null)).toBe('N/D');
    expect(formatHours(4.5)).toBe('4,5 h');
    expect(formatHours(undefined)).toBe('N/D');
    expect(formatPoints(1)).toBe('1 pt');
    expect(formatPoints(1.0)).toBe('1 pt');
    expect(formatPoints(0)).toBe('0 pts');
    expect(formatPoints(-0.001)).toBe('0 pts');
    expect(formatPoints(0.7)).toBe('0,7 pts');
    expect(formatPoints(1.4)).toBe('1,4 pts');
    expect(formatPoints(null)).toBe('N/D');
    expect(formatPesos(15000)).toContain('15.000,00');
  });

  it('maneja 0 horas sin división por cero y formatea N/D y decimales es-AR en WhatsApp', () => {
    const partners: Partner[] = [
      { id: 'p1', operational_date: '2026-11-09', team_member_id: '3', created_by_name: 'Rosario', sequence_number: 1, payment_type: 'credit_card', points: 1.0, age: 30, contribution_amount: 15000, contribution_frequency: 'monthly', captured_at: '', created_at: '', updated_at: '', created_by: null },
      { id: 'p2', operational_date: '2026-11-09', team_member_id: '3', created_by_name: 'Rosario', sequence_number: 2, payment_type: 'debit_card', points: 0.7, age: 41, contribution_amount: 12000, contribution_frequency: 'monthly', captured_at: '', created_at: '', updated_at: '', created_by: null },
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
    expect(report).toContain('Puntos obtenidos: 1,7');
    expect(report).toContain('Edad promedio de socios: 35,5 años');
    expect(report).toContain('Tarjeta de crédito: 1 – 1 pt');
    expect(report).toContain('Tarjeta de débito: 1 – 0,7 pts');
    expect(report).toContain('CBU bancario: 0 – 0 pts');
    expect(report).toContain('Socios por hora: N/D');
    expect(report).toContain('Rosario:');
    expect(report).toContain('Puntos/hora: N/D');
  });

  it('filtra RENDIMIENTO INDIVIDUAL por presentMemberIds y agrega OBSERVACIONES DE LA JORNADA', () => {
    const partners: Partner[] = [
      { id: 'p1', operational_date: '2026-11-09', team_member_id: '1', created_by: '1', created_by_name: 'Ariel', sequence_number: 1, payment_type: 'credit_card', points: 1.0, age: 40, contribution_amount: 15000, contribution_frequency: 'monthly', captured_at: '', created_at: '', updated_at: '' },
      { id: 'p2', operational_date: '2026-11-09', team_member_id: '2', created_by: '2', created_by_name: 'Lucia', sequence_number: 2, payment_type: 'prepaid_wallet', points: 0.4, age: 30, contribution_amount: 10000, contribution_frequency: 'monthly', captured_at: '', created_at: '', updated_at: '' },
    ];
    const shifts: ShiftAssignment[] = [
      { id: 's1', operational_date: '2026-11-09', team_member_id: '1', hours_worked: 4.5, is_present: true, declared_at: '', created_at: '', updated_at: '' },
    ];

    const stats = calculateLiveDayStats(1, partners, shifts, mockTeamMembers, '2026-11-09');
    const report = generateWhatsAppReport(stats, {
      presentMemberIds: ['1'],
      notes: 'Lluvia a la tarde en zona centro',
    });

    expect(report).toContain('Socios conseguidos: 2');
    expect(report).toContain('Puntos obtenidos: 1,4');
    expect(report).toContain('Ariel:');
    expect(report).toContain('Horas: 4,5');
    expect(report).not.toContain('Lucia:');
    expect(report).not.toContain('Rosario:');
    expect(report).toContain('OBSERVACIONES DE LA JORNADA\nLluvia a la tarde en zona centro');

    const positionalReport = generateWhatsAppReport(stats, ['2'], 'Nota posicional');
    expect(positionalReport).toContain('Lucia:');
    expect(positionalReport).not.toContain('Ariel:');
    expect(positionalReport).toContain('Nota posicional');
  });

  it('deriva amount_per_hour en enrichRangeStats respetando división por cero', () => {
    const raw: StatsRangeResponse = {
      start_date: '2026-11-09',
      end_date: '2026-11-15',
      user_id: null,
      summary: {
        total_socios: 2,
        total_points: 1.7,
        total_amount: 25000,
        total_hours: 4,
        average_age: 33.5,
        credito_count: 1,
        credito_points: 1,
        debito_count: 1,
        debito_points: 0.7,
        cbu_count: 0,
        cbu_points: 0,
        prepaga_count: 0,
        prepaga_points: 0,
        socios_per_hour: 0.5,
        points_per_hour: 0.43,
        average_amount: 12500,
      },
      by_member: [
        {
          user_id: '1',
          full_name: 'Ariel',
          socios_count: 2,
          points: 1.7,
          amount: 25000,
          hours: 4,
          average_age: 33.5,
          credito_count: 1,
          debito_count: 1,
          cbu_count: 0,
          prepaga_count: 0,
          socios_per_hour: 0.5,
          points_per_hour: 0.43,
          average_amount: 12500,
        },
        {
          user_id: '2',
          full_name: 'Lucia',
          socios_count: 0,
          points: 0,
          amount: 0,
          hours: 0,
          average_age: null,
          credito_count: 0,
          debito_count: 0,
          cbu_count: 0,
          prepaga_count: 0,
          socios_per_hour: null,
          points_per_hour: null,
          average_amount: null,
        },
      ],
      by_date: [],
      hours: [],
      socios: [],
    };

    const enriched = enrichRangeStats(raw);
    expect(enriched.summary.amount_per_hour).toBe(6250);
    expect(enriched.by_member[0].amount_per_hour).toBe(6250);
    expect(enriched.by_member[1].amount_per_hour).toBeNull();
  });

  it('calcula planilla semanal híbrida con estados live, confirmed, outdated y totales', () => {
    const weekSocios = [
      { operational_date: '2026-11-09', created_by: '1', points: 1.0, amount: 15000 },
      { operational_date: '2026-11-10', created_by: '1', points: 0.7, amount: 10000 },
      { operational_date: '2026-11-10', created_by: '2', points: 0.6, amount: 12000 },
      { operational_date: '2026-11-11', created_by: '3', points: 1.0, amount: 20000 },
    ];
    const weekHours = [
      { operational_date: '2026-11-09', user_id: '1', hours_worked: 4 },
      { operational_date: '2026-11-10', user_id: '2', hours_worked: 3 },
      { operational_date: '2026-11-11', user_id: '3', hours_worked: 0 },
    ];
    const savedReports: WeeklyMemberReport[] = [
      {
        id: 'rep-1',
        year: 2026,
        week_number: 46,
        member_id: '1',
        member_name: 'Ariel',
        points_earned: 1.7,
        invalid_and_cancellations: 0.2,
        final_points: 1.5,
        hours: 4,
        points_per_hour: 0.38,
        total_amount: 25000,
        final_partners: 2,
        average_amount: 12500,
        updated_at: '',
      },
      {
        id: 'rep-2',
        year: 2026,
        week_number: 46,
        member_id: '2',
        member_name: 'Lucia',
        points_earned: 1.6, // difiere del en vivo (0.6) porque se movió un socio
        invalid_and_cancellations: 0,
        final_points: 1.6,
        hours: 3,
        points_per_hour: 0.53,
        total_amount: 22000,
        final_partners: 2,
        average_amount: 11000,
        updated_at: '',
      },
    ];

    const hybrid = calculateHybridWeeklyData({
      year: 2026,
      weekNumber: 46,
      members: mockTeamMembers,
      weekSocios,
      weekHours,
      savedReports,
    });

    expect(hybrid.rows).toHaveLength(3); // Morena inactiva excluida
    const ariel = hybrid.rows.find((r) => r.member_id === '1')!;
    const lucia = hybrid.rows.find((r) => r.member_id === '2')!;
    const rosario = hybrid.rows.find((r) => r.member_id === '3')!;

    expect(ariel.status).toBe('confirmed');
    expect(ariel.final_points).toBe(1.5);

    expect(lucia.status).toBe('outdated');
    expect(lucia.live_points_earned).toBe(0.6);
    expect(lucia.live_partners).toBe(1);

    expect(rosario.status).toBe('live');
    expect(rosario.points_earned).toBe(1);
    expect(rosario.points_per_hour).toBeNull(); // 0 horas sin NaN
    expect(rosario.average_amount).toBe(20000);

    expect(hybrid.totals.final_points).toBe(4.1);
    expect(hybrid.totals.hours).toBe(7);
    expect(hybrid.totals.final_partners).toBe(5);
    expect(hybrid.totals.points_per_hour).toBe(0.59);

    const waWeekly = generateWeeklyWhatsAppReport(hybrid, {
      startStr: '2026-11-09',
      endStr: '2026-11-15',
    });
    expect(waWeekly).toContain('Semana 46 / 2026 (09/11/2026 al 15/11/2026)');
    expect(waWeekly).toContain('Ariel (Confirmada):');
    expect(waWeekly).toContain('Lucia (Desactualizada — recalcular):');
    expect(waWeekly).toContain('Rosario (En vivo):');
  });

  it('genera CSV con UTF-8 BOM, delimitador ;, escape RFC-4180 y neutralización de fórmulas', () => {
    expect(escapeCsvCell('=CMD()')).toBe("'=CMD()");
    expect(escapeCsvCell(' =CMD()')).toBe("' =CMD()");
    expect(escapeCsvCell('+1+1')).toBe("'+1+1");
    expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(escapeCsvCell('-CMD()')).toBe("'-CMD()");
    expect(escapeCsvCell(' -CMD()')).toBe("' -CMD()");
    expect(escapeCsvCell('-15,5')).toBe('-15,5');
    expect(escapeCsvCell('-1.500,5')).toBe('-1.500,5');
    expect(escapeCsvCell('-1.500')).toBe('-1.500');
    expect(escapeCsvCell('Hola; "mundo"')).toBe('"Hola; ""mundo"""');

    const csv = buildCsvContent(['Col1', 'Col2'], [['=1+1', 'Texto; con "comillas"']]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toBe('\uFEFFCol1;Col2\r\n\'=1+1;"Texto; con ""comillas"""');

    const partnersCsv = exportPartnersToCsv(
      [
        {
          id: 'p1',
          operational_date: '2026-11-09',
          team_member_id: '1',
          created_by: '1',
          created_by_name: 'Ariel',
          sequence_number: 1,
          payment_type: 'debit_card',
          payment_method_name: 'Tarjeta de débito',
          points: 0.7,
          age: 28,
          contribution_amount: 15000.5,
          contribution_frequency: 'monthly',
          captured_at: '2026-11-09T15:30:00.000Z',
          created_at: '2026-11-09T15:30:00.000Z',
          updated_at: '2026-11-09T15:30:00.000Z',
        },
      ],
      '2026-11-09'
    );
    expect(partnersCsv.startsWith('\uFEFF')).toBe(true);
    expect(partnersCsv).toContain('09/11/2026;Ariel;28;15.000,5;Tarjeta de débito;0,7;');

    const weeklyCsv = exportWeeklyToCsv(
      calculateHybridWeeklyData({
        year: 2026,
        weekNumber: 46,
        members: mockTeamMembers,
        weekSocios: [],
        weekHours: [],
        savedReports: [],
      })
    );
    expect(weeklyCsv.startsWith('\uFEFF')).toBe(true);
    expect(weeklyCsv).toContain('TOTAL EQUIPO');

    const rangeCsv = exportRangeStatsToCsv({
      start_date: '2026-11-09',
      end_date: '2026-11-15',
      user_id: null,
      summary: {
        total_socios: 0,
        total_points: 0,
        total_amount: 0,
        total_hours: 0,
        average_age: null,
        credito_count: 0,
        credito_points: 0,
        debito_count: 0,
        debito_points: 0,
        cbu_count: 0,
        cbu_points: 0,
        prepaga_count: 0,
        prepaga_points: 0,
        socios_per_hour: null,
        points_per_hour: null,
        average_amount: null,
      },
      by_member: [],
      by_date: [],
      hours: [],
      socios: [],
    });
    expect(rangeCsv.startsWith('\uFEFF')).toBe(true);
    expect(rangeCsv).toContain('TOTAL PERÍODO');
  });
});
