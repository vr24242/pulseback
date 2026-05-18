# Phase 5.3: E2E Testing Guide

**Purpose:** Validate that Customer PWA and Merchant PWA work end-to-end with the backend orchestrator system.

**Status:** Tests created and ready to run

**Timeline:** 2-3 hours to run full suite + fix any issues

---

## Quick Start (5 minutes)

```bash
# 1. Install Playwright
npm install

# 2. Start Customer PWA dev server (Terminal 1)
cd apps/customer-pwa && npm run dev

# 3. Start Merchant PWA dev server (Terminal 2)  
cd apps/merchant-pwa && npm run dev

# 4. Run tests (Terminal 3, from root)
npm test

# 5. View results
npm run test:report
```

---

## Detailed Test Execution

### Step 1: Environment Setup

**Prerequisites:**
- Node 20+
- npm 10+
- Both dev servers running
- Database connection active
- Redis connection active

**Check Status:**
```bash
# Verify ports are available
lsof -i :5173  # Customer PWA
lsof -i :3000  # Merchant PWA
lsof -i :6379  # Redis
```

### Step 2: Database Preparation

**Ensure test data exists:**

```sql
-- In your Supabase/Postgres database
-- Customer PWA needs test order
INSERT INTO "Order" (
  id, shopId, shopifyOrderId, shopifyOrderName,
  customerId, phone, totalPrice, status,
  createdAt
) VALUES (
  'test-order-1', 'test-shop', '123456', 'JRH-001',
  'test-customer', '+919876543210', 2999.00, 'delivered',
  NOW()
);

-- Merchant PWA needs NDR shipment
INSERT INTO "Shipment" (
  id, orderId, shopId, awb, carrier, status,
  isStuck, ndrAttempts, failedAttempts,
  createdAt
) VALUES (
  'test-shipment-1', 'test-order-1', 'test-shop',
  'SR9876543', 'shiprocket', 'ndr',
  true, 1, 1,
  NOW()
);

-- Add return request for testing
INSERT INTO "ReturnRequest" (
  id, orderId, customerId, shopId, status,
  createdAt
) VALUES (
  'test-return-1', 'test-order-1', 'test-customer', 'test-shop',
  'pending',
  NOW()
);
```

### Step 3: Start Dev Servers

**Terminal 1: Customer PWA**
```bash
cd apps/customer-pwa
npm run dev
# Expected output: VITE v5.0.0  ready in XXX ms
# Local: http://localhost:5173/
```

**Terminal 2: Merchant PWA**
```bash
cd apps/merchant-pwa
npm run dev
# Expected output: ready in XXX ms
# Local: http://localhost:3000/
```

**Terminal 3: API Server (if needed)**
```bash
cd apps/shopify
npm run dev
# Expected output: listening on localhost:3030
```

### Step 4: Run Tests

**From root directory:**

```bash
# Run all tests
npm test

# Run customer PWA tests only
npm run test:e2e:customer

# Run merchant PWA tests only  
npm run test:e2e:merchant

# Run with UI (interactive browser)
npm run test:ui

# Run with headed browser (see browser window)
npm run test:headed

# Run in debug mode (step through)
npm run test:debug
```

### Step 5: Review Results

**View HTML report:**
```bash
npm run test:report
```

**Expected artifacts:**
- `playwright-report/index.html` — Full test report with screenshots
- `test-results/` — Individual test artifacts
- `.auth/` — Session storage (if using auth persistence)

---

## Test Scenarios

### Customer PWA Tests (10 tests)

#### 1. Auth Flow - JWT Token Processing ✓
**What it tests:** JWT extraction from URL and localStorage
**Prerequisites:** JWT token generation working
**Expected:** Token stored, page redirects to tracking

#### 2. Order Tracking Page - Load & Display ✓
**What it tests:** Order page loads with data
**Prerequisites:** Order exists in DB
**Expected:** Timeline and status badge visible

#### 3-4. Timeline Events & Tracking Details ✓
**What it tests:** Tracking events render correctly
**Prerequisites:** Order has shipment history
**Expected:** Each event shows status, timestamp, location

