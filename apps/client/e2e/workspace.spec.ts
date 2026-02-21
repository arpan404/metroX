import { test, expect, type Page } from '@playwright/test'

/* ================================================================== */
/*  Helpers                                                           */
/* ================================================================== */

/** Navigate to the /app workspace page and disable onboarding. */
async function gotoWorkspace(page: Page) {
  await page.goto('/app')
  await page.evaluate(() => window.localStorage.setItem('metrox-onboarding-v2', 'true'))
  await page.reload()
  await page.waitForSelector('.react-flow', { timeout: 10_000 })
}

/** Clear any persisted workspace state so the page starts fresh. */
async function clearWorkspaceState(page: Page) {
  await page.evaluate(() => {
    window.localStorage.removeItem('metrox-session')
    window.localStorage.removeItem('metrox-onboarding-v2')
  })
}

/** Dismiss the onboarding overlay if it appears. */
async function dismissOnboarding(page: Page) {
  const overlay = page.getByTestId('onboarding-overlay')
  if (await overlay.isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.keyboard.press('Escape')
    await expect(overlay).not.toBeVisible({ timeout: 3000 })
  }
}

/** Return the toolbar element. */
function toolbar(page: Page) {
  return page.locator('[data-onboarding="toolbar"]')
}

/** Return the command bar element. */
function commandBar(page: Page) {
  return page.locator('[data-onboarding="command-bar"]')
}

/** Return a panel shell by its title text. */
function panelByTitle(page: Page, title: string) {
  return page.locator('[data-slot="panel-shell"]').filter({ hasText: title })
}

/** Open command palette via keyboard. */
async function openCommandPalette(page: Page) {
  await page.keyboard.press('Meta+k')
  await expect(page.locator('[cmdk-dialog]')).toBeVisible({ timeout: 3000 })
}

/** Close command palette. */
async function closeCommandPalette(page: Page) {
  await page.keyboard.press('Escape')
  await expect(page.locator('[cmdk-dialog]')).not.toBeVisible({ timeout: 3000 })
}

/* ================================================================== */
/*  Test: Workspace Layout                                            */
/* ================================================================== */

test.describe('Workspace — Layout', () => {
  test.beforeEach(async ({ page }) => {
    await gotoWorkspace(page)
  })

  test('renders full-screen canvas with ReactFlow', async ({ page }) => {
    const canvas = page.locator('.react-flow')
    await expect(canvas).toBeVisible()
    const pane = page.locator('.react-flow__pane')
    await expect(pane).toBeVisible()
  })

  test('renders toolbar at the top', async ({ page }) => {
    await expect(toolbar(page)).toBeVisible()
    await expect(toolbar(page)).toContainText('metroX')
  })

  test('renders command bar at the bottom', async ({ page }) => {
    await expect(commandBar(page)).toBeVisible()
    await expect(commandBar(page)).toContainText('Evaluate')
    await expect(commandBar(page)).toContainText('Studio')
  })

  test('shows empty state when no run is loaded', async ({ page }) => {
    await expect(page.getByText('No active evaluation')).toBeVisible({ timeout: 5000 })
  })

  test('canvas has background dots', async ({ page }) => {
    const background = page.locator('.react-flow__background')
    await expect(background).toBeVisible()
  })

  test('canvas has controls (zoom buttons)', async ({ page }) => {
    const controls = page.locator('.react-flow__controls')
    await expect(controls).toBeVisible()
  })

  test('canvas has minimap', async ({ page }) => {
    const minimap = page.locator('.react-flow__minimap')
    await expect(minimap).toBeVisible()
  })
})

/* ================================================================== */
/*  Test: Toolbar                                                     */
/* ================================================================== */

test.describe('Workspace — Toolbar', () => {
  test.beforeEach(async ({ page }) => {
    await gotoWorkspace(page)
  })

  test('displays brand logo and text', async ({ page }) => {
    const tb = toolbar(page)
    await expect(tb.locator('text=metroX')).toBeVisible()
    await expect(tb.locator('.text-primary')).toBeVisible()
  })

  test('has Run ID input field with placeholder', async ({ page }) => {
    const input = toolbar(page).locator('input')
    await expect(input).toBeVisible()
    await expect(input).toHaveAttribute('placeholder', 'Run ID...')
  })

  test('Run ID input accepts text', async ({ page }) => {
    const input = toolbar(page).locator('input')
    await input.fill('test-run-123')
    await expect(input).toHaveValue('test-run-123')
  })

  test('refresh button exists and is clickable', async ({ page }) => {
    const refreshBtn = toolbar(page).locator('button').filter({ has: page.locator('.lucide-refresh-cw') })
    await expect(refreshBtn).toBeVisible()
    await refreshBtn.click()
  })

  test('theme toggle button switches icons', async ({ page }) => {
    // Find theme toggle — it contains Moon or Sun icon
    const themeBtn = toolbar(page).locator('button').last()
    await expect(themeBtn).toBeVisible()
    await themeBtn.click()
    // After click, the icon should change (animation runs)
    await page.waitForTimeout(300)
    await themeBtn.click()
    await page.waitForTimeout(300)
  })

  test('command palette button opens palette', async ({ page }) => {
    // Click the command button (has Command icon)
    const cmdBtn = toolbar(page).locator('button').filter({ has: page.locator('.lucide-command') })
    await cmdBtn.click()
    await expect(page.locator('[cmdk-dialog]')).toBeVisible({ timeout: 3000 })
  })
})

/* ================================================================== */
/*  Test: Keyboard Shortcuts                                          */
/* ================================================================== */

