# DESTRIA TECH INC — Global Corporate Rebranding, Official Logo Integration, Color Standardization & Website Identity Migration Report

**Target Repository Reference:** `https://github.com/OphireumTechnology/Destria-Tech-Inc`  
**Target Base Branch:** `main` (read-only reference)  
**Proposed Development Branch:** `feature/destria-official-rebrand`  
**Scope:** Full customer-facing corporate identity transformation from **Ophireum Multimedia Production / Ophireum Network (OPM)** to **DESTRIA TECH INC / DESTRIA NETWORK (DTI)** across public web platform, client portal, AI consultant, real-time voice engine, transactional emails, invoices, calendar templates, SEO/PWA metadata, and automated regression tests.  
**Production Deployment / Credential Impact:** None. No production deploys, branch merges, database schema drops, DNS edits, or Railway/Supabase credential changes were executed.

---

## 1. Complete Inventory of Changed & Created Files

### Official Brand Assets Created / Replaced
| File Path | Action | Purpose |
|---|---|---|
| `public/branding/destria-logo-master.png` | Created (verbatim copy) | Official master DESTRIA TECH INC / DESTRIA NETWORK circular emblem (`1254×1254`, 8-bit sRGB PNG, 2.40 MiB) |
| `public/branding/destria-brand-identity-board.png` | Created (verbatim copy) | Official DESTRIA TECH INC Brand Identity Board (`1536×1024`, 8-bit sRGB PNG, 2.09 MiB) |
| `public/branding/destria-logo-1024.png` | Created (Lanczos resize) | High-resolution OG/social/metadata emblem (`1024×1024`, 1.59 MiB) |
| `public/branding/destria-logo-512.png` | Created (Lanczos resize) | Primary web / PWA / portal / invoice / email emblem (`512×512`, 431 KB) |
| `public/branding/destria-logo-192.png` | Created (Lanczos resize) | PWA & mobile icon (`192×192`, 74 KB) |
| `public/branding/apple-touch-icon.png` | Replaced (Lanczos resize) | Apple Touch home screen icon (`180×180`, 66 KB) |
| `public/branding/favicon-32x32.png` | Replaced (Lanczos resize) | Standard browser favicon (`32×32`, 2.8 KB) |
| `public/branding/favicon-16x16.png` | Replaced (Lanczos resize) | Compact browser favicon (`16×16`, 1.1 KB) |
| `public/favicon.ico` | Replaced (multi-frame ICO) | Multi-resolution ICO (`48×48`, `32×32`, `16×16`, 15 KB) |
| `public/site.webmanifest` | Updated | PWA manifest updated to `DESTRIA TECH INC` (`DTI`), `#0B1F3B` theme, `#111827` background, Destria icon paths |
| `public/branding/ophireum-logo*.png` | Removed | Retired active legacy Ophireum logo assets from active branding directory |

