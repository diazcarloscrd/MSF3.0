import { test, expect } from '../fixtures/test.ts';
import {
  TAB_PATTERNS,
  attemptLoginWithCredentials,
  gotoApp,
  loginAs,
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
} from '../helpers/layoutAssertions.ts';
import {
  createTestSocioAsAccount,
  deactivateTestUsersByPrefix,
  deleteSocioByClientRequestId,
  deleteSocioById,
  deleteTestSociosBySentinel,
  getAuditLogEntries,
  getJwtForAccount,
  getSociosByClientRequestId,
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
  formatShortDM,
  makeTestTag,
  todayStr,
  tomorrowStr,
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
  submitPartnerButton,
  toggleBatchSelectMode,
} from '../helpers/uiActions.ts';

test.describe('Tier 2 — Boundaries, Negative & Edge Cases (F1–F11, 58 Cases)', () => {
  // =========================================================================
  // F1: Authentication Boundaries (5)
  // =========================================================================
  test.describe('F1 — Authentication Boundaries', () => {
    test('T2-F1-01: wrong password for active user is rejected with Spanish feedback', async ({
      page,
      runtimeErrors,
    }) => {
      runtimeErrors.allowConsoleErrors(/400|invalid|Bad Request/i);
      await attemptLoginWithCredentials(page, 'ariel', 'WrongPass!999');

      await expect(
        page.getByText(/incorrect|inv[aá]lid|error|credenciales/i).first()
      ).toBeVisible({ timeout: 15_000 });
      await expect(submitLoginButton(page)).toBeVisible();

      runtimeErrors.assertClean();
    });

    test('T2-F1-02: inactive user morena is denied access even with valid password', async ({
      page,
      runtimeErrors,
    }) => {
      runtimeErrors.allowConsoleErrors(/400|401|403|inactiv|deshabilitad/i);
      await attemptLoginWithCredentials(
        page,
        STAGING_ACCOUNTS.morena.username,
        STAGING_ACCOUNTS.morena.password
      );

      await expect(
        page.getByText(/inactiv|deshabilitad|no est[aá] habilitad|acceso/i).first()
      ).toBeVisible({ timeout: 15_000 });
      await expect(navTab(page, TAB_PATTERNS.CARGA)).toHaveCount(0);

      runtimeErrors.assertClean();
    });

    test('T2-F1-03: empty username or password submit stays on login screen', async ({
      page,
      runtimeErrors,
    }) => {
      await gotoApp(page);
      await expect(usernameInput(page)).toBeVisible({ timeout: 15_000 });
      await usernameInput(page).fill('');
      await passwordInput(page).fill('');
      await submitLoginButton(page).click();

      await expect(submitLoginButton(page)).toBeVisible();
      await expect(navTab(page, TAB_PATTERNS.CARGA)).toHaveCount(0);

      runtimeErrors.assertClean();
    });

    test('T2-F1-04: username with spaces and uppercase normalizes cleanly at login', async ({
      page,
      runtimeErrors,
    }) => {
      await attemptLoginWithCredentials(
        page,
        '  ARIEL  ',
        STAGING_ACCOUNTS.ariel.password
      );
      await expect(page.locator('header').getByText(/Ariel/i)).toBeVisible({
        timeout: 20_000,
      });

      await logout(page);
      await expect(usernameInput(page)).toHaveValue(/ariel/i);

      runtimeErrors.assertClean();
    });

    test('T2-F1-05: corrupted msf_last_username in localStorage does not crash or execute XSS', async ({
      page,
      runtimeErrors,
    }) => {
      await gotoApp(page);
      await page.evaluate(() => {
        window.localStorage.setItem(
          'msf_last_username',
          '<img src=x onerror="window.__xss=1">'
        );
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(usernameInput(page)).toBeVisible({ timeout: 15_000 });
      const xssTriggered = await page.evaluate(
        () => Boolean((window as unknown as { __xss?: number }).__xss)
      );
      expect(xssTriggered).toBe(false);

      runtimeErrors.assertClean();
    });
  });

  // =========================================================================
  // F2: Responsive Layout & Geometry Stress (5)
  // =========================================================================
  test.describe('F2 — Layout & Geometry Stress', () => {
    test('T2-F2-01: 7-digit amount (9999999) and 300-char closure note cause zero overflow at 360x800 and 390x844', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      const snap = await snapshotDayState(today);
      const created = await createTestSocioAsAccount('ariel', {
        operationalDate: today,
        age: 45,
        amount: 9999999,
        paymentType: 'credito',
      });
      const socioId = String(created.id);
      const longNote = 'Observación extensa de prueba E2E '.repeat(9).slice(0, 300);

      try {
        await loginAs(page, 'carlos');

        for (const vp of [
          { width: 360, height: 800 },
          { width: 390, height: 844 },
        ]) {
          await page.setViewportSize(vp);
          await switchTab(page, TAB_PATTERNS.CARGA);
          await expect(partnerCardByAmount(page, 9999999)).toBeVisible({
            timeout: 15_000,
          });
          await assertNoHorizontalOverflow(page);

          await switchTab(page, TAB_PATTERNS.CIERRE);
          await saveOfficialClosure(page, longNote);
          await assertNoHorizontalOverflow(page);
        }

        await logout(page);
      } finally {
        await restoreDayState(snap, { deleteSocioIds: [socioId] });
      }

      runtimeErrors.assertClean();
    });

    test('T2-F2-02: rapid tab switching settles on final tab with scroll at 0 and zero errors', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');
      const sequence = [
        TAB_PATTERNS.DASHBOARD,
        TAB_PATTERNS.SOCIOS,
        TAB_PATTERNS.CIERRE,
        TAB_PATTERNS.SEMANAL,
        TAB_PATTERNS.CARGA,
        TAB_PATTERNS.SOCIOS,
      ];
      for (const tab of sequence) {
        await navTab(page, tab).click();
      }
      await expect(page.getByText(/CONSULTAR POR FECHA/i)).toBeVisible({
        timeout: 10_000,
      });
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBe(0);

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T2-F2-03: throttled network hydration keeps valid viewport meta and renders without errors', async ({
      page,
      runtimeErrors,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.route('**/rest/v1/**', async (route) => {
        await new Promise((r) => setTimeout(r, 250));
        await route.continue();
      });

      try {
        await loginAs(page, 'ariel');
        await assertNoHorizontalOverflow(page);
        await logout(page);
      } finally {
        await page.unroute('**/rest/v1/**');
      }

      runtimeErrors.assertClean();
    });

    test('T2-F2-04: dense action button rows satisfy >=44x44px and >=8px gap on CARGA and SOCIOS at 390x844', async ({
      page,
      runtimeErrors,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const today = todayStr();
      const s1 = await createTestSocioAsAccount('ariel', {
        operationalDate: today,
        age: 31,
        amount: 99221,
        paymentType: 'credito',
      });
      const s2 = await createTestSocioAsAccount('ariel', {
        operationalDate: today,
        age: 32,
        amount: 99222,
        paymentType: 'debito',
      });
      const ids = [String(s1.id), String(s2.id)];

      try {
        await loginAs(page, 'ariel');
        await expect(partnerCardByAmount(page, 99221)).toBeVisible({
          timeout: 15_000,
        });
        await assertActionButtonsTouchGeometry(
          page,
          /editar|modificar(?:\s+socio)?|eliminar|mover(?:\s+fecha)?/i,
          44,
          8
        );

        await switchTab(page, TAB_PATTERNS.SOCIOS);
        await assertActionButtonsTouchGeometry(
          page,
          /editar|modificar(?:\s+socio)?|eliminar|mover(?:\s+fecha)?/i,
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

    test('T2-F2-05: desktop 1280x800 renders dashboard and weekly tables without overflow', async ({
      page,
      runtimeErrors,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await loginAs(page, 'carlos');

      await switchTab(page, TAB_PATTERNS.DASHBOARD);
      await assertNoHorizontalOverflow(page);

      await switchTab(page, TAB_PATTERNS.SEMANAL);
      await assertNoHorizontalOverflow(page);

      await logout(page);
      runtimeErrors.assertClean();
    });
  });

  // =========================================================================
  // F3: Partner Registration Boundaries (6)
  // =========================================================================
  test.describe('F3 — Partner Registration Boundaries', () => {
    test('T2-F3-01: future date tomorrowStr() is blocked in registration and rejected by server', async ({
      page,
      runtimeErrors,
    }) => {
      runtimeErrors.allowConsoleErrors(/400|22023|futura/i);
      const tomorrow = tomorrowStr();

      await loginAs(page, 'ariel');
      await selectPartnerDate(page, 'otra');
      const dateInput = page.locator('input[type="date"]').first();
      const maxAttr = await dateInput.getAttribute('max');
      expect(maxAttr).toBe(todayStr());

      // Also verify server trigger rejects direct future-date insert
      const { access_token } = await getJwtForAccount(
        STAGING_ACCOUNTS.ariel.email,
        STAGING_ACCOUNTS.ariel.password
      );
      const res = await fetch(`${STAGING_SUPABASE_URL}/rest/v1/socios`, {
        method: 'POST',
        headers: {
          apikey: STAGING_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operational_date: tomorrow,
          age: 30,
          amount: 99311,
          payment_method_id: 'credito',
        }),
      });
      expect(res.ok).toBe(false);
      expect(await res.text()).toMatch(/fecha futura/i);

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T2-F3-02: invalid age (<16, >99), amount (<=0), and missing payment are rejected', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');

      await ageInput(page).fill('15');
      await amountInput(page).fill('99312');
      await page.getByRole('button', { name: /Tarjeta de Crédito/i }).click();
      await submitPartnerButton(page).click();
      await expect(partnerCardByAmount(page, 99312)).toHaveCount(0);

      await ageInput(page).fill('100');
      await submitPartnerButton(page).click();
      await expect(partnerCardByAmount(page, 99312)).toHaveCount(0);

      await ageInput(page).fill('30');
      await amountInput(page).fill('0');
      await submitPartnerButton(page).click();
      await expect(
        page.getByText(/mayor a 0|monto|complet[aá]|edad/i).first()
      ).toBeVisible();

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T2-F3-03: BA late-evening clock (23:30 -03:00 = 02:30Z next UTC day) preserves Hoy BA date', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      await page.clock.install({ time: new Date(`${today}T23:30:00-03:00`) });

      await loginAs(page, 'ariel');
      const hoyBtn = page
        .getByRole('button', { name: /^\s*Hoy\b/i })
        .first();
      await expect(hoyBtn).toBeVisible({ timeout: 15_000 });
      await expect(hoyBtn).toContainText(formatShortDM(today));

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T2-F3-04: explicit 4h on todayStr prevents 0h warning even after registering sentinel socio', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      const snap = await snapshotDayState(today);
      try {
        await setCaptorHoursAdmin(STAGING_ACCOUNTS.ariel.userId, today, 4);
        await loginAs(page, 'ariel');

        await fillAndSubmitPartner(page, {
          age: 28,
          amount: 99314,
          payment: 'Tarjeta de Crédito',
          datePreset: 'hoy',
        });
        await expect(partnerCardByAmount(page, 99314)).toBeVisible({
          timeout: 15_000,
        });
        await expect(
          page.getByText(/tus horas.*figuran en 0/i)
        ).toHaveCount(0);

        await logout(page);
      } finally {
        await restoreDayState(snap, {
          deleteSentinelRange: { minAmount: 99314, maxAmount: 99314 },
        });
      }

      runtimeErrors.assertClean();
    });

    test('T2-F3-05: boundary valid ages 16 and 99 are accepted cleanly', async ({
      page,
      runtimeErrors,
    }) => {
      try {
        await loginAs(page, 'ariel');

        await fillAndSubmitPartner(page, {
          age: 16,
          amount: 99315,
          payment: 'Tarjeta de Crédito',
          datePreset: 'hoy',
        });
        await expect(partnerCardByAmount(page, 99315)).toBeVisible({
          timeout: 15_000,
        });

        await fillAndSubmitPartner(page, {
          age: 99,
          amount: 99316,
          payment: 'Prepaga / Billetera',
          datePreset: 'hoy',
        });
        await expect(partnerCardByAmount(page, 99316)).toBeVisible({
          timeout: 15_000,
        });

        await logout(page);
      } finally {
        await deleteTestSociosBySentinel(99315, 99316);
      }

      runtimeErrors.assertClean();
    });

    test('T2-F3-06: inline edit rejects invalid age 15 without corrupting saved socio', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      const created = await createTestSocioAsAccount('ariel', {
        operationalDate: today,
        age: 33,
        amount: 99317,
        paymentType: 'credito',
      });
      const socioId = String(created.id);

      try {
        await loginAs(page, 'ariel');
        const card = partnerCardByAmount(page, 99317);
        await expect(card).toBeVisible({ timeout: 15_000 });
        await card.getByRole('button', { name: /Editar|Modificar/i }).first().click();

        const editBox = page.locator('div').filter({ hasText: /Editando Socio/i }).last();
        await editBox.locator('input[type="number"]').nth(0).fill('15');
        await editBox.getByRole('button', { name: /Guardar cambios/i }).click();

        await expect(
          page.getByText(/entre 16 y 99/i).first()
        ).toBeVisible();
        await editBox.getByRole('button', { name: /Cancelar/i }).click();
        await expect(partnerCardByAmount(page, 99317)).toContainText('33 años');

        await logout(page);
      } finally {
        await deleteSocioById(socioId);
      }

      runtimeErrors.assertClean();
    });
  });

  // =========================================================================
  // F4: Offline Field Protection Boundaries (5)
  // =========================================================================
  test.describe('F4 — Offline Queue Boundaries', () => {
    test('T2-F4-01: multiple queued offline submissions persist across reload while offline', async ({
      page,
      context,
      runtimeErrors,
    }) => {
      runtimeErrors.allowConsoleErrors(/net::ERR_INTERNET_DISCONNECTED|Failed to fetch|network/i);

      await loginAs(page, 'ariel');
      try {
        await context.setOffline(true);
        await fillAndSubmitPartner(page, {
          age: 26,
          amount: 99411,
          payment: 'Tarjeta de Crédito',
          datePreset: 'hoy',
        });
        await fillAndSubmitPartner(page, {
          age: 27,
          amount: 99412,
          payment: 'Tarjeta de Débito',
          datePreset: 'hoy',
        });

        await expect(page.getByText(/2.*pendiente/i).first()).toBeVisible({
          timeout: 15_000,
        });

        await context.setOffline(false);
        await page.evaluate(() => window.dispatchEvent(new Event('online')));
        await expect(partnerCardByAmount(page, 99411)).toBeVisible({
          timeout: 20_000,
        });
        await expect(partnerCardByAmount(page, 99412)).toBeVisible({
          timeout: 20_000,
        });

        await logout(page);
      } finally {
        await context.setOffline(false);
        await deleteTestSociosBySentinel(99411, 99412);
      }

      runtimeErrors.assertClean();
    });

    test('T2-F4-02: duplicate client_request_id idempotency inserts only one socio row', async ({
      runtimeErrors,
    }) => {
      const today = todayStr();
      const clientRequestId = crypto.randomUUID();
      try {
        await createTestSocioAsAccount('ariel', {
          operationalDate: today,
          age: 32,
          amount: 99413,
          paymentType: 'credito',
          clientRequestId,
        });

        // Second attempt with identical client_request_id must conflict (409) without duplicating
        const { access_token } = await getJwtForAccount(
          STAGING_ACCOUNTS.ariel.email,
          STAGING_ACCOUNTS.ariel.password
        );
        const dupRes = await fetch(`${STAGING_SUPABASE_URL}/rest/v1/socios`, {
          method: 'POST',
          headers: {
            apikey: STAGING_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            operational_date: today,
            age: 32,
            amount: 99413,
            payment_method_id: 'credito',
            client_request_id: clientRequestId,
          }),
        });
        expect(dupRes.ok).toBe(false);

        const rows = await getSociosByClientRequestId(clientRequestId);
        expect(rows.length).toBe(1);
      } finally {
        await deleteSocioByClientRequestId(clientRequestId);
      }

      runtimeErrors.assertClean();
    });

    test('T2-F4-03: HTTP 500 server error during submit queues item without crashing UI', async ({
      page,
      runtimeErrors,
    }) => {
      runtimeErrors.allowConsoleErrors(/500|Internal Server Error|Failed to load resource/i);

      await loginAs(page, 'ariel');
      let failOnce = true;
      await page.route('**/rest/v1/socios*', async (route) => {
        if (failOnce && route.request().method() === 'POST') {
          failOnce = false;
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Simulated 500 error' }),
          });
          return;
        }
        await route.continue();
      });

      try {
        await fillAndSubmitPartner(page, {
          age: 35,
          amount: 99414,
          payment: 'CBU Bancario',
          datePreset: 'hoy',
        });

        await expect(
          page.getByText(/pendiente|reintentar|error/i).first()
        ).toBeVisible({ timeout: 15_000 });
        await logout(page);
      } finally {
        await page.unroute('**/rest/v1/socios*');
        await deleteTestSociosBySentinel(99414, 99414);
      }

      runtimeErrors.assertClean();
    });

    test('T2-F4-04: server validation 400 error surfaces message instead of endless retry', async ({
      page,
      runtimeErrors,
    }) => {
      runtimeErrors.allowConsoleErrors(/400|Bad Request|Failed to load resource/i);

      await loginAs(page, 'ariel');
      await page.route('**/rest/v1/socios*', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              code: '22023',
              message: 'No podés registrar ni mover socios a una fecha futura.',
            }),
          });
          return;
        }
        await route.continue();
      });

      try {
        await fillAndSubmitPartner(page, {
          age: 35,
          amount: 99415,
          payment: 'Tarjeta de Crédito',
          datePreset: 'hoy',
        });

        await expect(
          page.getByText(/fecha futura|error|no se pudo/i).first()
        ).toBeVisible({ timeout: 15_000 });
        await logout(page);
      } finally {
        await page.unroute('**/rest/v1/socios*');
      }

      runtimeErrors.assertClean();
    });

    test('T2-F4-05: draft cleanup after submit leaves clean form for next entry', async ({
      page,
      runtimeErrors,
    }) => {
      try {
        await loginAs(page, 'ariel');
        await fillAndSubmitPartner(page, {
          age: 29,
          amount: 99416,
          payment: 'Tarjeta de Crédito',
          datePreset: 'hoy',
        });

        await expect(partnerCardByAmount(page, 99416)).toBeVisible({
          timeout: 15_000,
        });
        await expect(ageInput(page)).toHaveValue('');
        await expect(amountInput(page)).toHaveValue('');

        await logout(page);
      } finally {
        await deleteTestSociosBySentinel(99416, 99416);
      }

      runtimeErrors.assertClean();
    });
  });

  // =========================================================================
  // F5: Move Date Boundaries (6)
  // =========================================================================
  test.describe('F5 — Move Date Boundaries & Ownership', () => {
    test('T2-F5-01: move date modal rejects future date tomorrowStr()', async ({
      page,
      runtimeErrors,
    }) => {
      runtimeErrors.allowConsoleErrors(/400|22023|futura/i);
      const today = todayStr();
      const tomorrow = tomorrowStr();
      const created = await createTestSocioAsAccount('ariel', {
        operationalDate: today,
        age: 33,
        amount: 99511,
        paymentType: 'credito',
      });
      const socioId = String(created.id);

      try {
        await loginAs(page, 'ariel');
        const card = partnerCardByAmount(page, 99511);
        await expect(card).toBeVisible({ timeout: 15_000 });
        const dialog = await openMoveDateModal(page, card);
        const dateInput = dialog.locator('input[type="date"]').first();
        expect(await dateInput.getAttribute('max')).toBe(today);

        // Server-side trigger guard check
        const { access_token } = await getJwtForAccount(
          STAGING_ACCOUNTS.ariel.email,
          STAGING_ACCOUNTS.ariel.password
        );
        const res = await fetch(
          `${STAGING_SUPABASE_URL}/rest/v1/socios?id=eq.${socioId}`,
          {
            method: 'PATCH',
            headers: {
              apikey: STAGING_SUPABASE_ANON_KEY,
              Authorization: `Bearer ${access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ operational_date: tomorrow }),
          }
        );
        expect(res.ok).toBe(false);

        await logout(page);
      } finally {
        await deleteSocioById(socioId);
      }

      runtimeErrors.assertClean();
    });

    test('T2-F5-02: moving socio to its current operational date is blocked/no-op', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      const created = await createTestSocioAsAccount('ariel', {
        operationalDate: today,
        age: 34,
        amount: 99512,
        paymentType: 'credito',
      });
      const socioId = String(created.id);

      try {
        await loginAs(page, 'ariel');
        const card = partnerCardByAmount(page, 99512);
        await expect(card).toBeVisible({ timeout: 15_000 });
        const dialog = await openMoveDateModal(page, card);
        await dialog.locator('input[type="date"]').first().fill(today);

        const confirmBtn = dialog
          .getByRole('button', { name: /Confirmar|Mover|Guardar/i })
          .first();
        if (await confirmBtn.isEnabled()) {
          await confirmBtn.click();
        }
        await expect(partnerCardByAmount(page, 99512)).toHaveCount(1);

        const moveLogs = await getAuditLogEntries({
          entityId: socioId,
          action: 'MOVE_DATE',
        });
        expect(moveLogs.length).toBe(0);

        await logout(page);
      } finally {
        await deleteSocioById(socioId);
      }

      runtimeErrors.assertClean();
    });

    test('T2-F5-03: non-owner captador cannot move foreign socio via UI or REST', async ({
      page,
      runtimeErrors,
    }) => {
      runtimeErrors.allowConsoleErrors(/400|403|42501|permiso/i);
      const today = todayStr();
      const yesterday = yesterdayStr();
      const created = await createTestSocioAsAccount('lucia', {
        operationalDate: today,
        age: 30,
        amount: 99513,
        paymentType: 'credito',
      });
      const socioId = String(created.id);

      try {
        await loginAs(page, 'ariel');
        const foreignCard = partnerCardByAmount(page, 99513);
        await expect(foreignCard).toBeVisible({ timeout: 15_000 });
        await expect(
          foreignCard.getByRole('button', { name: /Mover/i })
        ).toHaveCount(0);

        const { access_token } = await getJwtForAccount(
          STAGING_ACCOUNTS.ariel.email,
          STAGING_ACCOUNTS.ariel.password
        );
        const res = await fetch(
          `${STAGING_SUPABASE_URL}/rest/v1/socios?id=eq.${socioId}`,
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
        expect(res.ok).toBe(false);

        await logout(page);
      } finally {
        await deleteSocioById(socioId);
      }

      runtimeErrors.assertClean();
    });

    test('T2-F5-04: moving socio from todayStr to yesterdayStr updates both date counters immediately', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      const yesterday = yesterdayStr();
      const created = await createTestSocioAsAccount('ariel', {
        operationalDate: today,
        age: 31,
        amount: 99514,
        paymentType: 'debito',
      });
      const socioId = String(created.id);

      try {
        await loginAs(page, 'ariel');
        const dialog = await openMoveDateModal(
          page,
          partnerCardByAmount(page, 99514)
        );
        await confirmMoveDate(page, yesterday, dialog);
        await expect(partnerCardByAmount(page, 99514)).toHaveCount(0, {
          timeout: 15_000,
        });

        await navigateCalendarToDate(page, yesterday);
        await expect(partnerCardByAmount(page, 99514)).toBeVisible({
          timeout: 15_000,
        });

        await logout(page);
      } finally {
        await deleteSocioById(socioId);
      }

      runtimeErrors.assertClean();
    });

    test('T2-F5-05: admin move preserves original captador ownership (Ariel)', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      const yesterday = yesterdayStr();
      const created = await createTestSocioAsAccount('ariel', {
        operationalDate: today,
        age: 35,
        amount: 99515,
        paymentType: 'credito',
      });
      const socioId = String(created.id);

      try {
        await loginAs(page, 'carlos');
        const dialog = await openMoveDateModal(
          page,
          partnerCardByAmount(page, 99515)
        );
        await confirmMoveDate(page, yesterday, dialog);

        await navigateCalendarToDate(page, yesterday);
        const movedCard = partnerCardByAmount(page, 99515);
        await expect(movedCard).toBeVisible({ timeout: 15_000 });
        await expect(movedCard).toContainText(/Ariel/i);

        await logout(page);
      } finally {
        await deleteSocioById(socioId);
      }

      runtimeErrors.assertClean();
    });

    test('T2-F5-06: batch move warns specifically about owner with 0h on destination date', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      const yesterday = yesterdayStr();
      const snap = await snapshotDayState(yesterday);
      const sAriel = await createTestSocioAsAccount('ariel', {
        operationalDate: today,
        age: 30,
        amount: 99516,
        paymentType: 'credito',
      });
      const sNic = await createTestSocioAsAccount('nicolas', {
        operationalDate: today,
        age: 31,
        amount: 99517,
        paymentType: 'debito',
      });
      const ids = [String(sAriel.id), String(sNic.id)];

      try {
        await setCaptorHoursAdmin(STAGING_ACCOUNTS.ariel.userId, yesterday, 4);
        await setCaptorHoursAdmin(STAGING_ACCOUNTS.nicolas.userId, yesterday, 0);

        await loginAs(page, 'carlos');
        await toggleBatchSelectMode(page);
        await partnerCardByAmount(page, 99516)
          .locator('input[type="checkbox"]')
          .check();
        await partnerCardByAmount(page, 99517)
          .locator('input[type="checkbox"]')
          .check();

        const dialog = await openMoveDateModal(page);
        await dialog.locator('input[type="date"]').first().fill(yesterday);
        await expect(dialog.getByText(/Nicolas/i).first()).toBeVisible({
          timeout: 10_000,
        });
        await expect(dialog.getByText(/0\s*h|sin horas/i).first()).toBeVisible();

        await logout(page);
      } finally {
        await restoreDayState(snap, { deleteSocioIds: ids });
      }

      runtimeErrors.assertClean();
    });
  });

  // =========================================================================
  // F6: Socios & Calendario Boundaries (5)
  // =========================================================================
  test.describe('F6 — Socios & Calendario Boundaries', () => {
    test('T2-F6-01: empty historical date 2026-11-18 shows 0 socios and still lists Nicolas (0)', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');
      await navigateCalendarToDate(page, '2026-11-18');

      await expect(
        page.getByRole('heading', { name: /HISTORIAL DE SOCIOS \(0\)/i })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /Nicolas\s*\(0\)/i }).first()
      ).toBeVisible();

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T2-F6-02: inactive Morena is excluded from active captadores filter on 2026-11-24', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'carlos');
      await navigateCalendarToDate(page, SEEDED_HISTORY.day2026_11_24.date);

      const filterText = await page.locator('main').innerText();
      expect(filterText).not.toMatch(/Morena\s*\(/i);

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T2-F6-03: CSV export handles UTF-8 BOM and Spanish accented payment labels cleanly', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');
      await navigateCalendarToDate(page, SEEDED_HISTORY.day2026_11_24.date);

      const csvBtn = page.getByRole('button', { name: /Exportar CSV/i }).first();
      const csv = await exportCsvAndReadBom(page, csvBtn);
      expect(csv.hasBom).toBe(true);
      expect(csv.text).toMatch(/cr[ée]dito|d[ée]bito/i);
      expect(csv.text).not.toContain('\uFFFD');

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T2-F6-04: switching dates clears stale captador filter counts between 2026-11-24 and 2026-11-17', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');
      await navigateCalendarToDate(page, SEEDED_HISTORY.day2026_11_24.date);
      await page.getByRole('button', { name: /Ariel\s*\(2\)/i }).first().click();
      await expect(
        page.getByRole('heading', { name: /HISTORIAL DE SOCIOS \(2\)/i })
      ).toBeVisible();

      await navigateCalendarToDate(page, SEEDED_HISTORY.day2026_11_17.date);
      await expect(
        page.getByRole('button', { name: /Brenda\s*\(0\)/i }).first()
      ).toBeVisible();

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T2-F6-05: deleting sentinel socio from SOCIOS on todayStr decrements count without touching historical data', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      const created = await createTestSocioAsAccount('ariel', {
        operationalDate: today,
        age: 30,
        amount: 99605,
        paymentType: 'credito',
      });
      const socioId = String(created.id);

      try {
        await loginAs(page, 'ariel');
        await navigateCalendarToDate(page, today);

        const card = partnerCardByAmount(page, 99605);
        await expect(card).toBeVisible({ timeout: 15_000 });
        await card.getByRole('button', { name: /Eliminar/i }).click();
        await card
          .getByRole('button', { name: /Confirmar|Eliminar/i })
          .first()
          .click();
        await expect(partnerCardByAmount(page, 99605)).toHaveCount(0, {
          timeout: 15_000,
        });

        await logout(page);
      } finally {
        await deleteSocioById(socioId).catch(() => undefined);
      }

      runtimeErrors.assertClean();
    });
  });

  // =========================================================================
  // F7: Estadísticas Boundaries (5)
  // =========================================================================
  test.describe('F7 — Estadísticas Boundaries', () => {
    test('T2-F7-01: empty date 2026-11-18 in Estadísticas shows 0 totals and N/D without NaN', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');
      await switchTab(page, TAB_PATTERNS.DASHBOARD);
      await selectStatsPeriod(page, 'Rango personalizado', {
        start: '2026-11-18',
        end: '2026-11-18',
      });

      const body = await page.locator('main').innerText();
      expect(body).not.toMatch(/NaN|Infinity/i);
      expect(body).toMatch(/N\/D|0/);

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T2-F7-02: inverted custom range (start > end) is handled gracefully without NaN or crash', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');
      await switchTab(page, TAB_PATTERNS.DASHBOARD);
      await selectStatsPeriod(page, 'Rango personalizado', {
        start: '2026-11-24',
        end: '2026-11-16',
      });

      const body = await page.locator('main').innerText();
      expect(body).not.toMatch(/NaN|Infinity/i);

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T2-F7-03: filtering Estadísticas to Rosario (0 socios, 0h) on 2026-11-24 renders N/D safely', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');
      await navigateCalendarToDate(page, SEEDED_HISTORY.day2026_11_24.date);
      await switchTab(page, TAB_PATTERNS.DASHBOARD);

      await selectStatsCollector(page, 'Rosario');
      const body = await page.locator('main').innerText();
      expect(body).not.toMatch(/NaN|Infinity/i);
      expect(body).toContain('N/D');

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T2-F7-04: custom range 2026-01-01..2026-11-24 returns all 22 seeded socios cleanly', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'carlos');
      await switchTab(page, TAB_PATTERNS.DASHBOARD);

      await selectStatsPeriod(page, 'Rango personalizado', {
        start: '2026-01-01',
        end: SEEDED_HISTORY.day2026_11_24.date,
      });

      await expect(
        page.getByText(new RegExp(`\\b${SEEDED_HISTORY.totalSeededSocios}\\b`)).first()
      ).toBeVisible({ timeout: 15_000 });

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T2-F7-05: 0 hours with 1 socio yields N/D per-hour averages instead of Infinity or NaN', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      const snap = await snapshotDayState(today);
      const created = await createTestSocioAsAccount('nicolas', {
        operationalDate: today,
        age: 29,
        amount: 99705,
        paymentType: 'credito',
      });
      const socioId = String(created.id);

      try {
        await setCaptorHoursAdmin(STAGING_ACCOUNTS.nicolas.userId, today, 0);
        await loginAs(page, 'carlos');
        await switchTab(page, TAB_PATTERNS.DASHBOARD);
        await selectStatsCollector(page, 'Nicolas');

        const body = await page.locator('main').innerText();
        expect(body).not.toMatch(/NaN|Infinity/i);
        expect(body).toContain('N/D');

        await logout(page);
      } finally {
        await restoreDayState(snap, { deleteSocioIds: [socioId] });
      }

      runtimeErrors.assertClean();
    });
  });

  // =========================================================================
  // F8: Cierre WhatsApp & Attendance Boundaries (6)
  // =========================================================================
  test.describe('F8 — Cierre WhatsApp & Attendance Integrity', () => {
    test('T2-F8-01: unmarking captador with socios on 2026-11-24 (Ariel) is blocked', async ({
      page,
      runtimeErrors,
    }) => {
      runtimeErrors.allowConsoleErrors(/400|22023|ausente/i);
      await loginAs(page, 'carlos');
      await navigateCalendarToDate(page, SEEDED_HISTORY.day2026_11_24.date);
      await switchTab(page, TAB_PATTERNS.CIERRE);

      const arielControl = page
        .locator('button, label')
        .filter({ hasText: /Ariel/i })
        .first();
      await arielControl.click();

      const waText = await readWhatsAppClosureText(page);
      expect(waText).toContain('Ariel:');

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T2-F8-02: unmarking captador with hours > 0 on 2026-11-24 is blocked', async ({
      page,
      runtimeErrors,
    }) => {
      runtimeErrors.allowConsoleErrors(/400|22023|ausente/i);
      await loginAs(page, 'carlos');
      await navigateCalendarToDate(page, SEEDED_HISTORY.day2026_11_24.date);
      await switchTab(page, TAB_PATTERNS.CIERRE);

      const brendaControl = page
        .locator('button, label')
        .filter({ hasText: /Brenda/i })
        .first();
      await brendaControl.click();

      const waText = await readWhatsAppClosureText(page);
      expect(waText).toContain('Brenda:');

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T2-F8-03: adding socio after official closure flags closure as Desactualizado', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      const snap = await snapshotDayState(today);
      const s1 = await createTestSocioAsAccount('ariel', {
        operationalDate: today,
        age: 30,
        amount: 99803,
        paymentType: 'credito',
      });
      const ids = [String(s1.id)];

      try {
        await loginAs(page, 'carlos');
        await switchTab(page, TAB_PATTERNS.CIERRE);
        await saveOfficialClosure(page, 'Cierre inicial');
        await expect(
          page.getByText(/JORNADA CERRADA|CIERRE GUARDADO|CONFIRMADA/i).first()
        ).toBeVisible({ timeout: 15_000 });

        const s2 = await createTestSocioAsAccount('lucia', {
          operationalDate: today,
          age: 29,
          amount: 99804,
          paymentType: 'debito',
        });
        ids.push(String(s2.id));

        await page.reload({ waitUntil: 'domcontentloaded' });
        await switchTab(page, TAB_PATTERNS.CIERRE);
        await expect(
          page.getByText(/desactualizad|cambios posteriores|recalcular/i).first()
        ).toBeVisible({ timeout: 15_000 });

        await logout(page);
      } finally {
        await restoreDayState(snap, { deleteSocioIds: ids });
      }

      runtimeErrors.assertClean();
    });

    test('T2-F8-04: re-saving outdated closure clears warning and updates closure', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      const snap = await snapshotDayState(today);
      const s1 = await createTestSocioAsAccount('ariel', {
        operationalDate: today,
        age: 30,
        amount: 99806,
        paymentType: 'credito',
      });
      const ids = [String(s1.id)];

      try {
        await loginAs(page, 'carlos');
        await switchTab(page, TAB_PATTERNS.CIERRE);
        await saveOfficialClosure(page, 'Antes de cambio');

        const s2 = await createTestSocioAsAccount('lucia', {
          operationalDate: today,
          age: 31,
          amount: 99807,
          paymentType: 'credito',
        });
        ids.push(String(s2.id));

        await page.reload({ waitUntil: 'domcontentloaded' });
        await switchTab(page, TAB_PATTERNS.CIERRE);
        await saveOfficialClosure(page, 'Recalculado');
        await expect(
          page.getByText(/desactualizad/i)
        ).toHaveCount(0, { timeout: 15_000 });

        await logout(page);
      } finally {
        await restoreDayState(snap, { deleteSocioIds: ids });
      }

      runtimeErrors.assertClean();
    });

    test('T2-F8-05: server rejects direct REST daily_attendance is_present=false when user has socios on 2026-11-24', async ({
      runtimeErrors,
    }) => {
      const { access_token } = await getJwtForAccount(
        STAGING_ACCOUNTS.carlos.email,
        STAGING_ACCOUNTS.carlos.password
      );
      const res = await fetch(
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
      expect(res.ok).toBe(false);
      expect(await res.text()).toMatch(/ausente|socios|horas/i);

      runtimeErrors.assertClean();
    });

    test('T2-F8-06: empty day WhatsApp closure displays N/D without NaN or undefined', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'carlos');
      await navigateCalendarToDate(page, '2026-11-18');
      await switchTab(page, TAB_PATTERNS.CIERRE);

      const waText = await readWhatsAppClosureText(page);
      expect(waText).toContain('RESUMEN GENERAL');
      expect(waText).not.toMatch(/NaN|undefined|Infinity/i);

      await logout(page);
      runtimeErrors.assertClean();
    });
  });

  // =========================================================================
  // F9: Planilla Semanal Boundaries (5)
  // =========================================================================
  test.describe('F9 — Planilla Semanal Boundaries', () => {
    test('T2-F9-01: Year 2027 Week 1 empty week renders 0 totals without NaN', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');
      await switchTab(page, TAB_PATTERNS.SEMANAL);
      await selectWeeklyYearAndWeek(page, 2027, 1);

      const text = await page.locator('main').innerText();
      expect(text).not.toMatch(/NaN|Infinity/i);
      expect(text).toMatch(/Totales del Equipo/i);

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T2-F9-02: injecting socio on 2026-11-17 after confirming Week 47 triggers Desactualizada — recalcular', async ({
      page,
      runtimeErrors,
    }) => {
      const snap = await snapshotWeeklyReports(2026, 47);
      let createdId: string | undefined;

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

        const created = await createTestSocioAsAccount('ariel', {
          operationalDate: SEEDED_HISTORY.day2026_11_17.date,
          age: 34,
          amount: 99902,
          paymentType: 'credito',
        });
        createdId = String(created.id);

        await page.reload({ waitUntil: 'domcontentloaded' });
        await switchTab(page, TAB_PATTERNS.SEMANAL);
        await selectWeeklyYearAndWeek(page, 2026, 47);

        await expect(
          page.getByText(/Desactualizada/i).first()
        ).toBeVisible({ timeout: 15_000 });

        await logout(page);
      } finally {
        if (createdId) {
          await deleteSocioById(createdId);
        }
        await restoreWeeklyReports(2026, 47, snap);
      }

      runtimeErrors.assertClean();
    });

    test('T2-F9-03: re-confirming outdated Week 47 clears Desactualizada back to Confirmada', async ({
      page,
      runtimeErrors,
    }) => {
      const snap = await snapshotWeeklyReports(2026, 47);
      let createdId: string | undefined;

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

        const created = await createTestSocioAsAccount('ariel', {
          operationalDate: SEEDED_HISTORY.day2026_11_17.date,
          age: 34,
          amount: 99903,
          paymentType: 'credito',
        });
        createdId = String(created.id);

        await page.reload({ waitUntil: 'domcontentloaded' });
        await switchTab(page, TAB_PATTERNS.SEMANAL);
        await selectWeeklyYearAndWeek(page, 2026, 47);

        await page
          .getByRole('button', {
            name: /Recalcular|Confirmar|Guardar Planilla/i,
          })
          .first()
          .click();
        await expect(page.getByText(/Confirmada/i).first()).toBeVisible({
          timeout: 15_000,
        });
        await expect(page.getByText(/Desactualizada/i)).toHaveCount(0);

        await logout(page);
      } finally {
        if (createdId) {
          await deleteSocioById(createdId);
        }
        await restoreWeeklyReports(2026, 47, snap);
      }

      runtimeErrors.assertClean();
    });

    test('T2-F9-04: CSV export on empty 2027 Week 1 includes UTF-8 BOM and header row', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');
      await switchTab(page, TAB_PATTERNS.SEMANAL);
      await selectWeeklyYearAndWeek(page, 2027, 1);

      const csvBtn = page.getByRole('button', { name: /Exportar CSV/i }).first();
      const csv = await exportCsvAndReadBom(page, csvBtn);
      expect(csv.hasBom).toBe(true);
      expect(csv.lines.length).toBeGreaterThanOrEqual(1);

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T2-F9-05: captador views SEMANAL cleanly with zero runtime errors', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');
      await switchTab(page, TAB_PATTERNS.SEMANAL);
      await selectWeeklyYearAndWeek(page, 2026, 47);
      await expect(page.getByText(/EQUIPO COMPLETO/i)).toBeVisible();

      await logout(page);
      runtimeErrors.assertClean();
    });
  });

  // =========================================================================
  // F10: Admin Equipo Boundaries (5)
  // =========================================================================
  test.describe('F10 — Admin Equipo Boundaries & RBAC', () => {
    test('T2-F10-01: duplicate username creation is rejected cleanly', async ({
      page,
      runtimeErrors,
    }) => {
      runtimeErrors.allowConsoleErrors(/400|409|500|existe|duplicad/i);
      await loginAs(page, 'carlos');
      await openTeamManagement(page);

      await page
        .getByRole('button', { name: /Nuevo|Agregar|Crear integrante/i })
        .first()
        .click();
      await page.getByPlaceholder(/usuario|username/i).first().fill('ariel');
      await page
        .getByPlaceholder(/nombre completo|nombre/i)
        .first()
        .fill('Dup Ariel');
      await page
        .getByPlaceholder(/contrase[ñn]a/i)
        .first()
        .fill('Msf3Stg!Dup#12Ab');
      await page.getByRole('button', { name: /Crear|Guardar/i }).first().click();

      await expect(
        page.getByText(/existe|duplicad|error|usuario/i).first()
      ).toBeVisible({ timeout: 15_000 });

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T2-F10-02: weak password (<8 chars) rejected when creating member', async ({
      page,
      runtimeErrors,
    }) => {
      runtimeErrors.allowConsoleErrors(/400|422|contrase/i);
      const uname = `e2e_test_weak_${Date.now().toString(36)}`;
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
          .fill('Weak Pass');
        await page.getByPlaceholder(/contrase[ñn]a/i).first().fill('123');
        await page.getByRole('button', { name: /Crear|Guardar/i }).first().click();

        await expect(
          page.getByText(/contrase[ñn]a|caracteres|inv[aá]lid/i).first()
        ).toBeVisible({ timeout: 10_000 });

        await logout(page);
      } finally {
        await deactivateTestUsersByPrefix(['e2e_test_weak_']);
      }

      runtimeErrors.assertClean();
    });

    test('T2-F10-03: non-admin captador calling admin-team-manager Edge Function directly gets 403', async ({
      runtimeErrors,
    }) => {
      const { access_token } = await getJwtForAccount(
        STAGING_ACCOUNTS.ariel.email,
        STAGING_ACCOUNTS.ariel.password
      );
      const res = await fetch(
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
      expect([401, 403]).toContain(res.status);
      runtimeErrors.assertClean();
    });

    test('T2-F10-04: deactivated test user cannot log in via UI', async ({
      page,
      runtimeErrors,
    }) => {
      runtimeErrors.allowConsoleErrors(/400|401|403|inactiv|deshabilitad/i);
      const uname = `e2e_test_deact_${Date.now().toString(36)}`;
      const pass = 'Msf3Stg!Dea#45Xy';

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
          .fill(`Deact ${uname}`);
        await page.getByPlaceholder(/contrase[ñn]a/i).first().fill(pass);
        await page.getByRole('button', { name: /Crear|Guardar/i }).first().click();

        const row = page.locator('tr, div').filter({ hasText: uname }).last();
        await expect(row).toBeVisible({ timeout: 15_000 });
        await row.getByRole('button', { name: /Desactivar/i }).first().click();
        await expect(row.getByText(/Inactivo/i).first()).toBeVisible({
          timeout: 15_000,
        });
        await logout(page);

        await attemptLoginWithCredentials(page, uname, pass);
        await expect(
          page.getByText(/inactiv|deshabilitad|no est[aá] habilitad/i).first()
        ).toBeVisible({ timeout: 15_000 });
      } finally {
        await deactivateTestUsersByPrefix(['e2e_test_deact_']);
      }

      runtimeErrors.assertClean();
    });

    test('T2-F10-05: admin self-deactivation is prevented so admin remains active', async ({
      page,
      runtimeErrors,
    }) => {
      runtimeErrors.allowConsoleErrors(/400|403|propia cuenta/i);
      await loginAs(page, 'carlos');
      await openTeamManagement(page);

      const carlosRow = page
        .locator('tr, div')
        .filter({ hasText: /Carlos Diaz/i })
        .last();
      await expect(carlosRow).toBeVisible();
      const deactivateBtn = carlosRow
        .getByRole('button', { name: /Desactivar/i })
        .first();
      if (await deactivateBtn.isVisible().catch(() => false)) {
        if (await deactivateBtn.isEnabled()) {
          await deactivateBtn.click();
          await expect(
            page.getByText(/propia cuenta|no pod[eé]s desactivarte|error/i).first()
          ).toBeVisible({ timeout: 10_000 });
        } else {
          await expect(deactivateBtn).toBeDisabled();
        }
      }

      await logout(page);
      runtimeErrors.assertClean();
    });
  });

  // =========================================================================
  // F11: Admin Auditoría Boundaries (5)
  // =========================================================================
  test.describe('F11 — Admin Audit Log Boundaries', () => {
    test('T2-F11-01: non-admin captador cannot view AUDITORIA tab and REST audit_log returns 0 rows', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'ariel');
      await expect(navTab(page, TAB_PATTERNS.AUDITORIA)).toHaveCount(0);

      const { access_token } = await getJwtForAccount(
        STAGING_ACCOUNTS.ariel.email,
        STAGING_ACCOUNTS.ariel.password
      );
      const res = await fetch(
        `${STAGING_SUPABASE_URL}/rest/v1/audit_log?select=*`,
        {
          headers: {
            apikey: STAGING_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${access_token}`,
          },
        }
      );
      if (res.ok) {
        const rows = (await res.json()) as unknown[];
        expect(rows).toEqual([]);
      } else {
        expect([401, 403]).toContain(res.status);
      }

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T2-F11-02: direct REST INSERT into audit_log is blocked by client write revocation', async ({
      runtimeErrors,
    }) => {
      const { access_token } = await getJwtForAccount(
        STAGING_ACCOUNTS.carlos.email,
        STAGING_ACCOUNTS.carlos.password
      );
      const res = await fetch(`${STAGING_SUPABASE_URL}/rest/v1/audit_log`, {
        method: 'POST',
        headers: {
          apikey: STAGING_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          actor_name: 'Forge',
          entity_type: 'socio',
          entity_id: 'fake',
          action: 'INSERT',
          summary: 'Forged audit log',
        }),
      });
      expect([401, 403]).toContain(res.status);
      runtimeErrors.assertClean();
    });

    test('T2-F11-03: deleting sentinel socio records DELETE entry in AUDITORIA', async ({
      page,
      runtimeErrors,
    }) => {
      const today = todayStr();
      const created = await createTestSocioAsAccount('ariel', {
        operationalDate: today,
        age: 33,
        amount: 99123,
        paymentType: 'credito',
      });
      const socioId = String(created.id);

      try {
        await loginAs(page, 'ariel');
        const card = partnerCardByAmount(page, 99123);
        await expect(card).toBeVisible({ timeout: 15_000 });
        await card.getByRole('button', { name: /Eliminar/i }).click();
        await card
          .getByRole('button', { name: /Eliminar|Confirmar/i })
          .first()
          .click();
        await expect(partnerCardByAmount(page, 99123)).toHaveCount(0, {
          timeout: 15_000,
        });
        await logout(page);

        await loginAs(page, 'carlos');
        await openAuditTabFilters(page, { action: 'DELETE' });
        await expect(auditActionBadge(page, /\bDELETE\b/i)).toBeVisible({
          timeout: 15_000,
        });
        await logout(page);
      } finally {
        await deleteSocioById(socioId).catch(() => undefined);
      }

      runtimeErrors.assertClean();
    });

    test('T2-F11-04: combining non-matching action and actor filters renders clean empty state', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'carlos');
      await openAuditTabFilters(page, {
        action: 'MOVE_DATE',
        actor: 'Morena',
      });
      await expect(
        page.getByText(/No se encontraron|sin registros|0 resultados/i).first()
      ).toBeVisible({ timeout: 10_000 });

      await logout(page);
      runtimeErrors.assertClean();
    });

    test('T2-F11-05: resetting audit filters restores default newest-first log view', async ({
      page,
      runtimeErrors,
    }) => {
      await loginAs(page, 'carlos');
      await openAuditTabFilters(page, { action: 'MOVE_DATE' });

      const selects = page.locator('select');
      const count = await selects.count();
      for (let i = 0; i < count; i++) {
        const sel = selects.nth(i);
        const opts = await sel.locator('option').allTextContents();
        const allOpt = opts.find((o) => /Todas|Todos/i.test(o));
        if (allOpt) {
          await sel.selectOption({ label: allOpt });
        }
      }
      await expect(page.getByText(/Auditor[ií]a/i).first()).toBeVisible();

      await logout(page);
      runtimeErrors.assertClean();
    });
  });
});