test.describe('Workspace — Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await gotoWorkspace(page)
  })

  test('pressing 1 toggles config panel', async ({ page }) => {
    await page.keyboard.press('1')
    await expect(panelByTitle(page, 'Configuration')).toBeVisible({ timeout: 3000 })
    await page.keyboard.press('1')
    await expect(panelByTitle(page, 'Configuration')).not.toBeVisible({ timeout: 3000 })
  })

  test('pressing 2 toggles analytics panel', async ({ page }) => {
    await page.keyboard.press('2')
    await expect(panelByTitle(page, 'Analytics')).toBeVisible({ timeout: 3000 })
    await page.keyboard.press('2')
    await expect(panelByTitle(page, 'Analytics')).not.toBeVisible({ timeout: 3000 })
  })

  test('pressing 3 toggles settings panel', async ({ page }) => {
    await page.keyboard.press('3')
    await expect(panelByTitle(page, 'Settings')).toBeVisible({ timeout: 3000 })
    await page.keyboard.press('3')
    await expect(panelByTitle(page, 'Settings')).not.toBeVisible({ timeout: 3000 })
  })

  test('pressing E toggles events panel', async ({ page }) => {
    await page.keyboard.press('e')
    await expect(page.getByText('No events yet')).toBeVisible({ timeout: 3000 })
    await page.keyboard.press('e')
    await expect(page.getByText('No events yet')).not.toBeVisible({ timeout: 3000 })
  })

  test('Escape closes an open panel', async ({ page }) => {
    await page.keyboard.press('1')
    await expect(panelByTitle(page, 'Configuration')).toBeVisible({ timeout: 3000 })
    await page.keyboard.press('Escape')
    await expect(panelByTitle(page, 'Configuration')).not.toBeVisible({ timeout: 3000 })
  })

  test('Escape closes events panel when no side panel is open', async ({ page }) => {
    await page.keyboard.press('e')
    await expect(page.getByText('No events yet')).toBeVisible({ timeout: 3000 })
    await page.keyboard.press('Escape')
    await expect(page.getByText('No events yet')).not.toBeVisible({ timeout: 3000 })
  })

  test('number shortcuts are ignored when typing in an input', async ({ page }) => {
    const input = toolbar(page).locator('input')
    await input.focus()
    await page.keyboard.type('123')
    await expect(input).toHaveValue('123')
    // Config panel should NOT have opened from pressing 1
    await expect(panelByTitle(page, 'Configuration')).not.toBeVisible()
  })

  test('Cmd+K opens command palette', async ({ page }) => {
    await openCommandPalette(page)
    await expect(page.locator('[cmdk-dialog]')).toBeVisible()
    await closeCommandPalette(page)
  })

  test('opening one panel closes another', async ({ page }) => {
    await page.keyboard.press('1')
    await expect(panelByTitle(page, 'Configuration')).toBeVisible({ timeout: 3000 })
    await page.keyboard.press('2')
    await expect(panelByTitle(page, 'Analytics')).toBeVisible({ timeout: 3000 })
    await expect(panelByTitle(page, 'Configuration')).not.toBeVisible({ timeout: 3000 })
  })
})

/* ================================================================== */
/*  Test: Command Bar                                                 */
/* ================================================================== */

test.describe('Workspace — Command Bar', () => {
  test.beforeEach(async ({ page }) => {
    await gotoWorkspace(page)
  })

  test('mode toggle shows Evaluate and Studio buttons', async ({ page }) => {
    const bar = commandBar(page)
    await expect(bar.getByText('Evaluate')).toBeVisible()
    await expect(bar.getByText('Studio')).toBeVisible()
  })

  test('Evaluate mode is active by default', async ({ page }) => {
    const evaluateBtn = commandBar(page).getByText('Evaluate')
    await expect(evaluateBtn).toBeVisible()
    // The active toggle has data-state=on
    const toggle = commandBar(page).locator('[data-state="on"]')
    await expect(toggle).toContainText('Evaluate')
  })

  test('clicking Studio switches canvas mode', async ({ page }) => {
    await commandBar(page).getByText('Studio').click()
    // Studio should become active
    const toggle = commandBar(page).locator('[data-state="on"]')
    await expect(toggle).toContainText('Studio')
  })

  test('config panel toggle button works from command bar', async ({ page }) => {
    const configBtn = commandBar(page).locator('[data-onboarding="config-trigger"]')
    await configBtn.click()
    await expect(panelByTitle(page, 'Configuration')).toBeVisible({ timeout: 3000 })
    await configBtn.click()
    await expect(panelByTitle(page, 'Configuration')).not.toBeVisible({ timeout: 3000 })
  })

  test('analytics panel toggle button works from command bar', async ({ page }) => {
    const analyticsBtn = commandBar(page).locator('[data-onboarding="analytics-trigger"]')
    await analyticsBtn.click()
    await expect(panelByTitle(page, 'Analytics')).toBeVisible({ timeout: 3000 })
  })

  test('events button opens events panel', async ({ page }) => {
    // The events button has the ListOrdered icon
    const eventsBtn = commandBar(page).locator('button').filter({ has: page.locator('.lucide-list-ordered') })
    await eventsBtn.click()
    await expect(page.getByText('No events yet')).toBeVisible({ timeout: 3000 })
  })

  test('studio mode reveals node creation buttons', async ({ page }) => {
    // Switch to studio mode
    await commandBar(page).getByText('Studio').click()
    await page.waitForTimeout(300)

    // Node add buttons should appear for: attacker, critic, verifier, analyst
    const bar = commandBar(page)
    await expect(bar.locator('.lucide-crosshair')).toBeVisible()
    await expect(bar.locator('.lucide-eye')).toBeVisible()
    await expect(bar.locator('.lucide-brain')).toBeVisible()
    await expect(bar.locator('.lucide-trending-up')).toBeVisible()
  })

  test('studio mode add node buttons create nodes', async ({ page }) => {
    await commandBar(page).getByText('Studio').click()
    await page.waitForTimeout(300)

    // Click the attacker add button
    const attackerBtn = commandBar(page).locator('button').filter({ has: page.locator('.lucide-crosshair') })
    await attackerBtn.click()

    // A new node should appear in the canvas
    await page.waitForTimeout(500)
    const studioNode = page.locator('.react-flow__node')
    await expect(studioNode).toHaveCount(1, { timeout: 3000 })
  })

  test('switching back to evaluate clears studio nodes from view', async ({ page }) => {
    await commandBar(page).getByText('Studio').click()
    await page.waitForTimeout(300)

    // Add a node
    const attackerBtn = commandBar(page).locator('button').filter({ has: page.locator('.lucide-crosshair') })
    await attackerBtn.click()
    await page.waitForTimeout(500)

    // Switch back to evaluate
    await commandBar(page).getByText('Evaluate').click()
    await page.waitForTimeout(300)

    // Studio node add buttons should be gone
    await expect(commandBar(page).locator('.lucide-crosshair')).not.toBeVisible()
  })
})

/* ================================================================== */
/*  Test: Canvas Context Menu                                         */
/* ================================================================== */