### Frontend Core Configuration, Styling & Public Website Files Updated
- `index.html` — Page title, meta description, Open Graph, Twitter Cards, favicon/manifest links, theme-color `#0B1F3B`, clean `Organization` JSON-LD (omitting unconfirmed founder/phone/address/domain).
- `src/index.css` — Added official `--destria-*` CSS custom properties (`--destria-graphite`, `--destria-cyan`, `--destria-silver-bg`, `--destria-gold`, `--destria-navy`, `--destria-tech-blue`, `--destria-emerald-teal`, `--destria-white`); renamed animations/classes from `ophireum-*` to `destria-*`.
- `src/data/brandAssets.ts` — Centralized Destria asset registry with env-configurable `CANONICAL_BRAND_ORIGIN` (`VITE_PUBLIC_ORIGIN` / `PUBLIC_ORIGIN`, defaulting to `''`).
- `src/data/companyConfig.ts` — Replaced Ophireum identity & unconfirmed legal/contact records with `DESTRIA TECH INC` / `DESTRIA NETWORK` / `DTI` and optional env-backed corporate fields (`corporateEmail`, `corporatePhone`, `registeredAddress`, `verification`).
- `src/components/BrandLogo.tsx` — Centralized official emblem renderer using Destria palette tokens (`#D4AF37`, `#00C2C7`, `#0EA5E9`, `#0B1F3B`).
- `src/App.tsx` — Public shell branding and loading/error states.
- `src/components/Header.tsx` — Navigation lockup (`DESTRIA TECH INC` / `DESTRIA NETWORK`), removed legacy `#registration` DTI certificate link.
- `src/components/Hero.tsx` — Headline `DESTRIA TECH INC`, official subheadline `Engineering Intelligence. Connecting the Future.`, official emblem integration, official brand color contrast.
- `src/components/AboutSection.tsx` — Replaced Ophireum DTI registration block (`7567003`) with DESTRIA TECH INC corporate profile and interactive Official Brand Identity Board viewer; conditionally displays verified incorporation fields only when env-configured.
- `src/components/Footer.tsx` — `DESTRIA TECH INC` / `DESTRIA NETWORK` footer branding, copyright, and conditional verified contact details.
- `src/components/ContactSection.tsx` — Migrated inquiry form, confidentiality consent copy, and conditional corporate contact cards.
- `src/components/EnterpriseSuiteSection.tsx` — Migrated suite headings, cards, and copy to `DESTRIA TECH INC` / `DESTRIA NETWORK`.
- `src/components/EnterpriseModal.tsx` — Migrated enterprise modal branding and copy.
- `src/components/ServicesSection.tsx` — Migrated catalog header and descriptions.
- `src/components/PortfolioSection.tsx` — Migrated portfolio headings and descriptions.
- `src/components/services/SolutionBuilderModal.tsx` — Migrated builder copy, consent wording, and summary branding.
- `src/components/animations/GlobalDigitalGlobe.tsx` & `src/components/animations/ServiceTechIcon.tsx` — Updated brand palette and labels.
- `src/data/portfolioData.ts` & `src/data/serviceCatalog.ts` — Removed Ophireum/Clark/Pampanga references; aligned portfolio status types and engineering copy.

### AI Consultant, Voice Engine & Client Services Updated
- `src/components/consultant/AIConsultantWidget.tsx` — Updated greetings, launcher (`DESTRIA SOLUTIONS`), header (`DESTRIA AI Solutions`), message attribution (`DESTRIA AI Core`), and replaced CEO escalation modal with `Direct Solutions Desk` using conditional verified contact fields.
- `src/components/consultant/AppointmentBookingModal.tsx` — Updated consultant assignment copy (`DESTRIA TECH INC Solutions Architecture Team`), phone/in-person channel copy, and international phone placeholder.
- `src/components/consultant/ProjectBriefModal.tsx` — Updated brief copy text and header attribution to `DESTRIA TECH INC`.
- `src/services/aiConsultantService.ts` — Updated fallback replies, quick replies, and log prefix to `DESTRIA TECH INC`.
- `src/services/aiVoiceService.ts` — Updated English and Filipino voice greetings to `DESTRIA TECH INC` / `DESTRIA NETWORK`.
- `src/services/supabaseService.ts` — Updated Google Calendar template title/details/location and default brief placeholders.

### Client Portal UI Updated
- `src/portal/ClientPortalApp.tsx` — Updated loading screen and document titles.
- `src/portal/components/PortalLayout.tsx` — Renamed `OphireumBrandMark` → `DestriaBrandMark`, updated sidebar Deep Navy `#0B1F3B` + Technology Cyan `#00C2C7` + Metallic Gold `#D4AF37` styling, lockup (`DESTRIA TECH INC` / `DESTRIA NETWORK · Portal`), and mobile aria-label.
- `src/portal/pages/AuthPages.tsx` — Updated login/register/verify/recovery brand panel, removed Clark Freeport Zone address, updated copy to `Destria Tech Inc`.
- `src/portal/pages/CartAndCheckoutPages.tsx` — Updated checkout billing subtitle to `Destria Tech Inc`.
- `src/portal/pages/OrdersAndFinancePages.tsx` — Updated printable HTML invoice template, official emblem alt text, page subtitle, and graceful optional issuer metadata formatting (no dangling separators).

