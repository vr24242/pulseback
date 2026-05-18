# PulseOS E2E Tests

End-to-end tests for Customer PWA and Merchant PWA using Playwright.

## Setup

### 1. Install Playwright
```bash
npm install --save-dev @playwright/test
# or
npx playwright install
```

### 2. Environment Variables

Create a `.env.test` file at the root:
```env
# Customer PWA (defaults to localhost:5173 from vite dev server)
BASE_URL=http://localhost:5173

# Merchant PWA (defaults to localhost:3000)
MERCHANT_PWA_URL=http://localhost:3000
```

### 3. Start Dev Servers

**Terminal 1: Customer PWA**
```bash
cd apps/customer-pwa
npm run dev
# Runs on http://localhost:5173
```

**Terminal 2: Merchant PWA**
```bash
cd apps/merchant-pwa
npm run dev
# Runs on http://localhost:3000
```

## Running Tests

### Run All Tests
```bash
npx playwright test
```

### Run Specific Test Suite
```bash
# Customer PWA tests only
npx playwright test customer-pwa.spec.ts

# Merchant PWA tests only
npx playwright test merchant-pwa.spec.ts
```

### Run Tests with UI
```bash
npx playwright test --ui
```

### Run Tests in Debug Mode
```bash
npx playwright test --debug
```

### Run Tests with Headed Browser (see browser)
```bash
npx playwright test --headed
```

### Run Specific Test
```bash
npx playwright test -g "should display order tracking details"
```

## Test Files

### `customer-pwa.spec.ts`
Tests for customer order tracking and returns workflow:
- **Auth Flow**: JWT token processing and extraction
- **Order Tracking**: Display order details and timeline
- **Timeline Events**: Verify event rendering with details
- **Return Initiation**: Start return flow and check eligibility
- **Item Selection**: Select items for return
- **Reason Selection**: Select return reason
- **Address Selection**: Choose pickup address
- **Return Submission**: Complete and submit return
- **Accessibility**: Keyboard navigation (Tab, Enter)
- **Mobile Responsiveness**: Verify mobile layout (375x812)

### `merchant-pwa.spec.ts`
Tests for merchant exception management:
- **Login Flow**: JWT token entry and authentication
- **Dashboard**: Display KPI metrics
- **Exception Queue**: List and display exceptions
- **NDR Queue**: List NDR items with details
- **NDR Details**: View detailed NDR information
- **NDR Approval**: Approve reattempt action
- **Return Queue**: List pending returns
- **Return Approval**: Approve return action
- **Inline Actions**: Execute actions on items
- **Dark Mode**: Verify dark mode functionality
- **Real-Time Updates**: Verify data polling
- **Token Validation**: Handle invalid JWTs

## Test Data

Tests use mock JWT tokens that are base64-encoded JSON:

### Customer PWA Token
```json
{
  "shopId": "test-shop",
  "orderName": "JRH-001"
}
```

### Merchant PWA Token
```json
{
  "shopId": "test-shop",
  "shopDomain": "test.myshopify.com",
  "iat": 1716000000,
  "exp": 9999999999
}
```

## Test Data Requirements

For tests to work properly, you need:

### Customer PWA
- An order with order name `JRH-001` (or update tests with real order name)
- Shipment with tracking events
- Customer with phone number for returns

### Merchant PWA
- Logged-in shop with `shopId: "test-shop"`
- At least one NDR (non-delivered return) shipment
- At least one pending return request
- Valid JWT token for the shop

## Debugging

### View Test Report
```bash
npx playwright show-report
```

### Check Network Activity
Playwright automatically captures network requests. View in the HTML report.

### Take Screenshots
Tests automatically take screenshots on failure. Find them in `test-results/` directory.

### View Trace
```bash
npx playwright show-trace <path-to-trace.zip>
```

## CI/CD Integration

For GitHub Actions, add to `.github/workflows/test.yml`:
```yaml
- name: Run Playwright tests
  run: npx playwright test
  env:
    BASE_URL: http://localhost:5173
    MERCHANT_PWA_URL: http://localhost:3000
```

## Troubleshooting

### Tests Timeout
- Increase `timeout` in specific test: `test.setTimeout(30000)`
- Increase global timeout in `playwright.config.ts`

### Network Errors
- Ensure dev servers are running on correct ports
- Check `BASE_URL` and `MERCHANT_PWA_URL` environment variables

### Login Issues
- Verify JWT token is valid and not expired
- Check that login endpoint is working
- Ensure test data (shop, customer) exists in database

### Element Not Found
- Use `--headed` mode to see what's on screen
- Use `--debug` mode to step through test
- Verify `data-testid` attributes exist in component code

## Writing New Tests

1. Use clear test names: "should [action] [expected result]"
2. Add `data-testid` attributes to components for reliable selection
3. Use page object model for complex workflows
4. Always clean up after tests (logout, clear data)
5. Wait for elements: `await expect(element).toBeVisible()`
6. Use descriptive error messages

Example:
```typescript
test('should submit form successfully', async ({ page }) => {
  // Arrange
  await page.goto('/');
  
  // Act
  const input = page.locator('[data-testid="name-input"]');
  await input.fill('John Doe');
  
  const button = page.locator('[data-testid="submit-btn"]');
  await button.click();
  
  // Assert
  const success = page.locator('[data-testid="success-msg"]');
  await expect(success).toBeVisible();
});
```

## Coverage

Current test coverage:
- **Customer PWA**: 10 tests (auth, tracking, returns, accessibility, mobile)
- **Merchant PWA**: 12 tests (login, dashboard, NDR queue, returns, actions)

Target coverage:
- Unit tests: >80% for business logic
- E2E tests: All critical user workflows
- Accessibility: WCAG 2.1 AA compliance

## Links

- [Playwright Documentation](https://playwright.dev)
- [Debugging Guide](https://playwright.dev/docs/debug)
- [Best Practices](https://playwright.dev/docs/best-practices)
