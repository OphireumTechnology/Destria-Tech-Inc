# DESTRIA TECH INC — Performance & Scalability Acceptance Report

**Directive:** `DTI-MASTER-COMPLETION-003` (`DTI-C029`)  
**Audit Date:** 2026-11-26  
**Local Benchmark Status:** **PASS (Controlled Local Express Loopback)**  
**Hosted Staging Capacity & Core Web Vitals Status:** **`BLOCKED (EXTERNAL INFRASTRUCTURE)`**

---

## 1. Production Build & Artifact Efficiency
Measured directly on the verified `DTI-MASTER-COMPLETION-003` workspace build:
- **Frontend Production Build (`npm run build`):** `2,185` modules compiled cleanly in **`1.37s`** via Vite (`0` warnings/errors).
- **Static Clean-URL Pre-Render (`npm run build:pages-routes`):** `54` static routes + `404.html` + `CNAME` generated cleanly.
- **Zero-DevDependency Server Bundle (`npm run build:server`):** `dist-server/server.mjs` compiled to **`1.1 mb`** in **`51 ms`** via `esbuild`, eliminating runtime `tsx` compilation overhead on Railway startup.

---

## 2. Controlled Local Progressive Concurrency Benchmark (`DTI-014`)
Executed via `tests/dti-bulk-repair-002-verification.test.ts` (Suite 3) against a live local Express HTTP server instance exercising health/readiness, Front Desk session lifecycle, knowledge retrieval, and concurrent reads:

| Virtual Concurrency Level | Success Rate | P50 Latency | P95 Latency | P99 Latency | Throughput (RPS) |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **1 user** | `100.0%` | `54.1 ms` | `54.1 ms` | `54.1 ms` | `18.4 RPS` |
| **10 users** | `100.0%` | `40.3 ms` | `133.4 ms` | `133.4 ms` | `70.9 RPS` |
| **25 users** | `100.0%` | `57.2 ms` | `102.3 ms` | `107.1 ms` | `224.0 RPS` |
| **50 users** | `100.0%` | `86.7 ms` | `157.2 ms` | `162.4 ms` | `286.9 RPS` |

---

## 3. Honest Disclosure — What Local Benchmarks Do NOT Prove
- **NOT Hosted Railway + Supabase Capacity Proof:** Local loopback measurements exclude Railway container CPU/memory throttling, TLS termination overhead, PostgreSQL connection pooling (PgBouncer/Supavisor), network RTT between Railway and Supabase, and upstream Gemini/Resend/Google Calendar latency.
- **Core Web Vitals Not Yet Measured Live:** Real-browser Lighthouse / CrUX measurements (LCP, INP, CLS, TTFB) on `https://destriatech.com` integrated with live `https://api.destriatech.com` are pending hosted deployment.
- **Horizontal Rate-Limiting Note:** `SlidingWindowRateLimiter` uses per-instance in-memory tracking. Admin logout revocation is now durable across replicas via migration `009` (`admin_revoked_sessions`), whereas multi-replica rate limiting will benefit from an external Redis store if Railway scales beyond 1 replica.

---

## 4. Mandatory Staging Performance Acceptance Criteria
Before moving from `CI_VALIDATED` to `STAGING_ACCEPTED` / `PRODUCTION_ACCEPTED`, execute on staging:
1. Progressive concurrency load test (`1 -> 10 -> 25 -> 50` concurrent users) against `https://api.destriatech.com` connected to live staging Supabase PostgreSQL (target: `>= 99.5%` non-rate-limited success, P95 `< 500 ms` on DB-backed reads/writes, zero unhandled `5xx` or memory leaks).
2. Live browser Lighthouse audit across `/` and `/ai-frontdesk` verifying Core Web Vitals thresholds (`LCP < 2.5s`, `CLS < 0.1`, `INP < 200ms`).
3. Live Gemini Live WebSocket concurrent session stability test verifying clean memory/socket release on disconnect.