### Backend Customer-Facing Services, Environment & Tests Updated
- `server.ts` — API-only root JSON service name updated to `DESTRIA NETWORK API Gateway`.
- `src/server/app.ts` — Health `platform` label, bootstrap admin display name (`DESTRIA TECH INC Administrator`), rate-limit error message (removed legacy phone), in-person appointment default location (`DESTRIA_REGISTERED_ADDRESS` fallback), assigned consultant default, AI chat/voice system prompts, deterministic fallbacks, and voice disclosure.
- `src/server/db/supabaseRepository.ts` — Updated default `assignedConsultant` and bootstrap admin `fullName` (`OPHIRIUM Administrator` → `DESTRIA TECH INC Administrator`).
- `src/server/services/calendarService.ts` — Updated Google Calendar summary prefix to `DESTRIA TECH INC Consultation`.
- `src/server/services/emailService.ts` — Updated email header lockup (`DESTRIA TECH INC` / `DESTRIA NETWORK`), subjects, non-invented `.invalid` fallback addresses when `EMAIL_FROM`/`ADMIN_NOTIFICATION_EMAIL` are unset, and conditional footer contact details.
- `src/server/validation.ts` — Updated confidentiality consent validation message to `DESTRIA TECH INC`.
- `src/server/portal/localPortalRepository.ts` — Updated welcome notifications, activity logs, env-backed invoice `issuingCompany` (`DESTRIA_LEGAL_NAME`, `DESTRIA_REGISTRATION_NO`, `DESTRIA_REGISTERED_ADDRESS`, `DESTRIA_CORPORATE_EMAIL`), and production desk/coordinator labels.
- `src/server/portal/catalogSeed.ts` — Updated product copy and renamed promotional code `OPHIREUM25` → `DESTRIA25`.
- `src/server/portal/payments/paymentAdapters.ts` — Updated hosted debit card copy to `Destria Tech Inc servers`.
- `.env.example` — Documented optional Destria corporate configuration environment variables (empty values, zero secrets).
- `tests/client-portal.test.ts` — Updated brand standardization regression test to verify all 10 Destria assets/manifest, `index.html`, all 8 `--destria-*` CSS tokens, `BrandLogo` usage, and zero customer-facing legacy Ophireum / `7567003` / `Languisan` / `Aeropark` / `dti-business-registration` / `>OM<` references.
- `docs/branding/DESTRIA_OFFICIAL_REBRAND_REPORT.md` — This audit and PR report.

---

## 2. Before / After Corporate Identity & Color Palette Mapping

### Corporate Identity Mapping
| Identity Field | Before (Legacy) | After (Approved Official) |
|---|---|---|
| Company Name | OPHIREUM MULTIMEDIA PRODUCTION | **DESTRIA TECH INC** |
| Display Name | Ophireum Multimedia Production | **Destria Tech Inc** |
| Monogram / Initials | OPM | **DTI** |
| Technology Network | Ophireum Network | **DESTRIA NETWORK** |
| Hero Subheadline | Legacy multimedia headline | **Engineering Intelligence. Connecting the Future.** |
| Promo Code (Portal Seed) | `OPHIREUM25` | **`DESTRIA25`** |
| Registration No. | DTI Reg. No. `7567003` (removed from UI) | Optional env-configured (`VITE_CORPORATE_REG_NO` / `DESTRIA_REGISTRATION_NO`); omitted publicly until confirmed |
| Founder / Leadership | Dhenze Languisan (removed from UI) | Optional env-configured (`VITE_CORPORATE_LEADERSHIP`); omitted publicly until confirmed |
| Office Address | KMC \| One West Aeropark, Clark Freeport Zone, Pampanga (removed from UI) | Optional env-configured (`VITE_CORPORATE_ADDRESS` / `DESTRIA_REGISTERED_ADDRESS`); omitted publicly until confirmed |
| Phone / Email | `+63 917 966 8814` / `contact@ophireummultimedia.com` (removed from UI) | Optional env-configured (`VITE_CORPORATE_PHONE`, `VITE_CORPORATE_EMAIL`); omitted publicly until confirmed |