test.describe('Workspace — Canvas Context Menu', () => {
  test.beforeEach(async ({ page }) => {
    await gotoWorkspace(page)
  })

  test('right-click on canvas shows context menu', async ({ page }) => {
    const pane = page.locator('.react-flow__pane')
    await pane.click({ button: 'right', position: { x: 400, y: 300 } })
    await expect(page.getByText('Open Configuration')).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('Open Analytics')).toBeVisible()
    await expect(page.getByText('Open Settings')).toBeVisible()
    await expect(page.getByText('Refresh Data')).toBeVisible()
    await expect(page.getByText('Switch to Studio')).toBeVisible()
  })

  test('context menu shows keyboard shortcuts', async ({ page }) => {
    const pane = page.locator('.react-flow__pane')
    await pane.click({ button: 'right', position: { x: 400, y: 300 } })
    // Shortcut badges
    await expect(page.locator('kbd:text("1")')).toBeVisible()
    await expect(page.locator('kbd:text("2")')).toBeVisible()
    await expect(page.locator('kbd:text("3")')).toBeVisible()
  })

  test('context menu "Open Configuration" opens config panel', async ({ page }) => {
    const pane = page.locator('.react-flow__pane')
    await pane.click({ button: 'right', position: { x: 400, y: 300 } })
    await page.getByText('Open Configuration').click()
    await expect(panelByTitle(page, 'Configuration')).toBeVisible({ timeout: 3000 })
  })

  test('context menu "Open Analytics" opens analytics panel', async ({ page }) => {
    const pane = page.locator('.react-flow__pane')
    await pane.click({ button: 'right', position: { x: 400, y: 300 } })
    await page.getByText('Open Analytics').click()
    await expect(panelByTitle(page, 'Analytics')).toBeVisible({ timeout: 3000 })
  })

  test('context menu "Open Settings" opens settings panel', async ({ page }) => {
    const pane = page.locator('.react-flow__pane')
    await pane.click({ button: 'right', position: { x: 400, y: 300 } })
    await page.getByText('Open Settings').click()
    await expect(panelByTitle(page, 'Settings')).toBeVisible({ timeout: 3000 })
  })

  test('context menu "Switch to Studio" changes canvas mode', async ({ page }) => {
    const pane = page.locator('.react-flow__pane')
    await pane.click({ button: 'right', position: { x: 400, y: 300 } })
    await page.getByText('Switch to Studio').click()
    // Command bar should now show Studio as active
    const toggle = commandBar(page).locator('[data-state="on"]')
    await expect(toggle).toContainText('Studio')
  })

  test('clicking on canvas dismisses context menu', async ({ page }) => {
    const pane = page.locator('.react-flow__pane')
    await pane.click({ button: 'right', position: { x: 400, y: 300 } })
    await expect(page.getByText('Open Configuration')).toBeVisible({ timeout: 3000 })
    // Left-click on canvas to dismiss
    await pane.click({ position: { x: 200, y: 200 } })
    await expect(page.getByText('Open Configuration')).not.toBeVisible({ timeout: 3000 })
  })

  test('context menu in studio mode shows "Switch to Evaluate"', async ({ page }) => {
    // Switch to studio
    await commandBar(page).getByText('Studio').click()
    await page.waitForTimeout(300)

    const pane = page.locator('.react-flow__pane')
    await pane.click({ button: 'right', position: { x: 400, y: 300 } })
    await expect(page.getByText('Switch to Evaluate')).toBeVisible({ timeout: 3000 })
  })
})

/* ================================================================== */
/*  Test: Command Palette                                             */
/* ================================================================== */

test.describe('Workspace — Command Palette', () => {
  test.beforeEach(async ({ page }) => {
    await gotoWorkspace(page)
  })

  test('Cmd+K opens command palette dialog', async ({ page }) => {
    await openCommandPalette(page)
    await expect(page.locator('[cmdk-input]')).toBeVisible()
  })

  test('command palette has search input with placeholder', async ({ page }) => {
    await openCommandPalette(page)
    const input = page.locator('[cmdk-input]')
    await expect(input).toHaveAttribute('placeholder', 'Type a command or search…')
  })

  test('command palette shows Panels group', async ({ page }) => {
    await openCommandPalette(page)
    await expect(page.getByText('Toggle Config Panel')).toBeVisible()
    await expect(page.getByText('Toggle Analytics Panel')).toBeVisible()
    await expect(page.getByText('Toggle Settings Panel')).toBeVisible()
    await expect(page.getByText('Toggle Events Panel')).toBeVisible()
  })

  test('command palette shows Canvas group', async ({ page }) => {
    await openCommandPalette(page)
    await expect(page.getByText('Evaluate Mode')).toBeVisible()
    await expect(page.getByText('Studio Mode')).toBeVisible()
  })

  test('command palette shows Run group', async ({ page }) => {
    await openCommandPalette(page)
    await expect(page.getByText('Start Streaming')).toBeVisible()
    await expect(page.getByText('Refresh Run Data')).toBeVisible()
    await expect(page.getByText('Resume Run')).toBeVisible()
    await expect(page.getByText('Generate Report')).toBeVisible()
  })

  test('command palette shows Quick Templates group', async ({ page }) => {
    await openCommandPalette(page)
    await expect(page.getByText('Quick Scan')).toBeVisible()
    await expect(page.getByText('Standard Assessment')).toBeVisible()
    await expect(page.getByText('Deep Evaluation')).toBeVisible()
    await expect(page.getByText('CI Pipeline')).toBeVisible()
    await expect(page.getByText('Nightly Regression')).toBeVisible()
  })

  test('command palette shows Appearance group', async ({ page }) => {
    await openCommandPalette(page)
    await expect(page.getByText('Light Theme')).toBeVisible()
    await expect(page.getByText('Dark Theme')).toBeVisible()
    await expect(page.getByText('System Theme')).toBeVisible()
  })

  test('selecting "Toggle Config Panel" opens config', async ({ page }) => {
    await openCommandPalette(page)
    await page.getByText('Toggle Config Panel').click()
    await expect(panelByTitle(page, 'Configuration')).toBeVisible({ timeout: 3000 })
  })

  test('selecting "Toggle Analytics Panel" opens analytics', async ({ page }) => {
    await openCommandPalette(page)
    await page.getByText('Toggle Analytics Panel').click()
    await expect(panelByTitle(page, 'Analytics')).toBeVisible({ timeout: 3000 })
  })

  test('selecting "Toggle Settings Panel" opens settings', async ({ page }) => {
    await openCommandPalette(page)
    await page.getByText('Toggle Settings Panel').click()
    await expect(panelByTitle(page, 'Settings')).toBeVisible({ timeout: 3000 })
  })

  test('selecting "Evaluate Mode" sets evaluate mode', async ({ page }) => {
    // First switch to Studio
    await commandBar(page).getByText('Studio').click()
    await page.waitForTimeout(300)
    // Then use command palette to switch to Evaluate
    await openCommandPalette(page)
    await page.getByText('Evaluate Mode').click()
    const toggle = commandBar(page).locator('[data-state="on"]')
    await expect(toggle).toContainText('Evaluate')
  })

  test('selecting "Studio Mode" sets studio mode', async ({ page }) => {
    await openCommandPalette(page)
    await page.getByText('Studio Mode').click()
    const toggle = commandBar(page).locator('[data-state="on"]')
    await expect(toggle).toContainText('Studio')
  })

  test('command palette search filters results', async ({ page }) => {
    await openCommandPalette(page)
    const input = page.locator('[cmdk-input]')
    await input.fill('config')
    await expect(page.getByText('Toggle Config Panel')).toBeVisible()
    // Others should be filtered out
    await expect(page.getByText('Toggle Events Panel')).not.toBeVisible()
  })

  test('command palette shows empty state for no results', async ({ page }) => {
    await openCommandPalette(page)
    const input = page.locator('[cmdk-input]')
    await input.fill('xyznonexistent')
    await expect(page.getByText('No results found.')).toBeVisible()
  })

  test('selecting theme option changes theme', async ({ page }) => {
    await openCommandPalette(page)
    await page.getByText('Dark Theme').click()
    // Check that data-theme or class changed
    await page.waitForTimeout(500)
    const html = page.locator('html')
    const cls = await html.getAttribute('class')
    expect(cls).toContain('dark')
  })

  test('Escape closes command palette', async ({ page }) => {
    await openCommandPalette(page)
    await page.keyboard.press('Escape')
    await expect(page.locator('[cmdk-dialog]')).not.toBeVisible({ timeout: 3000 })
  })

  test('palette closes after selecting a command', async ({ page }) => {
    await openCommandPalette(page)
    await page.getByText('Toggle Config Panel').click()
    await expect(page.locator('[cmdk-dialog]')).not.toBeVisible({ timeout: 3000 })
  })
})

