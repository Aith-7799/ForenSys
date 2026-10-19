-- =====================================================================
-- FORENSYS: Digital Crime Scene Evidence and Investigation Management System
-- Database Technology: Oracle Database 11g
-- File: forensys_oracle11g_clean.sql (Annotated with Screenshot Placeholders)
-- Instructions: Run the code blocks sequentially in Oracle 11g "Run SQL Command Line" 
-- or SQL*Plus, and capture screenshots at each marked screenshot placeholder!
-- =====================================================================

-- =====================================================================
-- [📸 SCREENSHOT 1 PLACEHOLDER: Table & Sequence Creation Output]
-- Action Required: Run DDL statements below. Capture screenshot showing "Table created." and "Sequence created."
-- =====================================================================

CREATE TABLE OFFICERS (
    officer_id VARCHAR2(36) NOT NULL,
    badge_number VARCHAR2(50) NOT NULL,
    full_name VARCHAR2(150) NOT NULL,
    role VARCHAR2(50) NOT NULL,
    password_hash VARCHAR2(255) NOT NULL,
    CONSTRAINT pk_officers PRIMARY KEY (officer_id),
    CONSTRAINT uk_officers_badge UNIQUE (badge_number),
    CONSTRAINT chk_officers_role CHECK (role IN ('Investigating Officer', 'Lab Analyst', 'System Administrator', 'Judicial Authority'))
);

CREATE TABLE CASES (
    case_id VARCHAR2(36) NOT NULL,
    title VARCHAR2(255) NOT NULL,
    incident_timestamp TIMESTAMP NOT NULL,
    location_point VARCHAR2(100) NOT NULL,
    status VARCHAR2(50) DEFAULT 'open' NOT NULL,
    lead_officer_id VARCHAR2(36) NOT NULL,
    CONSTRAINT pk_cases PRIMARY KEY (case_id),
    CONSTRAINT fk_cases_lead_officer FOREIGN KEY (lead_officer_id) REFERENCES OFFICERS(officer_id),
    CONSTRAINT chk_cases_status CHECK (status IN ('open', 'under_investigation', 'in_court', 'closed', 'archived'))
);

CREATE TABLE EVIDENCE (
    evidence_id VARCHAR2(36) NOT NULL,
    case_id VARCHAR2(36) NOT NULL,
    evidence_type VARCHAR2(50) NOT NULL,
    collection_timestamp TIMESTAMP NOT NULL,
    CONSTRAINT pk_evidence PRIMARY KEY (evidence_id),
    CONSTRAINT fk_evidence_case FOREIGN KEY (case_id) REFERENCES CASES(case_id) ON DELETE CASCADE,
    CONSTRAINT chk_evidence_type CHECK (evidence_type IN ('Weapon', 'Biological', 'Digital Device', 'Document', 'Clothing', 'Fingerprint', 'Other'))
);

CREATE TABLE PHYSICAL_EVIDENCE (
    evidence_id VARCHAR2(36) NOT NULL,
    storage_locker_number VARCHAR2(50) NOT NULL,
    seal_number VARCHAR2(50) NOT NULL,
    container_type VARCHAR2(50) NOT NULL,
    CONSTRAINT pk_physical_evidence PRIMARY KEY (evidence_id),
    CONSTRAINT fk_physical_evidence_ev FOREIGN KEY (evidence_id) REFERENCES EVIDENCE(evidence_id) ON DELETE CASCADE
);

CREATE TABLE DIGITAL_EVIDENCE (
    evidence_id VARCHAR2(36) NOT NULL,
    file_hash_sha256 VARCHAR2(64) NOT NULL,
    media_type VARCHAR2(50) NOT NULL,
    size_mb NUMBER(10, 2) NOT NULL,
    device_serial VARCHAR2(50) NOT NULL,
    CONSTRAINT pk_digital_evidence PRIMARY KEY (evidence_id),
    CONSTRAINT fk_digital_evidence_ev FOREIGN KEY (evidence_id) REFERENCES EVIDENCE(evidence_id) ON DELETE CASCADE,
    CONSTRAINT chk_digital_size CHECK (size_mb > 0)
);

