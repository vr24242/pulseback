# Marketing Site Deployment & Launch Guide

## What Was Built (Phase 6 - Complete ✅)

### Pages (5 pages live):
1. **Home (`/`)** — Hero + features + CTA to early access
2. **Early Access Form (`/early-access`)** — Signup with referral support
3. **Waitlist Dashboard (`/dashboard/waitlist`)** — Check rank & share referral link
4. **Case Studies (`/case-studies`)** — 5 real ROI examples
5. **Pricing (`/pricing`)** — 3 tier pricing (pre-built)

### Core Features:
- ✅ Early adopter database (EarlyAdopter model)
- ✅ Referral system with rank recalculation
- ✅ Signup form with validation (Zod)
- ✅ Email automation (Resend integration)
- ✅ API routes (signup, get-status)
- ✅ Responsive design (mobile-ready)

### Emails:
- Signup confirmation (Welcome, referral link)
- Referral bonus (Friend signed up → you moved up)
- Weekly rank update (Scheduled)
- Onboarding ready (Manual trigger)

---

## Deployment Steps (Production)

### Step 1: Get API Keys (5 minutes)

#### Resend API Key
1. Go to https://resend.com
2. Sign up / login
3. Create API key
4. Copy key (starts with `re_...`)

#### Supabase URLs (already created)
- `NEXT_PUBLIC_SUPABASE_URL`: https://qlewszzlsqoxlqrqyrit.supabase.co
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Get from Supabase Project Settings → API
- `DATABASE_URL`: Already set in your environment
- `DIRECT_URL`: Already set in your environment

### Step 2: Verify Database (2 minutes)

```bash
# Push schema to production (should be no-op, already pushed)
DIRECT_URL="postgresql://..." \
DATABASE_URL="postgresql://..." \
npx prisma db push --schema=packages/database/prisma/schema.prisma
```

Expected output: "Your database is now in sync with your Prisma schema."

### Step 3: Deploy to Vercel (3 minutes)

Option A — Using Vercel CLI:
```bash
cd apps/marketing
vercel env add RESEND_API_KEY  # Paste your Resend API key
vercel env add DATABASE_URL     # Paste connection string
vercel env add DIRECT_URL       # Paste direct connection string
vercel deploy --prod
```

Option B — Using Vercel Dashboard:
1. Go to vercel.com → your project
2. Settings → Environment Variables
3. Add:
   - `RESEND_API_KEY` = `re_...`
   - `DATABASE_URL` = postgres connection
   - `DIRECT_URL` = postgres direct connection
4. Deploy → view live

### Step 4: Setup Custom Domain (2 minutes)

1. Vercel → Your project → Settings → Domains
2. Add domain: `pulseos.com`
3. Follow Vercel's DNS setup (points to their nameservers)
4. Wait 5-10 minutes for DNS propagation
5. Verify: https://pulseos.com should load

### Step 5: Test Signup Flow (5 minutes)

1. Visit https://pulseos.com/early-access
2. Fill form with test data
3. Submit → should see confirmation page with rank
4. Check email (Resend) → should have confirmation email
5. Visit https://pulseos.com/dashboard/waitlist
6. Enter test email → should see rank & referral link
7. Copy referral link, open in private browser
8. Form should have ?ref=CODE in URL
9. Submit → referrer's count should increment

---

## Marketing Launch Checklist

### Pre-Launch (Before Day 1)
- [ ] Vercel deployed to pulseos.com
- [ ] Test flow works (signup → email → dashboard)
- [ ] RESEND_API_KEY verified (test email sends)
- [ ] Database queries tested (check early_adopters table)
- [ ] Domain DNS resolves correctly

### Day 1 Launch
- [ ] Tweet announcement (mention @shopify, @claude_ai)
- [ ] LinkedIn post (tag people, explain problem)
- [ ] Email to personal network (100+ contacts)
- [ ] Post in relevant Slack communities:
  - D2C Slack
  - Shopify Plus community
  - Indian e-commerce communities
- [ ] Reddit posts:
  - r/ecommerce (100K+ members)
  - r/shopify (150K+ members)
  - r/entrepreneur
- [ ] Email cold outreach (list of D2C brands):
  - Start with India-focused D2C brands
  - Use template from below

### Ongoing Growth (Weeks 2-4)
- [ ] Monitor signups daily
- [ ] Reply to comments / DMs quickly
- [ ] Feature early adopter stories
- [ ] Host "Why We're Building This" live streams
- [ ] Referral incentive contest ("Top 5 referrers get lifetime discount")

---

## Cold Email Template

**Subject:** 500+ D2C brands are queuing for PulseOS. Here's why. [Free Beta]