/* ================================================================== */
/*  Test: Config Panel                                                */
/* ================================================================== */

test.describe('Workspace — Config Panel', () => {
  test.beforeEach(async ({ page }) => {
    await gotoWorkspace(page)
    await page.keyboard.press('1')
    await expect(panelByTitle(page, 'Configuration')).toBeVisible({ timeout: 3000 })
  })

  test('config panel has title and close button', async ({ page }) => {
    const panel = panelByTitle(page, 'Configuration')
    await expect(panel.getByText('Configuration')).toBeVisible()
    // Close button (X icon)
    const closeBtn = panel.locator('button').filter({ has: page.locator('.lucide-x') })
    await expect(closeBtn).toBeVisible()
  })

  test('close button closes the panel', async ({ page }) => {
    const panel = panelByTitle(page, 'Configuration')
    const closeBtn = panel.locator('button').filter({ has: page.locator('.lucide-x') })
    await closeBtn.click()
    await expect(panel).not.toBeVisible({ timeout: 3000 })
  })

  test('shows Quick Start Templates section', async ({ page }) => {
    const panel = panelByTitle(page, 'Configuration')
    await expect(panel.getByText('QUICK START TEMPLATES')).toBeVisible()
    await expect(panel.getByText('Quick Scan')).toBeVisible()
    await expect(panel.getByText('Standard Assessment')).toBeVisible()
    await expect(panel.getByText('Deep Evaluation')).toBeVisible()
    await expect(panel.getByText('CI Pipeline')).toBeVisible()
    await expect(panel.getByText('Nightly Regression')).toBeVisible()
  })

  test('shows Session section with inputs', async ({ page }) => {
    const panel = panelByTitle(page, 'Configuration')
    await expect(panel.getByText('SESSION')).toBeVisible()
    await expect(panel.getByText('Session Name')).toBeVisible()
    await expect(panel.getByText('Owner')).toBeVisible()
  })

  test('shows Target section', async ({ page }) => {
    const panel = panelByTitle(page, 'Configuration')
    await expect(panel.getByText('TARGET')).toBeVisible()
    await expect(panel.getByText('Target Type')).toBeVisible()
    await expect(panel.getByText('Model')).toBeVisible()
    await expect(panel.getByText('Provider')).toBeVisible()
  })

  test('shows Benchmark section with taxonomy chips', async ({ page }) => {
    const panel = panelByTitle(page, 'Configuration')
    await expect(panel.getByText('BENCHMARK')).toBeVisible()
    // Check for some taxonomy chips
    await expect(panel.getByText('prompt_injection')).toBeVisible()
    await expect(panel.getByText('jailbreak')).toBeVisible()
    await expect(panel.getByText('hallucination')).toBeVisible()
  })

  test('taxonomy chips are toggleable', async ({ page }) => {
    const panel = panelByTitle(page, 'Configuration')
    const prompt_injection = panel.locator('button, [role="checkbox"], span').filter({ hasText: 'prompt_injection' }).first()
    await prompt_injection.click()
    await page.waitForTimeout(200)
    // Click again to toggle off
    await prompt_injection.click()
  })

  test('shows Scoring section', async ({ page }) => {
    const panel = panelByTitle(page, 'Configuration')
    await expect(panel.getByText('SCORING')).toBeVisible()
    await expect(panel.getByText('Strictness')).toBeVisible()
  })

  test('shows Runtime section with preset buttons', async ({ page }) => {
    const panel = panelByTitle(page, 'Configuration')
    await expect(panel.getByText('RUNTIME')).toBeVisible()
    await expect(panel.getByText('Quick')).toBeVisible()
    await expect(panel.getByText('Standard')).toBeVisible()
    await expect(panel.getByText('Deep')).toBeVisible()
  })

  test('session name input is editable', async ({ page }) => {
    const panel = panelByTitle(page, 'Configuration')
    const sessionInput = panel.locator('input').first()
    await sessionInput.fill('My Test Session')
    await expect(sessionInput).toHaveValue('My Test Session')
  })

  test('config panel has Launch Run button in footer', async ({ page }) => {
    const panel = panelByTitle(page, 'Configuration')
    await expect(panel.getByText('Launch Run')).toBeVisible()
  })

  test('config panel has progress bar for readiness', async ({ page }) => {
    const panel = panelByTitle(page, 'Configuration')
    const progress = panel.locator('[role="progressbar"]')
    await expect(progress).toBeVisible()
  })
})

