# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customer-pwa.spec.ts >> Customer PWA - Order Tracking & Returns >> should authenticate with JWT token from URL
- Location: tests/e2e/customer-pwa.spec.ts:119:7

# Error details

```
Error: Channel closed
```

```
Error: page.goto: Test ended.
Call log:
  - navigating to "http://localhost:5173/?jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaG9wSWQiOiJ0ZXN0LXNob3AiLCJvcmRlck5hbWUiOiJKUkgtMDAxIiwiaWF0IjoxNzE2MDAwMDAwfQ.test", waiting until "load"

```

# Test source

```ts
  25  |   shipments: [
  26  |     {
  27  |       id: 'shipment-1',
  28  |       awb: 'SHP12345',
  29  |       carrier: 'Shiprocket',
  30  |       status: 'in_transit',
  31  |       lastScannedAt: new Date('2024-05-18T10:30:00').toISOString(),
  32  |       isStuck: false
  33  |     }
  34  |   ],
  35  |   returnRequests: []
  36  | };
  37  | 
  38  | const mockReturnStatus = {
  39  |   eligible: true,
  40  |   days: 7
  41  | };
  42  | 
  43  | // Setup API route mocking before tests run
  44  | test.beforeEach(async ({ page }, testInfo) => {
  45  |   // First, log all network requests to see what's actually being called
  46  |   page.on('request', request => {
  47  |     const url = request.url();
  48  |     if (url.includes('localhost') || url.includes('trpc')) {
  49  |       console.log('[NETWORK] Request:', {
  50  |         url: url.substring(url.lastIndexOf('/') > 0 ? url.lastIndexOf('/') : 0),
  51  |         method: request.method()
  52  |       });
  53  |     }
  54  |   });
  55  | 
  56  |   // Use Playwright's route interception for more reliable mocking
  57  |   // Match any request and log it, then decide what to do
  58  |   await page.route('**/*', async (route) => {
  59  |     const request = route.request();
  60  |     const url = request.url();
  61  | 
  62  |     // Log tRPC requests
  63  |     if (url.includes('trpc')) {
  64  |       console.log('[MOCK] Intercepted tRPC request:', url);
  65  | 
  66  |       if (url.includes('customer.getOrder')) {
  67  |         console.log('[MOCK] → Returning mock order');
  68  |         await route.fulfill({
  69  |           status: 200,
  70  |           contentType: 'application/json',
  71  |           body: JSON.stringify([{ result: { data: mockOrder } }])
  72  |         });
  73  |         return;
  74  |       } else if (url.includes('customer.checkReturn')) {
  75  |         console.log('[MOCK] → Returning mock return status');
  76  |         await route.fulfill({
  77  |           status: 200,
  78  |           contentType: 'application/json',
  79  |           body: JSON.stringify([{ result: { data: mockReturnStatus } }])
  80  |         });
  81  |         return;
  82  |       } else if (url.includes('customer.getRecentOrders')) {
  83  |         console.log('[MOCK] → Returning mock orders list');
  84  |         await route.fulfill({
  85  |           status: 200,
  86  |           contentType: 'application/json',
  87  |           body: JSON.stringify([{ result: { data: [mockOrder] } }])
  88  |         });
  89  |         return;
  90  |       } else if (url.includes('customer.startReturn')) {
  91  |         console.log('[MOCK] → Returning mock return started response');
  92  |         await route.fulfill({
  93  |           status: 200,
  94  |           contentType: 'application/json',
  95  |           body: JSON.stringify([{
  96  |             result: {
  97  |               data: {
  98  |                 returnId: 'return-1',
  99  |                 message: 'Return request submitted successfully',
  100 |                 status: 'pending'
  101 |               }
  102 |             }
  103 |           }])
  104 |         });
  105 |         return;
  106 |       }
  107 |     }
  108 | 
  109 |     // Continue with other requests
  110 |     await route.continue();
  111 |   });
  112 | });
  113 | 
  114 | test.describe('Customer PWA - Order Tracking & Returns', () => {
  115 |   /**
  116 |    * Test 1: Auth Flow - JWT Token Processing
  117 |    * Verifies that JWT token from URL is extracted and redirects to tracking page
  118 |    */
  119 |   test('should authenticate with JWT token from URL', async ({ page }, testInfo) => {
  120 |     // Generate a mock JWT (in real test, this would come from checkout completion)
  121 |     const mockJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaG9wSWQiOiJ0ZXN0LXNob3AiLCJvcmRlck5hbWUiOiJKUkgtMDAxIiwiaWF0IjoxNzE2MDAwMDAwfQ.test';
  122 |     const browserName = testInfo.project.name || '';
  123 | 
  124 |     // Navigate to auth page with JWT
> 125 |     await page.goto(`/?jwt=${mockJWT}`);
      |                ^ Error: page.goto: Test ended.
  126 | 
  127 |     // For webkit browsers, just verify the redirect happened
  128 |     // (localStorage behavior differs on webkit)
  129 |     if (!browserName.includes('webkit') && !browserName.includes('Safari')) {
  130 |       // Verify JWT is stored in localStorage (for chromium/firefox/mobile)
  131 |       await page.waitForTimeout(100); // Give it a moment to store
  132 |       const token = await page.evaluate(() => localStorage.getItem('auth_token'));
  133 |       expect(token).toBe(mockJWT);
  134 |     }
  135 | 
  136 |     // Verify page redirects to track order (works on all browsers)
  137 |     await page.waitForLoadState('domcontentloaded');
  138 |     await expect(page).toHaveURL(/\/track\/.+/);
  139 |   });
  140 | 
  141 |   /**
  142 |    * Test 2: Order Tracking Page - Load & Display
  143 |    * Verifies that order details load and display correctly
  144 |    */
  145 |   test('should display order tracking details', async ({ page }) => {
  146 |     const mockJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaG9wSWQiOiJ0ZXN0LXNob3AiLCJvcmRlck5hbWUiOiJKUkgtMDAxIn0.test';
  147 | 
  148 |     // Navigate directly to track page with JWT
  149 |     await page.goto(`/?jwt=${mockJWT}`);
  150 | 
  151 |     // Wait for page to load and redirect to complete
  152 |     await page.waitForLoadState('networkidle');
  153 | 
  154 |     // Wait for the order details to be rendered (may need extra time for React to render after network settles)
  155 |     await page.waitForTimeout(500);
  156 | 
  157 |     // Wait specifically for the timeline to appear in the DOM
  158 |     await page.waitForSelector('[data-testid="track-order-page"]', { timeout: 5000 });
  159 | 
  160 |     // Verify tracking timeline is rendered
  161 |     const timeline = page.locator('[data-testid="timeline"]');
  162 |     await expect(timeline).toBeVisible();
  163 | 
  164 |     // Verify status badge is visible
  165 |     const badge = page.locator('[data-testid="status-badge"]');
  166 |     await expect(badge).toBeVisible();
  167 |   });
  168 | 
  169 |   /**
  170 |    * Test 3: Order Tracking - Timeline Events
  171 |    * Verifies that timeline events display with correct information
  172 |    */
  173 |   test('should display timeline events with details', async ({ page }) => {
  174 |     const mockJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaG9wSWQiOiJ0ZXN0LXNob3AiLCJvcmRlck5hbWUiOiJKUkgtMDAxIn0.test';
  175 | 
  176 |     await page.goto(`/?jwt=${mockJWT}`);
  177 |     await page.waitForLoadState('networkidle');
  178 | 
  179 |     // Verify first event is visible
  180 |     const firstEvent = page.locator('[data-testid="timeline-event"]').first();
  181 |     await expect(firstEvent).toBeVisible();
  182 | 
  183 |     // Verify event has timestamp
  184 |     const timestamp = firstEvent.locator('[data-testid="event-timestamp"]');
  185 |     await expect(timestamp).toBeVisible();
  186 | 
  187 |     // Verify event has status
  188 |     const status = firstEvent.locator('[data-testid="event-status"]');
  189 |     await expect(status).toBeVisible();
  190 |   });
  191 | 
  192 |   /**
  193 |    * Test 4: Return Initiation - Step 1 (Eligibility)
  194 |    * Verifies that return flow starts and eligibility is checked
  195 |    */
  196 |   test('should initiate return flow and check eligibility', async ({ page }) => {
  197 |     const mockJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaG9wSWQiOiJ0ZXN0LXNob3AiLCJvcmRlck5hbWUiOiJKUkgtMDAxIn0.test';
  198 | 
  199 |     await page.goto(`/?jwt=${mockJWT}`);
  200 |     await page.waitForLoadState('networkidle');
  201 | 
  202 |     // Click "Return Item" button
  203 |     const returnButton = page.locator('button:has-text("Return")').first();
  204 |     await returnButton.click();
  205 | 
  206 |     // Verify modal/sheet appears
  207 |     const modal = page.locator('[data-testid="return-modal"], [data-testid="return-sheet"]');
  208 |     await expect(modal).toBeVisible();
  209 | 
  210 |     // Verify eligibility check is shown
  211 |     const eligible = page.locator('[data-testid="return-eligible"]');
  212 |     await expect(eligible).toBeVisible();
  213 | 
  214 |     // Verify item selection is available
  215 |     const itemCheckbox = page.locator('[type="checkbox"]').first();
  216 |     await expect(itemCheckbox).toBeVisible();
  217 |   });
  218 | 
  219 |   /**
  220 |    * Test 5: Return Flow - Select Items
  221 |    * Verifies that user can select items for return
  222 |    */
  223 |   test('should allow item selection for return', async ({ page }) => {
  224 |     const mockJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaG9wSWQiOiJ0ZXN0LXNob3AiLCJvcmRlck5hbWUiOiJKUkgtMDAxIn0.test';
  225 | 
```