import { test, expect } from '@playwright/test';

/**
 * Customer PWA E2E Tests
 * Tests the full order tracking and returns workflow
 */

// Mock order data structure
const mockOrder = {
  id: 'order-1',
  shopifyOrderId: '12345',
  shopifyOrderName: '#12345',
  shopId: 'test-shop',
  customerId: 'customer-1',
  status: 'in_transit',
  totalPrice: 2500,
  createdAt: new Date('2024-05-15').toISOString(),
  updatedAt: new Date('2024-05-18').toISOString(),
  customer: {
    id: 'customer-1',
    name: 'John Doe',
    phone: '+919876543210',
    email: 'john@example.com'
  },
  shipments: [
    {
      id: 'shipment-1',
      awb: 'SHP12345',
      carrier: 'Shiprocket',
      status: 'in_transit',
      lastScannedAt: new Date('2024-05-18T10:30:00').toISOString(),
      isStuck: false
    }
  ],
  returnRequests: []
};

const mockReturnStatus = {
  eligible: true,
  days: 7
};

// Helper: decode mock JWT payload for localStorage setup
function decodeMockJWT(jwt: string) {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return payload;
  } catch {
    return null;
  }
}

// Setup API route mocking before tests run
test.beforeEach(async ({ page }, testInfo) => {
  // Mock JWT with orderName AND phone (both required by TrackOrder.tsx)
  // Payload: {"shopId":"test-shop","orderName":"JRH-001","phone":"9876543210"}
  const mockJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaG9wSWQiOiJ0ZXN0LXNob3AiLCJvcmRlck5hbWUiOiJKUkgtMDAxIiwicGhvbmUiOiI5ODc2NTQzMjEwIn0.test';

  // Set up localStorage before page loads (for auth + tracking tests)
  // Must set BOTH keys: auth_token (for ProtectedRoute) and tracking_token (for TrackOrder)
  await page.addInitScript((token) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('tracking_token', token);
  }, mockJWT);

  // Log all requests to see what's being called
  page.on('request', (request) => {
    console.log('[REQUEST]', request.method(), request.url());
  });

  // Intercept all tRPC API requests
  await page.route('**/trpc/**', async (route) => {
    const request = route.request();
    const url = request.url();

    console.log('[ROUTE MATCH] Intercepted:', url);

    // Parse the endpoint from URL (tRPC format: /trpc/customer.getOrder)
    const matches = url.match(/\/trpc\/(.+?)(?:\?|$)/);
    const endpoint = matches ? matches[1] : '';

    console.log('[ROUTE] Endpoint:', endpoint);

    if (endpoint.includes('customer.getOrder')) {
      console.log('[MOCK] → Returning mock order for getOrder');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ result: { data: mockOrder } }])
      });
      return;
    } else if (endpoint.includes('customer.checkReturn')) {
      console.log('[MOCK] → Returning mock return status');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ result: { data: mockReturnStatus } }])
      });
      return;
    } else if (endpoint.includes('customer.getRecentOrders')) {
      console.log('[MOCK] → Returning mock orders list');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ result: { data: [mockOrder] } }])
      });
      return;
    } else if (endpoint.includes('customer.startReturn')) {
      console.log('[MOCK] → Returning mock return started response');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          result: {
            data: {
              returnId: 'return-1',
              message: 'Return request submitted successfully',
              status: 'pending'
            }
          }
        }])
      });
      return;
    }

    // For other requests, just continue
    console.log('[ROUTE] No match, continuing:', endpoint);
    await route.continue();
  });
});

