import {
  attachRuntimeErrorTracker,
  createStagingContext,
  expect,
  test,
} from '../fixtures/test.ts';
import {
  TAB_PATTERNS,
  attemptLoginWithCredentials,
  loginAs,
  loginWithCustomCredentials,
  logout,
  navTab,
  switchTab,
} from '../helpers/auth.ts';
import {
  assertActionButtonsTouchGeometry,
  assertNoHorizontalOverflow,
  assertScrollResetsOnTabSwitch,
  assertTabsAccessibleAndUnclipped,
} from '../helpers/layoutAssertions.ts';
import {
  createTestSocioAsAccount,
  deactivateTestUsersByPrefix,
  deleteSocioById,
  deleteTestSociosBySentinel,
  getJwtForAccount,
  restoreDayState,
  restoreWeeklyReports,
  setCaptorHoursAdmin,
  snapshotDayState,
  snapshotWeeklyReports,
} from '../helpers/stagingCleanup.ts';
import {
  SEEDED_HISTORY,
  STAGING_ACCOUNTS,
  STAGING_SUPABASE_ANON_KEY,
  STAGING_SUPABASE_URL,
  getISOWeekAndYearBA,
  makeTestTag,
  todayStr,
  tomorrowStr,
  yesterdayStr,
} from '../helpers/stagingEnv.ts';
import {
  auditActionBadge,
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
  selectStatsCollector,
  selectStatsPeriod,
  selectWeeklyYearAndWeek,
  toggleBatchSelectMode,
} from '../helpers/uiActions.ts';

