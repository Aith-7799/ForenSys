-- ============================================================================
-- ForenSys init migration
-- ----------------------------------------------------------------------------
-- Generated from prisma/schema.prisma, then hand-extended with the parts Prisma
-- cannot express so the Postgres schema stays faithful to the Oracle 11g DDL in
-- docs/oracle-11g-reference.sql:
--   * CREATE SEQUENCE seq_audit_id (Oracle: CREATE SEQUENCE seq_audit_id ...)
--   * CHECK constraints (Oracle: CONSTRAINT chk_* CHECK (...))
--   * trg_audit_case_status       <- Oracle TRG_AUDIT_CASE_STATUS
--   * trg_prevent_closed_case_evid <- Oracle TRG_PREVENT_CLOSED_CASE_EVID
--   * sp_change_case_status()      <- replaces Oracle's USER pseudo-column for audit attribution
-- ============================================================================

-- Oracle: CREATE SEQUENCE seq_audit_id START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE "seq_audit_id" START WITH 1 INCREMENT BY 1;

-- CreateTable
CREATE TABLE "officers" (
    "officer_id" VARCHAR(36) NOT NULL,
    "badge_number" VARCHAR(50) NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "role" VARCHAR(50) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,

    CONSTRAINT "officers_pkey" PRIMARY KEY ("officer_id")
);