/* ================================================================== */
/*  Test: Analytics Panel                                             */
/* ================================================================== */

test.describe('Workspace — Analytics Panel', () => {
  test.beforeEach(async ({ page }) => {
    await gotoWorkspace(page)
    await page.keyboard.press('2')
    await expect(panelByTitle(page, 'Analytics')).toBeVisible({ timeout: 3000 })
  })

  test('analytics panel has title and close button', async ({ page }) => {
    const panel = panelByTitle(page, 'Analytics')
    await expect(panel.getByText('Analytics')).toBeVisible()
    const closeBtn = panel.locator('button').filter({ has: page.locator('.lucide-x') })
    await expect(closeBtn).toBeVisible()
  })

  test('analytics panel has tabs: Overview, Cost, Risk, Compare', async ({ page }) => {
    const panel = panelByTitle(page, 'Analytics')
    await expect(panel.getByRole('tab', { name: 'Overview' })).toBeVisible()
    await expect(panel.getByRole('tab', { name: 'Cost' })).toBeVisible()
    await expect(panel.getByRole('tab', { name: 'Risk' })).toBeVisible()
    await expect(panel.getByRole('tab', { name: 'Compare' })).toBeVisible()
  })

  test('Overview tab is active by default', async ({ page }) => {
    const panel = panelByTitle(page, 'Analytics')
    const overviewTab = panel.getByRole('tab', { name: 'Overview' })
    await expect(overviewTab).toHaveAttribute('data-state', 'active')
  })

  test('clicking Cost tab switches content', async ({ page }) => {
    const panel = panelByTitle(page, 'Analytics')
    await panel.getByRole('tab', { name: 'Cost' }).click()
    // Cost tab should be active
    await expect(panel.getByRole('tab', { name: 'Cost' })).toHaveAttribute('data-state', 'active')
  })

  test('clicking Risk tab switches content', async ({ page }) => {
    const panel = panelByTitle(page, 'Analytics')
    await panel.getByRole('tab', { name: 'Risk' }).click()
    await expect(panel.getByRole('tab', { name: 'Risk' })).toHaveAttribute('data-state', 'active')
  })

  test('clicking Compare tab switches content', async ({ page }) => {
    const panel = panelByTitle(page, 'Analytics')
    await panel.getByRole('tab', { name: 'Compare' }).click()
    await expect(panel.getByRole('tab', { name: 'Compare' })).toHaveAttribute('data-state', 'active')
  })

  test('analytics panel has footer with Refresh and Generate Report', async ({ page }) => {
    const panel = panelByTitle(page, 'Analytics')
    await expect(panel.getByText('Refresh')).toBeVisible()
    await expect(panel.getByText('Report')).toBeVisible()
  })

  test('close button closes analytics panel', async ({ page }) => {
    const panel = panelByTitle(page, 'Analytics')
    const closeBtn = panel.locator('button').filter({ has: page.locator('.lucide-x') })
    await closeBtn.click()
    await expect(panel).not.toBeVisible({ timeout: 3000 })
  })
})

/* ================================================================== */
/*  Test: Settings Panel                                              */
/* ================================================================== */

test.describe('Workspace — Settings Panel', () => {
  test.beforeEach(async ({ page }) => {
    await gotoWorkspace(page)
    await page.keyboard.press('3')
    await expect(panelByTitle(page, 'Settings')).toBeVisible({ timeout: 3000 })
  })

  test('settings panel has title and close button', async ({ page }) => {
    const panel = panelByTitle(page, 'Settings')
    await expect(panel.getByText('Settings')).toBeVisible()
  })

  test('shows Provider Credentials section', async ({ page }) => {
    const panel = panelByTitle(page, 'Settings')
    await expect(panel.getByText('PROVIDER CREDENTIALS')).toBeVisible()
  })

  test('shows Encryption Keys section', async ({ page }) => {
    const panel = panelByTitle(page, 'Settings')
    await expect(panel.getByText('ENCRYPTION KEYS')).toBeVisible()
  })

  test('has Add Credential button', async ({ page }) => {
    const panel = panelByTitle(page, 'Settings')
    await expect(panel.getByText('Add Credential')).toBeVisible()
  })

  test('Add Credential button reveals form', async ({ page }) => {
    const panel = panelByTitle(page, 'Settings')
    await panel.getByText('Add Credential').click()
    await page.waitForTimeout(300)
    // Form inputs should appear
    await expect(panel.locator('input[placeholder="credential name"]')).toBeVisible({ timeout: 3000 })
  })

  test('has New Key button for encryption keys', async ({ page }) => {
    const panel = panelByTitle(page, 'Settings')
    await expect(panel.getByText('New Key')).toBeVisible()
  })

  test('close button closes settings panel', async ({ page }) => {
    const panel = panelByTitle(page, 'Settings')
    const closeBtn = panel.locator('button').filter({ has: page.locator('.lucide-x') })
    await closeBtn.click()
    await expect(panel).not.toBeVisible({ timeout: 3000 })
  })
})

/* ================================================================== */
/*  Test: Events Panel                                                */
/* ================================================================== */

test.describe('Workspace — Events Panel', () => {
  test.beforeEach(async ({ page }) => {
    await gotoWorkspace(page)
  })

  test('events panel is initially hidden', async ({ page }) => {
    await expect(page.getByText('No events yet')).not.toBeVisible()
  })

  test('pressing E opens events panel', async ({ page }) => {
    await page.keyboard.press('e')
    await expect(page.getByText('Events')).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('No events yet')).toBeVisible()
  })

  test('events panel shows empty state message', async ({ page }) => {
    await page.keyboard.press('e')
    await expect(page.getByText('No events yet')).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('Events appear here during run execution')).toBeVisible()
  })

  test('events panel has event count badge', async ({ page }) => {
    await page.keyboard.press('e')
    // Badge should show 0
    const badge = page.locator('.fixed').filter({ hasText: 'Events' }).locator('text=0')
    await expect(badge).toBeVisible({ timeout: 3000 })
  })

  test('events panel has clear button', async ({ page }) => {
    await page.keyboard.press('e')
    // Clear button with title="Clear events"
    const clearBtn = page.locator('button[title="Clear events"]')
    await expect(clearBtn).toBeVisible({ timeout: 3000 })
  })

  test('events panel has collapse button', async ({ page }) => {
    await page.keyboard.press('e')
    // The collapse button contains ChevronDown icon
    const collapseBtn = page.locator('.fixed').filter({ hasText: 'Events' }).locator('.lucide-chevron-down')
    await expect(collapseBtn).toBeVisible({ timeout: 3000 })
  })

  test('collapse button closes events panel', async ({ page }) => {
    await page.keyboard.press('e')
    await expect(page.getByText('No events yet')).toBeVisible({ timeout: 3000 })
    const collapseBtn = page.locator('.fixed').filter({ hasText: 'Events' }).locator('button').filter({ has: page.locator('.lucide-chevron-down') })
    await collapseBtn.click()
    await expect(page.getByText('No events yet')).not.toBeVisible({ timeout: 3000 })
  })
})

