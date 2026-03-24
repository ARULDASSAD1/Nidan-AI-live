from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import shutil
import os
import uvicorn
from dotenv import load_dotenv

# Import your PyTorch rPPG scanner
from rppg_core import calculate_bpm_from_video

# Import your brand new Bulletproof LangGraph Agent
from agent_core import run_medical_agent

load_dotenv()

app = FastAPI(title="Nidan-Live System Core")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

# Local memory to store scans for the dashboard
recent_scans = []

# ══════════════════════════════════════════════════════════════════
#  1. CLINICAL VITALS ROUTE (Your specialized scanner logic)
# ══════════════════════════════════════════════════════════════════
@app.post("/api/scan")
async def process_scan(video: UploadFile = File(...)):
    file_location = f"temp_{video.filename}"
    with open(file_location, "wb+") as file_object:
        shutil.copyfileobj(video.file, file_object)
    
    # Run the new Multi-Region engine
    result = calculate_bpm_from_video(file_location)
    
    if os.path.exists(file_location):
        os.remove(file_location)
    
    if result.get("status") != "success":
        return {"vitals": result, "triage_priority": 5, "message": result.get("message", "Scan failed")}

    bpm = result.get("bpm", 0)
    rr = result.get("respiration_rate", 16)
    stress = result.get("stress_level", "Normal")
    
    # Authentic Triage Logic
    priority = 5
    recommendation = "Delhi City Clinic" # This will be overridden by Next.js GPS anyway
    
    if bpm > 110 or rr > 24:
        priority = 1
    elif bpm > 90 or "High" in stress:
        priority = 2
        
    return {
        "vitals": result,
        "triage_priority": priority,
        "recommended_facility": recommendation
    }

# ══════════════════════════════════════════════════════════════════
#  2. AI AGENT ROUTE (Connects Next.js Chat to LangGraph)
# ══════════════════════════════════════════════════════════════════
class ChatRequest(BaseModel):
    patient_id: str
    symptoms: str

@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    # This triggers the Bulletproof Multi-Agent State Machine!
    reply = await run_medical_agent(req.patient_id, req.symptoms)
    return {"reply": reply}

# ══════════════════════════════════════════════════════════════════
#  3. HOSPITAL ADMIN DASHBOARD ROUTE
# ══════════════════════════════════════════════════════════════════
@app.get("/api/dashboard_data")
async def get_dashboard_data():
    """Endpoint for a command center to fetch the latest scans."""
    return {"recent_scans": recent_scans[:5]}

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)