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
  tag_no      TEXT NOT NULL,                -- inspection Tag NO (or technician name in analysis mode)
  notes       TEXT,
  status      TEXT DEFAULT 'in_progress',  -- 'in_progress' | 'completed'
  report_url  TEXT,                         -- public URL of the generated PDF (set on report generation)
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

-- ─── SEED DATA ───────────────────────────────────────────────

-- ── AGDR_Board: 6 Gate-Emitter points + NTC Thermistor ──────
INSERT INTO boards (board_id, board_name, description) VALUES
  ('00000000-0000-0000-0000-000000000001', 'AGDR_Board',
   'AGDR Board · 6 Gate-Emitter test points + NTC Thermistor');

INSERT INTO test_points (board_id, point_name, component_type, description, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Gate-Emitter_13-14', 'diode',     'Gate-Emitter_13-14', 1),
  ('00000000-0000-0000-0000-000000000001', 'Gate-Emitter_16-17', 'diode',     'Gate-Emitter_16-17', 2),
  ('00000000-0000-0000-0000-000000000001', 'Gate-Emitter_18-19', 'diode',     'Gate-Emitter_18-19', 3),
  ('00000000-0000-0000-0000-000000000001', 'Gate-Emitter_21-22', 'diode',     'Gate-Emitter_21-22', 4),
  ('00000000-0000-0000-0000-000000000001', 'Gate-Emitter_23-24', 'diode',     'Gate-Emitter_23-24', 5),
  ('00000000-0000-0000-0000-000000000001', 'Gate-Emitter_26-27', 'diode',     'Gate-Emitter_26-27', 6),
  ('00000000-0000-0000-0000-000000000001', 'NTC Thermistor_28-29', 'resistive', 'NTC Thermistor_28-29', 7);

-- ── V2: Dual half-bridge · 4 switches + bootstrap cap + NTC ──
INSERT INTO boards (board_id, board_name, description) VALUES
  ('00000000-0000-0000-0000-000000000002', 'IGBT_BOARD_V2',
   'Dual Half-Bridge Module V2 · 4 IGBT switches + bootstrap capacitor + NTC');

INSERT INTO test_points (board_id, point_name, component_type, description, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000002', 'GA1',  'diode',           'Half-bridge A — upper switch diode',  1),
  ('00000000-0000-0000-0000-000000000002', 'GA2',  'diode',           'Half-bridge A — lower switch diode',  2),
  ('00000000-0000-0000-0000-000000000002', 'GB1',  'diode',           'Half-bridge B — upper switch diode',  3),
  ('00000000-0000-0000-0000-000000000002', 'GB2',  'diode',           'Half-bridge B — lower switch diode',  4),
  ('00000000-0000-0000-0000-000000000002', 'CBS',  'capacitive_loop', 'Bootstrap capacitor',                 5),
  ('00000000-0000-0000-0000-000000000002', 'NTC',  'resistive',       'NTC thermal sensor',                  6);

-- ── V3: 3-phase full-bridge · 6 IGBTs + DC link cap + gate R ─
INSERT INTO boards (board_id, board_name, description) VALUES
  ('00000000-0000-0000-0000-000000000003', 'IGBT_BOARD_V3',
   '3-Phase Full-Bridge Inverter V3 · 6 IGBT switches + DC link cap + gate resistor');

INSERT INTO test_points (board_id, point_name, component_type, description, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000003', 'U_HI', 'diode',           'Phase U — high-side IGBT diode',  1),
  ('00000000-0000-0000-0000-000000000003', 'U_LO', 'diode',           'Phase U — low-side IGBT diode',   2),
  ('00000000-0000-0000-0000-000000000003', 'V_HI', 'diode',           'Phase V — high-side IGBT diode',  3),
  ('00000000-0000-0000-0000-000000000003', 'V_LO', 'diode',           'Phase V — low-side IGBT diode',   4),
  ('00000000-0000-0000-0000-000000000003', 'W_HI', 'diode',           'Phase W — high-side IGBT diode',  5),
  ('00000000-0000-0000-0000-000000000003', 'W_LO', 'diode',           'Phase W — low-side IGBT diode',   6),
  ('00000000-0000-0000-0000-000000000003', 'CDC',  'capacitive_loop', 'DC link capacitor',                7),
  ('00000000-0000-0000-0000-000000000003', 'RG',   'resistive',       'Gate resistor check',              8);

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