test.describe('Tier 4 — End-to-End Multi-Role Scenarios (T4-01..T4-08, 8 Cases)', () => {
  test('T4-01: ariel mobile shift across today + yesterday with offline queue, edit, Estadísticas & SOCIOS', async ({
    page,
    context,
    runtimeErrors,
  }) => {
    runtimeErrors.allowConsoleErrors(/net::ERR_INTERNET_DISCONNECTED|Failed to fetch|network/i);
    await page.setViewportSize({ width: 390, height: 844 });
    const today = todayStr();
    const yesterday = yesterdayStr();
    const snapToday = await snapshotDayState(today);
    const snapYesterday = await snapshotDayState(yesterday);

    try {
      await loginAs(page, 'ariel');
      await editMyHours(page, 4);

      await context.setOffline(true);
      await fillAndSubmitPartner(page, {
        age: 30,
        amount: 99451,
        payment: 'Tarjeta de Crédito',
        datePreset: 'hoy',
      });
      await fillAndSubmitPartner(page, {
        age: 34,
        amount: 99452,
        payment: 'Tarjeta de Débito',
        datePreset: 'ayer',
      });
      await expect(page.getByText(/2.*pendiente/i).first()).toBeVisible({
        timeout: 15_000,
      });

      await context.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect(partnerCardByAmount(page, 99451)).toBeVisible({
        timeout: 20_000,
      });

      await partnerCardByAmount(page, 99451)
        .getByRole('button', { name: /Editar|Modificar/i })
        .first()
        .click();
      const editBox = page.locator('div').filter({ hasText: /Editando Socio/i }).last();
      await editBox.locator('input[type="number"]').nth(1).fill('99453');
      await editBox.getByRole('button', { name: /Guardar cambios/i }).click();
      await expect(partnerCardByAmount(page, 99453)).toBeVisible({
        timeout: 15_000,
      });

      await switchTab(page, TAB_PATTERNS.DASHBOARD);
      await selectStatsPeriod(page, 'Rango personalizado', {
        start: yesterday,
        end: today,
      });
      await expect(page.getByText(/1,7\s*pts/i).first()).toBeVisible({
        timeout: 15_000,
      });

      await navigateCalendarToDate(page, yesterday);
      await expect(partnerCardByAmount(page, 99452)).toBeVisible({
        timeout: 15_000,
      });

      await logout(page);
    } finally {
      await context.setOffline(false);
      await restoreDayState(snapToday, {
        deleteSentinelRange: { minAmount: 99451, maxAmount: 99453 },
      });
      await restoreDayState(snapYesterday, {
        deleteSentinelRange: { minAmount: 99451, maxAmount: 99453 },
      });
    }

    runtimeErrors.assertClean();
  });

  test('T4-02: carlos batch-moves 2 sentinels (incl. 0h warning for nicolas) to yesterdayStr, verifies AUDITORIA MOVE_DATE, saves CIERRE & copies WhatsApp', async ({
    page,
    context,
    runtimeErrors,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const today = todayStr();
    const yesterday = yesterdayStr();
    const snapToday = await snapshotDayState(today);
    const snapYesterday = await snapshotDayState(yesterday);

    const s1 = await createTestSocioAsAccount('ariel', {
      operationalDate: today,
      age: 31,
      amount: 99461,
      paymentType: 'credito',
    });
    const s2 = await createTestSocioAsAccount('nicolas', {
      operationalDate: today,
      age: 29,
      amount: 99462,
      paymentType: 'debito',
    });
    const ids = [String(s1.id), String(s2.id)];

    try {
      await setCaptorHoursAdmin(STAGING_ACCOUNTS.nicolas.userId, yesterday, 0);
      await loginAs(page, 'carlos');

      await toggleBatchSelectMode(page);
      await partnerCardByAmount(page, 99461)
        .locator('input[type="checkbox"]')
        .check();
      await partnerCardByAmount(page, 99462)
        .locator('input[type="checkbox"]')
        .check();

      const dialog = await openMoveDateModal(page);
      await dialog.locator('input[type="date"]').first().fill(yesterday);
      await expect(dialog.getByText(/Nicolas/i).first()).toBeVisible({
        timeout: 10_000,
      });
      await confirmMoveDate(page, yesterday, dialog);

      await openAuditTabFilters(page, { action: 'MOVE_DATE' });
      await expect(auditActionBadge(page, /\bMOVE_DATE\b/i)).toBeVisible({
        timeout: 15_000,
      });

      await switchTab(page, TAB_PATTERNS.CIERRE);
      const note = makeTestTag('T402');
      await saveOfficialClosure(page, note);
      await page.getByRole('button', { name: /Copiar Resumen/i }).click();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(copied).toContain('RESUMEN GENERAL');

      await logout(page);
    } finally {
      await restoreDayState(snapToday, { deleteSocioIds: ids });
      await restoreDayState(snapYesterday);
    }

    runtimeErrors.assertClean();
  });

  test('T4-03: carlos navigates current ISO week, 2027 W1, 2026 W47 confirm -> outdated -> re-confirm -> CSV & WhatsApp', async ({
    page,
    context,
    runtimeErrors,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const currentIso = getISOWeekAndYearBA(todayStr());
    const week47Snap = await snapshotWeeklyReports(2026, 47);
    let createdId: string | undefined;

    try {
      await loginAs(page, 'carlos');
      await switchTab(page, TAB_PATTERNS.SEMANAL);
      await selectWeeklyYearAndWeek(page, currentIso.year, currentIso.week);
      await expect(page.getByText(/EQUIPO COMPLETO/i)).toBeVisible();

      await selectWeeklyYearAndWeek(page, 2027, 1);
      await expect(page.getByText(/Totales del Equipo/i).first()).toBeVisible();

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

      const created = await createTestSocioAsAccount('ariel', {
        operationalDate: SEEDED_HISTORY.day2026_11_17.date,
        age: 37,
        amount: 99471,
        paymentType: 'credito',
      });
      createdId = String(created.id);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await switchTab(page, TAB_PATTERNS.SEMANAL);
      await selectWeeklyYearAndWeek(page, 2026, 47);
      await expect(
        page.getByText(/Desactualizada/i).first()
      ).toBeVisible({ timeout: 15_000 });

      await page
        .getByRole('button', {
          name: /Recalcular|Confirmar|Guardar Planilla/i,
        })
        .first()
        .click();
      await expect(page.getByText(/Confirmada/i).first()).toBeVisible({
        timeout: 15_000,
      });

      const csv = await exportCsvAndReadBom(
        page,
        page.getByRole('button', { name: /Exportar CSV/i }).first()
      );
      expect(csv.hasBom).toBe(true);

      await page
        .getByRole('button', { name: /Copiar.*WhatsApp|Copiar Resumen/i })
        .first()
        .click();
      const wa = await page.evaluate(() => navigator.clipboard.readText());
      expect(wa).toMatch(/SEMANA\s+47/i);

      await logout(page);
    } finally {
      if (createdId) {
        await deleteSocioById(createdId);
      }
      await restoreWeeklyReports(2026, 47, week47Snap);
    }

    runtimeErrors.assertClean();
  });

  test('T4-04: full user lifecycle (create, mobile socio, SOCIOS/CIERRE, reset_password, mobile login, deactivate, audit)', async ({
    page,
    runtimeErrors,
  }) => {
    runtimeErrors.allowConsoleErrors(/400|401|403|inactiv|deshabilitad/i);
    const uname = `e2e_life_${Date.now().toString(36)}`;
    const pass1 = 'Msf3Stg!Lif#11Aa';
    const pass2 = 'Msf3Stg!Lif#22Bb';
    const fullName = `Life ${uname}`;
    const today = todayStr();
    const snapToday = await snapshotDayState(today);

    try {
      await page.setViewportSize({ width: 1280, height: 800 });
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
      await page.getByPlaceholder(/contrase[ñn]a/i).first().fill(pass1);
      await page.getByRole('button', { name: /Crear|Guardar/i }).first().click();

      const row = page.locator('tr, div').filter({ hasText: uname }).last();
      await expect(row).toBeVisible({ timeout: 15_000 });
      await logout(page);

      await page.setViewportSize({ width: 390, height: 844 });
      await loginWithCustomCredentials(page, uname, pass1);
      await fillAndSubmitPartner(page, {
        age: 30,
        amount: 99481,
        payment: 'Tarjeta de Crédito',
        datePreset: 'hoy',
      });
      await expect(partnerCardByAmount(page, 99481)).toBeVisible({
        timeout: 15_000,
      });

      await switchTab(page, TAB_PATTERNS.SOCIOS);
      await expect(
        page.getByText(new RegExp(`${fullName}\\s*\\(1\\)`, 'i')).first()
      ).toBeVisible();
      await switchTab(page, TAB_PATTERNS.CIERRE);
      expect(await readWhatsAppClosureText(page)).toContain(`${fullName}:`);
      await logout(page);

      await page.setViewportSize({ width: 1280, height: 800 });
      await loginAs(page, 'carlos');
      await openTeamManagement(page);
      const lifeRow = page.locator('tr, div').filter({ hasText: uname }).last();
      await lifeRow
        .getByRole('button', { name: /Restablecer|Clave|Contrase[ñn]a/i })
        .first()
        .click();
      await page
        .getByPlaceholder(/nueva contrase[ñn]a|contrase[ñn]a/i)
        .last()
        .fill(pass2);
      await page
        .getByRole('button', { name: /Confirmar|Guardar|Restablecer/i })
        .last()
        .click();
      await logout(page);

      await page.setViewportSize({ width: 390, height: 844 });
      await loginWithCustomCredentials(page, uname, pass2);
      await logout(page);

      await page.setViewportSize({ width: 1280, height: 800 });
      await loginAs(page, 'carlos');
      await openTeamManagement(page);
      const deactRow = page.locator('tr, div').filter({ hasText: uname }).last();
      await deactRow.getByRole('button', { name: /Desactivar/i }).first().click();
      await expect(deactRow.getByText(/Inactivo/i).first()).toBeVisible({
        timeout: 15_000,
      });
      await openAuditTabFilters(page);
      await expect(page.getByText(new RegExp(uname, 'i')).first()).toBeVisible({
        timeout: 15_000,
      });
      await logout(page);

      await attemptLoginWithCredentials(page, uname, pass2);
      await expect(
        page.getByText(/inactiv|deshabilitad|no est[aá] habilitad/i).first()
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await restoreDayState(snapToday, {
        deleteSentinelRange: { minAmount: 99481, maxAmount: 99481 },
      });
      await deactivateTestUsersByPrefix(['e2e_life_']);
    }

    runtimeErrors.assertClean();
  });

  test('T4-05: complete mobile (390x844) geometry sweep across all 5 captador & 7 admin tabs', async ({
    page,
    runtimeErrors,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const today = todayStr();
    const s1 = await createTestSocioAsAccount('ariel', {
      operationalDate: today,
      age: 30,
      amount: 99491,
      paymentType: 'credito',
    });
    const s2 = await createTestSocioAsAccount('lucia', {
      operationalDate: today,
      age: 31,
      amount: 99492,
      paymentType: 'debito',
    });
    const ids = [String(s1.id), String(s2.id)];

    try {
      await loginAs(page, 'ariel');
      const captadorTabs = [
        TAB_PATTERNS.CARGA,
        TAB_PATTERNS.DASHBOARD,
        TAB_PATTERNS.SOCIOS,
        TAB_PATTERNS.CIERRE,
        TAB_PATTERNS.SEMANAL,
      ];
      await assertTabsAccessibleAndUnclipped(page, captadorTabs);
      for (const tab of captadorTabs) {
        await switchTab(page, tab);
        await assertNoHorizontalOverflow(page);
      }
      await switchTab(page, TAB_PATTERNS.CARGA);
      await assertActionButtonsTouchGeometry(
        page,
        /editar|modificar(?:\s+socio)?|eliminar|mover(?:\s+fecha)?/i,
        44,
        8
      );
      await assertScrollResetsOnTabSwitch(
        page,
        navTab(page, TAB_PATTERNS.SOCIOS)
      );
      await logout(page);

      await loginAs(page, 'carlos');
      const adminTabs = [
        ...captadorTabs,
        TAB_PATTERNS.EQUIPO,
        TAB_PATTERNS.AUDITORIA,
      ];
      await assertTabsAccessibleAndUnclipped(page, adminTabs);
      for (const tab of [TAB_PATTERNS.EQUIPO, TAB_PATTERNS.AUDITORIA]) {
        await switchTab(page, tab);
        await assertNoHorizontalOverflow(page);
      }
      await logout(page);
    } finally {
      for (const id of ids) {
        await deleteSocioById(id);
      }
    }

    runtimeErrors.assertClean();
  });

  test('T4-06: dual-session Realtime closure recovery (carlos closes -> ariel adds socio -> carlos sees Realtime outdated & re-saves)', async ({
    browser,
    baseURL,
  }) => {
    const today = todayStr();
    const snap = await snapshotDayState(today);
    const seed = await createTestSocioAsAccount('ariel', {
      operationalDate: today,
      age: 30,
      amount: 99495,
      paymentType: 'credito',
    });
    const ids = [String(seed.id)];

    const adminCtx = await createStagingContext(browser, baseURL, {
      viewport: { width: 1280, height: 800 },
    });
    const captorCtx = await createStagingContext(browser, baseURL, {
      viewport: { width: 1280, height: 800 },
    });

    const adminPage = await adminCtx.newPage();
    const captorPage = await captorCtx.newPage();
    const adminRuntimeErrors = attachRuntimeErrorTracker(adminPage);
    const captorRuntimeErrors = attachRuntimeErrorTracker(captorPage);

    try {
      await loginAs(adminPage, 'carlos');
      await switchTab(adminPage, TAB_PATTERNS.CIERRE);
      await saveOfficialClosure(adminPage, 'Initial dual-session closure');
      await expect(
        adminPage
          .getByText(/JORNADA CERRADA|CIERRE GUARDADO|CONFIRMADA/i)
          .first()
      ).toBeVisible({ timeout: 15_000 });

      await loginAs(captorPage, 'ariel');
      await fillAndSubmitPartner(captorPage, {
        age: 33,
        amount: 99496,
        payment: 'Tarjeta de Crédito',
        datePreset: 'hoy',
      });
      await expect(partnerCardByAmount(captorPage, 99496)).toBeVisible({
        timeout: 15_000,
      });

      await expect(
        adminPage
          .getByText(/desactualizad|cambios posteriores|recalcular/i)
          .first()
      ).toBeVisible({ timeout: 20_000 });

      await saveOfficialClosure(adminPage, 'Updated dual-session closure');
      await expect(adminPage.getByText(/desactualizad/i)).toHaveCount(0, {
        timeout: 15_000,
      });

      await logout(captorPage);
      await logout(adminPage);
    } finally {
      await adminCtx.close();
      await captorCtx.close();
      await restoreDayState(snap, {
        deleteSocioIds: ids,
        deleteSentinelRange: { minAmount: 99495, maxAmount: 99496 },
      });
    }

    adminRuntimeErrors.assertClean();
    captorRuntimeErrors.assertClean();
  });

  test('T4-07: nicolas logs 5h via CTA on yesterdayStr, registers sentinel, and verifies Estadísticas & both CSV exports', async ({
    page,
    runtimeErrors,
  }) => {
    const yesterday = yesterdayStr();
    const snap = await snapshotDayState(yesterday);

    try {
      await setCaptorHoursAdmin(STAGING_ACCOUNTS.nicolas.userId, yesterday, 0);
      await loginAs(page, 'nicolas');

      await fillAndSubmitPartner(page, {
        age: 35,
        amount: 99497,
        payment: 'Tarjeta de Crédito',
        datePreset: 'ayer',
      });
      await expect(
        page.getByText(/figuran en 0|0\s*h/i).first()
      ).toBeVisible({ timeout: 15_000 });
      await editMyHours(page, 5);

      await switchTab(page, TAB_PATTERNS.DASHBOARD);
      await selectStatsPeriod(page, 'Rango personalizado', {
        start: yesterday,
        end: yesterday,
      });
      await selectStatsCollector(page, 'Nicolas');

      const dashText = await page.locator('main').innerText();
      expect(dashText).toMatch(/\b1\s*pt\b/i);
      expect(dashText).toMatch(/\b5\b/);

      const statsCsv = await exportCsvAndReadBom(
        page,
        page.getByRole('button', { name: /Exportar CSV/i }).first()
      );
      expect(statsCsv.hasBom).toBe(true);

      await navigateCalendarToDate(page, yesterday);
      const sociosCsv = await exportCsvAndReadBom(
        page,
        page.getByRole('button', { name: /Exportar CSV/i }).first()
      );
      expect(sociosCsv.hasBom).toBe(true);

      await logout(page);
    } finally {
      await restoreDayState(snap, {
        deleteSentinelRange: { minAmount: 99497, maxAmount: 99497 },
      });
    }

    runtimeErrors.assertClean();
  });

  test('T4-08: non-admin RBAC adversarial walkthrough across UI, foreign socios, REST, Edge Function & future dates', async ({
    page,
    runtimeErrors,
  }) => {
    const today = todayStr();
    const tomorrow = tomorrowStr();
    const yesterday = yesterdayStr();
    const foreign = await createTestSocioAsAccount('lucia', {
      operationalDate: today,
      age: 31,
      amount: 99498,
      paymentType: 'credito',
    });
    const foreignId = String(foreign.id);

    try {
      await loginAs(page, 'ariel');
      await expect(navTab(page, TAB_PATTERNS.EQUIPO)).toHaveCount(0);
      await expect(navTab(page, TAB_PATTERNS.AUDITORIA)).toHaveCount(0);

      const foreignCard = partnerCardByAmount(page, 99498);
      await expect(foreignCard).toBeVisible({ timeout: 15_000 });
      await expect(
        foreignCard.getByRole('button', {
          name: /Mover|Editar|Modificar|Eliminar/i,
        })
      ).toHaveCount(0);

      const { access_token } = await getJwtForAccount(
        STAGING_ACCOUNTS.ariel.email,
        STAGING_ACCOUNTS.ariel.password
      );

      // Foreign move probe
      const moveRes = await fetch(
        `${STAGING_SUPABASE_URL}/rest/v1/socios?id=eq.${foreignId}`,
        {
          method: 'PATCH',
          headers: {
            apikey: STAGING_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ operational_date: yesterday }),
        }
      );
      expect(moveRes.ok).toBe(false);

      // Future date probe
      const futureRes = await fetch(`${STAGING_SUPABASE_URL}/rest/v1/socios`, {
        method: 'POST',
        headers: {
          apikey: STAGING_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operational_date: tomorrow,
          age: 30,
          amount: 99499,
          payment_method_id: 'credito',
        }),
      });
      expect(futureRes.ok).toBe(false);

      // Edge Function non-admin probe
      const edgeRes = await fetch(
        `${STAGING_SUPABASE_URL}/functions/v1/admin-team-manager`,
        {
          method: 'POST',
          headers: {
            apikey: STAGING_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'update_member',
            user_id: STAGING_ACCOUNTS.lucia.userId,
            is_active: false,
          }),
        }
      );
      expect([401, 403]).toContain(edgeRes.status);

      // Attendance unmark with socio probe on 2026-11-24
      const attRes = await fetch(
        `${STAGING_SUPABASE_URL}/rest/v1/daily_attendance`,
        {
          method: 'POST',
          headers: {
            apikey: STAGING_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            operational_date: SEEDED_HISTORY.day2026_11_24.date,
            user_id: STAGING_ACCOUNTS.ariel.userId,
            is_present: false,
          }),
        }
      );
      expect(attRes.ok).toBe(false);

      await logout(page);
    } finally {
      await deleteSocioById(foreignId);
      await deleteTestSociosBySentinel(99499, 99499);
    }

    runtimeErrors.assertClean();
  });
});