CREATE TABLE CUSTODY_LOG (
    log_id VARCHAR2(36) NOT NULL,
    evidence_id VARCHAR2(36) NOT NULL,
    released_by_id VARCHAR2(36) NOT NULL,
    received_by_id VARCHAR2(36) NOT NULL,
    transfer_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    mongo_doc_ref VARCHAR2(24),
    CONSTRAINT pk_custody_log PRIMARY KEY (log_id),
    CONSTRAINT fk_custody_evidence FOREIGN KEY (evidence_id) REFERENCES EVIDENCE(evidence_id) ON DELETE CASCADE,
    CONSTRAINT fk_custody_released_by FOREIGN KEY (released_by_id) REFERENCES OFFICERS(officer_id),
    CONSTRAINT fk_custody_received_by FOREIGN KEY (received_by_id) REFERENCES OFFICERS(officer_id)
);

CREATE TABLE CASE_AUDIT_LOG (
    audit_id NUMBER NOT NULL,
    case_id VARCHAR2(36) NOT NULL,
    old_status VARCHAR2(50),
    new_status VARCHAR2(50),
    changed_by VARCHAR2(100) DEFAULT USER,
    change_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_case_audit_log PRIMARY KEY (audit_id)
);

CREATE SEQUENCE seq_audit_id START WITH 1 INCREMENT BY 1;

-- =====================================================================
-- [📸 SCREENSHOT 2 PLACEHOLDER: Data Insertion & Verification Output]
-- Action Required: Execute INSERT statements below and COMMIT. Capture screenshot showing "1 row created." and "Commit complete."
-- =====================================================================

INSERT INTO OFFICERS VALUES ('OFF-101', 'BADGE-9081', 'Det. Robert Vance', 'Investigating Officer', 'hash_vance_9081');
INSERT INTO OFFICERS VALUES ('OFF-102', 'BADGE-9082', 'Dr. Sarah Connor', 'Lab Analyst', 'hash_connor_9082');
INSERT INTO OFFICERS VALUES ('OFF-103', 'BADGE-9083', 'Admin Marcus Wright', 'System Administrator', 'hash_wright_9083');
INSERT INTO OFFICERS VALUES ('OFF-104', 'BADGE-9084', 'Det. Elena Rostova', 'Investigating Officer', 'hash_rostova_9084');
INSERT INTO OFFICERS VALUES ('OFF-105', 'BADGE-9085', 'Judge Arthur Pendelton', 'Judicial Authority', 'hash_pendelton_9085');
INSERT INTO OFFICERS VALUES ('OFF-106', 'BADGE-9086', 'Dr. Alan Turing', 'Lab Analyst', 'hash_turing_9086');

INSERT INTO CASES VALUES ('CASE-2024-01', 'Downtown Bank Cyber Attack', TIMESTAMP '2024-01-15 08:30:00', '40.7128,-74.0060', 'under_investigation', 'OFF-101');
INSERT INTO CASES VALUES ('CASE-2024-02', 'Westside Homicide Investigation', TIMESTAMP '2024-02-10 21:15:00', '34.0522,-118.2437', 'open', 'OFF-104');
INSERT INTO CASES VALUES ('CASE-2024-03', 'Corporate Financial Fraud Audit', TIMESTAMP '2024-03-01 11:00:00', '41.8781,-87.6298', 'in_court', 'OFF-101');
INSERT INTO CASES VALUES ('CASE-2024-04', 'Harbor Warehouse Narcotics Seizure', TIMESTAMP '2024-03-20 02:45:00', '25.7617,-80.1918', 'open', 'OFF-104');
INSERT INTO CASES VALUES ('CASE-2024-05', 'Metro Jewelry Store Robbery', TIMESTAMP '2024-04-05 14:20:00', '37.7749,-122.4194', 'closed', 'OFF-101');

INSERT INTO EVIDENCE VALUES ('EV-801', 'CASE-2024-01', 'Digital Device', TIMESTAMP '2024-01-15 10:00:00');
INSERT INTO EVIDENCE VALUES ('EV-802', 'CASE-2024-01', 'Document', TIMESTAMP '2024-01-15 11:30:00');
INSERT INTO EVIDENCE VALUES ('EV-803', 'CASE-2024-02', 'Weapon', TIMESTAMP '2024-02-10 22:45:00');
INSERT INTO EVIDENCE VALUES ('EV-804', 'CASE-2024-02', 'Biological', TIMESTAMP '2024-02-10 23:15:00');
INSERT INTO EVIDENCE VALUES ('EV-805', 'CASE-2024-03', 'Digital Device', TIMESTAMP '2024-03-01 14:00:00');
INSERT INTO EVIDENCE VALUES ('EV-806', 'CASE-2024-04', 'Other', TIMESTAMP '2024-03-20 04:00:00');
INSERT INTO EVIDENCE VALUES ('EV-807', 'CASE-2024-05', 'Fingerprint', TIMESTAMP '2024-04-05 16:30:00');

