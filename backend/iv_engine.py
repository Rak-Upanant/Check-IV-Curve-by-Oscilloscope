# backend/iv_engine.py  — Phase 1 pipeline wrapped as importable module

import cv2
import numpy as np
from scipy.spatial.distance import directed_hausdorff
from skimage.morphology import skeletonize
from pathlib import Path

PLOT_CROP       = (10, 55, 470, 530)
X_RANGE         = (-10.0, 10.0)
Y_RANGE         = (-12.0, 10.0)
YELLOW_HSV_LOW  = np.array([15, 80, 80])
YELLOW_HSV_HIGH = np.array([45, 255, 255])

def _crop(img):
    x1,y1,x2,y2 = PLOT_CROP
    return img[y1:y2, x1:x2]

def _mask(plot):
    hsv  = cv2.cvtColor(plot, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, YELLOW_HSV_LOW, YELLOW_HSV_HIGH)
    k    = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3,3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN,  k, iterations=1)
    return mask

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
    def resamp(v,i):
        vn = np.linspace(v.min(),v.max(),n)
        return np.interp(vn,v,i)
    i1r, i2r = resamp(v1,i1), resamp(v2,i2)
    # DTW (simplified O(n²))
    dtw = np.full((n+1,n+1), np.inf); dtw[0,0]=0
    for a in range(1,n+1):
        for b in range(1,n+1):
            cost = abs(i1r[a-1]-i2r[b-1])
            dtw[a,b]=cost+min(dtw[a-1,b],dtw[a,b-1],dtw[a-1,b-1])
    return round(float(max(0, 100 - dtw[n,n]*2)), 1)
