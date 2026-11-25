import { expect, type Locator, type Page } from '@playwright/test';

export async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    docScrollWidth: document.documentElement.scrollWidth,
    docClientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
    viewportMeta:
      document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '',
  }));

  expect(metrics.docScrollWidth).toBeLessThanOrEqual(metrics.docClientWidth);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
  expect(metrics.viewportMeta).toContain('width=device-width');
  expect(metrics.viewportMeta).not.toMatch(/width\s*=\s*750/);
}

export async function assertTabsAccessibleAndUnclipped(
  page: Page,
  tabPatterns: readonly RegExp[]
): Promise<void> {
  const viewportWidth = page.viewportSize()?.width ?? 1280;
  for (const pattern of tabPatterns) {
    const tab = page
      .locator('nav')
      .locator('button, [role="tab"]')
      .filter({ hasText: pattern });
    await expect(tab).toBeVisible();
    await tab.scrollIntoViewIfNeeded();
    const box = await tab.boundingBox();
    expect(box, `Missing bounding box for tab ${pattern}`).not.toBeNull();
    if (!box) continue;
    expect(box.width).toBeGreaterThanOrEqual(40);
    expect(box.height).toBeGreaterThanOrEqual(36);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewportWidth + 1);

    const textClip = await tab.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(textClip.scrollWidth).toBeLessThanOrEqual(textClip.clientWidth + 2);
  }
}

export async function assertScrollResetsOnTabSwitch(
  page: Page,
  targetTab: Locator
): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo(0, 600);
    const main = document.querySelector('main');
    if (main && main.scrollHeight > main.clientHeight) {
      main.scrollTop = 400;
    }
  });
  await targetTab.click();
  const scrollPos = await page.evaluate(() => ({
    windowY: window.scrollY,
    mainTop: document.querySelector('main')?.scrollTop ?? 0,
  }));
  expect(scrollPos.windowY).toBe(0);
  expect(scrollPos.mainTop).toBe(0);
}

export async function assertActionButtonsTouchGeometry(
  page: Page,
  buttonNamePattern: RegExp,
  minSize = 44,
  minGap = 8
): Promise<number> {
  const buttons = page.getByRole('button', { name: buttonNamePattern });

  const rects = await buttons.evaluateAll((els) => {
    const parentIds = new Map<Element | null, number>();
    let nextParentId = 1;
    const out: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
      parentGroupId: number;
      label: string;
    }> = [];

    for (const el of els) {
      const style = window.getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) === 0
      ) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      const parent = el.parentElement;
      let parentGroupId = parentIds.get(parent);
      if (parentGroupId === undefined) {
        parentGroupId = nextParentId++;
        parentIds.set(parent, parentGroupId);
      }

      out.push({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        parentGroupId,
        label: (
          el.textContent ||
          el.getAttribute('title') ||
          el.getAttribute('aria-label') ||
          ''
        ).trim(),
      });
    }
    return out;
  });

  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    expect(
      rect.width,
      `Action button "${rect.label}" (#${i}) width ${rect.width} < ${minSize}`
    ).toBeGreaterThanOrEqual(minSize);
    expect(
      rect.height,
      `Action button "${rect.label}" (#${i}) height ${rect.height} < ${minSize}`
    ).toBeGreaterThanOrEqual(minSize);
  }

  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      if (a.parentGroupId !== b.parentGroupId) continue;
      const horizGap = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width));
      const vertGap = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height));
      if (horizGap < -1 && vertGap < -1) {
        throw new Error(
          `Overlapping action buttons "${a.label}" and "${b.label}" inside same container (horizGap=${horizGap}px, vertGap=${vertGap}px)`
        );
      }
      const sameRow = Math.abs(a.y - b.y) < Math.min(a.height, b.height);
      if (sameRow) {
        if (horizGap >= -1) {
          expect(
            horizGap,
            `Horizontal gap between "${a.label}" and "${b.label}" was ${horizGap}px < ${minGap}px`
          ).toBeGreaterThanOrEqual(minGap);
        } else {
          expect(
            vertGap,
            `Vertical gap between "${a.label}" and "${b.label}" was ${vertGap}px < ${minGap}px`
          ).toBeGreaterThanOrEqual(minGap);
        }
      } else {
        if (vertGap >= -1) {
          expect(
            vertGap,
            `Vertical gap between "${a.label}" and "${b.label}" was ${vertGap}px < ${minGap}px`
          ).toBeGreaterThanOrEqual(minGap);
        } else {
          expect(
            horizGap,
            `Horizontal gap between "${a.label}" and "${b.label}" was ${horizGap}px < ${minGap}px`
          ).toBeGreaterThanOrEqual(minGap);
        }
      }
    }
  }

  return rects.length;
}
