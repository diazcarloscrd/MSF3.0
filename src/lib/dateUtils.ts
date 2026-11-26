export const ARGENTINA_TIMEZONE = 'America/Argentina/Buenos_Aires';

const DAY_NAMES = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;

const pad2 = (n: number): string => String(n).padStart(2, '0');

export function getBuenosAiresDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ARGENTINA_TIMEZONE }).format(date);
}

export function isValidDateString(dateStr: string): boolean {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const check = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return (
    check.getUTCFullYear() === y &&
    check.getUTCMonth() + 1 === m &&
    check.getUTCDate() === d
  );
}

export function isValidPastOrTodayDate(dateStr: string, todayStr: string): boolean {
  return isValidDateString(dateStr) && isValidDateString(todayStr) && dateStr <= todayStr;
}

export function shiftBuenosAiresDate(dateStr: string, deltaDays: number): string {
  if (!isValidDateString(dateStr)) return dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

export function getYesterdayDateString(todayStr?: string): string {
  const base = todayStr && isValidDateString(todayStr) ? todayStr : getBuenosAiresDateString();
  return shiftBuenosAiresDate(base, -1);
}

export function formatBuenosAiresDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return dateStr;
}

export function formatShortDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const [, month, day] = parts;
    return `${day}/${month}`;
  }
  return dateStr;
}

export function formatBuenosAiresDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const parts = new Intl.DateTimeFormat('es-AR', {
      timeZone: ARGENTINA_TIMEZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(d);

    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value || '';
    const day = get('day');
    const month = get('month');
    const year = get('year');
    const hour = get('hour');
    const minute = get('minute');
    if (day && month && year && hour && minute) {
      return `${day}/${month}/${year} ${hour}:${minute}`;
    }
    return isoString;
  } catch {
    return isoString;
  }
}

export function getDefaultDeclaredCollectorsForDate(
  dateStr: string,
  activeCollectorsCount = 7
): number {
  if (isValidDateString(dateStr)) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const dow = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
    if (dow === 6) return 2; // Sábado rotativo (2 personas)
    if (dow === 0) return 0; // Domingo
  }
  return activeCollectorsCount;
}

export function getISOWeekAndYear(date: Date): { week: number; year: number } {
  const baStr = getBuenosAiresDateString(date);
  const [y, m, d] = baStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  const dayNr = (target.getUTCDay() + 6) % 7; // Lunes = 0, Domingo = 6
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // Jueves de esa semana ISO
  const isoYear = target.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / 604800000);
  return { week, year: isoYear };
}

export function getISOWeeksInYear(isoYear: number): number {
  const dec28 = new Date(Date.UTC(isoYear, 11, 28, 12, 0, 0));
  return getISOWeekAndYear(dec28).week;
}

export function getISOWeekDays(
  isoYear: number,
  isoWeek: number
): { dateStr: string; dayName: string; formattedDate: string }[] {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4, 12, 0, 0));
  const dayOfWeek = (jan4.getUTCDay() + 6) % 7; // Lunes = 0
  const mondayFirstWeek = new Date(jan4);
  mondayFirstWeek.setUTCDate(jan4.getUTCDate() - dayOfWeek);

  const targetMonday = new Date(mondayFirstWeek);
  targetMonday.setUTCDate(mondayFirstWeek.getUTCDate() + (isoWeek - 1) * 7);

  const days: { dateStr: string; dayName: string; formattedDate: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(targetMonday);
    d.setUTCDate(targetMonday.getUTCDate() + i);
    const dateStr = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    const formattedDate = `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}`;
    days.push({
      dateStr,
      dayName: DAY_NAMES[i],
      formattedDate,
    });
  }
  return days;
}

export function getISOWeekDateRange(
  isoYear: number,
  isoWeek: number
): { startStr: string; endStr: string } {
  const days = getISOWeekDays(isoYear, isoWeek);
  return {
    startStr: days[0].dateStr,
    endStr: days[days.length - 1].dateStr,
  };
}

export function getMonthDateRange(dateStr: string): { startStr: string; endStr: string } {
  const base = isValidDateString(dateStr) ? dateStr : getBuenosAiresDateString();
  const [y, m] = base.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0, 12, 0, 0)).getUTCDate();
  return {
    startStr: `${y}-${pad2(m)}-01`,
    endStr: `${y}-${pad2(m)}-${pad2(lastDay)}`,
  };
}

export function getPresetDateRange(
  preset: 'today' | 'week' | 'month',
  todayStr?: string
): { startStr: string; endStr: string } {
  const base = todayStr && isValidDateString(todayStr) ? todayStr : getBuenosAiresDateString();
  if (preset === 'today') {
    return { startStr: base, endStr: base };
  }
  if (preset === 'week') {
    const [y, m, d] = base.split('-').map(Number);
    const noonBaUtc = new Date(Date.UTC(y, m - 1, d, 15, 0, 0));
    const { week, year } = getISOWeekAndYear(noonBaUtc);
    return getISOWeekDateRange(year, week);
  }
  return getMonthDateRange(base);
}