#### 5. Return Initiation - Eligibility ✓
**What it tests:** Return flow starts, eligibility checked
**Prerequisites:** Delivered order within 7 days
**Expected:** Modal opens, items selectable

#### 6-7. Return Flow - Item & Reason Selection ✓
**What it tests:** Can select items and reason
**Prerequisites:** Eligible order
**Expected:** Checkboxes work, reason options appear

#### 8. Return Flow - Confirmation ✓
**What it tests:** Return can be submitted
**Prerequisites:** All fields filled
**Expected:** Success message shows, return queued

#### 9. Accessibility - Keyboard Navigation ✓
**What it tests:** Tab/Enter keys work
**Prerequisites:** Page has focusable elements
**Expected:** Can navigate and activate with keyboard

#### 10. Mobile Responsiveness ✓
**What it tests:** Layout works on 375x812 (iPhone)
**Prerequisites:** Responsive CSS implemented
**Expected:** Content visible, buttons >= 44x44px

### Merchant PWA Tests (12 tests)

#### 1. Login Flow - JWT Entry ✓
**What it tests:** Can paste JWT and login
**Prerequisites:** JWT validation working
**Expected:** Logged in, redirected to dashboard

#### 2. Dashboard - KPI Display ✓
**What it tests:** Dashboard loads with metrics
**Prerequisites:** Orders exist in DB
**Expected:** KPI cards visible (orders, NDR, returns count)

#### 3-4. Exception Queue Display ✓
**What it tests:** Queue lists items
**Prerequisites:** Exceptions in DB
**Expected:** Exception items visible with details

#### 5-6. NDR Queue & Details ✓
**What it tests:** NDR items display, details open
**Prerequisites:** NDR shipments in DB
**Expected:** Click to expand, see tracking history + recommendation

#### 7. NDR Approval - Reattempt ✓
**What it tests:** Can approve reattempt action
**Prerequisites:** NDR item exists
**Expected:** Success message, tRPC call made

#### 8-9. Returns Queue & Approval ✓
**What it tests:** Return items list, can approve
**Prerequisites:** Pending returns in DB
**Expected:** Can click approve, action executes

#### 10. Inline Actions ✓
**What it tests:** Action buttons on items work
**Prerequisites:** Items have action buttons
**Expected:** Click triggers action, notification shows

#### 11. Dark Mode ✓
**What it tests:** Dark mode toggle works
**Prerequisites:** Dark mode implemented
**Expected:** CSS class applied, content readable

#### 12. Token Validation ✓
**What it tests:** Invalid JWT rejected
**Prerequisites:** Auth validation working
**Expected:** Error message shown, login fails

---

## Interpreting Test Results

### ✓ All Tests Pass
**Status:** Ready for Phase 5.3 completion
**Next Step:** Move to Phase 4 (Analytics/Stakeholder Views)

### ⚠️ Some Tests Fail
**Common Issues:**

| Issue | Solution |
|-------|----------|
| Timeout (element not found) | Increase `timeout` in test, check selector in browser |
| 404 / Connection refused | Verify dev server running on correct port |
| "JWT expired" | Generate fresh JWT token in test |
| Layout not responsive | Check media queries in CSS |
| Dark mode not working | Verify toggle HTML element exists |
| API calls fail | Check backend is running, tRPC configured |

**Example: Fix timeout issue**
```typescript
test('should display order tracking details', async ({ page }) => {
  // ...
  await page.waitForSelector('[data-testid="timeline"]', { timeout: 10000 });
});
```

### ✗ Critical Failures

**If customer PWA auth fails:**
- Check JWT generation in checkout route
- Verify localStorage working in browser
- Check Auth component code

**If merchant PWA API calls fail:**
- Verify tRPC client configured correctly
- Check Bearer token header in requests
- Ensure API server running on port 3000

**If database queries fail:**
- Verify test data inserted
- Check schema matches expected tables
- Run `prisma db push` if schema changed

---

## Debugging Individual Tests

### Use Playwright Inspector

```bash
npm run test:debug
# Opens inspector UI, can step through tests
```

### View Browser During Test

```bash
npm run test:headed
# Runs tests with visible browser window
# Shows exactly what's happening
```