INSERT INTO PHYSICAL_EVIDENCE VALUES ('EV-803', 'LOCKER-A12', 'SEAL-99401', 'Heavy Metal Vault Container');
INSERT INTO PHYSICAL_EVIDENCE VALUES ('EV-804', 'LOCKER-B04', 'SEAL-99402', 'Sterile Biohazard Refrigerated Pack');
INSERT INTO PHYSICAL_EVIDENCE VALUES ('EV-806', 'LOCKER-C09', 'SEAL-99403', 'Sealed Narcotics Evidence Bag');

INSERT INTO DIGITAL_EVIDENCE VALUES ('EV-801', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'Disk Image (.raw)', 1500.50, 'SN-SERVER-9921');
INSERT INTO DIGITAL_EVIDENCE VALUES ('EV-805', '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4', 'Database Dump (.sql)', 450.75, 'SN-LAPTOP-4410');

INSERT INTO CUSTODY_LOG VALUES ('LOG-5001', 'EV-801', 'OFF-101', 'OFF-102', TIMESTAMP '2024-01-15 14:00:00', '65b2f11a9a8c123456789a01');
INSERT INTO CUSTODY_LOG VALUES ('LOG-5002', 'EV-801', 'OFF-102', 'OFF-106', TIMESTAMP '2024-01-16 09:30:00', '65b2f11a9a8c123456789a02');
INSERT INTO CUSTODY_LOG VALUES ('LOG-5003', 'EV-803', 'OFF-104', 'OFF-102', TIMESTAMP '2024-02-11 08:00:00', '65b2f11a9a8c123456789a03');
INSERT INTO CUSTODY_LOG VALUES ('LOG-5004', 'EV-804', 'OFF-104', 'OFF-102', TIMESTAMP '2024-02-11 08:30:00', '65b2f11a9a8c123456789a04');
INSERT INTO CUSTODY_LOG VALUES ('LOG-5005', 'EV-805', 'OFF-101', 'OFF-106', TIMESTAMP '2024-03-02 10:15:00', '65b2f11a9a8c123456789a05');

COMMIT;

-- =====================================================================
-- [📸 SCREENSHOT 3 PLACEHOLDER: CRUD Operations Execution Output]
-- Action Required: Run CRUD commands below (INSERT, SELECT, UPDATE, DELETE). Capture terminal window showing outputs.
-- =====================================================================

INSERT INTO OFFICERS VALUES ('OFF-107', 'BADGE-9087', 'Det. James Gordon', 'Investigating Officer', 'hash_gordon_9087');
INSERT INTO EVIDENCE VALUES ('EV-808', 'CASE-2024-02', 'Clothing', TIMESTAMP '2024-02-11 12:00:00');
INSERT INTO PHYSICAL_EVIDENCE VALUES ('EV-808', 'LOCKER-A15', 'SEAL-99408', 'Evidence Garment Bag');

SELECT e.evidence_id, e.evidence_type, e.collection_timestamp, p.storage_locker_number, p.seal_number
FROM EVIDENCE e
LEFT JOIN PHYSICAL_EVIDENCE p ON e.evidence_id = p.evidence_id
WHERE e.case_id = 'CASE-2024-02';

UPDATE CASES
SET status = 'under_investigation', lead_officer_id = 'OFF-107'
WHERE case_id = 'CASE-2024-02';

INSERT INTO CASES VALUES ('CASE-TEMP-99', 'Temporary Test Case', TIMESTAMP '2024-05-01 10:00:00', '0.0,0.0', 'open', 'OFF-101');
INSERT INTO EVIDENCE VALUES ('EV-TEMP-99', 'CASE-TEMP-99', 'Other', TIMESTAMP '2024-05-01 10:05:00');
DELETE FROM CASES WHERE case_id = 'CASE-TEMP-99';
COMMIT;

