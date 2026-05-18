# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customer-pwa.spec.ts >> Customer PWA - Order Tracking & Returns >> should display order tracking details
- Location: tests/e2e/customer-pwa.spec.ts:184:3

# Error details

```
TimeoutError: page.waitForSelector: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('[data-testid="track-order-page"]') to be visible

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - paragraph [ref=e5]: "[[\"customer\",\"getOrder\"],{\"input\":{\"orderName\":\"JRH-001\",\"phone\":\"9876543210\"},\"type\":\"query\"}] data is undefined"
  - button "Search Again" [ref=e6] [cursor=pointer]
```

# Test source

```ts
  116 |         return;
  117 |       } else if (procedure?.includes('customer.getRecentOrders')) {
  118 |         console.log('[MOCK] → Returning mock orders list');
  119 |         await route.fulfill({
  120 |           status: 200,
  121 |           contentType: 'application/json',
  122 |           body: JSON.stringify([{ result: { data: [mockOrder] } }])
  123 |         });
  124 |         return;
  125 |       } else if (procedure?.includes('customer.startReturn')) {
  126 |         console.log('[MOCK] → Returning mock return started response');
  127 |         await route.fulfill({
  128 |           status: 200,
  129 |           contentType: 'application/json',
  130 |           body: JSON.stringify([{
  131 |             result: {
  132 |               data: {
  133 |                 returnId: 'return-1',
  134 |                 message: 'Return request submitted successfully',
  135 |                 status: 'pending'
  136 |               }
  137 |             }
  138 |           }])
  139 |         });
  140 |         return;
  141 |       }
  142 | 
  143 |       // For other requests, just continue
  144 |       console.log('[ROUTE] No match, continuing:', procedure);
  145 |       await route.continue();
  146 |     } catch (error) {
  147 |       console.log('[ROUTE ERROR]', error);
  148 |       await route.continue();
  149 |     }
  150 |   });
  151 | });
  152 | 
  153 | test.describe('Customer PWA - Order Tracking & Returns', () => {
  154 |   /**
  155 |    * Test 1: Auth Flow - JWT Token Processing
  156 |    * Verifies that JWT token from URL is extracted and redirects to tracking page
  157 |    */
  158 |   test('should authenticate with JWT token from URL', async ({ page }, testInfo) => {
  159 |     // Generate a mock JWT (in real test, this would come from checkout completion)
  160 |     const mockJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaG9wSWQiOiJ0ZXN0LXNob3AiLCJvcmRlck5hbWUiOiJKUkgtMDAxIiwiaWF0IjoxNzE2MDAwMDAwfQ.test';
  161 |     const browserName = testInfo.project.name || '';
  162 | 
  163 |     // Navigate to auth page with JWT
  164 |     await page.goto(`/?jwt=${mockJWT}`);
  165 | 
  166 |     // For webkit browsers, just verify the redirect happened
  167 |     // (localStorage behavior differs on webkit)
  168 |     if (!browserName.includes('webkit') && !browserName.includes('Safari')) {
  169 |       // Verify JWT is stored in localStorage (for chromium/firefox/mobile)
  170 |       await page.waitForTimeout(100); // Give it a moment to store
  171 |       const token = await page.evaluate(() => localStorage.getItem('auth_token'));
  172 |       expect(token).toBe(mockJWT);
  173 |     }
  174 | 
  175 |     // Verify page redirects to track order (works on all browsers)
  176 |     await page.waitForLoadState('domcontentloaded');
  177 |     await expect(page).toHaveURL(/\/track\/.+/);
  178 |   });
  179 | 
  180 |   /**
  181 |    * Test 2: Order Tracking Page - Load & Display
  182 |    * Verifies that order details load and display correctly
  183 |    */
  184 |   test('should display order tracking details', async ({ page }) => {
  185 |     // Navigate directly to track page (localStorage pre-populated via addInitScript)
  186 |     await page.goto('/track/JRH-001');
  187 |     await page.waitForLoadState('domcontentloaded');
  188 | 
  189 |     // Give component time to mount and parse state
  190 |     await page.waitForTimeout(2000);
  191 | 
  192 |     // Step 1: Verify localStorage has tokens
  193 |     const authToken = await page.evaluate(() => localStorage.getItem('auth_token'));
  194 |     const trackingToken = await page.evaluate(() => localStorage.getItem('tracking_token'));
  195 |     console.log('[TEST 2] auth_token set:', !!authToken);
  196 |     console.log('[TEST 2] tracking_token set:', !!trackingToken);
  197 |     expect(authToken).toBeTruthy();
  198 |     expect(trackingToken).toBeTruthy();
  199 | 
  200 |     // Step 2: Check current page content
  201 |     const pageText = await page.textContent('body');
  202 |     console.log('[TEST 2] Page text preview:', pageText?.substring(0, 300) || 'EMPTY');
  203 | 
  204 |     // Step 3: Check if search form is still showing (bad state) or order page (good state)
  205 |     const searchFormLabel = page.locator('label:has-text("Order Number")');
  206 |     const isShowingSearchForm = await searchFormLabel.isVisible({ timeout: 2000 }).catch(() => false);
  207 |     console.log('[TEST 2] Still showing search form:', isShowingSearchForm);
  208 | 
  209 |     if (isShowingSearchForm) {
  210 |       // Component stuck in search form state - this is the problem
  211 |       console.log('[TEST 2] ERROR: Component did not transition to order tracking page');
  212 |       throw new Error('Component failed to load order tracking page after JWT decode');
  213 |     }
  214 | 
  215 |     // Step 4: Wait for and verify track-order-page element
> 216 |     await page.waitForSelector('[data-testid="track-order-page"]', { timeout: 15000 });
      |                ^ TimeoutError: page.waitForSelector: Timeout 15000ms exceeded.
  217 | 
  218 |     // Step 5: Verify order heading with shop name
  219 |     const orderHeading = page.locator('h1:has-text("Order")').first();
  220 |     await expect(orderHeading).toBeVisible({ timeout: 5000 });
  221 | 
  222 |     // Step 6: Verify key sections render
  223 |     const timeline = page.locator('[data-testid="timeline"]');
  224 |     await expect(timeline).toBeVisible({ timeout: 5000 });
  225 | 
  226 |     const statusBadge = page.locator('[data-testid="status-badge"]');
  227 |     await expect(statusBadge).toBeVisible({ timeout: 5000 });
  228 |   });
  229 | 
  230 |   /**
  231 |    * Test 3: Order Tracking - Timeline Events
  232 |    * Verifies that timeline events display with correct information
  233 |    */
  234 |   test.skip('should display timeline events with details', async ({ page }) => {
  235 |     await page.goto('/track/JRH-001');
  236 |     await page.waitForLoadState('networkidle');
  237 | 
  238 |     // Verify first event is visible
  239 |     const firstEvent = page.locator('[data-testid="timeline-event"]').first();
  240 |     await expect(firstEvent).toBeVisible();
  241 | 
  242 |     // Verify event has timestamp
  243 |     const timestamp = firstEvent.locator('[data-testid="event-timestamp"]');
  244 |     await expect(timestamp).toBeVisible();
  245 | 
  246 |     // Verify event has status
  247 |     const status = firstEvent.locator('[data-testid="event-status"]');
  248 |     await expect(status).toBeVisible();
  249 |   });
  250 | 
  251 |   /**
  252 |    * Test 4: Return Initiation - Step 1 (Eligibility)
  253 |    * Verifies that return flow starts and eligibility is checked
  254 |    */
  255 |   test('should initiate return flow and check eligibility', async ({ page }) => {
  256 |     await page.goto('/track/JRH-001');
  257 |     await page.waitForLoadState('networkidle');
  258 | 
  259 |     // Click "Return Item" button
  260 |     const returnButton = page.locator('button:has-text("Return")').first();
  261 |     await returnButton.click();
  262 | 
  263 |     // Verify modal/sheet appears
  264 |     const modal = page.locator('[data-testid="return-modal"], [data-testid="return-sheet"]');
  265 |     await expect(modal).toBeVisible();
  266 | 
  267 |     // Verify eligibility check is shown
  268 |     const eligible = page.locator('[data-testid="return-eligible"]');
  269 |     await expect(eligible).toBeVisible();
  270 | 
  271 |     // Verify item selection is available
  272 |     const itemCheckbox = page.locator('[type="checkbox"]').first();
  273 |     await expect(itemCheckbox).toBeVisible();
  274 |   });
  275 | 
  276 |   /**
  277 |    * Test 5: Return Flow - Select Items
  278 |    * Verifies that user can select items for return
  279 |    */
  280 |   test('should allow item selection for return', async ({ page }) => {
  281 |     await page.goto('/track/JRH-001');
  282 |     await page.waitForLoadState('networkidle');
  283 | 
  284 |     // Click "Return Item"
  285 |     const returnButton = page.locator('button:has-text("Return")').first();
  286 |     await returnButton.click();
  287 | 
  288 |     // Select first item
  289 |     const firstItemCheckbox = page.locator('[data-testid="item-checkbox"]').first();
  290 |     await firstItemCheckbox.check();
  291 | 
  292 |     // Verify checkbox is checked
  293 |     await expect(firstItemCheckbox).toBeChecked();
  294 | 
  295 |     // Verify Next button becomes enabled
  296 |     const nextButton = page.locator('button:has-text("Next")').last();
  297 |     await expect(nextButton).toBeEnabled();
  298 |   });
  299 | 
  300 |   /**
  301 |    * Test 6: Return Flow - Select Reason
  302 |    * Verifies that user can select return reason
  303 |    */
  304 |   test('should allow reason selection for return', async ({ page }) => {
  305 |     await page.goto('/track/JRH-001');
  306 |     await page.waitForLoadState('networkidle');
  307 | 
  308 |     // Click "Return Item"
  309 |     const returnButton = page.locator('button:has-text("Return")').first();
  310 |     await returnButton.click();
  311 | 
  312 |     // Select first item
  313 |     const firstItemCheckbox = page.locator('[data-testid="item-checkbox"]').first();
  314 |     await firstItemCheckbox.check();
  315 | 
  316 |     // Click Next
```