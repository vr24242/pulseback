# Phase 3 PWA Deployment Guide

## Overview

All Phase 3 components are built and ready to deploy:
- ✅ **Shopify App** — Live at https://pulseback.fly.dev
- 🔄 **Customer PWA** — Ready for Vercel deployment
- 🔄 **Merchant PWA** — Ready for Vercel deployment

---

## Customer PWA Deployment (pulseback.app)

### Prerequisites
1. GitHub repository pushed with latest code
2. Vercel account (https://vercel.com)
3. Domain registered or pointing to Vercel nameservers

### Step 1: Connect Repository to Vercel

1. Go to https://vercel.com/new
2. Select "Other" → "Clone Template"
3. Or: Import your GitHub repo directly
4. Select the repository `d2c-os`

### Step 2: Configure Project Settings

**Project Name:** `customer-pwa`

**Root Directory:** `apps/customer-pwa` ← **IMPORTANT**

**Build Command:** (leave default or use)
```bash
npm run build --filter=@d2c/customer-pwa
```

**Output Directory:** `dist`

**Install Command:** (leave default)
```bash
npm install
```

### Step 3: Environment Variables

Add to Vercel dashboard under "Settings → Environment Variables":

```
VITE_API_URL = https://pulseback.fly.dev/trpc
```

**Production:** Add for all environments (Production, Preview, Development)

### Step 4: Domain Configuration

1. In Vercel: Settings → Domains
2. Add custom domain: `pulseback.app`
3. Update your domain registrar to point to Vercel nameservers (or CNAME)

### Step 5: Deploy

Click **Deploy** button in Vercel dashboard.

Deployment will:
- Build the PWA (`npm run build`)
- Run TypeScript checks
- Output to `dist/`
- Deploy to `pulseback.app`

Expected build time: ~2 minutes

---

## Merchant PWA Deployment (pulseback.io)

Follow the same steps as Customer PWA, but:

**Project Name:** `merchant-pwa`

**Root Directory:** `apps/merchant-pwa`

**Domain:** `pulseback.io`

**Environment Variables:** Same as Customer PWA

---

## Testing After Deployment

### Customer PWA (pulseback.app)

1. Create a test order in your Shopify store
2. Complete checkout
3. You'll be redirected to: `https://pulseback.app/track?jwt={token}`
4. Verify:
   - ✅ JWT token loads from URL
   - ✅ Dashboard redirects to Dashboard
   - ✅ `/track/:orderId` page loads
   - ✅ Order details display correctly
   - ✅ Return button visible for eligible orders

### Merchant PWA (pulseback.io)

1. Go to https://pulseback.io
2. You should see Login page
3. Paste a valid JWT token from your auth system
4. Verify:
   - ✅ Login redirects to Dashboard
   - ✅ Dashboard metrics load (NDR count, Returns count, Orders)
   - ✅ Navigation sidebar works
   - ✅ Click "Stuck Shipments" → NDR Queue loads
   - ✅ Click "Pending Returns" → Returns Queue loads

---

## JWT Token Generation

For testing, generate a JWT token using your auth system:

```typescript
// From @d2c/api/src/context.ts
import { generateToken } from "@d2c/api"

const token = await generateToken({
  shopId: "shop_123",
  shopDomain: "mystore.myshopify.com",
})

// Use token:
// Merchant PWA: paste into login form
// Customer PWA: manual redirect to https://pulseback.app/track?jwt={token}
```

---

## CORS Configuration

Both PWAs are configured to call:
```
VITE_API_URL=https://pulseback.fly.dev/trpc
```

The Shopify app has CORS headers configured for:
- `https://pulseback.app`
- `https://pulseback.io`
- `localhost:5173` (dev)
- `localhost:3000` (dev)

---

## Troubleshooting

### "Cannot GET /track"
- Make sure Vercel is configured to rewrite all routes to `index.html`
- Vercel config is in `vercel.json` (already created)

### "CORS error calling tRPC"
- Check that `VITE_API_URL` is set correctly in Vercel
- Verify Shopify app CORS headers include your PWA domain
- Check browser console for exact error

### "JWT decode failed"
- Token may have expired (default 24h expiry)
- Generate a new token with `generateToken()`
- Ensure token is valid JWT format (3 parts separated by dots)

### Build fails
- Clear Vercel cache: Settings → Deployments → Clear Cache
- Verify `Root Directory` is set to correct path
- Check that all dependencies are installed: `npm install`

---

## Production Checklist

- [ ] Customer PWA deployed to pulseback.app
- [ ] Merchant PWA deployed to pulseback.io
- [ ] Both PWAs can reach tRPC endpoint (check Network tab)
- [ ] JWT tokens generated and tested
- [ ] End-to-end checkout → tracking flow works
- [ ] Merchant login → dashboard loads
- [ ] Service workers enabled (offline support)
- [ ] Analytics configured (optional)
- [ ] DNS propagated (may take 24h)
- [ ] SSL certificates valid (Vercel handles automatically)

---

## Next Steps After PWA Deployment

Once both PWAs are live and tested:

1. **Deploy Phase 1/2 work** (1-2 weeks)
   - Fix Shiprocket E2E issues
   - Add Tier 1 checkout features

2. **Deploy Phase 4** (agents)
   - Logistics Agent
   - Operations Agent
   - Intelligence Agent
   - Marketing Agent

---

## Support

For deployment issues:
- Vercel docs: https://vercel.com/docs
- tRPC docs: https://trpc.io
- Remix docs: https://remix.run/docs
