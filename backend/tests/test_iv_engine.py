"""
Tests for the I-V image-processing pipeline (backend/iv_engine.py).

These use the real sample oscilloscope exports in test_pic/ as fixtures, so
they guard against accidental changes to the pipeline (crop, HSV thresholds,
shape classification, DTW scoring).

Run from the project root:
    pytest backend/tests/ -v
"""

import os
import numpy as np
import pytest

# Import the functions under test. Running pytest from the project root puts
# the repo on sys.path, so "backend" is importable as a package.
from backend.iv_engine import process_image, similarity_score

# ── Locate the sample-image folder relative to the repo root ──────────
HERE      = os.path.dirname(__file__)
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
PIC_DIR   = os.path.join(REPO_ROOT, "test_pic")

# Expected shape classification for each sample image. If the pipeline's
# crop/threshold/classification logic changes and breaks one of these, the
# test fails loudly instead of silently shipping wrong diagnoses.
EXPECTED_SHAPES = {
    "IGBT02.PNG": "diode",
    "IGBT03.PNG": "diode",
    "IGBT04.PNG": "diode",
    "IGBT05.PNG": "capacitive_loop",
    "IGBT06.PNG": "diode",
    "IGBT07.PNG": "resistive",
    "IGBT1.PNG":  "diode",
}


def _path(name):
    return os.path.join(PIC_DIR, name)


def _load(name):
    """Process a sample image and fail the test if it returns None."""
    result = process_image(_path(name))
    assert result is not None, f"pipeline returned None for {name}"
    return result


# ── Pipeline output structure ─────────────────────────────────────────

@pytest.mark.parametrize("name", list(EXPECTED_SHAPES))
def test_process_returns_expected_structure(name):
    """Every sample image yields v/i arrays of 256 points plus features."""
    r = _load(name)
    assert set(r.keys()) >= {"features", "v", "i"}
    assert len(r["v"]) == 256
    assert len(r["i"]) == 256
    assert "shape_type" in r["features"]


@pytest.mark.parametrize("name,expected", EXPECTED_SHAPES.items())
def test_shape_classification(name, expected):
    """Shape classification matches the known-good label for each sample."""
    r = _load(name)
    assert r["features"]["shape_type"] == expected


# ── Error handling ────────────────────────────────────────────────────

def test_missing_file_returns_none():
    """A non-existent path must return None, not raise."""
    assert process_image(_path("does_not_exist.png")) is None


# ── Similarity scoring ────────────────────────────────────────────────

def _vi(name):
    r = _load(name)
    return np.array(r["v"]), np.array(r["i"])


def test_similarity_self_is_100():
    """A curve compared with itself scores a perfect 100."""
    v, i = _vi("IGBT02.PNG")
    assert similarity_score(v, i, v, i) == 100.0


def test_similarity_in_valid_range():
    """Scores are always clamped to the 0–100 range."""
    v1, i1 = _vi("IGBT02.PNG")
    v2, i2 = _vi("IGBT07.PNG")
    score = similarity_score(v1, i1, v2, i2)
    assert 0.0 <= score <= 100.0


def test_identical_scores_higher_than_different():
    """
    Two diode curves should score at least as high as a diode-vs-resistive
    comparison. (The margin is small — which is exactly why the engine also
    checks shape_type for fault detection — but the ordering must hold.)
    """
    diode_a = _vi("IGBT02.PNG")
    diode_b = _vi("IGBT03.PNG")
    resistive = _vi("IGBT07.PNG")

    same  = similarity_score(*diode_a, *diode_b)
    diff  = similarity_score(*diode_a, *resistive)
    assert same >= diff
