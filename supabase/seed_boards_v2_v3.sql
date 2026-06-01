-- Run this in Supabase SQL Editor if schema.sql was already applied
-- and you need to add IGBT_BOARD_V2 and IGBT_BOARD_V3 to an existing database.

-- ── V2: Dual half-bridge · 4 switches + bootstrap cap + NTC ──
INSERT INTO boards (board_id, board_name, description)
VALUES ('00000000-0000-0000-0000-000000000002', 'IGBT_BOARD_V2',
        'Dual Half-Bridge Module V2 · 4 IGBT switches + bootstrap capacitor + NTC')
ON CONFLICT (board_id) DO NOTHING;

INSERT INTO test_points (board_id, point_name, component_type, description, sort_order)
VALUES
  ('00000000-0000-0000-0000-000000000002', 'GA1',  'diode',           'Half-bridge A — upper switch diode',  1),
  ('00000000-0000-0000-0000-000000000002', 'GA2',  'diode',           'Half-bridge A — lower switch diode',  2),
  ('00000000-0000-0000-0000-000000000002', 'GB1',  'diode',           'Half-bridge B — upper switch diode',  3),
  ('00000000-0000-0000-0000-000000000002', 'GB2',  'diode',           'Half-bridge B — lower switch diode',  4),
  ('00000000-0000-0000-0000-000000000002', 'CBS',  'capacitive_loop', 'Bootstrap capacitor',                 5),
  ('00000000-0000-0000-0000-000000000002', 'NTC',  'resistive',       'NTC thermal sensor',                  6)
ON CONFLICT (board_id, point_name) DO NOTHING;

-- ── V3: 3-phase full-bridge · 6 IGBTs + DC link cap + gate R ─
INSERT INTO boards (board_id, board_name, description)
VALUES ('00000000-0000-0000-0000-000000000003', 'IGBT_BOARD_V3',
        '3-Phase Full-Bridge Inverter V3 · 6 IGBT switches + DC link cap + gate resistor')
ON CONFLICT (board_id) DO NOTHING;

INSERT INTO test_points (board_id, point_name, component_type, description, sort_order)
VALUES
  ('00000000-0000-0000-0000-000000000003', 'U_HI', 'diode',           'Phase U — high-side IGBT diode',  1),
  ('00000000-0000-0000-0000-000000000003', 'U_LO', 'diode',           'Phase U — low-side IGBT diode',   2),
  ('00000000-0000-0000-0000-000000000003', 'V_HI', 'diode',           'Phase V — high-side IGBT diode',  3),
  ('00000000-0000-0000-0000-000000000003', 'V_LO', 'diode',           'Phase V — low-side IGBT diode',   4),
  ('00000000-0000-0000-0000-000000000003', 'W_HI', 'diode',           'Phase W — high-side IGBT diode',  5),
  ('00000000-0000-0000-0000-000000000003', 'W_LO', 'diode',           'Phase W — low-side IGBT diode',   6),
  ('00000000-0000-0000-0000-000000000003', 'CDC',  'capacitive_loop', 'DC link capacitor',                7),
  ('00000000-0000-0000-0000-000000000003', 'RG',   'resistive',       'Gate resistor check',              8)
ON CONFLICT (board_id, point_name) DO NOTHING;