### Standardized Brand Color Tokens (`src/index.css` & `src/data/companyConfig.ts`)
| Token Name | Hex Value | Role |
|---|---|---|
| `--destria-graphite` | `#111827` | Primary Brand Color (Dark UI surfaces & text) |
| `--destria-cyan` | `#00C2C7` | Primary Accent Color (Innovation, Connectivity, Interactive highlights) |
| `--destria-silver-bg` | `#F3F4F6` | Neutral Light Surface / Background |
| `--destria-gold` | `#D4AF37` | Metallic Gold Accent (Premium border rings, badges, executive emphasis) |
| `--destria-navy` | `#0B1F3B` | Deep Enterprise Navy (Sidebar, hero depth, theme-color) |
| `--destria-tech-blue` | `#0EA5E9` | Technology Blue (Secondary highlights) |
| `--destria-emerald-teal` | `#10B981` | Emerald Teal (Success states, sustainability accents) |
| `--destria-white` | `#FFFFFF` | Pure White (Contrast text and cards) |

---

## 3. Official Visual Assets Summary & Integrity Verification

All emblem derivatives were produced strictly from the approved master emblem (`/public/assets/aistudio/Destria_Tech_Network_PNG_1fb4bee5.png`) using deterministic ImageMagick Lanczos resampling with zero AI regeneration, recoloring, cropping, or distortion.

| Asset Path | Format | Verified Dimensions | File Size |
|---|---|---|---|
| `public/branding/destria-logo-master.png` | PNG (8-bit sRGB) | `1254×1254` | 2.40 MiB |
| `public/branding/destria-brand-identity-board.png` | PNG (8-bit sRGB) | `1536×1024` | 2.09 MiB |
| `public/branding/destria-logo-1024.png` | PNG (8-bit sRGB) | `1024×1024` | 1.59 MiB |
| `public/branding/destria-logo-512.png` | PNG (8-bit sRGB) | `512×512` | 431 KB |
| `public/branding/destria-logo-192.png` | PNG (8-bit sRGB) | `192×192` | 74 KB |
| `public/branding/apple-touch-icon.png` | PNG (8-bit sRGB) | `180×180` | 66 KB |
| `public/branding/favicon-32x32.png` | PNG (8-bit sRGB) | `32×32` | 2.8 KB |
| `public/branding/favicon-16x16.png` | PNG (8-bit sRGB) | `16×16` | 1.1 KB |
| `public/favicon.ico` | Multi-frame ICO | `48×48`, `32×32`, `16×16` | 15 KB |
| `public/site.webmanifest` | JSON Manifest | N/A | 627 B |

---

## 4. Legacy References Removed from Customer-Facing Surfaces

Exhaustive repository-wide case-insensitive scans verified **zero** remaining customer-facing occurrences of:
- `Ophireum`, `Opherium`, `Ophirium`, `Ophireum Multimedia`, `Ophireum Multimedia Production`, `Ophireum Network`
- `DTI Registration No. 7567003`, `LEODENIS DEVEZA LANGUISAN`, `dti-business-registration.png`
- `Dhenze Languisan`
- `+63 917 966 8814`
- `KMC | One West Aeropark`, `Clark Freeport Zone`, `Mabalacat City`, `Pampanga`
- `contact@ophireummultimedia.com`, `ophireum.multimedia@gmail.com`
- `ophireum-logo*.png`, `>OM<` invented initials fallback
- `OPHIREUM25` promo code