**Body:**
```
Hey [Name],

I'm building PulseOS — the unified OS for D2C commerce.

Right now, your team probably uses:
- GoKwik or custom checkout (identity capture)
- Bitespeed or SendGrid (WhatsApp/email automation)
- Gorgias or Freshdesk (customer support)
- AfterShip or manual shipping (tracking)
- Mixpanel or Google Analytics (insights)

One SDK per tool. Six subscriptions. Zero context.

When a customer has an issue, your support team doesn't have order context.
When you want to send a broadcast, it goes through email instead of WhatsApp.
When you run a campaign, attribution is a spreadsheet exercise.

PulseOS fixes all of it.

One unified customer record. WhatsApp-first automation. RTO scoring that cuts losses by 50%. Support AI that handles 80% of tickets.

We're in private beta. First 100 early adopters get:
✓ Free tier forever
✓ Direct access to our team
✓ Priority onboarding
✓ Lifetime founding member badge

Apply here (takes 2 min): https://pulseos.com/early-access

We'll be live in production in [DATE]. The sooner you join, the earlier you move up the waitlist.

— [Your Name]
[Link to case study]
```

---

## Expected Signup Metrics

Based on plan:
- **Week 1:** 50 signups (your network + Twitter/Reddit)
- **Week 2:** 150 signups (word of mouth + press)
- **Week 3:** 300 signups (organic + cold email)
- **Week 4:** 500+ signups (compound growth)

**Referral rate target:** 30% of signups come from referrals

---

## Database Monitoring

### Check signups live:
```bash
# Via Supabase Studio (easiest)
# Settings → SQL Editor → run:
SELECT COUNT(*) as total_signups, 
       COUNT(*) FILTER (WHERE referredBy IS NOT NULL) as referral_signups,
       ROUND(COUNT(*) FILTER (WHERE referredBy IS NOT NULL) * 100.0 / COUNT(*), 2) as referral_pct
FROM early_adopters
WHERE status != 'churned';
```

### Top referrers:
```bash
SELECT email, companyName, referralCount, rank
FROM early_adopters
WHERE status = 'waitlist'
ORDER BY referralCount DESC
LIMIT 10;
```

---

## Email Verification

### To ensure emails send properly:
1. **In Resend dashboard:**
   - Verify domain (pulseos.com)
   - Set up DKIM/SPF/DMARC records (usually auto-configured)

2. **Test email send:**
```bash
curl -X POST "https://api.resend.com/emails" \
  -H "Authorization: Bearer YOUR_RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "waitlist@pulseos.com",
    "to": "your@email.com",
    "subject": "Test",
    "html": "<p>Test email</p>"
  }'
```

3. **Check email logs in database:**
```bash
SELECT * FROM email_logs ORDER BY createdAt DESC LIMIT 10;
```

---

## Troubleshooting

### "Email not sending"
1. Check RESEND_API_KEY is set in Vercel env vars
2. Verify domain is verified in Resend dashboard
3. Check email_logs table for errors
4. Look at Resend dashboard → Emails for bounce/failure reasons

### "Form validation error"
- Check browser console for Zod validation messages
- Ensure all fields are filled
- Shopify store URL must be valid HTTPS URL

### "Rank not calculating"
- Run: `SELECT * FROM early_adopters WHERE email = 'test@email.com';`
- Check if rank is NULL (means recalculation might have failed)
- Try submitting form again

### "Referral link not pre-filling"
- Check URL has ?ref=CODE format
- Verify referralCode exists: `SELECT * FROM early_adopters WHERE referralCode = 'CODE';`
- Clear browser cache

---

## After 500+ Signups: Beta Onboarding

When you reach 500+ early adopters:

1. **Select 20-50 users for beta** (use rank + company criteria)
2. **Email onboarding invites** (personal note from you)
3. **Schedule 30-min calls** with each (understand use case, gather feedback)
4. **Give them production access** (full feature unlock)
5. **Ask for testimonial** (after 2 weeks of usage)
6. **Iterate product** based on feedback
7. **Launch paid tiers** once you have 5-10 success stories

---

## Next Phase

Once marketing site is live and collecting signups:
- Transition to Phase 4: Build stakeholder analytics dashboard
- Use early adopter feedback to prioritize Phase 4 features
- Prepare backend for production launch (Phase 5.3+)

**You're now in early adopter collection mode.** Every signup is a future paying customer + learning signal. Treat them like gold.

---

## Support

- **Questions?** Check MARKETING_SITE_SETUP.md for detailed technical docs
- **Stuck?** Check "Troubleshooting" section above
- **Emergency?** Check Resend & Supabase status pages

You've got this! 🚀