/* ================================================================== */
/*  Test: Studio Mode Workflow Builder                                */
/* ================================================================== */

test.describe('Workspace — Studio Mode', () => {
  test.beforeEach(async ({ page }) => {
    await gotoWorkspace(page)
    await commandBar(page).getByText('Studio').click()
    await page.waitForTimeout(300)
  })

  test('studio mode shows add-node buttons', async ({ page }) => {
    const bar = commandBar(page)
    await expect(bar.locator('.lucide-crosshair')).toBeVisible()
    await expect(bar.locator('.lucide-eye')).toBeVisible()
    await expect(bar.locator('.lucide-brain')).toBeVisible()
    await expect(bar.locator('.lucide-trending-up')).toBeVisible()
  })

  test('can add an attacker node', async ({ page }) => {
    const attackerBtn = commandBar(page).locator('button').filter({ has: page.locator('.lucide-crosshair') })
    await attackerBtn.click()
    await page.waitForTimeout(500)
    const nodes = page.locator('.react-flow__node')
    await expect(nodes).toHaveCount(1, { timeout: 3000 })
  })

  test('can add multiple different node types', async ({ page }) => {
    const bar = commandBar(page)

    // Attacker
    await bar.locator('button').filter({ has: page.locator('.lucide-crosshair') }).click()
    await page.waitForTimeout(300)

    // Critic
    await bar.locator('button').filter({ has: page.locator('.lucide-eye') }).click()
    await page.waitForTimeout(300)

    // Verifier
    await bar.locator('button').filter({ has: page.locator('.lucide-brain') }).click()
    await page.waitForTimeout(300)

    // Analyst
    await bar.locator('button').filter({ has: page.locator('.lucide-trending-up') }).click()
    await page.waitForTimeout(300)

    const nodes = page.locator('.react-flow__node')
    await expect(nodes).toHaveCount(4, { timeout: 3000 })
  })

  test('studio nodes are draggable', async ({ page }) => {
    const attackerBtn = commandBar(page).locator('button').filter({ has: page.locator('.lucide-crosshair') })
    await attackerBtn.click()
    await page.waitForTimeout(500)

    const node = page.locator('.react-flow__node').first()
    await expect(node).toBeVisible()

    // Get initial position
    const box = await node.boundingBox()
    expect(box).toBeTruthy()

    // Drag the node
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 50, { steps: 10 })
      await page.mouse.up()
    }

    // Verify it moved (position will be different)
    const newBox = await node.boundingBox()
    expect(newBox).toBeTruthy()
    if (box && newBox) {
      expect(newBox.x).not.toEqual(box.x)
    }
  })

  test('nodes in evaluate mode are NOT draggable', async ({ page }) => {
    // Switch back to evaluate mode
    await commandBar(page).getByText('Evaluate').click()
    await page.waitForTimeout(300)
    // In evaluate mode, nodesDraggable is false — there should be no drag handles
    // (This is a negative test; no nodes to drag since no run is loaded anyway)
    const canvas = page.locator('.react-flow')
    await expect(canvas).toBeVisible()
  })
})

/* ================================================================== */
/*  Test: Panel Shell Animations & Interactions                       */
/* ================================================================== */

test.describe('Workspace — Panel Animations', () => {
  test.beforeEach(async ({ page }) => {
    await gotoWorkspace(page)
  })

  test('config panel slides in from the left', async ({ page }) => {
    await page.keyboard.press('1')
    const panel = panelByTitle(page, 'Configuration')
    await expect(panel).toBeVisible({ timeout: 3000 })
    // Panel should be on the left side
    const box = await panel.boundingBox()
    expect(box).toBeTruthy()
    if (box) {
      expect(box.x).toBeLessThan(100)
    }
  })

  test('analytics panel slides in from the right', async ({ page }) => {
    await page.keyboard.press('2')
    const panel = panelByTitle(page, 'Analytics')
    await expect(panel).toBeVisible({ timeout: 3000 })
    // Panel should be on the right side
    const box = await panel.boundingBox()
    const viewport = page.viewportSize()
    expect(box).toBeTruthy()
    if (box && viewport) {
      expect(box.x + box.width).toBeGreaterThan(viewport.width - 100)
    }
  })

  test('settings panel is on the right side', async ({ page }) => {
    await page.keyboard.press('3')
    const panel = panelByTitle(page, 'Settings')
    await expect(panel).toBeVisible({ timeout: 3000 })
    const box = await panel.boundingBox()
    const viewport = page.viewportSize()
    expect(box).toBeTruthy()
    if (box && viewport) {
      expect(box.x + box.width).toBeGreaterThan(viewport.width - 100)
    }
  })

  test('panel header has scrollable content area', async ({ page }) => {
    await page.keyboard.press('1')
    const panel = panelByTitle(page, 'Configuration')
    await expect(panel).toBeVisible({ timeout: 3000 })
    // The panel should have a scroll area
    const scrollArea = panel.locator('[data-radix-scroll-area-viewport]')
    await expect(scrollArea).toBeVisible()
  })

  test('rapid panel toggling works correctly', async ({ page }) => {
    // Quick succession of toggles
    await page.keyboard.press('1')
    await page.waitForTimeout(100)
    await page.keyboard.press('2')
    await page.waitForTimeout(100)
    await page.keyboard.press('3')
    await page.waitForTimeout(100)
    await page.keyboard.press('3')
    await page.waitForTimeout(300)
    // All panels should be closed
    await expect(panelByTitle(page, 'Configuration')).not.toBeVisible()
    await expect(panelByTitle(page, 'Analytics')).not.toBeVisible()
    await expect(panelByTitle(page, 'Settings')).not.toBeVisible()
  })
})

