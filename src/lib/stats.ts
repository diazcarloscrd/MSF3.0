import {
  ClosureSummaryData,
  HybridWeeklyRow,
  HybridWeeklySummary,
  MemberPerformance,
  PAYMENT_METHOD_CONFIG,
  Partner,
  ShiftAssignment,
  StatsRangeResponse,
  TeamMember,
  WeeklyMemberReport,
} from '../types/database';
import { formatBuenosAiresDate, formatBuenosAiresDateTime } from './dateUtils';

export { formatBuenosAiresDate, formatBuenosAiresDateTime };

export function formatPesos(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '$ 0,00';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export const formatCurrency = formatPesos;

export function formatNumber(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined || isNaN(val) || !Number.isFinite(val)) return 'N/D';
  const safeVal = Object.is(val, -0) ? 0 : val;
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(safeVal);
}

export function formatHours(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val) || !Number.isFinite(val)) return 'N/D';
  return `${formatNumber(val, 2)} h`;
}

export function formatPoints(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined || isNaN(val) || !Number.isFinite(val)) return 'N/D';
  const rounded = Number(Number(val).toFixed(decimals));
  const normalized = Object.is(rounded, -0) || rounded === 0 ? 0 : rounded;
  const unit = normalized === 1 ? 'pt' : 'pts';
  return `${formatNumber(normalized, decimals)} ${unit}`;
}

function isPaymentMethod(
  p: Partner,
  type: Partner['payment_type'],
  dbId: 'credito' | 'debito' | 'cbu' | 'prepaga'
): boolean {
  return p.payment_type === type || p.payment_method_id === dbId;
}

