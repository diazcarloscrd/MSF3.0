import { expect, type Locator, type Page } from '@playwright/test';
import { STAGING_ACCOUNTS, type StagingAccountKey } from './stagingEnv.ts';

export const TAB_PATTERNS = {
  CARGA: /Carga(?:\s*&\s*Horas)?/i,
  DASHBOARD: /Estad[ií]sticas|Dashboard/i,
  SOCIOS: /Socios(?:\s*&\s*Calendario)?/i,
  CIERRE: /Cierre(?:\s*WhatsApp)?/i,
  SEMANAL: /Planilla\s*Semanal|Semanal/i,
  EQUIPO: /Equipo/i,
  AUDITORIA: /Auditor[ií]a/i,
} as const;

export function usernameInput(page: Page): Locator {
  return page.locator('input[autocomplete="username"]');
}

export function passwordInput(page: Page): Locator {
  return page.locator('input[autocomplete="current-password"]');
}

export function submitLoginButton(page: Page): Locator {
  return page.getByRole('button', { name: /Ingresar a la Jornada/i });
}

export function logoutButton(page: Page): Locator {
  return page.getByRole('button', { name: /Salir/i });
}

export async function gotoApp(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
}

export async function attemptLoginWithCredentials(
  page: Page,
  username: string,
  password: string
): Promise<void> {
  await gotoApp(page);
  const userField = usernameInput(page);
  await expect(userField).toBeVisible({ timeout: 15_000 });
  await userField.fill(username);
  await passwordInput(page).fill(password);
  await submitLoginButton(page).click();
}

export async function loginAs(
  page: Page,
  accountKey: StagingAccountKey
): Promise<void> {
  const account = STAGING_ACCOUNTS[accountKey];
  await attemptLoginWithCredentials(page, account.username, account.password);
  await expect(logoutButton(page)).toBeVisible({ timeout: 20_000 });
}

export async function loginWithCustomCredentials(
  page: Page,
  username: string,
  password: string
): Promise<void> {
  await attemptLoginWithCredentials(page, username, password);
  await expect(logoutButton(page)).toBeVisible({ timeout: 20_000 });
}

export async function logout(page: Page): Promise<void> {
  const btn = logoutButton(page);
  await expect(btn).toBeVisible({ timeout: 10_000 });
  await btn.click();
  await expect(usernameInput(page)).toBeVisible({ timeout: 15_000 });
}

export function navTab(page: Page, pattern: RegExp): Locator {
  return page
    .locator('nav')
    .locator('button, [role="tab"]')
    .filter({ hasText: pattern });
}

export async function switchTab(page: Page, pattern: RegExp): Promise<void> {
  const tab = navTab(page, pattern);
  await expect(tab).toBeVisible({ timeout: 10_000 });
  await tab.scrollIntoViewIfNeeded();
  await tab.click();
}

export async function getLastUsernameStorage(page: Page): Promise<string | null> {
  return page.evaluate(() => window.localStorage.getItem('msf_last_username'));
}
