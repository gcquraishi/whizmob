# Feature Implementation Plan: staging.whizmob.dev

**Overall Progress:** `57%` (4/7 tasks complete)

---

## TL;DR
Merge the landing page into the dashboard Next.js app as a public homepage with a login entry point. Deploy the unified app to Vercel at staging.whizmob.dev. Authenticated users get the full inspector; visitors see the marketing page.

---

## Critical Decisions
- **Single app, not two**: Merge landing page content into the dashboard app rather than running two apps behind a proxy. Simpler deployment, shared styles, one Vercel project.
- **Landing page at `/`, inspector moves to `/app`**: The current dashboard `/` (inspector) relocates to `/app`. Landing page becomes the new public `/`. All other dashboard routes (`/agents`, `/passport/*`, `/mobs/*`) stay behind auth at their current paths.
- **Middleware allowlist for public routes**: Update existing middleware to pass through `/` (landing page) and static assets without auth. Everything else still requires DEMO_PASSWORD.
- **Reuse existing Vercel dashboard project**: Add `staging.whizmob.dev` domain to the existing `dashboard` Vercel project (prj_mEmdbEHHs1NVKcxkUhxeAK63TjBB). DNS already resolves.

---

## Implementation Tasks

### Phase 1: Restructure Dashboard Routes

- [x] 🟩 **Task 1.1: Move inspector from `/` to `/app`**
  - [x] 🟩 Create `dashboard/app/app/page.tsx` with the current inspector content from `dashboard/app/page.tsx`
  - [x] 🟩 Update any internal links that point to `/` to point to `/app` instead (nav, breadcrumbs)
  - **Completed**: 2026-03-17
  - **Files**: `dashboard/app/app/page.tsx` (new), `dashboard/components/Nav.tsx`

- [x] 🟩 **Task 1.2: Create public landing page at `/`**
  - [x] 🟩 Port the landing page content from `site/src/app/page.tsx` into `dashboard/app/page.tsx`
  - [x] 🟩 Add a "Open Inspector" CTA button that links to `/app`
  - [x] 🟩 Port landing-page-specific CSS (terminal, command-list styles) to `dashboard/app/globals.css`
  - [x] 🟩 Copy `inspector-preview.svg` into `dashboard/public/`
  - **Completed**: 2026-03-17
  - **Files**: `dashboard/app/page.tsx`, `dashboard/app/globals.css`, `dashboard/public/inspector-preview.svg`
  - **Notes**: Replaced CSS variable references with hardcoded hex values for portability. Added OpenGraph metadata.

- [x] 🟩 **Task 1.3: Update navigation**
  - [x] 🟩 Update Nav component: Inspector link points to `/app`, nav hidden on `/`
  - **Completed**: 2026-03-17
  - **Files**: `dashboard/components/Nav.tsx`

### Phase 2: Update Auth Middleware

- [x] 🟩 **Task 2.1: Allowlist public routes in middleware**
  - [x] 🟩 Add `/` (exact match) to middleware passthrough
  - [x] 🟩 Add `/inspector-preview.svg` to static asset allowlist
  - [x] 🟩 All `/app`, `/agents`, `/passport/*`, `/mobs/*`, `/api/*` routes remain behind auth
  - **Completed**: 2026-03-17
  - **Files**: `dashboard/middleware.ts`

### Phase 2.5: Build Fixes (unplanned)

- [x] 🟩 **Fix clsx import compatibility**
  - [x] 🟩 Changed `import clsx from 'clsx'` → `import { clsx } from 'clsx'` across 7 files
  - **Deviation**: Pre-existing issue surfaced by Next.js 16 type checking against `.mts` types
  - **Files**: Nav.tsx, TypeFilter.tsx, ScanButton.tsx, PlatformFilter.tsx, agents/[id]/page.tsx, mobs/import/page.tsx, mobs/[id]/page.tsx

- [x] 🟩 **Fix API route prerendering**
  - [x] 🟩 Added `export const dynamic = 'force-dynamic'` to all 13 API routes
  - [x] 🟩 Added `/app/**` to `outputFileTracingIncludes` in next.config.ts
  - **Deviation**: Pre-existing issue — API routes tried to prerender at build time, failed because DB not available
  - **Files**: All `dashboard/app/api/**/route.ts`, `dashboard/next.config.ts`

### Phase 3: Deploy to Vercel

- [ ] 🟥 **Task 3.1: Add staging.whizmob.dev domain to Vercel**
  - [ ] 🟥 Run `vercel domains add staging.whizmob.dev` in the dashboard project
  - [ ] 🟥 Verify DNS is pointing correctly
  - [ ] 🟥 Ensure `DEMO_PASSWORD` env var is set for the staging deployment
  - **Notes**: DNS already resolves to Cloudflare/Vercel IPs.

- [ ] 🟥 **Task 3.2: Push staging branch and verify deployment**
  - [ ] 🟥 Push changes to `staging` branch
  - [ ] 🟥 Verify Vercel preview deployment works
  - [ ] 🟥 Verify landing page is public at staging.whizmob.dev
  - [ ] 🟥 Verify `/app` requires auth and shows inspector after login
  - [ ] 🟥 Verify all API routes still work behind auth

### Phase 4: Verify & Clean Up

- [ ] 🟥 **Task 4.1: End-to-end verification**
  - [ ] 🟥 Landing page loads at staging.whizmob.dev without auth
  - [ ] 🟥 "Open Inspector" button navigates to `/app`, triggers auth prompt
  - [ ] 🟥 After auth, inspector loads with full functionality
  - [ ] 🟥 Nav works correctly between authenticated pages
  - [ ] 🟥 Site landing page project (whizmob-site) remains operational at whizmob.dev

---

## Rollback Plan

**If things go wrong:**
1. Revert the dashboard `app/page.tsx` to the inspector (git checkout)
2. Remove the `/app` route directory
3. Remove the staging.whizmob.dev domain from Vercel (`vercel domains rm staging.whizmob.dev`)
4. The original site at whizmob.dev and local dashboard are unaffected

---

## Success Criteria

- staging.whizmob.dev loads the landing page publicly (no auth required)
- Landing page has a visible "Open Inspector" entry point
- Clicking sign-in navigates to the inspector, prompting for DEMO_PASSWORD
- All existing dashboard features (inspector, inventory, mobs, passports) work after auth
- whizmob.dev (the static site) continues to work independently

---

## Out of Scope (For This Plan)

- Migrating whizmob.dev away from the static site project (keep both running for now)
- User registration / accounts (still using DEMO_PASSWORD)
- Database seeding for staging (uses existing local whizmob.db or empty state)
- Custom 404 page for the unified app
- Mobile-responsive polish for the landing page (port as-is)
