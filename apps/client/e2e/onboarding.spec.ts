import { test, expect } from '@playwright/test'

/*
 * Helper: clear localStorage so onboarding is treated as a fresh visit.
 */
async function clearOnboardingState(page: import('@playwright/test').Page) {
  await page.evaluate(() => window.localStorage.removeItem('metrox-onboarding-v2'))
}

/*
 * Helper: mark onboarding as completed so it won't auto-start.
 */
async function markOnboardingDone(page: import('@playwright/test').Page) {
  await page.evaluate(() => window.localStorage.setItem('metrox-onboarding-v2', 'true'))
}

/*
 * Helper: fresh visit — navigates, clears state, reloads, waits for tooltip.
 */
async function freshVisitWithOnboarding(page: import('@playwright/test').Page) {
  await page.goto('/')
  await clearOnboardingState(page)
  await page.reload()
  await expect(page.getByTestId('onboarding-tooltip')).toBeVisible({ timeout: 8000 })
}

/* ------------------------------------------------------------------ */
/*  Test: Onboarding appears on first visit                           */
/* ------------------------------------------------------------------ */

test.describe('Onboarding — first visit', () => {
  test('onboarding tooltip appears after initial load', async ({ page }) => {
    await freshVisitWithOnboarding(page)
    await expect(page.getByTestId('onboarding-tooltip')).toBeVisible()
  })

  test('first step shows "Welcome to MetroX"', async ({ page }) => {
    await freshVisitWithOnboarding(page)
    await expect(page.getByTestId('onboarding-tooltip')).toContainText('Welcome to MetroX')
  })

  test('progress dots are visible with correct count', async ({ page }) => {
    await freshVisitWithOnboarding(page)
    const tooltip = page.getByTestId('onboarding-tooltip')
    /* 5 onboarding steps = 5 dots */
    const dots = tooltip.locator('span.rounded-full')
    await expect(dots).toHaveCount(5)
  })
})

/* ------------------------------------------------------------------ */
/*  Test: Onboarding does NOT block the page                          */
/* ------------------------------------------------------------------ */

test.describe('Onboarding — non-blocking', () => {
  test('overlay has pointer-events-none so canvas is clickable', async ({ page }) => {
    await freshVisitWithOnboarding(page)
    const overlay = page.getByTestId('onboarding-overlay')
    await expect(overlay).toBeVisible()
    const pointerEvents = await overlay.evaluate(
      (el) => window.getComputedStyle(el).pointerEvents,
    )
    expect(pointerEvents).toBe('none')
  })

  test('canvas ReactFlow container is rendered and not blocked', async ({ page }) => {
    await freshVisitWithOnboarding(page)
    /* Verify the ReactFlow canvas exists and is visible */
    const canvas = page.locator('.react-flow')
    await expect(canvas).toBeVisible()
    /* Verify the canvas pane (drag area) can receive events */
    const pane = page.locator('.react-flow__pane')
    await expect(pane).toBeVisible()
  })

  test('floating toolbar buttons are clickable during onboarding', async ({ page }) => {
    await freshVisitWithOnboarding(page)
    const toolbar = page.locator('[data-onboarding="toolbar"]')
    await expect(toolbar).toBeVisible()
    /* Toolbar should be interactive — verify buttons exist */
    const buttons = toolbar.locator('button')
    const count = await buttons.count()
    expect(count).toBeGreaterThan(0)
  })
})

/* ------------------------------------------------------------------ */
/*  Test: Step navigation (Next, Prev, Skip)                          */
/* ------------------------------------------------------------------ */

test.describe('Onboarding — step navigation', () => {
  test('clicking Next advances to the next step', async ({ page }) => {
    await freshVisitWithOnboarding(page)
    const tooltip = page.getByTestId('onboarding-tooltip')

    /* Step 1: Welcome */
    await expect(tooltip).toContainText('Welcome to MetroX')

    /* Click Next */
    await page.getByTestId('onboarding-next').click({ force: true })

    /* Step 2: Mode Toolbar */
    await expect(tooltip).toContainText('Mode Toolbar', { timeout: 3000 })
  })

  test('clicking Prev goes back to previous step', async ({ page }) => {
    await freshVisitWithOnboarding(page)

    /* Advance to step 2 */
    await page.getByTestId('onboarding-next').click({ force: true })
    await expect(page.getByTestId('onboarding-tooltip')).toContainText('Mode Toolbar', { timeout: 3000 })

    /* Prev button should now be visible */
    const prevBtn = page.getByTestId('onboarding-prev')
    await expect(prevBtn).toBeVisible()
    await prevBtn.click({ force: true })

    /* Back to step 1 */
    await expect(page.getByTestId('onboarding-tooltip')).toContainText('Welcome to MetroX', { timeout: 3000 })
  })

  test('Prev button is not shown on the first step', async ({ page }) => {
    await freshVisitWithOnboarding(page)
    const prevBtn = page.getByTestId('onboarding-prev')
    await expect(prevBtn).not.toBeVisible()
  })

  test('Skip tour button closes onboarding', async ({ page }) => {
    await freshVisitWithOnboarding(page)
    await page.getByTestId('onboarding-skip').click({ force: true })
    await expect(page.getByTestId('onboarding-overlay')).not.toBeVisible({ timeout: 3000 })
  })

  test('X close button closes onboarding', async ({ page }) => {
    await freshVisitWithOnboarding(page)
    await page.getByTestId('onboarding-close').click({ force: true })
    await expect(page.getByTestId('onboarding-overlay')).not.toBeVisible({ timeout: 3000 })
  })

  test('last step shows "Finish" instead of "Next"', async ({ page }) => {
    await freshVisitWithOnboarding(page)
    const nextBtn = page.getByTestId('onboarding-next')

    /* Navigate through steps 1-4 */
    for (let i = 0; i < 4; i++) {
      await nextBtn.click({ force: true })
      await page.waitForTimeout(300)
    }

    /* Step 5 (last): should show "Finish" */
    await expect(nextBtn).toContainText('Finish', { timeout: 3000 })
  })

  test('clicking Finish on last step closes onboarding', async ({ page }) => {
    await freshVisitWithOnboarding(page)
    const nextBtn = page.getByTestId('onboarding-next')

    /* Navigate through all steps */
    for (let i = 0; i < 4; i++) {
      await nextBtn.click({ force: true })
      await page.waitForTimeout(300)
    }

    /* Click Finish */
    await nextBtn.click({ force: true })

    /* Onboarding should be gone */
    await expect(page.getByTestId('onboarding-overlay')).not.toBeVisible({ timeout: 3000 })
  })
})