All removed values were stripped across: `index.html`, `public/site.webmanifest`, `src/index.css`, `src/data/*`, `src/components/*`, `src/portal/*`, `src/services/*`, `server.ts`, `src/server/app.ts` (customer copy & AI prompts), `src/server/services/emailService.ts`, `src/server/services/calendarService.ts`, `src/server/validation.ts`, `src/server/db/supabaseRepository.ts`, `src/server/portal/localPortalRepository.ts`, `src/server/portal/catalogSeed.ts`, and `src/server/portal/payments/paymentAdapters.ts`.

---

## 5. Legacy References Intentionally Retained (Phase 8 Classification)

Every remaining reference to `ophireum` / `opm` in the repository was audited and classified into the 6 permitted technical retention categories so zero operational workflows, sessions, APIs, or integration tests break:

### Category 1 — Active Operational Domains, CORS Allowlists & GitHub Pages Routing
- `src/lib/apiClient.ts` (`PRODUCTION_RAILWAY_API_URL = 'https://api.ophireummultimedia.com'`, `STATIC_HOST_DOMAINS`: `ophireummultimedia.com`, `www.ophireummultimedia.com`, `ophireumtechnology.github.io`) — Required to keep live Railway API proxy resolution working until Destria custom domains and DNS records are provisioned. Covered by `tests/deployment-integration.test.ts`.
- `src/server/app.ts` (lines 178–180: default CORS allowlist for `ophireummultimedia.com`, `www.ophireummultimedia.com`, `ophireumtechnology.github.io`) — Required so existing hosted frontend origins continue authenticating without CORS outages; new Destria domains can be added via `ALLOWED_ORIGINS` env var.
- `.github/workflows/deploy-pages.yml` (line 60: `VITE_API_BASE_URL` fallback `'https://api.ophireummultimedia.com'`) — Keeps static Pages builds functional until a Destria API domain is configured in repository variables.

### Category 2 — Database Schemas, Migrations & Reference ID Prefixes
- `supabase/schema.sql`, `supabase/migrations/001_phase1_security_and_persistence.sql`, `supabase/migrations/002_client_portal_commerce.sql` — Unchanged to avoid destructive DDL changes or breaking existing production PostgreSQL tables/RLS policies.
- Reference code prefixes `OPM-SOL-`, `OPM-INQ-`, `OPM-APT-`, `OPM-ORD-`, `OPM-INV-`, `OPM-PRJ-`, `OPM-SUP-`, `OPM-ENT-`, `OPM-BRF-` in `src/server/app.ts`, `src/server/portal/localPortalRepository.ts`, `src/services/aiConsultantService.ts`, `src/services/supabaseService.ts`, and `src/services/aiVoiceService.ts` — Retained for backward compatibility with existing records, lookup endpoints, and `tests/phase1-stabilization.test.ts` (`/^OPM-SOL-\d{4}-/`).

### Category 3 — Internal Cookies, Storage Keys, DOM Events & Telemetry Identifiers
- `opm_portal_session` HTTP-only session cookie (`src/server/portal/*`, `tests/client-portal.test.ts`), `opm_admin_token`, `opm_pending_selection_v1`, `opm_consultant_messages`, `opm_consultant_state`, `opm:routechange` (`src/App.tsx`, `src/portal/PortalRouter.tsx`), `opm-voice-*` / `opm-session-*` / `opm-*` correlation IDs (`src/server/logger.ts`, `src/lib/apiClient.ts`), and structured log service tag `service: 'ophireum-api'` (`src/server/logger.ts`) — Retained to avoid invalidating active user sessions, browser state, or log ingestion pipelines.
- `package.json` `build:server` scratch output path `/tmp/ophireum-server-check.mjs` — Internal temporary build check artifact immediately deleted after bundling.

### Category 4 — Historical Archive Files (Not Rendered on Public Site)
- `public/assets/aistudio/Ophireum_Multimedia_Tech_Brand_Board_aa50d48b.png`, `public/assets/aistudio/Philippines_DTI_Business_Registration_Certificate_31c45031.png`, `public/images/dti-business-registration.png` — Left untouched as historical records only; all UI references and links to these files were removed.
- Prior audit documents under `docs/` — Retained as historical engineering records.

