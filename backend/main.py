import os
# 🌟 MAGIC OOM FIX: Keeps the web server strictly on CPU, saving RAM! 🌟
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import shutil
import uvicorn
from dotenv import load_dotenv

from rppg_core import calculate_bpm_from_video
# Import the memory DB so we can route Vision reports to Pinecone!
from agent_core import run_medical_agent, memory_db

load_dotenv()

app = FastAPI(title="Nidan-Live System Core")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/scan")
async def process_scan(video: UploadFile = File(...)):
    file_location = f"temp_{video.filename}"
    with open(file_location, "wb+") as file_object:
        shutil.copyfileobj(video.file, file_object)
    
    result = calculate_bpm_from_video(file_location)
    if os.path.exists(file_location): os.remove(file_location)
    if result.get("status") != "success": 
        return {"vitals": result, "triage_priority": 5, "message": result.get("message", "Scan failed")}

    bpm = result.get("bpm", 0)
    rr = result.get("respiration_rate", 16)
    stress = result.get("stress_level", "Normal")
    
    # 🌟 MANCHESTER TRIAGE SYSTEM (MTS) LOGIC
    # 1: Immediate, 2: Very Urgent, 3: Urgent, 4: Standard, 5: Non-Urgent
    priority = 5 
    
    # Severe abnormal vitals = Level 1 (Red - Immediate Resuscitation)
    if bpm > 130 or bpm < 40 or rr > 30 or rr < 10: 
        priority = 1
    # Highly abnormal vitals = Level 2 (Orange - Very Urgent)
    elif bpm > 110 or bpm < 50 or rr > 24: 
        priority = 2
    # Moderately abnormal / High Stress = Level 3 (Yellow - Urgent)
    elif bpm > 95 or "High" in stress: 
        priority = 3
    # Slightly elevated = Level 4 (Green - Standard)
    elif bpm > 80: 
        priority = 4
    # Normal = Level 5 (Blue - Non-Urgent)
    else:
        priority = 5
        
    return { "vitals": result, "triage_priority": priority, "recommended_facility": "Local Clinic" }

class ChatRequest(BaseModel):
    patient_id: str
    symptoms: str

@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    reply = await run_medical_agent(req.patient_id, req.symptoms)
    return {"reply": reply}

# 🌟 Pushes Vision Text to Pinecone Vector DB
class PineconeData(BaseModel):
    patient_id: str
    text_data: str

@app.post("/api/save-pinecone")
async def save_pinecone(req: PineconeData):
    print(f"📥 [Server] Received data to save to Vector DB for patient: {req.patient_id}")
    memory_db.save_record(req.patient_id, req.text_data)
    return {"status": "success"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)