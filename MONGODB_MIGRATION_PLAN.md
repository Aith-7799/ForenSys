# ForenSys — MongoDB migration plan

Objective: replace the PostgreSQL + Prisma backend with a MongoDB-backed stack,
keeping the current Express API surface and the existing seeded dataset.

Selected stack
- Database: MongoDB (Atlas is the reference managed option from Gravity Index)
- ODM: Mongoose 9.x for schema, relations, transactions, and Change Streams
- Dev/test DB: mongodb-memory-server for offline integration tests
- Env var: MONGODB_URI (replaces DATABASE_URL for the application layer)

What this task actually changes
This is not a config swap. The current app is tightly coupled to PostgreSQL:
- Prisma schema with `@db.VarChar(36)`, `@db.Decimal`, `@default(uuid())`
- PostgreSQL sequences (`seq_audit_id`)
- PostgreSQL triggers and functions:
  - `trg_audit_case_status`
  - `trg_prevent_closed_case_evid`
  - `trg_duplicate_digital_evidence`
  - `sp_change_case_status()`
- `$queryRaw` / `$executeRawUnsafe` usage in routes and seed
- Error handler that interprets Postgres error codes (`P2002`, `P2003`, `P2014`,
  `P2025`, `P0001`) and trigger messages

So the migration needs to rewrite:
1. Data layer
   - Mongoose models for officers, cases, evidence, physical/digital subtypes,
     custody logs, reports, duplicate alerts, and similarity cache
   - Relation strategy: explicit `_id` references instead of Prisma relations
   - Replace `DECIMAL` fields with numbers/strings as appropriate
   - Replace `seq_audit_id` with application-generated identifiers
2. Business rules that are currently in Postgres triggers
   - Status change audit trail for cases
   - Block evidence insertion into closed/archived cases
   - Duplicate digital evidence detection across cases
   - These become app-side enforcement per your preference
3. Query layer
   - Replace Prisma calls with Mongoose queries across:
     - auth, officers, cases, evidence, custody, reports, alerts, dashboard,
       similarity/correlation graph
4. Error handling
   - New MongoDB/Mongoose error mapping for duplicate keys, validation failures,
     missing documents, and app-enforced business rules
5. Seed script
   - Same demo dataset, inserted through Mongoose models and app-style status
     transitions where triggers previously did work
6. Infrastructure/config
   - `.env.example` and runtime wiring for `MONGODB_URI`
   - Remove/replace Prisma-specific scripts once the app no longer needs them
   - Keep the frontend untouched unless it depends on backend error shapes

Behaviors that must stay intact
- Role-based permissions and token-based auth
- Chain-of-custody holder computation from the latest transfer
- Case status lifecycle and audit attribution to the acting officer
- Duplicate digital evidence alerts across cases
- Similarity/correlation graph logic in `src/lib/similarity.ts` (it is currently
  DB-agnostic, but it uses Prisma types; those types need replacement)

Out of scope for this plan unless you ask for it
- Frontend changes
- Reintroducing triggers via MongoDB Change Streams
- Migrating existing Postgres data at runtime; the seed script is the intended
  dataset path here

Open decisions I still need from you
1. MongoDB provider
   - Use MongoDB Atlas, or run local/self-hosted MongoDB for now?
2. Identifier strategy
   - Keep the existing string IDs (`OFF-101`, `CASE-2024-01`, `EV-801`, `LOG-5001`)
     exactly as they are, or switch to MongoDB `_id` everywhere and map outward?
3. Decimal fields
   - How should `size_mb` and `score` be stored:
     - plain JavaScript numbers,
     - number with fixed precision in app code, or
     - string-valued decimals?
4. Case status audit trail storage
   - One document per status change in a dedicated collection, or embedded history
     on the case document?
5. Testing expectations
   - Do you want the existing smoke-test script to keep passing against the new
     backend with the same request/response contracts?

Next steps
- Confirm the decisions above
- Then implement in this order:
  1. MongoDB/Mongoose wiring and connection bootstrap
  2. Mongoose models + app-level business rules
  3. Route-by-route backend replacement
  4. New seed script
  5. Error-handling and validation updates
  6. Verification with smoke tests and a local/dev MongoDB instance
