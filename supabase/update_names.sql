-- ============================================================
-- Name update migration — run this in Supabase SQL Editor
-- Updates IGBT_BOARD_V1 → AGDR_Board and all test point names
-- ============================================================

-- 1. Rename the board
UPDATE boards
SET board_name  = 'AGDR_Board',
    description = 'AGDR Board · 6 Gate-Emitter test points + NTC Thermistor'
WHERE board_id = '00000000-0000-0000-0000-000000000001';

-- 2. Rename test points (point_name = displayed name in UI + PDF + storage path)
UPDATE test_points SET point_name = 'Gate-Emitter_13-14', description = 'Gate-Emitter_13-14'
WHERE board_id = '00000000-0000-0000-0000-000000000001' AND point_name = 'IGBT1';

UPDATE test_points SET point_name = 'Gate-Emitter_16-17', description = 'Gate-Emitter_16-17'
WHERE board_id = '00000000-0000-0000-0000-000000000001' AND point_name = 'IGBT2';

UPDATE test_points SET point_name = 'Gate-Emitter_18-19', description = 'Gate-Emitter_18-19'
WHERE board_id = '00000000-0000-0000-0000-000000000001' AND point_name = 'IGBT3';

UPDATE test_points SET point_name = 'Gate-Emitter_21-22', description = 'Gate-Emitter_21-22'
WHERE board_id = '00000000-0000-0000-0000-000000000001' AND point_name = 'IGBT4';

UPDATE test_points SET point_name = 'Gate-Emitter_23-24', description = 'Gate-Emitter_23-24'
WHERE board_id = '00000000-0000-0000-0000-000000000001' AND point_name = 'IGBT5';

UPDATE test_points SET point_name = 'Gate-Emitter_26-27', description = 'Gate-Emitter_26-27'
WHERE board_id = '00000000-0000-0000-0000-000000000001' AND point_name = 'IGBT6';

UPDATE test_points SET point_name = 'NTC Thermistor_28-29', description = 'NTC Thermistor_28-29'
WHERE board_id = '00000000-0000-0000-0000-000000000001' AND point_name = 'IGBT7';

-- Verify
SELECT b.board_name, tp.point_name, tp.component_type, tp.description
FROM boards b JOIN test_points tp ON b.board_id = tp.board_id
WHERE b.board_id = '00000000-0000-0000-0000-000000000001'
ORDER BY tp.sort_order;
