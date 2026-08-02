---
name: teap-test-evidence-automation-platform
description: >
  Complete build knowledge for TEAP (Test Evidence Automation Platform) — a system
  that automatically captures UI screenshots, database query snapshots, payment
  transaction evidence, and API logs during automated test runs, then assembles
  them into stakeholder-ready reports. Use this document whenever asked to explain
  TEAP, extend TEAP, fix or finish an unimplemented TEAP feature, write tests for
  TEAP, review TEAP code, or onboard onto the TEAP codebase. This is the single
  source of truth for architecture, data model, API contracts, the evidence/
  snapshot capture mechanism, what is actually built vs. stubbed, and how to
  verify the system works. Read this in full before touching any TEAP file.
version: 1.0.0
status: partial-implementation (see Section 9 for exact gap list)
audience: any LLM or engineer continuing this build
---

# TEAP — Test Evidence Automation Platform
## Complete Build Reference (Thought → Architecture → Implementation → Test)

> **How to use this document.** This is not an Anthropic "skill" in the tool-triggering
> sense (no bundled scripts/eval loop) — it's a portable engineering handoff document.
> Any LLM given this file plus the source files listed in Section 12 should be able to:
> (1) explain the system to a stakeholder, (2) implement any item in the gap list in
> Section 9 without re-deriving the architecture, and (3) verify correctness using
> Section 10's test protocol. Read Sections 1–8 before writing code. Read Section 9
> before claiming anything is "done." Read Section 10 before claiming anything "works."

---

## Table of Contents

