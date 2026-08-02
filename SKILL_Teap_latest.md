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
  snapshot capture mechanism, pluggable storage/database configuration, what is
  actually built vs. stubbed, and how to verify the system works. Read this in
  full before touching any TEAP file.
version: 1.1.0
status: partial-implementation (see Section 9 for exact gap list)
audience: any LLM or engineer continuing this build
changelog:
  - "1.1.0: added pluggable evidence storage backend (filesystem | s3 | database)
     and pluggable database backend (sqlite default | postgres | oracle)"
  - "1.0.0: initial version"
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
>
> **v1.1 note:** this version adds two configuration axes that didn't exist in v1.0:
> a pluggable **evidence storage backend** (Section 8.1) and a pluggable **database
> backend** (Section 6.0). Both are specified in full, with reference code, but
> **neither is implemented in `teap-backend-complete.py` yet** — that file still
> hardcodes Postgres + S3. This is tracked honestly as Gap #12 and Gap #13 in
> Section 9. Don't claim either feature "works" until those gaps are closed and
> Section 10's new test cases pass.

---

## Table of Contents

1. [Problem & Origin Story](#1-problem--origin-story)
2. [Goals, Non-Goals, and Success Criteria](#2-goals-non-goals-and-success-criteria)
3. [Users & Core Use Cases](#3-users--core-use-cases)
4. [System Architecture](#4-system-architecture)
5. [Tech Stack](#5-tech-stack)
6. [Data Model & Database Configuration](#6-data-model--database-configuration)
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

**Why v1.1 adds pluggable storage/database:** the v1.0 design hard-required
PostgreSQL + S3/MinIO, meaning a test lead couldn't try TEAP without standing up
Docker Compose first. That's a real adoption barrier for a "try it on my laptop in
five minutes" tool. v1.1's goal is a **zero-external-dependency mode**: SQLite file
+ local filesystem folder, nothing else running, while still supporting Postgres/
Oracle + S3 for team/production use without changing a line of application code —
only environment variables change.

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
- **(v1.1)** Run with zero external services for local/individual use: SQLite +
  local filesystem, no Docker required
- **(v1.1)** Scale to team/production use by changing only `DATABASE_URL` and
  `EVIDENCE_STORAGE_BACKEND` — no application code changes

### Non-Goals (explicitly out of scope for v1)
- Not a test runner or test framework — TEAP does not run tests, it observes them
- Not a general-purpose APM/observability tool — evidence is scoped to test
  scenarios, not production traffic
- Not doing authentication/authorization in v1 (see Section 9 — this is a known gap,
  not a design decision to skip permanently)
- Not doing live video/screen recording — static screenshots only
- Not doing automatic replication/backup across storage backends — if you configure
  `filesystem`, evidence lives only on that machine's disk; that's a deliberate
  simplicity tradeoff for the local-dev mode, not a bug

### Success Criteria (how you know it's working)
- A Playwright test with TEAP hooks produces Evidence rows in the database and
  screenshot files in whichever storage backend is configured, without any manual
  step
- `GET /api/evidence/scenario/{id}` returns everything captured during that run,
  grouped by type, regardless of which database or storage backend is active
- A generated report references every evidence item captured for the selected
  scenarios (currently: as a count + summary; full rendered file is Gap #1 — see
  Section 9)
- **(v1.1)** The exact same `teap-backend-complete.py` process, started with no
  `DATABASE_URL` and no `EVIDENCE_STORAGE_BACKEND` set, boots against a local
  SQLite file and a local folder with no other services running

---

## 3. Users & Core Use Cases

| Persona | Wants | Primary Screen |
|---|---|---|
| **Test Lead / QA Engineer** | Run a test, get evidence automatically, generate a report to hand to their manager | Scenarios tab, Reports tab |
| **Test Automation Engineer** | Add evidence capture to existing Playwright/Selenium/Cucumber suites with minimal code change | TEAP client library (`TEAPAgent`) |
| **Engineering Manager / Stakeholder** | Open a report and see proof a payment flow, signup flow, etc. actually worked — without touching a database | Generated report (PDF/HTML) |
| **Compliance/Audit reviewer** | See a timestamped, tamper-evident trail of what evidence was captured when | Audit log (`AuditLog` table — currently written on scenario create/update/delete only, not yet exposed via an API — see Section 9) |
| **(v1.1) Individual evaluator trying TEAP for the first time** | Run TEAP on a laptop with nothing else installed, prove the concept, then decide whether to stand up Postgres/S3 for the team | Same UI, `DATABASE_URL`/`EVIDENCE_STORAGE_BACKEND` unset (defaults apply) |

### Primary User Journey
1. Test Lead creates a **Scenario** ("Payment Processing – Stripe Integration")
2. Test Automation Engineer adds `TEAPAgent` calls to the Playwright test for that
   scenario: `captureScreenshot()`, `captureDbQuery()`, `capturePaymentEvent()`
3. Test runs (in CI or locally) → each call sends evidence over WebSocket or REST to
   the TEAP backend → backend stores the screenshot in whichever storage backend is
   configured (filesystem by default, S3 or inline-database if configured) and
   writes metadata to whichever database is configured (SQLite by default, Postgres
   or Oracle if configured)
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
│                     FASTAPI BACKEND                               │
│  (teap-backend-complete.py)                                     │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Routes: /api/scenarios/*  /api/evidence/*  /api/reports/* │  │
│  ├────────────────────────────────────────────────────────┤    │
│  │ Services: EvidenceCollector · ReportService               │    │
│  ├────────────────────────────────────────────────────────┤    │
│  │ 🆕 StorageBackend (pluggable) — selected by env var       │    │
│  │    EVIDENCE_STORAGE_BACKEND = filesystem | s3 | database  │    │
│  ├────────────────────────────────────────────────────────┤    │
│  │ Models: Scenario · Step · Evidence · Report · AuditLog   │    │
│  └────────────────────────────────────────────────────────┘    │
│  WebSocket: /ws/collect/{scenario_id}  (live evidence stream)    │
└───┬───────────────┬───────────────────┬──────────────┬─────────┘
    │ SQLAlchemy     │ (if backend=      │ (if backend= │ (if backend=
    │ async engine   │  filesystem)      │  s3)         │  database)
    │ 🆕 dialect      │                   │              │
    │ auto-detected  │                   │              │
    │ from           │                   │              │
    │ DATABASE_URL   │                   │              │
┌───▼─────────────┐ ┌▼────────────────┐ ┌▼─────────────┐ (no extra
│ 🆕 Database       │ │ 🆕 Local disk     │ │ S3 / MinIO   │  service —
│ (pick one via    │ │ ./evidence_     │ │ (screenshot  │  bytes live
│  DATABASE_URL):  │ │  storage/       │ │  files, keyed│  as base64
│  • SQLite3       │ │  scenarios/...  │ │  by scenario/│  in the
│    (default,     │ │  DEFAULT when   │ │  step)       │  evidence
│    file-based,   │ │  no env var set │ └──────────────┘  table
│    zero config)  │ └─────────────────┘                   itself)
│  • PostgreSQL     │
│  • Oracle         │
│  (scenarios,      │
│   steps,          │
│   evidence,       │
│   reports,        │
│   audit_log)      │
└───────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    TEST EXECUTION LAYER (external)                │
│  Playwright / Selenium / Cucumber test suite                      │
│  + TEAPAgent client (JS) — calls backend during test execution    │
│  This code lives in the TEST REPO, not the TEAP repo.             │
└──────────────────────────────────────────────────────────────────┘
```

### Why this shape
- **Backend owns all storage decisions.** The frontend and the test client never
  talk to S3, the filesystem, or the database directly — everything goes through
  the FastAPI layer. This means credentials for S3/DB live only on the backend,
  and storage can be swapped (filesystem → S3 → inline-DB, SQLite → Postgres →
  Oracle) without touching frontend or test-client code at all — only environment
  variables change.
- **Evidence is decoupled from Scenario by a foreign key, not embedded.** A
  `Scenario` doesn't contain its evidence inline; `Evidence` rows point back at it.
  This lets the Evidence tab query across scenarios later (e.g., "all payment
  evidence this month") without restructuring anything.
- **WebSocket is optional, REST is the fallback.** Live collection during a running
  test is nicer over WebSocket (no per-call HTTP handshake), but every evidence type
  also has a plain REST endpoint, so a test runner that can't hold a WS connection
  open (e.g., serverless CI runners) still works.
- **🆕 Storage backend and database backend are two independent axes.** You can
  mix and match freely: SQLite + S3, Postgres + filesystem, Oracle + inline-database
  blobs, etc. Neither choice constrains the other — this is why they're drawn as
  separate boxes in the diagram above rather than bundled into one "Postgres+S3"
  block like in v1.0.

---

## 5. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 (function components + hooks), inline styles, no CSS framework, no icon library | Zero build-tool dependency — the file runs anywhere React runs, including sandboxed preview environments that don't compile Tailwind or resolve npm icon packages |
| Backend | FastAPI (async), SQLAlchemy 2.0 async, Pydantic | Async end-to-end so screenshot uploads and DB-heavy report generation don't block the event loop |
| **🆕 Database** | **SQLite3 by default** (via `aiosqlite`), **PostgreSQL** (via `asyncpg`) or **Oracle** (via `python-oracledb`, thin/async mode) when configured | SQLite requires zero setup — a single file — so anyone can run TEAP immediately. Postgres/Oracle are for team/production deployments needing concurrent writers and a real DBA-managed instance. See Section 6.0 for exact `DATABASE_URL` formats and caveats per dialect. |
| **🆕 Evidence storage** | **Local filesystem by default**, **S3-compatible** (AWS S3 or MinIO), or **inline in the database** (base64 in a `Text`/`CLOB` column) when configured | Filesystem needs nothing extra to run. S3 is for team/production sharing and durability. Inline-database is for the simplest possible single-file deployment (SQLite + inline blobs = one file holds everything, trivially portable) — tradeoff: bloats the DB file and is the least efficient of the three for large binary evidence. See Section 8.1. |
| Cache/queue | Redis | Provisioned in `docker-compose-complete.yml`; **not yet consumed by any backend code** — reserved for future report-generation job queue (see Section 9) |
| Containerization | Docker Compose (dev), Dockerfiles for both services | One-command local environment when you *do* want Postgres/S3/Redis running together — **now optional**, not required, thanks to the SQLite + filesystem defaults |

### 🆕 Zero-dependency local mode
With no environment variables set at all, `teap-backend-complete.py` (once Gap #12/
#13 are closed per Section 9) should boot against:
- Database: `sqlite+aiosqlite:///./teap.db` (a file created next to wherever the
  process runs)
- Evidence storage: `./evidence_storage/` (a folder created the same way)

No Docker, no MinIO, no Postgres. This is the mode a first-time evaluator should
use. Docker Compose remains the recommended path once more than one person needs to
share the same evidence store, or once concurrent-write volume exceeds what SQLite
comfortably handles (see the SQLite caveat table in Section 6.0).

---

## 6. Data Model & Database Configuration

### 6.0 🆕 Database Configuration (pluggable backend)

TEAP selects its database dialect **entirely from the `DATABASE_URL` environment
variable's scheme** — no separate "database type" flag is needed, because
SQLAlchemy already encodes the dialect+driver in the URL itself.

| Backend | `DATABASE_URL` format | Driver package | Notes |
|---|---|---|---|
| **SQLite3 (default)** | `sqlite+aiosqlite:///./teap.db` (relative file) or `sqlite+aiosqlite:////absolute/path/teap.db` | `aiosqlite` | Used automatically if `DATABASE_URL` is unset. Zero setup. See caveats below. |
| **PostgreSQL** | `postgresql+asyncpg://user:pass@host:5432/teap` | `asyncpg` | Same format already used in v1.0 — no change here |
| **Oracle** | `oracle+oracledb://user:pass@host:1521/?service_name=teap` | `python-oracledb` (thin mode, async) | **Newest, least battle-tested path.** SQLAlchemy 2.0+ added async support for `oracledb`'s thin-mode async driver, but it has far less community mileage than `asyncpg`. Test thoroughly (Section 10.4) before depending on it for anything beyond evaluation. |

**Reference engine-creation code** (replaces the hardcoded
`create_async_engine(DATABASE_URL, ...)` call in `teap-backend-complete.py`):

```python
import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./teap.db")

def _engine_kwargs(url: str) -> dict:
    """Dialect-specific tuning. SQLite in particular needs different pooling
    behavior than server-based databases to avoid 'database is locked' errors
    under concurrent async writes."""
    if url.startswith("sqlite"):
        # SQLite has file-level locking; pooling connections can make
        # concurrent-write contention worse, not better. NullPool opens a
        # fresh connection per operation, which is the safer default here.
        return {"poolclass": NullPool, "connect_args": {"timeout": 30}}
    # Postgres / Oracle: default pooling is fine, tune pool_size for load.
    return {"pool_size": 10, "max_overflow": 20}

engine = create_async_engine(DATABASE_URL, echo=False, future=True, **_engine_kwargs(DATABASE_URL))
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
```

**Known caveats per backend — read before choosing one:**

- **SQLite:**
  - Single-writer at the file level. Many parallel Playwright workers hammering
    `POST /api/evidence/*` concurrently will see periodic write contention/latency.
    Fine for one test lead running scenarios locally or a small team's CI; **not**
    recommended once you have many parallel test runners writing simultaneously —
    switch to Postgres at that point.
  - `SQLAlchemy`'s `JSON` and `Enum` column types (used throughout the `Evidence`,
    `Scenario` models) both work on SQLite, but are *emulated* (JSON as TEXT with
    serialize/deserialize; Enum as VARCHAR + CHECK constraint) rather than native
    types. Functionally fine; don't expect Postgres's native `JSONB` query
    operators to work if you ever write raw SQL against a SQLite-backed instance.
  - Alembic migrations against SQLite need **batch mode**
    (`context.configure(..., render_as_batch=True)`) because SQLite's `ALTER TABLE`
    support is limited (can't drop/modify columns directly pre-3.35). If you add
    Alembic to this project, this setting is not optional for SQLite to work.
- **PostgreSQL:** no caveats beyond what v1.0 already assumed — this is the
  best-tested path (asyncpg + Postgres is one of the most common async SQLAlchemy
  combinations in production use generally).
- **Oracle:** confirm `python-oracledb`'s async support version requirements
  against your installed SQLAlchemy version before relying on it — this pairing is
  new enough that pinning exact versions in `requirements.txt` matters more here
  than for the other two backends. Also confirm your Oracle instance's
  `service_name` vs `SID` connection style matches the URL format above (some
  older Oracle instances use SID-style DSNs, which need a different URL shape).

### 6.1 `scenarios`
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

### 6.2 `steps`
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

### 6.3 `evidence` 🆕 (columns added for pluggable storage)
| Column | Type | Notes |
|---|---|---|
| id | String (UUID) | PK |
| scenario_id | String | FK → scenarios.id |
| step_id | Integer | nullable — not FK-enforced against `steps.id` (loosely coupled by design, since a test may capture evidence before formally registering a step) |
| type | Enum: `screenshot`, `db_query`, `payment_event`, `api_call`, `email_log`, `network_log`, `timestamp` | |
| location | String(1024) | meaning now **depends on `storage_backend`** (see below) — nullable |
| **🆕 storage_backend** | String(20), nullable | one of `filesystem`, `s3`, `database`, or `null` for evidence types that never had binary data (e.g. `db_query`, `payment_event`, which only ever use `content`) |
| **🆕 blob_data** | Text, nullable | base64-encoded bytes, populated **only** when `storage_backend='database'`. Base64-as-Text is used instead of a native `LargeBinary`/`bytea`/`BLOB` column specifically because it's the one binary representation that behaves identically across SQLite, Postgres, and Oracle — see Section 8.1 for why this tradeoff was made. |
| content | JSON | structured payload — used by `db_query` (query/params/result), `payment_event` (transaction fields + full webhook) |
| context | JSON | free-form metadata (browser URL, page title, original filename, etc.) |
| timestamp | DateTime | when the evidence event occurred |
| created_at | DateTime | when the row was written |

**How to interpret `location` now that storage is pluggable:**

| `storage_backend` | What `location` contains | How to fetch the bytes |
|---|---|---|
| `filesystem` | Absolute or relative path on the backend's local disk, e.g. `./evidence_storage/scenarios/<id>/step_1/2026-08-03T...png` | Read the file from that path (only works if you're on the same machine/volume as the backend process) |
| `s3` | S3 object key, e.g. `scenarios/<id>/step_1/2026-08-03T...png` | `s3_client.get_object(Bucket=..., Key=location)`, or a pre-signed URL (Gap #7) |
| `database` | `null` | Read `blob_data`, base64-decode it |

### 6.4 `reports`
| Column | Type | Notes |
|---|---|---|
| id | String (UUID) | PK |
| scenario_id | String | nullable — **design inconsistency**: `ReportCreate` accepts a *list* of scenario IDs but the `Report` row only has a single `scenario_id` column. Currently the backend doesn't even populate this field on multi-scenario reports. See Section 9, gap #2. |
| format | String(10) | `pdf` / `html` / `json` |
| location | String(1024) | nullable — **never populated**; no file is actually written for a report today, regardless of which evidence storage backend is active. See Section 9, gap #1. |
| summary | String | auto-generated text, e.g. "Report with 30 evidence items from 2 scenarios" — **not AI-generated** despite the `include_ai_summary` flag existing in the request schema. See Section 9, gap #1. |
| evidence_count | Integer | |
| generated_by | String | nullable, no auth to populate it |
| generated_at | DateTime | auto |

### 6.5 `audit_log`
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
| POST | `/evidence/` | `EvidenceCreate` (generic) | `EvidenceResponse` | low-level; direct DB insert, no storage backend involved |
| POST | `/evidence/upload-screenshot/` | multipart form: `scenario_id`, `step_id` (as query params, **not** form fields — see gotcha below), `file` | `{status, evidence_id, filename, storage_backend}` 🆕 | routes the file through whichever `StorageBackend` is configured (Section 8.1); response now echoes back which backend actually handled it, which is useful for the test protocol in Section 10 |
| POST | `/evidence/db-query/` | `scenario_id`, `step_id`, `query`, `params`, `result` — **declared as individual FastAPI params, not a Pydantic body** (see Section 9, gap #6) | `{status, evidence_id, rows}` | |
| POST | `/evidence/payment/` | `scenario_id`, `step_id`, `payment_data: dict` | `{status, evidence_id, transaction_id}` | |
| GET | `/evidence/scenario/{scenario_id}` | — | `{scenario_id, evidence: {type: [{id, step_id, timestamp, location, storage_backend}]}}` 🆕 | grouped by type; `storage_backend` added per item so a client knows how to fetch the underlying bytes |
| **🆕** GET | `/config` | — | `{"database_dialect": "sqlite"\|"postgresql"\|"oracle", "storage_backend": "filesystem"\|"s3"\|"database"}` | new diagnostic endpoint — lets a client (or a test script) confirm which backends are actually active without inspecting environment variables directly. See Section 10.4. |

> **Gotcha for the frontend/client:** `upload_screenshot` in
> `teap-backend-complete.py` declares `scenario_id: str` and `step_id: int` as plain
> function parameters alongside `file: UploadFile = File(...)`. FastAPI will treat
> `scenario_id`/`step_id` as **query parameters**, not form fields, unless the
> multipart client sends them as query string. `teap-frontend-wired.jsx`'s
> `TEAPApi.uploadScreenshot` already handles this correctly by appending them to the
> URL as query params AND to the FormData (belt-and-suspenders) — do not change one
> side without checking the other. This gotcha is unaffected by which storage
> backend is configured; it's purely about how FastAPI parses the request.

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
- `GET /config` 🆕 → see Evidence table above; add this alongside `/health` when
  implementing Gap #12/#13, it's the cheapest possible way to verify a deployment's
  configuration without reading its environment variables directly

---

## 8. Snapshot / Evidence Generation — The Core Mechanism

This is the most important section if the ask is "how do I generate a snapshot."
There is **no single "generate snapshot" button that magically screenshots
anything** — TEAP works by having the *test itself* hand over evidence it already
has in memory at the moment it has it. Below is the exact mechanism per evidence
type, end to end.

### 8.1 Screenshot (UI evidence) 🆕 now storage-backend-aware

**Where the screenshot comes from:** Playwright's own `page.screenshot()` API
(or Selenium's `driver.get_screenshot_as_png()`). TEAP does not drive the browser —
the test framework does. TEAP only receives and stores the resulting image buffer.

**Two transport paths — pick one per integration (unchanged from v1.0):**

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

**🆕 What happens on the backend — now routed through a pluggable `StorageBackend`
instead of hardcoded S3.** This is new in v1.1; `teap-backend-complete.py` does not
yet contain this abstraction (Gap #12). Reference implementation:

```python
import os
import base64
import aiofiles
from pathlib import Path
from abc import ABC, abstractmethod

class StorageBackend(ABC):
    """Every backend implements the same two operations: save bytes, load bytes.
    The Evidence row's storage_backend column records which implementation wrote
    it, so retrieval always knows which one to use — even if the deployment's
    configuration changes later (old rows keep working)."""

    @abstractmethod
    async def save(self, key: str, data: bytes, content_type: str) -> dict:
        """Returns {"location": str|None, "storage_backend": str, "blob_data": str|None}
        ready to be written straight into an Evidence row."""

    @abstractmethod
    async def load(self, evidence_row) -> bytes:
        """Given an Evidence row (with .location, .storage_backend, .blob_data),
        return the raw bytes."""


class FilesystemStorageBackend(StorageBackend):
    """DEFAULT backend. No external service required."""

    def __init__(self, root: str = None):
        self.root = Path(root or os.getenv("EVIDENCE_STORAGE_PATH", "./evidence_storage"))

    async def save(self, key, data, content_type):
        path = self.root / key
        path.parent.mkdir(parents=True, exist_ok=True)
        async with aiofiles.open(path, "wb") as f:
            await f.write(data)
        return {"location": str(path), "storage_backend": "filesystem", "blob_data": None}

    async def load(self, evidence_row):
        async with aiofiles.open(evidence_row.location, "rb") as f:
            return await f.read()


class S3StorageBackend(StorageBackend):
    """Existing v1.0 behavior, now one of three options instead of the only one."""

    async def save(self, key, data, content_type):
        await S3Service.upload_file(key, data, content_type)  # existing helper, unchanged
        return {"location": key, "storage_backend": "s3", "blob_data": None}

    async def load(self, evidence_row):
        obj = s3_client.get_object(Bucket=S3_BUCKET, Key=evidence_row.location)
        return obj["Body"].read()


class DatabaseStorageBackend(StorageBackend):
    """Stores the screenshot bytes inline in the evidence table itself, base64-
    encoded into the Text column `blob_data`. Base64-as-Text (not a native
    LargeBinary/bytea/BLOB column) is used deliberately: it's the one binary
    representation that round-trips identically across SQLite, Postgres, and
    Oracle without dialect-specific column types. Tradeoff: ~33% size overhead
    from base64 encoding, and it bloats the database file — acceptable for the
    'single portable file' use case (SQLite + database backend = one .db file
    holds everything), not recommended for high screenshot volume."""

    async def save(self, key, data, content_type):
        encoded = base64.b64encode(data).decode("ascii")
        return {"location": None, "storage_backend": "database", "blob_data": encoded}

    async def load(self, evidence_row):
        return base64.b64decode(evidence_row.blob_data)


def get_storage_backend() -> StorageBackend:
    """Single factory function — call this instead of instantiating a backend
    directly anywhere else in the codebase, so switching the default later only
    requires changing this one function."""
    backend = os.getenv("EVIDENCE_STORAGE_BACKEND", "filesystem").lower()
    if backend == "s3":
        return S3StorageBackend()
    if backend == "database":
        return DatabaseStorageBackend()
    if backend == "filesystem":
        return FilesystemStorageBackend()
    raise ValueError(
        f"Unknown EVIDENCE_STORAGE_BACKEND={backend!r}; expected filesystem, s3, or database"
    )
```

**Updated `EvidenceCollector.capture_screenshot`** (replaces the v1.0 version that
called `S3Service.upload_file` directly):

```python
class EvidenceCollector:
    @staticmethod
    async def capture_screenshot(db, scenario_id, step_id, image_data, context=None):
        key = f"scenarios/{scenario_id}/step_{step_id}/{datetime.utcnow().isoformat()}.png"

        storage = get_storage_backend()
        result = await storage.save(key, image_data, "image/png")

        evidence = Evidence(
            scenario_id=scenario_id,
            step_id=step_id,
            type=EvidenceType.SCREENSHOT,
            location=result["location"],
            storage_backend=result["storage_backend"],
            blob_data=result["blob_data"],
            context=context or {}
        )
        db.add(evidence)
        await db.commit()
        await db.refresh(evidence)
        logger.info(f"Screenshot captured via {result['storage_backend']}: {scenario_id}/step_{step_id}")
        return evidence
```

**How to retrieve it later:** call `storage.load(evidence_row)` — using
`get_storage_backend()` if you know the *current* configured backend, or (more
correctly) a backend instantiated based on `evidence_row.storage_backend`, since a
deployment's configuration may have changed since that row was written:

```python
def get_storage_backend_for(evidence_row) -> StorageBackend:
    """Use this for retrieval, not get_storage_backend() — a row written under
    an old configuration must still be readable after the env var changes."""
    mapping = {
        "filesystem": FilesystemStorageBackend,
        "s3": S3StorageBackend,
        "database": DatabaseStorageBackend,
    }
    return mapping[evidence_row.storage_backend]()
```

There is still **no HTTP route** that exposes this to a browser (no
`GET /evidence/{id}/download`) — that remains Gap #7, now updated to cover all
three backends instead of just S3.

### 8.2 Database query snapshot ("database screenshot")

There is no literal screenshot of a database GUI. The equivalent evidence is the
**exact query, its parameters, and its result set**, captured as JSON — which is
actually stronger evidence than a screenshot (it's machine-verifiable, not just
visual). This evidence type is unaffected by which storage backend is configured
(it never uses `StorageBackend` — it only ever uses the `content` JSON column) but
**is** affected by which database is configured, per the SQLite JSON-emulation
caveat in Section 6.0.

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
`type=DB_QUERY`, `storage_backend=null` (this type never has binary data, so the
storage backend column stays empty for it).

### 8.3 Payment event snapshot

Two ways to capture, depending on whether you can intercept the test's own network
call or need to listen for a webhook. Unaffected by storage/database backend choice
beyond the general DB caveats in Section 6.0.

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
system): render an actual PDF/HTML file from the evidence, upload it to S3 (or
write it to filesystem/database per the same pluggable `StorageBackend` used for
screenshots — the reference `ReportGenerator` code in
`TEAP_Technical_Architecture.md` predates the storage abstraction and only knows
about S3; when porting it in, route its output bytes through
`get_storage_backend().save(...)` too, so a report generated under a
filesystem-only or SQLite-only deployment doesn't suddenly require S3), or populate
`Report.location`. See Section 9, gap #1.

---

## 9. Implementation Status — What's Real vs. Stubbed

Read this before telling anyone a feature "works." Ordered roughly by impact.

### Gap #1 — Report generation doesn't produce a file (HIGH IMPACT)
`ReportService.generate_report` in `teap-backend-complete.py` only writes a `Report`
row with a count and a templated summary string. It never renders PDF/HTML/JSON and
never uploads/writes anything anywhere, so `Report.location` is always `null` and
there is no way for a user to actually download a report.

**Reference implementation exists** in `TEAP_Technical_Architecture.md` Section 3.3
(`ReportGenerator` class) — it has working `reportlab`-based PDF generation and
Jinja2-based HTML generation. **To close this gap:** port that class's
`generate_pdf_report`/`generate_html_report` methods into
`ReportService.generate_report`, route the rendered bytes through
`get_storage_backend().save(...)` (Section 8.1's abstraction — don't call
`S3Service.upload_file` directly, or reports will break under filesystem/database
storage configs), and set `Report.location`/`storage_backend` accordingly. Also add
`GET /api/reports/{id}/download` that dispatches on `storage_backend` the same way
Section 8.1's `get_storage_backend_for()` does.

The `include_ai_summary` flag is accepted by the API but never calls an LLM —
wire it to `TEAP_Technical_Architecture.md` Section 3.3's
`_generate_ai_summary` method (uses the Anthropic SDK) if a real summary is wanted.

### Gap #2 — Report ↔ Scenario relationship is inconsistent (MEDIUM)
`ReportCreate.scenario_ids` is a list, but the `Report` table has a single nullable
`scenario_id` column, currently never populated. Fix: add a `report_scenarios`
join table (`report_id`, `scenario_id`) for a proper many-to-many, or at minimum
store the list in the existing `Report` model via a new JSON column:
`Report.scenario_ids: Column(JSON)`.

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

### Gap #7 — No download URL for stored screenshots (MEDIUM) 🆕 now spans 3 backends
`Evidence.location`/`storage_backend`/`blob_data` together describe where a
screenshot's bytes live, but there is no route that turns that into something a
browser can load. Section 8.1's `get_storage_backend_for(evidence_row)` gives the
retrieval logic; wrap it in a route:
```python
@app.get("/api/evidence/{evidence_id}/download")
async def download_evidence(evidence_id: str, db: AsyncSession = Depends(get_db)):
    evidence = await db.get(Evidence, evidence_id)
    if not evidence or evidence.type != EvidenceType.SCREENSHOT:
        raise HTTPException(404, "Not found")
    backend = get_storage_backend_for(evidence)
    data = await backend.load(evidence)
    return Response(content=data, media_type="image/png")
```
This is the single fix that also makes the Evidence tab in
`teap-frontend-wired.jsx` able to actually render screenshot thumbnails instead of
just metadata — currently a real, user-visible gap.

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

### 🆕 Gap #12 — Pluggable evidence storage backend is spec'd, not implemented (HIGH — this is the feature just requested)
Section 8.1 gives complete reference code (`StorageBackend` ABC,
`FilesystemStorageBackend`, `S3StorageBackend`, `DatabaseStorageBackend`,
`get_storage_backend()`, `get_storage_backend_for()`) and the two new `Evidence`
columns (`storage_backend`, `blob_data`) it depends on. **None of this exists yet
in `teap-backend-complete.py`**, which still calls `S3Service.upload_file`
directly and unconditionally inside `EvidenceCollector.capture_screenshot`. To
close:
1. Add `storage_backend` and `blob_data` columns to the `Evidence` model (Section 6.3)
2. Add the `StorageBackend` classes and factory functions (Section 8.1) to
   `teap-backend-complete.py`, e.g. in a new `services/storage.py`
3. Update `EvidenceCollector.capture_screenshot` to use `get_storage_backend()`
   instead of calling `S3Service` directly (Section 8.1)
4. Add `aiofiles` to `backend-requirements.txt` (needed for
   `FilesystemStorageBackend`)
5. Update `docker-compose-complete.yml`/`backend-Dockerfile` to mount/create an
   `EVIDENCE_STORAGE_PATH` volume for the filesystem backend, and make MinIO
   optional rather than a hard dependency
6. Add the `GET /config` diagnostic route (Section 7) and the download route
   (Gap #7) since both are needed to actually test this end-to-end (Section 10.4)

### 🆕 Gap #13 — Pluggable database backend (SQLite default) is spec'd, not implemented (HIGH — this is the other feature just requested)
Section 6.0 gives the exact `DATABASE_URL` formats for SQLite/Postgres/Oracle and
the dialect-aware engine-creation code. **None of this exists yet** —
`teap-backend-complete.py` currently hardcodes a Postgres-style default:
`DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://teap:teap@localhost:5432/teap")`
(note also that this default string uses the *sync* `postgresql://` scheme, not
`postgresql+asyncpg://`, which is itself a latent bug independent of this gap — the
async engine would fail against that exact default string if `DATABASE_URL` were
ever actually left unset in the current code). To close:
1. Change the default to `sqlite+aiosqlite:///./teap.db` per Section 6.0
2. Add the `_engine_kwargs()` dialect-detection function (Section 6.0) and use it
   when calling `create_async_engine`
3. Add `aiosqlite` to `backend-requirements.txt` (currently only `asyncpg` and
   `psycopg2-binary` are listed — neither supports SQLite); optionally add
   `oracledb` if Oracle support is being tested
4. If Alembic is introduced (referenced as a possibility in
   `SETUP_AND_DEV_GUIDE.md` but not actually present yet), configure
   `render_as_batch=True` for SQLite migrations per the Section 6.0 caveat
5. Verify with Section 10.4's new backend-matrix tests

### What IS fully working end-to-end today
- Scenario CRUD (create/list/get/update/delete), including cascade delete of
  evidence and audit logging of the create/update/delete actions
- Screenshot capture via REST multipart upload → S3 storage → DB row (Section 8.1,
  Path A) — verified against the actual route signature. **Still S3-only and
  Postgres-only until Gap #12/#13 are closed** — the pluggable versions are spec'd
  but not live.
- Payment event capture via `POST /api/evidence/payment/` (Section 8.3, Path A)
- DB query evidence capture **once Gap #6 is fixed**
- `GET /api/evidence/scenario/{id}` grouped retrieval
- Report row creation with accurate evidence counts (just not a downloadable file —
  Gap #1)
- Frontend ↔ backend wiring for all of the above (`teap-frontend-wired.jsx`), with
  real loading states, error banners with retry, and success toasts

---

## 10. Testing Protocol

Use this section to verify claims, not just read them. Four layers: backend unit,
API contract (manual or scripted), frontend manual walkthrough, and (🆕) a
storage/database backend matrix.

### 10.1 Environment setup for testing

**Full environment (Postgres + S3/MinIO, matches v1.0 behavior):**
```bash
docker-compose -f docker-compose-complete.yml up -d
docker-compose ps            # all services should show healthy
curl http://localhost:8000/health   # {"status":"ok","service":"TEAP API"}
```

**🆕 Zero-dependency environment (once Gap #12/#13 are closed):**
```bash
cd backend
unset DATABASE_URL EVIDENCE_STORAGE_BACKEND   # confirm nothing is set
uvicorn src.main:app --reload
curl http://localhost:8000/config
# Expect: {"database_dialect": "sqlite", "storage_backend": "filesystem"}
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
Expect: HTTP 200, `{"status":"uploaded","evidence_id":"<uuid>","filename":"any.png","storage_backend":"<whichever is configured>"}`.

Then verify it actually landed, **per configured backend**:
```bash
# storage_backend=s3
docker exec <minio-container> mc ls minio/teap-evidence/scenarios/$SCENARIO_ID/step_1/

# storage_backend=filesystem
ls -la ./evidence_storage/scenarios/$SCENARIO_ID/step_1/

# storage_backend=database — no filesystem/S3 check; instead confirm blob_data is populated:
# (see Test 3b below)
```

**🆕 Test 3b — confirm database-backend storage populated `blob_data` (only run if `EVIDENCE_STORAGE_BACKEND=database`)**
```bash
curl -s http://localhost:8000/api/evidence/scenario/$SCENARIO_ID | python3 -c \
  "import json,sys; d=json.load(sys.stdin); item=d['evidence']['screenshot'][0]; \
   assert item.get('storage_backend')=='database'; print('OK — storage_backend correctly reported as database')"
```
(Note: `blob_data` itself is intentionally **not** included in the `GET
/evidence/scenario/{id}` grouped response shown in Section 7 — it would bloat that
payload for every listing call. Fetch it via the download route from Gap #7 if you
need the actual bytes.)

**Test 4 — retrieve evidence for the scenario**
```bash
curl -s http://localhost:8000/api/evidence/scenario/$SCENARIO_ID
```
Expect: `{"scenario_id": "...", "evidence": {"screenshot": [{...}]}}` with exactly
one item under `screenshot`, and (once Gap #12 is closed) a `storage_backend` field
on that item matching whatever `EVIDENCE_STORAGE_BACKEND` was set to.

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
— if you've implemented the fix, expect a non-null location here instead, whose
format depends on the active storage backend per Section 6.3's table).

**Test 8 — cascade delete**
```bash
curl -s -X DELETE http://localhost:8000/api/scenarios/$SCENARIO_ID
curl -s http://localhost:8000/api/evidence/scenario/$SCENARIO_ID
```
Expect: delete returns `{"status":"deleted"}`; the evidence lookup afterward
returns an empty `evidence: {}` object (rows cascade-deleted). **Note:** cascade
delete removes the *database row* regardless of storage backend, but currently
**does not** delete the underlying file/S3 object/blob — that's an additional gap
worth tracking if it matters for your use case (not numbered above since it's a
consequence of Gap #12, not independent of it; fold its fix into the same PR that
closes Gap #12).

### 10.3 Frontend manual walkthrough (`teap-frontend-wired.jsx`)
1. Start backend (`docker-compose up -d`, or the zero-dependency mode from 10.1),
   confirm `curl localhost:8000/health` OK
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

### 10.4 🆕 Storage/database backend matrix

Once Gap #12 and #13 are closed, run the **full Section 10.2 test sequence once per
row** of this matrix before considering either gap actually closed — a fix that
only works for one combination isn't done:

| # | `DATABASE_URL` | `EVIDENCE_STORAGE_BACKEND` | Required infra | Priority |
|---|---|---|---|---|
| 1 | unset (→ SQLite default) | unset (→ filesystem default) | none | **Must pass** — this is the zero-dependency mode, the whole point of this feature |
| 2 | unset (→ SQLite default) | `s3` | MinIO only | Should pass |
| 3 | unset (→ SQLite default) | `database` | none | Should pass — exercises `blob_data`/base64 path |
| 4 | `postgresql+asyncpg://...` | unset (→ filesystem default) | Postgres only | Should pass |
| 5 | `postgresql+asyncpg://...` | `s3` | Postgres + MinIO | **Must pass** — this is the v1.0-equivalent "full" configuration, must not have regressed |
| 6 | `oracle+oracledb://...` | any | Oracle instance | Nice-to-have — treat as manual/optional given Oracle's setup cost and the driver's newer async support (Section 6.0 caveat); don't block a release on this row alone |

For each row: run `GET /config` first to confirm the backend actually reports what
you expect (this catches "the env var was typo'd and it silently fell back to the
default" mistakes), then run Section 10.2 Tests 1–8.

### 10.5 Acceptance checklist (copy this into a PR description when closing gaps)
- [ ] `docker-compose ps` shows all services healthy (for rows in the matrix that
      need Docker services)
- [ ] Tests 1–8 in Section 10.2 all pass with the responses described
- [ ] Frontend walkthrough Section 10.3 steps 1–6 all behave as described
- [ ] **(if closing Gap #12 or #13)** Section 10.4's matrix rows relevant to your
      change all pass — at minimum rows 1 and 5
- [ ] Any gap closed from Section 9 has its status updated in this document (don't
      leave stale gap descriptions — a gap that's fixed and still listed as open is
      worse than no documentation at all)

---

## 11. Extension Guide — How to Add Things Correctly

**Adding a new evidence type:**
1. Add the value to `EvidenceType` enum in `teap-backend-complete.py`
2. Add an `EvidenceCollector.capture_<type>` static method following the exact
   pattern of `capture_payment_event` (build a `content` dict, insert an `Evidence`
   row, commit, log, return) — or, if it carries binary data, follow
   `capture_screenshot`'s pattern instead (route through `get_storage_backend()`)
3. Add a thin route in the evidence routes section that accepts a Pydantic request
   body (not bare params — see Gap #6 as the cautionary example) and calls the new
   collector method
4. Add an icon/label mapping entry in `teap-frontend-wired.jsx`'s `typeIcon` object
   (in `EvidenceTab`) so it renders sensibly instead of falling back to the generic
   `📄` icon

**🆕 Adding a new evidence storage backend (beyond filesystem/s3/database):**
1. Subclass `StorageBackend` (Section 8.1), implement `save()` and `load()`
2. Register it in `get_storage_backend()`'s if/elif chain
3. Add its required config env vars (following `EVIDENCE_STORAGE_PATH`'s pattern)
   and document them in Section 6.0/5's config tables in this document
4. Add a row to the Section 10.4 test matrix
5. No other file needs to change — this is the entire point of the abstraction

**🆕 Adding a new database dialect (beyond sqlite/postgres/oracle):**
1. Confirm SQLAlchemy has an async driver for it (this is the actual constraint —
   not every database has an async DBAPI driver available)
2. Add its `DATABASE_URL` format to the Section 6.0 table
3. Add any dialect-specific tuning to `_engine_kwargs()` (Section 6.0) — SQLite
   needed `NullPool`; your new dialect may or may not need something analogous
4. Add its driver package to `backend-requirements.txt`
5. Add a row to the Section 10.4 test matrix
6. Application code (models, routes, services) needs **zero changes** — that's the
   value of using SQLAlchemy's dialect-agnostic `JSON`/`Enum`/`String` column types
   throughout rather than Postgres-specific types like `JSONB`

**Closing Gap #1 (report file generation) — recommended order of operations:**
1. Port `ReportGenerator.generate_pdf_report` and `generate_html_report` from
   `TEAP_Technical_Architecture.md` Section 3.3 into `ReportService` in
   `teap-backend-complete.py`
2. Have them call `get_storage_backend().save(...)` (Section 8.1) — **not**
   `S3Service.upload_file` directly, or reports will silently require S3 even in a
   filesystem/database-configured deployment
3. Set `Report.location`/`storage_backend` from the result
4. Add `GET /api/reports/{id}/download` — dispatch on `storage_backend` the same
   way Gap #7's evidence-download route does
5. Update `teap-frontend-wired.jsx`'s `ReportsTab` to render an actual `<a>`
   download link once `location` is non-null in the response
6. Verify with Section 10.2 Test 7, across at least matrix rows 1 and 5 from
   Section 10.4

**Coding conventions already established — follow them:**
- Backend: async everywhere (`async def`, `AsyncSession`), Pydantic models for every
  non-trivial request body, service classes as `@staticmethod` collections (not
  instantiated) — **except** the new `StorageBackend` classes, which *are*
  instantiated (one instance per request via the factory function) since they hold
  configuration (e.g. `FilesystemStorageBackend.root`) — don't make them static
  methods, follow the ABC pattern shown in Section 8.1. Structured logging via
  `logger.info(...)` on every write operation. Dialect-agnostic column types only
  (`JSON`, `Enum`, `String`, `Text`) — never reach for a Postgres-specific type like
  `JSONB` or `ARRAY`, since that would silently break the SQLite/Oracle paths.
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
| 1 | **This file (`SKILL.md`, v1.1)** | Start here — full context, including the pluggable storage/database spec |
| 2 | `teap-backend-complete.py` | The actual backend source — models, routes, services. **Still hardcodes Postgres+S3** as of this writing; Gap #12/#13 describe exactly what to change |
| 3 | `teap-frontend-wired.jsx` | The actual frontend source, wired to the real API |
| 4 | `docker-compose-complete.yml` | Local environment — Postgres, MinIO, Redis, Adminer, both services. Now optional for local dev once Gap #12/#13 close (SQLite + filesystem mode needs none of it) but still the recommended path for team use |
| 5 | `backend-requirements.txt` | Python dependencies — needs `aiosqlite` and `aiofiles` added, `oracledb` optionally added, to support this document's v1.1 spec (not yet added — part of Gap #12/#13) |
| 6 | `backend-Dockerfile`, `frontend-Dockerfile` | Container builds |
| 7 | `TEAP_Technical_Architecture.md` | Original design doc — contains the reference `ReportGenerator` (PDF/HTML rendering) implementation needed to close Gap #1, and the Stripe webhook receiver needed to close Gap #3. Treat as a reference/parts bin, not as a description of current backend behavior — it predates both `teap-backend-complete.py` and this document's v1.1 storage/database abstraction, so its S3-only code samples need the Section 8.1 adaptation described in Gap #1's fix steps before being ported in |
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
- **🆕 StorageBackend** — the pluggable abstraction (Section 8.1) that decides
  *where* a screenshot's bytes physically live: `filesystem` (local disk,
  default), `s3` (AWS S3 or MinIO), or `database` (inline base64 in the `evidence`
  table's `blob_data` column). Selected per-deployment via the
  `EVIDENCE_STORAGE_BACKEND` environment variable; recorded per-row via
  `Evidence.storage_backend` so old rows remain readable after the deployment's
  configuration changes.
- **🆕 Database dialect** — which SQL database engine TEAP's metadata (scenarios,
  steps, evidence rows, reports, audit log) is stored in: `sqlite` (default,
  zero-config), `postgresql`, or `oracle`. Selected via the `DATABASE_URL`
  environment variable's scheme; SQLAlchemy resolves the rest. Independent of
  `StorageBackend` — the two can be mixed freely (Section 4).

---

*End of document. If you are an LLM continuing this build: re-read Section 9 before
claiming any feature is complete, and run the relevant Section 10 test before
claiming any fix works. Gap #12 and Gap #13 are the two features most recently
added to this spec (v1.1) — they are the most likely next things to be asked about,
and are currently the least implemented (fully spec'd, zero code written).*
