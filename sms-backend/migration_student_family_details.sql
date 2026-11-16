-- =====================================================================
-- STUDENTS: the same family & other details as the admission form, so the
-- student profile (Edit Info) and the admission form match. Only ADDS columns
-- (father_name, mother_name, father_cnic, father_phone, mother_phone exist).
-- Safe to run more than once.
-- =====================================================================
BEGIN;

ALTER TABLE students
    ADD COLUMN IF NOT EXISTS b_form_no                   VARCHAR(20),
    ADD COLUMN IF NOT EXISTS religion                    VARCHAR(40),
    ADD COLUMN IF NOT EXISTS sect                        VARCHAR(40),
    ADD COLUMN IF NOT EXISTS nationality                 VARCHAR(60),
    ADD COLUMN IF NOT EXISTS previous_school             VARCHAR(150),
    ADD COLUMN IF NOT EXISTS previous_class              VARCHAR(60),
    ADD COLUMN IF NOT EXISTS father_occupation           VARCHAR(100),
    ADD COLUMN IF NOT EXISTS father_email                VARCHAR(150),
    ADD COLUMN IF NOT EXISTS mother_cnic                 VARCHAR(20),
    ADD COLUMN IF NOT EXISTS mother_occupation           VARCHAR(100),
    ADD COLUMN IF NOT EXISTS mother_email                VARCHAR(150),
    ADD COLUMN IF NOT EXISTS primary_guardian            VARCHAR(10),
    ADD COLUMN IF NOT EXISTS guardian_name               VARCHAR(120),
    ADD COLUMN IF NOT EXISTS guardian_cnic               VARCHAR(20),
    ADD COLUMN IF NOT EXISTS guardian_occupation         VARCHAR(100),
    ADD COLUMN IF NOT EXISTS guardian_phone              VARCHAR(20),
    ADD COLUMN IF NOT EXISTS guardian_email              VARCHAR(150),
    ADD COLUMN IF NOT EXISTS guardian_relationship       VARCHAR(30),
    ADD COLUMN IF NOT EXISTS guardian_relationship_other VARCHAR(60),
    ADD COLUMN IF NOT EXISTS living_with                 VARCHAR(10),
    ADD COLUMN IF NOT EXISTS has_disability              BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS disability_types            TEXT[]  NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS disability_details          TEXT,
    ADD COLUMN IF NOT EXISTS transport_mode              VARCHAR(12),
    ADD COLUMN IF NOT EXISTS pickup_address              TEXT;

-- CNIC look-ups ignore dashes / spaces (existing CNICs were saved as typed)
CREATE INDEX IF NOT EXISTS idx_students_father_cnic_digits   ON students ((regexp_replace(COALESCE(father_cnic,''),   '\D', '', 'g')));
CREATE INDEX IF NOT EXISTS idx_students_mother_cnic_digits   ON students ((regexp_replace(COALESCE(mother_cnic,''),   '\D', '', 'g')));
CREATE INDEX IF NOT EXISTS idx_students_guardian_cnic_digits ON students ((regexp_replace(COALESCE(guardian_cnic,''), '\D', '', 'g')));

-- students admitted through admissions already: fill their new details from the application
UPDATE students s SET
    b_form_no = COALESCE(s.b_form_no, a.b_form_no), religion = COALESCE(s.religion, a.religion), sect = COALESCE(s.sect, a.sect),
    nationality = COALESCE(s.nationality, a.nationality), previous_school = COALESCE(s.previous_school, a.previous_school),
    previous_class = COALESCE(s.previous_class, a.previous_class), father_occupation = COALESCE(s.father_occupation, a.father_occupation),
    father_email = COALESCE(s.father_email, a.father_email), mother_cnic = COALESCE(s.mother_cnic, a.mother_cnic),
    mother_occupation = COALESCE(s.mother_occupation, a.mother_occupation), mother_email = COALESCE(s.mother_email, a.mother_email),
    primary_guardian = COALESCE(s.primary_guardian, a.primary_guardian), guardian_name = COALESCE(s.guardian_name, a.guardian_name),
    guardian_cnic = COALESCE(s.guardian_cnic, a.guardian_cnic), guardian_occupation = COALESCE(s.guardian_occupation, a.guardian_occupation),
    guardian_phone = COALESCE(s.guardian_phone, a.guardian_phone), guardian_email = COALESCE(s.guardian_email, a.guardian_email),
    guardian_relationship = COALESCE(s.guardian_relationship, a.guardian_relationship),
    guardian_relationship_other = COALESCE(s.guardian_relationship_other, a.guardian_relationship_other),
    living_with = COALESCE(s.living_with, a.living_with), has_disability = s.has_disability OR a.has_disability,
    disability_types = CASE WHEN s.disability_types = '{}' THEN a.disability_types ELSE s.disability_types END,
    disability_details = COALESCE(s.disability_details, a.disability_details),
    transport_mode = COALESCE(s.transport_mode, a.transport_mode), pickup_address = COALESCE(s.pickup_address, a.pickup_address)
FROM admission_applications a
WHERE a.student_id = s.id;

COMMIT;
