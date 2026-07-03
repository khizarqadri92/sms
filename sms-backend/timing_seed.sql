INSERT INTO system_settings (category, key, value) VALUES ('school_timing', 'school_start_time', '08:00') ON CONFLICT (category, key) DO NOTHING;
INSERT INTO system_settings (category, key, value) VALUES ('school_timing', 'school_end_time', '14:00') ON CONFLICT (category, key) DO NOTHING;
INSERT INTO system_settings (category, key, value) VALUES ('school_timing', 'period_duration', '45') ON CONFLICT (category, key) DO NOTHING;
INSERT INTO system_settings (category, key, value) VALUES ('school_timing', 'break_start_time', '10:30') ON CONFLICT (category, key) DO NOTHING;
INSERT INTO system_settings (category, key, value) VALUES ('school_timing', 'break_duration', '20') ON CONFLICT (category, key) DO NOTHING;
INSERT INTO system_settings (category, key, value) VALUES ('school_timing', 'working_days', '1,2,3,4,5') ON CONFLICT (category, key) DO NOTHING;