"""
NIDAN-LIVE — Multi-Agent Orchestration Microservice (Port 8002)
Hybrid Architecture: Universal LLM Fallback + Pinecone Vector DB
"""
import os
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
from pinecone import Pinecone, ServerlessSpec
from dotenv import load_dotenv
import uvicorn

# 🌟 IMPORT YOUR BULLETPROOF LLM FROM AGENT CORE 🌟
from agent_core import universal_llm

load_dotenv()

app = FastAPI(title="Nidan Multi-Agent Engine")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ══════════════════════════════════════════════════════════════════
#  API CONFIGURATIONS 
# ══════════════════════════════════════════════════════════════════
genai.configure(api_key=os.getenv("gemini_api_key", ""))
PINECONE_API_KEY = os.getenv("pinecone_api_key", "")

try:
    pc = Pinecone(api_key=PINECONE_API_KEY) if PINECONE_API_KEY else None
except Exception:
    pc = None
    
INDEX_NAME = "nidan-patient-records"

# ══════════════════════════════════════════════════════════════════
#  DATA MODELS
# ══════════════════════════════════════════════════════════════════
class PatientData(BaseModel):
    patient_id: str
    vitals: dict
    vision_report: str

class ChatRequest(BaseModel):
    patient_id: str
    question: str
    context: str

# 🌟 ADD THE PINECONE DATA MODEL
class PineconeData(BaseModel):
    patient_id: str
    text_data: str

# ══════════════════════════════════════════════════════════════════
#  AGENT DEFINITIONS (Using Bulletproof Fallback)
# ══════════════════════════════════════════════════════════════════
async def agent_cardiologist(vitals: dict, vision: str):
    prompt = f"You are a Chief Cardiologist. Analyze these rPPG vitals {vitals} and this imaging report: {vision}. Provide a 3-sentence cardiological assessment focusing on heart rate, HRV, and vascular implications."
    return await asyncio.to_thread(universal_llm.invoke, prompt)

async def agent_pulmonologist(vitals: dict, vision: str):
    prompt = f"You are a Chief Pulmonologist. Analyze these rPPG vitals {vitals} and this imaging report: {vision}. Provide a 3-sentence pulmonary assessment focusing on respiration rate and oxygenation hints."
    return await asyncio.to_thread(universal_llm.invoke, prompt)

async def agent_neurologist(vitals: dict, vision: str):
    prompt = f"You are a Chief Neurologist. Analyze these rPPG vitals {vitals} and this imaging report: {vision}. Provide a 3-sentence neurological assessment focusing on the Stress Index and central nervous system."
    return await asyncio.to_thread(universal_llm.invoke, prompt)

async def agent_chief_medical_officer(cardio: str, pulmo: str, neuro: str, vision: str):
    prompt = f"""You are the Chief Medical Officer. Synthesize these specialist reports into a final Executive Medical Summary.
    Cardiology: {cardio}
    Pulmonology: {pulmo}
    Neurology: {neuro}
    Imaging: {vision}
    Provide a professional, cohesive 2-paragraph summary and a final Triage Recommendation (Routine, Urgent, Emergency)."""
    return await asyncio.to_thread(universal_llm.invoke, prompt)

# ══════════════════════════════════════════════════════════════════
#  ROUTES
# ══════════════════════════════════════════════════════════════════
@app.post("/api/multi-agent-analysis")
async def run_multi_agent_board(data: PatientData):
    print(f"🚀 [Multi-Agent] Starting parallel analysis for patient {data.patient_id}...")
    
    try:
        # Step 1: Run the 3 specialists SIMULTANEOUSLY
        cardio_task = asyncio.create_task(agent_cardiologist(data.vitals, data.vision_report))
        pulmo_task = asyncio.create_task(agent_pulmonologist(data.vitals, data.vision_report))
        neuro_task = asyncio.create_task(agent_neurologist(data.vitals, data.vision_report))
        
        # Wait for all 3 to finish
        cardio_res, pulmo_res, neuro_res = await asyncio.gather(cardio_task, pulmo_task, neuro_task)
        
        # Step 2: Feed results to the Chief Medical Officer
        cmo_res = await agent_chief_medical_officer(cardio_res, pulmo_res, neuro_res, data.vision_report)
        
        report_data = {
            "cardiologist": cardio_res,
            "pulmonologist": pulmo_res,
            "neurologist": neuro_res,
            "executive_summary": cmo_res
        }

        # Step 3: Optional - Vectorize and store in Pinecone for future RAG queries
        if pc:
            try:
                embed_model = genai.GenerativeModel('models/text-embedding-004')
                embed_text = f"Patient: {data.patient_id} | Summary: {cmo_res}"
                vector = embed_model.embed_content(embed_text)["embedding"]
                index = pc.Index(INDEX_NAME)
                index.upsert(vectors=[{"id": f"report_{data.patient_id}", "values": vector, "metadata": {"text": cmo_res}}])
                print("✅ [Pinecone] Vector safely stored.")
            except Exception as e:
                print(f"⚠️ [Pinecone] Upsert skipped (Gemini Quota Limit): {e}")

        print("✅ [Multi-Agent] Executive Board analysis complete via Universal LLM.")
        return {"status": "success", "report": report_data}
        
    except Exception as e:
        print(f"❌ [Multi-Agent Error]: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat-with-agents")
async def chat_with_agents(data: ChatRequest):
    try:
        prompt = f"""You are the Nidan Medical AI team. The patient is asking a question about their medical report.
        Patient's Medical Report Context: {data.context}
        Patient's Question: {data.question}
        Answer professionally, compassionately, and clearly. Remind them to consult a real doctor."""
        
        # Uses universal LLM for chat too!
        reply_text = await asyncio.to_thread(universal_llm.invoke, prompt)
        return {"reply": reply_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 🌟 ADD THIS NEW ROUTE AT THE BOTTOM (Before __main__)
@app.post("/api/save-pinecone")
async def save_to_pinecone(data: PineconeData):
    if pc:
        try:
            import time
            embed_model = genai.GenerativeModel('models/text-embedding-004')
            vector = embed_model.embed_content(data.text_data)["embedding"]
            index = pc.Index(INDEX_NAME)
            doc_id = f"vision_{data.patient_id}_{int(time.time())}"
            index.upsert(vectors=[{"id": doc_id, "values": vector, "metadata": {"text": data.text_data}}])
            print(f"✅ [Pinecone] Vision Report vectorized and saved for {data.patient_id}!")
            return {"status": "success"}
        except Exception as e:
            print(f"⚠️ [Pinecone] Upsert failed: {e}")
            return {"status": "error", "detail": str(e)}
    return {"status": "skipped", "detail": "Pinecone not connected"}

if __name__ == "__main__":
    print("🚀 Booting Nidan Multi-Agent Microservice on Port 8003...")
    # 🌟 FIX: Pass 'app' directly (NO QUOTES) and bind to 0.0.0.0!
    # This completely eliminates Windows worker crashes and fetch errors.
    uvicorn.run(app, host="0.0.0.0", port=8003)