-- =====================================================================
-- [📸 SCREENSHOT 4 PLACEHOLDER: SQL Joins Execution Results]
-- Action Required: Run the 6 join queries below. Capture screenshot of output result sets for INNER, LEFT, RIGHT, FULL, SELF, and CROSS joins.
-- =====================================================================

SELECT c.case_id, c.title, c.status, o.full_name AS lead_officer, o.badge_number
FROM CASES c
INNER JOIN OFFICERS o ON c.lead_officer_id = o.officer_id;

SELECT e.evidence_id, e.case_id, e.evidence_type, p.storage_locker_number, p.seal_number
FROM EVIDENCE e
LEFT OUTER JOIN PHYSICAL_EVIDENCE p ON e.evidence_id = p.evidence_id;

SELECT o.full_name, o.role, cl.log_id, cl.evidence_id, cl.transfer_timestamp
FROM CUSTODY_LOG cl
RIGHT OUTER JOIN OFFICERS o ON cl.released_by_id = o.officer_id;

SELECT d.evidence_id, d.file_hash_sha256, d.size_mb, cl.log_id, cl.transfer_timestamp
FROM DIGITAL_EVIDENCE d
FULL OUTER JOIN CUSTODY_LOG cl ON d.evidence_id = cl.evidence_id;

SELECT cl.log_id, cl.evidence_id,
       rel.full_name AS released_by_officer,
       rec.full_name AS received_by_officer,
       cl.transfer_timestamp
FROM CUSTODY_LOG cl
JOIN OFFICERS rel ON cl.released_by_id = rel.officer_id
JOIN OFFICERS rec ON cl.received_by_id = rec.officer_id;

SELECT o.full_name, cs.status_type
FROM OFFICERS o
CROSS JOIN (SELECT DISTINCT status AS status_type FROM CASES) cs;

-- =====================================================================
-- [📸 SCREENSHOT 5 PLACEHOLDER: Nested Queries & Subqueries Output]
-- Action Required: Run subqueries below. Capture terminal output displaying single-row, multi-row, correlated, inline view, and scalar subquery results.
-- =====================================================================

SELECT evidence_id, evidence_type, collection_timestamp
FROM EVIDENCE
WHERE collection_timestamp > (
    SELECT incident_timestamp FROM CASES WHERE case_id = 'CASE-2024-02'
);

SELECT officer_id, full_name, badge_number
FROM OFFICERS
WHERE officer_id IN (
    SELECT received_by_id FROM CUSTODY_LOG WHERE evidence_id IN (
        SELECT evidence_id FROM EVIDENCE WHERE evidence_type = 'Digital Device'
    )
);

SELECT o.officer_id, o.full_name, o.badge_number
FROM OFFICERS o
WHERE EXISTS (
    SELECT 1 FROM CASES c
    JOIN EVIDENCE e ON c.case_id = e.case_id
    WHERE c.lead_officer_id = o.officer_id AND e.evidence_type = 'Digital Device'
);

SELECT officer_summary.lead_officer_id, officer_summary.officer_name, officer_summary.total_evidence
FROM (
    SELECT c.lead_officer_id, o.full_name AS officer_name, COUNT(e.evidence_id) AS total_evidence
    FROM CASES c
    JOIN OFFICERS o ON c.lead_officer_id = o.officer_id
    LEFT JOIN EVIDENCE e ON c.case_id = e.case_id
    GROUP BY c.lead_officer_id, o.full_name
) officer_summary
WHERE officer_summary.total_evidence > 0;

SELECT c.case_id, c.title, c.status,
       (SELECT COUNT(*) FROM EVIDENCE e WHERE e.case_id = c.case_id) AS total_items
FROM CASES c;

-- =====================================================================
-- [📸 SCREENSHOT 6 PLACEHOLDER: Aggregate Functions & ROLLUP Output]
-- Action Required: Run aggregate queries below. Capture output showing GROUP BY HAVING, AVG/MAX/MIN, and ROLLUP subtotals.
-- =====================================================================

SELECT c.status, COUNT(e.evidence_id) AS total_evidence_items, COUNT(DISTINCT c.case_id) AS total_cases
FROM CASES c
LEFT JOIN EVIDENCE e ON c.case_id = e.case_id
GROUP BY c.status
HAVING COUNT(e.evidence_id) >= 1;

