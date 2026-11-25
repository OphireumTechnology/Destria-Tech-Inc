# DESTRIA TECH INC — Authorized Gemini AI Tool Validation Matrix

All 12 server-side Gemini function-calling tools are registered in `src/server/aiToolsEngine.ts` (supporting both standard blocking declarations for `gemini-4-hydrogen` / `gemini-3.8-live` and `Behavior.NON_BLOCKING` declarations for `gemini-3.8-live-extended-thinking`).

| # | Tool Name | Mode | Side Effects | Explicit Confirmation Required | Validation & Security Controls | Test Coverage |
| :---: | :--- | :---: | :---: | :---: | :--- | :---: |
| 1 | `get_company_information` | Read-only | None | No | Grounded strictly in canonical `corporateIdentity` (`Desmond Hinds`, `Leodenis Languisan`, Sheridan WY HQ, `+1 (307) 419-4277`, `info@destriatech.com`) | Verified (`tests/gemini-live-upgrade.test.ts`) |
| 2 | `get_corporate_profile` | Read-only | None | No | Returns verified PDF resource links (`destria-tech-inc-corporate-profile.pdf`, `destria-tech-line-of-services.pdf`) and emits `resource_links` UI event | Verified (Tools + Live WS Suite) |
| 3 | `search_service_catalog` | Read-only | None | No | Searches official 10-division catalog; never outputs monetary prices | Verified (`tests/gemini-live-upgrade.test.ts`) |
| 4 | `recommend_technology_solutions` | Read-only + Session Memory | Session state | No | Accepts `businessObjective` & `businessObjectives`; enforces customized assessment commercial notice | Verified (`tests/gemini-live-upgrade.test.ts`) |
| 5 | `collect_project_requirements` | Session Memory | Session state | No | Sanitizes & merges requirements; returns canonical `requirements` + `capturedRequirements` | Verified (`tests/gemini-live-upgrade.test.ts`) |
| 6 | `validate_client_information` | Read-only + Session Memory | Session state | No | Strictly validates name, email format, phone characters, and company name | Verified (`tests/gemini-live-upgrade.test.ts`) |
| 7 | `check_appointment_availability` | Read-only (DB + Calendar) | None | No | Queries real booked slots via `db.getBookedSlotsForDate()` and calendar integration | Verified (`tests/gemini-live-upgrade.test.ts`) |
| 8 | `prepare_consultation_request` | Draft Staging | In-memory pending token (TTL) | Produces token | Strictly validates appointment payload; **never** writes to DB or sends email; emits `prepared_consultation` | Verified (`tests/gemini-live-upgrade.test.ts`) |
| 9 | `submit_consultation_request` | Persistent Write + Email | DB + Outbox + Audit | **YES (`clientConfirmed: true` + valid session-bound token)** | Rejects missing confirmation, wrong session, expired or replayed tokens; consumes token before persistence; queues customer + dual executive recipients (`artaxsvcs@gmail.com`, `dhenze.languisan@gmail.com`) without leaking addresses | Verified (`tests/gemini-live-upgrade.test.ts`) |
| 10 | `prepare_service_inquiry` | Draft Staging | In-memory pending token (TTL) | Produces token | Resolves canonical catalog service IDs from `serviceTitle`/`category`; validates all contact/consent fields strictly; **never** persists before confirmation; emits `prepared_inquiry` | Verified (`tests/gemini-live-upgrade.test.ts` + PoC 2) |
| 11 | `submit_service_inquiry` | Persistent Write + Email | DB + Outbox + Audit | **YES (`clientConfirmed: true` + valid session-bound token)** | Enforces single-use session-bound confirmation token + idempotency key; blocks cross-session hijacking & replay; dispatches customer + dual executive recipient outbox | Verified (`tests/gemini-live-upgrade.test.ts` + PoC 2) |
| 12 | `request_human_assistance` | Escalation + Audit | Audit log | No | Logs escalation event and returns official executive phone (`+1 (307) 419-4277`), email (`info@destriatech.com`), and emits `human_assistance` UI event | Verified (`tests/gemini-live-upgrade.test.ts`) |

## Model Governance Verification
- **Chat / Turn-Based Reasoning:** `gemini-4-hydrogen` (active allowlisted model; zero deprecated `gemini-1.5-*` or `gemini-2.0-*`; no deprecated `temperature`/`topP`/`topK`).
- **Real-Time Voice Live Duplex:** `gemini-3.8-live` and `gemini-3.8-live-extended-thinking` (with `ThinkingLevel.LOW`, `Behavior.NON_BLOCKING`, `FunctionResponseScheduling.WHEN_IDLE`, and `InteractionStatus.IDLE` turn completion tracking).
- **Neural Text-to-Speech:** `gemini-3.8-flash-lite-tts`.
- **SDK Client Identification:** Server-side `GoogleGenAI` initialized in `src/server/app.ts` with `httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }`; strictly server-only (`GEMINI_API_KEY` never exposed to client bundles).
