"""V467-A calibration (READ-ONLY, offline).

Scores the 32 frozen production pairs of the V465-B1 cohort with the
speech-locked telemetry (v_over_u, corr_rms) and compares its separation to
the authoritative V465 mouth_over_frame. Uses the SAME frozen artifacts and
the SAME mouth ROI as the V465-B1 audit; only the normalization differs
(temporal / speech instead of spatial / frame).
"""
import json, subprocess, wave, sys
import numpy as np

MOTION_ROI = dict(cx=0.5, cy=0.60, w=0.28, h=0.12)
N = 16
PAD = 0.05
EPS = 1e-6
VOICED_FRACTION = 0.15
PEAK_FLOOR = 1e-3
MIN_V, MIN_U = 4, 3
UNVOICED_FLOOR = 0.5
WIN = 0.02
MAX_LAG = 3
FPS = 30.0


def dur(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "csv=p=0", p], capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except Exception:
        return None


def frames_at(path, times, w=720, h=720):
    out = []
    for t in times:
        r = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.4f}", "-i", path,
                            "-frames:v", "1", "-vf", f"scale={w}:{h}", "-pix_fmt", "gray",
                            "-f", "rawvideo", "-"], capture_output=True)
        a = np.frombuffer(r.stdout, dtype=np.uint8)
        if a.size < w * h:
            return None
        out.append(a[: w * h].reshape(h, w).astype(np.float64))
    return np.stack(out)


def band(F, roi, w=720, h=720):
    bw = max(8, round(w * roi["w"]))
    bh = max(8, round(h * roi["h"]))
    bx = min(max(round(roi["cx"] * w - bw / 2), 0), w - bw)
    by = min(max(round(roi["cy"] * h - bh / 2), 0), h - bh)
    return F[:, by:by + bh, bx:bx + bw]


def read_wav(path):
    try:
        with wave.open(path, "rb") as f:
            sr = f.getframerate()
            ch = f.getnchannels()
            sw = f.getsampwidth()
            raw = f.readframes(f.getnframes())
    except Exception:
        return None
    if sw != 2:
        return None
    a = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768.0
    if ch > 1:
        a = a.reshape(-1, ch).mean(axis=1)
    return a, sr


def envelope(samples, sr):
    win = max(1, int(round(WIN * sr)))
    n = len(samples) // win
    if n < 4:
        return None
    e = np.sqrt((samples[: n * win].reshape(n, win) ** 2).mean(axis=1))
    peak = e.max()
    if peak < PEAK_FLOOR:
        return None
    return e, peak, win / sr


def lookup(env, t):
    e, peak, step = env
    i = int(t / step)
    return e[i] if 0 <= i < len(e) else 0.0


def pearson(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    if len(a) < 3:
        return None
    if a.std() < 1e-12 or b.std() < 1e-12:
        return None
    return float(np.corrcoef(a, b)[0, 1])


def speech_lock(edits, times, env):
    guards = []
    if env is None:
        return {"available": False, "guards": ["audio_unreadable"]}
    e, peak, step = env
    rms = np.array([lookup(env, t) for t in times])
    thr = VOICED_FRACTION * peak
    voiced = rms >= thr
    nv, nu = int(voiced.sum()), int((~voiced).sum())
    if nv < MIN_V or nu < MIN_U:
        guards.append("insufficient_voiced_unvoiced")
    vmean = float(np.mean(edits[voiced])) if nv else None
    umean = float(np.mean(edits[~voiced])) if nu else None
    if umean is not None and umean < UNVOICED_FLOOR:
        guards.append("degenerate_unvoiced_denominator")
    ratio = None
    if vmean is not None and umean is not None and "degenerate_unvoiced_denominator" not in guards:
        ratio = round(vmean / (umean + EPS), 3)
    c0 = pearson(edits, rms)
    best, best_lag = c0, 0
    for lag in range(-MAX_LAG, MAX_LAG + 1):
        shifted = np.array([lookup(env, t + lag / FPS) for t in times])
        c = pearson(edits, shifted)
        if c is not None and (best is None or c > best):
            best, best_lag = c, lag
    conf = "high_confidence" if (len(edits) >= 16 and not guards) else "low_confidence"
    return {"available": True, "v_over_u": ratio, "corr_rms_zero_lag": None if c0 is None else round(c0, 3),
            "corr_rms_best_lag": None if best is None else round(best, 3),
            "best_lag_ms": round(best_lag / FPS * 1000), "voiced": nv, "unvoiced": nu,
            "confidence": conf, "guards": guards}


def auc(pos, neg):
    pos, neg = [p for p in pos if p is not None], [n for n in neg if n is not None]
    if not pos or not neg:
        return None
    w = sum((1.0 if p > n else 0.5 if p == n else 0.0) for p in pos for n in neg)
    return round(w / (len(pos) * len(neg)), 3)


pairs = json.load(open("/tmp/v465b1/pairs.json"))
prev = {r["id"]: r for r in json.load(open("/tmp/v465b1/scored3.json"))}
rows = []
for p in pairs:
    di, do = dur(p["in"]), dur(p["out"])
    if not di or not do:
        continue
    d = min(di, do)
    start, end = PAD * d, (1 - PAD) * d
    times = [start + (end - start) * i / (N - 1) for i in range(N)]
    A = frames_at(p["in"], times)
    B = frames_at(p["out"], times)
    if A is None or B is None:
        continue
    edits = np.abs(band(B, MOTION_ROI) - band(A, MOTION_ROI)).reshape(N, -1).mean(axis=1)
    wav = p["in"].rsplit("_in.mp4", 1)[0].rsplit(".mp4", 1)[0] + ".wav"
    pcm = read_wav(wav)
    env = envelope(*pcm) if pcm else None
    sl = speech_lock(edits, times, env)
    rows.append({"id": p["id"], "scene": p["scene"], "label": p["label"],
                 "mouth_over_frame": prev.get(p["id"], {}).get("mouth_over_frame"),
                 "mouth_edit_mean": round(float(edits.mean()), 3), **sl})
    print(rows[-1], flush=True)

json.dump(rows, open("/tmp/v467/scored.json", "w"), indent=1)
mv = [r for r in rows if r["label"] == "MOVED"]
no = [r for r in rows if r["label"] == "NOOP"]
print("\nn_moved", len(mv), "n_noop", len(no))
for k in ("mouth_over_frame", "v_over_u", "corr_rms_zero_lag", "corr_rms_best_lag"):
    print(f"AUC {k:22s} = {auc([r.get(k) for r in mv], [r.get(k) for r in no])}")