### Run Single Test

```bash
npx playwright test -g "should display order tracking details"
# Runs only tests matching that pattern
```

### Take Screenshots on Failure

Tests automatically capture screenshots. View in:
- `test-results/` directory
- Or open HTML report: `npm run test:report`

### Check Network Requests

In Playwright Inspector:
1. Open DevTools (Ctrl+Shift+I)
2. Go to Network tab
3. Re-run test
4. See all API calls and responses

---

## Performance Benchmarks

**Expected test execution times:**

| Test Suite | Count | Duration |
|-----------|-------|----------|
| Customer PWA (all) | 10 | 3-5 min |
| Merchant PWA (all) | 12 | 4-6 min |
| **Total** | **22** | **7-11 min** |

If tests take significantly longer:
- Check for `waitForNavigation` without timeout
- Look for unnecessary `page.waitForTimeout()`
- Profile slowest tests with `--debug`

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
    
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - run: npm install
      - run: npx playwright install
      
      - name: Start services
        run: |
          cd apps/customer-pwa && npm run dev &
          cd apps/merchant-pwa && npm run dev &
          sleep 5
      
      - run: npm test
      
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## Common Issues & Solutions

### Issue: Tests timeout waiting for element

**Symptoms:** `Timeout 30000ms exceeded waiting for selector`

**Solutions:**
1. Verify element exists on page: open in browser with `--headed`
2. Check `data-testid` attribute is correct
3. Increase timeout: `{ timeout: 60000 }`
4. Wait for parent first: `await page.waitForLoadState('networkidle')`

### Issue: JWT login fails

**Symptoms:** "Error: invalid token" or login button doesn't work

**Solutions:**
1. Verify JWT is properly formatted (should decode with jose)
2. Check expiration isn't in past
3. Ensure login endpoint returns auth token to localStorage
4. Check CORS headers allow requests

### Issue: API calls fail in Merchant PWA

**Symptoms:** "Failed to fetch" or 401 Unauthorized

**Solutions:**
1. Verify Bearer token is included in Authorization header
2. Check tRPC client has correct baseUrl
3. Ensure backend server is running and accessible
4. Verify JWT includes proper shopId

### Issue: Tests pass locally but fail in CI

**Symptoms:** All tests fail in GitHub Actions but work on machine

**Solutions:**
1. Ensure services (DB, Redis) are running in CI
2. Check environment variables are set in CI
3. Verify localhost:5173 and localhost:3000 are accessible in CI
4. Use longer timeouts for CI (slower than local)

---

## Next Steps After Testing

### If All Tests Pass ✓
1. ✅ Phase 5.3 (E2E Testing) is **COMPLETE**
2. Mark worker integration as verified
3. Document test coverage for stakeholders
4. Move to Phase 4: Analytics & Stakeholder Views

### If Some Tests Fail ⚠️
1. Fix failing tests (see debugging section)
2. Re-run tests until all pass
3. Document any workarounds
4. Create GitHub issues for systematic problems

### If Tests Reveal Bugs
1. Create separate issue tracker
2. Fix issues in main codebase
3. Update tests to cover fixes
4. Re-run full suite before Phase 4

---

## Test Maintenance

**Update tests when:**
- Component selectors change (`data-testid`)
- Page routes change
- New features added
- API endpoints change

**Review tests quarterly:**
- Remove obsolete tests
- Add coverage for new features
- Update expected values if business rules change
- Optimize slow tests

---

## References

- **Playwright Docs:** https://playwright.dev
- **Debug Guide:** https://playwright.dev/docs/debug
- **Best Practices:** https://playwright.dev/docs/best-practices
- **Selectors:** https://playwright.dev/docs/selectors
- **Assertions:** https://playwright.dev/docs/test-assertions

---

## Success Criteria

✓ All 22 E2E tests pass
✓ Customer PWA auth → tracking flow works
✓ Merchant PWA JWT login → approval actions work
✓ Mobile responsiveness verified (375x812)
✓ Accessibility verified (keyboard navigation)
✓ Dark mode functional
✓ Real-time updates working
✓ Error handling verified

**Phase 5.3 Complete when:** All success criteria met + all tests pass
