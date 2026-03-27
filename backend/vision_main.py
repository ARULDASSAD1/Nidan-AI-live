"""
NIDAN-LIVE — Vision Microservice (Port 8001)
HACKATHON OFFLINE OVERRIDE: Agentic Vision Pipeline (Moondream -> Mistral)
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

app = FastAPI(title="Nidan-Live Universal Vision Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class UniversalVisionEngine:
    def __init__(self):
        self.gemini_key = os.getenv("gemini_api_key") or os.getenv("GOOGLE_API_KEY")
        self.groq_key = os.getenv("groq_api_key")
        
        if self.gemini_key:
            genai.configure(api_key=self.gemini_key)

    def analyze(self, image_bytes: bytes, prompt: str) -> str:
        base64_image = base64.b64encode(image_bytes).decode('utf-8')
        errors = []
        moondream_backup = ""

        # 🚀 PRIORITY 1: THE "AGENTIC VISION" HACKATHON PIPELINE (Moondream -> Mistral)
        try:
            print("🔄 [Vision] PRIORITY 1: Engaging Offline Agentic Vision Pipeline...")
            
            # STEP A: THE EYES (Moondream - 1.5GB RAM)
            print("   👀 Step A: Moondream extracting visual facts...")
            
            # 🌟 FIX 1: Small models suffer from "Attention Dilution". 
            # We removed the 3-part list and replaced it with a single, aggressive directive.
            moon_prompt = (
                "Look at this medical image. DO NOT just say it is a scan but tell what type of scan it was like CT or MRI based on the image. "
                "Describe exactly what the abnormality looks like, its shape, its location, and what organ it is on."
            )
            
            moon_res = requests.post("http://localhost:11434/api/generate", json={
                "model": "moondream", 
                "prompt": moon_prompt, 
                "images": [base64_image], 
                "stream": False,
                "options": {
                    "temperature": 0.1  # 🌟 FIX 2: Drops temperature to force strict, analytical observation
                }
            }, timeout=60)
            
            if moon_res.status_code == 200:
                moondream_backup = moon_res.json().get("response", "").strip()
                print(f"   ✅ Raw Facts Extracted: {moondream_backup}")

                # STEP B: THE BRAIN (Mistral - Anti-Hallucination & Strict Formatting)
                print("   🧠 Step B: Mistral expanding facts into a Chief Radiologist report...")
                
                # 🌟 FIX 2: Explicitly demanding double line breaks (\n\n) to fix the block-of-text issue
                mistral_prompt = f"""Preliminary Note from Vision Scanner:
"{moondream_backup}"

Write a highly detailed, professional radiological report based ONLY on the above note. Do not invent new diseases, but use professional medical terminology to describe what was seen.

CRITICAL FORMATTING RULES: You MUST use double newlines between each section so it is easy to read. Do not write a single block of text.

Strictly format the output EXACTLY like this:

**1. MODALITY & REGION:**
(State the scan type and region based on the note)

**2. FINDINGS:**
(Write a professional, detailed paragraph expanding on the anomalies mentioned in the note.)

**3. IMPRESSION:**
(Summarize the severity and primary concern in one clear sentence)