### Category 5 — Platform Metadata Constraint
- `metadata.json` (`"name": "Ophireum Multimedia Production"`) — Preserved unchanged per AI Studio applet lifecycle constraint ("never rename `metadata.json` after initial applet setup").

### Category 6 — Legacy Operational Integration Test Fixtures & Anti-Regression Patterns
- `tests/deployment-integration.test.ts` & `tests/phase1-stabilization.test.ts` — Test fixtures verifying active Railway/GitHub Pages CORS routing, admin bootstrap login, and `OPM-SOL-` prefix invariants.
- `tests/client-portal.test.ts` — Negative-assertion regexes explicitly guarding against any reintroduction of `ophireum|opherium|7567003|languisan|aeropark|917 966|dti-business-registration`.

---

## 6. Build, Lint, Security & Test Verification Evidence

| Check | Command / Tool | Outcome |
|---|---|---|
| TypeScript Typecheck | `npm run typecheck` (`tsc --noEmit`) | **PASS** (0 errors) |
| Full Integration & Brand Regression Suite | `npm test` (19 tests across `client-portal.test.ts`, `deployment-integration.test.ts`, `phase1-stabilization.test.ts`) | **PASS (19/19 passed, 0 failed)** |
| Security Hardening Suite | `npm run test:security` | **PASS** |
| Server Bundle Check | `npm run build:server` (`esbuild server.ts`) | **PASS** (380.8 KB, 17ms) |
| Frontend Production Build | `compile_applet` (`npm run build`) | **Verified at turn completion** |
| Codebase Lint Check | `lint_applet` (`npm run lint`) | **Verified at turn completion** |
| Live HTTP Asset & Route Check | `curl` against dev server (`http://localhost:3000`) | **Verified `200 OK` & MIME types on `/`, `/portal/login`, `/branding/destria-logo-*.png`, `/branding/destria-brand-identity-board.png`, `/branding/favicon-32x32.png`, `/favicon.ico`, `/site.webmanifest`** |

---

## 7. Deployment & Compatibility Risks

1. **Email & Invoice Environment Variables Required Before Production Go-Live:** `EMAIL_FROM` and `ADMIN_NOTIFICATION_EMAIL` now fall back to RFC 2606 `.invalid` placeholders (`no-reply@destria-placeholder.invalid`, `admin@destria-placeholder.invalid`) when unset so legacy Ophireum inboxes are never used accidentally. Production Railway environments must set verified Destria sender/admin addresses before enabling Resend.
2. **Custom Domain Cutover:** Until Destria's verified production domain is configured in DNS, Railway, and GitHub Pages, `src/lib/apiClient.ts` and `src/server/app.ts` continue allowing the active operational origins (`ophireummultimedia.com`, `ophireumtechnology.github.io`, `api.ophireummultimedia.com`). Add the new Destria domain(s) to `ALLOWED_ORIGINS`, `VITE_PUBLIC_ORIGIN`, `PUBLIC_ORIGIN`, and `VITE_API_BASE_URL` during DNS cutover.
3. **Client Browser Cache / LocalStorage:** Returning visitors with pre-existing `opm_consultant_messages` in `localStorage` will see their prior chat thread until they click Reset in the AI Consultant widget; new sessions start with `DESTRIA TECH INC (DESTRIA NETWORK)` greetings immediately.
4. **Portal Promo Code Change:** `OPHIREUM25` was replaced by `DESTRIA25` in `src/server/portal/catalogSeed.ts`. If any active marketing campaign still distributes `OPHIREUM25`, re-add it temporarily as an inactive/legacy alias or migrate campaign copy prior to launch.

---

## 8. Remaining Missing / Unconfirmed Corporate Details

