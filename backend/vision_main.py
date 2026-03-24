"""
NIDAN-LIVE — Vision Microservice (Port 8001)
Hybrid Engine: Local Ollama with Automatic Cloud (Gemini) Fallback
"""
import os
import base64
import requests
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai
from dotenv import load_dotenv
import uvicorn

load_dotenv()

app = FastAPI(title="Nidan-Live Hybrid Vision Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ══════════════════════════════════════════════════════════════════
#  HYBRID INFERENCE ENGINE
# ══════════════════════════════════════════════════════════════════
OLLAMA_MODEL = "llava" 
OLLAMA_URL = "http://localhost:11434/api/generate"

# Configure Cloud Fallback
GEMINI_API_KEY = os.getenv("gemini_api_key", "") or os.getenv("GOOGLE_API_KEY", "")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

def analyze_with_gemini_fallback(image_bytes: bytes, prompt: str) -> str:
    """Instantly shifts the workload to the cloud if the local GPU runs out of memory."""
    try:
        print("🔄 [Vision Server] Local GPU out of memory. Triggering Cloud Fallback (Gemini 1.5 Flash)...")
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        # Format the image for Gemini Multimodal
        image_parts = [{"mime_type": "image/jpeg", "data": image_bytes}]
        
        response = model.generate_content([prompt, image_parts[0]])
        print("✅ [Vision Server] Cloud Fallback Analysis complete.")
        return response.text
    except Exception as e:
        return f"❌ CRITICAL FAILURE: Both Local Ollama and Cloud Gemini failed. Error: {str(e)}"

def analyze_medical_image_ollama(image_bytes: bytes, prompt: str) -> str:
    try:
        base64_image = base64.b64encode(image_bytes).decode('utf-8')
        payload = {
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "images": [base64_image],
            "stream": False
        }
        
        print(f"🔍 [Vision Server] Routing scan to Local Edge ({OLLAMA_MODEL})...")
        response = requests.post(OLLAMA_URL, json=payload, timeout=120)
        
        if response.status_code == 200:
            print("✅ [Vision Server] Local Edge Analysis complete.")
            return response.json().get("response", "No response generated.")
        else:
            # If Ollama throws the CUDA memory error, this intentionally triggers the except block!
            raise Exception(f"Ollama Error: {response.text}")
            
    except Exception as e:
        print(f"⚠️ [Vision Server] Local Engine Failed: {str(e)}")
        
        # 🌟 TRIGGER CLOUD FALLBACK 🌟
        if GEMINI_API_KEY:
            return analyze_with_gemini_fallback(image_bytes, prompt)
        else:
            return f"Local Error & No Gemini Key found for fallback: {str(e)}"

# ══════════════════════════════════════════════════════════════════
#  API ROUTE FOR NEXT.JS
# ══════════════════════════════════════════════════════════════════
@app.post("/api/analyze-scan")
async def analyze_scan(image: UploadFile = File(...), patient_id: str = Form(default="unknown")):
    try:
        # Read the raw image bytes
        image_bytes = await image.read()
        
        system_prompt = """
        You are a Chief Radiologist at a top-tier hospital. You are examining a medical scan.
        Please provide a highly detailed, comprehensive, multi-paragraph radiological report.
        
        Ensure your response includes:
        1. MODALITY & REGION: Identify the scan type (X-ray, MRI, CT) and the anatomical area.
        2. FINDINGS: Write a full paragraph describing the visible anatomy, specifically pointing out any fractures, lesions, tumors, or anomalies. Be descriptive.
        3. IMPRESSION: Summarize the primary clinical concern in complete sentences.
        4. TRIAGE: Conclude with a strict triage recommendation (Routine, Urgent, Emergency).
        
        DO NOT use bullet points for the entire response. Write in professional, descriptive medical paragraphs.
        """
        
        analysis_result = analyze_medical_image_ollama(image_bytes, system_prompt)
        return {"analysis": analysis_result, "status": "success"}
        
    except Exception as e:
        print(f"❌ [Vision Server] Crash: {str(e)}")
        return {"analysis": f"Critical Error processing image: {str(e)}", "status": "error"}

if __name__ == "__main__":
    print(f"🚀 Booting Nidan-Live Hybrid Vision Bridge on Port 8001...")
    # 🌟 FIX: Removed reload=True and passed `app` directly to save RAM and prevent ghost processes!
    uvicorn.run(app, host="0.0.0.0", port=8001)