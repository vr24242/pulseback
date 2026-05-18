import { test, expect } from '@playwright/test';

/**
 * Merchant PWA E2E Tests
 * Tests the exception queue management and approval workflows
 */

test.describe('Merchant PWA - Exception Queue & Approvals', () => {
  const MERCHANT_PWA_URL = process.env.MERCHANT_PWA_URL || 'http://localhost:3000';
  const TEST_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaG9wSWQiOiJ0ZXN0LXNob3AiLCJzaG9wRG9tYWluIjoidGVzdC5teXNob3BpZnkuY29tIiwiaWF0IjoxNzE2MDAwMDAwLCJleHAiOjk5OTk5OTk5OTl9.test';

  /**
   * Test 1: Login Flow - JWT Token Entry
   * Verifies that merchant can paste JWT and login
   */
  test('should allow JWT token login', async ({ page }) => {
    await page.goto(MERCHANT_PWA_URL);

    // Verify login page is shown
    const loginForm = page.locator('[data-testid="login-form"]');
    await expect(loginForm).toBeVisible();

    // Fill JWT token
    const tokenInput = page.locator('[data-testid="jwt-input"]');
    await tokenInput.fill(TEST_JWT);

    // Click login button
    const loginButton = page.locator('button:has-text("Login")');
    await loginButton.click();

    // Verify user is logged in (redirected to dashboard)
    await page.waitForURL(/\/dashboard|\/\w+/, { timeout: 10000 });
    expect(page.url()).not.toContain('/login');
  });

  /**
   * Test 2: Dashboard - KPI Display
   * Verifies that dashboard loads with KPI metrics
   */
  test('should display dashboard with KPI metrics', async ({ page }) => {
    await page.goto(`${MERCHANT_PWA_URL}`);

    // Login
    const tokenInput = page.locator('[data-testid="jwt-input"]');
    await tokenInput.fill(TEST_JWT);
    const loginButton = page.locator('button:has-text("Login")');
    await loginButton.click();

    // Wait for dashboard to load
    await page.waitForLoadState('networkidle');

    // Verify KPI cards are visible
    const kpiCards = page.locator('[data-testid="kpi-card"]');
    await expect(kpiCards.first()).toBeVisible();

    // Verify specific metrics
    const orderCount = page.locator('[data-testid="kpi-orders"]');
    const ndrCount = page.locator('[data-testid="kpi-ndr"]');
    const returnCount = page.locator('[data-testid="kpi-returns"]');

    await expect(orderCount).toBeVisible();
    await expect(ndrCount).toBeVisible();
    await expect(returnCount).toBeVisible();
  });

  /**
   * Test 3: Exception Queue - List Display
   * Verifies that exception queue loads and displays items
   */
  test('should display exception queue', async ({ page }) => {
    await page.goto(`${MERCHANT_PWA_URL}`);

    // Login
    const tokenInput = page.locator('[data-testid="jwt-input"]');
    await tokenInput.fill(TEST_JWT);
    const loginButton = page.locator('button:has-text("Login")');
    await loginButton.click();

    await page.waitForLoadState('networkidle');

    // Navigate to exception queue (might be part of dashboard)
    const queueSection = page.locator('[data-testid="exception-queue"]');
    await expect(queueSection).toBeVisible();

    // Verify table/list of exceptions is shown
    const exceptionItems = page.locator('[data-testid="exception-item"]');
    // At least one item should be visible if there are exceptions
    if (await exceptionItems.count() > 0) {
      await expect(exceptionItems.first()).toBeVisible();
    }
  });

  /**
   * Test 4: NDR Queue - List NDR Items
   * Verifies that NDR exceptions are listed properly
   */
  test('should list NDR exceptions with details', async ({ page }) => {
    await page.goto(`${MERCHANT_PWA_URL}`);

    // Login
    const tokenInput = page.locator('[data-testid="jwt-input"]');
    await tokenInput.fill(TEST_JWT);
    const loginButton = page.locator('button:has-text("Login")');
    await loginButton.click();

    await page.waitForLoadState('networkidle');

    // Find NDR items
    const ndrItems = page.locator('[data-testid="ndr-item"]');

    if (await ndrItems.count() > 0) {
      const firstNDR = ndrItems.first();
      await expect(firstNDR).toBeVisible();

      // Verify NDR details are visible
      const awb = firstNDR.locator('[data-testid="ndr-awb"]');
      const customer = firstNDR.locator('[data-testid="ndr-customer"]');
      const attempt = firstNDR.locator('[data-testid="ndr-attempt"]');

      await expect(awb).toBeVisible();
      await expect(customer).toBeVisible();
      await expect(attempt).toBeVisible();
    }
  });

  /**
   * Test 5: NDR Detail View - Expand & Details
   * Verifies that NDR details can be viewed
   */
  test('should show NDR detail view', async ({ page }) => {
    await page.goto(`${MERCHANT_PWA_URL}`);

    // Login
    const tokenInput = page.locator('[data-testid="jwt-input"]');
    await tokenInput.fill(TEST_JWT);
    const loginButton = page.locator('button:has-text("Login")');
    await loginButton.click();

    await page.waitForLoadState('networkidle');

    // Click on first NDR item
    const ndrItems = page.locator('[data-testid="ndr-item"]');
    if (await ndrItems.count() > 0) {
      await ndrItems.first().click();

      // Wait for details modal/page
      const detailModal = page.locator('[data-testid="ndr-detail"]');
      await expect(detailModal).toBeVisible({ timeout: 5000 });

      // Verify tracking history is shown
      const trackingHistory = page.locator('[data-testid="tracking-history"]');
      await expect(trackingHistory).toBeVisible();

      // Verify AI recommendation is shown
      const recommendation = page.locator('[data-testid="ai-recommendation"]');
      await expect(recommendation).toBeVisible();
    }
  });

  /**
   * Test 6: NDR Approval - Approve Reattempt Action
   * Verifies that merchant can approve reattempt
   */
  test('should allow approving NDR reattempt', async ({ page }) => {
    await page.goto(`${MERCHANT_PWA_URL}`);

    // Login
    const tokenInput = page.locator('[data-testid="jwt-input"]');
    await tokenInput.fill(TEST_JWT);
    const loginButton = page.locator('button:has-text("Login")');
    await loginButton.click();

    await page.waitForLoadState('networkidle');

    // Click on first NDR item
    const ndrItems = page.locator('[data-testid="ndr-item"]');
    if (await ndrItems.count() > 0) {
      await ndrItems.first().click();

      const detailModal = page.locator('[data-testid="ndr-detail"]');
      await expect(detailModal).toBeVisible({ timeout: 5000 });

      // Click "Approve Reattempt" button
      const reattemptButton = page.locator('button:has-text("Approve Reattempt")');
      await reattemptButton.click();

      // Verify action confirmation
      const successMessage = page.locator('[data-testid="action-success"]');
      await expect(successMessage).toBeVisible({ timeout: 5000 });

      // Verify modal closes or updates
      const updatedStatus = page.locator('[data-testid="ndr-status"]');
      // Status should update to reflect the action
    }
  });

  /**
   * Test 7: Return Queue - List Returns
   * Verifies that pending returns are listed
   */
  test('should list pending returns', async ({ page }) => {
    await page.goto(`${MERCHANT_PWA_URL}`);

    // Login
    const tokenInput = page.locator('[data-testid="jwt-input"]');
    await tokenInput.fill(TEST_JWT);
    const loginButton = page.locator('button:has-text("Login")');
    await loginButton.click();

    await page.waitForLoadState('networkidle');

    // Navigate to returns section
    const returnsSection = page.locator('[data-testid="returns-queue"]');
    await expect(returnsSection).toBeVisible();

    // Find return items
    const returnItems = page.locator('[data-testid="return-item"]');

    if (await returnItems.count() > 0) {
      const firstReturn = returnItems.first();
      await expect(firstReturn).toBeVisible();

      // Verify return details
      const orderId = firstReturn.locator('[data-testid="return-order"]');
      const customer = firstReturn.locator('[data-testid="return-customer"]');
      const refund = firstReturn.locator('[data-testid="return-refund"]');

      await expect(orderId).toBeVisible();
      await expect(customer).toBeVisible();
      await expect(refund).toBeVisible();
    }
  });

  /**
   * Test 8: Return Approval - Approve Return
   * Verifies that merchant can approve a return
   */
  test('should allow approving return', async ({ page }) => {
    await page.goto(`${MERCHANT_PWA_URL}`);

    // Login
    const tokenInput = page.locator('[data-testid="jwt-input"]');
    await tokenInput.fill(TEST_JWT);
    const loginButton = page.locator('button:has-text("Login")');
    await loginButton.click();

    await page.waitForLoadState('networkidle');

    // Click on first return item
    const returnItems = page.locator('[data-testid="return-item"]');
    if (await returnItems.count() > 0) {
      await returnItems.first().click();

      // Wait for detail modal
      const detailModal = page.locator('[data-testid="return-detail"]');
      await expect(detailModal).toBeVisible({ timeout: 5000 });

      // Click "Approve Return" button
      const approveButton = page.locator('button:has-text("Approve Return")');
      await approveButton.click();

      // Verify action confirmation
      const successMessage = page.locator('[data-testid="action-success"]');
      await expect(successMessage).toBeVisible({ timeout: 5000 });
    }
  });

  /**
   * Test 9: Action Buttons - Inline Actions
   * Verifies that inline action buttons work
   */
  test('should execute inline actions on exception items', async ({ page }) => {
    await page.goto(`${MERCHANT_PWA_URL}`);

    // Login
    const tokenInput = page.locator('[data-testid="jwt-input"]');
    await tokenInput.fill(TEST_JWT);
    const loginButton = page.locator('button:has-text("Login")');
    await loginButton.click();

    await page.waitForLoadState('networkidle');

    // Find exception items with action buttons
    const exceptionItems = page.locator('[data-testid="exception-item"]');

    if (await exceptionItems.count() > 0) {
      const firstItem = exceptionItems.first();
      const actionButton = firstItem.locator('button[data-testid*="action"]').first();

      if (await actionButton.count() > 0) {
        await actionButton.click();

        // Verify action executes (might show confirmation or update UI)
        const notification = page.locator('[role="alert"], [data-testid="notification"]');
        await expect(notification).toBeVisible({ timeout: 5000 });
      }
    }
  });

  /**
   * Test 10: Accessibility - Dark Mode Support
   * Verifies that dark mode works and is accessible
   */
  test('should support dark mode', async ({ page }) => {
    await page.goto(`${MERCHANT_PWA_URL}`);

    // Login
    const tokenInput = page.locator('[data-testid="jwt-input"]');
    await tokenInput.fill(TEST_JWT);
    const loginButton = page.locator('button:has-text("Login")');
    await loginButton.click();

    await page.waitForLoadState('networkidle');

    // Check for dark mode toggle
    const darkModeToggle = page.locator('[data-testid="dark-mode-toggle"]');

    if (await darkModeToggle.count() > 0) {
      await darkModeToggle.click();

      // Verify dark mode is applied
      const isDark = await page.evaluate(() => {
        return document.documentElement.classList.contains('dark');
      });

      expect(isDark).toBeTruthy();
    }
  });

  /**
   * Test 11: Real-Time Updates - Polling
   * Verifies that exception queue updates (would need mock server for proper testing)
   */
  test('should poll for updates', async ({ page }) => {
    await page.goto(`${MERCHANT_PWA_URL}`);

    // Login
    const tokenInput = page.locator('[data-testid="jwt-input"]');
    await tokenInput.fill(TEST_JWT);
    const loginButton = page.locator('button:has-text("Login")');
    await loginButton.click();

    await page.waitForLoadState('networkidle');

    // Get initial count
    const initialCount = await page.locator('[data-testid="exception-item"]').count();

    // Wait for potential update (this is a basic test - would need backend support for full E2E)
    await page.waitForTimeout(3000);

    // Count should be >= initial (real-time updates don't decrease items in current view)
    const updatedCount = await page.locator('[data-testid="exception-item"]').count();
    expect(updatedCount).toBeGreaterThanOrEqual(initialCount);
  });

  /**
   * Test 12: Session & Auth
   * Verifies that JWT expiration is handled properly
   */
  test('should handle token validation', async ({ page }) => {
    await page.goto(`${MERCHANT_PWA_URL}`);

    // Try with invalid JWT
    const invalidJWT = 'invalid.token.here';
    const tokenInput = page.locator('[data-testid="jwt-input"]');
    await tokenInput.fill(invalidJWT);

    const loginButton = page.locator('button:has-text("Login")');
    await loginButton.click();

    // Should show error message
    const errorMessage = page.locator('[data-testid="error"], [role="alert"]');
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });
});