export function calculateLiveDayStats(
  declaredCollectors: number,
  partners: Partner[],
  shifts: ShiftAssignment[],
  teamMembers: TeamMember[],
  workDate: string
): ClosureSummaryData {
  const totalPartners = partners.length;
  const totalPoints = Number(
    partners.reduce((sum, p) => sum + Number(p.points || 0), 0).toFixed(2)
  );
  const totalAmount = Number(
    partners
      .reduce((sum, p) => sum + Number(p.contribution_amount || p.amount || 0), 0)
      .toFixed(2)
  );
  const totalHours = Number(
    shifts.reduce((sum, s) => sum + Number(s.hours_worked || 0), 0).toFixed(2)
  );

  // Edad promedio total
  const validAges = partners.filter((p) => p.age && p.age > 0).map((p) => Number(p.age));
  const averageAge =
    validAges.length > 0
      ? Number((validAges.reduce((sum, a) => sum + a, 0) / validAges.length).toFixed(1))
      : null;

  const creditPartners = partners.filter((p) => isPaymentMethod(p, 'credit_card', 'credito'));
  const debitPartners = partners.filter((p) => isPaymentMethod(p, 'debit_card', 'debito'));
  const cbuPartners = partners.filter((p) => isPaymentMethod(p, 'bank_cbu', 'cbu'));
  const prepaidPartners = partners.filter((p) =>
    isPaymentMethod(p, 'prepaid_wallet', 'prepaga')
  );

  const breakdown = {
    credit_card: {
      count: creditPartners.length,
      points: Number(
        creditPartners.reduce((sum, p) => sum + Number(p.points || 0), 0).toFixed(2)
      ),
    },
    debit_card: {
      count: debitPartners.length,
      points: Number(
        debitPartners.reduce((sum, p) => sum + Number(p.points || 0), 0).toFixed(2)
      ),
    },
    bank_cbu: {
      count: cbuPartners.length,
      points: Number(
        cbuPartners.reduce((sum, p) => sum + Number(p.points || 0), 0).toFixed(2)
      ),
    },
    prepaid_wallet: {
      count: prepaidPartners.length,
      points: Number(
        prepaidPartners.reduce((sum, p) => sum + Number(p.points || 0), 0).toFixed(2)
      ),
    },
  };

  const averages = {
    partners_per_collector:
      declaredCollectors > 0 ? Number((totalPartners / declaredCollectors).toFixed(2)) : null,
    points_per_collector:
      declaredCollectors > 0 ? Number((totalPoints / declaredCollectors).toFixed(2)) : null,
    amount_per_collector:
      declaredCollectors > 0 ? Number((totalAmount / declaredCollectors).toFixed(2)) : null,
    hours_per_collector:
      declaredCollectors > 0 ? Number((totalHours / declaredCollectors).toFixed(2)) : null,
    partners_per_hour: totalHours > 0 ? Number((totalPartners / totalHours).toFixed(2)) : null,
    points_per_hour: totalHours > 0 ? Number((totalPoints / totalHours).toFixed(2)) : null,
    amount_per_hour: totalHours > 0 ? Number((totalAmount / totalHours).toFixed(2)) : null,
    amount_per_partner:
      totalPartners > 0 ? Number((totalAmount / totalPartners).toFixed(2)) : null,
    points_per_partner:
      totalPartners > 0 ? Number((totalPoints / totalPartners).toFixed(2)) : null,
  };

  const team_performance: MemberPerformance[] = teamMembers
    .filter((m) => m.is_active)
    .map((member) => {
      const memberShift = shifts.find((s) => {
        if (s.team_member_id) return s.team_member_id === member.id;
        return s.team_member_name?.toLowerCase() === member.display_name.toLowerCase();
      });
      const memberHours = Number(memberShift?.hours_worked || 0);
      const memberPartners = partners.filter((p) => {
        const hasIds = Boolean(p.team_member_id || p.created_by);
        if (hasIds) {
          return p.team_member_id === member.id || p.created_by === member.id;
        }
        return p.created_by_name?.toLowerCase() === member.display_name.toLowerCase();
      });
      const memberPoints = Number(
        memberPartners.reduce((s, p) => s + Number(p.points || 0), 0).toFixed(2)
      );
      const memberAmount = Number(
        memberPartners
          .reduce((s, p) => s + Number(p.contribution_amount || p.amount || 0), 0)
          .toFixed(2)
      );

      const memberAges = memberPartners
        .filter((p) => p.age && p.age > 0)
        .map((p) => Number(p.age));
      const memberAverageAge =
        memberAges.length > 0
          ? Number((memberAges.reduce((sum, a) => sum + a, 0) / memberAges.length).toFixed(1))
          : null;

      return {
        member_id: member.id,
        name: member.display_name,
        hours: memberHours,
        partners_count: memberPartners.length,
        points: memberPoints,
        amount: memberAmount,
        average_age: memberAverageAge,
        credit_card_count: memberPartners.filter((p) =>
          isPaymentMethod(p, 'credit_card', 'credito')
        ).length,
        debit_card_count: memberPartners.filter((p) =>
          isPaymentMethod(p, 'debit_card', 'debito')
        ).length,
        bank_cbu_count: memberPartners.filter((p) =>
          isPaymentMethod(p, 'bank_cbu', 'cbu')
        ).length,
        prepaid_wallet_count: memberPartners.filter((p) =>
          isPaymentMethod(p, 'prepaid_wallet', 'prepaga')
        ).length,
        partners_per_hour:
          memberHours > 0 ? Number((memberPartners.length / memberHours).toFixed(2)) : null,
        points_per_hour:
          memberHours > 0 ? Number((memberPoints / memberHours).toFixed(2)) : null,
        amount_per_hour:
          memberHours > 0 ? Number((memberAmount / memberHours).toFixed(2)) : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return {
    work_date: workDate,
    declared_collectors: declaredCollectors,
    total_hours: totalHours,
    total_partners: totalPartners,
    total_points: totalPoints,
    total_amount: totalAmount,
    average_age: averageAge,
    breakdown,
    averages,
    team_performance,
  };
}

export interface WhatsAppReportOptions {
  presentMemberIds?: string[];
  notes?: string | null;
}

export function generateWhatsAppReport(
  summary: ClosureSummaryData,
  presentMemberIdsOrOptions?: string[] | WhatsAppReportOptions,
  notesArg?: string | null
): string {
  const options: WhatsAppReportOptions = Array.isArray(presentMemberIdsOrOptions)
    ? { presentMemberIds: presentMemberIdsOrOptions, notes: notesArg }
    : {
        presentMemberIds: presentMemberIdsOrOptions?.presentMemberIds,
        notes: presentMemberIdsOrOptions?.notes ?? notesArg,
      };

  const dateFormatted = formatBuenosAiresDate(summary.work_date);

  const lines: string[] = [
    'MSF ARGENTINA – CIERRE DE JORNADA',
    `Fecha: ${dateFormatted}`,
    '',
    'RESUMEN GENERAL',
    `Captadores presentes: ${summary.declared_collectors}`,
    `Horas totales: ${formatNumber(summary.total_hours)}`,
    `Socios conseguidos: ${summary.total_partners}`,
    `Puntos obtenidos: ${formatNumber(summary.total_points)}`,
    `Dinero registrado: ${formatPesos(summary.total_amount)}`,
    `Edad promedio de socios: ${
      summary.average_age !== null ? `${formatNumber(summary.average_age, 1)} años` : 'N/D'
    }`,
    '',
    'MEDIOS DE CAPTACIÓN',
    `Tarjeta de crédito: ${summary.breakdown.credit_card.count} – ${formatPoints(summary.breakdown.credit_card.points)}`,
    `Tarjeta de débito: ${summary.breakdown.debit_card.count} – ${formatPoints(summary.breakdown.debit_card.points)}`,
    `CBU bancario: ${summary.breakdown.bank_cbu.count} – ${formatPoints(summary.breakdown.bank_cbu.points)}`,
    `Tarjeta prepaga / billetera: ${summary.breakdown.prepaid_wallet.count} – ${formatPoints(summary.breakdown.prepaid_wallet.points)}`,
    '',
    'PROMEDIOS GENERALES',
    `Socios por captador: ${formatNumber(summary.averages.partners_per_collector)}`,
    `Puntos por captador: ${formatNumber(summary.averages.points_per_collector)}`,
    `Dinero por captador: ${
      summary.averages.amount_per_collector !== null
        ? formatPesos(summary.averages.amount_per_collector)
        : 'N/D'
    }`,
    `Horas por captador: ${formatNumber(summary.averages.hours_per_collector)}`,
    `Socios por hora: ${formatNumber(summary.averages.partners_per_hour)}`,
    `Puntos por hora: ${formatNumber(summary.averages.points_per_hour)}`,
    `Dinero por hora: ${
      summary.averages.amount_per_hour !== null
        ? formatPesos(summary.averages.amount_per_hour)
        : 'N/D'
    }`,
    `Importe promedio por socio: ${
      summary.averages.amount_per_partner !== null
        ? formatPesos(summary.averages.amount_per_partner)
        : 'N/D'
    }`,
    '',
    'RENDIMIENTO INDIVIDUAL',
  ];

  const presentSet = options.presentMemberIds
    ? new Set(options.presentMemberIds)
    : null;

  const visiblePerformance = presentSet
    ? summary.team_performance.filter((m) =>
        m.member_id ? presentSet.has(m.member_id) : false
      )
    : summary.team_performance;

  visiblePerformance.forEach((m) => {
    lines.push(
      `${m.name}:`,
      `Horas: ${formatNumber(m.hours)}`,
      `Socios: ${m.partners_count}`,
      `Puntos: ${formatNumber(m.points)}`,
      `Dinero: ${formatPesos(m.amount)}`,
      `Edad promedio: ${
        m.average_age !== null ? `${formatNumber(m.average_age, 1)} años` : 'N/D'
      }`,
      `Socios/hora: ${formatNumber(m.partners_per_hour)}`,
      `Puntos/hora: ${formatNumber(m.points_per_hour)}`,
      `Dinero/hora: ${
        m.amount_per_hour !== null ? formatPesos(m.amount_per_hour) : 'N/D'
      }`,
      ''
    );
  });

  const cleanNotes = options.notes?.trim();
  if (cleanNotes) {
    if (lines[lines.length - 1] !== '') {
      lines.push('');
    }
    lines.push('OBSERVACIONES DE LA JORNADA', cleanNotes);
  }

  return lines.join('\n');
}

export function enrichRangeStats(raw: StatsRangeResponse): StatsRangeResponse {
  const totalHours = Number(raw.summary.total_hours || 0);
  const totalAmount = Number(raw.summary.total_amount || 0);
  const summaryAmountPerHour =
    totalHours > 0 ? Number((totalAmount / totalHours).toFixed(2)) : null;

  return {
    ...raw,
    summary: {
      ...raw.summary,
      amount_per_hour:
        raw.summary.amount_per_hour !== undefined
          ? raw.summary.amount_per_hour
          : summaryAmountPerHour,
    },
    by_member: (raw.by_member || []).map((m) => {
      const hours = Number(m.hours || 0);
      const amount = Number(m.amount || 0);
      return {
        ...m,
        amount_per_hour:
          hours > 0 ? Number((amount / hours).toFixed(2)) : null,
      };
    }),
  };
}

export interface CalculateHybridWeeklyParams {
  year: number;
  weekNumber: number;
  members: TeamMember[];
  weekSocios: Array<{
    operational_date: string;
    created_by: string | null;
    created_by_name?: string;
    points: number;
    amount?: number;
    contribution_amount?: number;
  }>;
  weekHours: Array<{
    operational_date: string;
    user_id: string;
    hours_worked: number;
  }>;
  savedReports: WeeklyMemberReport[];
}

export function calculateHybridWeeklyData(
  params: CalculateHybridWeeklyParams
): HybridWeeklySummary {
  const { year, weekNumber, members, weekSocios, weekHours, savedReports } = params;

  const activeMembers = [...members]
    .filter((m) => m.is_active)
    .sort((a, b) => a.display_name.localeCompare(b.display_name, 'es'));

  const rows: HybridWeeklyRow[] = activeMembers.map((member) => {
    const memberSocios = weekSocios.filter((s) => {
      if (s.created_by) return s.created_by === member.id;
      return s.created_by_name?.toLowerCase() === member.display_name.toLowerCase();
    });

    const memberHoursRows = weekHours.filter((h) => h.user_id === member.id);

    const livePartners = memberSocios.length;
    const livePoints = Number(
      memberSocios.reduce((acc, s) => acc + Number(s.points || 0), 0).toFixed(2)
    );
    const liveAmount = Number(
      memberSocios
        .reduce((acc, s) => acc + Number(s.amount ?? s.contribution_amount ?? 0), 0)
        .toFixed(2)
    );
    const liveHours = Number(
      memberHoursRows.reduce((acc, h) => acc + Number(h.hours_worked || 0), 0).toFixed(2)
    );

    const savedReport = savedReports.find(
      (r) =>
        Number(r.year) === year &&
        Number(r.week_number) === weekNumber &&
        r.member_id === member.id
    );

    if (!savedReport) {
      return {
        member_id: member.id,
        member_name: member.display_name,
        status: 'live',
        points_earned: livePoints,
        invalid_and_cancellations: 0,
        final_points: livePoints,
        hours: liveHours,
        points_per_hour:
          liveHours > 0 ? Number((livePoints / liveHours).toFixed(2)) : null,
        total_amount: liveAmount,
        final_partners: livePartners,
        average_amount:
          livePartners > 0 ? Number((liveAmount / livePartners).toFixed(2)) : null,
        live_points_earned: livePoints,
        live_hours: liveHours,
        live_total_amount: liveAmount,
        live_partners: livePartners,
      };
    }

    const isOutdated =
      Math.abs(Number(savedReport.points_earned || 0) - livePoints) > 0.009 ||
      Math.abs(Number(savedReport.total_amount || 0) - liveAmount) > 0.009 ||
      Math.abs(Number(savedReport.hours || 0) - liveHours) > 0.009 ||
      Number(savedReport.final_partners || 0) !== livePartners;

    return {
      member_id: member.id,
      member_name: member.display_name,
      status: isOutdated ? 'outdated' : 'confirmed',
      points_earned: Number(savedReport.points_earned || 0),
      invalid_and_cancellations: Number(savedReport.invalid_and_cancellations || 0),
      final_points: Number(savedReport.final_points || 0),
      hours: Number(savedReport.hours || 0),
      points_per_hour: savedReport.points_per_hour,
      total_amount: Number(savedReport.total_amount || 0),
      final_partners: Number(savedReport.final_partners || 0),
      average_amount: savedReport.average_amount,
      live_points_earned: livePoints,
      live_hours: liveHours,
      live_total_amount: liveAmount,
      live_partners: livePartners,
      saved_report: savedReport,
    };
  });

  const totalPointsEarned = Number(
    rows.reduce((acc, r) => acc + r.points_earned, 0).toFixed(2)
  );
  const totalInvalids = Number(
    rows.reduce((acc, r) => acc + r.invalid_and_cancellations, 0).toFixed(2)
  );
  const totalFinalPoints = Number(
    rows.reduce((acc, r) => acc + r.final_points, 0).toFixed(2)
  );
  const totalHours = Number(rows.reduce((acc, r) => acc + r.hours, 0).toFixed(2));
  const totalAmount = Number(
    rows.reduce((acc, r) => acc + r.total_amount, 0).toFixed(2)
  );
  const totalPartners = rows.reduce((acc, r) => acc + r.final_partners, 0);

  return {
    year,
    week_number: weekNumber,
    rows,
    totals: {
      points_earned: totalPointsEarned,
      invalid_and_cancellations: totalInvalids,
      final_points: totalFinalPoints,
      hours: totalHours,
      points_per_hour:
        totalHours > 0 ? Number((totalFinalPoints / totalHours).toFixed(2)) : null,
      total_amount: totalAmount,
      final_partners: totalPartners,
      average_amount:
        totalPartners > 0 ? Number((totalAmount / totalPartners).toFixed(2)) : null,
    },
  };
}

export function generateWeeklyWhatsAppReport(
  weekly: HybridWeeklySummary,
  dateRange?: { startStr: string; endStr: string }
): string {
  const rangeLabel = dateRange
    ? ` (${formatBuenosAiresDate(dateRange.startStr)} al ${formatBuenosAiresDate(dateRange.endStr)})`
    : '';

  const lines: string[] = [
    `MSF ARGENTINA – PLANILLA SEMANAL`,
    `Semana ${weekly.week_number} / ${weekly.year}${rangeLabel}`,
    '',
    'TOTALES DEL EQUIPO',
    `Puntos brutos: ${formatPoints(weekly.totals.points_earned)}`,
    `Inválidas / Bajas: ${formatPoints(weekly.totals.invalid_and_cancellations)}`,
    `Puntos finales: ${formatPoints(weekly.totals.final_points)}`,
    `Horas totales: ${formatNumber(weekly.totals.hours)}`,
    `Puntos/hora: ${formatNumber(weekly.totals.points_per_hour)}`,
    `Socios finales: ${weekly.totals.final_partners}`,
    `Dinero total: ${formatPesos(weekly.totals.total_amount)}`,
    `Promedio por socio: ${
      weekly.totals.average_amount !== null
        ? formatPesos(weekly.totals.average_amount)
        : 'N/D'
    }`,
    '',
    'EQUIPO COMPLETO',
  ];

  weekly.rows.forEach((row) => {
    const statusLabel =
      row.status === 'confirmed'
        ? 'Confirmada'
        : row.status === 'outdated'
          ? 'Desactualizada — recalcular'
          : 'En vivo';
    lines.push(
      `${row.member_name} (${statusLabel}):`,
      `Finales: ${formatPoints(row.final_points)} | Horas: ${formatNumber(row.hours)} | P/H: ${formatNumber(row.points_per_hour)}`,
      `Socios: ${row.final_partners} | Total: ${formatPesos(row.total_amount)} | Promedio: ${
        row.average_amount !== null ? formatPesos(row.average_amount) : 'N/D'
      }`,
      ''
    );
  });

  return lines.join('\n');
}

export function escapeCsvCell(
  value: string | number | null | undefined,
  delimiter = ';'
): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }

  let str = String(value);
  const trimmed = str.trim();
  const isNegativeEsArThousands = /^-\d{1,3}(\.\d{3})*(,\d+)?$/.test(trimmed);
  const isPlainNegativeNumber = /^-\d+([.,]\d+)?$/.test(trimmed);
  const isGenuineNegativeNumber = isNegativeEsArThousands || isPlainNegativeNumber;
  if (!isGenuineNegativeNumber && /^\s*[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  if (
    str.includes(delimiter) ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvContent(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
  delimiter = ';'
): string {
  const lines = [headers, ...rows].map((row) =>
    row.map((cell) => escapeCsvCell(cell, delimiter)).join(delimiter)
  );
  return `\uFEFF${lines.join('\r\n')}`;
}

export function downloadCsv(filename: string, csvContent: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportPartnersToCsv(partners: Partner[], _label?: string): string {
  const headers = [
    'Fecha operativa',
    'Captador',
    'Edad',
    'Monto ($)',
    'Medio de captación',
    'Puntos',
    'Hora de carga',
  ];

  const rows = partners.map((p) => [
    formatBuenosAiresDate(p.operational_date),
    p.created_by_name,
    p.age,
    formatNumber(p.contribution_amount || p.amount || 0),
    p.payment_method_name ||
      PAYMENT_METHOD_CONFIG[p.payment_type]?.label ||
      p.payment_type,
    formatNumber(p.points),
    formatBuenosAiresDateTime(p.captured_at || p.created_at),
  ]);

  return buildCsvContent(headers, rows, ';');
}

export function exportWeeklyToCsv(weekly: HybridWeeklySummary): string {
  const headers = [
    'Año',
    'Semana',
    'Integrante',
    'Estado',
    'Puntos brutos',
    'Inválidas y bajas',
    'Puntos finales',
    'Horas',
    'P/H',
    'Dinero ($)',
    'Socios finales',
    'Promedio ($)',
  ];

  const rows: Array<Array<string | number | null>> = weekly.rows.map((r) => [
    weekly.year,
    weekly.week_number,
    r.member_name,
    r.status === 'confirmed'
      ? 'Confirmada'
      : r.status === 'outdated'
        ? 'Desactualizada — recalcular'
        : 'En vivo',
    formatNumber(r.points_earned),
    formatNumber(r.invalid_and_cancellations),
    formatNumber(r.final_points),
    formatNumber(r.hours),
    formatNumber(r.points_per_hour),
    formatNumber(r.total_amount),
    r.final_partners,
    formatNumber(r.average_amount),
  ]);

  rows.push([
    weekly.year,
    weekly.week_number,
    'TOTAL EQUIPO',
    '-',
    formatNumber(weekly.totals.points_earned),
    formatNumber(weekly.totals.invalid_and_cancellations),
    formatNumber(weekly.totals.final_points),
    formatNumber(weekly.totals.hours),
    formatNumber(weekly.totals.points_per_hour),
    formatNumber(weekly.totals.total_amount),
    weekly.totals.final_partners,
    formatNumber(weekly.totals.average_amount),
  ]);

  return buildCsvContent(headers, rows, ';');
}

export function exportRangeStatsToCsv(stats: StatsRangeResponse): string {
  const enriched = enrichRangeStats(stats);
  const startLabel = formatBuenosAiresDate(enriched.start_date);
  const endLabel = formatBuenosAiresDate(enriched.end_date);

  const headers = [
    'Desde',
    'Hasta',
    'Captador',
    'Socios',
    'Puntos',
    'Horas',
    'Puntos/Hora',
    'Dinero ($)',
    'Dinero/Hora ($)',
    'Promedio ($)',
    'Edad promedio',
    'Crédito',
    'Débito',
    'CBU',
    'Prepaga',
  ];

  const rows: Array<Array<string | number | null>> = enriched.by_member.map((m) => [
    startLabel,
    endLabel,
    m.full_name,
    m.socios_count,
    formatNumber(m.points),
    formatNumber(m.hours),
    formatNumber(m.points_per_hour),
    formatNumber(m.amount),
    formatNumber(m.amount_per_hour),
    formatNumber(m.average_amount),
    m.average_age !== null ? formatNumber(m.average_age, 1) : 'N/D',
    m.credito_count,
    m.debito_count,
    m.cbu_count,
    m.prepaga_count,
  ]);

  rows.push([
    startLabel,
    endLabel,
    'TOTAL PERÍODO',
    enriched.summary.total_socios,
    formatNumber(enriched.summary.total_points),
    formatNumber(enriched.summary.total_hours),
    formatNumber(enriched.summary.points_per_hour),
    formatNumber(enriched.summary.total_amount),
    formatNumber(enriched.summary.amount_per_hour),
    formatNumber(enriched.summary.average_amount),
    enriched.summary.average_age !== null
      ? formatNumber(enriched.summary.average_age, 1)
      : 'N/D',
    enriched.summary.credito_count,
    enriched.summary.debito_count,
    enriched.summary.cbu_count,
    enriched.summary.prepaga_count,
  ]);

  return buildCsvContent(headers, rows, ';');
}
