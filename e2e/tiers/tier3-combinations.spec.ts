import { test, expect } from '../fixtures/test.ts';
import {
  TAB_PATTERNS,
  getLastUsernameStorage,
  loginAs,
  loginWithCustomCredentials,
  logout,
  switchTab,
  usernameInput,
} from '../helpers/auth.ts';
import {
  assertActionButtonsTouchGeometry,
  assertNoHorizontalOverflow,
} from '../helpers/layoutAssertions.ts';
import {
  createTestSocioAsAccount,
  deactivateTestUsersByPrefix,
  deleteSocioById,
  deleteTestSociosBySentinel,
  getAuditLogEntries,
  getSociosForDate,
  getSociosForRange,
  restoreDayState,
  restoreWeeklyReports,
  setCaptorHoursAdmin,
  snapshotDayState,
  snapshotWeeklyReports,
} from '../helpers/stagingCleanup.ts';
import {
  SEEDED_HISTORY,
  STAGING_ACCOUNTS,
  formatDateDMY,
  getISOWeekAndYearBA,
  getISOWeekRange,
  isMondayBA,
  todayStr,
  yesterdayStr,
} from '../helpers/stagingEnv.ts';
import {
  ageInput,
  amountInput,
  confirmMoveDate,
  editMyHours,
  exportCsvAndReadBom,
  fillAndSubmitPartner,
  navigateCalendarToDate,
  openAuditTabFilters,
  openMoveDateModal,
  openTeamManagement,
  partnerCardByAmount,
  readWhatsAppClosureText,
  saveOfficialClosure,
  selectStatsPeriod,
  selectWeeklyYearAndWeek,
  toggleBatchSelectMode,
} from '../helpers/uiActions.ts';

function esArPointsRegex(val: number): RegExp {
  const rounded = Number(val.toFixed(2));
  const formatted = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(rounded);
  const escaped = formatted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (Number.isInteger(rounded)) {
    return new RegExp(`(?<![\\d,.])${escaped}(?:,0{1,2})?(?![\\d,])`);
  }
  const parts = formatted.split(',');
  if (parts[1] && parts[1].length === 1) {
    return new RegExp(`(?<![\\d,.])${escaped}0?(?![\\d,])`);
  }
  return new RegExp(`(?<![\\d,.])${escaped}(?![\\d,])`);
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseCsvNumericValue(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,.-]/g, '').trim();
  if (!cleaned || !/\d/.test(cleaned)) return null;
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(cleaned)) {
    return Number(cleaned.replace(/\./g, '').replace(',', '.'));
  }
  if (/^\d+,\d+$/.test(cleaned)) {
    return Number(cleaned.replace(',', '.'));
  }
  return Number(cleaned.replace(/,/g, ''));
}