SELECT media_type,
       COUNT(*) AS total_files,
       ROUND(AVG(size_mb), 2) AS avg_size_mb,
       MAX(size_mb) AS max_size_mb,
       MIN(size_mb) AS min_size_mb,
       ROUND(SUM(size_mb), 2) AS total_storage_mb
FROM DIGITAL_EVIDENCE
GROUP BY media_type;

SELECT NVL(c.status, 'TOTAL ALL STATUSES') AS case_status,
       NVL(e.evidence_type, 'SUBTOTAL TYPE') AS evidence_type,
       COUNT(e.evidence_id) AS item_count
FROM CASES c
JOIN EVIDENCE e ON c.case_id = e.case_id
GROUP BY ROLLUP(c.status, e.evidence_type);

-- =====================================================================
-- [📸 SCREENSHOT 7 PLACEHOLDER: Database Views Creation & Query Output]
-- Action Required: Run view creation and SELECT * statements below. Capture "View created." and view query outputs.
-- =====================================================================

CREATE OR REPLACE VIEW VW_ACTIVE_CASES AS
SELECT case_id, title, incident_timestamp, lead_officer_id
FROM CASES
WHERE status IN ('open', 'under_investigation');

CREATE OR REPLACE VIEW VW_FULL_CUSTODY_AUDIT AS
SELECT cl.log_id,
       c.case_id,
       c.title AS case_title,
       e.evidence_id,
       e.evidence_type,
       rel.full_name AS released_by_officer,
       rec.full_name AS received_by_officer,
       cl.transfer_timestamp,
       cl.mongo_doc_ref
FROM CUSTODY_LOG cl
JOIN EVIDENCE e ON cl.evidence_id = e.evidence_id
JOIN CASES c ON e.case_id = c.case_id
JOIN OFFICERS rel ON cl.released_by_id = rel.officer_id
JOIN OFFICERS rec ON cl.received_by_id = rec.officer_id;

CREATE OR REPLACE VIEW VW_OFFICER_PROFILES AS
SELECT officer_id, badge_number, full_name, role
FROM OFFICERS;

SELECT * FROM VW_ACTIVE_CASES;
SELECT * FROM VW_FULL_CUSTODY_AUDIT;

-- =====================================================================
-- [📸 SCREENSHOT 8 PLACEHOLDER: Stored Procedures Creation & Execution Output]
-- Action Required: Run procedure creation blocks and testing block. Capture "Procedure created." and DBMS_OUTPUT text.
-- =====================================================================

CREATE OR REPLACE PROCEDURE SP_REGISTER_NEW_CASE (
    p_case_id IN VARCHAR2,
    p_title IN VARCHAR2,
    p_incident_ts IN TIMESTAMP,
    p_location IN VARCHAR2,
    p_lead_officer IN VARCHAR2,
    p_status_msg OUT VARCHAR2
) AS
    v_officer_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_officer_count
    FROM OFFICERS
    WHERE officer_id = p_lead_officer;

    IF v_officer_count = 0 THEN
        p_status_msg := 'ERROR: Lead officer ID does not exist in OFFICERS database.';
        RETURN;
    END IF;

    INSERT INTO CASES (case_id, title, incident_timestamp, location_point, status, lead_officer_id)
    VALUES (p_case_id, p_title, p_incident_ts, p_location, 'open', p_lead_officer);

    COMMIT;
    p_status_msg := 'SUCCESS: Case ' || p_case_id || ' registered successfully.';
EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN
        p_status_msg := 'ERROR: Case ID ' || p_case_id || ' already exists.';
        ROLLBACK;
    WHEN OTHERS THEN
        p_status_msg := 'ERROR: Failed to register case - ' || SQLERRM;
        ROLLBACK;
END SP_REGISTER_NEW_CASE;
/

CREATE OR REPLACE PROCEDURE SP_TRANSFER_CUSTODY (
    p_log_id IN VARCHAR2,
    p_evidence_id IN VARCHAR2,
    p_released_by IN VARCHAR2,
    p_received_by IN VARCHAR2,
    p_mongo_ref IN VARCHAR2,
    p_out_log OUT VARCHAR2
) AS
    v_ev_exists NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_ev_exists FROM EVIDENCE WHERE evidence_id = p_evidence_id;
    IF v_ev_exists = 0 THEN
        RAISE_APPLICATION_ERROR(-20002, 'Evidence ID does not exist.');
    END IF;

    INSERT INTO CUSTODY_LOG (log_id, evidence_id, released_by_id, received_by_id, transfer_timestamp, mongo_doc_ref)
    VALUES (p_log_id, p_evidence_id, p_released_by, p_received_by, CURRENT_TIMESTAMP, p_mongo_ref);

    COMMIT;
    p_out_log := 'TRANSFER LOGGED: ' || p_log_id || ' for Evidence: ' || p_evidence_id;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        p_out_log := 'TRANSFER FAILED: ' || SQLERRM;
