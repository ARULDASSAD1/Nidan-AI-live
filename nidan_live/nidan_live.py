import cv2
import numpy as np
from scipy.signal import butter, filtfilt, find_peaks
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision
import urllib.request
import os

# ═══════════════════════════════════════════════════
# DOWNLOAD MODEL IF NOT EXISTS
# ═══════════════════════════════════════════════════
MODEL_FILE = "face_landmarker.task"
MODEL_URL  = (
    "https://storage.googleapis.com/mediapipe-models/"
    "face_landmarker/face_landmarker/float16/1/face_landmarker.task"
)

if not os.path.exists(MODEL_FILE):
    print("Downloading face_landmarker.task model...")
    urllib.request.urlretrieve(MODEL_URL, MODEL_FILE)
    print("Download complete!")

# ═══════════════════════════════════════════════════
# SETTINGS
# ═══════════════════════════════════════════════════
BUFFER_SECONDS = 10
MIN_FRAMES     = 150

# ROI Landmark indices
FOREHEAD = [10, 338, 297, 332, 284, 251, 389, 356,
            454, 323, 361, 288, 397, 365, 379, 378]
L_CHEEK  = [116, 123, 147, 213, 192, 214, 210, 169]
R_CHEEK  = [345, 352, 376, 433, 416, 434, 430, 394]

# ═══════════════════════════════════════════════════
# INIT FACE LANDMARKER (new Tasks API)
# ═══════════════════════════════════════════════════
def init_face_landmarker():
    base_options = mp_python.BaseOptions(
        model_asset_path=MODEL_FILE
    )
    options = mp_vision.FaceLandmarkerOptions(
        base_options=base_options,
        num_faces=1,
        min_face_detection_confidence=0.5,
        min_face_presence_confidence=0.5,
        min_tracking_confidence=0.5,
        running_mode=mp_vision.RunningMode.VIDEO
    )
    return mp_vision.FaceLandmarker.create_from_options(options)

# ═══════════════════════════════════════════════════
# ROI HELPERS
# ═══════════════════════════════════════════════════
def get_roi_mean(frame, landmarks, indices, h, w):
    pts = []
    for i in indices:
        lm = landmarks[i]
        pts.append([int(lm.x * w), int(lm.y * h)])
    pts  = np.array(pts, dtype=np.int32)
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.fillConvexPoly(mask, cv2.convexHull(pts), 255)
    return cv2.mean(frame, mask=mask)  # (B, G, R, _)

def draw_roi(frame, landmarks, indices, h, w, color):
    pts = []
    for i in indices:
        lm = landmarks[i]
        pts.append([int(lm.x * w), int(lm.y * h)])
    pts  = np.array(pts, dtype=np.int32)
    hull = cv2.convexHull(pts)
    cv2.polylines(frame, [hull], True, color, 1)

# ═══════════════════════════════════════════════════
# SIGNAL PROCESSING
# ═══════════════════════════════════════════════════
def bandpass(signal, low, high, fps):
    nyq  = fps / 2.0
    low  = max(low,  0.01)
    high = min(high, nyq - 0.01)
    b, a = butter(4, [low / nyq, high / nyq], btype='band')
    return filtfilt(b, a, signal)

def normalize(signal):
    s   = np.array(signal, dtype=float)
    std = np.std(s)
    if std < 1e-8:
        return s
    return (s - np.mean(s)) / std

# ═══════════════════════════════════════════════════
# VITAL CALCULATIONS
# ═══════════════════════════════════════════════════
def calc_heart_rate(green_buf, fps):
    if len(green_buf) < fps * 4:
        return None
    sig      = normalize(green_buf)
    filtered = bandpass(sig, 0.8, 3.0, fps)
    window   = np.hanning(len(filtered))
    filtered = filtered * window
    fft      = np.abs(np.fft.rfft(filtered))
    freqs    = np.fft.rfftfreq(len(filtered), 1.0 / fps)
    valid    = (freqs >= 0.92) & (freqs <= 2.5)
    if not np.any(valid):
        return None
    peak_hz  = freqs[valid][np.argmax(fft[valid])]
    return round(peak_hz * 60, 1)

