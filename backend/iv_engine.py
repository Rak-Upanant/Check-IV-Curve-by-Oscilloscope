# backend/iv_engine.py  — Phase 1 pipeline wrapped as importable module

import cv2
import numpy as np
from scipy.spatial.distance import directed_hausdorff
from skimage.morphology import skeletonize
from pathlib import Path

PLOT_CROP       = (10, 50, 470, 520)   # calibrated to oscilloscope export frame
X_RANGE         = (-10.0, 10.0)
Y_RANGE         = (-12.0, 10.0)
YELLOW_HSV_LOW  = np.array([15, 80, 80])
YELLOW_HSV_HIGH = np.array([45, 255, 255])

def _crop(img):
    x1,y1,x2,y2 = PLOT_CROP
    return img[y1:y2, x1:x2]

def _mask(plot):
    """
    Extract the yellow oscilloscope trace as a binary mask, staying as close as
    possible to the raw HSV-matched pixels.

    Why no MORPH_CLOSE:
      In-circuit IGBT tests produce a two-branch loop curve — the AC sweep's
      outgoing and return traces create two distinct current values at the same
      voltage.  MORPH_CLOSE (dilation then erosion) bridges nearby pixels and can
      merge the two branches into one blob, destroying the loop information.
      The I-V graph is therefore built from the HSV mask with only isolated-noise
      removal, not from any morphological smoothing.

    Why no MORPH_OPEN:
      MORPH_OPEN erodes thin protrusions first, removing legitimate thin branch
      segments that belong to the loop.

    Noise removal: connected components smaller than MIN_BLOB_PX pixels are
    discarded as camera/compression artefacts; all larger blobs are kept.
    """
    hsv  = cv2.cvtColor(plot, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, YELLOW_HSV_LOW, YELLOW_HSV_HIGH)

    # Remove only truly isolated noise blobs — preserve every real curve segment
    MIN_BLOB_PX = 15
    n_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    clean = np.zeros_like(mask)
    for lbl in range(1, n_labels):      # label 0 = background
        if stats[lbl, cv2.CC_STAT_AREA] >= MIN_BLOB_PX:
            clean[labels == lbl] = 255
    return clean

def _skel(mask):
    return (skeletonize((mask>0).astype(np.uint8))*255).astype(np.uint8)

def _coords(skel):
    ys, xs = np.where(skel > 0)
    if len(xs) == 0: return np.array([]), np.array([])
    order = np.argsort(xs)
    return xs[order], ys[order]

def _to_iv(px_x, px_y, shape):
    h,w = shape[:2]
    v = X_RANGE[0] + (px_x/w)*(X_RANGE[1]-X_RANGE[0])
    i = Y_RANGE[1] - (px_y/h)*(Y_RANGE[1]-Y_RANGE[0])
    return v, i

def _resample(v, i, n=256):
    if len(v) < 3: return np.zeros(n), np.zeros(n)
    v_new = np.linspace(v.min(), v.max(), n)
    return v_new, np.interp(v_new, v, i)

def _features(v, i, mask, shape):
    f = {}
    f["fill_ratio"] = float(np.sum(mask>0))/(mask.shape[0]*mask.shape[1])
    ys,xs = np.where(mask>0)
    if len(xs):
        bw = xs.max()-xs.min(); bh = ys.max()-ys.min()
        f["bbox_aspect"]   = float(bw)/max(bh,1)
        f["bbox_center_x"] = float((xs.max()+xs.min())/2)/shape[1]
        f["bbox_center_y"] = float((ys.max()+ys.min())/2)/shape[0]
    if len(v) > 5:
        area = 0.5*abs(np.dot(v,np.roll(i,1))-np.dot(i,np.roll(v,1)))
        f["enclosed_area"] = float(area)
        c = np.polyfit(v,i,1)
        ss_res = np.sum((i-np.polyval(c,v))**2)
        ss_tot = np.sum((i-i.mean())**2)
        f["r2_linear"] = float(1-ss_res/ss_tot) if ss_tot>0 else 0
        f["slope"] = float(c[0])
        pos,neg = v>0, v<0
        f["i_max_pos"] = float(i[pos].max()) if pos.any() else 0
        f["i_min_neg"] = float(i[neg].min()) if neg.any() else 0
    aspect = f.get("bbox_aspect",1.0)
    if aspect > 3.0:   f["shape_type"] = "resistive"
    elif aspect > 1.2: f["shape_type"] = "capacitive_loop"
    else:              f["shape_type"] = "diode"
    return f