END SP_TRANSFER_CUSTODY;
/

SET SERVEROUTPUT ON;
DECLARE
    v_msg VARCHAR2(255);
BEGIN
    SP_REGISTER_NEW_CASE('CASE-2024-06', 'Downtown Hacking Incident', CURRENT_TIMESTAMP, '40.7128,-74.0060', 'OFF-101', v_msg);
    DBMS_OUTPUT.PUT_LINE(v_msg);
    
    SP_TRANSFER_CUSTODY('LOG-5006', 'EV-801', 'OFF-106', 'OFF-101', '65b2f11a9a8c123456789a06', v_msg);
    DBMS_OUTPUT.PUT_LINE(v_msg);
END;
/

-- =====================================================================
-- [📸 SCREENSHOT 9 PLACEHOLDER: PL/SQL Functions Creation & Query Execution]
-- Action Required: Run function creation blocks and consuming SELECT queries below. Capture output.
-- =====================================================================

CREATE OR REPLACE FUNCTION FN_COUNT_CUSTODY_TRANSFERS (
    p_evidence_id IN VARCHAR2
) RETURN NUMBER AS
    v_count NUMBER := 0;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM CUSTODY_LOG
    WHERE evidence_id = p_evidence_id;
    
    RETURN v_count;
EXCEPTION
    WHEN OTHERS THEN
        RETURN 0;
END FN_COUNT_CUSTODY_TRANSFERS;
/

CREATE OR REPLACE FUNCTION FN_GET_OFFICER_WORKLOAD (
    p_officer_id IN VARCHAR2
) RETURN NUMBER AS
    v_active_cases NUMBER := 0;
BEGIN
    SELECT COUNT(*) INTO v_active_cases
    FROM CASES
    WHERE lead_officer_id = p_officer_id
      AND status IN ('open', 'under_investigation');
      
    RETURN v_active_cases;
EXCEPTION
    WHEN OTHERS THEN
        RETURN 0;
END FN_GET_OFFICER_WORKLOAD;
/

SELECT evidence_id, evidence_type, FN_COUNT_CUSTODY_TRANSFERS(evidence_id) AS total_transfers
FROM EVIDENCE;

SELECT officer_id, full_name, role, FN_GET_OFFICER_WORKLOAD(officer_id) AS active_cases
FROM OFFICERS
WHERE role = 'Investigating Officer';

-- =====================================================================
-- [📸 SCREENSHOT 10 PLACEHOLDER: Trigger Execution & Audit Log Verification]
-- Action Required: Run trigger creation blocks, UPDATE CASES, and SELECT * FROM CASE_AUDIT_LOG. Capture screenshot.
-- =====================================================================

CREATE OR REPLACE TRIGGER TRG_AUDIT_CASE_STATUS
AFTER UPDATE OF status ON CASES
FOR EACH ROW
BEGIN
    IF :OLD.status <> :NEW.status THEN
        INSERT INTO CASE_AUDIT_LOG (audit_id, case_id, old_status, new_status, changed_by, change_timestamp)
        VALUES (seq_audit_id.NEXTVAL, :OLD.case_id, :OLD.status, :NEW.status, USER, CURRENT_TIMESTAMP);
    END IF;
END TRG_AUDIT_CASE_STATUS;
/

CREATE OR REPLACE TRIGGER TRG_PREVENT_CLOSED_CASE_EVID
BEFORE INSERT ON EVIDENCE
FOR EACH ROW
DECLARE
    v_status VARCHAR2(50);
BEGIN
    SELECT status INTO v_status FROM CASES WHERE case_id = :NEW.case_id;
    IF v_status IN ('closed', 'archived') THEN
        RAISE_APPLICATION_ERROR(-20001, 'CANNOT INSERT EVIDENCE: Case ' || :NEW.case_id || ' is closed or archived.');
    END IF;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RAISE_APPLICATION_ERROR(-20003, 'CANNOT INSERT EVIDENCE: Parent case does not exist.');