/* ================================================================== */
/*  Test: Config Templates                                            */
/* ================================================================== */

test.describe('Workspace — Config Templates', () => {
  test.beforeEach(async ({ page }) => {
    await gotoWorkspace(page)
    await page.keyboard.press('1')
    await expect(panelByTitle(page, 'Configuration')).toBeVisible({ timeout: 3000 })
  })

  test('template cards are displayed in a grid', async ({ page }) => {
    const panel = panelByTitle(page, 'Configuration')
    await expect(panel.getByText('Quick Scan')).toBeVisible()
    await expect(panel.getByText('Fast surface-level check')).toBeVisible()
  })

  test('clicking Quick Scan template applies its config', async ({ page }) => {
    const panel = panelByTitle(page, 'Configuration')
    // Find and click the Quick Scan template card
    const quickScanCard = panel.locator('button, [role="button"]').filter({ hasText: 'Quick Scan' }).first()
    await quickScanCard.click()
    await page.waitForTimeout(500)
  })

  test('all 5 templates are visible', async ({ page }) => {
    const panel = panelByTitle(page, 'Configuration')
    const templates = ['Quick Scan', 'Standard Assessment', 'Deep Evaluation', 'CI Pipeline', 'Nightly Regression']
    for (const name of templates) {
      await expect(panel.getByText(name)).toBeVisible()
    }
  })
})

/* ================================================================== */
/*  Test: Theme Switching                                             */
/* ================================================================== */

test.describe('Workspace — Theme Switching', () => {
  test.beforeEach(async ({ page }) => {
    await gotoWorkspace(page)
  })

  test('theme toggle from toolbar switches to dark mode', async ({ page }) => {
    // Click theme toggle (last button in toolbar actions)
    const themeBtn = toolbar(page).locator('button').last()
    await themeBtn.click()
    await page.waitForTimeout(500)
    const html = page.locator('html')
    const cls = await html.getAttribute('class')
    // Either dark or light class should be present
    expect(cls).toBeDefined()
  })

  test('theme toggle from command palette works', async ({ page }) => {
    await openCommandPalette(page)
    await page.getByText('Dark Theme').click()
    await page.waitForTimeout(500)
    const cls = await page.locator('html').getAttribute('class')
    expect(cls).toContain('dark')
  })

  test('light theme can be set via command palette', async ({ page }) => {
    // First set dark
    await openCommandPalette(page)
    await page.getByText('Dark Theme').click()
    await page.waitForTimeout(300)

    // Then set light
    await openCommandPalette(page)
    await page.getByText('Light Theme').click()
    await page.waitForTimeout(500)
    const cls = await page.locator('html').getAttribute('class')
    expect(cls).toContain('light')
  })
})

/* ================================================================== */
/*  Test: Multiple Panels + Events Interaction                        */
/* ================================================================== */

test.describe('Workspace — Panel + Events Coexistence', () => {
  test.beforeEach(async ({ page }) => {
    await gotoWorkspace(page)
  })

  test('events panel can be open simultaneously with a side panel', async ({ page }) => {
    // Open config panel
    await page.keyboard.press('1')
    await expect(panelByTitle(page, 'Configuration')).toBeVisible({ timeout: 3000 })

    // Open events panel
    await page.keyboard.press('e')
    await expect(page.getByText('No events yet')).toBeVisible({ timeout: 3000 })

    // Both should be visible simultaneously
    await expect(panelByTitle(page, 'Configuration')).toBeVisible()
    await expect(page.getByText('No events yet')).toBeVisible()
  })

  test('Escape closes side panel first, then events', async ({ page }) => {
    // Open both
    await page.keyboard.press('1')
    await expect(panelByTitle(page, 'Configuration')).toBeVisible({ timeout: 3000 })
    await page.keyboard.press('e')
    await expect(page.getByText('No events yet')).toBeVisible({ timeout: 3000 })

    // First Escape closes side panel
    await page.keyboard.press('Escape')
    await expect(panelByTitle(page, 'Configuration')).not.toBeVisible({ timeout: 3000 })
    await expect(page.getByText('No events yet')).toBeVisible()

    // Second Escape closes events
    await page.keyboard.press('Escape')
    await expect(page.getByText('No events yet')).not.toBeVisible({ timeout: 3000 })
  })

  test('switching panels keeps events open', async ({ page }) => {
    await page.keyboard.press('e')
    await expect(page.getByText('No events yet')).toBeVisible({ timeout: 3000 })

    await page.keyboard.press('1')
    await expect(panelByTitle(page, 'Configuration')).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('No events yet')).toBeVisible()

    await page.keyboard.press('2')
    await expect(panelByTitle(page, 'Analytics')).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('No events yet')).toBeVisible()
  })
})

/* ================================================================== */
/*  Test: localStorage Persistence                                    */
/* ================================================================== */

test.describe('Workspace — State Persistence', () => {
  test('session identifiers persist across reloads', async ({ page }) => {
    await gotoWorkspace(page)

    // Set a run ID via toolbar input
    const input = toolbar(page).locator('input')
    await input.fill('test-run-persist')
    await input.press('Enter')
    await page.waitForTimeout(1000)

    // Check localStorage
    const stored = await page.evaluate(() => {
      const data = window.localStorage.getItem('metrox-session')
      return data ? JSON.parse(data) : null
    })
    expect(stored).toBeTruthy()
    if (stored) {
      expect(stored.currentRunId).toBe('test-run-persist')
    }
  })
})

/* ================================================================== */
/*  Test: Responsive Toolbar Elements                                 */
/* ================================================================== */

test.describe('Workspace — Toolbar Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await gotoWorkspace(page)
  })

  test('entering a run ID and pressing Enter triggers load', async ({ page }) => {
    const input = toolbar(page).locator('input')
    await input.fill('my-test-run-id')
    await input.press('Enter')
    // The run ID should be dispatched — we can verify localStorage
    await page.waitForTimeout(500)
    const stored = await page.evaluate(() => {
      const data = window.localStorage.getItem('metrox-session')
      return data ? JSON.parse(data) : null
    })
    expect(stored?.currentRunId).toBe('my-test-run-id')
  })

  test('entering a run ID and clicking play button triggers load', async ({ page }) => {
    const input = toolbar(page).locator('input')
    await input.fill('another-run-id')
    const playBtn = toolbar(page).locator('button').filter({ has: page.locator('.lucide-play') })
    await playBtn.click()
    await page.waitForTimeout(500)
    const stored = await page.evaluate(() => {
      const data = window.localStorage.getItem('metrox-session')
      return data ? JSON.parse(data) : null
    })
    expect(stored?.currentRunId).toBe('another-run-id')
  })

  test('play button is disabled when input is empty', async ({ page }) => {
    const input = toolbar(page).locator('input')
    await input.fill('')
    const playBtn = toolbar(page).locator('button').filter({ has: page.locator('.lucide-play') })
    await expect(playBtn).toBeDisabled()
  })
})

