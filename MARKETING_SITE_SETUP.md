# PulseOS Marketing Site Setup Guide

## Overview

The marketing site is built with Next.js 14, Tailwind CSS, Supabase (PostgreSQL), and Resend (email service). It collects early adopter signups with a referral system.

## Deployment Checklist

### 1. Environment Variables

Set these on Vercel or in your `.env.local`:

```bash
# Supabase (from Supabase Dashboard)
NEXT_PUBLIC_SUPABASE_URL=https://qlewszzlsqoxlqrqyrit.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from Supabase Project Settings>

# Resend API Key (from Resend Dashboard)
RESEND_API_KEY=<your_resend_api_key>

# Database URLs (from Supabase)
DATABASE_URL=<your_pooler_url>
DIRECT_URL=<your_direct_url>
```

### 2. Database Setup

The schema has been pushed to Supabase. Two tables:
- `early_adopters` — user signups with referral tracking
- `email_logs` — email send history and bounce tracking

### 3. Resend Email Setup

1. Sign up for [Resend](https://resend.com)
2. Create API key
3. Verify domain (use pulseos.com or custom domain)
4. Update sender email to: waitlist@pulseos.com

### 4. Vercel Deployment

```bash
# Push schema to production database
DIRECT_URL="..." DATABASE_URL="..." npx prisma db push

# Deploy to Vercel
npm run build
# Push to GitHub, Vercel auto-deploys
```

### 5. Custom Domain

In Vercel project settings:
- Add domain: pulseos.com
- Update DNS records (shown in Vercel)
- SSL auto-configures via Let's Encrypt

---

## Pages Built

### Home (`/`)
- Hero section: "One OS. Replace them all."
- 6 sub-OS modules
- Replaces section (GoKwik, Bitespeed, Klaviyo, etc.)
- CTA: "Join Early Access"

### Features (`/features`) — *TBD*
- Detailed breakdown of 6 OS modules
- Feature highlights, use cases

### Pricing (`/pricing`)
- 3 tiers: Starter (₹2,999), Growth (₹7,999), Scale (₹19,999)
- Feature comparison
- CTAs linking to early access

### Early Access (`/early-access`)
- **Signup form** with:
  - Email, company name, product category, Shopify store URL, expected monthly orders
  - Optional referral code (from URL ?ref=CODE)
  - Form validation via Zod
- **After signup:**
  - Shows rank in waitlist (e.g., "You're #47")
  - Shows referral code & link
  - Email sent with confirmation

### Waitlist Dashboard (`/dashboard/waitlist`)
- User enters email
- Dashboard shows:
  - Current rank
  - Referral count & position boost
  - Referral link (copy-to-clipboard)
  - Progress indicator

### Case Studies (`/case-studies`)
- 5 real case studies (placeholder text/metrics)
- Before/after metrics
- Stories of automation results

---

## API Endpoints

### POST `/api/early-access/signup`
**Request:**
```json
{
  "email": "user@company.com",
  "companyName": "My Store",
  "productCategory": "fashion",
  "shopifyStore": "https://mystore.myshopify.com",
  "expectedOrders": 50,
  "referralCode": "optional_code_123"
}
```

**Response:**
```json
{
  "success": true,
  "referralCode": "unique_code_456",
  "rank": 47
}
```

**Logic:**
1. Validate email not already registered
2. If referralCode provided, find referrer, increment their referralCount
3. Recalculate all ranks (sorted by createdAt)
4. Create EarlyAdopter record
5. Send confirmation email via Resend
6. If referral, send bonus email to referrer

### GET `/api/early-access/get-status?email=user@company.com`
**Response:**
```json
{
  "rank": 47,
  "referralCode": "code_456",
  "referralCount": 3,
  "referralLink": "https://pulseos.com/early-access?ref=code_456",
  "status": "waitlist",
  "createdAt": "2026-05-18T..."
}
```

---

## Email Workflows

### 1. Signup Confirmation
**Trigger:** User completes signup form
**Template:** Welcome email with referral link
**Content:**
```
Subject: You're #47 in line for D2C OS
- Welcome message
- Referral link
- Instructions to share
- What to expect
```

### 2. Weekly Rank Update
**Trigger:** Scheduled job (daily 10am IST)
**Template:** Rank movement notification
**Content:**
```
Subject: You're up to #42! 👀
- New rank
- Referrals received this week
- Progress bar
```

### 3. Referral Bonus
**Trigger:** When referred user completes signup
**Template:** Notification that referral worked
**Content:**
```
Subject: Your friend joined! You're now #5
- Confirm referral
- New rank
- Countdown to onboarding
```

### 4. Onboarding Ready
**Trigger:** When user reaches rank #1 (manual approval)
**Template:** Beta access granted
**Content:**
```
Subject: Your exclusive beta access is ready
- Personal onboarding call
- Setup guide
- Login credentials
- Support contact
```

---

## Referral System

### How it works:
1. User signs up → gets unique `referralCode`
2. They share link: `pulseos.com/early-access?ref=CODE`
3. Friend clicks link → form pre-fills with referral code
4. Friend completes signup → referrer's `referralCount++`
5. **Ranks are recalculated** so both users move up

### Position boost:
- Each referral = +10 positions (configurable)
- Calculated into `rank` field
- Email shows: "You've moved up 30 positions from 3 referrals"

---

## Key Database Queries

### Get waitlist with ranks
```sql
SELECT email, companyName, rank, referralCount, createdAt
FROM early_adopters
WHERE status = 'waitlist'
ORDER BY rank ASC
LIMIT 100
```

### Top referrers
```sql
SELECT email, companyName, referralCount, rank
FROM early_adopters
WHERE status = 'waitlist'
ORDER BY referralCount DESC
LIMIT 10
```

### Referral conversion rate
```sql
SELECT 
  (COUNT(*) FILTER (WHERE referredBy IS NOT NULL) * 100.0 / COUNT(*)) AS referral_pct
FROM early_adopters
WHERE status != 'churned'
```

---

## Analytics to Monitor

1. **Signup funnel:**
   - Daily signups
   - Referral vs. organic ratio
   - Signup-to-approval rate

2. **Waitlist health:**
   - Total early adopters
   - Average rank movement
   - Top 10 referrers

3. **Email performance:**
   - Send rate
   - Open rate
   - Bounce rate
   - Click rate (referral link clicks)

4. **Conversion metrics:**
   - How many reach rank #1?
   - Time to onboarding
   - Beta-to-paid conversion

---

## Testing Checklist

- [ ] Signup form validation works (empty fields, invalid email, etc.)
- [ ] Referral link pre-fills form with ?ref=CODE
- [ ] Ranks recalculate after signup
- [ ] Confirmation email sends via Resend
- [ ] Referrer email sends when referred friend signs up
- [ ] Waitlist dashboard loads for registered email
- [ ] Copy-to-clipboard works on referral link
- [ ] All CTAs link correctly (pricing → early access, case studies → early access)
- [ ] Mobile responsiveness works (form, dashboard, pages)
- [ ] Custom domain resolves (pulseos.com)

---

## Next: Marketing & Growth

Once deployed, you can:
1. **Cold email outreach** — email early adopter candidates
2. **Social media launch** — tweet, LinkedIn post, founder's network
3. **Reddit/communities** — post in r/ecommerce, r/shopify, D2C Slack groups
4. **Referral incentives** — offer perks for top referrers (priority onboarding, lifetime discount, etc.)
5. **Content marketing** — blog posts on how D2C brands are automating

---

## Success Metrics (From Plan)

- **Week 1:** 50 signups
- **Week 2:** 150 signups (word of mouth)
- **Week 3:** 300 signups
- **Week 4:** 500+ signups

**Referral target:** 30% of signups come from referrals

**Beta onboarding:** 20-50 users when you have 500+ waitlist

---

## Support

Questions? Issues?
- Check Prisma errors: `npx prisma db push --schema=packages/database/prisma/schema.prisma`
- Check Resend API key: `curl -X GET https://api.resend.com/audiences -H 'Authorization: Bearer YOUR_KEY'`
- Check database connectivity: Connect via Supabase Studio → SQL Editor → run a query
