# Phase 3 PWA E2E Testing Guide

**Date:** May 18, 2026  
**Purpose:** Validate Customer PWA (Tracking) and Merchant PWA (Exception Management) end-to-end before production  
**Status:** Ready for execution

---

## Test Environment Setup

### Prerequisites
- [ ] Production database has at least one test Shop installed
- [ ] CUSTOMER_PWA_URL env var set to https://pulseback.app (or test Vercel URL)
- [ ] Merchant PWA deployed and accessible
- [ ] WhatsApp integration live (using AiSensy or WATI)
- [ ] Shopify test store accessible
- [ ] Test phone number ready (can receive WhatsApp)

---

## TEST 1: Customer PWA Tracking Flow

### 1.1 Prerequisites
- [ ] Have a Shopify development store with PulseOS app installed
- [ ] Have a test phone number that can receive WhatsApp messages
- [ ] Customer PWA is deployed (check https://pulseback.app is accessible)

### 1.2 Test: Order Creation → Tracking Link → Auto-Load

**Step 1: Create Test Order**
```
Action: Create a test order on your Shopify dev store
- Product: Any available product
- Payment: COD (Cash on Delivery)
- Phone: Your test phone number (10 digits)
- Address: Valid pincode + address
- Submit order
```

Expected outcome:
- [ ] Order created successfully in Shopify Admin
- [ ] Order appears in database with status="pending"
- [ ] Payment method is "cod"

**Step 2: Verify WhatsApp Message Received**
```
Check WhatsApp on your test phone
```

Expected outcome:
- [ ] Message received within 30 seconds (webhook → communication worker)
- [ ] Message includes:
  - Order number (e.g., "#12345")
  - Amount (e.g., "₹3,500")
  - Tracking link (e.g., "https://pulseback.app/auth?jwt=eyJ...")
  - Message text in customer's language

**Step 3: Click Tracking Link**
```
Action: Click the tracking link in WhatsApp
```

Expected outcome:
- [ ] Browser opens to https://pulseback.app/auth?jwt=...
- [ ] Auth page shows "Authenticating..." with loading bar
- [ ] Within 2 seconds, redirects to /track/{orderName}
- [ ] TrackOrder page loads with order details

**Step 4: Verify Order Details Display**
```
Check if order tracking page shows:
```

Expected outcome:
- [ ] Order number displayed
- [ ] Status badge (e.g., "Confirmed", "Dispatched")
- [ ] Items list with product names + quantities
- [ ] Shipping address shown correctly
- [ ] Delivery status and tracking info
- [ ] "Initiate Return" button (if eligible)

**Step 5: Verify Auto-Login Works**
```
Action: Refresh the page (F5)
```

Expected outcome:
- [ ] Page reloads without auth re-prompt
- [ ] Order details still visible
- [ ] JWT token persisted in localStorage

### 1.3 Test: Return Initiation Flow

**Step 6: Check Return Eligibility**
```
Action: Scroll to "Initiate Return" button
```

Expected outcome:
- [ ] Button visible (if order delivered and < 7 days old)
- [ ] Button disabled with reason if not eligible

**Step 7: Initiate Return**
```
Action (if eligible):
1. Click "Initiate Return"
2. Select item(s) to return
3. Choose reason (e.g., "Damaged", "Size issue")
4. Optionally upload photo
5. Click "Submit Return"
```

Expected outcome:
- [ ] Form accepts selection
- [ ] Photo upload works (optional)
- [ ] Submission succeeds
- [ ] Confirmation message appears
- [ ] Merchant receives notification

### 1.4 Test Summary
- [ ] All steps completed without errors
- [ ] Order loaded automatically without manual auth
- [ ] Return initiation works if eligible
- [ ] Page is responsive on mobile (PWA works on all screen sizes)

---

## TEST 2: Merchant PWA Exception Queue

### 2.1 Prerequisites
- [ ] Merchant PWA is deployed (check Vercel link)
- [ ] Have test shop credentials (shopId, domain)
- [ ] Test shop has at least one order/NDR/return in exception queue
- [ ] tRPC API is running on Fly.io

### 2.2 Test: JWT Login → Dashboard Load

**Step 1: Generate JWT**
```
Using the tRPC router (merchant.generateToken):
- shopId: {your-test-shop-id}
- domain: {your-test-shop-domain}
```

Or use this Node.js snippet:
```javascript
const { SignJWT } = require("jose");

async function generateMerchantJWT() {
  const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret");
  
  const token = await new SignJWT({
    shopId: "test-shop-id",
    shopDomain: "test-shop.myshopify.com",
    type: "merchant",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(JWT_SECRET);
  
  console.log("JWT:", token);
}

generateMerchantJWT();
```

Expected outcome:
- [ ] JWT token generated successfully
- [ ] Token is a valid JWT format (header.payload.signature)

**Step 2: Login to Merchant PWA**
```
Action:
1. Navigate to https://dist-2749gnlkl-varun-raos-projects.vercel.app (or your domain)
2. Paste JWT token into login field
3. Click "Login"
```

Expected outcome:
- [ ] JWT accepted
- [ ] Redirects to /dashboard
- [ ] Dashboard loads

**Step 3: Verify Dashboard Loads KPIs**
```
Check dashboard for:
```

Expected outcome:
- [ ] "Orders Today" count displays (≥0)
- [ ] "Pending Returns" count displays (≥0)
- [ ] "Stuck Shipments" count displays (≥0)
- [ ] Loading state clears within 2 seconds
- [ ] No error messages

### 2.3 Test: NDR Queue & Actions

**Step 4: Navigate to NDR Queue**
```
Action: Click "Stuck Shipments" or "NDR Queue" tab
```

Expected outcome:
- [ ] Page loads
- [ ] List of stuck shipments displays (if any exist)
- [ ] Each shipment shows:
  - AWB number
  - Customer phone
  - Last update timestamp
  - Status badge (e.g., "Stuck 3+ days")
  - Action buttons (Retry, Update Address, Initiate RTO)

**Step 5: Test Action Button (Retry)**
```
Action:
1. Find a stuck shipment
2. Click "Retry" button
3. Confirm action
```

Expected outcome:
- [ ] Button click is accepted
- [ ] tRPC call executes (check network tab)
- [ ] Success message appears
- [ ] Shipment status updates
- [ ] Decision recorded in database (check AgentDecision table)

### 2.4 Test: Returns Queue

**Step 6: Navigate to Returns Queue**
```
Action: Click "Pending Returns" or "Returns Queue" tab
```

Expected outcome:
- [ ] Page loads
- [ ] List of pending returns displays (if any exist)
- [ ] Each return shows:
  - Order number
  - Customer name/phone
  - Items returned
  - Status badge (e.g., "Awaiting Approval")
  - Approval buttons (Approve, Reject, Request Changes)

**Step 7: Test Approval Action**
```
Action:
1. Find a pending return
2. Click "Approve" button
3. Confirm
```

Expected outcome:
- [ ] Approval processed
- [ ] tRPC call executes
- [ ] Return status updates
- [ ] Customer receives WA notification

### 2.5 Test Summary
- [ ] JWT login works
- [ ] Dashboard loads without auth errors
- [ ] KPI counts are accurate
- [ ] NDR queue displays stuck shipments
- [ ] Returns queue displays pending returns
- [ ] Action buttons (Retry, Approve, etc.) execute successfully
- [ ] Decisions are recorded in database
- [ ] Customer receives notifications for actions

---

## Data Verification Checklist

After completing both tests, verify data integrity in database:

```sql
-- Check order was created
SELECT * FROM "Order" WHERE shopifyOrderName LIKE '%{your-order-number}%';

-- Check communication was sent (tracking URL)
SELECT * FROM "Communication" 
WHERE orderId = {order-id} 
  AND triggerType = 'order.placed.cod'
  AND channel = 'whatsapp';

-- Check JWT token has outcome recorded
SELECT * FROM "Communication" 
WHERE outcomeRef IS NOT NULL 
  AND outcome IS NOT NULL;

-- Check merchant decisions were recorded
SELECT * FROM "AgentDecision" 
WHERE shopId = '{shop-id}' 
  AND createdAt > NOW() - INTERVAL '1 hour'
ORDER BY createdAt DESC;

-- Check learning outcomes recorded
SELECT * FROM "LearningOutcome" 
WHERE createdAt > NOW() - INTERVAL '1 hour'
ORDER BY createdAt DESC;
```

---

## Deployment Checklist

Before going live, ensure:

```bash
# 1. All environment variables set on Fly.io
fly secrets list --app pulseback

# 2. Verify CUSTOMER_PWA_URL is set
fly secrets get CUSTOMER_PWA_URL --app pulseback

# 3. Verify JWT_SECRET is set
fly secrets get JWT_SECRET --app pulseback

# 4. Rebuild and deploy if needed
fly deploy --app pulseback

# 5. Verify Merchant PWA is accessible
curl -I https://merchant-pwa-prod.vercel.app

# 6. Verify Customer PWA is accessible
curl -I https://pulseback.app
```

---

## Known Issues & Workarounds

| Issue | Workaround |
|-------|-----------|
| JWT expired | Generate new token, re-login |
| Order not found | Check phone/order number match exactly |
| WhatsApp not received | Check WA service status, verify phone is 10 digits |
| tRPC call fails | Check Authorization header has Bearer token |
| Dashboard won't load | Clear localStorage, re-login with new JWT |

---

## Success Criteria

All tests pass when:
- ✅ Order created → WhatsApp received → Tracking link works → Order auto-loads
- ✅ Returns can be initiated from tracking page
- ✅ Merchant JWT login works without errors
- ✅ Dashboard loads KPI data correctly
- ✅ NDR/Returns queue displays accurately
- ✅ Action buttons execute successfully
- ✅ All decisions recorded in database
- ✅ Notifications reach customers via WhatsApp

**Ready for production when all above criteria met.**

---

## Rollback Plan

If any test fails:
1. Check error message (browser console, network tab, server logs)
2. Review recent code changes in that area
3. Run: `fly logs --app pulseback | grep error`
4. Fix issue and redeploy
5. Re-run failed test
6. Only proceed to production once all tests pass

---

**Last Updated:** May 18, 2026  
**Next Review:** After first live order