-- CreateTable
CREATE TABLE "cases" (
    "case_id" VARCHAR(36) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "incident_timestamp" TIMESTAMP(6) NOT NULL,
    "location_point" VARCHAR(100) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'open',
    "lead_officer_id" VARCHAR(36) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("case_id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "evidence_id" VARCHAR(36) NOT NULL,
    "case_id" VARCHAR(36) NOT NULL,
    "evidence_type" VARCHAR(50) NOT NULL,
    "collection_timestamp" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("evidence_id")
);

-- CreateTable
CREATE TABLE "physical_evidence" (
    "evidence_id" VARCHAR(36) NOT NULL,
    "storage_locker_number" VARCHAR(50) NOT NULL,
    "seal_number" VARCHAR(50) NOT NULL,
    "container_type" VARCHAR(50) NOT NULL,

    CONSTRAINT "physical_evidence_pkey" PRIMARY KEY ("evidence_id")
);

-- CreateTable
CREATE TABLE "digital_evidence" (
    "evidence_id" VARCHAR(36) NOT NULL,
    "file_hash_sha256" VARCHAR(64) NOT NULL,
    "media_type" VARCHAR(50) NOT NULL,
    "size_mb" DECIMAL(10,2) NOT NULL,
    "device_serial" VARCHAR(50) NOT NULL,

    CONSTRAINT "digital_evidence_pkey" PRIMARY KEY ("evidence_id")
);

-- CreateTable
CREATE TABLE "custody_log" (
    "log_id" VARCHAR(36) NOT NULL,
    "evidence_id" VARCHAR(36) NOT NULL,
    "released_by_id" VARCHAR(36) NOT NULL,
    "received_by_id" VARCHAR(36) NOT NULL,
    "transfer_timestamp" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mongo_doc_ref" TEXT,

    CONSTRAINT "custody_log_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "case_audit_log" (
    "audit_id" INTEGER NOT NULL DEFAULT nextval('seq_audit_id'::regclass),
    "case_id" VARCHAR(36) NOT NULL,
    "old_status" VARCHAR(50),
    "new_status" VARCHAR(50),
    "changed_by" VARCHAR(100) DEFAULT CURRENT_USER,
    "change_timestamp" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_audit_log_pkey" PRIMARY KEY ("audit_id")
);

-- CreateTable
CREATE TABLE "reports" (
    "report_id" VARCHAR(36) NOT NULL,
    "case_id" VARCHAR(36),
    "evidence_id" VARCHAR(36),
    "report_type" VARCHAR(50) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_path" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(127),
    "size_bytes" INTEGER,
    "uploaded_by_id" VARCHAR(36) NOT NULL,
    "uploaded_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("report_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "officers_badge_number_key" ON "officers"("badge_number");

-- CreateIndex
CREATE INDEX "cases_lead_officer_id_idx" ON "cases"("lead_officer_id");

-- CreateIndex
CREATE INDEX "cases_status_idx" ON "cases"("status");

-- CreateIndex
CREATE INDEX "evidence_case_id_idx" ON "evidence"("case_id");

-- CreateIndex
CREATE INDEX "custody_log_evidence_id_idx" ON "custody_log"("evidence_id");

-- CreateIndex
CREATE INDEX "custody_log_released_by_id_idx" ON "custody_log"("released_by_id");

-- CreateIndex
CREATE INDEX "custody_log_received_by_id_idx" ON "custody_log"("received_by_id");

-- CreateIndex
CREATE INDEX "case_audit_log_case_id_idx" ON "case_audit_log"("case_id");

-- CreateIndex
CREATE INDEX "reports_case_id_idx" ON "reports"("case_id");

-- CreateIndex
CREATE INDEX "reports_evidence_id_idx" ON "reports"("evidence_id");

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_lead_officer_id_fkey" FOREIGN KEY ("lead_officer_id") REFERENCES "officers"("officer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("case_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_evidence" ADD CONSTRAINT "physical_evidence_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("evidence_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_evidence" ADD CONSTRAINT "digital_evidence_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("evidence_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_log" ADD CONSTRAINT "custody_log_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("evidence_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_log" ADD CONSTRAINT "custody_log_released_by_id_fkey" FOREIGN KEY ("released_by_id") REFERENCES "officers"("officer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_log" ADD CONSTRAINT "custody_log_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "officers"("officer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("case_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("evidence_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "officers"("officer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- CHECK constraints -- the Postgres equivalent of Oracle's domain constraints.
-- Oracle used inline CHECKs; Postgres named them AFTER CREATE TABLE so the
-- constraint names match the original report (chk_officers_role, chk_cases_status,
-- chk_evidence_type, chk_digital_size).
-- ============================================================================

ALTER TABLE "officers"
    ADD CONSTRAINT "chk_officers_role"
    CHECK ("role" IN ('Investigating Officer', 'Lab Analyst', 'System Administrator', 'Judicial Authority'));

ALTER TABLE "cases"
    ADD CONSTRAINT "chk_cases_status"
    CHECK ("status" IN ('open', 'under_investigation', 'in_court', 'closed', 'archived'));

ALTER TABLE "evidence"
    ADD CONSTRAINT "chk_evidence_type"
    CHECK ("evidence_type" IN ('Weapon', 'Biological', 'Digital Device', 'Document', 'Clothing', 'Fingerprint', 'Other'));

ALTER TABLE "digital_evidence"
    ADD CONSTRAINT "chk_digital_size"
    CHECK ("size_mb" > 0);

ALTER TABLE "reports"
    ADD CONSTRAINT "chk_reports_type"
    CHECK ("report_type" IN ('Laboratory', 'Witness'));

-- A report must hang off a case, an evidence item, or both.
ALTER TABLE "reports"
    ADD CONSTRAINT "chk_reports_parent"
    CHECK ("case_id" IS NOT NULL OR "evidence_id" IS NOT NULL);

-- Tie the sequence to its column so it is dropped with the table (Oracle NEXTVAL parity).
ALTER SEQUENCE "seq_audit_id" OWNED BY "case_audit_log"."audit_id";

-- ============================================================================
-- TRIGGER 1 -- trg_audit_case_status
-- Oracle: TRG_AUDIT_CASE_STATUS (AFTER UPDATE OF status ON CASES).
--
-- Oracle attributed the change to the USER pseudo-column, which does not exist
-- in Postgres (CURRENT_USER is always the connecting role, i.e. "forensys", and
-- would be useless here). Instead the trigger reads the application identity out
-- of the app.current_user session setting, which sp_change_case_status() below
-- sets. If that setting is absent the trigger degrades gracefully to CURRENT_USER
-- -- exactly what the Oracle version did -- so raw SQL updates still produce an
-- audit row instead of failing.
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_audit_case_status() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO case_audit_log (case_id, old_status, new_status, changed_by, change_timestamp)
        VALUES (
            OLD.case_id,
            OLD.status,
            NEW.status,
            COALESCE(NULLIF(current_setting('app.current_user', true), ''), CURRENT_USER),
            CURRENT_TIMESTAMP
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_audit_case_status"
    AFTER UPDATE OF "status" ON "cases"
    FOR EACH ROW
    EXECUTE FUNCTION trg_audit_case_status();

-- ============================================================================
-- TRIGGER 2 -- trg_prevent_closed_case_evid
-- Oracle: TRG_PREVENT_CLOSED_CASE_EVID (BEFORE INSERT ON EVIDENCE) which raised
-- RAISE_APPLICATION_ERROR(-20001, ...) and (-20003, ...).
--
-- In Postgres RAISE_APPLICATION_ERROR maps to RAISE EXCEPTION with SQLSTATE
-- P0001 (the generic user-defined error code). Messages are kept byte-identical
-- to the Oracle originals so the API can surface them verbatim.
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_prevent_closed_case_evid() RETURNS TRIGGER AS $$
DECLARE
    v_status VARCHAR(50);
BEGIN
    SELECT status INTO v_status FROM cases WHERE case_id = NEW.case_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CANNOT INSERT EVIDENCE: Parent case does not exist.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_status IN ('closed', 'archived') THEN
        RAISE EXCEPTION 'CANNOT INSERT EVIDENCE: Case % is closed or archived.', NEW.case_id
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_prevent_closed_case_evid"
    BEFORE INSERT ON "evidence"
    FOR EACH ROW
    EXECUTE FUNCTION trg_prevent_closed_case_evid();

-- ============================================================================
-- sp_change_case_status() -- the ONLY supported way to change a case status.
--
-- This is the Postgres stand-in for Oracle's USER pseudo-column. It publishes the
-- acting officer into the transaction-local app.current_user setting and then
-- performs the UPDATE; trg_audit_case_status fires on that UPDATE and writes the
-- CASE_AUDIT_LOG row. No application code ever inserts audit rows itself.
-- set_config(..., true) is transaction-local, and a single function call runs
-- inside one implicit transaction, so the setting is guaranteed to still be set
-- when the UPDATE fires the AFTER trigger.
-- ============================================================================

CREATE OR REPLACE FUNCTION sp_change_case_status(
    p_case_id    VARCHAR(36),
    p_new_status VARCHAR(50),
    p_changed_by VARCHAR(100)
) RETURNS VOID AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM cases WHERE case_id = p_case_id) THEN
        RAISE EXCEPTION 'CASE NOT FOUND: %', p_case_id USING ERRCODE = 'P0001';
    END IF;

    PERFORM set_config('app.current_user', p_changed_by, true);

    UPDATE cases SET status = p_new_status WHERE case_id = p_case_id;
END;
$$ LANGUAGE plpgsql;
