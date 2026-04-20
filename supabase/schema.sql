-- ============================================================
-- I-V Signature Analysis System — Supabase Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── BOARDS ──────────────────────────────────────────────────
CREATE TABLE boards (
  board_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_name  TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TEST POINTS ─────────────────────────────────────────────
CREATE TABLE test_points (
  point_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id        UUID NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
  point_name      TEXT NOT NULL,           -- e.g. "IGBT1", "IGBT07"
  component_type  TEXT NOT NULL,           -- 'diode' | 'resistive' | 'capacitive_loop'
  description     TEXT,
  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(board_id, point_name)
);

-- ─── MASTER SIGNATURES ───────────────────────────────────────
CREATE TABLE master_signatures (
  signature_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  point_id        UUID NOT NULL REFERENCES test_points(point_id) ON DELETE CASCADE,
  image_path      TEXT NOT NULL,           -- Supabase Storage path
  feature_vector  JSONB NOT NULL,          -- {bbox_aspect, enclosed_area, r2_linear, slope, ...}
  v_data          JSONB NOT NULL,          -- resampled voltage array [float]
  i_data          JSONB NOT NULL,          -- resampled current array [float]
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TEST SESSIONS ───────────────────────────────────────────
CREATE TABLE test_sessions (
  session_id  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id    UUID NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
  technician  TEXT NOT NULL,
  notes       TEXT,
  status      TEXT DEFAULT 'in_progress',  -- 'in_progress' | 'completed'
  test_date   TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TEST RESULTS ────────────────────────────────────────────
CREATE TABLE test_results (
  result_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id        UUID NOT NULL REFERENCES test_sessions(session_id) ON DELETE CASCADE,
  point_id          UUID NOT NULL REFERENCES test_points(point_id),
  image_path        TEXT NOT NULL,           -- Supabase Storage path
  feature_vector    JSONB,
  v_data            JSONB,
  i_data            JSONB,
  similarity_score  FLOAT,
  shape_type        TEXT,                    -- detected shape
  status            TEXT,                    -- 'ok' | 'warning' | 'fault'
  diagnosis         TEXT,                    -- 'normal' | 'cap_leakage' | 'diode_degradation' | 'shorted' | 'open'
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INDEXES ─────────────────────────────────────────────────
CREATE INDEX idx_test_points_board    ON test_points(board_id);
CREATE INDEX idx_master_sig_point     ON master_signatures(point_id);
CREATE INDEX idx_test_results_session ON test_results(session_id);
CREATE INDEX idx_test_results_point   ON test_results(point_id);
CREATE INDEX idx_sessions_board       ON test_sessions(board_id);

-- ─── SEED DATA — IGBT Board ──────────────────────────────────
INSERT INTO boards (board_id, board_name, description) VALUES
  ('00000000-0000-0000-0000-000000000001', 'IGBT_BOARD_V1', 'IGBT Module with 6 freewheeling diodes + NTC thermistor');

INSERT INTO test_points (board_id, point_name, component_type, description, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'IGBT1', 'diode',     'Free-wheeling diode #1', 1),
  ('00000000-0000-0000-0000-000000000001', 'IGBT2', 'diode',     'Free-wheeling diode #2', 2),
  ('00000000-0000-0000-0000-000000000001', 'IGBT3', 'diode',     'Free-wheeling diode #3', 3),
  ('00000000-0000-0000-0000-000000000001', 'IGBT4', 'diode',     'Free-wheeling diode #4', 4),
  ('00000000-0000-0000-0000-000000000001', 'IGBT5', 'diode',     'Free-wheeling diode #5', 5),
  ('00000000-0000-0000-0000-000000000001', 'IGBT6', 'diode',     'Free-wheeling diode #6', 6),
  ('00000000-0000-0000-0000-000000000001', 'IGBT7', 'resistive', 'NTC Thermistor',          7);

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────
ALTER TABLE boards            ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_points       ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_results      ENABLE ROW LEVEL SECURITY;

-- Public read for all (technicians don't need login for reading)
CREATE POLICY "public_read_boards"   ON boards            FOR SELECT USING (true);
CREATE POLICY "public_read_points"   ON test_points       FOR SELECT USING (true);
CREATE POLICY "public_read_masters"  ON master_signatures FOR SELECT USING (true);
CREATE POLICY "public_read_sessions" ON test_sessions     FOR SELECT USING (true);
CREATE POLICY "public_read_results"  ON test_results      FOR SELECT USING (true);

-- Write requires service role (backend only)
CREATE POLICY "service_write_boards"   ON boards            FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_write_points"   ON test_points       FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_write_masters"  ON master_signatures FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_write_sessions" ON test_sessions     FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_write_results"  ON test_results      FOR ALL USING (auth.role() = 'service_role');
