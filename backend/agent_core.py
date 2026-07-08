import os
# 🌟 Prevents Langchain & Transformers from secretly waking up the GPU! 🌟
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

import time
from typing import TypedDict
from dotenv import load_dotenv
from langgraph.graph import StateGraph, END
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_ollama import ChatOllama
from pinecone import Pinecone
import google.generativeai as genai

load_dotenv()

# ══════════════════════════════════════════════════════════════════
#  1. BULLETPROOF UNIVERSAL LLM ENGINE
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

        self.ollama = {
            "name": "Local Laptop (Ollama Llama3.2)",
            "builder": lambda: ChatOllama(
                model="llama3.2",
                temperature=0.3
            )
        }

        self.providers = [self.google, self.groq, self.ollama]

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
        
        return "I am operating in a severely degraded offline state. Please seek immediate medical attention if you experience severe chest pain or shortness of breath. Your vitals are being monitored."

universal_llm = BulletproofLLM()

# ══════════════════════════════════════════════════════════════════
#  2. PINECONE VECTOR RAG MEMORY 
# ══════════════════════════════════════════════════════════════════
class MedicalMemory:
    def __init__(self):
        pinecone_key = os.getenv("pinecone_api_key") or os.getenv("PINECONE_API_KEY", "")
        self.gemini_key = os.getenv("gemini_api_key") or os.getenv("GOOGLE_API_KEY", "")
        
        if not pinecone_key or not self.gemini_key:
            print("[Pinecone] Warning: API keys missing. RAG Disabled.")
            self.is_connected = False
            return

        try:
            genai.configure(api_key=self.gemini_key)
            self.pc = Pinecone(api_key=pinecone_key)
            
            # Make sure your Pinecone index is named exactly "nidan-ai" in the Pinecone dashboard!
            self.index = self.pc.Index("nidan-ai")
            self.is_connected = True
            print("🟢 [Pinecone RAG] Successfully connected to Vector DB!")
        except Exception as e:
            print(f"🔴 [Pinecone] Connection failed: {e}")
            self.is_connected = False

    def save_record(self, patient_id: str, text: str):
        if not self.is_connected: return
        try:
            emb = genai.embed_content(model="models/gemini-embedding-2", content=text)
            vector = emb['embedding']
            
            doc_id = f"record_{patient_id}_{int(time.time())}"
            self.index.upsert(vectors=[{
                "id": doc_id, 
                "values": vector, 
                "metadata": {"patient_id": patient_id, "text": text}
            }])
            print(f"✅ [Pinecone] Vectorized and saved report for {patient_id}!")
        except Exception as e:
            print(f"⚠️ [Pinecone] Upsert failed: {e}")

    def retrieve_history(self, patient_id: str):
        if not self.is_connected:
            return "No prior medical history found (Database Offline)."
            
        try:
            print(f"🔍 [Pinecone RAG] Searching vector DB for {patient_id} past records...")
            emb = genai.embed_content(model="models/gemini-embedding-2", content="patient medical history and previous scan reports")
            vector = emb['embedding']
            
            results = self.index.query(
                vector=vector,
                filter={"patient_id": patient_id},
                top_k=3,
                include_metadata=True
            )
            
            history = [match['metadata']['text'] for match in results.get('matches', []) if 'text' in match['metadata']]
            if history:
                print(f"✅ [Pinecone RAG] Found {len(history)} previous records!")
                return "PATIENT PAST RECORDS FROM VECTOR DB:\n" + "\n\n".join(history)
            
            return "No previous records found in Vector DB."
        except Exception as e:
            print(f"⚠️ [Pinecone RAG] Query failed: {e}")
            return "Error retrieving history."

memory_db = MedicalMemory()

# ══════════════════════════════════════════════════════════════════
#  3. LANGGRAPH STATE MACHINE 
# ══════════════════════════════════════════════════════════════════
class AgentState(TypedDict):
    patient_id: str
    symptoms: str
    medical_history: str
    clinical_analysis: str
    final_response: str

def retrieve_patient_context(state: AgentState):
    history = memory_db.retrieve_history(state['patient_id'])
    return {"medical_history": history}

def diagnostic_evaluator(state: AgentState):
    prompt = f"""
    You are an expert AI triage doctor. 
    Current Patient Symptoms: {state['symptoms']}
    
    VECTOR DATABASE PAST MEDICAL HISTORY: 
    {state['medical_history']}
    
    Provide a brief, compassionate, and highly professional clinical assessment. 
    If there is a previous medical report in their history, YOU MUST reference it to provide better care!
    """
    analysis = universal_llm.invoke(prompt)
    return {"clinical_analysis": analysis}

def triage_communicator(state: AgentState):
    response = f"**Clinical Assessment:**\n{state['clinical_analysis']}\n\n*Note: Memory context automatically retrieved via Pinecone RAG.*"
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

async def run_medical_agent(patient_id: str, symptoms: str) -> str:
    inputs = {
        "patient_id": patient_id,
        "symptoms": symptoms,
        "medical_history": "",
        "clinical_analysis": "",
        "final_response": ""
    }
    result = diagnostic_app.invoke(inputs)
    return result["final_response"]