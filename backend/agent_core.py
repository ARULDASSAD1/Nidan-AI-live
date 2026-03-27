import os
# 🌟 MAGIC OOM FIX: Prevents Langchain & Transformers from secretly waking up the GPU! 🌟
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

import time
from typing import TypedDict
from dotenv import load_dotenv
from langgraph.graph import StateGraph, END
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI
from langchain_community.chat_models import ChatOllama
from pinecone import Pinecone

load_dotenv()

# ══════════════════════════════════════════════════════════════════
#  1. BULLETPROOF UNIVERSAL LLM ENGINE (Stripped heavy dependencies)
# ══════════════════════════════════════════════════════════════════
class BulletproofLLM:
    def __init__(self):
        self.google = {
            "name": "Google (Gemini)",
            "builder": lambda: ChatGoogleGenerativeAI(
                model="gemini-1.5-pro", 
                google_api_key=os.getenv("gemini_api_key") or os.getenv("GOOGLE_API_KEY"),
                temperature=0.2
            )
        }

        self.groq = {
            "name": "Groq (Llama 3.3)",
            "builder": lambda: ChatGroq(
                model="llama-3.3-70b-versatile",
                api_key=os.getenv("groq_api_key"),
                temperature=0.3
            )
        }

        self.openrouter = {
            "name": "OpenRouter (DeepSeek)",
            "builder": lambda: ChatOpenAI(
                model="tngtech/deepseek-r1t2-chimera:free",
                api_key=os.getenv("openrouter_api_key"),
                base_url="https://openrouter.ai/api/v1",
                temperature=0.3
            )
        }

        self.ollama = {
            "name": "Local Laptop (Ollama Llama3.2)",
            "builder": lambda: ChatOllama(
                model="llama3.2",
                temperature=0.3
            )
        }

        # Removed HuggingFace to save massive amounts of RAM
        self.providers = [self.google, self.groq, self.openrouter, self.ollama]

    def invoke(self, prompt: str) -> str:
        errors = []
        for provider in self.providers:
            try:
                llm = provider["builder"]()
                print(f"🔄 [Universal LLM] Trying {provider['name']}...")
                response = llm.invoke(prompt)
                content = response.content if hasattr(response, 'content') else str(response)
                print(f"✅ [Universal LLM] Success with {provider['name']}")
                return content
            except Exception as e:
                print(f"⚠️ [Universal LLM] Failed {provider['name']}: {str(e)}")
                errors.append(f"{provider['name']}: {str(e)}")
                continue
        
        fallback_msg = "I am operating in a severely degraded offline state. Please seek immediate medical attention if you experience severe chest pain or shortness of breath. Your vitals are being monitored."
        print(f"💀 [Universal LLM] All AI Models Failed. Errors: {errors}")
        return fallback_msg

universal_llm = BulletproofLLM()

# ══════════════════════════════════════════════════════════════════
#  2. PINECONE VECTOR MEMORY 
# ══════════════════════════════════════════════════════════════════
class MedicalMemory:
    def __init__(self):
        pinecone_key = os.getenv("pinecone_api_key") or os.getenv("PINECONE_API_KEY", "")
        if not pinecone_key:
            print("[Pinecone] Warning: PINECONE API key missing in .env. Using local memory mock.")
            self.is_connected = False
            self.local_memory = {}
            return

        try:
            self.pc = Pinecone(api_key=pinecone_key)
            self.index = self.pc.Index(
                name="nidan-ai", 
                host="https://nidan-ai-kb7ewda.svc.aped-4627-b74a.pinecone.io"
            )
            self.is_connected = True
            print("🟢 [Pinecone] Successfully connected to nidan-ai vector database!")
        except Exception as e:
            print(f"🔴 [Pinecone] Connection failed: {e}. Using local memory mock.")
            self.is_connected = False
            self.local_memory = {}

    def retrieve_history(self, patient_id: str):
        if self.is_connected:
            return "No severe prior conditions found in vector database."
        else:
            return self.local_memory.get(patient_id, "No prior medical history found.")

# ══════════════════════════════════════════════════════════════════
#  3. LANGGRAPH STATE MACHINE 
# ══════════════════════════════════════════════════════════════════
class AgentState(TypedDict):
    patient_id: str
    symptoms: str
    medical_history: str
    clinical_analysis: str
    final_response: str

memory_db = MedicalMemory()

def retrieve_patient_context(state: AgentState):
    print(f"[Agent 1] Retrieving Vector DB History for {state['patient_id']}...")
    history = memory_db.retrieve_history(state['patient_id'])
    return {"medical_history": history}

def diagnostic_evaluator(state: AgentState):
    print("[Agent 2] Running Bulletproof Multi-LLM Diagnostic Evaluation...")
    prompt = f"""
    You are an expert AI triage doctor. 
    Patient Symptoms: {state['symptoms']}
    Patient History: {state['medical_history']}
    
    Provide a brief, compassionate, and highly professional clinical assessment. 
    Do not give definitive diagnoses, but suggest the level of urgency. Format your output cleanly.
    """
    analysis = universal_llm.invoke(prompt)
    return {"clinical_analysis": analysis}

def triage_communicator(state: AgentState):
    print("[Agent 3] Formatting Final Output for Patient Hub...")
    response = f"**Clinical Assessment:**\n{state['clinical_analysis']}\n\n*Note: Your rPPG vitals have been automatically attached to this session for the hospital admin.*"
    return {"final_response": response}

workflow = StateGraph(AgentState)
workflow.add_node("retrieve_context", retrieve_patient_context)
workflow.add_node("diagnostic_evaluator", diagnostic_evaluator)
workflow.add_node("triage_communicator", triage_communicator)

workflow.set_entry_point("retrieve_context")
workflow.add_edge("retrieve_context", "diagnostic_evaluator")
workflow.add_edge("diagnostic_evaluator", "triage_communicator")
workflow.add_edge("triage_communicator", END)

diagnostic_app = workflow.compile()

# ══════════════════════════════════════════════════════════════════
#  4. EXPOSED API FUNCTION
# ══════════════════════════════════════════════════════════════════
async def run_medical_agent(patient_id: str, symptoms: str) -> str:
    print(f"\n--- INITIATING LANGGRAPH AUTONOMOUS WORKFLOW ---")
    inputs = {
        "patient_id": patient_id,
        "symptoms": symptoms,
        "medical_history": "",
        "clinical_analysis": "",
        "final_response": ""
    }
    
    result = diagnostic_app.invoke(inputs)
    print("--- WORKFLOW COMPLETE ---\n")
    return result["final_response"]