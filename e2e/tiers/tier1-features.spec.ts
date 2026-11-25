import { test, expect } from '../fixtures/test.ts';
import {
  TAB_PATTERNS,
  attemptLoginWithCredentials,
  getLastUsernameStorage,
  gotoApp,
  loginAs,
  loginWithCustomCredentials,
  logout,
  navTab,
  passwordInput,
  submitLoginButton,
  switchTab,
  usernameInput,
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
  getSociosForDate,
  restoreDayState,
  restoreWeeklyReports,
  setCaptorHoursAdmin,
  snapshotDayState,
  snapshotWeeklyReports,
} from '../helpers/stagingCleanup.ts';
import {
  ACTIVE_CAPTADOR_NAMES,
  SEEDED_HISTORY,
  STAGING_ACCOUNTS,
  formatDateDMY,
  formatShortDM,
  getISOWeekAndYearBA,
  makeTestTag,
  todayStr,
  yesterdayStr,
} from '../helpers/stagingEnv.ts';
import {
  ageInput,
  amountInput,
  auditActionBadge,
  confirmMoveDate,
  editMyHours,
  exportCsvAndReadBom,
  fillAndSubmitPartner,
  formatEsArThousands,
  navigateCalendarToDate,
  openAuditTabFilters,
  openMoveDateModal,
  openTeamManagement,
  partnerCardByAmount,
  readWhatsAppClosureText,
  saveOfficialClosure,
  selectPartnerDate,
  selectStatsCollector,
  selectStatsPeriod,
  selectWeeklyYearAndWeek,
  toggleBatchSelectMode,
} from '../helpers/uiActions.ts';

