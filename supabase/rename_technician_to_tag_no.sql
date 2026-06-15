-- Run in Supabase SQL Editor.
-- Renames test_sessions.technician → tag_no to match how the field is actually
-- used (the inspection's Tag NO). Existing data is preserved by the rename.
--
-- IMPORTANT: deploy the matching backend + frontend at the same time — the API
-- now sends/expects `tag_no`, not `technician`.

ALTER TABLE test_sessions RENAME COLUMN technician TO tag_no;