def calc_respiration(green_buf, fps):
    if len(green_buf) < fps * 6:
        return None
    sig      = normalize(green_buf)
    filtered = bandpass(sig, 0.15, 0.5, fps)
    window   = np.hanning(len(filtered))
    filtered = filtered * window
    fft      = np.abs(np.fft.rfft(filtered))
    freqs    = np.fft.rfftfreq(len(filtered), 1.0 / fps)
    valid    = (freqs >= 0.15) & (freqs <= 0.5)
    if not np.any(valid):
        return None
    peak_hz  = freqs[valid][np.argmax(fft[valid])]
    return round(peak_hz * 60, 1)

def calc_stress(green_buf, fps):
    if len(green_buf) < fps * 6:
        return None, None
    sig      = normalize(green_buf)
    filtered = bandpass(sig, 0.8, 3.0, fps)
    min_dist = int(fps * 0.4)
    peaks, _ = find_peaks(filtered, distance=min_dist, height=0.1)
    if len(peaks) < 4:
        return None, None
    rr       = np.diff(peaks) / fps * 1000
    rmssd    = float(np.sqrt(np.mean(np.diff(rr) ** 2)))
    stress   = "LOW" if rmssd > 40 else "MEDIUM" if rmssd > 20 else "HIGH"
    return round(rmssd, 1), stress

# ═══════════════════════════════════════════════════
# EMERGENCY DECISION
# ═══════════════════════════════════════════════════
def emergency_check(hr, rr, stress):
    reasons = []
    level   = "NORMAL"

    if hr is not None:
        if hr > 140 or hr < 45:
            reasons.append(f"CRITICAL Heart Rate: {hr} BPM")
            level = "EMERGENCY"
        elif hr > 110 or hr < 55:
            reasons.append(f"Abnormal Heart Rate: {hr} BPM")
            if level != "EMERGENCY":
                level = "HIGH_RISK"

    if rr is not None:
        if rr < 8 or rr > 30:
            reasons.append(f"CRITICAL Respiration: {rr}/min")
            level = "EMERGENCY"
        elif rr < 12 or rr > 24:
            reasons.append(f"Abnormal Respiration: {rr}/min")
            if level != "EMERGENCY":
                level = "HIGH_RISK"

    if stress == "HIGH":
        reasons.append("High physiological stress (HRV)")
        if level == "NORMAL":
            level = "HIGH_RISK"

    return level, reasons

# ═══════════════════════════════════════════════════
# DISPLAY DASHBOARD
# ═══════════════════════════════════════════════════
def draw_dashboard(frame, hr, rr, rmssd, stress,
                   level, reasons, progress):
    h, w = frame.shape[:2]

    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (340, h), (8, 18, 38), -1)
    cv2.addWeighted(overlay, 0.78, frame, 0.22, 0, frame)

    cv2.putText(frame, "NIDAN-LIVE",
                (12, 30), cv2.FONT_HERSHEY_SIMPLEX,
                0.7, (0, 172, 193), 2)
    cv2.putText(frame, "Vital Scanner  |  Phase 1",
                (12, 50), cv2.FONT_HERSHEY_SIMPLEX,
                0.38, (80, 130, 160), 1)

    bar = int(330 * min(progress, 1.0))
    cv2.rectangle(frame, (10, 60), (340, 70), (25, 45, 65), -1)
    cv2.rectangle(frame, (10, 60), (10 + bar, 70), (0, 172, 193), -1)
    pct = int(min(progress, 1.0) * 100)
    cv2.putText(frame, f"Signal quality: {pct}%",
                (12, 84), cv2.FONT_HERSHEY_SIMPLEX,
                0.36, (80, 130, 160), 1)

    vitals = [
        ("Heart Rate",
         f"{hr} BPM"         if hr     else "scanning...",
         (0, 230, 130)       if hr     else (60, 60, 60)),
        ("Respiration",
         f"{rr} breaths/min" if rr     else "scanning...",
         (80, 200, 255)      if rr     else (60, 60, 60)),
        ("Stress Level",
         stress              if stress  else "scanning...",
         (0, 200, 80)  if stress == "LOW"    else
         (0, 160, 255) if stress == "MEDIUM" else
         (0, 60, 220)  if stress == "HIGH"   else
         (60, 60, 60)),
        ("HRV (RMSSD)",
         f"{rmssd} ms"       if rmssd  else "scanning...",
         (160, 160, 160)     if rmssd  else (60, 60, 60)),
    ]

    for i, (label, value, color) in enumerate(vitals):
        y = 115 + i * 72
        cv2.putText(frame, label,
                    (12, y), cv2.FONT_HERSHEY_SIMPLEX,
                    0.4, (100, 140, 170), 1)
        cv2.putText(frame, value,
                    (12, y + 24), cv2.FONT_HERSHEY_SIMPLEX,
                    0.68, color, 2)
        cv2.line(frame, (12, y + 38),
                 (330, y + 38), (25, 45, 65), 1)

    cv2.putText(frame, "Normal: HR 60-100 | RR 12-20 | Stress LOW",
                (12, 415), cv2.FONT_HERSHEY_SIMPLEX,
                0.32, (60, 90, 110), 1)

    colors = {
        "EMERGENCY": (0,  30, 200),
        "HIGH_RISK": (0, 110, 200),
        "NORMAL":    (0, 160,  70),
    }
    labels = {
        "EMERGENCY": "!! EMERGENCY !!",
        "HIGH_RISK": "  HIGH RISK",
        "NORMAL":    "  NORMAL",
    }
    lc = colors.get(level, (50, 50, 50))
    ll = labels.get(level, "SCANNING...")

    cv2.rectangle(frame, (10, h - 115), (330, h - 75), lc, -1)
    cv2.putText(frame, ll,
                (18, h - 87), cv2.FONT_HERSHEY_SIMPLEX,
                0.65, (255, 255, 255), 2)

    for i, r in enumerate(reasons[:3]):
        cv2.putText(frame, f"* {r}",
                    (12, h - 60 + i * 18),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.35, (200, 200, 100), 1)