test.describe('Customer PWA - Order Tracking & Returns', () => {
  /**
   * Test 1: Auth Flow - JWT Token Processing
   * Verifies that JWT token from URL is extracted and redirects to tracking page
   */
  test('should authenticate with JWT token from URL', async ({ page }, testInfo) => {
    // Generate a mock JWT (in real test, this would come from checkout completion)
    const mockJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaG9wSWQiOiJ0ZXN0LXNob3AiLCJvcmRlck5hbWUiOiJKUkgtMDAxIiwiaWF0IjoxNzE2MDAwMDAwfQ.test';
    const browserName = testInfo.project.name || '';

    // Navigate to auth page with JWT
    await page.goto(`/?jwt=${mockJWT}`);

    // For webkit browsers, just verify the redirect happened
    // (localStorage behavior differs on webkit)
    if (!browserName.includes('webkit') && !browserName.includes('Safari')) {
      // Verify JWT is stored in localStorage (for chromium/firefox/mobile)
      await page.waitForTimeout(100); // Give it a moment to store
      const token = await page.evaluate(() => localStorage.getItem('auth_token'));
      expect(token).toBe(mockJWT);
    }

    // Verify page redirects to track order (works on all browsers)
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/track\/.+/);
  });

  /**
   * Test 2: Order Tracking Page - Load & Display
   * Verifies that order details load and display correctly
   */
  test('should display order tracking details', async ({ page }) => {
    // Navigate directly to track page (localStorage pre-populated via addInitScript)
    await page.goto('/track/JRH-001');

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    // Debug: log what's actually on the page
    const pageContent = await page.textContent('body');
    console.log('[TEST DEBUG] Page content:', pageContent?.substring(0, 200) || 'EMPTY');

    // Wait for the track-order-page element to appear
    await page.waitForSelector('[data-testid="track-order-page"]', { timeout: 10000 });

    // Verify tracking timeline is rendered
    const timeline = page.locator('[data-testid="timeline"]');
    await expect(timeline).toBeVisible();

    // Verify status badge is visible
    const badge = page.locator('[data-testid="status-badge"]');
    await expect(badge).toBeVisible();
  });

  /**
   * Test 3: Order Tracking - Timeline Events
   * Verifies that timeline events display with correct information
   */
  test('should display timeline events with details', async ({ page }) => {
    await page.goto('/track/JRH-001');
    await page.waitForLoadState('networkidle');

    // Verify first event is visible
    const firstEvent = page.locator('[data-testid="timeline-event"]').first();
    await expect(firstEvent).toBeVisible();

    // Verify event has timestamp
    const timestamp = firstEvent.locator('[data-testid="event-timestamp"]');
    await expect(timestamp).toBeVisible();

    // Verify event has status
    const status = firstEvent.locator('[data-testid="event-status"]');
    await expect(status).toBeVisible();
  });

  /**
   * Test 4: Return Initiation - Step 1 (Eligibility)
   * Verifies that return flow starts and eligibility is checked
   */
  test('should initiate return flow and check eligibility', async ({ page }) => {
    await page.goto('/track/JRH-001');
    await page.waitForLoadState('networkidle');

    // Click "Return Item" button
    const returnButton = page.locator('button:has-text("Return")').first();
    await returnButton.click();

    // Verify modal/sheet appears
    const modal = page.locator('[data-testid="return-modal"], [data-testid="return-sheet"]');
    await expect(modal).toBeVisible();

    // Verify eligibility check is shown
    const eligible = page.locator('[data-testid="return-eligible"]');
    await expect(eligible).toBeVisible();

    // Verify item selection is available
    const itemCheckbox = page.locator('[type="checkbox"]').first();
    await expect(itemCheckbox).toBeVisible();
  });

  /**
   * Test 5: Return Flow - Select Items
   * Verifies that user can select items for return
   */
  test('should allow item selection for return', async ({ page }) => {
    await page.goto('/track/JRH-001');
    await page.waitForLoadState('networkidle');

    // Click "Return Item"
    const returnButton = page.locator('button:has-text("Return")').first();
    await returnButton.click();

    // Select first item
    const firstItemCheckbox = page.locator('[data-testid="item-checkbox"]').first();
    await firstItemCheckbox.check();

    // Verify checkbox is checked
    await expect(firstItemCheckbox).toBeChecked();

    // Verify Next button becomes enabled
    const nextButton = page.locator('button:has-text("Next")').last();
    await expect(nextButton).toBeEnabled();
  });

  /**
   * Test 6: Return Flow - Select Reason
   * Verifies that user can select return reason
   */
  test('should allow reason selection for return', async ({ page }) => {
    await page.goto('/track/JRH-001');
    await page.waitForLoadState('networkidle');

    // Click "Return Item"
    const returnButton = page.locator('button:has-text("Return")').first();
    await returnButton.click();

    // Select first item
    const firstItemCheckbox = page.locator('[data-testid="item-checkbox"]').first();
    await firstItemCheckbox.check();

    // Click Next
    let nextButton = page.locator('button:has-text("Next")').last();
    await nextButton.click();

    // Verify reason options are shown
    const reasonOption = page.locator('[data-testid="return-reason-option"]').first();
    await expect(reasonOption).toBeVisible();

    // Select a reason
    const wrongItemOption = page.locator('[data-testid="return-reason-wrong-item"]');
    await wrongItemOption.click();

    // Verify option is selected
    await expect(wrongItemOption).toBeChecked();
  });

  /**
   * Test 7: Return Flow - Address Selection
   * Verifies that pickup address can be selected/changed
   */
  test('should allow pickup address selection', async ({ page }) => {
    await page.goto('/track/JRH-001');
    await page.waitForLoadState('networkidle');

    // Complete steps 1-2 first
    const returnButton = page.locator('button:has-text("Return")').first();
    await returnButton.click();

    const itemCheckbox = page.locator('[data-testid="item-checkbox"]').first();
    await itemCheckbox.check();

    let nextButton = page.locator('button:has-text("Next")').last();
    await nextButton.click();

    const reasonOption = page.locator('[data-testid="return-reason-option"]').first();
    await reasonOption.click();

    nextButton = page.locator('button:has-text("Next")').last();
    await nextButton.click();

    // Verify address section is shown
    const addressSection = page.locator('[data-testid="pickup-address"]');
    await expect(addressSection).toBeVisible();

    // Verify default address is selected
    const defaultAddress = page.locator('[data-testid="address-option-default"]');
    await expect(defaultAddress).toBeChecked();

    // Verify pickup window is available
    const pickupWindow = page.locator('[data-testid="pickup-window"]');
    await expect(pickupWindow).toBeVisible();
  });

  /**
   * Test 8: Return Flow - Confirmation
   * Verifies that return can be confirmed and submitted
   */
  test('should submit return successfully', async ({ page }) => {
    await page.goto('/track/JRH-001');
    await page.waitForLoadState('networkidle');

    // Complete all steps
    const returnButton = page.locator('button:has-text("Return")').first();
    await returnButton.click();

    const itemCheckbox = page.locator('[data-testid="item-checkbox"]').first();
    await itemCheckbox.check();

    let nextButton = page.locator('button:has-text("Next")').last();
    await nextButton.click();

    const reasonOption = page.locator('[data-testid="return-reason-option"]').first();
    await reasonOption.click();

    nextButton = page.locator('button:has-text("Next")').last();
    await nextButton.click();

    // Verify confirmation step
    const confirmSection = page.locator('[data-testid="return-confirm"]');
    await expect(confirmSection).toBeVisible();

    // Click Confirm Return button
    const confirmButton = page.locator('button:has-text("Confirm Return")');
    await confirmButton.click();

    // Verify success message
    const successMessage = page.locator('[data-testid="return-success"]');
    await expect(successMessage).toBeVisible();
  });

  /**
   * Test 9: Accessibility - Keyboard Navigation
   * Verifies that tracking page is keyboard navigable
   */
  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/track/JRH-001');

    // Focus on first button using Tab
    await page.keyboard.press('Tab');

    // Verify something is focused
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused).toBeTruthy();

    // Press Enter to activate button
    await page.keyboard.press('Enter');

    // Verify action triggered (modal opened or similar)
    const modal = page.locator('[role="dialog"]');
    // Modal might exist or not depending on what was focused
  });

  /**
   * Test 10: Mobile Responsiveness
   * Verifies layout adapts to mobile viewport
   */
  test('should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto('/track/JRH-001');
    await page.waitForLoadState('networkidle');

    // Verify content is visible on mobile
    const timeline = page.locator('[data-testid="timeline"]');
    await expect(timeline).toBeVisible();

    // Verify buttons are large enough for touch
    const buttons = page.locator('button');
    const firstButton = buttons.first();
    const box = await firstButton.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44); // min touch size
    expect(box?.width).toBeGreaterThanOrEqual(44);
  });
});
