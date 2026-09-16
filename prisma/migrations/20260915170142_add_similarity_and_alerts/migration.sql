-- CreateTable
CREATE TABLE "duplicate_evidence_alerts" (
    "alert_id" VARCHAR(36) NOT NULL,
    "new_evidence_id" VARCHAR(36) NOT NULL,
    "matched_evidence_id" VARCHAR(36) NOT NULL,
    "match_type" VARCHAR(50) NOT NULL,
    "case_id_new" VARCHAR(36) NOT NULL,
    "case_id_existing" VARCHAR(36) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duplicate_evidence_alerts_pkey" PRIMARY KEY ("alert_id")
);

-- CreateTable
CREATE TABLE "case_similarity_cache" (
    "cache_id" VARCHAR(36) NOT NULL,
    "case_id_a" VARCHAR(36) NOT NULL,
    "case_id_b" VARCHAR(36) NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "breakdown_json" TEXT NOT NULL,
    "computed_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_similarity_cache_pkey" PRIMARY KEY ("cache_id")
);

-- CreateIndex
CREATE INDEX "duplicate_evidence_alerts_case_id_new_idx" ON "duplicate_evidence_alerts"("case_id_new");

-- CreateIndex
CREATE INDEX "duplicate_evidence_alerts_case_id_existing_idx" ON "duplicate_evidence_alerts"("case_id_existing");

-- CreateIndex
CREATE INDEX "duplicate_evidence_alerts_new_evidence_id_idx" ON "duplicate_evidence_alerts"("new_evidence_id");

-- CreateIndex
CREATE INDEX "duplicate_evidence_alerts_matched_evidence_id_idx" ON "duplicate_evidence_alerts"("matched_evidence_id");

-- CreateIndex
CREATE INDEX "case_similarity_cache_case_id_a_idx" ON "case_similarity_cache"("case_id_a");

-- CreateIndex
CREATE INDEX "case_similarity_cache_case_id_b_idx" ON "case_similarity_cache"("case_id_b");

-- CreateIndex
CREATE UNIQUE INDEX "case_similarity_cache_case_id_a_case_id_b_key" ON "case_similarity_cache"("case_id_a", "case_id_b");

-- CreateIndex
CREATE INDEX "digital_evidence_file_hash_sha256_idx" ON "digital_evidence"("file_hash_sha256");

-- CreateIndex
CREATE INDEX "digital_evidence_device_serial_idx" ON "digital_evidence"("device_serial");

-- AddForeignKey
ALTER TABLE "duplicate_evidence_alerts" ADD CONSTRAINT "duplicate_evidence_alerts_new_evidence_id_fkey" FOREIGN KEY ("new_evidence_id") REFERENCES "evidence"("evidence_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_evidence_alerts" ADD CONSTRAINT "duplicate_evidence_alerts_matched_evidence_id_fkey" FOREIGN KEY ("matched_evidence_id") REFERENCES "evidence"("evidence_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_evidence_alerts" ADD CONSTRAINT "duplicate_evidence_alerts_case_id_new_fkey" FOREIGN KEY ("case_id_new") REFERENCES "cases"("case_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_evidence_alerts" ADD CONSTRAINT "duplicate_evidence_alerts_case_id_existing_fkey" FOREIGN KEY ("case_id_existing") REFERENCES "cases"("case_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_similarity_cache" ADD CONSTRAINT "case_similarity_cache_case_id_a_fkey" FOREIGN KEY ("case_id_a") REFERENCES "cases"("case_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_similarity_cache" ADD CONSTRAINT "case_similarity_cache_case_id_b_fkey" FOREIGN KEY ("case_id_b") REFERENCES "cases"("case_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- TRIGGER 3 -- trg_duplicate_digital_evidence
-- Fires AFTER INSERT ON digital_evidence to detect duplicate hashes or serials
-- attached to DIFFERENT cases, inserting into duplicate_evidence_alerts.
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_duplicate_digital_evidence() RETURNS TRIGGER AS $$
DECLARE
    v_case_id_new VARCHAR(36);
    r RECORD;
BEGIN
    SELECT case_id INTO v_case_id_new FROM evidence WHERE evidence_id = NEW.evidence_id;

    IF v_case_id_new IS NULL THEN
        RETURN NEW;
    END IF;

    FOR r IN (
        SELECT de.evidence_id AS matched_evidence_id,
               e.case_id AS case_id_existing,
               CASE
                   WHEN de.file_hash_sha256 = NEW.file_hash_sha256 THEN 'file_hash_sha256'
                   ELSE 'device_serial'
               END AS match_type
        FROM digital_evidence de
        JOIN evidence e ON de.evidence_id = e.evidence_id
        WHERE de.evidence_id <> NEW.evidence_id
          AND e.case_id <> v_case_id_new
          AND (de.file_hash_sha256 = NEW.file_hash_sha256 OR de.device_serial = NEW.device_serial)
    ) LOOP
        INSERT INTO duplicate_evidence_alerts (
            alert_id,
            new_evidence_id,
            matched_evidence_id,
            match_type,
            case_id_new,
            case_id_existing,
            created_at
        ) VALUES (
            gen_random_uuid()::varchar(36),
            NEW.evidence_id,
            r.matched_evidence_id,
            r.match_type,
            v_case_id_new,
            r.case_id_existing,
            CURRENT_TIMESTAMP
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_duplicate_digital_evidence"
    AFTER INSERT ON "digital_evidence"
    FOR EACH ROW
    EXECUTE FUNCTION trg_duplicate_digital_evidence();
