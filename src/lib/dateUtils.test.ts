import { describe, it, expect } from 'vitest';
import {
  ARGENTINA_TIMEZONE,
  formatBuenosAiresDate,
  formatBuenosAiresDateTime,
  formatShortDate,
  getBuenosAiresDateString,
  getDefaultDeclaredCollectorsForDate,
  getISOWeekAndYear,
  getISOWeekDateRange,
  getISOWeekDays,
  getISOWeeksInYear,
  getMonthDateRange,
  getPresetDateRange,
  getYesterdayDateString,
  isValidDateString,
  isValidPastOrTodayDate,
  shiftBuenosAiresDate,
} from './dateUtils';

describe('dateUtils - Horario Buenos Aires, validación de fechas y semanas ISO', () => {
  it('detecta el cambio exacto de jornada a las 00:00 hs de Buenos Aires (UTC-3)', () => {
    expect(ARGENTINA_TIMEZONE).toBe('America/Argentina/Buenos_Aires');

    const beforeMidnight = new Date('2026-11-10T02:59:59.000Z');
    const afterMidnight = new Date('2026-11-10T03:00:01.000Z');

    expect(getBuenosAiresDateString(beforeMidnight)).toBe('2026-11-09');
    expect(getBuenosAiresDateString(afterMidnight)).toBe('2026-11-10');
  });

  it('desplaza fechas cruzando límites de mes y año correctamente', () => {
    expect(shiftBuenosAiresDate('2027-01-01', -1)).toBe('2026-12-31');
    expect(shiftBuenosAiresDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(getYesterdayDateString('2026-11-10')).toBe('2026-11-09');
  });

  it('valida fechas reales del calendario y bloquea fechas futuras', () => {
    expect(isValidDateString('2026-11-10')).toBe(true);
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(isValidDateString('2026-13-01')).toBe(false);
    expect(isValidDateString('10/11/2026')).toBe(false);

    expect(isValidPastOrTodayDate('2026-11-09', '2026-11-10')).toBe(true);
    expect(isValidPastOrTodayDate('2026-11-10', '2026-11-10')).toBe(true);
    expect(isValidPastOrTodayDate('2026-11-11', '2026-11-10')).toBe(false);
    expect(isValidPastOrTodayDate('2026-02-30', '2026-11-10')).toBe(false);
  });

  it('formatea fechas y horas 24h en horario argentino incluyendo medianoche 00:xx', () => {
    expect(formatBuenosAiresDate('2026-11-09')).toBe('09/11/2026');
    expect(formatShortDate('2026-11-09')).toBe('09/11');
    expect(formatBuenosAiresDateTime('2026-11-10T03:05:00.000Z')).toBe('10/11/2026 00:05');
  });

  it('devuelve captadores por defecto según día de semana', () => {
    expect(getDefaultDeclaredCollectorsForDate('2026-11-09')).toBe(7); // Lunes
    expect(getDefaultDeclaredCollectorsForDate('2026-11-14')).toBe(2); // Sábado
    expect(getDefaultDeclaredCollectorsForDate('2026-11-15')).toBe(0); // Domingo
    expect(getDefaultDeclaredCollectorsForDate('2026-11-09', 9)).toBe(9);
  });

  it('calcula semanas ISO multi-año (2026=53 semanas, 2027=52 semanas) y rangos Lunes..Domingo', () => {
    const monNov9 = new Date('2026-11-09T15:00:00.000Z');
    const sunNov15 = new Date('2026-11-15T15:00:00.000Z');
    const satNov7 = new Date('2026-11-07T15:00:00.000Z');

    expect(getISOWeekAndYear(satNov7)).toEqual({ week: 45, year: 2026 });
    expect(getISOWeekAndYear(monNov9)).toEqual({ week: 46, year: 2026 });
    expect(getISOWeekAndYear(sunNov15)).toEqual({ week: 46, year: 2026 });
    expect(getISOWeeksInYear(2026)).toBe(53);
    expect(getISOWeeksInYear(2027)).toBe(52);

    const w46Days = getISOWeekDays(2026, 46);
    expect(w46Days).toHaveLength(7);
    expect(w46Days[0]).toEqual({ dateStr: '2026-11-09', dayName: 'Lunes', formattedDate: '09/11' });
    expect(w46Days[6]).toEqual({ dateStr: '2026-11-15', dayName: 'Domingo', formattedDate: '15/11' });

    const w1_2027 = getISOWeekDays(2027, 1);
    expect(w1_2027[0].dateStr).toBe('2027-01-04');
    expect(w1_2027[6].dateStr).toBe('2027-01-10');

    expect(getISOWeekDateRange(2027, 1)).toEqual({ startStr: '2027-01-04', endStr: '2027-01-10' });
  });

  it('calcula rangos mensuales y presets today/week/month', () => {
    expect(getMonthDateRange('2026-02-14')).toEqual({ startStr: '2026-02-01', endStr: '2026-02-28' });
    expect(getPresetDateRange('today', '2026-11-11')).toEqual({ startStr: '2026-11-11', endStr: '2026-11-11' });
    expect(getPresetDateRange('week', '2026-11-11')).toEqual({ startStr: '2026-11-09', endStr: '2026-11-15' });
    expect(getPresetDateRange('month', '2026-11-11')).toEqual({ startStr: '2026-11-01', endStr: '2026-11-30' });
  });
});