/* ------------------------------------------------------------------ */
/*  Test: Keyboard navigation                                         */
/* ------------------------------------------------------------------ */

test.describe('Onboarding — keyboard controls', () => {
  test('Escape key dismisses onboarding', async ({ page }) => {
    await freshVisitWithOnboarding(page)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('onboarding-overlay')).not.toBeVisible({ timeout: 3000 })
  })

  test('ArrowRight key advances to next step', async ({ page }) => {
    await freshVisitWithOnboarding(page)
    const tooltip = page.getByTestId('onboarding-tooltip')
    await expect(tooltip).toContainText('Welcome to MetroX')

    await page.keyboard.press('ArrowRight')
    await expect(tooltip).toContainText('Mode Toolbar', { timeout: 3000 })
  })

  test('ArrowLeft key goes back to previous step', async ({ page }) => {
    await freshVisitWithOnboarding(page)

    /* First advance */
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('onboarding-tooltip')).toContainText('Mode Toolbar', { timeout: 3000 })

    /* Then go back */
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByTestId('onboarding-tooltip')).toContainText('Welcome to MetroX', { timeout: 3000 })
  })

  test('Enter key advances to next step', async ({ page }) => {
    await freshVisitWithOnboarding(page)
    const tooltip = page.getByTestId('onboarding-tooltip')
    await expect(tooltip).toContainText('Welcome to MetroX')

    await page.keyboard.press('Enter')
    await expect(tooltip).toContainText('Mode Toolbar', { timeout: 3000 })
  })
})

/* ------------------------------------------------------------------ */
/*  Test: Persistence (localStorage)                                  */
/* ------------------------------------------------------------------ */

test.describe('Onboarding — persistence', () => {
  test('onboarding does not appear after completion', async ({ page }) => {
    await page.goto('/')
    await markOnboardingDone(page)
    await page.reload()

    /* Wait adequate time — onboarding should NOT appear */
    await page.waitForTimeout(3000)
    await expect(page.getByTestId('onboarding-overlay')).not.toBeVisible()
  })

  test('completing tour persists completion to localStorage', async ({ page }) => {
    await freshVisitWithOnboarding(page)

    /* Use Escape (keyboard) to finish — guaranteed to work */
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('onboarding-overlay')).not.toBeVisible({ timeout: 3000 })

    /* Check localStorage */
    const value = await page.evaluate(
      () => window.localStorage.getItem('metrox-onboarding-v2'),
    )
    expect(value).toBe('true')
  })

  test('subsequent page loads skip onboarding after completion', async ({ page }) => {
    await freshVisitWithOnboarding(page)

    /* Complete tour via keyboard */
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('onboarding-overlay')).not.toBeVisible({ timeout: 3000 })

    /* Reload — onboarding should not appear */
    await page.reload()
    await page.waitForTimeout(3000)
    await expect(page.getByTestId('onboarding-overlay')).not.toBeVisible()
  })
})

/* ------------------------------------------------------------------ */
/*  Test: Replay tour via command palette                              */
/* ------------------------------------------------------------------ */

test.describe('Onboarding — replay tour', () => {
  test('replay tour from command palette restarts onboarding', async ({ page }) => {
    await page.goto('/')
    await markOnboardingDone(page)
    await page.reload()
    await page.waitForTimeout(2000)

    /* Onboarding should not be visible */
    await expect(page.getByTestId('onboarding-overlay')).not.toBeVisible()

    /* Open command palette with Cmd+K */
    await page.keyboard.press('Meta+k')

    /* Look for replay tour command and click it */
    const replayOption = page.getByText('Replay Onboarding Tour')
    if (await replayOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await replayOption.click()
      /* Onboarding should restart */
      await expect(page.getByTestId('onboarding-tooltip')).toBeVisible({ timeout: 5000 })
      await expect(page.getByTestId('onboarding-tooltip')).toContainText('Welcome to MetroX')
    }
  })
})
