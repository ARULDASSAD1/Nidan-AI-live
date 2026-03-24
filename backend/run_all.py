"""
NIDAN-LIVE — Master Infrastructure Bootloader
Starts all 3 Microservices in a single terminal.
"""
import subprocess
import sys
import time

def main():
    print("🚀 Booting Nidan-Live Master Infrastructure...")
    processes = []
    
    try:
        # 1. Start Main API (Port 8000)
        print("🟢 Starting Main API (Port 8000)...")
        processes.append(subprocess.Popen([sys.executable, "main.py"]))
        time.sleep(2) # Give it a second to bind the port
        
        # 2. Start Edge Vision Engine (Port 8001)
        print("🟢 Starting Edge Vision Ollama Engine (Port 8001)...")
        processes.append(subprocess.Popen([sys.executable, "vision_main.py"]))
        time.sleep(2)
        
        # 3. Start Multi-Agent Orchestrator (Port 8002)
        print("🟢 Starting Multi-Agent Orchestrator (Port 8002)...")
        processes.append(subprocess.Popen([sys.executable, "agent_main.py"]))
        
        print("\n✅ ALL SYSTEMS ONLINE. Press CTRL+C to safely shut down all servers.\n")
        
        # Keep the main script running so it doesn't close the subprocesses
        for p in processes:
            p.wait()
            
    except KeyboardInterrupt:
        print("\n🛑 Shutting down all microservices safely...")
        for p in processes:
            p.terminate()
        print("✅ Shutdown complete.")

if __name__ == "__main__":
    main()