def _to_b64(img: np.ndarray) -> str:
    """Encode a cv2 image (BGR or grayscale) to a base64 PNG string."""
    import base64
    disp = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR) if img.ndim == 2 else img.copy()
    _, buf = cv2.imencode('.png', disp)
    return base64.b64encode(buf).decode()

def process_image_debug(image_path: str) -> dict | None:
    """
    Run the full pipeline and return every intermediate step as either
    a base64 PNG image or chart-ready data arrays (for the frontend to render).
    """
    img = cv2.imread(str(image_path))
    if img is None:
        return None

    steps = []

    # ── Step 1: Original ────────────────────────────────────────
    h0, w0 = img.shape[:2]
    steps.append({
        "name": "Original Image",
        "desc": f"Raw oscilloscope export  ·  {w0}×{h0} px",
        "images": [{"label": "Original", "b64": _to_b64(img)}],
    })

    # ── Step 2: Crop ────────────────────────────────────────────
    x1, y1, x2, y2 = PLOT_CROP
    plot = _crop(img)
    vis_crop = img.copy()
    cv2.rectangle(vis_crop, (x1, y1), (x2, y2), (0, 212, 255), 2)
    steps.append({
        "name": "Crop Plot Area",
        "desc": f"PLOT_CROP = {PLOT_CROP}  →  {plot.shape[1]}×{plot.shape[0]} px  (top +5, bottom -5 from original calibration)",
        "images": [
            {"label": "Crop region (cyan box)", "b64": _to_b64(vis_crop)},
            {"label": "Cropped result",          "b64": _to_b64(plot)},
        ],
    })

    # ── Step 3: HSV yellow mask (raw, before morphology) ────────
    hsv = cv2.cvtColor(plot, cv2.COLOR_BGR2HSV)
    mask_raw = cv2.inRange(hsv, YELLOW_HSV_LOW, YELLOW_HSV_HIGH)
    px_raw   = int(np.sum(mask_raw > 0))
    # Highlight matched pixels in yellow on a dark background
    vis_raw        = np.zeros_like(plot)
    vis_raw[mask_raw > 0] = [0, 200, 255]
    steps.append({
        "name": "HSV Yellow Mask",
        "desc": (f"Low  {YELLOW_HSV_LOW.tolist()}  ·  High  {YELLOW_HSV_HIGH.tolist()}"
                 f"  →  {px_raw:,} pixels matched"),
        "images": [
            {"label": "Binary mask",                 "b64": _to_b64(mask_raw)},
            {"label": "Matched pixels highlighted",  "b64": _to_b64(vis_raw)},
        ],
    })

    # ── Step 4: Morphological cleanup ───────────────────────────
    mask     = _mask(plot)
    px_clean = int(np.sum(mask > 0))
    vis_clean        = np.zeros_like(plot)
    vis_clean[mask > 0] = [0, 200, 255]
    steps.append({
        "name": "Morphological Cleanup",
        "desc": (f"HSV mask  +  blob-size filter only (keep ≥15 px, no MORPH_CLOSE/OPEN)"
                 f"  →  {px_clean:,} px remain  (removed {px_raw - px_clean:,} isolated-noise px)"
                 f"  ·  I-V curve is derived directly from HSV pixels — two-branch loop preserved"),
        "images": [
            {"label": "Cleaned binary mask",         "b64": _to_b64(mask)},
            {"label": "Cleaned pixels highlighted",  "b64": _to_b64(vis_clean)},
        ],
    })

    # ── Step 5: Skeletonization ──────────────────────────────────
    skel    = _skel(mask)
    px_skel = int(np.sum(skel > 0))
    vis_skel = plot.copy()
    vis_skel[skel > 0] = [0, 255, 80]          # green centerline
    steps.append({
        "name": "Skeletonization",
        "desc": (f"Zhang-Suen thinning  →  1-pixel-wide centerline"
                 f"  ·  {px_skel:,} skeleton px  (from {px_clean:,} mask px)"),
        "images": [
            {"label": "Skeleton (binary)",        "b64": _to_b64(skel)},
            {"label": "Skeleton overlay (green)", "b64": _to_b64(vis_skel)},
        ],
    })

    # ── Step 6: Coordinate extraction → raw scatter ──────────────
    px_x, px_y = _coords(skel)
    if len(px_x) < 5:
        return {"steps": steps, "error": "Too few skeleton pixels — check HSV thresholds", "result": None}
    v, i = _to_iv(px_x, px_y, plot.shape)
    steps.append({
        "name": "Raw I-V Coordinates",
        "desc": (f"{len(v)} points extracted"
                 f"  ·  V ∈ [{v.min():.2f}, {v.max():.2f}]"
                 f"  ·  I ∈ [{i.min():.2f}, {i.max():.2f}]"),
        "chart": {
            "type": "scatter",
            "v": [round(x, 4) for x in v.tolist()],
            "i": [round(x, 4) for x in i.tolist()],
        },
    })

    # ── Step 7: Resampled curve ──────────────────────────────────
    vr, ir = _resample(v, i)
    steps.append({
        "name": "Resampled Curve (256 pts) — DTW input",
        "desc": ("Uniform resample onto shared V axis for DTW comparison. "
                 "np.interp requires a single-valued function — two-branch loop "
                 "points at the same voltage are collapsed to one value here. "
                 "Step 6 scatter above is the complete two-branch representation; "
                 "this step exists only to feed the DTW algorithm."),
        "chart": {
            "type": "line",
            "v": [round(x, 4) for x in vr.tolist()],
            "i": [round(x, 4) for x in ir.tolist()],
        },
    })

    # ── Step 8: Features ────────────────────────────────────────
    feats = _features(v, i, mask, plot.shape)
    steps.append({
        "name": "Feature Extraction (raw skeleton coords)",
        "desc": (f"Computed on raw two-branch skeleton coords, not the resampled curve. "
                 f"shape_type = {feats.get('shape_type')}"
                 f"  ·  slope = {feats.get('slope', 0):.3f}"
                 f"  ·  r² = {feats.get('r2_linear', 0):.3f}"
                 f"  ·  fill_ratio = {feats.get('fill_ratio', 0):.4f}"),
        "features": {k: round(val, 6) if isinstance(val, float) else val
                     for k, val in feats.items()},
    })

    result = {
        "features": feats,
        "v": [round(x, 4) for x in vr.tolist()],
        "i": [round(x, 4) for x in ir.tolist()],
    }
    return {"steps": steps, "result": result}

