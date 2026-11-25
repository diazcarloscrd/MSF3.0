import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';
import { assertStagingTarget } from '../helpers/stagingEnv.ts';

export interface RuntimeErrorTracker {
  consoleErrors: string[];
  pageErrors: string[];
  corsFailures: string[];
  allowConsoleErrors: (pattern: RegExp) => void;
  assertClean: (opts?: { ignoreConsolePatterns?: RegExp[] }) => void;
}

export async function installStagingBypassRoute(
  context: BrowserContext,
  baseURL?: string
): Promise<void> {
  assertStagingTarget(baseURL);

  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypassSecret && baseURL) {
    const targetOrigin = new URL(baseURL).origin;
    await context.route(`${targetOrigin}/**`, async (route) => {
      const reqUrl = route.request().url();
      if (new URL(reqUrl).origin !== targetOrigin) {
        await route.continue();
        return;
      }
      await route.continue({
        headers: {
          ...route.request().headers(),
          'x-vercel-protection-bypass': bypassSecret,
          'x-vercel-set-bypass-cookie': 'true',
        },
      });
    });
  }
}

export async function createStagingContext(
  browser: Browser,
  baseURL?: string,
  options?: BrowserContextOptions
): Promise<BrowserContext> {
  assertStagingTarget(baseURL);
  const context = await browser.newContext(options);
  try {
    await installStagingBypassRoute(context, baseURL);
    return context;
  } catch (err) {
    await context.close();
    throw err;
  }
}

export const test = base.extend<{
  runtimeErrors: RuntimeErrorTracker;
}>({
  context: async ({ context, baseURL }, use) => {
    await installStagingBypassRoute(context, baseURL);
    await use(context);
  },

  runtimeErrors: async ({ page }, use) => {
    const tracker = attachRuntimeErrorTracker(page);
    await use(tracker);
  },
});

export function attachRuntimeErrorTracker(page: Page): RuntimeErrorTracker {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const corsFailures: string[] = [];
  const allowedPatterns: RegExp[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      consoleErrors.push(text);
      if (/cors|access-control-allow/i.test(text)) {
        corsFailures.push(text);
      }
    }
  });

  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  return {
    consoleErrors,
    pageErrors,
    corsFailures,
    allowConsoleErrors: (pattern: RegExp) => {
      allowedPatterns.push(pattern);
    },
    assertClean: (opts?: { ignoreConsolePatterns?: RegExp[] }) => {
      expect(
        corsFailures,
        `CORS errors detected: ${corsFailures.join('; ')}`
      ).toEqual([]);
      expect(
        pageErrors,
        `Uncaught page errors: ${pageErrors.join('; ')}`
      ).toEqual([]);
      const allAllowed = [
        ...allowedPatterns,
        ...(opts?.ignoreConsolePatterns ?? []),
      ];
      const unexpectedConsole = consoleErrors.filter(
        (msg) => !allAllowed.some((re) => re.test(msg))
      );
      expect(
        unexpectedConsole,
        `Console errors: ${unexpectedConsole.join('; ')}`
      ).toEqual([]);
    },
  };
}

export { expect };