1. [Problem & Origin Story](#1-problem--origin-story)
2. [Goals, Non-Goals, and Success Criteria](#2-goals-non-goals-and-success-criteria)
3. [Users & Core Use Cases](#3-users--core-use-cases)
4. [System Architecture](#4-system-architecture)
5. [Tech Stack](#5-tech-stack)
6. [Data Model](#6-data-model)
7. [API Contract](#7-api-contract)
8. [Snapshot / Evidence Generation — The Core Mechanism](#8-snapshot--evidence-generation--the-core-mechanism)
9. [Implementation Status — What's Real vs. Stubbed](#9-implementation-status--whats-real-vs-stubbed)
10. [Testing Protocol](#10-testing-protocol)
11. [Extension Guide — How to Add Things Correctly](#11-extension-guide--how-to-add-things-correctly)
12. [File Inventory](#12-file-inventory)
13. [Glossary](#13-glossary)

---

## 1. Problem & Origin Story

A senior test lead's team runs manual and automated test scenarios. After a scenario
finishes, someone still has to **prove it ran correctly** for stakeholders: management,
auditors, compliance reviewers. That proof requires:

- UI screenshots at key steps (signup form filled, payment page, confirmation screen)
- Database screenshots/snapshots (proving a row was created, a status flipped to
  `completed`, a balance updated)
- Payment transaction evidence (Stripe/PayPal transaction IDs, amounts, statuses)
- Assembling all of the above into a report a non-technical stakeholder can read

Today this is **manual**: testers alt-tab, screenshot, paste into a doc, run a SQL
query by hand, screenshot the result, dig up the Stripe dashboard entry, and paste
that too. Estimated **40–60% of test-cycle time** goes into evidence collection, not
testing. Simultaneously, the organization is cutting manual-tester headcount and
pushing for automation — so this manual evidence step is now a bottleneck that
actively works against the automation mandate: more automated scenarios just means
more manual evidence-collection overhead.

**The idea (TEAP):** instrument the test itself (Playwright/Selenium/Cucumber) with
a thin client that, at each meaningful step, sends whatever evidence already exists
in memory (a screenshot buffer, a query result, a webhook payload) to a collector
service. The collector stores it, tags it to the scenario/step, and a report
generator assembles it all afterward. The tester adds **one line per step** to an
existing test; everything else — capture, storage, organization, report assembly —
is automatic.

---

## 2. Goals, Non-Goals, and Success Criteria

### Goals
- Reduce evidence-collection time per scenario from ~50 min to ~3 min
- Zero-touch capture: evidence is captured *as a side effect* of the test running,
  not as a separate manual step
- Support 4 evidence types day one: screenshot, DB query, payment event, API call
  (email log and network log are modeled but not yet wired to a capture path — see
  Section 9)
- Produce a report (PDF/HTML/JSON) a stakeholder can open without touching the DB
  or S3 console
- Minimal integration cost: adding TEAP to an existing Playwright test should be
  ≤5 lines of code

### Non-Goals (explicitly out of scope for v1)
- Not a test runner or test framework — TEAP does not run tests, it observes them
- Not a general-purpose APM/observability tool — evidence is scoped to test
  scenarios, not production traffic
- Not doing authentication/authorization in v1 (see Section 9 — this is a known gap,
  not a design decision to skip permanently)
- Not doing live video/screen recording — static screenshots only

### Success Criteria (how you know it's working)
- A Playwright test with TEAP hooks produces Evidence rows in Postgres and files in
  S3/MinIO without any manual step
- `GET /api/evidence/scenario/{id}` returns everything captured during that run,
  grouped by type
- A generated report references every evidence item captured for the selected
  scenarios (currently: as a count + summary; full rendered file is the #1 gap —
  see Section 9)

---

## 3. Users & Core Use Cases

| Persona | Wants | Primary Screen |
|---|---|---|
| **Test Lead / QA Engineer** | Run a test, get evidence automatically, generate a report to hand to their manager | Scenarios tab, Reports tab |
| **Test Automation Engineer** | Add evidence capture to existing Playwright/Selenium/Cucumber suites with minimal code change | TEAP client library (`TEAPAgent`) |
| **Engineering Manager / Stakeholder** | Open a report and see proof a payment flow, signup flow, etc. actually worked — without touching a database | Generated report (PDF/HTML) |
| **Compliance/Audit reviewer** | See a timestamped, tamper-evident trail of what evidence was captured when | Audit log (`AuditLog` table — currently written on scenario create/update/delete only, not yet exposed via an API — see Section 9) |

### Primary User Journey
1. Test Lead creates a **Scenario** ("Payment Processing – Stripe Integration")
2. Test Automation Engineer adds `TEAPAgent` calls to the Playwright test for that
   scenario: `captureScreenshot()`, `captureDbQuery()`, `capturePaymentEvent()`
3. Test runs (in CI or locally) → each call sends evidence over WebSocket or REST to
   the TEAP backend → backend stores file in S3, metadata in Postgres
4. Test Lead opens the **Evidence** tab, sees everything captured, grouped by type
5. Test Lead selects the scenario(s) in the **Reports** tab, picks a format, generates
   a report
6. Stakeholder receives/opens the report

---

## 4. System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         BROWSER / DASHBOARD                       │
│  React SPA (teap-frontend-wired.jsx)                             │
│  Tabs: Dashboard | Scenarios | Evidence | Reports                │
└───────────────────────────┬────────────────────────────────────┘
                            │ REST (fetch) — see Section 7 for exact routes
                            │ (WebSocket also available for live collection)
┌───────────────────────────▼────────────────────────────────────┐
│                     FASTAPI BACKEND                              │
│  (teap-backend-complete.py)                                     │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Routes: /api/scenarios/*  /api/evidence/*  /api/reports/* │  │
│  ├────────────────────────────────────────────────────────┤    │
│  │ Services: S3Service · EvidenceCollector · ReportService  │    │
│  ├────────────────────────────────────────────────────────┤    │
│  │ Models: Scenario · Step · Evidence · Report · AuditLog   │    │
│  └────────────────────────────────────────────────────────┘    │
│  WebSocket: /ws/collect/{scenario_id}  (live evidence stream)    │
└───────┬───────────────────────┬─────────────────────┬──────────┘
        │ SQLAlchemy (async)    │ boto3                │ (Redis wired
        │                       │                       │  in docker-compose,
┌───────▼────────┐     ┌────────▼────────┐             │  not yet used by
│  PostgreSQL     │     │  S3 / MinIO     │             │  backend code)
│  (scenarios,    │     │  (screenshot    │             │
│   steps,        │     │   files, keyed  │       ┌─────▼──────┐
│   evidence,     │     │   by scenario/  │       │   Redis     │
│   reports,      │     │   step)         │       │ (available, │
│   audit_log)    │     └─────────────────┘       │  unused)    │
└─────────────────┘                                └────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    TEST EXECUTION LAYER (external)                │
│  Playwright / Selenium / Cucumber test suite                      │
│  + TEAPAgent client (JS) — calls backend during test execution    │
│  This code lives in the TEST REPO, not the TEAP repo.             │
└──────────────────────────────────────────────────────────────────┘
```

### Why this shape
- **Backend owns all storage decisions.** The frontend and the test client never
  talk to S3 or Postgres directly — everything goes through the FastAPI layer. This
  means credentials for S3/DB live only on the backend, and storage can be swapped
  (S3 → GCS, Postgres → MySQL) without touching frontend or test-client code.
- **Evidence is decoupled from Scenario by a foreign key, not embedded.** A
  `Scenario` doesn't contain its evidence inline; `Evidence` rows point back at it.
  This lets the Evidence tab query across scenarios later (e.g., "all payment
  evidence this month") without restructuring anything.
- **WebSocket is optional, REST is the fallback.** Live collection during a running
  test is nicer over WebSocket (no per-call HTTP handshake), but every evidence type
  also has a plain REST endpoint, so a test runner that can't hold a WS connection
  open (e.g., serverless CI runners) still works.

---

## 5. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 (function components + hooks), inline styles, no CSS framework, no icon library | Zero build-tool dependency — the file runs anywhere React runs, including sandboxed preview environments that don't compile Tailwind or resolve npm icon packages |
| Backend | FastAPI (async), SQLAlchemy 2.0 async, Pydantic | Async end-to-end so screenshot uploads and DB-heavy report generation don't block the event loop |
| Database | PostgreSQL 15 | JSON columns used for flexible `content`/`context`/`metadata` fields (query results, webhook payloads) without needing a migration per new evidence shape |
| Object storage | S3-compatible (AWS S3 in prod, MinIO locally) | Screenshots are binary blobs; don't belong in Postgres rows |
| Cache/queue | Redis | Provisioned in `docker-compose-complete.yml`; **not yet consumed by any backend code** — reserved for future report-generation job queue (see Section 9) |
| Containerization | Docker Compose (dev), Dockerfiles for both services | One-command local environment |

---

## 6. Data Model

Source of truth: `teap-backend-complete.py`, class definitions under
`# DATABASE MODELS`.

### `scenarios`
| Column | Type | Notes |
|---|---|---|
| id | String (UUID) | PK |
| name | String(255) | required |
| description | String | nullable |
| status | Enum: `in_progress`, `completed`, `failed` | default `in_progress` |
| coverage | Integer | percentage, default 0 — **currently never auto-computed**, must be set manually via `PUT /api/scenarios/{id}` (see Section 9) |
| created_by | String | nullable — **no auth system populates this yet** |
| created_at / updated_at | DateTime | auto |
| metadata | JSON | free-form |

Relationships: `steps` (one-to-many, cascade delete), `evidence_items` (one-to-many,
cascade delete).

### `steps`
| Column | Type | Notes |
|---|---|---|
| id | Integer | PK, autoincrement |
| scenario_id | String | FK → scenarios.id |
| step_number | Integer | unique per scenario |
| description | String | required |
| expected_result | String | nullable |
| created_at | DateTime | auto |

**Note:** the `POST /api/scenarios/{id}/steps` endpoint referenced in earlier design
docs (`TEAP_Technical_Architecture.md`) was never implemented in
`teap-backend-complete.py`. The `Step` model and table exist, but there is currently
**no route** to create/list/update a `Step` row. See Section 9, gap #4.

### `evidence`
| Column | Type | Notes |
|---|---|---|
| id | String (UUID) | PK |
| scenario_id | String | FK → scenarios.id |
| step_id | Integer | nullable — not FK-enforced against `steps.id` (loosely coupled by design, since a test may capture evidence before formally registering a step) |
| type | Enum: `screenshot`, `db_query`, `payment_event`, `api_call`, `email_log`, `network_log`, `timestamp` | |
| location | String(1024) | S3 key — populated for `screenshot` type, null for others |
| content | JSON | structured payload — used by `db_query` (query/params/result), `payment_event` (transaction fields + full webhook) |
| context | JSON | free-form metadata (browser URL, page title, original filename, etc.) |
| timestamp | DateTime | when the evidence event occurred |
| created_at | DateTime | when the row was written |

### `reports`
| Column | Type | Notes |
|---|---|---|
| id | String (UUID) | PK |
| scenario_id | String | nullable — **design inconsistency**: `ReportCreate` accepts a *list* of scenario IDs but the `Report` row only has a single `scenario_id` column. Currently the backend doesn't even populate this field on multi-scenario reports. See Section 9, gap #2. |
| format | String(10) | `pdf` / `html` / `json` |
| location | String(1024) | nullable — **never populated**; no file is actually written to S3 for a report today. See Section 9, gap #1. |
| summary | String | auto-generated text, e.g. "Report with 30 evidence items from 2 scenarios" — **not AI-generated** despite the `include_ai_summary` flag existing in the request schema. See Section 9, gap #1. |
| evidence_count | Integer | | 
| generated_by | String | nullable, no auth to populate it |
| generated_at | DateTime | auto |

### `audit_log`
| Column | Type | Notes |
|---|---|---|
| id | Integer | PK |
| scenario_id | String | nullable |
| action | String(100) | e.g. `SCENARIO_CREATED`, `SCENARIO_UPDATED`, `SCENARIO_DELETED` |
| details | JSON | nullable |
| user_id | String | nullable, no auth to populate it |
| timestamp | DateTime | auto |

Written on scenario create/update/delete. **Not written for evidence capture or
report generation events**, and **no API route exposes this table for reading**. See
Section 9, gap #5.

---

## 7. API Contract

Base URL: `http://localhost:8000/api` (configurable — see `API_BASE` constant at the
top of `teap-frontend-wired.jsx`).

### Scenarios

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| POST | `/scenarios/` | `{name, description?, metadata?}` | `ScenarioResponse` | |
| GET | `/scenarios/` | — | `ScenarioResponse[]` | includes computed `evidence_count` per scenario |
| GET | `/scenarios/{id}` | — | `ScenarioResponse` | 404 if missing |
| PUT | `/scenarios/{id}` | `{status?, coverage?}` | `ScenarioResponse` | |
| DELETE | `/scenarios/{id}` | — | `{"status": "deleted"}` | cascades to steps + evidence |

`ScenarioResponse`: `{id, name, description, status, coverage, evidence_count,
created_by, created_at, updated_at}`

### Evidence

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| POST | `/evidence/` | `EvidenceCreate` (generic) | `EvidenceResponse` | low-level; direct DB insert, no S3 involvement |
| POST | `/evidence/upload-screenshot/` | multipart form: `scenario_id`, `step_id` (as query params, **not** form fields — see gotcha below), `file` | `{status, evidence_id, filename}` | uploads to S3, creates Evidence row with `type=screenshot` |
| POST | `/evidence/db-query/` | `scenario_id`, `step_id`, `query`, `params`, `result` — **declared as individual FastAPI params, not a Pydantic body** (see Section 9, gap #6) | `{status, evidence_id, rows}` | |
| POST | `/evidence/payment/` | `scenario_id`, `step_id`, `payment_data: dict` | `{status, evidence_id, transaction_id}` | |
| GET | `/evidence/scenario/{scenario_id}` | — | `{scenario_id, evidence: {type: [{id, step_id, timestamp, location}]}}` | grouped by type |

> **Gotcha for the frontend/client:** `upload_screenshot` in
> `teap-backend-complete.py` declares `scenario_id: str` and `step_id: int` as plain
> function parameters alongside `file: UploadFile = File(...)`. FastAPI will treat
> `scenario_id`/`step_id` as **query parameters**, not form fields, unless the
> multipart client sends them as query string. `teap-frontend-wired.jsx`'s
> `TEAPApi.uploadScreenshot` already handles this correctly by appending them to the
> URL as query params AND to the FormData (belt-and-suspenders) — do not change one
> side without checking the other.

### Reports

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| POST | `/reports/generate` | `ReportCreate` | `ReportResponse` | see gap #1 — no file is actually produced |
| GET | `/reports/` | — | `ReportResponse[]` | |
| GET | `/reports/{id}` | — | `ReportResponse` | 404 if missing |

`ReportCreate`: `{scenario_ids: string[], format: "pdf"|"html"|"json",
include_screenshots, include_db_queries, include_payments, include_api_calls,
include_ai_summary, include_audit_trail}` (all `include_*` default `true` except
`include_audit_trail` which defaults `false`)

`ReportResponse`: `{id, format, location, summary, evidence_count, generated_at}`
— `location` is currently always `null` (gap #1).

### WebSocket

`ws://localhost:8000/ws/collect/{scenario_id}`

Client → server message shapes:
```json
{"type": "screenshot", "step_id": 1, "image": "<base64 png>", "context": {}}
{"type": "db_query", "step_id": 2, "query": "SELECT ...", "params": [], "result": []}
{"type": "payment", "step_id": 3, "payment_data": { /* Stripe/PayPal event object */ }}
```
Server → client acknowledgement: `{"status": "ok", "type": "<echoed type>"}`

### Misc
- `GET /health` → `{"status": "ok", "service": "TEAP API"}`

---

## 8. Snapshot / Evidence Generation — The Core Mechanism

This is the most important section if the ask is "how do I generate a snapshot."
There is **no single "generate snapshot" button that magically screenshots
anything** — TEAP works by having the *test itself* hand over evidence it already
has in memory at the moment it has it. Below is the exact mechanism per evidence
type, end to end.

### 8.1 Screenshot (UI evidence)

**Where the screenshot comes from:** Playwright's own `page.screenshot()` API
(or Selenium's `driver.get_screenshot_as_png()`). TEAP does not drive the browser —
the test framework does. TEAP only receives and stores the resulting image buffer.

**Two transport paths — pick one per integration:**

**Path A — REST multipart (simplest, works from any test runner):**
```javascript
// Inside a Playwright test, after any page state you want to prove:
const screenshotBuffer = await page.screenshot({ fullPage: true });

const formData = new FormData();
formData.append('scenario_id', scenarioId);
formData.append('step_id', String(stepNumber));
formData.append('file', new File([screenshotBuffer], 'screenshot.png'));

await fetch(
  `http://localhost:8000/api/evidence/upload-screenshot/?scenario_id=${scenarioId}&step_id=${stepNumber}`,
  { method: 'POST', body: formData }
);
```

**Path B — WebSocket (for continuous/live capture during a long test run):**
```javascript
const ws = new WebSocket(`ws://localhost:8000/ws/collect/${scenarioId}`);
const screenshotBuffer = await page.screenshot();
ws.send(JSON.stringify({
  type: 'screenshot',
  step_id: stepNumber,
  image: screenshotBuffer.toString('base64'),
  context: { url: page.url(), title: await page.title() }
}));
```

**What happens on the backend (either path):**
1. `EvidenceCollector.capture_screenshot(db, scenario_id, step_id, image_bytes, context)`
   is called
2. It builds an S3 key: `scenarios/{scenario_id}/step_{step_id}/{ISO-timestamp}.png`
3. `S3Service.upload_file(key, image_bytes, 'image/png')` uploads to the
   `teap-evidence` bucket
4. An `Evidence` row is inserted: `type=SCREENSHOT`, `location=<s3 key>`,
   `context=<passed-in dict>`
5. Row is committed and returned

**How to retrieve it later:** `GET /api/evidence/scenario/{scenario_id}` returns the
S3 key under `evidence.screenshot[].location`. **Gap:** there is currently no
endpoint that returns a pre-signed/downloadable URL for that key — the frontend
would need to either (a) add a `GET /evidence/{id}/download` route that generates a
pre-signed S3 URL, or (b) make the bucket/prefix public-read in dev. This is listed
as gap #7 in Section 9.

### 8.2 Database query snapshot ("database screenshot")

There is no literal screenshot of a database GUI. The equivalent evidence is the
**exact query, its parameters, and its result set**, captured as JSON — which is
actually stronger evidence than a screenshot (it's machine-verifiable, not just
visual).

```javascript
// After the test performs an action that should have changed the DB:
const result = await db.query(
  'SELECT * FROM transactions WHERE stripe_id = $1',
  [stripeTransactionId]
);

await fetch('http://localhost:8000/api/evidence/db-query/?' + new URLSearchParams({
  scenario_id: scenarioId,
  step_id: stepNumber,
  query: 'SELECT * FROM transactions WHERE stripe_id = $1'
}), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ params: [stripeTransactionId], result: result.rows })
});
```
> See Section 9, gap #6 — the backend route signature for this endpoint is
> inconsistent (mixes query params and expects a body inconsistently). Fix that
> before wiring a real client to it; don't copy the exact call shape above without
> testing against your actual FastAPI route signature first.

**What happens on the backend:**
`EvidenceCollector.capture_db_query` wraps `{query, parameters, result, row_count,
timestamp}` into `content` JSON and inserts an `Evidence` row with
`type=DB_QUERY`. No S3 involved — small JSON lives directly in Postgres.

### 8.3 Payment event snapshot

Two ways to capture, depending on whether you can intercept the test's own network
call or need to listen for a webhook:

**A. Intercept in the test (synchronous, simplest):**
```javascript
const response = await page.waitForResponse(r => r.url().includes('/api/payments/create'));
const paymentData = await response.json();

await fetch('http://localhost:8000/api/evidence/payment/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ scenario_id: scenarioId, step_id: stepNumber, payment_data: paymentData })
});
```

**B. Stripe webhook receiver (asynchronous, closer to production behavior):**
The design doc (`TEAP_Technical_Architecture.md`, Section 7.1) includes a
`/webhooks/stripe` receiver that calls `evidence_collector.capture_payment_event`
when a `payment_intent.succeeded` event arrives, using `metadata.scenario_id`
and `metadata.step_id` that must be set on the PaymentIntent when it's created.
**This webhook receiver is not present in `teap-backend-complete.py`** — it exists
only as a design-doc code sample. See Section 9, gap #3.

**What happens on the backend:**
`EvidenceCollector.capture_payment_event` extracts `transaction_id, amount,
currency, status, payment_method` plus stores the **entire** raw payload under
`full_response` (for audit purposes), and inserts an `Evidence` row with
`type=PAYMENT_EVENT`.

### 8.4 API call / email log / network log evidence

`EvidenceType` enum includes `API_CALL`, `EMAIL_LOG`, `NETWORK_LOG`. **No dedicated
capture method or REST route exists for these three** — only the generic
`POST /api/evidence/` endpoint can write them today, by passing `type: "api_call"`
(etc.) directly. This is functional but undocumented/unergonomic compared to the
purpose-built screenshot/db-query/payment paths. See Section 9, gap #8 for the
straightforward fix (add `EvidenceCollector.capture_api_call` /
`capture_email_log` following the exact pattern of `capture_payment_event`).

### 8.5 Turning captured snapshots into a report

Once evidence rows exist, `POST /api/reports/generate` with a list of
`scenario_ids` triggers `ReportService.generate_report`, which:
1. Fetches the named scenarios
2. Fetches all evidence rows for those scenarios
3. Computes counts per evidence type
4. Writes a `Report` row with a text summary and the total evidence count

**What it does NOT currently do** (this is the single biggest gap in the whole
system): render an actual PDF/HTML file from the evidence, upload it to S3, or
populate `Report.location`. See Section 9, gap #1, which includes a working
reference implementation (already written, just not wired in) pulled from
`TEAP_Technical_Architecture.md`.

---

## 9. Implementation Status — What's Real vs. Stubbed

Read this before telling anyone a feature "works." Ordered roughly by impact.

### Gap #1 — Report generation doesn't produce a file (HIGH IMPACT)
`ReportService.generate_report` in `teap-backend-complete.py` only writes a `Report`
row with a count and a templated summary string. It never renders PDF/HTML/JSON and
never uploads anything to S3, so `Report.location` is always `null` and there is no
way for a user to actually download a report.

**Reference implementation exists** in `TEAP_Technical_Architecture.md` Section 3.3
(`ReportGenerator` class) — it has working `reportlab`-based PDF generation and
Jinja2-based HTML generation. **To close this gap:** port that class's
`generate_pdf_report`/`generate_html_report` methods into
`ReportService.generate_report`, have them call `S3Service.upload_file` on the
rendered bytes, and set `Report.location` to the resulting S3 key. Also add
`GET /api/reports/{id}/download` that returns either a redirect to a pre-signed S3
URL or streams the file.

The `include_ai_summary` flag is accepted by the API but never calls an LLM —
wire it to `TEAP_Technical_Architecture.md` Section 3.3's
`_generate_ai_summary` method (uses the Anthropic SDK) if a real summary is wanted.

### Gap #2 — Report ↔ Scenario relationship is inconsistent (MEDIUM)
`ReportCreate.scenario_ids` is a list, but the `Report` table has a single nullable
`scenario_id` column, currently never populated. Fix: add a `report_scenarios`
join table (`report_id`, `scenario_id`) for a proper many-to-many, or at minimum
store the list in the existing `Report` model — there's no JSON column for it today
(unlike `Scenario.metadata` or `Evidence.content`). Add one: `Report.scenario_ids:
Column(JSON)`.

### Gap #3 — Stripe/PayPal webhook receiver not wired (MEDIUM)
Design doc has the code (`TEAP_Technical_Architecture.md` Section 7.1,
`/webhooks/stripe`); it is not present in `teap-backend-complete.py`. Payment
evidence today can only be captured by the test itself intercepting the response
(Section 8.3, Path A) — which works, but doesn't validate what production actually
received, only what the test's own network call saw.

### Gap #4 — No route for the `Step` model (MEDIUM)
`Step` table and model exist; no CRUD route exists for it anywhere in
`teap-backend-complete.py`. The frontend's step-by-step breakdown in the Scenarios
tab (`teap-frontend-wired.jsx`, expanded-scenario view) currently **hardcodes** four
example steps client-side rather than reading real `Step` rows — this is
placeholder UI, not real data. To close: add
`POST/GET /api/scenarios/{id}/steps`, and update the frontend to fetch and render
real step data instead of the hardcoded array.

### Gap #5 — Audit log is write-only and incomplete (LOW-MEDIUM)
`AuditLog` rows are written on scenario create/update/delete but:
- Not written when evidence is captured or a report is generated
- No `GET /api/audit-log` (or similar) route exists to read it back
- `user_id` is always `null` because there's no auth (see Gap #9)

### Gap #6 — `/evidence/db-query/` route signature is inconsistent (MEDIUM, blocks Section 8.2 code as literally written)
The route declares `query: str, params: list = [], result: list = []` as bare
function parameters. In FastAPI, a `list` parameter without `Body(...)` is
ambiguous/often rejected — this route as currently written **may not accept a JSON
body the way `capture_payment_event`'s route does.** Before wiring a real client,
convert this to a proper Pydantic request model, e.g.:
```python
class DbQueryEvidenceRequest(BaseModel):
    scenario_id: str
    step_id: int
    query: str
    params: list = []
    result: list = []

@router.post("/evidence/db-query/")
async def capture_db_query(req: DbQueryEvidenceRequest, db: AsyncSession = Depends(get_db)):
    ...
```
This is a one-file fix but is currently untested — treat it as broken until
verified (see Section 10, Test Case 6).

### Gap #7 — No download URL for stored screenshots (MEDIUM)
`Evidence.location` stores an S3 key, not a URL. There is no route that turns that
key into something a browser can load (pre-signed URL, or a proxy/stream route).
The Evidence tab in the frontend currently shows evidence metadata (type, step,
timestamp) but **cannot render the actual screenshot image** — this is a real,
user-visible gap, not a nice-to-have.

### Gap #8 — No dedicated capture helpers for `api_call`, `email_log`, `network_log` (LOW)
Only the generic `POST /api/evidence/` can write these types today. Straightforward
to fix by mirroring `EvidenceCollector.capture_payment_event`'s pattern.

### Gap #9 — No authentication/authorization anywhere (HIGH, but explicitly deferred — see Section 2 Non-Goals)
`created_by`, `generated_by`, `user_id` fields exist on models but nothing populates
them. CORS is wide open (`allow_origins=["*"]`) in `teap-backend-complete.py`. This
is fine for local development; **must** be closed before any shared/production
deployment. Not a "bug" so much as an explicitly unstarted milestone.

### Gap #10 — Frontend has no manual screenshot-upload UI (LOW)
`TEAPApi.uploadScreenshot()` exists in `teap-frontend-wired.jsx`'s API layer and is
fully wired to the backend, but **no component in the UI calls it** — there's no
file input anywhere in the current tabs. It's only reachable today via a test's own
Playwright/REST call (Section 8.1). Fine for the "automated capture" use case;
add a manual "attach evidence" button to the Scenario detail view if ad-hoc manual
uploads are wanted too.

### Gap #11 — Redis is provisioned but unused (LOW)
`docker-compose-complete.yml` runs a Redis container; no backend code imports a
Redis client. Likely intended for a future async report-generation job queue (so
`POST /reports/generate` can return immediately and generate in the background) —
currently report generation is synchronous inside the request handler.

### What IS fully working end-to-end today
- Scenario CRUD (create/list/get/update/delete), including cascade delete of
  evidence and audit logging of the create/update/delete actions
- Screenshot capture via REST multipart upload → S3 storage → DB row (Section 8.1,
  Path A) — verified against the actual route signature
- Payment event capture via `POST /api/evidence/payment/` (Section 8.3, Path A)
- DB query evidence capture **once Gap #6 is fixed**
- `GET /api/evidence/scenario/{id}` grouped retrieval
- Report row creation with accurate evidence counts (just not a downloadable file —
  Gap #1)
- Frontend ↔ backend wiring for all of the above (`teap-frontend-wired.jsx`), with
  real loading states, error banners with retry, and success toasts

---

## 10. Testing Protocol

Use this section to verify claims, not just read them. Three layers: backend unit,
API contract (manual or scripted), and frontend manual walkthrough.

### 10.1 Environment setup for testing
```bash
docker-compose -f docker-compose-complete.yml up -d
docker-compose ps            # all services should show healthy
curl http://localhost:8000/health   # {"status":"ok","service":"TEAP API"}
```

### 10.2 Backend API contract tests (curl — run in order, they build on each other)

**Test 1 — create scenario**
```bash
curl -s -X POST http://localhost:8000/api/scenarios/ \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke Test Scenario","description":"created by test protocol"}' | tee /tmp/scenario.json
```
Expect: HTTP 200, JSON with a `id` field (UUID string), `status: "in_progress"`,
`evidence_count: 0`. Capture the `id` as `$SCENARIO_ID` for subsequent calls.

**Test 2 — list scenarios includes it**
```bash
curl -s http://localhost:8000/api/scenarios/ | grep "$SCENARIO_ID"
```
Expect: non-empty match.

**Test 3 — upload a screenshot**
```bash
# any small PNG works
curl -s -X POST "http://localhost:8000/api/evidence/upload-screenshot/?scenario_id=$SCENARIO_ID&step_id=1" \
  -F "scenario_id=$SCENARIO_ID" -F "step_id=1" -F "file=@/path/to/any.png"
```
Expect: HTTP 200, `{"status":"uploaded","evidence_id":"<uuid>","filename":"any.png"}`.
Then verify it landed in storage:
```bash
docker exec <minio-container> mc ls minio/teap-evidence/scenarios/$SCENARIO_ID/step_1/
```
Expect: one `.png` file listed.

**Test 4 — retrieve evidence for the scenario**
```bash
curl -s http://localhost:8000/api/evidence/scenario/$SCENARIO_ID
```
Expect: `{"scenario_id": "...", "evidence": {"screenshot": [{...}]}}` with exactly
one item under `screenshot`.

**Test 5 — payment evidence**
```bash
curl -s -X POST http://localhost:8000/api/evidence/payment/ \
  -H "Content-Type: application/json" \
  -d "{\"scenario_id\":\"$SCENARIO_ID\",\"step_id\":2,\"payment_data\":{\"id\":\"tx_test123\",\"amount\":5000,\"currency\":\"usd\",\"status\":\"succeeded\"}}"
```
Expect: `{"status":"captured","evidence_id":"<uuid>","transaction_id":"tx_test123"}`.
Re-run Test 4 — should now show both `screenshot` and `payment_event` groups.

**Test 6 — DB query evidence (this is the currently-suspect route, Gap #6)**
```bash
curl -s -X POST "http://localhost:8000/api/evidence/db-query/?scenario_id=$SCENARIO_ID&step_id=3&query=SELECT+1" \
  -H "Content-Type: application/json" \
  -d '{"params":[],"result":[{"col":1}]}'
```
Expect: `{"status":"captured","evidence_id":"<uuid>","rows":1}`.
**If this returns HTTP 422**, that confirms Gap #6 — fix the route per Section 9
before proceeding, then re-run this test to confirm the fix.

**Test 7 — report generation**
```bash
curl -s -X POST http://localhost:8000/api/reports/generate \
  -H "Content-Type: application/json" \
  -d "{\"scenario_ids\":[\"$SCENARIO_ID\"],\"format\":\"pdf\"}"
```
Expect: HTTP 200, `evidence_count` matches total evidence created above (2 or 3
depending on whether Test 6 passed), `location: null` (confirms Gap #1 until fixed
— if you've implemented the fix, expect a non-null S3 key here instead).

**Test 8 — cascade delete**
```bash
curl -s -X DELETE http://localhost:8000/api/scenarios/$SCENARIO_ID
curl -s http://localhost:8000/api/evidence/scenario/$SCENARIO_ID
```
Expect: delete returns `{"status":"deleted"}`; the evidence lookup afterward
returns an empty `evidence: {}` object (rows cascade-deleted).

### 10.3 Frontend manual walkthrough (`teap-frontend-wired.jsx`)
1. Start backend (`docker-compose up -d`), confirm `curl localhost:8000/health` OK
2. Load the frontend file in a React environment with `API_BASE` pointed at the
   running backend
3. **Dashboard tab**: should show scenario/evidence counts matching the DB (cross-
   check against Test 2's `curl` output) — if it shows a connection-error banner
   instead, the backend isn't reachable from wherever the frontend is running
   (check CORS, check the `API_BASE` value, check the backend is actually up)
4. **Scenarios tab**: click "New Scenario," create one, confirm it appears without a
   page reload; expand it, confirm the evidence panel attempts to load (will show
   "No evidence recorded" for a freshly-created scenario — correct behavior)
5. **Evidence tab**: pick the scenario used in Section 10.2's curl tests from the
   dropdown; confirm screenshot/payment/db_query groups appear matching what curl
   showed
6. **Reports tab**: select the scenario, pick a format, click Generate; confirm the
   "Report Generated" panel shows the correct `evidence_count`; confirm `location`
   truthfully shows as absent/null in the returned summary (don't let a UI claim a
   download is ready when Gap #1 is still open — if the UI ever shows a working
   "Download" button before Gap #1 is closed, that's a UI bug, flag it)

### 10.4 Acceptance checklist (copy this into a PR description when closing gaps)
- [ ] `docker-compose ps` shows all services healthy
- [ ] Tests 1–8 in Section 10.2 all pass with the responses described
- [ ] Frontend walkthrough Section 10.3 steps 1–6 all behave as described
- [ ] Any gap closed from Section 9 has its status updated in this document (don't
      leave stale gap descriptions — a gap that's fixed and still listed as open is
      worse than no documentation at all)

---

## 11. Extension Guide — How to Add Things Correctly

**Adding a new evidence type:**
1. Add the value to `EvidenceType` enum in `teap-backend-complete.py`
2. Add an `EvidenceCollector.capture_<type>` static method following the exact
   pattern of `capture_payment_event` (build a `content` dict, insert an `Evidence`
   row, commit, log, return)
3. Add a thin route in the evidence routes section that accepts a Pydantic request
   body (not bare params — see Gap #6 as the cautionary example) and calls the new
   collector method
4. Add an icon/label mapping entry in `teap-frontend-wired.jsx`'s `typeIcon` object
   (in `EvidenceTab`) so it renders sensibly instead of falling back to the generic
   `📄` icon

**Adding a new API endpoint generally:**
- Backend: add the Pydantic request/response schemas near the top under
  `# PYDANTIC SCHEMAS`, then the route near its sibling routes (keep
  scenarios/evidence/reports routes grouped as they are today)
- Frontend: add a method to the `TEAPApi` object at the top of
  `teap-frontend-wired.jsx` — every existing UI action goes through this object,
  don't call `fetch()` directly from a component

**Closing Gap #1 (report file generation) — recommended order of operations:**
1. Port `ReportGenerator.generate_pdf_report` and `generate_html_report` from
   `TEAP_Technical_Architecture.md` Section 3.3 into `ReportService` in
   `teap-backend-complete.py`
2. Have them call the existing `S3Service.upload_file` (already present, already
   used by screenshot capture — reuse it, don't write a second upload path)
3. Set `Report.location` to the returned key
4. Add `GET /api/reports/{id}/download` — simplest correct version returns
   `RedirectResponse` to a pre-signed URL via
   `s3_client.generate_presigned_url('get_object', Params={'Bucket':..., 'Key':...})`
5. Update `teap-frontend-wired.jsx`'s `ReportsTab` to render an actual `<a>`
   download link once `location` is non-null in the response
6. Verify with Section 10.2 Test 7 — `location` should now be non-null

**Coding conventions already established — follow them:**
- Backend: async everywhere (`async def`, `AsyncSession`), Pydantic models for every
  non-trivial request body, service classes as `@staticmethod` collections (not
  instantiated), structured logging via `logger.info(...)` on every write operation
- Frontend: no external UI libraries, inline `style={{}}` objects (see `styles`
  object at the top of `teap-frontend-wired.jsx` for the shared style tokens —
  extend that object rather than inlining ad-hoc styles in new components), every
  network call goes through `TEAPApi`, every async action has a loading state and
  an error state surfaced to the user (never a silent failure)

---

## 12. File Inventory

Files produced during this build, and what each one is for. If you're an LLM
picking this up fresh, read them in this order:

| Order | File | Purpose |
|---|---|---|
| 1 | **This file (`SKILL.md`)** | Start here — full context |
| 2 | `teap-backend-complete.py` | The actual backend source — models, routes, services |
| 3 | `teap-frontend-wired.jsx` | The actual frontend source, wired to the real API |
| 4 | `docker-compose-complete.yml` | Local environment — Postgres, MinIO, Redis, Adminer, both services |
| 5 | `backend-requirements.txt` | Python dependencies |
| 6 | `backend-Dockerfile`, `frontend-Dockerfile` | Container builds |
| 7 | `TEAP_Technical_Architecture.md` | Original design doc — contains the reference `ReportGenerator` (PDF/HTML rendering) implementation needed to close Gap #1, and the Stripe webhook receiver needed to close Gap #3. Treat as a reference/parts bin, not as a description of current backend behavior — it was written before `teap-backend-complete.py` and the two have since diverged (this SKILL.md document is the accurate one) |
| 8 | `SETUP_AND_DEV_GUIDE.md` | Local dev setup, troubleshooting |
| — | `TEAP_Executive_Summary.md` | Business case / ROI — useful for stakeholder communication, not implementation |
| — | `TEAP_Deployment_Checklist.md` | Phase-by-phase rollout plan — useful for project management, describes an idealized 17-week plan, not the current actual state |
| — | `TEAP_Quick_Reference_FAQ.md`, `TEAP_Quick_Implementation_Guide.md`, `COMPLETE_IMPLEMENTATION_GUIDE.md`, `START_HERE.md`, `00-READ-ME-FIRST.txt` | Earlier-generation onboarding docs, superseded by this file for implementation purposes — kept for historical context and for the non-technical audience material (ROI framing, FAQ phrasing) they contain |
| — | `teap_prototype.jsx`, `teap-frontend-complete.jsx`, `teap-frontend-working.jsx` | Earlier frontend iterations (Tailwind version, local-state-only demo version). Superseded by `teap-frontend-wired.jsx`. Not wired to the backend — don't confuse these with the real client. |

---

## 13. Glossary

- **Scenario** — a named test case being tracked (e.g., "Payment Processing –
  Stripe Integration"). The top-level organizing unit; evidence and reports both
  hang off scenarios.
- **Step** — a numbered sub-part of a scenario (e.g., step 1: "navigate to
  checkout"). Modeled in the DB but not yet fully wired to a CRUD API (Gap #4) —
  today, `step_id` on evidence is just an integer tag, not a real foreign key
  relationship in practice.
- **Evidence** — a single captured artifact: a screenshot, a DB query+result, a
  payment event, etc. Always belongs to exactly one scenario, optionally tagged
  with a step number.
- **Snapshot** — informal term used interchangeably with "evidence item" in this
  document and by the test lead who originated the request; not a distinct type in
  the data model. "Generate a snapshot" = "capture one evidence item" (Section 8).
- **Report** — a generated rollup of evidence across one or more scenarios, meant
  for a stakeholder to consume. Currently metadata-only (Gap #1) — the "generated
  file" a user would download does not yet exist.
- **Coverage** — a percentage field on `Scenario` meant to represent how much of
  the scenario's expected evidence was actually captured. Currently a manually-set
  field, not auto-computed from actual evidence vs. expected-steps counts.
- **TEAPAgent** — the client-side helper (JavaScript, lives in the *test* repo, not
  this one) that a Playwright/Selenium test calls to send evidence to the backend.
  Referenced throughout Section 8; not a file included in this deliverable — it's
  glue code the test automation engineer writes using the patterns in Section 8 as
  a template.

---

*End of document. If you are an LLM continuing this build: re-read Section 9 before
claiming any feature is complete, and run the relevant Section 10 test before
claiming any fix works.*
