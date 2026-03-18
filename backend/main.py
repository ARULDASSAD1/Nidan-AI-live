from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import shutil
import os
import time
# Importing the correct Option B function
from rppg_core import calculate_bpm_from_video

app = FastAPI(title="Nidan-Live System Core")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

recent_scans = []

@app.post("/api/scan")
async def process_scan(video: UploadFile = File(...)):
    """Receives video from frontend and runs ONNX inference or Fallback Math."""
    file_location = f"temp_{video.filename}"
    with open(file_location, "wb+") as file_object:
        shutil.copyfileobj(video.file, file_object)
    
    # 1. Edge AI: Get Vitals
    result = calculate_bpm_from_video(file_location)
    
    # Clean up the temp video file
    if os.path.exists(file_location):
        os.remove(file_location)
    
    if result.get("status") != "success":
        return {"vitals": result, "triage_priority": 5, "message": result.get("message", "Scan failed")}

    bpm = result["bpm"]
    
    # 2. Mock Triage Logic
    priority = 5
    recommendation = "Delhi City Clinic"
    
    if bpm > 110:
        priority = 1
        recommendation = "AIIMS New Delhi"
    elif bpm > 90:
        priority = 2
        recommendation = "Safdarjung Hospital"
    
    # 3. Save to dashboard
    scan_record = {
        "timestamp": time.strftime("%H:%M:%S"),
        "bpm": bpm,
        "priority": priority,
        "routed_to": recommendation
    }
    recent_scans.insert(0, scan_record)
        
    return {
        "vitals": result,
        "triage_priority": priority,
        "recommended_facility": recommendation
    }

@app.get("/api/dashboard_data")
async def get_dashboard_data():
    return {"recent_scans": recent_scans[:5]}