**4. TRIAGE:**
(Recommend Routine, Urgent, or Emergency action)
"""

                mistral_res = requests.post("http://localhost:11434/api/chat", json={
                    "model": "mistral", 
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are a strict Chief Radiologist. You format reports beautifully with clear line breaks. You never hallucinate data."
                        },
                        {
                            "role": "user",
                            "content": mistral_prompt
                        }
                    ],
                    "stream": False
                }, timeout=90)

                if mistral_res.status_code == 200:
                    final_report = mistral_res.json().get("message", {}).get("content", "")
                    if final_report:
                        print("✅ [Vision] Agentic Vision Pipeline Success! (Neat Mistral Output Generated)")
                        return final_report
                else:
                    raise Exception(f"Mistral failed. Status: {mistral_res.status_code}")
            else:
                raise Exception("Moondream failed to analyze image.")

        except Exception as e:
            print(f"⚠️ [Vision] Agentic Pipeline failed: {str(e)}")
            errors.append(f"Offline Agentic Pipeline: {str(e)}")

        # 🚀 PRIORITY 2: CLOUD API (Gemini/Groq if keys work)
        if self.gemini_key:
            try:
                print("🔄 [Vision] PRIORITY 2: Trying Cloud API (Gemini 1.5 Flash)...")
                model = genai.GenerativeModel('gemini-1.5-flash')
                response = model.generate_content([prompt, {"mime_type": "image/jpeg", "data": image_bytes}])
                print("✅ [Vision] Gemini API Success!")
                return response.text
            except Exception as e:
                print(f"⚠️ [Vision] Gemini failed: {str(e)}")
                errors.append(f"Gemini: {str(e)}")

        if self.groq_key:
            try:
                print("🔄 [Vision] PRIORITY 2 (Fallback): Trying Cloud API (Groq Llama-3.2-Vision)...")
                headers = {"Authorization": f"Bearer {self.groq_key}", "Content-Type": "application/json"}
                payload = {
                    "model": "llama-3.2-11b-vision-preview",
                    "messages": [{"role": "user", "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
                    ]}]
                }
                res = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload, timeout=30)
                if res.status_code == 200: 
                    print("✅ [Vision] Groq API Success!")
                    return res.json()["choices"][0]["message"]["content"]
                else:
                    raise Exception(f"Groq API Error: {res.text}")
            except Exception as e:
                print(f"⚠️ [Vision] Groq failed: {str(e)}")
                errors.append(f"Groq: {str(e)}")

        # 🚀 PRIORITY 3: OFFLINE BACKUP (Local LLaVA - Heavy GPU)
        try:
            print("🔄 [Vision] PRIORITY 3: Trying Offline Backup (Local LLaVA)...")
            res = requests.post("http://localhost:11434/api/generate", json={
                "model": "llava", "prompt": prompt, "images": [base64_image], "stream": False
            }, timeout=120)
            
            if res.status_code == 200:
                print("✅ [Vision] Local LLaVA Success!")
                return res.json().get("response", "")
            else:
                raise Exception(f"LLaVA failed: {res.text}")
        except requests.exceptions.ConnectionError:
            errors.append("Local LLaVA: Connection Refused (Is Ollama running?)")
        except Exception as e:
            print(f"⚠️ [Vision] LLaVA failed: {str(e)}")
            errors.append(f"Local LLaVA: {str(e)}")

        # 🚀 FINAL SAFETY NET
        if moondream_backup:
            print("⚠️ [Vision] All advanced models failed. Returning Moondream preliminary facts.")
            return f"**PRELIMINARY RADIOLOGY NOTE:**\n\n{moondream_backup}\n\n*(Note: Detailed AI expansion and cloud apis failed. Please consult a doctor.)*"

        print(f"💀 [Vision] ALL ENGINES FAILED: {errors}")
        return f"❌ CRITICAL FAILURE: Ensure Ollama is running and Moondream/Mistral are pulled."

vision_engine = UniversalVisionEngine()

# ══════════════════════════════════════════════════════════════════
#  API ROUTE FOR NEXT.JS
# ══════════════════════════════════════════════════════════════════
@app.post("/api/analyze-scan")
async def analyze_scan(image: UploadFile = File(...), patient_id: str = Form(default="unknown")):
    try:
        image_bytes = await image.read()
        
        system_prompt = "Examine this medical scan and provide a detailed multi-paragraph report."
        analysis_result = vision_engine.analyze(image_bytes, system_prompt)
        
        return {"analysis": analysis_result, "status": "success"}
    except Exception as e:
        print(f"❌ [Vision Server] Crash: {str(e)}")
        return {"analysis": "Critical Error processing image.", "status": "error"}

if __name__ == "__main__":
    print(f"🚀 Booting Nidan-Live Universal Vision Engine on Port 8001...")
    uvicorn.run(app, host="0.0.0.0", port=8001)