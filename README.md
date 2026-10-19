# ForenSys — Digital Crime Scene Evidence & Investigation Management System

**Team:** [Advaith Anish](https://github.com/Aith-7799) · [Vidisha Jain](https://github.com/vidisha2508) · [Celaidon](https://github.com/Celaidon)

A full-stack implementation of the **ForenSys** design: the
Oracle 11g schema, PL/SQL procedures and triggers are ported to **PostgreSQL** and are being
migrated to **MongoDB**, wrapped in a Node/Express API with server-side role enforcement, and
surfaced in a React UI covering all seven use cases from the use-case diagram.

> **Original coursework artefacts**
> `docs/oracle-11g-reference.sql` preserves the source Oracle 11g DDL, DML, PL/SQL and queries
> **verbatim** for grading. Nothing in that file is executed by the application; it is the
> specification the Postgres implementation was translated from. The MongoDB migration is tracked
> separately and does not change those artefacts.

---

## Stack

| Layer     | Technology                                                    |
| --------- | ------------------------------------------------------------- |
| Database  | MongoDB (migration in progress; PostgreSQL/Prisma is current) |
| ODM       | Mongoose (planned replacement for Prisma)                      |
| Backend   | Node.js + Express 4 + TypeScript                              |
| Auth      | JWT access + refresh tokens, bcrypt password hashing          |
| Frontend  | React 18 + TypeScript + Vite 6 + Tailwind CSS 4 + React Router |
| Uploads   | Multer (disk storage)                                         |
| Tests     | Node smoke test (API) + Playwright E2E (browser, real Chrome) |

---

## Repository layout

```
ForenSys/
├── docker-compose.yml            # PostgreSQL 16 service (legacy; MongoDB migration planned)
├── .env / .env.example           # DATABASE_URL / MONGODB_URI, JWT secrets, upload config
├── docs/
│   └── oracle-11g-reference.sql  # ORIGINAL Oracle 11g source (verbatim, for grading)
├── prisma/
│   ├── schema.prisma             # Current PostgreSQL schema (being replaced by Mongoose models)
│   ├── migrations/               # init migration: tables + CHECKs + triggers + functions
│   └── seed.ts                   # sample dataset + bcrypt hashes
├── scripts/
│   └── smoke-test.mjs            # 60 API-level checks incl. role denials
├── src/                          # Express API
│   ├── lib/                      # env, prisma, errors, jwt, roles, validate, serialize
│   ├── middleware/               # auth (requireAuth/requirePermission), errors, upload
│   ├── routes/                   # auth, officers, cases, evidence, custody, reports, dashboard
│   ├── app.ts                    # route wiring
│   └── index.ts                  # server bootstrap
└── client/                       # React frontend
    ├── src/pages/                # one page per use case
    ├── src/components/           # Layout (role-gated nav), ProtectedRoute, shared UI
    ├── src/auth/, src/lib/       # session context, API client, permission mirror
    └── e2e/use-cases.e2e.mjs     # 60 browser checks across all four roles
```

---

## Quick start

**Prerequisites:** Node 18+, Docker Desktop running, Google Chrome (only for the optional E2E test).

```bash
# 1. Start PostgreSQL
docker compose up -d db

# 2. Configure environment
cp .env.example .env          # defaults already match docker-compose.yml

# 3. Install, migrate, seed
npm install
npx prisma migrate deploy     # or `npx prisma migrate dev` while developing
npm run seed

# 4. Run the API (terminal 1)
npm run dev                   # http://localhost:4000

# 5. Run the web app (terminal 2)
cd client && npm install && npm run dev   # http://localhost:5173
```

Open **http://localhost:5173** and sign in as any demo account below.

### Demo accounts

All seeded accounts share the password **`Forensys@123`** (bcrypt-hashed in the database — the
report's plaintext `hash_*` placeholders are replaced at seed time).

| Badge       | Name                 | Role                    |
| ----------- | -------------------- | ----------------------- |
| `BADGE-9081` | Det. Robert Vance    | Investigating Officer   |
| `BADGE-9082` | Dr. Sarah Connor     | Lab Analyst             |
| `BADGE-9083` | Admin Marcus Wright  | System Administrator    |
| `BADGE-9084` | Det. Elena Rostova   | Investigating Officer   |
| `BADGE-9085` | Judge Arthur Pendelton | Judicial Authority    |
| `BADGE-9086` | Dr. Alan Turing      | Lab Analyst             |

---

## Role-based access

Each of the seven ellipses in the use-case diagram maps to a permission in
`src/lib/roles.ts`, enforced by `requirePermission()` middleware on the server. The frontend
mirrors the same matrix (`client/src/lib/permissions.ts`) purely to hide navigation — hiding a
button is not a security control, and every blocked action returns a real `403` from the API.

| Use case                          | Investigating Officer | Lab Analyst | System Administrator | Judicial Authority |
| --------------------------------- | :-------------------: | :---------: | :------------------: | :----------------: |
| Authenticate User                 | ✅ | ✅ | ✅ | ✅ |
| Create Crime Report               | ✅ | — | — | — |
| Register Evidence Item            | ✅ | — | — | — |
| Log Chain of Custody              | ✅ | ✅ | — | — |
| Upload Laboratory & Witness Reports | — | ✅ | — | — |
| View Case Timeline                | ✅ | ✅ | ✅\* | ✅\* |
| View Analytics Dashboard          | — | — | ✅ | — |
| Manage Users                      | — | — | ✅ | — |
| Delete cases / evidence           | — | — | ✅ | — |

\* **Deliberate extension beyond the diagram.** The diagram joins "View Case Timeline" only to
Investigating Officer and Lab Analyst. System Administrator was added so an admin can drill into
a case from the dashboard, and Judicial Authority was added as a read-only observer, which is what
that role exists for. Both are read-only. Remove them from `VIEW_CASE_DATA` in `src/lib/roles.ts`
to match the diagram exactly.

---

## Features (1:1 with the use-case diagram)

1. **Authenticate User** — badge number + password login, bcrypt verification, JWT access token
   (15 min) and refresh token (7 days), silent refresh on `401`, logout, session restore.
2. **Create Crime Report** — registers a case document; the lead officer is auto-assigned to the
   signed-in officer (overridable), status defaults to `open`.
3. **Register Evidence Item** — form branches on `evidence_type`: `Digital Device` writes a
   digital-evidence document, every other category writes a physical-evidence document. Both
   branches are validated server-side and written together.
4. **Log Chain of Custody** — creates a custody-log document; the **current holder** is computed as
   the receiver of the most recent transfer and displayed before submitting. Transfers are
   rejected if the releasing officer is not the current holder, or if releaser = receiver.
5. **Upload Laboratory & Witness Reports** — multipart upload stored on disk with metadata in a
   report document (attached to a case, an evidence item, or both). Lab Analyst only.
6. **View Case Timeline** — per-case chronological feed merging case registration, evidence
   collection, custody transfers and status changes.
7. **View Analytics Dashboard** — Admin-only: cases by status, evidence by type, digital file size
   (avg/max/min/sum) by media type, officer workload, custody activity, and the `ROLLUP` cross-tab.

---

## Oracle 11g → PostgreSQL translation

| Oracle 11g                                   | PostgreSQL / Prisma                                            |
| -------------------------------------------- | -------------------------------------------------------------- |
| `VARCHAR2(n)`                                | `VARCHAR(n)`                                                    |
| `NUMBER(10,2)`                               | `DECIMAL(10,2)`                                                 |
| `NUMBER`                                     | `INTEGER`                                                       |
| `TIMESTAMP` / `DATE`                         | `TIMESTAMP(6)`                                                  |
| `VARCHAR2(36)` `*_id`                        | `VARCHAR(36)` UUIDs generated by the app (`@default(uuid())`)    |
| `CHECK (x IN (...))`                         | real `CHECK` constraints, same names (`chk_officers_role`, …)    |
| `CREATE SEQUENCE seq_audit_id`               | `CREATE SEQUENCE seq_audit_id` (kept, `OWNED BY` the column)     |
| `seq_audit_id.NEXTVAL`                       | `nextval('seq_audit_id')`                                       |
| `USER` pseudo-column                         | `current_setting('app.current_user', true)`, falling back to `CURRENT_USER` |
| `RAISE_APPLICATION_ERROR(-20001, msg)`       | `RAISE EXCEPTION … USING ERRCODE='P0001'`                       |
| `TRG_AUDIT_CASE_STATUS`                      | `trg_audit_case_status` trigger function                        |
| `TRG_PREVENT_CLOSED_CASE_EVID`               | `trg_prevent_closed_case_evid` trigger function                 |
| `NVL(a, b)`                                  | `COALESCE(a, b)`                                                |
| `GROUP BY ROLLUP(a, b)`                      | `GROUP BY ROLLUP(a, b)` (natively supported)                    |

All original constraint and trigger **names are preserved**, so the coursework artefacts line up
one-to-one with the running database.

### Added for the web app

- **`reports` table** — stores uploaded lab/witness report files (the original report had no
  storage for the "Upload Laboratory and Witness Reports" use case). `custody_log.mongo_doc_ref`
  points at a `report_id` when a custody transfer carries a report.
- **`custody_log.mongo_doc_ref` widened** from `VARCHAR2(24)` to `TEXT` so it can hold either an
  external document-store ObjectId or a report pointer.
- **`sp_change_case_status(case_id, new_status, changed_by)`** — replaces Oracle's `USER`
  pseudo-column, which has no Postgres equivalent (it would always return the connection role).
  The function publishes the acting officer into the transaction-local `app.current_user` setting
  and then performs the `UPDATE`. The **trigger still writes the audit row** — no application code
  inserts into `CASE_AUDIT_LOG`, exactly as intended.

---

## Business rules enforced in the database

**`trg_audit_case_status`** — `AFTER UPDATE OF status ON cases`. Writes a `CASE_AUDIT_LOG` row
whenever the status actually changes, attributing it to `app.current_user`. Case status is changed
only through `sp_change_case_status()`, so the attribution is always the real officer rather than
the Postgres login role.

**`trg_prevent_closed_case_evid`** — `BEFORE INSERT ON evidence`. Rejects evidence inserted into a
`closed` or `archived` case with the original message
`CANNOT INSERT EVIDENCE: Case <id> is closed or archived.` (Oracle's `ORA-20001` becomes SQLSTATE
`P0001`). The API surfaces this as a `409`.

> **A conflict inside the original report.** Section 3 of the report loads `EV-807` into
> `CASE-2024-05`, which it declares as `closed` — something its own trigger would forbid. In Oracle
> this never surfaced because the data (section 3) was inserted *before* the triggers (section 8)
> were created. Here the trigger is part of the migration and always present, so the seed loads that
> case as `open`, collects `EV-807`, then closes it through `sp_change_case_status()`. The rule is
> honoured and the closure appears in `CASE_AUDIT_LOG` as a genuine audited transition.
> 
> **Migration note.** These business rules currently live in PostgreSQL triggers and functions. Under
> MongoDB they are intended to be enforced in application code, mirroring the same behaviour.

---

## API reference

| Method   | Endpoint                              | Permission                     |
| -------- | ------------------------------------- | ------------------------------ |
| `POST`   | `/api/auth/login`                     | public                         |
| `POST`   | `/api/auth/refresh`                   | public (valid refresh token)   |
| `POST`   | `/api/auth/logout`                    | authenticated                  |
| `GET`    | `/api/auth/me`                        | authenticated                  |
| `GET`    | `/api/meta/permissions`               | public (software permission matrix) |
| `GET`    | `/api/officers`                       | authenticated                  |
| `POST`   | `/api/officers`                       | `MANAGE_USERS`                 |
| `PATCH`  | `/api/officers/:id`                   | `MANAGE_USERS`                 |
| `POST`   | `/api/officers/:id/password`          | `MANAGE_USERS`                 |
| `DELETE` | `/api/officers/:id`                   | `MANAGE_USERS`                 |
| `GET`    | `/api/cases`                          | `VIEW_CASE_DATA`               |
| `POST`   | `/api/cases`                          | `CREATE_CASE`                  |
| `GET`    | `/api/cases/:id`                      | `VIEW_CASE_DATA`               |
| `PATCH`  | `/api/cases/:id`                      | `CREATE_CASE`                  |
| `DELETE` | `/api/cases/:id`                      | `DELETE_RECORDS`               |
| `GET`    | `/api/cases/:id/timeline`             | `VIEW_CASE_DATA`               |
| `GET`    | `/api/cases/:id/evidence`             | `VIEW_CASE_DATA`               |
| `GET`    | `/api/evidence`                       | `VIEW_CASE_DATA`               |
| `POST`   | `/api/evidence`                       | `REGISTER_EVIDENCE`            |
| `GET`    | `/api/evidence/:id`                   | `VIEW_CASE_DATA`               |
| `DELETE` | `/api/evidence/:id`                   | `DELETE_RECORDS`               |
| `GET`    | `/api/custody`                        | `VIEW_CASE_DATA`               |
| `POST`   | `/api/custody`                        | `LOG_CUSTODY`                  |
| `GET`    | `/api/custody/holder/:evidenceId`     | `VIEW_CASE_DATA`               |
| `GET`    | `/api/reports`                        | `VIEW_CASE_DATA`               |
| `POST`   | `/api/reports`                        | `UPLOAD_REPORT`                |
| `GET`    | `/api/reports/:id/download`           | `VIEW_CASE_DATA`               |
| `DELETE` | `/api/reports/:id`                    | `UPLOAD_REPORT`                |
| `GET`    | `/api/dashboard/summary`              | `VIEW_DASHBOARD`               |
| `GET`    | `/api/dashboard/rollup`               | `VIEW_DASHBOARD`               |

---

## Verification

Both suites expect a seeded database and running servers.

### API checks — 60 assertions

```bash
npm run smoke          # or: node scripts/smoke-test.mjs
```

Covers all seven use cases plus: wrong password, unknown badge, refresh-token misuse, missing
token, validation failures, the closed-case evidence rule, custody holder consistency,
self-transfer, duplicate badge numbers, referring-integrity on officer deletion, and every
wrong-role denial.

### Browser checks — 60 assertions (real Chrome)

```bash
cd client && npm run e2e
```

Signs in as four different roles through the actual login form and walks each use case in the UI:
creating a case, registering physical **and** digital evidence, logging a custody transfer and
seeing the computed holder update, uploading a report, changing status and observing the
trigger-written audit row appear in the timeline, and reading the dashboard. Each wrong-role
attempt is checked twice — once through the route guard, and once by calling the API from inside
the page, which is what actually proves server-side enforcement.

> Playwright is configured to use the locally installed Chrome (`channel: 'chrome'`), so no
> browser download is required.

### Manual trigger verification

```bash
# Closed-case rule (expect: business_rule_violation / 409)
docker exec forensys-db psql -U forensys -d forensys -c \
  "INSERT INTO evidence (evidence_id, case_id, evidence_type, collection_timestamp)
   VALUES ('EV-FAIL-01','CASE-2024-05','Weapon',CURRENT_TIMESTAMP);"

# Audit trigger (expect: a new row attributed to the acting officer)
docker exec forensys-db psql -U forensys -d forensys -c \
  "SELECT sp_change_case_status('CASE-2024-02','in_court','Manual Test');"
docker exec forensys-db psql -U forensys -d forensys -c \
  "SELECT * FROM case_audit_log ORDER BY audit_id;"
```

---

## Configuration

| Variable                 | Default                                                          | Purpose                          |
| ------------------------ | ---------------------------------------------------------------- | -------------------------------- |
| `DATABASE_URL`           | `postgresql://forensys:forensys@localhost:5432/forensys?schema=public` | Current Prisma/PostgreSQL connection string    |
| `MONGODB_URI`            | —                                                                | Future MongoDB connection string (migration target) |
| `JWT_SECRET`             | —                                                                | Access-token signing key         |
| `JWT_EXPIRES_IN`         | `15m`                                                            | Access-token lifetime            |
| `JWT_REFRESH_SECRET`     | —                                                                | Refresh-token signing key        |
| `JWT_REFRESH_EXPIRES_IN` | `7d`                                                             | Refresh-token lifetime           |
| `PORT`                   | `4000`                                                           | API port                         |
| `CORS_ORIGIN`            | `http://localhost:5173`                                          | Allowed browser origins (comma-separated) |
| `UPLOAD_DIR`             | `uploads`                                                        | Report file storage directory    |
| `MAX_UPLOAD_MB`          | `25`                                                             | Upload size ceiling              |

---

## Notable implementation notes

- **bcrypt via `bcryptjs`** (pure JS) rather than the native `bcrypt` binding, which needs a
  compiler toolchain on Windows. The output is a standard bcrypt hash (`$2a$10$…`, 60 chars) and is
  fully compatible with `bcrypt`.
- **UUIDs are app-generated** (`crypto`/Prisma `@default(uuid())`) for every `*_id` in the current
  PostgreSQL schema. Seeded rows keep the report's human-readable ids (`OFF-101`,
  `CASE-2024-01`, `EV-801`, `LOG-5001`) so the dataset stays comparable to the coursework. The same
  identifiers are intended to be preserved during the MongoDB migration.
- **`CASE_AUDIT_LOG` has no foreign key to `CASES`** — deliberately, matching the Oracle schema, so
  the audit trail outlives a cascading case deletion. This is why it is not modelled as a Prisma
  relation.
- **Logout is stateless.** Tokens are short-lived and simply discarded client-side; the endpoint
  exists so the UI has one thing to call and a refresh-token denylist has a home later.
- **Demo credentials are listed on the login screen** for coursework convenience. A real deployment
  would not do this.
- **Repository description helper.** `.github_repo_description_update.sh` is a local convenience
  script for updating the GitHub repo description; it is not executed by the application.
