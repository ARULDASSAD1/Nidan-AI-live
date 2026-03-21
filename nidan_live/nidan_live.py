"""
NIDAN-LIVE — Complete Medical Scanner
Features:
  - 60 second timed scan
  - BPM + Stress + Respiration
  - Eye analysis (blink rate + redness)
  - Final result screen with triage
  - Save result to text file
  - Both camera window + terminal output

INSTALL:   pip install opencv-python mediapipe numpy scipy
DOWNLOAD:  python nidan_live.py --download
RUN:       python nidan_live.py
"""

import cv2, numpy as np, mediapipe as mp
import time, sys, os, urllib.request, datetime
from collections import deque
from scipy.signal import butter, filtfilt, find_peaks, welch, savgol_filter
from scipy import signal as scipy_signal
from scipy.ndimage import uniform_filter1d

# ── Constants ─────────────────────────────────────────────────────
SCAN_DURATION  = 60          # seconds for full scan
BUFFER_SIZE    = 150
FPS_DEFAULT    = 30
HR_LO_HZ       = 50  / 60.0
HR_HI_HZ       = 180 / 60.0
RR_LO_HZ       = 0.13
RR_HI_HZ       = 0.5

FOREHEAD_LM    = [10, 109, 67, 103, 54, 21, 162, 127]
CHEEK_LM       = [205, 425]
NOSE_TIP       = 1

# Eye landmarks (MediaPipe 478-point model)
LEFT_EYE_LM    = [33, 160, 158, 133, 153, 144]   # left eye outline
RIGHT_EYE_LM   = [362, 385, 387, 263, 373, 380]  # right eye outline
LEFT_IRIS      = [468, 469, 470, 471, 472]
RIGHT_IRIS     = [473, 474, 475, 476, 477]

# Eye aspect ratio threshold for blink
EAR_BLINK_THRESH = 0.22
EAR_CONSEC_FRAMES = 2

MODEL_PATH  = "face_landmarker.task"
MODEL_URL   = ("https://storage.googleapis.com/mediapipe-models/"
               "face_landmarker/face_landmarker/float16/1/face_landmarker.task")

# Colors BGR
TEAL   = (200,220, 50); DIM    = (130,130,130)
GREEN  = ( 80,220, 80); RED    = ( 60, 60,220)
ORANGE = ( 50,160,255); WHITE  = (240,240,240)
YELLOW = ( 50,220,220); PURPLE = (200, 80,200)
FONT   = cv2.FONT_HERSHEY_SIMPLEX

TRIAGE = {
    "EMERGENCY":{"color":(0,0,220),
                 "next":"Go to AIIMS Emergency NOW",
                 "emoji":"🔴"},
    "URGENT":   {"color":(0,100,255),
                 "next":"Visit District Hospital today",
                 "emoji":"🟠"},
    "MODERATE": {"color":(0,200,255),
                 "next":"Visit Mohalla Clinic this week",
                 "emoji":"🟡"},
    "NORMAL":   {"color":(50,200,50),
                 "next":"You are doing well. Stay healthy!",
                 "emoji":"🟢"},
}


# ══════════════════════════════════════════════════════════════════
#  DOWNLOAD + MEDIAPIPE
# ══════════════════════════════════════════════════════════════════
def download():
    if os.path.exists(MODEL_PATH):
        print("[OK] Model found."); return True
    print("[Nidan-Live] Downloading model (~30 MB)...")
    try:
        def p(c,b,t):
            print(f"\r  {min(int(c*b*100/t),100)}%",end="",flush=True)
        urllib.request.urlretrieve(MODEL_URL,MODEL_PATH,reporthook=p)
        print("\n[OK] Done!"); return True
    except Exception as e:
        print(f"\n[ERROR] {e}"); return False

def init_mp():
    BO=mp.tasks.BaseOptions; FL=mp.tasks.vision.FaceLandmarker
    FO=mp.tasks.vision.FaceLandmarkerOptions; RM=mp.tasks.vision.RunningMode
    return FL.create_from_options(FO(
        base_options=BO(model_asset_path=MODEL_PATH),
        running_mode=RM.IMAGE, num_faces=1,
        min_face_detection_confidence=.4,
        min_face_presence_confidence=.4,
        min_tracking_confidence=.4))

def detect(lmk, rgb, w, h):
    r=lmk.detect(mp.Image(image_format=mp.ImageFormat.SRGB,data=rgb))
    if not r.face_landmarks: return None
    return [(int(l.x*w),int(l.y*h)) for l in r.face_landmarks[0]]