def process_image(image_path: str):
    img = cv2.imread(str(image_path))
    if img is None: return None
    plot  = _crop(img)
    mask  = _mask(plot)
    skel  = _skel(mask)
    px_x, px_y = _coords(skel)
    if len(px_x) < 5: return None
    v, i  = _to_iv(px_x, px_y, plot.shape)
    vr,ir = _resample(v, i)
    feats = _features(v, i, mask, plot.shape)
    # return lists for JSON serialisation
    return {
        "features": {k: round(v,6) if isinstance(v,float) else v
                     for k,v in feats.items()},
        "v": [round(x,4) for x in vr.tolist()],
        "i": [round(x,4) for x in ir.tolist()],
    }

def similarity_score(v1, i1, v2, i2, n=128):
    # Resample both curves onto a shared V axis (union range) so x-axes align
    v_min = min(v1.min(), v2.min())
    v_max = max(v1.max(), v2.max())
    vn    = np.linspace(v_min, v_max, n)
    i1r   = np.interp(vn, v1, i1, left=i1[0],  right=i1[-1])
    i2r   = np.interp(vn, v2, i2, left=i2[0],  right=i2[-1])

    # Normalize both curves to [-1, 1] so amplitude differences don't dominate
    def norm(arr):
        rng = arr.max() - arr.min()
        return (arr - arr.mean()) / rng if rng > 1e-6 else arr * 0
    i1n, i2n = norm(i1r), norm(i2r)

    # DTW on normalized curves
    dtw = np.full((n+1, n+1), np.inf); dtw[0, 0] = 0
    for a in range(1, n+1):
        for b in range(1, n+1):
            cost = abs(i1n[a-1] - i2n[b-1])
            dtw[a,b] = cost + min(dtw[a-1,b], dtw[a,b-1], dtw[a-1,b-1])

    # Normalize final DTW distance by path length → score 0-100
    # Perfect match = 0 DTW → 100. Max possible DTW on [-1,1] curves ≈ 2*n
    score = max(0.0, 1.0 - dtw[n,n] / n) * 100
    return round(float(score), 1)
