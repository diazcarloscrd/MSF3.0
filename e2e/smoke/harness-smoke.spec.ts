import { test, expect } from '../fixtures/test.ts';
import {
  TAB_PATTERNS,
  gotoApp,
  loginAs,
  logout,
  navTab,
  passwordInput,
  submitLoginButton,
  switchTab,
  usernameInput,
} from '../helpers/auth.ts';
import { getSociosForDate } from '../helpers/stagingCleanup.ts';
import { SEEDED_HISTORY, todayStr } from '../helpers/stagingEnv.ts';

test.describe('Harness Smoke — MSF 3.0 Staging', () => {
  test('serves / and /instructivo.html with HTTP 200 and renders login screen', async ({
    page,
    request,
    runtimeErrors,
  }) => {
    const rootRes = await request.get('/');
    expect(rootRes.status()).toBe(200);

    const instructivoRes = await request.get('/instructivo.html');
    expect(instructivoRes.status()).toBe(200);
    const instructivoHtml = await instructivoRes.text();
    expect(instructivoHtml).toContain('MANUAL DE USO');

    await gotoApp(page);
    await expect(
      page.getByRole('heading', { name: /M[ÉE]DICOS SIN FRONTERAS/i })
    ).toBeVisible({ timeout: 15_000 });
    await expect(usernameInput(page)).toBeVisible();
    await expect(passwordInput(page)).toBeVisible();
    await expect(submitLoginButton(page)).toBeVisible();

    runtimeErrors.assertClean();
  });

  test('captador (ariel) logs in against msf3-staging, renders tabs, and logs out cleanly', async ({
    page,
    runtimeErrors,
  }) => {
    await loginAs(page, 'ariel');

    const captadorTabs = [
      TAB_PATTERNS.CARGA,
      TAB_PATTERNS.DASHBOARD,
      TAB_PATTERNS.SOCIOS,
      TAB_PATTERNS.CIERRE,
      TAB_PATTERNS.SEMANAL,
    ];

    for (const tabPattern of captadorTabs) {
      await expect(navTab(page, tabPattern)).toBeVisible();
    }

    await switchTab(page, TAB_PATTERNS.DASHBOARD);
    await expect(page.getByText(/TOTAL PUNTOS JORNADA/i)).toBeVisible();

    await switchTab(page, TAB_PATTERNS.SOCIOS);
    await expect(page.getByText(/CONSULTAR POR FECHA/i)).toBeVisible();

    await switchTab(page, TAB_PATTERNS.CIERRE);
    await expect(page.getByText(/CIERRE DE JORNADA Y WHATSAPP/i)).toBeVisible();

    await switchTab(page, TAB_PATTERNS.SEMANAL);
    await expect(page.getByText(/EQUIPO COMPLETO/i)).toBeVisible();

    await switchTab(page, TAB_PATTERNS.CARGA);
    await expect(page.getByText(/REGISTRAR NUEVO SOCIO/i)).toBeVisible();

    await logout(page);
    runtimeErrors.assertClean();
  });

  test('admin (carlos) logs in against msf3-staging, verifies live today & historical seeded data, and logs out cleanly', async ({
    page,
    runtimeErrors,
  }) => {
    await loginAs(page, 'carlos');

    await expect(
      page.locator('header').getByText(/Carlos Diaz/i)
    ).toBeVisible();

    const sociosHeading = page.getByRole('heading', {
      name: /SOCIOS CARGADOS HOY \(\d+\)/i,
    });
    await expect(sociosHeading).toBeVisible({ timeout: 15_000 });
    await expect(async () => {
      const liveTodayCount = (await getSociosForDate(todayStr())).length;
      await expect(sociosHeading).toHaveText(
        new RegExp(`SOCIOS CARGADOS HOY \\(${liveTodayCount}\\)`, 'i')
      );
    }).toPass({ timeout: 10_000 });

    await expect(page.locator('a[href="/instructivo.html"]')).toBeVisible();

    await switchTab(page, TAB_PATTERNS.SOCIOS);
    const calendarInput = page.locator('input[type="date"]').first();
    await expect(calendarInput).toBeVisible({ timeout: 10_000 });
    await calendarInput.fill(SEEDED_HISTORY.day2026_11_24.date);

    await expect(
      page.getByRole('heading', {
        name: new RegExp(
          `HISTORIAL DE SOCIOS \\(${SEEDED_HISTORY.day2026_11_24.sociosCount}\\)`,
          'i'
        ),
      })
    ).toBeVisible({ timeout: 15_000 });

    await logout(page);
    runtimeErrors.assertClean();
  });
});