# ══════════════════════════════════════════════════════════════════
#  ROI EXTRACTION
# ══════════════════════════════════════════════════════════════════
def get_rgb(frame,lm,ids,w,h,sz=28):
    rv,gv,bv,boxes=[],[],[],[]
    for i in ids:
        if i>=len(lm): continue
        cx,cy=lm[i]; x1,y1=max(cx-sz,0),max(cy-sz,0)
        x2,y2=min(cx+sz,w),min(cy+sz,h)
        roi=frame[y1:y2,x1:x2]
        if roi.size==0: continue
        bv.append(roi[:,:,0].mean())
        gv.append(roi[:,:,1].mean())
        rv.append(roi[:,:,2].mean())
        boxes.append((x1,y1,x2,y2))
    if not gv: return 0.,0.,0.,boxes
    return float(np.mean(rv)),float(np.mean(gv)),float(np.mean(bv)),boxes


# ══════════════════════════════════════════════════════════════════
#  SIGNAL BUFFER
# ══════════════════════════════════════════════════════════════════
class Buffer:
    def __init__(self):
        self.R=[]; self.G=[]; self.B=[]
        self.T=[]; self.NY=[]; self.bpms=[]

    def push(self,r,g,b,t,ny=0.):
        if len(self.G)>10:
            mg=float(np.mean(self.G[-20:]))
            if abs(g-mg)>12: g=self.G[-1];r=self.R[-1];b=self.B[-1]
        self.R.append(r);self.G.append(g);self.B.append(b)
        self.T.append(t);self.NY.append(ny)
        if len(self.G)>BUFFER_SIZE:
            self.R=self.R[-BUFFER_SIZE:];self.G=self.G[-BUFFER_SIZE:]
            self.B=self.B[-BUFFER_SIZE:];self.T=self.T[-BUFFER_SIZE:]
            self.NY=self.NY[-BUFFER_SIZE:];self.bpms=self.bpms[-50:]

    def fps(self):
        if len(self.T)<2: return FPS_DEFAULT
        e=self.T[-1]-self.T[0]
        return float(len(self.T))/e if e>0 else FPS_DEFAULT

    def ready(self,n=60): return len(self.G)>=n
    def arrays(self): return np.array(self.R),np.array(self.G),np.array(self.B)
    def times(self): return np.array(self.T)


# ══════════════════════════════════════════════════════════════════
#  rPPG SIGNAL PROCESSING
# ══════════════════════════════════════════════════════════════════
def bp(sig,fs,lo,hi,order=3):
    nyq=fs/2.
    try:
        b,a=butter(order,[max(lo/nyq,.005),min(hi/nyq,.995)],btype='band')
        if len(sig)<3*max(len(a),len(b)): return sig
        return filtfilt(b,a,sig)
    except: return sig

def preprocess(sig,times):
    L=len(sig)
    if L<20: return sig
    s=scipy_signal.detrend(sig,type='linear')
    even=np.linspace(times[0],times[-1],L)
    try: s=np.interp(even,times,s)
    except: pass
    s=np.hamming(L)*s
    n=np.linalg.norm(s)
    return s/n if n>1e-9 else s

def chrom(R,G,B,fs,T):
    if len(R)<30: return np.zeros(len(R))
    Rn=R/(np.mean(R)+1e-9); Gn=G/(np.mean(G)+1e-9); Bn=B/(np.mean(B)+1e-9)
    Xf=bp(3.*Rn-2.*Gn,fs,HR_LO_HZ,HR_HI_HZ)
    Yf=bp(1.5*Rn+Gn-1.5*Bn,fs,HR_LO_HZ,HR_HI_HZ)
    a=(np.std(Xf)+1e-9)/(np.std(Yf)+1e-9)
    return preprocess(Xf-a*Yf,T)

