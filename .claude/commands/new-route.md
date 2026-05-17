# Scaffold a new merchant dashboard route

Scaffold a new `/app/$ARGUMENTS` merchant-facing route in the Shopify app.

## Steps to follow

1. **Read** `docs/PULSE_OS.md` to understand what this OS module does and what data it needs

2. **Create** `apps/shopify/app/routes/app.$ARGUMENTS.tsx` with:
   - `loader` — `requireShop(request)` first, then Prisma queries, return typed data
   - `meta` — page title
   - Default export — Polaris `Page` component wrapping the UI
   - No inline styles — use Polaris components only

3. **Loader pattern to always follow:**
   ```typescript
   export const loader = async ({ request }: LoaderFunctionArgs) => {
     const { shop } = await requireShop(request)
     // Prisma queries here
     return json({ ... })
   }
   ```

4. **Add to nav** in `apps/shopify/app/routes/app.tsx`:
   - Find the `NAV_ITEMS` array
   - Add `{ to: "/app/$ARGUMENTS", label: "Label" }` in the right position

5. **Typecheck** when done

## Reference patterns
- Simple route: `apps/shopify/app/routes/app.analytics.tsx`
- With customer data: `apps/shopify/app/routes/app.customers.tsx`
- `requireShop` import: `import { requireShop } from "../lib/auth.server"`