test.describe('Tier 1 — Core Features (F1–F11, 58 Cases)', () => {
  // =========================================================================
  // F1: Authentication & Last Username Persistence (5)
  // =========================================================================
  test.describe('F1 — Authentication & Last Username', () => {
    test('T1-F1-01: captador login lands on CARGA with 5 tabs and hides admin tabs', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');

      await expect(page.getByText(/REGISTRAR NUEVO SOCIO/i)).toBeVisible();
      await expect(navTab(page, TAB_PATTERNS.CARGA)).toBeVisible();
      await expect(navTab(page, TAB_PATTERNS.DASHBOARD)).toBeVisible();
      await expect(navTab(page, TAB_PATTERNS.SOCIOS)).toBeVisible();
      await expect(navTab(page, TAB_PATTERNS.CIERRE)).toBeVisible();
      await expect(navTab(page, TAB_PATTERNS.SEMANAL)).toBeVisible();

      await expect(navTab(page, TAB_PATTERNS.EQUIPO)).toHaveCount(0);
      await expect(navTab(page, TAB_PATTERNS.AUDITORIA)).toHaveCount(0);

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T1-F1-02: admin login exposes all 7 tabs including EQUIPO and AUDITORIA', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'carlos');

      const allTabs = [
        TAB_PATTERNS.CARGA,
        TAB_PATTERNS.DASHBOARD,
        TAB_PATTERNS.SOCIOS,
        TAB_PATTERNS.CIERRE,
        TAB_PATTERNS.SEMANAL,
        TAB_PATTERNS.EQUIPO,
        TAB_PATTERNS.AUDITORIA,
      ];
      for (const tab of allTabs) {
        await expect(navTab(page, tab)).toBeVisible();
      }

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T1-F1-03: login page renders zero hardcoded quick-fill team name buttons', async ({
      page,
      runtimeErrors,
    }) => {
      await gotoApp(page);
      await expect(usernameInput(page)).toBeVisible({ timeout: 15_000 });
      await expect(passwordInput(page)).toBeVisible();

      const quickFillButtons = page.getByRole('button', {
        name: /^(Ariel|Lucia|Emilce|Selena|Brenda|Rosario|Nicolas|Carlos(?:\s+Diaz)?)$/i,
      });
      await expect(quickFillButtons).toHaveCount(0);

      runtimeErrors.assertClean();
    });

    test('T1-F1-04: msf_last_username persists lucia across logout and page reload', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'lucia');
      expect(await getLastUsernameStorage(page)).toBe('lucia');

      await logout(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(usernameInput(page)).toBeVisible({ timeout: 15_000 });
      await expect(usernameInput(page)).toHaveValue('lucia');

      runtimeErrors.assertClean();
    });

    test('T1-F1-05: session persists across reload and clean logout retains msf_last_username', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('header').getByText(/Ariel/i)).toBeVisible({
        timeout: 15_000,
      });

      await logout(page);
      await expect(usernameInput(page)).toHaveValue('ariel');
      expect(await getLastUsernameStorage(page)).toBe('ariel');

      runtimeErrors.assertClean();
    });
  });

  // =========================================================================
  // F2: Responsive Mobile & Desktop Layout, Tabs, Scroll, Touch (5)
  // =========================================================================
  test.describe('F2 — Responsive Layout, Tabs, Scroll & Touch Geometry', () => {
    test('T1-F2-01: zero horizontal overflow and valid viewport meta across all 5 captador tabs at 390x844', async ({
      page,
      runtimeErrors,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await loginAs(page, 'ariel');

      for (const tab of [
        TAB_PATTERNS.CARGA,
        TAB_PATTERNS.DASHBOARD,
        TAB_PATTERNS.SOCIOS,
        TAB_PATTERNS.CIERRE,
        TAB_PATTERNS.SEMANAL,
      ]) {
        await switchTab(page, tab);
        await assertNoHorizontalOverflow(page);
      }

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T1-F2-02: zero horizontal overflow across admin tabs EQUIPO and AUDITORIA at 390x844', async ({
      page,
      runtimeErrors,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await loginAs(page, 'carlos');

      await openTeamManagement(page);
      await assertNoHorizontalOverflow(page);

      await openAuditTabFilters(page);
      await assertNoHorizontalOverflow(page);

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T1-F2-03: all navigation tabs are accessible and unclipped for captador and admin', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');
      await assertTabsAccessibleAndUnclipped(page, [
        TAB_PATTERNS.CARGA,
        TAB_PATTERNS.DASHBOARD,
        TAB_PATTERNS.SOCIOS,
        TAB_PATTERNS.CIERRE,
        TAB_PATTERNS.SEMANAL,
      ]);
      await logout(page);

      await loginAs(page, 'carlos');
      await assertTabsAccessibleAndUnclipped(page, [
        TAB_PATTERNS.CARGA,
        TAB_PATTERNS.DASHBOARD,
        TAB_PATTERNS.SOCIOS,
        TAB_PATTERNS.CIERRE,
        TAB_PATTERNS.SEMANAL,
        TAB_PATTERNS.EQUIPO,
        TAB_PATTERNS.AUDITORIA,
      ]);
      await logout(page);

      runtimeErrors.assertClean();
    });

    test('T1-F2-04: switching tabs resets window and main scroll position to 0', async ({
      page,
      runtimeErrors,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const today = todayStr();
      const createdIds: string[] = [];
      try {
        for (let i = 0; i < 3; i++) {
          const row = await createTestSocioAsAccount('ariel', {
            operationalDate: today,
            age: 30 + i,
            amount: 99201 + i,
            paymentType: 'credito',
          });
          createdIds.push(String(row.id));
        }

        await loginAs(page, 'ariel');
        await expect(partnerCardByAmount(page, 99203)).toBeVisible({
          timeout: 15_000,
        });

        await assertScrollResetsOnTabSwitch(
          page,
          navTab(page, TAB_PATTERNS.DASHBOARD)
        );
        await assertScrollResetsOnTabSwitch(
          page,
          navTab(page, TAB_PATTERNS.SOCIOS)
        );
        await assertScrollResetsOnTabSwitch(
          page,
          navTab(page, TAB_PATTERNS.CARGA)
        );
        await logout(page);
      } finally {
        for (const id of createdIds) {
          await deleteSocioById(id);
        }
      }

      runtimeErrors.assertClean();
    });

    test('T1-F2-05: action buttons satisfy >=44x44px touch target and >=8px spacing at 390x844', async ({
      page,
      runtimeErrors,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const today = todayStr();
      const createdIds: string[] = [];
      try {
        for (let i = 0; i < 2; i++) {
          const row = await createTestSocioAsAccount('ariel', {
            operationalDate: today,
            age: 28 + i,
            amount: 99210 + i,
            paymentType: 'debito',
          });
          createdIds.push(String(row.id));
        }

        await loginAs(page, 'ariel');
        await expect(partnerCardByAmount(page, 99210)).toBeVisible({
          timeout: 15_000,
        });

        const cargaActionCount = await assertActionButtonsTouchGeometry(
          page,
          /editar|modificar(?:\s+socio)?|eliminar|mover(?:\s+fecha)?/i,
          44,
          8
        );
        expect(cargaActionCount).toBeGreaterThanOrEqual(4);

        await switchTab(page, TAB_PATTERNS.DASHBOARD);
        await assertActionButtonsTouchGeometry(page, /Editar horas/i, 44, 8);

        await logout(page);
      } finally {
        for (const id of createdIds) {
          await deleteSocioById(id);
        }
      }

      runtimeErrors.assertClean();
    });
  });

  // =========================================================================
  // F3: Partner Registration (Hoy, Ayer, Otra fecha, 0h CTA) (6)
  // =========================================================================
  test.describe('F3 — Partner Registration & Date Presets', () => {
    test('T1-F3-01: register sentinel socio on Hoy as ariel increments list and shows 1 pt', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      const initialCount = (await getSociosForDate(today)).length;
      try {
        await loginAs(page, 'ariel');
        await fillAndSubmitPartner(page, {
          age: 34,
          amount: 99301,
          payment: 'Tarjeta de Crédito',
          datePreset: 'hoy',
        });

        const card = partnerCardByAmount(page, 99301);
        await expect(card).toBeVisible({ timeout: 15_000 });
        await expect(card).toContainText('34 años');
        await expect(card).toContainText(/1(?:[,.]0+)?\s*pt\b/i);
        await expect(
          page.getByRole('heading', {
            name: new RegExp(`SOCIOS CARGADOS HOY \\(${initialCount + 1}\\)`, 'i'),
          })
        ).toBeVisible();

        await logout(page);
      } finally {
        await deleteTestSociosBySentinel(99301, 99301);
      }

      runtimeErrors.assertClean();
    });

    test('T1-F3-02: register sentinel socio on Ayer shows amber banner and persists in SOCIOS', async ({
      page,
      runtimeErrors,
    }) => {
      const yesterday = yesterdayStr();
      const snap = await snapshotDayState(yesterday);
      try {
        await loginAs(page, 'ariel');
        await selectPartnerDate(page, 'ayer');
        await expect(
          page.getByText(new RegExp(formatShortDM(yesterday)))
        ).toBeVisible({ timeout: 10_000 });

        await fillAndSubmitPartner(page, {
          age: 29,
          amount: 99302,
          payment: 'Tarjeta de Débito',
        });

        await navigateCalendarToDate(page, yesterday);
        await expect(partnerCardByAmount(page, 99302)).toBeVisible({
          timeout: 15_000,
        });

        await logout(page);
      } finally {
        await restoreDayState(snap, {
          deleteSentinelRange: { minAmount: 99302, maxAmount: 99302 },
        });
      }

      runtimeErrors.assertClean();
    });

    test('T1-F3-03: admin registers socio on Otra fecha (2026-11-17) with amber past-date banner', async ({
      page,
      runtimeErrors,
    }) => {
      const targetDate = SEEDED_HISTORY.day2026_11_17.date;
      const snap = await snapshotDayState(targetDate);
      try {
        await loginAs(page, 'carlos');
        await selectPartnerDate(page, 'otra', targetDate);
        await expect(
          page.getByText(new RegExp(formatShortDM(targetDate)))
        ).toBeVisible({ timeout: 10_000 });

        await fillAndSubmitPartner(page, {
          age: 41,
          amount: 99303,
          payment: 'CBU Bancario',
        });

        await navigateCalendarToDate(page, targetDate);
        await expect(partnerCardByAmount(page, 99303)).toBeVisible({
          timeout: 15_000,
        });

        await logout(page);
      } finally {
        await restoreDayState(snap, {
          deleteSentinelRange: { minAmount: 99303, maxAmount: 99303 },
        });
      }

      runtimeErrors.assertClean();
    });

    test('T1-F3-04: 0h warning on Ayer offers quick hours CTA that clears warning once hours saved', async ({
      page,
      runtimeErrors,
    }) => {
      const yesterday = yesterdayStr();
      const snap = await snapshotDayState(yesterday);
      let createdId: string | undefined;
      try {
        await setCaptorHoursAdmin(STAGING_ACCOUNTS.nicolas.userId, yesterday, 0);
        const created = await createTestSocioAsAccount('nicolas', {
          operationalDate: yesterday,
          age: 31,
          amount: 99304,
          paymentType: 'credito',
        });
        createdId = String(created.id);

        await loginAs(page, 'nicolas');
        await selectPartnerDate(page, 'ayer');

        const warning = page.getByText(/figuran en 0|0\s*h/i).first();
        await expect(warning).toBeVisible({ timeout: 15_000 });

        const quickCta = page
          .getByRole('button', { name: /Cargar\s*horas|4\s*h|Editar/i })
          .first();
        await expect(quickCta).toBeVisible();
        await editMyHours(page, 4);

        await expect(
          page.getByText(/tus horas.*figuran en 0/i)
        ).toHaveCount(0);
        await logout(page);
      } finally {
        await restoreDayState(snap, {
          deleteSocioIds: createdId ? [createdId] : undefined,
        });
      }

      runtimeErrors.assertClean();
    });

    test('T1-F3-05: captador edits and deletes own socio on Hoy', async ({
      page,
      runtimeErrors,
    }) => {
      try {
        await loginAs(page, 'ariel');
        await fillAndSubmitPartner(page, {
          age: 35,
          amount: 99305,
          payment: 'Tarjeta de Crédito',
          datePreset: 'hoy',
        });

        const card = partnerCardByAmount(page, 99305);
        await expect(card).toBeVisible({ timeout: 15_000 });

        await card
          .getByRole('button', { name: /Editar|Modificar/i })
          .first()
          .click();

        const editBox = page
          .locator('div')
          .filter({ hasText: /Editando Socio/i })
          .last();
        const inputs = editBox.locator('input[type="number"]');
        await inputs.nth(1).fill('99306');
        await editBox.locator('select').selectOption('prepaid_wallet');
        await editBox
          .getByRole('button', { name: /Guardar cambios/i })
          .click();

        const updatedCard = partnerCardByAmount(page, 99306);
        await expect(updatedCard).toBeVisible({ timeout: 15_000 });
        await expect(updatedCard).toContainText(/0[,.]4\s*pts/i);

        await updatedCard.getByRole('button', { name: /Eliminar/i }).click();
        await updatedCard
          .getByRole('button', { name: /Eliminar|Confirmar/i })
          .first()
          .click();
        await expect(partnerCardByAmount(page, 99306)).toHaveCount(0, {
          timeout: 15_000,
        });

        await logout(page);
      } finally {
        await deleteTestSociosBySentinel(99305, 99306);
      }

      runtimeErrors.assertClean();
    });

    test('T1-F3-06: role-specific copy in TodayPartnersList differs between captador and admin', async ({
      page,
      runtimeErrors,
    }) => {
      try {
        await loginAs(page, 'ariel');
        await expect(
          page.getByText(/propios registros|tus socios/i).first()
        ).toBeVisible({ timeout: 10_000 });
        await logout(page);

        await loginAs(page, 'carlos');
        await expect(
          page.getByText(/administrador|todo el equipo|cualquier registro/i).first()
        ).toBeVisible({ timeout: 10_000 });
        await logout(page);
      } finally {
        await deleteTestSociosBySentinel(99307, 99307);
      }

      runtimeErrors.assertClean();
    });
  });

  // =========================================================================
  // F4: Offline Field Protection (5)
  // =========================================================================
  test.describe('F4 — Offline Draft & Retry Queue', () => {
    test('T1-F4-01: unsubmitted form draft restores age and amount after reload', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');
      await ageInput(page).fill('37');
      await amountInput(page).fill('99401');
      await page.getByRole('button', { name: /Tarjeta de Crédito/i }).click();

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(ageInput(page)).toHaveValue('37', { timeout: 15_000 });
      await expect(amountInput(page)).toHaveValue('99401');

      await page.evaluate(() => {
        for (const k of Object.keys(localStorage)) {
          if (k.includes('draft') || k.includes('msf')) {
            if (!k.includes('auth') && !k.includes('last_username')) {
              localStorage.removeItem(k);
            }
          }
        }
      });
      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T1-F4-02: local draft clears automatically after successful online submission', async ({
      page,
      runtimeErrors,
    }) => {
      try {
        await loginAs(page, 'ariel');
        await fillAndSubmitPartner(page, {
          age: 33,
          amount: 99402,
          payment: 'Tarjeta de Crédito',
          datePreset: 'hoy',
        });

        await expect(partnerCardByAmount(page, 99402)).toBeVisible({
          timeout: 15_000,
        });

        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(ageInput(page)).toHaveValue('', { timeout: 15_000 });
        await expect(amountInput(page)).toHaveValue('');

        await logout(page);
      } finally {
        await deleteTestSociosBySentinel(99402, 99402);
      }

      runtimeErrors.assertClean();
    });

    test('T1-F4-03: offline submission queues partner and displays pending count banner', async ({
      page,
      context,
      runtimeErrors,
    }) => {
      runtimeErrors.allowConsoleErrors(/net::ERR_INTERNET_DISCONNECTED|Failed to fetch|network/i);

      await loginAs(page, 'ariel');
      try {
        await context.setOffline(true);
        await fillAndSubmitPartner(page, {
          age: 29,
          amount: 99403,
          payment: 'Tarjeta de Débito',
          datePreset: 'hoy',
        });

        await expect(
          page.getByText(/1.*pendiente|cola offline|sin conexi[oó]n/i).first()
        ).toBeVisible({ timeout: 15_000 });
      } finally {
        await context.setOffline(false);
        await page.evaluate(() => {
          for (const k of Object.keys(localStorage)) {
            if (k.includes('queue') || k.includes('offline') || k.includes('draft')) {
              localStorage.removeItem(k);
            }
          }
        });
        await deleteTestSociosBySentinel(99403, 99403);
      }

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T1-F4-04: returning online auto-flushes queued partner once and clears banner', async ({
      page,
      context,
      runtimeErrors,
    }) => {
      runtimeErrors.allowConsoleErrors(/net::ERR_INTERNET_DISCONNECTED|Failed to fetch|network/i);

      await loginAs(page, 'ariel');
      try {
        await context.setOffline(true);
        await fillAndSubmitPartner(page, {
          age: 31,
          amount: 99404,
          payment: 'Tarjeta de Crédito',
          datePreset: 'hoy',
        });
        await expect(
          page.getByText(/1.*pendiente|cola offline/i).first()
        ).toBeVisible({ timeout: 15_000 });

        await context.setOffline(false);
        await page.evaluate(() => window.dispatchEvent(new Event('online')));

        await expect(partnerCardByAmount(page, 99404)).toBeVisible({
          timeout: 20_000,
        });
        await expect(
          page.getByText(/pendientes de env[ií]o/i)
        ).toHaveCount(0);

        await logout(page);
      } finally {
        await context.setOffline(false);
        await deleteTestSociosBySentinel(99404, 99404);
      }

      runtimeErrors.assertClean();
    });

    test('T1-F4-05: manual retry button flushes queued submission after transient POST failure', async ({
      page,
      runtimeErrors,
    }) => {
      runtimeErrors.allowConsoleErrors(/Failed to fetch|net::ERR_FAILED|Error/i);

      await loginAs(page, 'ariel');
      let intercepted = true;
      await page.route('**/rest/v1/socios*', async (route) => {
        if (intercepted && route.request().method() === 'POST') {
          await route.abort('failed');
          return;
        }
        await route.continue();
      });

      try {
        await fillAndSubmitPartner(page, {
          age: 40,
          amount: 99405,
          payment: 'CBU Bancario',
          datePreset: 'hoy',
        });

        await expect(
          page.getByText(/1.*pendiente|cola offline/i).first()
        ).toBeVisible({ timeout: 15_000 });

        intercepted = false;
        const retryBtn = page
          .getByRole('button', { name: /Reintentar|Sincronizar/i })
          .first();
        await expect(retryBtn).toBeVisible({ timeout: 10_000 });
        await retryBtn.click();

        await expect(partnerCardByAmount(page, 99405)).toBeVisible({
          timeout: 20_000,
        });
        await expect(partnerCardByAmount(page, 99405)).toHaveCount(1);

        await logout(page);
      } finally {
        await page.unroute('**/rest/v1/socios*');
        await deleteTestSociosBySentinel(99405, 99405);
      }

      runtimeErrors.assertClean();
    });
  });

  // =========================================================================
  // F5: Move Date (Single & Batch, 0h Warning, Ownership) (5)
  // =========================================================================
  test.describe('F5 — Move Date (Single, Batch, 0h Warning & Ownership)', () => {
    test('T1-F5-01: captador moves own sentinel socio from Hoy to Ayer', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      const yesterday = yesterdayStr();
      const created = await createTestSocioAsAccount('ariel', {
        operationalDate: today,
        age: 32,
        amount: 99501,
        paymentType: 'credito',
      });
      const socioId = String(created.id);

      try {
        await loginAs(page, 'ariel');
        const card = partnerCardByAmount(page, 99501);
        await expect(card).toBeVisible({ timeout: 15_000 });

        const dialog = await openMoveDateModal(page, card);
        await confirmMoveDate(page, yesterday, dialog);

        await expect(partnerCardByAmount(page, 99501)).toHaveCount(0, {
          timeout: 15_000,
        });

        await navigateCalendarToDate(page, yesterday);
        await expect(partnerCardByAmount(page, 99501)).toBeVisible({
          timeout: 15_000,
        });

        await logout(page);
      } finally {
        await deleteSocioById(socioId);
      }

      runtimeErrors.assertClean();
    });

    test('T1-F5-02: admin batch moves 2 sentinel socios from Hoy to 2026-11-17', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      const targetDate = SEEDED_HISTORY.day2026_11_17.date;
      const s1 = await createTestSocioAsAccount('ariel', {
        operationalDate: today,
        age: 26,
        amount: 99502,
        paymentType: 'credito',
      });
      const s2 = await createTestSocioAsAccount('lucia', {
        operationalDate: today,
        age: 27,
        amount: 99503,
        paymentType: 'debito',
      });
      const ids = [String(s1.id), String(s2.id)];

      try {
        await loginAs(page, 'carlos');
        await expect(partnerCardByAmount(page, 99502)).toBeVisible({
          timeout: 15_000,
        });

        await toggleBatchSelectMode(page);
        await partnerCardByAmount(page, 99502)
          .locator('input[type="checkbox"]')
          .check();
        await partnerCardByAmount(page, 99503)
          .locator('input[type="checkbox"]')
          .check();

        const dialog = await openMoveDateModal(page);
        await confirmMoveDate(page, targetDate, dialog);

        await navigateCalendarToDate(page, targetDate);
        await expect(partnerCardByAmount(page, 99502)).toBeVisible({
          timeout: 15_000,
        });
        await expect(partnerCardByAmount(page, 99503)).toBeVisible({
          timeout: 15_000,
        });

        await logout(page);
      } finally {
        for (const id of ids) {
          await deleteSocioById(id);
        }
      }

      runtimeErrors.assertClean();
    });

    test('T1-F5-03: moving socio to destination date with 0h displays warning and quick CTA', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      const yesterday = yesterdayStr();
      const snap = await snapshotDayState(yesterday);
      const created = await createTestSocioAsAccount('nicolas', {
        operationalDate: today,
        age: 30,
        amount: 99504,
        paymentType: 'credito',
      });
      const socioId = String(created.id);

      try {
        await setCaptorHoursAdmin(STAGING_ACCOUNTS.nicolas.userId, yesterday, 0);
        await loginAs(page, 'nicolas');

        const card = partnerCardByAmount(page, 99504);
        await expect(card).toBeVisible({ timeout: 15_000 });
        const dialog = await openMoveDateModal(page, card);
        await dialog.locator('input[type="date"]').first().fill(yesterday);

        await expect(
          dialog.getByText(/0\s*h|sin horas|no tiene horas/i).first()
        ).toBeVisible({ timeout: 10_000 });

        await logout(page);
      } finally {
        await restoreDayState(snap, { deleteSocioIds: [socioId] });
      }

      runtimeErrors.assertClean();
    });

    test('T1-F5-04: canManage enforces ownership so ariel sees actions only on own socio', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      const foreign = await createTestSocioAsAccount('lucia', {
        operationalDate: today,
        age: 28,
        amount: 99505,
        paymentType: 'credito',
      });
      const own = await createTestSocioAsAccount('ariel', {
        operationalDate: today,
        age: 34,
        amount: 99506,
        paymentType: 'debito',
      });
      const ids = [String(foreign.id), String(own.id)];

      try {
        await loginAs(page, 'ariel');
        const foreignCard = partnerCardByAmount(page, 99505);
        const ownCard = partnerCardByAmount(page, 99506);
        await expect(foreignCard).toBeVisible({ timeout: 15_000 });
        await expect(ownCard).toBeVisible({ timeout: 15_000 });

        await expect(
          ownCard.getByRole('button', { name: /Mover|Editar|Modificar|Eliminar/i }).first()
        ).toBeVisible();
        await expect(
          foreignCard.getByRole('button', { name: /Mover|Editar|Modificar|Eliminar/i })
        ).toHaveCount(0);

        await logout(page);
      } finally {
        for (const id of ids) {
          await deleteSocioById(id);
        }
      }

      runtimeErrors.assertClean();
    });

    test('T1-F5-05: admin moves another captador socio to yesterday preserving ownership', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      const yesterday = yesterdayStr();
      const created = await createTestSocioAsAccount('lucia', {
        operationalDate: today,
        age: 36,
        amount: 99507,
        paymentType: 'cbu',
      });
      const socioId = String(created.id);

      try {
        await loginAs(page, 'carlos');
        const card = partnerCardByAmount(page, 99507);
        await expect(card).toBeVisible({ timeout: 15_000 });
        const dialog = await openMoveDateModal(page, card);
        await confirmMoveDate(page, yesterday, dialog);

        await navigateCalendarToDate(page, yesterday);
        const movedCard = partnerCardByAmount(page, 99507);
        await expect(movedCard).toBeVisible({ timeout: 15_000 });
        await expect(movedCard).toContainText(/Lucia/i);

        await logout(page);
      } finally {
        await deleteSocioById(socioId);
      }

      runtimeErrors.assertClean();
    });
  });

  // =========================================================================
  // F6: Socios & Calendario (5)
  // =========================================================================
  test.describe('F6 — Socios & Calendario Filters & CSV', () => {
    test('T1-F6-01: calendar date switching renders exact seeded counts across 4 historical dates', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');
      const dates = [
        SEEDED_HISTORY.day2026_11_24,
        SEEDED_HISTORY.day2026_11_23,
        SEEDED_HISTORY.day2026_11_17,
        SEEDED_HISTORY.day2026_11_16,
      ];
      for (const entry of dates) {
        await navigateCalendarToDate(page, entry.date);
        await expect(
          page.getByRole('heading', {
            name: new RegExp(`HISTORIAL DE SOCIOS \\(${entry.sociosCount}\\)`, 'i'),
          })
        ).toBeVisible({ timeout: 15_000 });
      }
      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T1-F6-02: active captadores filter on 2026-11-24 lists all active profiles incl. 0-count and excludes Morena', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'carlos');
      await navigateCalendarToDate(page, SEEDED_HISTORY.day2026_11_24.date);

      const filterSelect = page
        .locator('select')
        .filter({ hasText: /Todos los captadores/i })
        .first();
      await expect(filterSelect).toBeVisible();
      const optionTexts = await filterSelect.locator('option').allTextContents();
      const joined = optionTexts.join(' | ');

      for (const name of ACTIVE_CAPTADOR_NAMES) {
        expect(joined).toMatch(new RegExp(name, 'i'));
      }
      expect(joined).toMatch(/Rosario\s*\(0\)/i);
      expect(joined).toMatch(/Nicolas\s*\(0\)/i);
      expect(joined).not.toMatch(/Morena/i);

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T1-F6-03: quick chip filter bar on 2026-11-24 filters Ariel (2) and resets to Todos (6)', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');
      await navigateCalendarToDate(page, SEEDED_HISTORY.day2026_11_24.date);

      const arielChip = page
        .getByRole('button', { name: /Ariel\s*\(2\)/i })
        .first();
      await expect(arielChip).toBeVisible({ timeout: 10_000 });
      await arielChip.click();

      await expect(
        page.getByRole('heading', { name: /HISTORIAL DE SOCIOS \(2\)/i })
      ).toBeVisible();

      await page.getByRole('button', { name: /^Todos\b/i }).first().click();
      await expect(
        page.getByRole('heading', { name: /HISTORIAL DE SOCIOS \(6\)/i })
      ).toBeVisible();

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T1-F6-04: filtering Rosario (0) on 2026-11-24 shows clean empty state', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');
      await navigateCalendarToDate(page, SEEDED_HISTORY.day2026_11_24.date);

      const rosarioChip = page
        .getByRole('button', { name: /Rosario\s*\(0\)/i })
        .first();
      if (await rosarioChip.isVisible().catch(() => false)) {
        await rosarioChip.click();
      } else {
        const select = page
          .locator('select')
          .filter({ hasText: /Todos los captadores/i })
          .first();
        await select.selectOption({ label: 'Rosario (0)' });
      }

      await expect(
        page.getByRole('heading', { name: /HISTORIAL DE SOCIOS \(0\)/i })
      ).toBeVisible();
      await expect(
        page.getByText(/No se encontraron socios/i).first()
      ).toBeVisible();

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T1-F6-05: Exportar CSV on 2026-11-24 downloads UTF-8 BOM CSV with 6 data rows', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');
      await navigateCalendarToDate(page, SEEDED_HISTORY.day2026_11_24.date);

      const csvBtn = page.getByRole('button', { name: /Exportar CSV/i }).first();
      const csv = await exportCsvAndReadBom(page, csvBtn);

      expect(csv.filename.toLowerCase()).toMatch(/\.csv$/);
      expect(csv.hasBom).toBe(true);
      expect(csv.lines.length).toBe(7); // header + 6 rows
      expect(csv.lines[0]).toMatch(/Fecha|Captador|Monto|Puntos/i);

      await logout(page);
      runtimeErrors.assertClean();
    });
  });

  // =========================================================================
  // F7: Estadísticas (6)
  // =========================================================================
  test.describe('F7 — Estadísticas Periods, Filters, Formatting & CSV', () => {
    test('T1-F7-01: Estadísticas on 2026-11-24 displays 6 socios, 20,5h (es-AR), and 4 payment breakdowns', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');
      await navigateCalendarToDate(page, SEEDED_HISTORY.day2026_11_24.date);
      await switchTab(page, TAB_PATTERNS.DASHBOARD);

      await expect(page.getByText(/TOTAL PUNTOS JORNADA/i)).toBeVisible();
      await expect(page.getByText(/20,5/).first()).toBeVisible();
      await expect(page.getByText(/Tarjeta de Cr[ée]dito/i).first()).toBeVisible();
      await expect(page.getByText(/Tarjeta de D[ée]bito/i).first()).toBeVisible();
      await expect(page.getByText(/CBU/i).first()).toBeVisible();
      await expect(page.getByText(/Prepaga/i).first()).toBeVisible();

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T1-F7-02: Semana and Mes dynamic filters aggregate active-period seeded sentinels', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      const yesterday = yesterdayStr();
      const s1 = await createTestSocioAsAccount('ariel', {
        operationalDate: today,
        age: 30,
        amount: 99701,
        paymentType: 'credito',
      });
      const s2 = await createTestSocioAsAccount('lucia', {
        operationalDate: yesterday,
        age: 32,
        amount: 99702,
        paymentType: 'credito',
      });
      const ids = [String(s1.id), String(s2.id)];

      try {
        await loginAs(page, 'carlos');
        await switchTab(page, TAB_PATTERNS.DASHBOARD);

        await selectStatsPeriod(page, 'Mes');
        await expect(page.getByText(/TOTAL PUNTOS/i).first()).toBeVisible();
        await expect(page.getByText(/Ariel/i).first()).toBeVisible();

        await selectStatsPeriod(page, 'Semana');
        await expect(page.getByText(/Ariel/i).first()).toBeVisible();

        await logout(page);
      } finally {
        for (const id of ids) {
          await deleteSocioById(id);
        }
      }

      runtimeErrors.assertClean();
    });

    test('T1-F7-03: Rango personalizado 2026-11-16..2026-11-17 shows exact 10 socios and 39 hours', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');
      await switchTab(page, TAB_PATTERNS.DASHBOARD);

      await selectStatsPeriod(page, 'Rango personalizado', {
        start: SEEDED_HISTORY.day2026_11_16.date,
        end: SEEDED_HISTORY.day2026_11_17.date,
      });

      await expect(page.getByText(/\b10\b/).first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(/\b39\b/).first()).toBeVisible();

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T1-F7-04: individual captador filters Lucia (0,7 pts) and Brenda (1 pt singular) on 2026-11-24', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');
      await navigateCalendarToDate(page, SEEDED_HISTORY.day2026_11_24.date);
      await switchTab(page, TAB_PATTERNS.DASHBOARD);

      await selectStatsCollector(page, 'Lucia');
      await expect(page.getByText(/\b0,70?\s*pts\b/i).first()).toBeVisible({
        timeout: 15_000,
      });

      await selectStatsCollector(page, 'Brenda');
      await expect(page.getByText(/\b1\s*pt\b/i).first()).toBeVisible({
        timeout: 15_000,
      });

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T1-F7-05: es-AR comma decimal formatting and 1 pt vs 2 pts singular/plural grammar on 2026-11-24', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');
      await navigateCalendarToDate(page, SEEDED_HISTORY.day2026_11_24.date);
      await switchTab(page, TAB_PATTERNS.DASHBOARD);

      const content = await page.locator('main').innerText();
      expect(content).toMatch(/20,5/);
      expect(content).toMatch(/\b1\s*pt\b/i);
      expect(content).toMatch(/\b2\s*pts\b/i);
      expect(content).not.toMatch(/\b1\s*pts\b/i);

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T1-F7-06: Estadísticas Exportar CSV on range 2026-11-16..2026-11-24 downloads UTF-8 BOM CSV', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');
      await switchTab(page, TAB_PATTERNS.DASHBOARD);

      await selectStatsPeriod(page, 'Rango personalizado', {
        start: SEEDED_HISTORY.day2026_11_16.date,
        end: SEEDED_HISTORY.day2026_11_24.date,
      });

      const csvBtn = page.getByRole('button', { name: /Exportar CSV/i }).first();
      const csv = await exportCsvAndReadBom(page, csvBtn);
      expect(csv.hasBom).toBe(true);
      expect(csv.filename.toLowerCase()).toMatch(/\.csv$/);
      expect(csv.lines.length).toBeGreaterThanOrEqual(2);

      await logout(page);
      runtimeErrors.assertClean();
    });
  });

  // =========================================================================
  // F8: Cierre WhatsApp & Attendance (6)
  // =========================================================================
  test.describe('F8 — Cierre WhatsApp & Daily Attendance', () => {
    test('T1-F8-01: on 2026-11-24 attendance selector prechecks workers and leaves Rosario & Nicolas unchecked', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'carlos');
      await navigateCalendarToDate(page, SEEDED_HISTORY.day2026_11_24.date);
      await switchTab(page, TAB_PATTERNS.CIERRE);

      await expect(
        page.getByText(/¿Qui[eé]nes trabajaron hoy\?/i)
      ).toBeVisible({ timeout: 15_000 });

      const arielChip = page
        .getByRole('checkbox', { name: /Ariel/i })
        .or(page.locator('button[aria-pressed]').filter({ hasText: /Ariel/i }))
        .first();
      await expect(arielChip).toBeVisible();

      const waText = await readWhatsAppClosureText(page);
      expect(waText).toContain('Ariel:');
      expect(waText).not.toContain('Rosario:');
      expect(waText).not.toContain('Nicolas:');

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T1-F8-02: toggling Rosario (0 socios, 0h) persists daily_attendance across reload', async ({
      page,
      runtimeErrors,
    }) => {
      const targetDate = SEEDED_HISTORY.day2026_11_24.date;
      const snap = await snapshotDayState(targetDate);
      try {
        await loginAs(page, 'carlos');
        await navigateCalendarToDate(page, targetDate);
        await switchTab(page, TAB_PATTERNS.CIERRE);

        const rosarioToggle = page
          .locator('label, button')
          .filter({ hasText: /Rosario/i })
          .first();
        await rosarioToggle.click();

        await page.reload({ waitUntil: 'domcontentloaded' });
        await navigateCalendarToDate(page, targetDate);
        await switchTab(page, TAB_PATTERNS.CIERRE);

        const waText = await readWhatsAppClosureText(page);
        expect(waText).toContain('Rosario:');

        await logout(page);
      } finally {
        await restoreDayState(snap);
      }

      runtimeErrors.assertClean();
    });

    test('T1-F8-03: sync Captadores presentes button updates declared_collectors_count on 2026-11-24', async ({
      page,
      runtimeErrors,
    }) => {
      const targetDate = SEEDED_HISTORY.day2026_11_24.date;
      const snap = await snapshotDayState(targetDate);
      try {
        await loginAs(page, 'carlos');
        await navigateCalendarToDate(page, targetDate);
        await switchTab(page, TAB_PATTERNS.CIERRE);

        const rosarioToggle = page
          .locator('label, button')
          .filter({ hasText: /Rosario/i })
          .first();
        await rosarioToggle.click();

        const syncBtn = page
          .getByRole('button', { name: /Sincronizar.*captadores/i })
          .first();
        await expect(syncBtn).toBeVisible({ timeout: 10_000 });
        await syncBtn.click();

        const waText = await readWhatsAppClosureText(page);
        expect(waText).toMatch(/Captadores presentes:\s*6\b/);

        await logout(page);
      } finally {
        await restoreDayState(snap);
      }

      runtimeErrors.assertClean();
    });

    test('T1-F8-04: WhatsApp preview keeps 6 socios in RESUMEN GENERAL and omits unchecked Rosario/Nicolas', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'carlos');
      await navigateCalendarToDate(page, SEEDED_HISTORY.day2026_11_24.date);
      await switchTab(page, TAB_PATTERNS.CIERRE);

      const waText = await readWhatsAppClosureText(page);
      expect(waText).toContain('RESUMEN GENERAL');
      expect(waText).toContain('Socios conseguidos: 6');
      expect(waText).toContain('RENDIMIENTO INDIVIDUAL');
      expect(waText).not.toContain('Rosario:');
      expect(waText).not.toContain('Nicolas:');

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T1-F8-05: save official daily_closures with observations persists status and note across reload', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      const snap = await snapshotDayState(today);
      const created = await createTestSocioAsAccount('ariel', {
        operationalDate: today,
        age: 34,
        amount: 99805,
        paymentType: 'credito',
      });
      const socioId = String(created.id);
      const note = makeTestTag('T1F805');

      try {
        await loginAs(page, 'carlos');
        await switchTab(page, TAB_PATTERNS.CIERRE);

        await saveOfficialClosure(page, note);
        await expect(
          page.getByText(/JORNADA CERRADA|CIERRE GUARDADO|CONFIRMADA/i).first()
        ).toBeVisible({ timeout: 15_000 });

        await page.reload({ waitUntil: 'domcontentloaded' });
        await switchTab(page, TAB_PATTERNS.CIERRE);
        await expect(page.getByText(note).first()).toBeVisible({
          timeout: 15_000,
        });

        await logout(page);
      } finally {
        await restoreDayState(snap, { deleteSocioIds: [socioId] });
      }

      runtimeErrors.assertClean();
    });

    test('T1-F8-06: Copiar Resumen on 2026-11-24 writes WhatsApp summary with es-AR decimals to clipboard', async ({
      page,
      context,
      runtimeErrors,
    }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await loginAs(page, 'ariel');
      await navigateCalendarToDate(page, SEEDED_HISTORY.day2026_11_24.date);
      await switchTab(page, TAB_PATTERNS.CIERRE);

      await page.getByRole('button', { name: /Copiar Resumen/i }).click();
      await expect(page.getByText(/¡Texto Copiado!/i)).toBeVisible({
        timeout: 10_000,
      });

      const copiedText = await page.evaluate(() => navigator.clipboard.readText());
      expect(copiedText).toContain('RESUMEN GENERAL');
      expect(copiedText).toContain('RENDIMIENTO INDIVIDUAL');
      expect(copiedText).toMatch(/20,5/);
      expect(copiedText).not.toContain('Rosario:');

      await logout(page);
      runtimeErrors.assertClean();
    });
  });

  // =========================================================================
  // F9: Planilla Semanal (5)
  // =========================================================================
  test.describe('F9 — Planilla Semanal Year/Week, Hybrid Table & Exports', () => {
    test('T1-F9-01: SEMANAL shows live metrics and Totales del Equipo for current BA ISO week', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      const created = await createTestSocioAsAccount('ariel', {
        operationalDate: today,
        age: 35,
        amount: 99901,
        paymentType: 'credito',
      });
      const socioId = String(created.id);
      const iso = getISOWeekAndYearBA(today);

      try {
        await loginAs(page, 'carlos');
        await switchTab(page, TAB_PATTERNS.SEMANAL);
        await selectWeeklyYearAndWeek(page, iso.year, iso.week);

        await expect(page.getByText(/EQUIPO COMPLETO/i)).toBeVisible();
        await expect(page.getByText(/En vivo/i).first()).toBeVisible({
          timeout: 15_000,
        });
        await expect(page.getByText(/Totales del Equipo/i).first()).toBeVisible();

        await logout(page);
      } finally {
        await deleteSocioById(socioId);
      }

      runtimeErrors.assertClean();
    });

    test('T1-F9-02: year selector toggles 2026 -> 2027 -> 2026 cleanly without re-fetch loop', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');
      await switchTab(page, TAB_PATTERNS.SEMANAL);

      await selectWeeklyYearAndWeek(page, 2027, 1);
      await expect(
        page
          .locator('p, h1, h2, h3, h4, span')
          .filter({ hasText: /Semana\s+1\b/i })
          .first()
      ).toBeVisible();

      await selectWeeklyYearAndWeek(page, 2026, 47);
      await expect(
        page
          .locator('p, h1, h2, h3, h4, span')
          .filter({ hasText: /Semana\s+47\b/i })
          .first()
      ).toBeVisible();

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T1-F9-03: Week 47 (2026) aggregates exact seeded 10 socios and 39 hours', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'carlos');
      await switchTab(page, TAB_PATTERNS.SEMANAL);
      await selectWeeklyYearAndWeek(page, 2026, 47);

      const totalsRow = page
        .locator('tr, div')
        .filter({ hasText: /Totales del Equipo/i })
        .last();
      await expect(totalsRow).toBeVisible({ timeout: 15_000 });
      await expect(totalsRow).toContainText(/\b10\b/);
      await expect(totalsRow).toContainText(/\b39\b/);

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T1-F9-04: confirming Week 47 (2026) weekly closure transitions En vivo to Confirmada', async ({
      page,
      runtimeErrors,
    }) => {
      const snap = await snapshotWeeklyReports(2026, 47);
      try {
        await loginAs(page, 'carlos');
        await switchTab(page, TAB_PATTERNS.SEMANAL);
        await selectWeeklyYearAndWeek(page, 2026, 47);

        const confirmBtn = page
          .getByRole('button', {
            name: /Confirmar|Guardar Planilla|Cerrar Semana/i,
          })
          .first();
        await expect(confirmBtn).toBeVisible({ timeout: 15_000 });
        await confirmBtn.click();

        await expect(page.getByText(/Confirmada/i).first()).toBeVisible({
          timeout: 15_000,
        });

        await logout(page);
      } finally {
        await restoreWeeklyReports(2026, 47, snap);
      }

      runtimeErrors.assertClean();
    });

    test('T1-F9-05: Week 47 (2026) exports UTF-8 BOM CSV and copies WhatsApp summary', async ({
      page,
      context,
      runtimeErrors,
    }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await loginAs(page, 'carlos');
      await switchTab(page, TAB_PATTERNS.SEMANAL);
      await selectWeeklyYearAndWeek(page, 2026, 47);

      const csvBtn = page.getByRole('button', { name: /Exportar CSV/i }).first();
      const csv = await exportCsvAndReadBom(page, csvBtn);
      expect(csv.hasBom).toBe(true);
      expect(csv.lines.length).toBeGreaterThanOrEqual(2);

      const copyBtn = page
        .getByRole('button', { name: /Copiar.*WhatsApp|Copiar Resumen/i })
        .first();
      await expect(copyBtn).toBeVisible();
      await copyBtn.click();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(copied).toMatch(/SEMANA\s+47/i);

      await logout(page);
      runtimeErrors.assertClean();
    });
  });

  // =========================================================================
  // F10: Admin Equipo (5)
  // =========================================================================
  test.describe('F10 — Admin Team Management (admin-team-manager)', () => {
    test('T1-F10-01: admin views all 8 active profiles and inactive Morena in EQUIPO', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'carlos');
      await openTeamManagement(page);

      for (const name of [...ACTIVE_CAPTADOR_NAMES, 'Carlos Diaz']) {
        await expect(page.getByText(new RegExp(name, 'i')).first()).toBeVisible();
      }
      await expect(page.getByText(/Morena/i).first()).toBeVisible();

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T1-F10-02: admin creates e2e_test user and verifies login works', async ({
      page,
      runtimeErrors,
    }) => {
      const uname = `e2e_test_${Date.now().toString(36)}`;
      const pass = 'Msf3Stg!Tst#12Ab';

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
          .fill(`Test ${uname}`);
        await page.getByPlaceholder(/contrase[ñn]a/i).first().fill(pass);
        await page
          .getByRole('button', { name: /Crear|Guardar/i })
          .first()
          .click();

        await expect(page.getByText(uname).first()).toBeVisible({
          timeout: 15_000,
        });
        await logout(page);

        await loginWithCustomCredentials(page, uname, pass);
        await expect(
          page.locator('header').getByText(new RegExp(uname, 'i'))
        ).toBeVisible();
        await logout(page);
      } finally {
        await deactivateTestUsersByPrefix(['e2e_test_']);
      }

      runtimeErrors.assertClean();
    });

    test('T1-F10-03: admin updates test user full name and role captador -> admin -> captador', async ({
      page,
      runtimeErrors,
    }) => {
      const uname = `e2e_test_${Date.now().toString(36)}`;
      const pass = 'Msf3Stg!Tst#34Cd';

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
          .fill(`Initial ${uname}`);
        await page.getByPlaceholder(/contrase[ñn]a/i).first().fill(pass);
        await page.getByRole('button', { name: /Crear|Guardar/i }).first().click();

        const row = page.locator('tr, div').filter({ hasText: uname }).last();
        await expect(row).toBeVisible({ timeout: 15_000 });
        await row.getByRole('button', { name: /Editar/i }).first().click();

        await page
          .getByPlaceholder(/nombre completo|nombre/i)
          .first()
          .fill(`Updated ${uname}`);
        await page.locator('select').first().selectOption('admin');
        await page.getByRole('button', { name: /Guardar/i }).first().click();

        await expect(
          page.getByText(new RegExp(`Updated ${uname}`, 'i')).first()
        ).toBeVisible({ timeout: 15_000 });

        await row.getByRole('button', { name: /Editar/i }).first().click();
        await page.locator('select').first().selectOption('captador');
        await page.getByRole('button', { name: /Guardar/i }).first().click();

        await logout(page);
      } finally {
        await deactivateTestUsersByPrefix(['e2e_test_']);
      }

      runtimeErrors.assertClean();
    });

    test('T1-F10-04: admin deactivates and reactivates e2e_test user', async ({
      page,
      runtimeErrors,
    }) => {
      const uname = `e2e_test_${Date.now().toString(36)}`;
      const pass = 'Msf3Stg!Tst#56Ef';

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
          .fill(`Toggle ${uname}`);
        await page.getByPlaceholder(/contrase[ñn]a/i).first().fill(pass);
        await page.getByRole('button', { name: /Crear|Guardar/i }).first().click();

        const row = page.locator('tr, div').filter({ hasText: uname }).last();
        await expect(row).toBeVisible({ timeout: 15_000 });

        await row.getByRole('button', { name: /Desactivar/i }).first().click();
        await expect(row.getByText(/Inactivo/i).first()).toBeVisible({
          timeout: 15_000,
        });

        await row.getByRole('button', { name: /Reactivar|Activar/i }).first().click();
        await expect(row.getByText(/Activo/i).first()).toBeVisible({
          timeout: 15_000,
        });

        await logout(page);
      } finally {
        await deactivateTestUsersByPrefix(['e2e_test_']);
      }

      runtimeErrors.assertClean();
    });

    test('T1-F10-05: admin resets password so new password succeeds and old password fails', async ({
      page,
      runtimeErrors,
    }) => {
      runtimeErrors.allowConsoleErrors(/400|Invalid login|invalid_credentials/i);
      const uname = `e2e_test_${Date.now().toString(36)}`;
      const oldPass = 'Msf3Stg!Old#78Gh';
      const newPass = 'Msf3Stg!New#90Ij';

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
          .fill(`Reset ${uname}`);
        await page.getByPlaceholder(/contrase[ñn]a/i).first().fill(oldPass);
        await page.getByRole('button', { name: /Crear|Guardar/i }).first().click();

        const row = page.locator('tr, div').filter({ hasText: uname }).last();
        await expect(row).toBeVisible({ timeout: 15_000 });
        await row
          .getByRole('button', { name: /Restablecer|Clave|Contrase[ñn]a/i })
          .first()
          .click();

        await page.getByPlaceholder(/nueva contrase[ñn]a|contrase[ñn]a/i).last().fill(newPass);
        await page.getByRole('button', { name: /Confirmar|Guardar|Restablecer/i }).last().click();
        await logout(page);

        await attemptLoginWithCredentials(page, uname, oldPass);
        await expect(submitLoginButton(page)).toBeVisible();

        await loginWithCustomCredentials(page, uname, newPass);
        await logout(page);
      } finally {
        await deactivateTestUsersByPrefix(['e2e_test_']);
      }

      runtimeErrors.assertClean();
    });
  });

  // =========================================================================
  // F11: Admin Auditoría (5)
  // =========================================================================
  test.describe('F11 — Admin Audit Log & Filters', () => {
    test('T1-F11-01: admin views AUDITORIA entries (<= 100 rows, newest-first)', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'carlos');
      await openAuditTabFilters(page);

      const rows = page.locator('tbody tr, [data-audit-row]');
      await expect(rows.first()).toBeVisible({ timeout: 15_000 });
      const count = await rows.count();
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThanOrEqual(100);

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T1-F11-02: creating and editing sentinel socio as ariel records INSERT and UPDATE in AUDITORIA', async ({
      page,
      runtimeErrors,
    }) => {
      try {
        await loginAs(page, 'ariel');
        await fillAndSubmitPartner(page, {
          age: 31,
          amount: 99112,
          payment: 'Tarjeta de Crédito',
          datePreset: 'hoy',
        });

        const card = partnerCardByAmount(page, 99112);
        await expect(card).toBeVisible({ timeout: 15_000 });
        await card.getByRole('button', { name: /Editar|Modificar/i }).first().click();
        const editBox = page.locator('div').filter({ hasText: /Editando Socio/i }).last();
        await editBox.locator('input[type="number"]').nth(0).fill('39');
        await editBox.getByRole('button', { name: /Guardar cambios/i }).click();
        await logout(page);

        await loginAs(page, 'carlos');
        await openAuditTabFilters(page, { actor: 'Ariel' });
        await expect(auditActionBadge(page, /\bINSERT\b/i)).toBeVisible({
          timeout: 15_000,
        });
        await expect(auditActionBadge(page, /\bUPDATE\b/i)).toBeVisible({
          timeout: 15_000,
        });
        await logout(page);
      } finally {
        await deleteTestSociosBySentinel(99112, 99112);
      }

      runtimeErrors.assertClean();
    });

    test('T1-F11-03: moving socio from Hoy to Ayer records MOVE_DATE in AUDITORIA', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      const yesterday = yesterdayStr();
      const created = await createTestSocioAsAccount('ariel', {
        operationalDate: today,
        age: 29,
        amount: 99113,
        paymentType: 'credito',
      });
      const socioId = String(created.id);

      try {
        await loginAs(page, 'ariel');
        const card = partnerCardByAmount(page, 99113);
        await expect(card).toBeVisible({ timeout: 15_000 });
        const dialog = await openMoveDateModal(page, card);
        await confirmMoveDate(page, yesterday, dialog);
        await logout(page);

        await loginAs(page, 'carlos');
        await openAuditTabFilters(page, { action: 'MOVE_DATE' });
        await expect(
          page.getByText(new RegExp(`${today}.*${yesterday}|${formatDateDMY(today)}`)).first()
        ).toBeVisible({ timeout: 15_000 });
        await logout(page);
      } finally {
        await deleteSocioById(socioId);
      }

      runtimeErrors.assertClean();
    });

    test('T1-F11-04: AUDITORIA filters cleanly by action MOVE_DATE', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      const yesterday = yesterdayStr();
      const created = await createTestSocioAsAccount('ariel', {
        operationalDate: today,
        age: 30,
        amount: 99114,
        paymentType: 'credito',
      });
      const socioId = String(created.id);

      try {
        await loginAs(page, 'ariel');
        const dialog = await openMoveDateModal(page, partnerCardByAmount(page, 99114));
        await confirmMoveDate(page, yesterday, dialog);
        await logout(page);

        await loginAs(page, 'carlos');
        await openAuditTabFilters(page, { action: 'MOVE_DATE' });
        await expect(auditActionBadge(page, /\bMOVE_DATE\b/i)).toBeVisible({
          timeout: 15_000,
        });
        await logout(page);
      } finally {
        await deleteSocioById(socioId);
      }

      runtimeErrors.assertClean();
    });

    test('T1-F11-05: AUDITORIA filters cleanly by actor Ariel', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      const created = await createTestSocioAsAccount('ariel', {
        operationalDate: today,
        age: 31,
        amount: 99115,
        paymentType: 'credito',
      });
      const socioId = String(created.id);

      try {
        await loginAs(page, 'carlos');
        await openAuditTabFilters(page, { actor: 'Ariel' });
        await expect(page.getByText(/Ariel/i).first()).toBeVisible({
          timeout: 15_000,
        });
        await logout(page);
      } finally {
        await deleteSocioById(socioId);
      }

      runtimeErrors.assertClean();
    });
  });
});