# ═══════════════════════════════════════════════════
# MAIN LOOP
# ═══════════════════════════════════════════════════
def run():
    detector = init_face_landmarker()
    cap      = cv2.VideoCapture(0)

    cap.set(cv2.CAP_PROP_FPS, 30)
    actual_fps = cap.get(cv2.CAP_PROP_FPS)
    fps        = actual_fps if actual_fps > 10 else 30
    BUFFER     = int(fps * BUFFER_SECONDS)

    g_buf      = []
    timestamp  = 0

    hr = rr = rmssd = stress = None
    level   = "NORMAL"
    reasons = []

    print(f"Camera FPS : {fps:.1f}")
    print("Keep still and look at the camera. Scanning vitals...")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame     = cv2.flip(frame, 1)
        h, w      = frame.shape[:2]
        rgb       = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # ── New Tasks API call ───────────────────────
        mp_image  = mp.Image(
            image_format=mp.ImageFormat.SRGB,
            data=rgb
        )
        timestamp += 1
        res = detector.detect_for_video(mp_image, timestamp)

        face_found = False

        if res.face_landmarks:
            lms        = res.face_landmarks[0]
            face_found = True

            draw_roi(frame, lms, FOREHEAD, h, w, (0, 255, 200))
            draw_roi(frame, lms, L_CHEEK,  h, w, (0, 200, 255))
            draw_roi(frame, lms, R_CHEEK,  h, w, (0, 200, 255))

            fh = get_roi_mean(frame, lms, FOREHEAD, h, w)
            lc = get_roi_mean(frame, lms, L_CHEEK,  h, w)
            rc = get_roi_mean(frame, lms, R_CHEEK,  h, w)

            vals = [v for v in [fh, lc, rc] if v]
            if vals:
                g_mean = np.mean([v[1] for v in vals])
                g_buf.append(g_mean)

                if len(g_buf) > BUFFER:
                    g_buf.pop(0)

                if len(g_buf) >= MIN_FRAMES and len(g_buf) % 30 == 0:
                    hr             = calc_heart_rate(g_buf, fps)
                    rr             = calc_respiration(g_buf, fps)
                    rmssd, stress  = calc_stress(g_buf, fps)
                    level, reasons = emergency_check(hr, rr, stress)

        if not face_found:
            cv2.putText(frame,
                        "No face detected — look at the camera",
                        (60, h // 2),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.7, (0, 0, 200), 2)

        progress = len(g_buf) / MIN_FRAMES
        draw_dashboard(frame, hr, rr, rmssd, stress,
                       level, reasons, progress)

        cv2.imshow("Nidan-Live  |  Phase 1 — Vital Scanner", frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

    return {
        "heart_rate":  hr,
        "respiration": rr,
        "hrv_rmssd":   rmssd,
        "stress":      stress,
        "emergency":   level,
    }

if __name__ == "__main__":
    result = run()
    print("\n── SCAN COMPLETE ──")
    for k, v in result.items():
        print(f"  {k:12s}: {v}")