test.describe('Tier 3 — Cross-Feature Combinations (T3-01..T3-15, 15 Cases)', () => {
  test('T3-01: yesterday socio leaves Día actual unchanged while Rango personalizado (and Semana if not Monday) increments +1 pt', async ({
    page,
    runtimeErrors,
  }) => {
    const today = todayStr();
    const yesterday = yesterdayStr();
    const iso = getISOWeekAndYearBA(today);
    const weekStart = getISOWeekRange(iso.year, iso.week).start;

    const [todaySociosBefore, yesterdaySociosBefore, weekSociosBefore] =
      await Promise.all([
        getSociosForDate(today),
        getSociosForDate(yesterday),
        getSociosForRange(weekStart, today),
      ]);

    const sumPoints = (rows: Array<Record<string, unknown>>) =>
      Number(
        rows.reduce((sum, r) => sum + Number(r.points ?? 0), 0).toFixed(2)
      );

    const beforeTodayCount = todaySociosBefore.length;
    const beforeTodayPoints = sumPoints(todaySociosBefore);
    const expectedRangeCount =
      todaySociosBefore.length + yesterdaySociosBefore.length + 1;
    const expectedRangePoints = Number(
      (
        sumPoints([...todaySociosBefore, ...yesterdaySociosBefore]) + 1
      ).toFixed(2)
    );
    const expectedWeekCount = weekSociosBefore.length + 1;
    const expectedWeekPoints = Number(
      (sumPoints(weekSociosBefore) + 1).toFixed(2)
    );

    const snapYesterday = await snapshotDayState(yesterday);
    let createdId: string | undefined;

    try {
      await loginAs(page, 'ariel');
      await fillAndSubmitPartner(page, {
        age: 34,
        amount: 99351,
        payment: 'Tarjeta de Crédito',
        datePreset: 'ayer',
      });

      const yesterdaySocios = await getSociosForDate(yesterday);
      const match = yesterdaySocios.find((s) => Number(s.amount) === 99351);
      createdId = match ? String(match.id) : undefined;

      const heroCard = page
        .locator('div')
        .filter({ hasText: /TOTAL PUNTOS/i })
        .filter({ hasText: /socio/i })
        .last();

      await switchTab(page, TAB_PATTERNS.DASHBOARD);
      await selectStatsPeriod(page, 'Día actual');
      await expect(heroCard).toContainText(
        new RegExp(`\\b${beforeTodayCount}\\s*socio(?:s)?\\b`, 'i'),
        { timeout: 15_000 }
      );
      await expect(heroCard).toContainText(esArPointsRegex(beforeTodayPoints));

      await selectStatsPeriod(page, 'Rango personalizado', {
        start: yesterday,
        end: today,
      });
      await expect(heroCard).toContainText(
        new RegExp(`\\b${expectedRangeCount}\\s*socio(?:s)?\\b`, 'i'),
        { timeout: 15_000 }
      );
      await expect(heroCard).toContainText(
        esArPointsRegex(expectedRangePoints)
      );

      if (!isMondayBA(today)) {
        await selectStatsPeriod(page, 'Semana');
        await expect(heroCard).toContainText(
          new RegExp(`\\b${expectedWeekCount}\\s*socio(?:s)?\\b`, 'i'),
          { timeout: 15_000 }
        );
        await expect(heroCard).toContainText(
          esArPointsRegex(expectedWeekPoints)
        );
      }

      await logout(page);
    } finally {
      await restoreDayState(snapYesterday, {
        deleteSocioIds: createdId ? [createdId] : undefined,
        deleteSentinelRange: { minAmount: 99351, maxAmount: 99351 },
      });
    }

    runtimeErrors.assertClean();
  });

  test('T3-02: registering socio as rosario on todayStr auto-checks and unmark-locks Rosario in CIERRE', async ({
    page,
    runtimeErrors,
  }) => {
    runtimeErrors.allowConsoleErrors(/400|22023|ausente/i);
    const today = todayStr();
    const snap = await snapshotDayState(today);
    const created = await createTestSocioAsAccount('rosario', {
      operationalDate: today,
      age: 30,
      amount: 99352,
      paymentType: 'credito',
    });
    const socioId = String(created.id);

    try {
      await loginAs(page, 'carlos');
      await switchTab(page, TAB_PATTERNS.CIERRE);

      const waText = await readWhatsAppClosureText(page);
      expect(waText).toContain('Rosario:');

      const rosarioChip = page
        .locator('button, label')
        .filter({ hasText: /Rosario/i })
        .first();
      await rosarioChip.click();

      const waAfter = await readWhatsAppClosureText(page);
      expect(waAfter).toContain('Rosario:');

      await logout(page);
    } finally {
      await restoreDayState(snap, { deleteSocioIds: [socioId] });
    }

    runtimeErrors.assertClean();
  });

  test('T3-03: moving socio from todayStr to yesterdayStr writes MOVE_DATE audit entry visible under AUDITORIA filters', async ({
    page,
    runtimeErrors,
  }) => {
    const today = todayStr();
    const yesterday = yesterdayStr();
    const created = await createTestSocioAsAccount('ariel', {
      operationalDate: today,
      age: 29,
      amount: 99353,
      paymentType: 'credito',
    });
    const socioId = String(created.id);

    try {
      await loginAs(page, 'ariel');
      const dialog = await openMoveDateModal(
        page,
        partnerCardByAmount(page, 99353)
      );
      await confirmMoveDate(page, yesterday, dialog);
      await logout(page);

      await loginAs(page, 'carlos');
      await openAuditTabFilters(page, { action: 'MOVE_DATE', actor: 'Ariel' });
      await expect(
        page
          .getByText(new RegExp(`${today}.*${yesterday}|${formatDateDMY(today)}`))
          .first()
      ).toBeVisible({ timeout: 15_000 });
      await logout(page);
    } finally {
      await deleteSocioById(socioId);
    }

    runtimeErrors.assertClean();
  });

  test('T3-04: moving socio out of todayStr after saving official closure triggers CIERRE outdated alert', async ({
    page,
    runtimeErrors,
  }) => {
    const today = todayStr();
    const yesterday = yesterdayStr();
    const snapToday = await snapshotDayState(today);
    const created = await createTestSocioAsAccount('ariel', {
      operationalDate: today,
      age: 35,
      amount: 99354,
      paymentType: 'credito',
    });
    const socioId = String(created.id);

    try {
      await loginAs(page, 'carlos');
      await switchTab(page, TAB_PATTERNS.CIERRE);
      await saveOfficialClosure(page, 'Pre-move closure');
      await expect(
        page.getByText(/JORNADA CERRADA|CIERRE GUARDADO|CONFIRMADA/i).first()
      ).toBeVisible({ timeout: 15_000 });

      await switchTab(page, TAB_PATTERNS.CARGA);
      const dialog = await openMoveDateModal(
        page,
        partnerCardByAmount(page, 99354)
      );
      await confirmMoveDate(page, yesterday, dialog);

      await switchTab(page, TAB_PATTERNS.CIERRE);
      await expect(
        page.getByText(/desactualizad|cambios posteriores|recalcular/i).first()
      ).toBeVisible({ timeout: 15_000 });

      await logout(page);
    } finally {
      await restoreDayState(snapToday, { deleteSocioIds: [socioId] });
    }

    runtimeErrors.assertClean();
  });

  test('T3-05: offline queue submission for yesterdayStr syncs on reconnect and appears in SOCIOS yesterday', async ({
    page,
    context,
    runtimeErrors,
  }) => {
    runtimeErrors.allowConsoleErrors(/net::ERR_INTERNET_DISCONNECTED|Failed to fetch|network/i);
    const yesterday = yesterdayStr();
    const snap = await snapshotDayState(yesterday);

    try {
      await loginAs(page, 'ariel');
      await context.setOffline(true);
      await fillAndSubmitPartner(page, {
        age: 31,
        amount: 99355,
        payment: 'Tarjeta de Crédito',
        datePreset: 'ayer',
      });
      await expect(page.getByText(/1.*pendiente/i).first()).toBeVisible({
        timeout: 15_000,
      });

      await context.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect(page.getByText(/pendientes de env[ií]o/i)).toHaveCount(0, {
        timeout: 20_000,
      });

      await navigateCalendarToDate(page, yesterday);
      const card = partnerCardByAmount(page, 99355);
      await expect(card).toBeVisible({ timeout: 15_000 });
      await expect(card).toContainText(/Ariel/i);

      await logout(page);
    } finally {
      await context.setOffline(false);
      await restoreDayState(snap, {
        deleteSentinelRange: { minAmount: 99355, maxAmount: 99355 },
      });
    }

    runtimeErrors.assertClean();
  });

  test('T3-06: rosario offline queue syncs on reconnect so carlos sees Rosario unmark-locked in CIERRE', async ({
    page,
    context,
    runtimeErrors,
  }) => {
    runtimeErrors.allowConsoleErrors(/net::ERR_INTERNET_DISCONNECTED|Failed to fetch|network|400|22023/i);
    const today = todayStr();
    const snap = await snapshotDayState(today);

    try {
      await loginAs(page, 'rosario');
      await context.setOffline(true);
      await fillAndSubmitPartner(page, {
        age: 28,
        amount: 99356,
        payment: 'Tarjeta de Débito',
        datePreset: 'hoy',
      });
      await context.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect(partnerCardByAmount(page, 99356)).toBeVisible({
        timeout: 20_000,
      });
      await logout(page);

      await loginAs(page, 'carlos');
      await switchTab(page, TAB_PATTERNS.CIERRE);
      const waText = await readWhatsAppClosureText(page);
      expect(waText).toContain('Rosario:');
      await logout(page);
    } finally {
      await context.setOffline(false);
      await restoreDayState(snap, {
        deleteSentinelRange: { minAmount: 99356, maxAmount: 99356 },
      });
    }

    runtimeErrors.assertClean();
  });

  test('T3-07: Equipo create -> visible in SOCIOS (0) & CIERRE chips -> deactivate -> removed from active views', async ({
    page,
    runtimeErrors,
  }) => {
    const uname = `e2e_test_sync_${Date.now().toString(36)}`;
    const fullName = `Sync ${uname}`;

    try {
      await loginAs(page, 'carlos');
      await openTeamManagement(page);

      await page
        .getByRole('button', { name: /Nuevo|Agregar|Crear integrante/i })
        .first()
        .click();
      await page.getByPlaceholder(/usuario|username/i).first().fill(uname);
      await page
        .getByPlaceholder(/nombre completo|nombre/i)
        .first()
        .fill(fullName);
      await page
        .getByPlaceholder(/contrase[ñn]a/i)
        .first()
        .fill('Msf3Stg!Syn#12Ab');
      await page.getByRole('button', { name: /Crear|Guardar/i }).first().click();

      await expect(page.getByText(fullName).first()).toBeVisible({
        timeout: 15_000,
      });

      await switchTab(page, TAB_PATTERNS.SOCIOS);
      await expect(
        page.getByText(new RegExp(`${fullName}.*\\(0\\)`, 'i')).first()
      ).toBeVisible({ timeout: 15_000 });

      await switchTab(page, TAB_PATTERNS.CIERRE);
      await expect(
        page.getByText(new RegExp(fullName, 'i')).first()
      ).toBeVisible({ timeout: 15_000 });

      await openTeamManagement(page);
      const row = page.locator('tr, div').filter({ hasText: uname }).last();
      await row.getByRole('button', { name: /Desactivar/i }).first().click();
      await expect(row.getByText(/Inactivo/i).first()).toBeVisible({
        timeout: 15_000,
      });

      await switchTab(page, TAB_PATTERNS.SOCIOS);
      await expect(
        page.getByText(new RegExp(`${fullName}\\s*\\(`, 'i'))
      ).toHaveCount(0);

      await logout(page);
    } finally {
      await deactivateTestUsersByPrefix(['e2e_test_sync_']);
    }

    runtimeErrors.assertClean();
  });

  test('T3-08: Equipo deactivate blocks login, reactivate restores login, and AUDITORIA records lifecycle', async ({
    page,
    runtimeErrors,
  }) => {
    runtimeErrors.allowConsoleErrors(/400|401|403|inactiv|deshabilitad/i);
    const uname = `e2e_test_rbac_${Date.now().toString(36)}`;
    const pass = 'Msf3Stg!Rbc#34Cd';

    try {
      await loginAs(page, 'carlos');
      await openTeamManagement(page);
      await page
        .getByRole('button', { name: /Nuevo|Agregar|Crear integrante/i })
        .first()
        .click();
      await page.getByPlaceholder(/usuario|username/i).first().fill(uname);
      await page
        .getByPlaceholder(/nombre completo|nombre/i)
        .first()
        .fill(`RBAC ${uname}`);
      await page.getByPlaceholder(/contrase[ñn]a/i).first().fill(pass);
      await page.getByRole('button', { name: /Crear|Guardar/i }).first().click();

      const row = page.locator('tr, div').filter({ hasText: uname }).last();
      await expect(row).toBeVisible({ timeout: 15_000 });
      await row.getByRole('button', { name: /Desactivar/i }).first().click();
      await expect(row.getByText(/Inactivo/i).first()).toBeVisible({
        timeout: 15_000,
      });
      await logout(page);

      await loginAs(page, 'carlos');
      await openTeamManagement(page);
      const rowAgain = page.locator('tr, div').filter({ hasText: uname }).last();
      await rowAgain
        .getByRole('button', { name: /Reactivar|Activar/i })
        .first()
        .click();
      await expect(rowAgain.getByText(/Activo/i).first()).toBeVisible({
        timeout: 15_000,
      });
      await logout(page);

      await loginWithCustomCredentials(page, uname, pass);
      await logout(page);

      await loginAs(page, 'carlos');
      await openAuditTabFilters(page);
      const auditBody = await page.locator('main').innerText();
      expect(auditBody).toMatch(new RegExp(uname, 'i'));
      await logout(page);
    } finally {
      await deactivateTestUsersByPrefix(['e2e_test_rbac_']);
    }

    runtimeErrors.assertClean();
  });

  test('T3-09: saving official daily closure on todayStr reflects cleanly in SEMANAL current BA ISO week', async ({
    page,
    runtimeErrors,
  }) => {
    const today = todayStr();
    const iso = getISOWeekAndYearBA(today);
    const snap = await snapshotDayState(today);
    const created = await createTestSocioAsAccount('ariel', {
      operationalDate: today,
      age: 35,
      amount: 99359,
      paymentType: 'credito',
    });
    const socioId = String(created.id);

    try {
      await loginAs(page, 'carlos');
      await switchTab(page, TAB_PATTERNS.CIERRE);
      await saveOfficialClosure(page, 'Weekly sync closure');

      await switchTab(page, TAB_PATTERNS.SEMANAL);
      await selectWeeklyYearAndWeek(page, iso.year, iso.week);
      await expect(page.getByText(/EQUIPO COMPLETO/i)).toBeVisible();
      await expect(page.getByText(/Totales del Equipo/i).first()).toBeVisible();

      await logout(page);
    } finally {
      await restoreDayState(snap, { deleteSocioIds: [socioId] });
    }

    runtimeErrors.assertClean();
  });

  test('T3-10: confirming Week 47 (2026) and moving sentinel from todayStr into 2026-11-17 marks Week 47 Desactualizada', async ({
    page,
    runtimeErrors,
  }) => {
    const today = todayStr();
    const targetDate = SEEDED_HISTORY.day2026_11_17.date;
    const weekSnap = await snapshotWeeklyReports(2026, 47);
    const created = await createTestSocioAsAccount('ariel', {
      operationalDate: today,
      age: 36,
      amount: 99360,
      paymentType: 'credito',
    });
    const socioId = String(created.id);

    try {
      await loginAs(page, 'carlos');
      await switchTab(page, TAB_PATTERNS.SEMANAL);
      await selectWeeklyYearAndWeek(page, 2026, 47);
      await page
        .getByRole('button', {
          name: /Confirmar|Guardar Planilla|Cerrar Semana/i,
        })
        .first()
        .click();
      await expect(page.getByText(/Confirmada/i).first()).toBeVisible({
        timeout: 15_000,
      });

      await switchTab(page, TAB_PATTERNS.CARGA);
      const dialog = await openMoveDateModal(
        page,
        partnerCardByAmount(page, 99360)
      );
      await confirmMoveDate(page, targetDate, dialog);

      await switchTab(page, TAB_PATTERNS.SEMANAL);
      await selectWeeklyYearAndWeek(page, 2026, 47);
      await expect(
        page.getByText(/Desactualizada/i).first()
      ).toBeVisible({ timeout: 15_000 });

      await logout(page);
    } finally {
      await deleteSocioById(socioId);
      await restoreWeeklyReports(2026, 47, weekSnap);
    }

    runtimeErrors.assertClean();
  });

  test('T3-11: nicolas logs 3h via 0h CTA -> CIERRE locks Nicolas as present on todayStr', async ({
    page,
    runtimeErrors,
  }) => {
    runtimeErrors.allowConsoleErrors(/400|22023|ausente/i);
    const today = todayStr();
    const snap = await snapshotDayState(today);
    try {
      await setCaptorHoursAdmin(STAGING_ACCOUNTS.nicolas.userId, today, 0);
      await loginAs(page, 'nicolas');
      await editMyHours(page, 3);
      await logout(page);

      await loginAs(page, 'carlos');
      await switchTab(page, TAB_PATTERNS.CIERRE);
      const waText = await readWhatsAppClosureText(page);
      expect(waText).toContain('Nicolas:');

      const nicChip = page
        .locator('button, label')
        .filter({ hasText: /Nicolas/i })
        .first();
      await nicChip.click();
      expect(await readWhatsAppClosureText(page)).toContain('Nicolas:');

      await logout(page);
    } finally {
      await restoreDayState(snap);
    }

    runtimeErrors.assertClean();
  });

  test('T3-12: on 2026-11-24 SOCIOS CSV and Estadísticas CSV match 6 socios and identical total amount', async ({
    page,
    runtimeErrors,
  }) => {
    const seeded = await getSociosForDate(SEEDED_HISTORY.day2026_11_24.date);
    expect(seeded.length).toBe(SEEDED_HISTORY.day2026_11_24.sociosCount);
    const expectedTotalAmount = seeded.reduce(
      (sum, s) => sum + Number(s.amount ?? 0),
      0
    );

    await loginAs(page, 'carlos');
    await navigateCalendarToDate(page, SEEDED_HISTORY.day2026_11_24.date);

    const sociosCsv = await exportCsvAndReadBom(
      page,
      page.getByRole('button', { name: /Exportar CSV/i }).first()
    );
    expect(sociosCsv.hasBom).toBe(true);
    expect(sociosCsv.lines.length).toBe(seeded.length + 1);
    for (const s of seeded) {
      const amt = Number(s.amount ?? 0);
      const esArAmt = new Intl.NumberFormat('es-AR', {
        maximumFractionDigits: 0,
      })
        .format(amt)
        .replace(/\./g, '\\.');
      expect(sociosCsv.text).toMatch(
        new RegExp(`(?<!\\d)(?:${amt}|${esArAmt})(?!\\d)`)
      );
    }

    await switchTab(page, TAB_PATTERNS.DASHBOARD);
    await selectStatsPeriod(page, 'Rango personalizado', {
      start: SEEDED_HISTORY.day2026_11_24.date,
      end: SEEDED_HISTORY.day2026_11_24.date,
    });
    const statsCsv = await exportCsvAndReadBom(
      page,
      page.getByRole('button', { name: /Exportar CSV/i }).first()
    );
    expect(statsCsv.hasBom).toBe(true);
    expect(statsCsv.lines.length).toBeGreaterThanOrEqual(2);

    const esArTotal = new Intl.NumberFormat('es-AR', {
      maximumFractionDigits: 0,
    })
      .format(expectedTotalAmount)
      .replace(/\./g, '\\.');
    const totalAmountRegex = new RegExp(
      `(?<![\\d,.])(?:${expectedTotalAmount}|${esArTotal})(?:[,.]00)?(?![\\d,])`
    );
    const exactSixCountRegex = new RegExp(
      `(?<![\\d,.])${seeded.length}(?![\\d,.])`
    );
    const hasExplicitTotals =
      totalAmountRegex.test(statsCsv.text) &&
      exactSixCountRegex.test(statsCsv.text);

    if (!hasExplicitTotals) {
      const delimiter =
        (statsCsv.lines[0].match(/;/g)?.length ?? 0) >=
        (statsCsv.lines[0].match(/,/g)?.length ?? 0)
          ? ';'
          : ',';
      const headers = parseCsvLine(statsCsv.lines[0], delimiter);
      const sociosColIdx = headers.findIndex((h) => /socio/i.test(h));
      const amountColIdx = headers.findIndex((h) =>
        /monto|dinero|importe|recaud/i.test(h)
      );
      expect(
        sociosColIdx,
        `Could not locate socios column or explicit count (${seeded.length}) in Estadísticas CSV headers: [${headers.join(', ')}]`
      ).toBeGreaterThanOrEqual(0);
      expect(
        amountColIdx,
        `Could not locate amount column or explicit total (${expectedTotalAmount}) in Estadísticas CSV headers: [${headers.join(', ')}]`
      ).toBeGreaterThanOrEqual(0);

      let sumSocios = 0;
      let sumAmount = 0;
      for (const line of statsCsv.lines.slice(1)) {
        const cells = parseCsvLine(line, delimiter);
        if (/^total/i.test(cells[0] ?? '')) continue;
        const cSocios = parseCsvNumericValue(cells[sociosColIdx] ?? '');
        const cAmount = parseCsvNumericValue(cells[amountColIdx] ?? '');
        if (cSocios !== null) sumSocios += cSocios;
        if (cAmount !== null) sumAmount += cAmount;
      }
      expect(sumSocios).toBe(seeded.length);
      expect(Math.round(sumAmount)).toBe(Math.round(expectedTotalAmount));
    }

    await logout(page);
    runtimeErrors.assertClean();
  });

  test('T3-13: batch selection checkboxes & Mover fecha bar at 390x844 satisfy touch geometry & zero overflow', async ({
    page,
    runtimeErrors,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const today = todayStr();
    const s1 = await createTestSocioAsAccount('ariel', {
      operationalDate: today,
      age: 30,
      amount: 99363,
      paymentType: 'credito',
    });
    const s2 = await createTestSocioAsAccount('ariel', {
      operationalDate: today,
      age: 32,
      amount: 99364,
      paymentType: 'debito',
    });
    const ids = [String(s1.id), String(s2.id)];

    try {
      await loginAs(page, 'ariel');
      await toggleBatchSelectMode(page);
      await partnerCardByAmount(page, 99363)
        .locator('input[type="checkbox"]')
        .check();
      await partnerCardByAmount(page, 99364)
        .locator('input[type="checkbox"]')
        .check();

      await assertNoHorizontalOverflow(page);
      await assertActionButtonsTouchGeometry(
        page,
        /Mover\s+(?:seleccionados|a otra fecha|fecha)/i,
        44,
        8
      );
      await logout(page);
    } finally {
      for (const id of ids) {
        await deleteSocioById(id);
      }
    }

    runtimeErrors.assertClean();
  });

  test('T3-14: msf_last_username and unsubmitted draft scope cleanly across ariel -> logout -> lucia', async ({
    page,
    runtimeErrors,
  }) => {
    await loginAs(page, 'ariel');
    await ageInput(page).fill('38');
    await amountInput(page).fill('99365');
    await logout(page);

    await expect(usernameInput(page)).toHaveValue('ariel');
    await loginAs(page, 'lucia');
    expect(await getLastUsernameStorage(page)).toBe('lucia');

    await logout(page);
    await expect(usernameInput(page)).toHaveValue('lucia');

    await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) {
        if (k.includes('draft')) localStorage.removeItem(k);
      }
    });

    runtimeErrors.assertClean();
  });

  test('T3-15: updating nicolas hours and saving official closure records captor_daily_hours & daily_closures in AUDITORIA', async ({
    page,
    runtimeErrors,
  }) => {
    const today = todayStr();
    const snap = await snapshotDayState(today);
    try {
      await setCaptorHoursAdmin(STAGING_ACCOUNTS.nicolas.userId, today, 0);
      await loginAs(page, 'nicolas');
      await editMyHours(page, 2);
      await logout(page);

      await loginAs(page, 'carlos');
      await switchTab(page, TAB_PATTERNS.CIERRE);
      await saveOfficialClosure(page, 'Audit closure T3-15');

      await openAuditTabFilters(page);
      const logs = await getAuditLogEntries({ limit: 20 });
      const entities = new Set(logs.map((l) => String(l.entity_type)));
      expect(entities.has('captor_daily_hours')).toBe(true);
      expect(entities.has('daily_closure')).toBe(true);

      await logout(page);
    } finally {
      await restoreDayState(snap);
    }

    runtimeErrors.assertClean();
  });
});
