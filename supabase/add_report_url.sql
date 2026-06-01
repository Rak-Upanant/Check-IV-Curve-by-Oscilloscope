-- Run in Supabase SQL Editor
-- Adds report_url column so generated PDFs are persisted per session.

ALTER TABLE test_sessions ADD COLUMN IF NOT EXISTS report_url TEXT;