def get_bpm(sig,fps):
    L=len(sig)
    if L<30: return 0.,0.
    raw=np.fft.rfft(sig*30)
    fbpm=60.*fps/L*np.arange(L//2+1)
    power=np.abs(raw)**2
    idx=np.where((fbpm>50)&(fbpm<180))
    if not len(idx[0]): return 0.,0.
    p=power[idx]; f=fbpm[idx]; pk=np.argmax(p)
    conf=min(float(p[pk]/(np.mean(p)+1e-9))/8.,1.)
    return round(f[pk],1),round(conf,2)

def best_bpm(buf):
    R,G,B=buf.arrays(); T=buf.times(); fs=buf.fps()
    best=(0.,0.,"---",np.zeros(10))
    for name,fn,args in [
        ("CHROM", chrom,      (R,G,B,fs,T)),
        ("GREEN", preprocess, (np.array(G),T)),
    ]:
        try:
            s=fn(*args); b,c=get_bpm(s,fs)
            if 40<b<185 and c>best[1]: best=(b,c,name,s)
        except: pass
    return best

def get_stress(sig,fps,bpm):
    rmssd,sdnn=0.,0.
    if len(sig)>=fps*4:
        try:
            peaks,_=find_peaks(sig,distance=int(fps*.28),prominence=0.001)
            if len(peaks)>=3:
                ibi=np.diff(peaks)*(1000./fps)
                ibi=ibi[(ibi>250)&(ibi<1700)]
                if len(ibi)>=2:
                    rmssd=float(np.sqrt(np.mean(np.diff(ibi)**2)))
                    sdnn=float(np.std(ibi))
        except: pass
    if rmssd<1. and bpm>0:
        if   bpm>100: rmssd=15.
        elif bpm>85:  rmssd=25.
        elif bpm>70:  rmssd=35.
        elif bpm>60:  rmssd=45.
        else:         rmssd=50.
        sdnn=rmssd*0.8
    hi=min(rmssd/70.,1.)*.65+min(sdnn/55.,1.)*.35
    stress=max(5,min(int((1.-hi)*100),95))
    lb=("HIGH STRESS" if stress>=80 else "MODERATE" if stress>=58
        else "NORMAL" if stress>=32 else "RELAXED")
    return round(rmssd,1),round(sdnn,1),lb,stress

def get_rr(ny_arr,fps):
    n=len(ny_arr)
    if n<fps*6: return 0.,0.
    sig=scipy_signal.detrend(np.array(ny_arr,dtype=float),type='linear')*1000.
    sig=uniform_filter1d(sig,size=max(int(fps*.3),1))
    sig_f=bp(sig,fps,RR_LO_HZ,RR_HI_HZ,order=2)
    dur=n/fps
    try:
        peaks,_=find_peaks(sig_f,distance=int(fps*1.8))
        if len(peaks)>=2:
            rr=len(peaks)/dur*60.
            if 6<rr<35: return round(rr,1),0.8
    except: pass
    try:
        zc=np.where(np.diff(np.sign(sig_f)))[0]
        if len(zc)>=4:
            rr=len(zc)/2./dur*60.
            if 6<rr<35: return round(rr,1),0.6
    except: pass
    return 0.,0.

def sig_quality(R,G,B,stable):
    if len(G)<30: return 0.
    g=np.array(G)[-min(len(G),90):]
    r=np.array(R)[-min(len(R),90):]
    b=np.array(B)[-min(len(B),90):]
    v=np.var(g)
    if v<0.01: return 0.05
    ck=1.0 if np.mean(r)>np.mean(b) else 0.4
    return round(min(min(np.log1p(v)/np.log1p(25),1.)*.55+stable*.30+ck*.15,1.),2)


# ══════════════════════════════════════════════════════════════════
#  EYE ANALYZER
# ══════════════════════════════════════════════════════════════════
class EyeAnalyzer:
    """
    Analyzes eyes for:
    1. Blink Rate  — fatigue/stress indicator
    2. Eye Redness — health indicator
    3. Eye Openness — alertness
    """
    def __init__(self):
        self.blink_count    = 0
        self.blink_frames   = 0
        self.blink_history  = deque(maxlen=300)  # last 10s at 30fps
        self.ear_history    = deque(maxlen=90)
        self.redness_hist   = deque(maxlen=30)
        self.start_time     = time.time()

    def _eye_aspect_ratio(self, eye_pts):
        """
        EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
        Standard blink detection formula.
        """
        if len(eye_pts) < 6: return 0.3
        p1,p2,p3,p4,p5,p6 = [np.array(eye_pts[i]) for i in range(6)]
        A = np.linalg.norm(p2-p6)
        B = np.linalg.norm(p3-p5)
        C = np.linalg.norm(p1-p4)
        if C < 1e-5: return 0.3
        return (A+B)/(2.*C)

    def _get_redness(self, frame, eye_lm_ids, landmarks, w, h):
        """
        Check redness of sclera (white part of eye).
        Red channel dominance over green = redness.
        """
        if not landmarks or len(landmarks) < max(eye_lm_ids)+1:
            return 0.
        pts = [landmarks[i] for i in eye_lm_ids]
        cx  = int(np.mean([p[0] for p in pts]))
        cy  = int(np.mean([p[1] for p in pts]))
        r   = 12
        x1,y1 = max(cx-r,0), max(cy-r,0)
        x2,y2 = min(cx+r,w), min(cy+r,h)
        roi = frame[y1:y2,x1:x2]
        if roi.size==0: return 0.
        # Redness = red channel / (green + 1) ratio
        red_ch = roi[:,:,2].mean()
        grn_ch = roi[:,:,1].mean()+1e-5
        return float(red_ch/grn_ch)

    def analyze(self, frame, landmarks, w, h):
        """
        Run full eye analysis on current frame.
        Returns modified frame with eye overlays.
        """
        if landmarks is None or len(landmarks)<478:
            return frame

        result = frame.copy()

        # ── Get eye landmark coordinates ──────────────────────────
        left_pts  = [landmarks[i] for i in LEFT_EYE_LM  if i<len(landmarks)]
        right_pts = [landmarks[i] for i in RIGHT_EYE_LM if i<len(landmarks)]

        # ── EAR calculation ───────────────────────────────────────
        left_ear  = self._eye_aspect_ratio(left_pts)
        right_ear = self._eye_aspect_ratio(right_pts)
        ear       = (left_ear + right_ear) / 2.
        self.ear_history.append(ear)

        # ── Blink detection ───────────────────────────────────────
        if ear < EAR_BLINK_THRESH:
            self.blink_frames += 1
        else:
            if self.blink_frames >= EAR_CONSEC_FRAMES:
                self.blink_count += 1
                self.blink_history.append(time.time())
            self.blink_frames = 0

        # ── Eye redness ───────────────────────────────────────────
        redness_l = self._get_redness(frame, LEFT_EYE_LM,  landmarks, w, h)
        redness_r = self._get_redness(frame, RIGHT_EYE_LM, landmarks, w, h)
        redness   = (redness_l + redness_r) / 2.
        self.redness_hist.append(redness)

        # ── Draw eye markers ──────────────────────────────────────
        for pts, ids in [(left_pts, LEFT_EYE_LM),
                         (right_pts, RIGHT_EYE_LM)]:
            if len(pts) >= 2:
                for i in range(len(pts)):
                    p1 = pts[i]
                    p2 = pts[(i+1) % len(pts)]
                    eye_col = RED if redness>1.4 else TEAL
                    cv2.line(result, p1, p2, eye_col, 1)

        # Draw iris circles if available
        for iris_ids in [LEFT_IRIS, RIGHT_IRIS]:
            valid = [landmarks[i] for i in iris_ids if i<len(landmarks)]
            if len(valid)>=4:
                cx = int(np.mean([p[0] for p in valid]))
                cy = int(np.mean([p[1] for p in valid]))
                r  = int(np.mean([abs(p[0]-cx) for p in valid])) + 2
                cv2.circle(result,(cx,cy),r,YELLOW,1)

        return result

    def blink_rate(self):
        """Blinks per minute in last 60 seconds."""
        now=time.time()
        recent=[t for t in self.blink_history if now-t<60.]
        return len(recent)

    def avg_redness(self):
        if not self.redness_hist: return 1.0
        return float(np.mean(self.redness_hist))

    def avg_ear(self):
        if not self.ear_history: return 0.3
        return float(np.mean(self.ear_history))

    def eye_status(self):
        """Returns human-readable eye health status."""
        br = self.blink_rate()
        rd = self.avg_redness()
        results = []
        # Normal blink rate: 15-20/min
        if br < 8:
            results.append("Low blink (fatigue)")
        elif br > 30:
            results.append("High blink (irritation)")
        else:
            results.append("Blink normal")
        if rd > 1.5:
            results.append("Eyes red")
        elif rd > 1.3:
            results.append("Mild redness")
        else:
            results.append("Eyes clear")
        return results


# ══════════════════════════════════════════════════════════════════
#  TRIAGE
# ══════════════════════════════════════════════════════════════════
def do_triage(bpm,stress,rr):
    if 0<bpm<40 or bpm>150: return "EMERGENCY"
    if bpm>110 or stress>78: return "URGENT"
    if rr>24 or (0<rr<10):  return "URGENT"
    if bpm>95  or stress>56: return "MODERATE"
    return "NORMAL"


# ══════════════════════════════════════════════════════════════════
#  SAVE RESULT
# ══════════════════════════════════════════════════════════════════
def save_result(bpm,sl,stress,rr,rmssd,sdnn,tl,eye_status,blink_rate,redness):
    now = datetime.datetime.now()
    fname = f"nidan_result_{now.strftime('%Y%m%d_%H%M%S')}.txt"
    lines = [
        "╔══════════════════════════════════════════════╗",
        "║         NIDAN-LIVE  SCAN RESULT              ║",
        "╠══════════════════════════════════════════════╣",
        f"║  Date/Time    : {now.strftime('%d-%m-%Y  %I:%M %p'):<28}║",
        "╠══════════════════════════════════════════════╣",
        f"║  HEART RATE   : {int(bpm)} BPM{'':<27}║",
        f"║  STRESS       : {sl:<16} ({stress}%){'':<8}║",
        f"║  RESPIRATION  : {rr:.0f} breaths/min{'':<22}║",
        "╠══════════════════════════════════════════════╣",
        f"║  HRV RMSSD    : {rmssd:.1f} ms{'':<28}║",
        f"║  HRV SDNN     : {sdnn:.1f} ms{'':<28}║",
        "╠══════════════════════════════════════════════╣",
        f"║  BLINK RATE   : {blink_rate} per min{'':<24}║",
        f"║  EYE STATUS   : {', '.join(eye_status):<29}║",
        "╠══════════════════════════════════════════════╣",
        f"║  TRIAGE LEVEL : {tl:<29}║",
        f"║  NEXT STEP    : {TRIAGE[tl]['next'][:29]:<29}║",
        "╚══════════════════════════════════════════════╝",
    ]
    with open(fname,"w",encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"\n[Saved] Result saved to: {fname}")
    return fname


# ══════════════════════════════════════════════════════════════════
#  UI DRAWING
# ══════════════════════════════════════════════════════════════════
def draw_progress_bar(f, elapsed, total, w, h):
    """Top progress bar showing scan time remaining."""
    pct  = min(elapsed/total, 1.0)
    bar_w= w-40
    bx,by= 20, 62
    bh   = 12
    remaining = max(int(total-elapsed),0)

    # Background
    cv2.rectangle(f,(bx,by),(bx+bar_w,by+bh),(30,30,30),-1)
    # Fill
    filled = int(pct*bar_w)
    col = GREEN if pct<0.7 else ORANGE if pct<0.9 else RED
    cv2.rectangle(f,(bx,by),(bx+filled,by+bh),col,-1)
    # Border
    cv2.rectangle(f,(bx,by),(bx+bar_w,by+bh),DIM,1)
    # Text
    cv2.putText(f,f"Scan: {remaining}s remaining",
                (bx,by-4),FONT,.38,DIM,1)
    cv2.putText(f,f"{int(pct*100)}%",
                (bx+bar_w+6,by+10),FONT,.38,col,1)


def draw_header(f,w):
    cv2.rectangle(f,(0,0),(w,58),(5,5,15),-1)
    cv2.putText(f,"NIDAN-LIVE",(18,40),FONT,.9,TEAL,2)
    cv2.putText(f,"| AI Medical Scanner",(178,40),FONT,.5,DIM,1)


def draw_metric_box(f,title,value,unit,status,color,x,y,bw=200,bh=115):
    cv2.rectangle(f,(x,y),(x+bw,y+bh),(12,18,28),-1)
    cv2.rectangle(f,(x,y),(x+bw,y+bh),TEAL,1)
    cv2.rectangle(f,(x,y),(x+bw,y+5),color,-1)
    cv2.putText(f,title,(x+8,y+20),FONT,.38,DIM,1)
    cv2.line(f,(x+2,y+26),(x+bw-2,y+26),DIM,1)
    cv2.putText(f,value,(x+8,y+78),FONT,2.0,color,3)
    cv2.putText(f,unit, (x+8,y+95),FONT,.38,DIM,1)
    cv2.putText(f,status,(x+8,y+110),FONT,.36,color,1)


def draw_stress_box(f,sl,stress,x,y,bw=200,bh=115):
    color=RED if stress>70 else ORANGE if stress>45 else GREEN
    cv2.rectangle(f,(x,y),(x+bw,y+bh),(12,18,28),-1)
    cv2.rectangle(f,(x,y),(x+bw,y+bh),TEAL,1)
    cv2.rectangle(f,(x,y),(x+bw,y+5),color,-1)
    cv2.putText(f,"STRESS",(x+8,y+20),FONT,.38,DIM,1)
    cv2.line(f,(x+2,y+26),(x+bw-2,y+26),DIM,1)
    cv2.putText(f,sl,(x+8,y+62),FONT,.58,color,2)
    cv2.putText(f,f"{stress}%",(x+8,y+88),FONT,.78,color,2)
    bw2=int(stress/100.*(bw-16))
    cv2.rectangle(f,(x+8,y+96),(x+bw-8,y+108),(40,40,40),-1)
    cv2.rectangle(f,(x+8,y+96),(x+8+bw2,y+108),color,-1)


def draw_eye_box(f,blink_rate,redness,ear,x,y,bw=200,bh=115):
    rd_col=RED if redness>1.5 else ORANGE if redness>1.3 else GREEN
    cv2.rectangle(f,(x,y),(x+bw,y+bh),(12,18,28),-1)
    cv2.rectangle(f,(x,y),(x+bw,y+bh),TEAL,1)
    cv2.rectangle(f,(x,y),(x+bw,y+5),rd_col,-1)
    cv2.putText(f,"EYE SCAN",(x+8,y+20),FONT,.38,DIM,1)
    cv2.line(f,(x+2,y+26),(x+bw-2,y+26),DIM,1)
    cv2.putText(f,f"Blink: {blink_rate}/min",(x+8,y+48),FONT,.4,WHITE,1)
    rstr="Clear" if redness<1.3 else "Mild Red" if redness<1.5 else "RED"
    cv2.putText(f,f"Eyes : {rstr}",(x+8,y+68),FONT,.4,rd_col,1)
    open_pct=min(int(ear/0.4*100),100)
    cv2.putText(f,f"Open : {open_pct}%",(x+8,y+88),FONT,.4,WHITE,1)
    blink_st="Normal" if 10<=blink_rate<=25 else "Low" if blink_rate<10 else "High"
    cv2.putText(f,blink_st,(x+8,y+108),FONT,.36,GREEN if blink_st=="Normal" else ORANGE,1)


def draw_wave(f,sig,x,y,ww,wh,q):
    cv2.rectangle(f,(x,y),(x+ww,y+wh),(8,8,18),-1)
    cv2.rectangle(f,(x,y),(x+ww,y+wh),DIM,1)
    cv2.putText(f,"PULSE WAVE",(x+8,y+14),FONT,.36,DIM,1)
    if len(sig)<10: return
    d=sig[-min(len(sig),ww-20):]
    mn,mx=d.min(),d.max()
    n=(d-mn)/(mx-mn if mx!=mn else 1.)
    my=y+wh//2; amp=wh//2-10
    col=GREEN if q>.5 else RED
    pts=[(x+10+i,my-int((v-.5)*amp*2)) for i,v in enumerate(n)]
    for i in range(1,len(pts)):
        cv2.line(f,pts[i-1],pts[i],(col[0]//4,col[1]//4,col[2]//4),3)
        cv2.line(f,pts[i-1],pts[i],col,1)


def draw_triage_banner(f,level,h,w):
    info=TRIAGE[level]
    cv2.rectangle(f,(0,h-48),(w,h),(5,5,15),-1)
    cv2.rectangle(f,(0,h-48),(8,h),info["color"],-1)
    cv2.putText(f,f"TRIAGE: {level}",(18,h-26),FONT,.62,info["color"],2)
    cv2.putText(f,info["next"],(18,h-8),FONT,.4,DIM,1)


def draw_heatmap(f,lm,intensity):
    if intensity<.05 or not lm: return f
    mask=np.zeros(f.shape[:2],dtype=np.uint8)
    cv2.fillConvexPoly(mask,cv2.convexHull(np.array(lm,dtype=np.int32)),255)
    col=cv2.applyColorMap(cv2.GaussianBlur(mask,(51,51),0),cv2.COLORMAP_MAGMA)
    a=.12+intensity*.20; bl=cv2.addWeighted(col,a,f,1-a*.5,0)
    res=f.copy(); res[mask>0]=bl[mask>0]; return res


def draw_rois(f,boxes,q):
    c=(0,255,120) if q>.65 else (0,200,255) if q>.35 else (0,80,255)
    for x1,y1,x2,y2 in boxes:
        cv2.rectangle(f,(x1,y1),(x2,y2),c,1)
        ov=f.copy(); cv2.rectangle(ov,(x1,y1),(x2,y2),c,-1)
        cv2.addWeighted(ov,.06,f,.94,0,f)
    return f


# ══════════════════════════════════════════════════════════════════
#  FINAL RESULT SCREEN
# ══════════════════════════════════════════════════════════════════
def show_result_screen(bpm, sl, stress, rr, rmssd, sdnn,
                       tl, eye_an, fname, w, h):
    """
    Full-screen result display after scan completes.
    Shows for 15 seconds or until Q pressed.
    """
    info    = TRIAGE[tl]
    tl_col  = info["color"]
    br      = eye_an.blink_rate()
    rd      = eye_an.avg_redness()
    eye_st  = eye_an.eye_status()

    # Print to terminal
    os.system('cls' if os.name=='nt' else 'clear')
    print("\n╔══════════════════════════════════════════════╗")
    print("║         NIDAN-LIVE  SCAN COMPLETE            ║")
    print("╠══════════════════════════════════════════════╣")
    print(f"║  HEART RATE   : {int(bpm)} BPM")
    print(f"║  STRESS       : {sl} ({stress}%)")
    print(f"║  RESPIRATION  : {rr:.0f} br/min")
    print(f"║  HRV RMSSD    : {rmssd:.1f} ms")
    print(f"║  BLINK RATE   : {br}/min")
    print(f"║  EYE STATUS   : {', '.join(eye_st)}")
    print("╠══════════════════════════════════════════════╣")
    print(f"║  TRIAGE       : {tl}")
    print(f"║  NEXT STEP    : {info['next']}")
    print("╠══════════════════════════════════════════════╣")
    print(f"║  Result saved : {fname}")
    print("╚══════════════════════════════════════════════╝")

    deadline = time.time() + 15.   # show for 15 seconds

    while time.time() < deadline:
        # Dark background
        canvas = np.zeros((h, w, 3), dtype=np.uint8)
        canvas[:] = (8, 8, 18)

        # Title
        cv2.putText(canvas,"SCAN COMPLETE",(w//2-160,50),
                    FONT,1.2,TEAL,3)
        cv2.line(canvas,(40,65),(w-40,65),TEAL,1)

        # Triage big display
        cv2.rectangle(canvas,(w//2-180,80),(w//2+180,160),tl_col,-1)
        cv2.putText(canvas,tl,(w//2-150,142),FONT,1.8,WHITE,3)

        # Next step
        cv2.putText(canvas,info["next"],(w//2-len(info["next"])*6,185),
                    FONT,.5,WHITE,1)

        cv2.line(canvas,(40,200),(w-40,200),DIM,1)

        # 3 column result
        col_x = [60, w//2-100, w-280]
        rows  = [
            ("HEART RATE", f"{int(bpm)} BPM",
             GREEN if 60<=bpm<=100 else ORANGE),
            ("STRESS",     f"{sl}",
             GREEN if stress<40 else ORANGE if stress<70 else RED),
            ("RESPIRATION",f"{rr:.0f} br/min",
             GREEN if 12<=rr<=20 else ORANGE),
        ]
        eye_rows = [
            ("BLINK RATE", f"{br}/min",
             GREEN if 10<=br<=25 else ORANGE),
            ("EYES",       ', '.join(eye_st),
             GREEN if rd<1.3 else RED),
            ("HRV RMSSD",  f"{rmssd:.1f} ms",
             GREEN if rmssd>30 else ORANGE),
        ]

        y0 = 230
        for i,(label,val,col) in enumerate(rows):
            cx=col_x[i]
            cv2.putText(canvas,label,(cx,y0),FONT,.38,DIM,1)
            cv2.putText(canvas,val,  (cx,y0+30),FONT,.65,col,2)

        y0 = 310
        for i,(label,val,col) in enumerate(eye_rows):
            cx=col_x[i]
            cv2.putText(canvas,label,(cx,y0),FONT,.38,DIM,1)
            cv2.putText(canvas,val,  (cx,y0+30),FONT,.55,col,1)

        cv2.line(canvas,(40,370),(w-40,370),DIM,1)

        # Save info
        cv2.putText(canvas,f"Result saved: {fname}",
                    (40,400),FONT,.4,DIM,1)

        # Countdown
        remaining=int(deadline-time.time())
        cv2.putText(canvas,f"Closing in {remaining}s  (Press Q to close now)",
                    (w//2-200,h-20),FONT,.42,DIM,1)

        cv2.imshow("Nidan-Live | SCAN RESULT",canvas)
        if cv2.waitKey(100)&0xFF==ord('q'):
            break

    cv2.destroyAllWindows()


# ══════════════════════════════════════════════════════════════════
#  TERMINAL OUTPUT
# ══════════════════════════════════════════════════════════════════
def print_terminal(bpm,sl,stress,rmssd,sdnn,rr,blink,algo,conf,q,n,t_left):
    os.system('cls' if os.name=='nt' else 'clear')
    print(f"╔══════════════════════════════════════════╗")
    print(f"║  NIDAN-LIVE  |  Scan: {int(t_left):>2}s remaining      ║")
    print(f"╠══════════════════════════════════════════╣")
    bst="Normal" if 60<=bpm<=100 else "High" if bpm>100 else "Low" if bpm>0 else "..."
    print(f"║  Heart Rate   : {int(bpm):>3} BPM    {bst:<10}     ║")
    print(f"║  Stress       : {sl:<14} ({stress:>2}%)      ║")
    rrst="Normal" if 12<=rr<=20 else "Fast" if rr>20 else "Slow" if rr>0 else "..."
    print(f"║  Respiration  : {rr:>4.0f} br/min  {rrst:<10}    ║")
    print(f"╠══════════════════════════════════════════╣")
    print(f"║  HRV RMSSD    : {rmssd:>5.1f} ms                      ║")
    print(f"║  HRV SDNN     : {sdnn:>5.1f} ms                      ║")
    print(f"║  Blink Rate   : {blink:>3} /min                      ║")
    print(f"╠══════════════════════════════════════════╣")
    print(f"║  Algo: {algo:<8} Conf:{conf:.0%}  Q:{int(q*100)}%  Buf:{n}  ║")
    print(f"╚══════════════════════════════════════════╝")
    print("  Press Q to quit early")


# ══════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════
def main():
    if not download(): sys.exit(1)

    cap=cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT,720)
    cap.set(cv2.CAP_PROP_FPS,FPS_DEFAULT)
    if not cap.isOpened(): print("[ERROR] No camera."); sys.exit(1)

    print("[Nidan-Live] Loading model...")
    lmk   = init_mp()
    eye_an= EyeAnalyzer()
    print(f"[Nidan-Live] Ready! Scan will run for {SCAN_DURATION} seconds.")
    print("  Stay still. Look at camera. Press Q to quit early.\n")

    buf=Buffer()
    bpm=0.; sl="Measuring..."; stress=50
    rmssd=0.; sdnn=0.; rr=0.
    q=0.; tl="NORMAL"; algo="---"; conf=0.; pi=0.
    sig=np.zeros(10); stable=1.; pnx=None
    rr_hist=deque(maxlen=5)
    last=time.time(); scan_start=time.time()
    scan_done=False

    while True:
        ret,frame=cap.read()
        if not ret: break
        frame=cv2.flip(frame,1); h,w=frame.shape[:2]
        rgb=cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)
        lm=detect(lmk,rgb,w,h)

        elapsed  = time.time()-scan_start
        t_left   = max(SCAN_DURATION-elapsed,0)
        warmup   = elapsed<6.

        ny=0.
        if lm:
            nx=lm[NOSE_TIP][0]/w
            if pnx is not None: stable=max(0.,1.-abs(nx-pnx)*w/10.)
            pnx=nx; ny=lm[NOSE_TIP][1]/h
            fr,fg,fb,fb_=get_rgb(frame,lm,FOREHEAD_LM,w,h,28)
            cr,cg,cb,cb_=get_rgb(frame,lm,CHEEK_LM,w,h,30)
            r=fr*.6+cr*.4; g=fg*.6+cg*.4; b=fb*.6+cb*.4
            buf.push(r,g,b,time.time(),ny)
            frame=draw_heatmap(frame,lm,pi)
            frame=draw_rois(frame,fb_+cb_,q)
            # Eye analysis
            result=eye_an.analyze(frame,lm,w,h)
            if result is not None:
                frame=result
        else:
            stable=0.; pnx=None
            buf.push(0.,0.,0.,time.time(),0.)
            cv2.putText(frame,"No face — look at camera",
                        (w//2-200,h//2),FONT,.8,RED,2)

        # ── Process vitals every 1.5s ─────────────────────────────
        if time.time()-last>1.5 and buf.ready(40):
            fps=buf.fps()
            bn,cn,an,sig=best_bpm(buf)
            algo=an; conf=cn
            if cn>0.05 and 42<bn<185:
                buf.bpms.append(bn)
                bpm=float(np.median(buf.bpms[-8:]))
            if bpm>0:
                rmssd,sdnn,sl,stress=get_stress(sig,fps,bpm)
            if len(buf.NY)>=int(fps*6):
                rr_new,rc=get_rr(np.array(buf.NY),fps)
                if rr_new>0:
                    rr_hist.append(rr_new)
                    rr=float(np.median(list(rr_hist)))
            q=sig_quality(buf.R,buf.G,buf.B,stable)
            pi=min(cn*1.5,.88)
            tl=do_triage(bpm,stress,rr)
            last=time.time()
            print_terminal(bpm,sl,stress,rmssd,sdnn,rr,
                           eye_an.blink_rate(),algo,conf,q,
                           len(buf.G),t_left)

        # ── Draw camera window ────────────────────────────────────
        draw_header(frame,w)
        draw_progress_bar(frame,elapsed,SCAN_DURATION,w,h)

        # 4 metric boxes
        bw=188; bh=115; gap=10; box_y=82
        total=4*bw+3*gap; sx=(w-total)//2

        # BPM
        bv=str(int(bpm)) if bpm>0 else "--"
        bs="Normal" if 60<=bpm<=100 else "High" if bpm>100 else "Low" if bpm>0 else "..."
        bc=GREEN if 60<=bpm<=100 else RED if (bpm>110 or 0<bpm<50) else ORANGE
        draw_metric_box(frame,"HEART RATE",bv,"BPM",bs,bc,sx,box_y,bw,bh)

        # Stress
        draw_stress_box(frame,sl,stress,sx+bw+gap,box_y,bw,bh)

        # Respiration
        rv=f"{rr:.0f}" if rr>0 else "--"
        rs="Normal" if 12<=rr<=20 else "Fast" if rr>20 else "Slow" if rr>0 else "..."
        rc2=GREEN if 12<=rr<=20 else ORANGE if rr>0 else DIM
        draw_metric_box(frame,"RESPIRATION",rv,"br/min",rs,rc2,sx+2*(bw+gap),box_y,bw,bh)

        # Eye
        draw_eye_box(frame,eye_an.blink_rate(),eye_an.avg_redness(),
                     eye_an.avg_ear(),sx+3*(bw+gap),box_y,bw,bh)

        # Pulse wave
        wy=box_y+bh+8; ww=total; wh=75
        draw_wave(frame,sig,sx,wy,ww,wh,q)

        # Triage
        draw_triage_banner(frame,tl,h,w)

        cv2.imshow("Nidan-Live",frame)

        key=cv2.waitKey(1)&0xFF
        if key==ord('q'): break

        # ── Scan complete — show result screen ────────────────────
        if elapsed>=SCAN_DURATION and not scan_done:
            scan_done=True
            cap.release()
            cv2.destroyAllWindows()
            fname=save_result(bpm,sl,stress,rr,rmssd,sdnn,tl,
                              eye_an.eye_status(),
                              eye_an.blink_rate(),
                              eye_an.avg_redness())
            show_result_screen(bpm,sl,stress,rr,rmssd,sdnn,
                               tl,eye_an,fname,w,h)
            lmk.close()
            return

    cap.release()
    cv2.destroyAllWindows()
    if not scan_done and bpm>0:
        fname=save_result(bpm,sl,stress,rr,rmssd,sdnn,tl,
                          eye_an.eye_status(),
                          eye_an.blink_rate(),
                          eye_an.avg_redness())
    lmk.close()
    print("\n[Nidan-Live] Session ended.")


if __name__=="__main__":
    if "--download" in sys.argv: download()
    else: main()