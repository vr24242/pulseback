# Phase 6: Marketing Site Workflow Plan

## 🎯 Objective
Build a landing page to collect early adopters and validate product-market fit while backend is being built.

**Target:** 1,000+ early signups → 10-50 onboarded beta users → testimonials → paid customers

---

## 📋 Pages & Features

### 1. **Home / Hero** (`/`)
- Problem: "You use 6 tools that don't talk to each other"
- Solution: "One D2C OS. Unified. Autonomous."
- CTA: "Join 500+ early adopters"
- Social proof: "Trusted by top D2C brands"

### 2. **Features** (`/features`)
Six OS modules with icons:
- ✅ Checkout OS → Smart checkout, RTO scoring
- ✅ Communication OS → WhatsApp automation
- ✅ Support OS → Claude handles 80% of tickets
- ✅ Retention OS → Churn prediction
- ✅ Marketing OS → Attribution + Meta CAPI
- ✅ Merchant AI → Ask anything in plain English

### 3. **Pricing** (`/pricing`)
- **Free**: Limited features
- **Growth**: ₹X/month (10-50 orders/day)
- **Enterprise**: Custom pricing

### 4. **Early Access Signup** (`/early-access`)
Form collects:
- Email (unique)
- Company name
- Product category
- Shopify store URL
- Expected monthly orders
- Referral code (optional)

### 5. **Waitlist Dashboard** (`/dashboard/waitlist`)
After signup, users see:
- "You're #47 in the queue"
- Unique referral link
- "Move up 10 spots per referral"
- Expected onboarding date

### 6. **Case Studies** (`/case-studies`)
- Testimonials (real from beta OR placeholder)
- ROI improvements
- "Before/After" metrics

---

## 🛠️ Tech Stack

- **Frontend:** Next.js 13+ (App Router), TypeScript
- **Database:** Supabase PostgreSQL
- **Email:** Resend or SendGrid
- **Analytics:** Vercel Analytics + PostHog
- **Deployment:** Vercel
- **Styling:** Tailwind CSS (or design system from your file)

---

## 📊 Database Schema

```prisma
model EarlyAdopter {
  id              String    @id @default(cuid())
  email           String    @unique
  companyName     String
  productCategory String
  shopifyStore    String
  expectedOrders  Int
  referralCode    String    @unique
  referralCount   Int       @default(0)
  referredBy      String?   // Email of referrer
  rank            Int?      // Position in waitlist
  status          String    @default("waitlist") // waitlist | approved | onboarded | churned
  signupSource    String?   // "organic" | "referral" | "ads"
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  // Relations
  referrals       EarlyAdopter[] @relation("Referrals")
  referredByUser  EarlyAdopter? @relation("Referrals", fields: [referredBy], references: [email])
}

model EmailLog {
  id        String   @id @default(cuid())
  email     String
  type      String   // signup_confirmation | weekly_rank | referral_bonus | onboarding_ready
  status    String   // sent | failed | bounced
  createdAt DateTime @default(now())
}
```

---

## 🎨 Design Requirements

**From your design file, I need:**
- Primary color (brand color)
- Secondary color
- Accent color
- Typography (fonts)
- Component styles (buttons, cards, forms)
- Hero image / illustration
- Icons for 6 OS modules
- Logo

---

## 📈 Conversion Funnel

```
Visit pulseos.com
       ↓
Read hero + features
       ↓
Click "Join Early Access"
       ↓
Fill signup form
       ↓
Get email confirmation
       ↓
See waitlist dashboard
       ↓
Get referral link
       ↓
Share with 2-3 friends
       ↓
"You're #3 now!"
       ↓
→ Ready for beta onboarding
```

---

## 📧 Email Automation

### Trigger 1: Signup Confirmation
```
Subject: "You're #47 in line for D2C OS"
Body:
- Thank you message
- Referral link
- Referral mechanics
- What to expect
```

### Trigger 2: Weekly Rank Update
```
Subject: "You're up to #42! 👀"
Body:
- New rank
- How many referrals moved them up
- Progress bar
```

### Trigger 3: Referral Bonus
```
Subject: "Your friend joined! You're now #5"
Body:
- Confirm referral
- New rank
- Countdown to onboarding
```

### Trigger 4: Onboarding Ready
```
Subject: "Your exclusive beta access is ready"
Body:
- Personal onboarding call
- Setup guide
- Login credentials
- Support contact
```

---

## ✅ Implementation Checklist

- [ ] Fetch design file from user
- [ ] Create EarlyAdopter Prisma schema
- [ ] Add schema to Supabase
- [ ] Build home page (hero + features)
- [ ] Build features page (6 OS cards)
- [ ] Build early access form (validation + submission)
- [ ] Build waitlist dashboard (rank + referral link)
- [ ] Implement referral tracking logic
- [ ] Setup email service (Resend API key)
- [ ] Create email templates
- [ ] Build case studies page
- [ ] Deploy to Vercel
- [ ] Setup analytics
- [ ] Setup custom domain
- [ ] Test full funnel (signup → email → dashboard)

---

## 🚀 Deployment & Launch

### Pre-Launch Checklist
- [ ] Domain: pulseos.com or custom
- [ ] Email domain verified (for Resend)
- [ ] Supabase environment setup
- [ ] Vercel deployment
- [ ] Analytics configured
- [ ] Monitoring setup (errors, performance)

### Launch
- [ ] Tweet announcement
- [ ] LinkedIn post
- [ ] Email to personal network
- [ ] Reddit posts (r/ecommerce, r/shopify)
- [ ] D2C Slack communities
- [ ] Invite early access (10-20 seed users)

---

## 📊 Success Metrics

- **Week 1:** 50 signups
- **Week 2:** 150 signups (+ word of mouth)
- **Week 3:** 300 signups
- **Week 4:** 500+ signups

**Referral Rate Target:** 30% of signups come from referrals

---

## 🎯 When Ready for Beta
- 500+ early adopters in waitlist
- 20-50 approved for beta
- Run 1-week beta
- Collect testimonials
- Iterate on product
- Launch paid tiers

---

## 📅 Timeline

- **Day 1-2:** Build forms + pages
- **Day 2-3:** Email automation + referral logic
- **Day 3:** Testing + Polish
- **Day 4:** Deploy to Vercel
- **Day 5:** Marketing push
- **Week 2:** Monitor signups, refine messaging

**Total:** 5-7 days to launch

---

## Next Steps
1. ⬅️ Share design file (Figma link or file location)
2. I'll build the entire site
3. You verify and approve
4. Deploy and start marketing