END TRG_PREVENT_CLOSED_CASE_EVID;
/

UPDATE CASES SET status = 'in_court' WHERE case_id = 'CASE-2024-02';
SELECT * FROM CASE_AUDIT_LOG;

-- =====================================================================
-- [📸 SCREENSHOT 11 PLACEHOLDER: PL/SQL Cursor Processing Output]
-- Action Required: Run cursor PL/SQL blocks with SET SERVEROUTPUT ON. Capture DBMS_OUTPUT row iteration messages.
-- =====================================================================

SET SERVEROUTPUT ON;
DECLARE
    CURSOR cur_case_evidence (p_status VARCHAR2) IS
        SELECT c.case_id, c.title, e.evidence_id, e.evidence_type
        FROM CASES c
        JOIN EVIDENCE e ON c.case_id = e.case_id
        WHERE c.status = p_status;

    v_rec cur_case_evidence%ROWTYPE;
BEGIN
    DBMS_OUTPUT.PUT_LINE('--- PROCESSING EVIDENCE FOR OPEN CASES ---');
    OPEN cur_case_evidence('open');
    LOOP
        FETCH cur_case_evidence INTO v_rec;
        EXIT WHEN cur_case_evidence%NOTFOUND;
        DBMS_OUTPUT.PUT_LINE('Case: ' || v_rec.case_id || ' | Title: ' || v_rec.title || ' | Evidence: ' || v_rec.evidence_id || ' (' || v_rec.evidence_type || ')');
    END LOOP;
    CLOSE cur_case_evidence;
END;
/

DECLARE
BEGIN
    DBMS_OUTPUT.PUT_LINE('--- DIGITAL EVIDENCE FILE SIZE AUDIT ---');
    FOR r IN (
        SELECT e.evidence_id, e.case_id, d.file_hash_sha256, d.size_mb
        FROM EVIDENCE e
        JOIN DIGITAL_EVIDENCE d ON e.evidence_id = d.evidence_id
        WHERE d.size_mb > 100.00
    ) LOOP
        DBMS_OUTPUT.PUT_LINE('LARGE FILE DETECTED -> EV ID: ' || r.evidence_id || ' | Size: ' || r.size_mb || ' MB | SHA256: ' || SUBSTR(r.file_hash_sha256, 1, 16) || '...');
    END LOOP;
END;
/

-- =====================================================================
-- [📸 SCREENSHOT 12 PLACEHOLDER: TCL Transaction Control Execution]
-- Action Required: Run SAVEPOINT and ROLLBACK commands below. Capture screenshot of transaction control output.
-- =====================================================================

INSERT INTO CASES VALUES ('CASE-2024-99', 'Transaction Test Case', CURRENT_TIMESTAMP, '0.0,0.0', 'open', 'OFF-101');
SAVEPOINT sp_case_created;

INSERT INTO EVIDENCE VALUES ('EV-999', 'CASE-2024-99', 'Digital Device', CURRENT_TIMESTAMP);
SAVEPOINT sp_evidence_added;

ROLLBACK TO sp_case_created;

SELECT COUNT(*) FROM EVIDENCE WHERE evidence_id = 'EV-999';

ROLLBACK;

-- =====================================================================
-- [📸 SCREENSHOT 13 PLACEHOLDER: Final System Verification Script Output]
-- Action Required: Run UNION ALL query below to display total row counts across all 7 database tables. Capture output screenshot.
-- =====================================================================

SELECT 'OFFICERS' AS Table_Name, COUNT(*) AS Total_Rows FROM OFFICERS
UNION ALL
SELECT 'CASES', COUNT(*) FROM CASES
UNION ALL
SELECT 'EVIDENCE', COUNT(*) FROM EVIDENCE
UNION ALL
SELECT 'PHYSICAL_EVIDENCE', COUNT(*) FROM PHYSICAL_EVIDENCE
UNION ALL
SELECT 'DIGITAL_EVIDENCE', COUNT(*) FROM DIGITAL_EVIDENCE
UNION ALL
SELECT 'CUSTODY_LOG', COUNT(*) FROM CUSTODY_LOG
UNION ALL
SELECT 'CASE_AUDIT_LOG', COUNT(*) FROM CASE_AUDIT_LOG;
