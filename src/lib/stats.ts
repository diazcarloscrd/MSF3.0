import { Partner, ShiftAssignment, PaymentMethodType, ClosureSummaryData, TeamMember } from '../types/database';

export function formatPesos(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '$ 0,00';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined || isNaN(val)) return 'N/D';
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(val);
}

export function formatBuenosAiresDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return isoString;
  }
}

export function formatBuenosAiresDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-');
    if (year && month && day) {
      return `${day}/${month}/${year}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

export function calculateLiveDayStats(
  declaredCollectors: number,
  partners: Partner[],
  shifts: ShiftAssignment[],
  teamMembers: TeamMember[],
  workDate: string
): ClosureSummaryData {
  const totalPartners = partners.length;
  const totalPoints = Number(partners.reduce((sum, p) => sum + Number(p.points || 0), 0).toFixed(2));
  const totalAmount = Number(partners.reduce((sum, p) => sum + Number(p.contribution_amount || 0), 0).toFixed(2));
  const totalHours = Number(shifts.reduce((sum, s) => sum + Number(s.hours_worked || 0), 0).toFixed(2));

  const breakdown = {
    credit_card: {
      count: partners.filter((p) => p.payment_type === 'credit_card').length,
      points: Number(partners.filter((p) => p.payment_type === 'credit_card').reduce((sum, p) => sum + Number(p.points), 0).toFixed(2)),
    },
    debit_card: {
      count: partners.filter((p) => p.payment_type === 'debit_card').length,
      points: Number(partners.filter((p) => p.payment_type === 'debit_card').reduce((sum, p) => sum + Number(p.points), 0).toFixed(2)),
    },
    bank_cbu: {
      count: partners.filter((p) => p.payment_type === 'bank_cbu').length,
      points: Number(partners.filter((p) => p.payment_type === 'bank_cbu').reduce((sum, p) => sum + Number(p.points), 0).toFixed(2)),
    },
    prepaid_wallet: {
      count: partners.filter((p) => p.payment_type === 'prepaid_wallet').length,
      points: Number(partners.filter((p) => p.payment_type === 'prepaid_wallet').reduce((sum, p) => sum + Number(p.points), 0).toFixed(2)),
    },
  };

  const averages = {
    partners_per_collector: declaredCollectors > 0 ? Number((totalPartners / declaredCollectors).toFixed(2)) : null,
    points_per_collector: declaredCollectors > 0 ? Number((totalPoints / declaredCollectors).toFixed(2)) : null,
    amount_per_collector: declaredCollectors > 0 ? Number((totalAmount / declaredCollectors).toFixed(2)) : null,
    hours_per_collector: declaredCollectors > 0 ? Number((totalHours / declaredCollectors).toFixed(2)) : null,
    partners_per_hour: totalHours > 0 ? Number((totalPartners / totalHours).toFixed(2)) : null,
    points_per_hour: totalHours > 0 ? Number((totalPoints / totalHours).toFixed(2)) : null,
    amount_per_hour: totalHours > 0 ? Number((totalAmount / totalHours).toFixed(2)) : null,
    amount_per_partner: totalPartners > 0 ? Number((totalAmount / totalPartners).toFixed(2)) : null,
    points_per_partner: totalPartners > 0 ? Number((totalPoints / totalPartners).toFixed(2)) : null,
  };

  const team_performance = teamMembers
    .filter((m) => m.is_active)
    .map((member) => {
      const memberShift = shifts.find((s) => s.team_member_id === member.id);
      const memberHours = Number(memberShift?.hours_worked || 0);
      const memberPartners = partners.filter((p) => p.team_member_id === member.id);
      const memberPoints = Number(memberPartners.reduce((s, p) => s + Number(p.points), 0).toFixed(2));
      const memberAmount = Number(memberPartners.reduce((s, p) => s + Number(p.contribution_amount), 0).toFixed(2));

      return {
        name: member.display_name,
        hours: memberHours,
        partners_count: memberPartners.length,
        points: memberPoints,
        amount: memberAmount,
        credit_card_count: memberPartners.filter((p) => p.payment_type === 'credit_card').length,
        debit_card_count: memberPartners.filter((p) => p.payment_type === 'debit_card').length,
        bank_cbu_count: memberPartners.filter((p) => p.payment_type === 'bank_cbu').length,
        prepaid_wallet_count: memberPartners.filter((p) => p.payment_type === 'prepaid_wallet').length,
        partners_per_hour: memberHours > 0 ? Number((memberPartners.length / memberHours).toFixed(2)) : null,
        points_per_hour: memberHours > 0 ? Number((memberPoints / memberHours).toFixed(2)) : null,
        amount_per_hour: memberHours > 0 ? Number((memberAmount / memberHours).toFixed(2)) : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    work_date: workDate,
    declared_collectors: declaredCollectors,
    total_hours: totalHours,
    total_partners: totalPartners,
    total_points: totalPoints,
    total_amount: totalAmount,
    breakdown,
    averages,
    team_performance,
  };
}

export function generateWhatsAppReport(summary: ClosureSummaryData): string {
  const dateFormatted = formatBuenosAiresDate(summary.work_date);

  const lines: string[] = [
    'MSF ARGENTINA – CIERRE DE JORNADA',
    `Fecha: ${dateFormatted}`,
    '',
    'RESUMEN GENERAL',
    `Captadores presentes: ${summary.declared_collectors}`,
    `Horas totales: ${summary.total_hours}`,
    `Socios conseguidos: ${summary.total_partners}`,
    `Puntos obtenidos: ${summary.total_points}`,
    `Dinero registrado: ${formatPesos(summary.total_amount)}`,
    '',
    'MEDIOS DE CAPTACIÓN',
    `Tarjeta de crédito: ${summary.breakdown.credit_card.count} – ${summary.breakdown.credit_card.points} pts`,
    `Tarjeta de débito: ${summary.breakdown.debit_card.count} – ${summary.breakdown.debit_card.points} pts`,
    `CBU bancario: ${summary.breakdown.bank_cbu.count} – ${summary.breakdown.bank_cbu.points} pts`,
    `Tarjeta prepaga / billetera: ${summary.breakdown.prepaid_wallet.count} – ${summary.breakdown.prepaid_wallet.points} pts`,
    '',
    'PROMEDIOS GENERALES',
    `Socios por captador: ${formatNumber(summary.averages.partners_per_collector)}`,
    `Puntos por captador: ${formatNumber(summary.averages.points_per_collector)}`,
    `Dinero por captador: ${summary.averages.amount_per_collector !== null ? formatPesos(summary.averages.amount_per_collector) : 'N/D'}`,
    `Horas por captador: ${formatNumber(summary.averages.hours_per_collector)}`,
    `Socios por hora: ${formatNumber(summary.averages.partners_per_hour)}`,
    `Puntos por hora: ${formatNumber(summary.averages.points_per_hour)}`,
    `Dinero por hora: ${summary.averages.amount_per_hour !== null ? formatPesos(summary.averages.amount_per_hour) : 'N/D'}`,
    `Importe promedio por socio: ${summary.averages.amount_per_partner !== null ? formatPesos(summary.averages.amount_per_partner) : 'N/D'}`,
    '',
    'RENDIMIENTO INDIVIDUAL',
  ];

  summary.team_performance.forEach((m) => {
    lines.push(
      `${m.name}:`,
      `Horas: ${m.hours}`,
      `Socios: ${m.partners_count}`,
      `Puntos: ${m.points}`,
      `Dinero: ${formatPesos(m.amount)}`,
      `Socios/hora: ${formatNumber(m.partners_per_hour)}`,
      `Puntos/hora: ${formatNumber(m.points_per_hour)}`,
      `Dinero/hora: ${m.amount_per_hour !== null ? formatPesos(m.amount_per_hour) : 'N/D'}`,
      ''
    );
  });

  return lines.join('\n');
}

