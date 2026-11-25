import fs from 'node:fs/promises';
import { expect, type Locator, type Page } from '@playwright/test';
import { TAB_PATTERNS, switchTab } from './auth.ts';

export type PaymentChoice =
  | 'Tarjeta de Crédito'
  | 'Tarjeta de Débito'
  | 'CBU Bancario'
  | 'Prepaga / Billetera';

export interface PartnerFormInput {
  age: number | string;
  amount: number | string;
  payment: PaymentChoice;
  datePreset?: 'hoy' | 'ayer' | 'otra';
  customDate?: string;
}

export interface CsvExportResult {
  filename: string;
  hasBom: boolean;
  text: string;
  lines: string[];
}

export function ageInput(page: Page): Locator {
  return page.getByPlaceholder('Ej: 32');
}

export function amountInput(page: Page): Locator {
  return page.getByPlaceholder('Ej: 15000');
}

export function submitPartnerButton(page: Page): Locator {
  return page.getByRole('button', { name: /Agregar Socio/i });
}

export function paymentButton(page: Page, payment: PaymentChoice): Locator {
  return page.getByRole('button', { name: new RegExp(payment, 'i') });
}

export async function selectPartnerDate(
  page: Page,
  datePreset: 'hoy' | 'ayer' | 'otra',
  customDate?: string
): Promise<void> {
  if (datePreset === 'hoy') {
    await page.getByRole('button', { name: /^\s*Hoy\b/i }).first().click();
    return;
  }
  if (datePreset === 'ayer') {
    await page.getByRole('button', { name: /^\s*Ayer\b/i }).first().click();
    return;
  }
  await page.getByRole('button', { name: /Otra fecha/i }).first().click();
  if (customDate) {
    const dateInput = page.locator('input[type="date"]').first();
    await expect(dateInput).toBeVisible({ timeout: 10_000 });
    await dateInput.fill(customDate);
  }
}

export async function fillAndSubmitPartner(
  page: Page,
  input: PartnerFormInput
): Promise<void> {
  if (input.datePreset) {
    await selectPartnerDate(page, input.datePreset, input.customDate);
  }
  await ageInput(page).fill(String(input.age));
  await amountInput(page).fill(String(input.amount));
  await paymentButton(page, input.payment).click();
  await submitPartnerButton(page).click();
}

export function formatEsArThousands(amount: number): RegExp {
  const formatted = new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 0,
  }).format(amount);
  const escaped = formatted.replace(/\./g, '\\.');
  return new RegExp(`\\$?\\s*${escaped}(?!\\d)`);
}