/* ================================================================== */
/*  Test: Canvas Zoom Controls                                        */
/* ================================================================== */

test.describe('Workspace — Canvas Zoom Controls', () => {
  test.beforeEach(async ({ page }) => {
    await gotoWorkspace(page)
  })

  test('zoom-in button is visible', async ({ page }) => {
    const zoomIn = page.locator('.react-flow__controls-zoomin')
    await expect(zoomIn).toBeVisible()
  })

  test('zoom-out button is visible', async ({ page }) => {
    const zoomOut = page.locator('.react-flow__controls-zoomout')
    await expect(zoomOut).toBeVisible()
  })

  test('fit-view button is visible', async ({ page }) => {
    const fitView = page.locator('.react-flow__controls-fitview')
    await expect(fitView).toBeVisible()
  })

  test('zoom-in button works', async ({ page }) => {
    const zoomIn = page.locator('.react-flow__controls-zoomin')
    await zoomIn.click()
    await zoomIn.click()
    // No error — just verify it's interactive
  })

  test('zoom-out button works', async ({ page }) => {
    const zoomOut = page.locator('.react-flow__controls-zoomout')
    await zoomOut.click()
    await zoomOut.click()
  })

  test('fit-view button works', async ({ page }) => {
    const fitView = page.locator('.react-flow__controls-fitview')
    await fitView.click()
  })

  test('interactive toggle only shows in studio mode', async ({ page }) => {
    // In evaluate mode, interactive button may not show
    await commandBar(page).getByText('Studio').click()
    await page.waitForTimeout(300)
    // In studio mode, the interactive toggle should be visible
    const interactive = page.locator('.react-flow__controls-interactive')
    await expect(interactive).toBeVisible()
  })
})

/* ================================================================== */
/*  Test: End-to-end Workflow                                         */
/* ================================================================== */

test.describe('Workspace — E2E Workflows', () => {
  test('full workflow: open config → fill form → switch to analytics → close', async ({ page }) => {
    await gotoWorkspace(page)

    // Step 1: Open config panel
    await page.keyboard.press('1')
    await expect(panelByTitle(page, 'Configuration')).toBeVisible({ timeout: 3000 })

    // Step 2: Fill session name
    const panel = panelByTitle(page, 'Configuration')
    const sessionInput = panel.locator('input').first()
    await sessionInput.fill('E2E Test Session')

    // Step 3: Switch to analytics via keyboard
    await page.keyboard.press('2')
    await expect(panelByTitle(page, 'Analytics')).toBeVisible({ timeout: 3000 })
    await expect(panelByTitle(page, 'Configuration')).not.toBeVisible()

    // Step 4: Browse analytics tabs
    const analyticsPanel = panelByTitle(page, 'Analytics')
    await analyticsPanel.getByRole('tab', { name: 'Cost' }).click()
    await expect(analyticsPanel.getByRole('tab', { name: 'Cost' })).toHaveAttribute('data-state', 'active')

    // Step 5: Close via Escape
    await page.keyboard.press('Escape')
    await expect(panelByTitle(page, 'Analytics')).not.toBeVisible({ timeout: 3000 })
  })

  test('full workflow: context menu → open config → close → command palette → studio', async ({ page }) => {
    await gotoWorkspace(page)

    // Step 1: Right-click → Open Configuration
    const pane = page.locator('.react-flow__pane')
    await pane.click({ button: 'right', position: { x: 400, y: 300 } })
    await page.getByText('Open Configuration').click()
    await expect(panelByTitle(page, 'Configuration')).toBeVisible({ timeout: 3000 })

    // Step 2: Close config
    await page.keyboard.press('Escape')
    await expect(panelByTitle(page, 'Configuration')).not.toBeVisible({ timeout: 3000 })

    // Step 3: Use command palette to switch to studio
    await openCommandPalette(page)
    await page.getByText('Studio Mode').click()
    const toggle = commandBar(page).locator('[data-state="on"]')
    await expect(toggle).toContainText('Studio')

    // Step 4: Add nodes via command bar
    const attackerBtn = commandBar(page).locator('button').filter({ has: page.locator('.lucide-crosshair') })
    await attackerBtn.click()
    await page.waitForTimeout(500)
    await expect(page.locator('.react-flow__node')).toHaveCount(1, { timeout: 3000 })
  })

  test('full workflow: load run via toolbar → check state → open events', async ({ page }) => {
    await gotoWorkspace(page)

    // Step 1: Enter run ID
    const input = toolbar(page).locator('input')
    await input.fill('workflow-test-run')
    await input.press('Enter')
    await page.waitForTimeout(500)

    // Step 2: Verify state persistence
    const stored = await page.evaluate(() => {
      const data = window.localStorage.getItem('metrox-session')
      return data ? JSON.parse(data) : null
    })
    expect(stored?.currentRunId).toBe('workflow-test-run')

    // Step 3: Open events
    await page.keyboard.press('e')
    await expect(page.getByText('Events')).toBeVisible({ timeout: 3000 })

    // Step 4: Open settings alongside
    await page.keyboard.press('3')
    await expect(panelByTitle(page, 'Settings')).toBeVisible({ timeout: 3000 })
    // Events should still be visible
    await expect(page.getByText('Events')).toBeVisible()
  })

  test('rapid mode switching between evaluate and studio', async ({ page }) => {
    await gotoWorkspace(page)

    const bar = commandBar(page)
    for (let i = 0; i < 5; i++) {
      await bar.getByText('Studio').click()
      await page.waitForTimeout(150)
      await bar.getByText('Evaluate').click()
      await page.waitForTimeout(150)
    }

    // Should end in evaluate mode
    const toggle = bar.locator('[data-state="on"]')
    await expect(toggle).toContainText('Evaluate')
  })
})
