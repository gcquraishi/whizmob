# Feature Implementation Plan: staging.whizmob.dev

**Overall Progress:** `100%` (7/7 tasks complete)

---

## TL;DR
Merge the landing page into the dashboard Next.js app as a public homepage with a login entry point. Deploy the unified app to Vercel at staging.whizmob.dev. Authenticated users get the full inspector; visitors see the marketing page.

---

## Critical Decisions
- **Single app, not two**: Merge landing page content into the dashboard app rather than running two apps behind a proxy. Simpler deployment, shared styles, one Vercel project.
- **Landing page at `/`, inspector moves to `/app`**: The current dashboard `/` (inspector) relocates to `/app`. Landing page becomes the new public `/`. All other dashboard routes (`/agents`, `/passport/*`, `/mobs/*`) stay behind auth at their current paths.
- **Middleware allowlist for public routes**: Update existing middleware to pass through `/` (landing page) and static assets without auth. Everything else still requires DEMO_PASSWORD.
- **Reuse existing Vercel dashboard project**: Add `staging.whizmob.dev` domain to the existing `dashboard` Vercel project (prj_mEmdbEHHs1NVKcxkUhxeAK63TjBB). DNS via Cloudflare CNAME.

---

## Implementation Tasks

### Phase 1: Restructure Dashboard Routes

- [x] 🟩 **Task 1.1: Move inspector from `/` to `/app`**
  - [x] 🟩 Create `dashboard/app/app/page.tsx` with the current inspector content
  - [x] 🟩 Update Nav links to point to `/app` instead of `/`
  - **Completed**: 2026-03-17

- [x] 🟩 **Task 1.2: Create public landing page at `/`**
  - [x] 🟩 Port landing page from `site/src/app/page.tsx` into `dashboard/app/page.tsx`
  - [x] 🟩 Add "Open Inspector" CTA linking to `/app`
  - [x] 🟩 Port terminal/command-list CSS to `dashboard/app/globals.css`
  - [x] 🟩 Copy `inspector-preview.svg` to `dashboard/public/`
  - **Completed**: 2026-03-17

- [x] 🟩 **Task 1.3: Update navigation**
  - [x] 🟩 Nav hidden on `/`, Inspector link points to `/app`
  - **Completed**: 2026-03-17

### Phase 2: Update Auth Middleware

- [x] 🟩 **Task 2.1: Allowlist public routes in middleware**
  - [x] 🟩 `/` exact match passthrough
  - [x] 🟩 `/inspector-preview.svg` allowed
  - **Completed**: 2026-03-17

### Phase 2.5: Build Fixes (unplanned)

- [x] 🟩 **Fix clsx import compatibility** — `import clsx` → `import { clsx }` across 7 files (Next.js 16 .mts types)
- [x] 🟩 **Fix API route prerendering** — `export const dynamic = 'force-dynamic'` on all 13 API routes
- [x] 🟩 **Add `/app/**` to outputFileTracingIncludes** in next.config.ts

### Phase 3: Deploy to Vercel

- [x] 🟩 **Task 3.1: Add staging.whizmob.dev domain to Vercel**
  - [x] 🟩 `vercel domains add staging.whizmob.dev` to dashboard project
  - [x] 🟩 Added CNAME `staging` → `cname.vercel-dns.com` in Cloudflare (DNS-only, no proxy)
  - [x] 🟩 Set `DEMO_PASSWORD` env var for production + preview
  - **Completed**: 2026-03-17

- [x] 🟩 **Task 3.2: Deploy and verify**
  - [x] 🟩 `vercel --prod` deployed successfully, aliased to staging.whizmob.dev
  - [x] 🟩 SSL certificate provisioned
  - **Completed**: 2026-03-17

### Phase 4: Verify

- [x] 🟩 **Task 4.1: End-to-end verification**
  - [x] 🟩 `https://staging.whizmob.dev/` returns 200 — landing page loads publicly
  - [x] 🟩 "Open Inspector" CTA present on landing page
  - [x] 🟩 `https://staging.whizmob.dev/app` returns 401 — auth prompt shown
  - [x] 🟩 Auth page says "Enter the demo password"
  - **Note**: `whizmob.dev` (apex) returns 522 — pre-existing Cloudflare/Hover DNS issue, not caused by this work
  - **Completed**: 2026-03-17

---

## Success Criteria

- [x] staging.whizmob.dev loads the landing page publicly (no auth required)
- [x] Landing page has a visible "Open Inspector" entry point
- [x] Clicking Open Inspector navigates to `/app`, prompting for DEMO_PASSWORD
- [x] All existing dashboard features behind auth at their current paths
- [ ] whizmob.dev (the static site) — pre-existing 522 error, DNS misconfigured (out of scope)