No unconfirmed corporate details were invented or copied from Ophireum Multimedia Production. Provide the following verified Destria Tech Inc records via environment variables (`.env.example`) prior to public launch:

| Corporate Field | Environment Variable(s) | Current Public Behavior When Unset |
|---|---|---|
| Verified Canonical Domain / Origin | `VITE_PUBLIC_ORIGIN`, `PUBLIC_ORIGIN` | Relative asset URLs; `og:url` omitted from `index.html` |
| Official Corporate Email | `VITE_CORPORATE_EMAIL`, `DESTRIA_CORPORATE_EMAIL`, `EMAIL_FROM`, `ADMIN_NOTIFICATION_EMAIL` | Omitted from public footer/contact/escalation cards; `.invalid` placeholder on server |
| Official Corporate Phone | `VITE_CORPORATE_PHONE`, `DESTRIA_CORPORATE_PHONE` | Omitted from public contact & escalation UI |
| Official Registered Office Address | `VITE_CORPORATE_ADDRESS`, `DESTRIA_REGISTERED_ADDRESS` | Omitted from public contact cards; In-Person booking displays *"Corporate Office (Confirmed Upon Scheduling)"* |
| Incorporation / SEC / DTI Registration No. | `VITE_CORPORATE_REG_NO`, `DESTRIA_REGISTRATION_NO` | About section displays neutral *"Official Corporate Incorporation Records Maintained Upon Confirmation"* status |
| Jurisdiction & Authorized Signatory / Leadership | `VITE_CORPORATE_JURISDICTION`, `VITE_CORPORATE_LEADERSHIP` | Omitted publicly |

---

## 9. Honest Sandbox Verification Notice (Screenshots & Git)

- **Rendered Desktop/Mobile Screenshots:** This execution sandbox does not include a headless browser binary (`chromium`, `playwright`, or `puppeteer`), so automated rendered desktop/mobile screenshots could not be captured directly inside the sandbox. Visual verification was performed via static asset dimension/integrity checks (`identify`), CSS variable/palette inspection, build bundle checks, and live HTTP `200 OK` + MIME verification against the running Vite/Express server on port 3000. Capture final desktop (`1440×900`) and mobile (`390×844`) screenshots locally or in staging before merging the PR.
- **Git Branch Operations:** The workspace directory (`/app/applet`) does not contain a `.git` repository, so `git checkout -b feature/destria-official-rebrand` could not be executed locally in the sandbox. All file changes are cleanly staged in the workspace ready to commit onto `feature/destria-official-rebrand` when synced to `https://github.com/OphireumTechnology/Destria-Tech-Inc`.

---

## 10. Pull Request Proposal & Release Checklist

- **Proposed Branch:** `feature/destria-official-rebrand` → `main`
- **Proposed PR Title:** `feat(branding): migrate platform identity, official emblem, and color system to DESTRIA TECH INC (DESTRIA NETWORK)`
- **Pre-Merge Release Checklist:**
  - [ ] Commit all modified/created files onto `feature/destria-official-rebrand` (do not push directly to `main`).
  - [ ] Capture and attach desktop + mobile visual QA screenshots (Home Hero, About/Brand Board, Services, Contact, Client Portal Login, Client Portal Dashboard, Printable Invoice).
  - [ ] Confirm and populate verified Destria Tech Inc environment variables (`VITE_PUBLIC_ORIGIN`, `VITE_CORPORATE_EMAIL`, `VITE_CORPORATE_PHONE`, `VITE_CORPORATE_ADDRESS`, `VITE_CORPORATE_REG_NO`, `EMAIL_FROM`, `ADMIN_NOTIFICATION_EMAIL`, `ALLOWED_ORIGINS`) in staging/Railway/GitHub Actions variables.
  - [ ] Run CI workflow (`npm run typecheck`, `npm run lint`, `npm test`, `npm run test:security`, `npm run build`, `npm run build:server`) on the PR branch.
  - [ ] Verify staging preview and obtain executive brand approval prior to merging and cutting over DNS.