export function partnerCardByAmount(page: Page, amount: number): Locator {
  return page
    .locator('div[class*="rounded-"][class*="border"]')
    .filter({ hasText: /#\d+/ })
    .filter({ hasText: formatEsArThousands(amount) })
    .filter({ hasText: /años/i })
    .filter({ hasText: /\/mes/i })
    .filter({
      hasNotText: /SOCIOS CARGADOS|HISTORIAL DE SOCIOS|REGISTRAR NUEVO SOCIO/i,
    });
}

export async function editMyHours(page: Page, hours: number): Promise<void> {
  const hoursCard = page
    .locator('div[class*="rounded-"][class*="border"]')
    .filter({ hasText: /MIS HORAS/i })
    .filter({ hasNotText: /CAPTADORES PRESENTES/i })
    .first();

  await expect(hoursCard).toBeVisible({ timeout: 10_000 });
  const editBtn = hoursCard.getByRole('button', { name: /Editar/i }).first();
  if (await editBtn.isVisible().catch(() => false)) {
    await editBtn.click();
  }
  const input = hoursCard.locator('input[type="number"]').first();
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill(String(hours));
  const saveBtn = hoursCard.getByRole('button', { name: /Guardar/i }).first();
  await saveBtn.click();
  await expect(hoursCard.getByRole('button', { name: /Editar/i }).first()).toBeVisible({
    timeout: 10_000,
  });
}

export async function setDeclaredCollectors(
  page: Page,
  count: number
): Promise<void> {
  const card = page
    .locator('div[class*="rounded-"][class*="border"]')
    .filter({ hasText: /CAPTADORES PRESENTES/i })
    .filter({ hasNotText: /MIS HORAS/i })
    .first();

  await expect(card).toBeVisible({ timeout: 10_000 });
  const modifyBtn = card.getByRole('button', { name: /Modificar/i }).first();
  if (await modifyBtn.isVisible().catch(() => false)) {
    await modifyBtn.click();
  }
  const input = card.locator('input[type="number"]').first();
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill(String(count));
  await card.getByRole('button', { name: /Guardar/i }).first().click();
  await expect(card.getByRole('button', { name: /Modificar/i }).first()).toBeVisible({
    timeout: 10_000,
  });
}

export async function openMoveDateModal(
  page: Page,
  card?: Locator
): Promise<Locator> {
  if (card) {
    const moveBtn = card
      .getByRole('button', { name: /Mover fecha|Mover/i })
      .first();
    await expect(moveBtn).toBeVisible({ timeout: 10_000 });
    await moveBtn.click();
  } else {
    const batchMoveBtn = page
      .getByRole('button', {
        name: /Mover\s+(?:seleccionados|a otra fecha|fecha)/i,
      })
      .first();
    await expect(batchMoveBtn).toBeVisible({ timeout: 10_000 });
    await batchMoveBtn.click();
  }

  const dialog = page
    .locator('[role="dialog"], div.fixed')
    .filter({ hasText: /Mover/i })
    .last();
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

export async function confirmMoveDate(
  page: Page,
  targetDate: string,
  dialog?: Locator
): Promise<void> {
  const modal =
    dialog ??
    page
      .locator('[role="dialog"], div.fixed')
      .filter({ hasText: /Mover/i })
      .last();
  await expect(modal).toBeVisible({ timeout: 10_000 });
  const dateInput = modal.locator('input[type="date"]').first();
  await expect(dateInput).toBeVisible({ timeout: 10_000 });
  await dateInput.fill(targetDate);
  const confirmBtn = modal
    .getByRole('button', { name: /Confirmar|Mover|Guardar/i })
    .first();
  await confirmBtn.click();
}

export async function toggleBatchSelectMode(page: Page): Promise<void> {
  const btn = page
    .getByRole('button', {
      name: /Selecci[oó]n\s*m[uú]ltiple|Seleccionar\s*varios|Cancelar\s*selecci[oó]n/i,
    })
    .first();
  await expect(btn).toBeVisible({ timeout: 10_000 });
  await btn.click();
}

export async function exportCsvAndReadBom(
  page: Page,
  triggerButton: Locator
): Promise<CsvExportResult> {
  await expect(triggerButton).toBeVisible({ timeout: 10_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20_000 }),
    triggerButton.click(),
  ]);
  const filePath = await download.path();
  expect(filePath, 'Playwright download.path() returned null').not.toBeNull();
  const buf = await fs.readFile(filePath!);
  const hasBom =
    buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const text = buf.subarray(hasBom ? 3 : 0).toString('utf8');
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  return {
    filename: download.suggestedFilename(),
    hasBom,
    text,
    lines,
  };
}

export async function readWhatsAppClosureText(page: Page): Promise<string> {
  const area = page.locator('textarea[readonly]').first();
  await expect(area).toBeVisible({ timeout: 10_000 });
  return area.inputValue();
}

export async function saveOfficialClosure(
  page: Page,
  notes?: string
): Promise<void> {
  if (notes !== undefined) {
    const notesInput = page
      .locator('textarea:not([readonly]), input[placeholder*="observ" i], input[placeholder*="nota" i]')
      .first();
    await expect(notesInput).toBeVisible({ timeout: 10_000 });
    await notesInput.fill(notes);
  }
  const saveBtn = page
    .getByRole('button', {
      name: /Guardar Cierre|Confirmar Cierre|Cerrar Jornada|Actualizar Cierre/i,
    })
    .first();
  await expect(saveBtn).toBeVisible({ timeout: 10_000 });
  await saveBtn.click();
}

export async function selectStatsPeriod(
  page: Page,
  period: 'Día actual' | 'Semana' | 'Mes' | 'Rango personalizado',
  range?: { start: string; end: string }
): Promise<void> {
  const periodBtn = page
    .getByRole('button', { name: new RegExp(`^${period}$|${period}`, 'i') })
    .first();
  if (await periodBtn.isVisible().catch(() => false)) {
    await periodBtn.click();
  } else {
    const select = page
      .locator('select')
      .filter({ hasText: /Día actual|Rango personalizado/i })
      .first();
    await expect(select).toBeVisible({ timeout: 10_000 });
    await select.selectOption({ label: period });
  }

  if (period === 'Rango personalizado' && range) {
    const dateInputs = page.locator('input[type="date"]');
    await expect(dateInputs.first()).toBeVisible({ timeout: 10_000 });
    await dateInputs.nth(0).fill(range.start);
    await dateInputs.nth(1).fill(range.end);
  }
}

export async function selectStatsCollector(
  page: Page,
  collectorLabel: string
): Promise<void> {
  const select = page
    .locator('select')
    .filter({ hasText: /Todos|Equipo completo/i })
    .first();
  await expect(select).toBeVisible({ timeout: 10_000 });
  const options = await select.locator('option').allTextContents();
  const matched = options.find((opt) =>
    new RegExp(collectorLabel, 'i').test(opt.trim())
  );
  expect(
    matched,
    `Stats collector option "${collectorLabel}" not found in [${options.join(', ')}]`
  ).toBeDefined();
  await select.selectOption({ label: matched! });
}

export async function selectWeeklyYearAndWeek(
  page: Page,
  year: number,
  week: number
): Promise<void> {
  const yearSelect = page
    .locator('select')
    .filter({ hasText: /2026|2027/ })
    .filter({ hasNotText: /Semana/i })
    .first();
  await expect(yearSelect).toBeVisible({ timeout: 10_000 });
  await yearSelect.selectOption(String(year));

  const weekSelect = page
    .locator('select')
    .filter({ hasText: /Semana\s+\d+/i })
    .first();
  await expect(weekSelect).toBeVisible({ timeout: 10_000 });
  const options = await weekSelect.locator('option').allTextContents();
  const matched = options.find((opt) =>
    new RegExp(`Semana\\s+${week}\\b`, 'i').test(opt)
  );
  expect(
    matched,
    `Week ${week} not found for year ${year} in [${options.join(', ')}]`
  ).toBeDefined();
  await weekSelect.selectOption({ label: matched! });
}

export async function openTeamManagement(page: Page): Promise<void> {
  await switchTab(page, TAB_PATTERNS.EQUIPO);
  await expect(
    page.getByText(/Gesti[oó]n de Equipo|Equipo/i).first()
  ).toBeVisible({ timeout: 10_000 });
}

export async function openAuditTabFilters(
  page: Page,
  opts?: { action?: string; actor?: string }
): Promise<void> {
  await switchTab(page, TAB_PATTERNS.AUDITORIA);
  await expect(
    page.getByText(/Auditor[ií]a/i).first()
  ).toBeVisible({ timeout: 10_000 });

  if (opts?.action) {
    const actionSelect = page
      .locator('select')
      .filter({ hasText: /MOVE_DATE|Todas las acciones|Acci[oó]n/i })
      .first();
    await expect(actionSelect).toBeVisible({ timeout: 10_000 });
    const options = await actionSelect.locator('option').allTextContents();
    const matched = options.find((opt) =>
      new RegExp(opts.action!, 'i').test(opt)
    );
    expect(matched, `Audit action "${opts.action}" not found`).toBeDefined();
    await actionSelect.selectOption({ label: matched! });
  }

  if (opts?.actor) {
    const actorSelect = page
      .locator('select')
      .filter({ hasText: /Todos los usuarios|Todos|Actor/i })
      .last();
    if (await actorSelect.isVisible().catch(() => false)) {
      const options = await actorSelect.locator('option').allTextContents();
      const matched = options.find((opt) =>
        new RegExp(opts.actor!, 'i').test(opt)
      );
      expect(matched, `Audit actor "${opts.actor}" not found`).toBeDefined();
      await actorSelect.selectOption({ label: matched! });
    } else {
      const searchInput = page
        .getByPlaceholder(/usuario|actor|buscar/i)
        .first();
      await expect(searchInput).toBeVisible({ timeout: 10_000 });
      await searchInput.fill(opts.actor);
    }
  }
}

export function auditActionBadge(page: Page, actionPattern: RegExp): Locator {
  return page
    .locator('tbody tr, [data-audit-row], [role="row"], td, li, span, p, div')
    .filter({ hasNot: page.locator('select') })
    .filter({ hasText: actionPattern })
    .first();
}

export async function navigateCalendarToDate(
  page: Page,
  yyyyMmDd: string
): Promise<void> {
  await switchTab(page, TAB_PATTERNS.SOCIOS);
  const dateInput = page.locator('input[type="date"]').first();
  await expect(dateInput).toBeVisible({ timeout: 10_000 });
  await dateInput.fill(yyyyMmDd);
  const [yyyy, mm, dd] = yyyyMmDd.split('-');
  await expect(page.getByText(`${dd}/${mm}/${yyyy}`).first()).toBeVisible({
    timeout: 10_000,
  });
}
