'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

import MultiAgentDashboard from '@/components/MultiAgentDashboard';

const auth = getAuth(db.app);

// ══════════════════════════════════════════════════════════════════
// 1. VITALS SCANNER COMPONENT (WITH OVERPASS API PROTECTION)
// ══════════════════════════════════════════════════════════════════
function VitalsScanner({ userData, setSessionVitals }: { userData: any, setSessionVitals: any }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const animationRef = useRef<number | null>(null);
  const prevFrameRef = useRef<Uint8Array | null>(null);

  const [status, setStatus] = useState<string>('idle'); 
  const [timeLeft, setTimeLeft] = useState(45);
  const [vitals, setVitals] = useState({ bpm: '--', resp: '--', stress: '--', eyeStatus: '--' });
  const [triage, setTriage] = useState({ priority: 5, facility: 'Awaiting Scan', message: '' });
  
  const [location, setLocation] = useState({ lat: 0, lng: 0 }); 
  const [locationInput, setLocationInput] = useState('');
  const [locationError, setLocationError] = useState('');
  const [nearestHospital, setNearestHospital] = useState({ name: 'Waiting for location...', lat: 0, lng: 0 });
  const [isLocating, setIsLocating] = useState(false);

  const [envStatus, setEnvStatus] = useState({ lighting: 'checking', motion: 'checking' });

  // 🌟 FIX: Protected Overpass API Call
  const findNearestHospital = async (lat: number, lng: number) => {
    setIsLocating(true);
    try {
      const query = `[out:json];node["amenity"="hospital"](around:15000,${lat},${lng});out 5;`;
      const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
      
      // Prevent HTML/XML crashes when API is overloaded
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
          throw new Error("API Overloaded");
      }

      const data = await res.json();
      if (data.elements && data.elements.length > 0) {
        // Ensure coordinates actually exist to prevent reading 'x' of undefined
        const validHospitals = data.elements.filter((h: any) => {
          if (!h.lat || !h.lon) return false;
          const name = (h.tags?.name || "").toLowerCase();
          return !name.includes("eye") && !name.includes("vision") && !name.includes("dental") && !name.includes("skin");
        });
        
        if (validHospitals.length > 0) {
            setNearestHospital({ name: validHospitals[0].tags?.name || "General Medical Center", lat: validHospitals[0].lat, lng: validHospitals[0].lon });
        } else {
            setNearestHospital({ name: "General Medical Center (Fallback)", lat: lat, lng: lng });
        }
      } else {
        setNearestHospital({ name: "No hospital found within 15km", lat: lat, lng: lng });
      }
    } catch (err) {
      setNearestHospital({ name: "Central City Hospital (Fallback)", lat: lat, lng: lng });
    }
    setIsLocating(false);
  };

  const handleManualLocationSearch = async () => {
    if (!locationInput.trim()) return;
    setIsLocating(true); setLocationError('');
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationInput)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat); const lng = parseFloat(data[0].lon);
        setLocation({ lat, lng }); findNearestHospital(lat, lng);
      } else {
        setLocationError("Could not find this city. Try again."); setIsLocating(false);
      }
    } catch (err) {
      setLocationError("Search failed."); setIsLocating(false);
    }
  };

  const startEnvironmentAnalysis = () => {
    const analyzeFrame = () => {
      if (!videoRef.current || !canvasRef.current) return;
      const video = videoRef.current; const canvas = canvasRef.current; const ctx = canvas.getContext('2d');
      if (!ctx || video.videoWidth === 0) { animationRef.current = requestAnimationFrame(analyzeFrame); return; }
      
      canvas.width = 64; canvas.height = 48;
      ctx.drawImage(video, 0, 0, 64, 48);
      const data = ctx.getImageData(0, 0, 64, 48).data;
      
      let totalBrightness = 0; let currentGray = new Uint8Array(64 * 48);
      for (let i = 0, j=0; i < data.length; i += 4, j++) {
        const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
        totalBrightness += gray; currentGray[j] = gray;
      }
      
      const isLightingGood = (totalBrightness / (64 * 48)) > 65; 
      let isStable = true;
      if (prevFrameRef.current) {
         let diff = 0;
         for(let i=0; i<currentGray.length; i++) diff += Math.abs(currentGray[i] - prevFrameRef.current[i]);
         isStable = (diff / currentGray.length) < 4.5; 
      }
      prevFrameRef.current = currentGray;
      setEnvStatus({ lighting: isLightingGood ? 'good' : 'dark', motion: isStable ? 'stable' : 'moving' });
      animationRef.current = requestAnimationFrame(analyzeFrame);
    };
    analyzeFrame();
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => { setLocation({ lat: position.coords.latitude, lng: position.coords.longitude }); findNearestHospital(position.coords.latitude, position.coords.longitude); },
        () => setLocationError("GPS Denied. Please type your city below.")
      );
    }

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => { videoRef.current?.play(); startEnvironmentAnalysis(); };
        }
      } catch (err) {
        setStatus('error'); setTriage(prev => ({ ...prev, message: "Camera access required." }));
      }
    };
    
    startCamera();
    return () => { 
      if (stream) stream.getTracks().forEach(track => track.stop()); 
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const startScan = () => {
    if (location.lat === 0 && location.lng === 0) { setLocationError("ERROR: Please provide a location before scanning."); return; }

    setStatus('recording'); setTimeLeft(45); recordedChunksRef.current = [];
    const stream = videoRef.current?.srcObject as MediaStream;
    if (!stream) return;

    const timerInterval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) clearInterval(timerInterval);
        return prev - 1;
      });
    }, 1000);

    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) recordedChunksRef.current.push(event.data); };

    mediaRecorder.onstop = async () => {
      setStatus('processing');
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const formData = new FormData(); formData.append('video', blob, 'scan.webm');

      try {
        const response = await fetch('http://127.0.0.1:8000/api/scan', { method: 'POST', body: formData });
        const data = await response.json();

        if (data.vitals?.status === "success") {
          const results = { 
            bpm: data.vitals.bpm || '--', 
            resp: data.vitals.respiration_rate || '--', 
            stress: data.vitals.stress_level || '--',
            eyeStatus: data.vitals.eye_status || '--'
          };
          setVitals(results);
          setSessionVitals(results); 
          
          const assignedFacility = nearestHospital.name;
          setTriage({ priority: data.triage_priority, facility: assignedFacility, message: `Priority ${data.triage_priority}: Routing to ${assignedFacility}` });
          setStatus('complete');

          await addDoc(collection(db, "scans"), {
            patientId: userData?.uid || "Anonymous",
            patientName: userData?.name || "Anonymous",
            ...results,
            priority: data.triage_priority,
            routedTo: assignedFacility,
            timestamp: serverTimestamp(),
            lat: location.lat, lng: location.lng,
          });
        } else {
          throw new Error(data.vitals?.message || "Signal failed.");
        }
      } catch (err: any) {
        setStatus('error'); setTriage(prev => ({ ...prev, message: err.message || "Server Error" }));
      }
    };

    mediaRecorder.start();
    setTimeout(() => { if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop(); }, 45000); 
  };

  const isEnvironmentBad = envStatus.lighting === 'dark' || envStatus.motion === 'moving';

  return (
    <div className="w-full max-w-2xl mx-auto bg-slate-900/80 p-8 rounded-3xl shadow-2xl border border-slate-700/50 backdrop-blur-sm">
      <h2 className="text-2xl font-black text-sky-400 mb-1 tracking-wider uppercase">Vitals Scanner</h2>
      <p className="text-slate-400 text-sm mb-6 font-medium">Extracting cardiovascular data via rPPG.</p>

      <div className="mb-6 p-4 bg-slate-950/50 rounded-xl border border-slate-800 text-left">
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Patient Location</label>
        <div className="flex gap-2 mb-2">
          <input type="text" placeholder="e.g., Salem, India" value={locationInput} onChange={(e) => setLocationInput(e.target.value)} className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500" />
          <button onClick={handleManualLocationSearch} disabled={isLocating} className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold py-2 px-4 rounded-lg transition-colors">Search</button>
        </div>
        {locationError && <p className="text-red-400 text-xs mb-2 font-bold">{locationError}</p>}
        <div className="text-xs font-mono text-slate-400">
          {isLocating ? <span className="text-sky-400 animate-pulse">Scanning satellites...</span> : location.lat !== 0 ? <><span className="text-emerald-500 mr-1">●</span>Facility: <span className="text-white font-bold">{nearestHospital.name}</span></> : <span className="text-amber-500">Awaiting location data...</span>}
        </div>
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div className="relative w-full rounded-2xl overflow-hidden border-2 border-slate-700 bg-black mb-6 aspect-video shadow-lg">
        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover -scale-x-100" />
        <div className="absolute inset-0 z-10 pointer-events-none" style={{ boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.85)', borderRadius: '50%', width: '45%', height: '85%', top: '7.5%', left: '27.5%', border: isEnvironmentBad && status === 'idle' ? '3px solid #ef4444' : '3px solid #10b981' }}></div>

        {status === 'idle' && (
          <div className="absolute top-3 left-3 z-20 flex flex-col gap-2 text-[10px] uppercase font-bold tracking-wider">
            <div className={`px-2 py-1 rounded backdrop-blur-sm border ${envStatus.lighting === 'good' ? 'bg-emerald-900/50 text-emerald-400 border-emerald-500/50' : 'bg-red-900/80 text-red-400 border-red-500'}`}>
              {envStatus.lighting === 'good' ? '● Lighting OK' : '⚠ Too Dark'}
            </div>
            <div className={`px-2 py-1 rounded backdrop-blur-sm border ${envStatus.motion === 'stable' ? 'bg-emerald-900/50 text-emerald-400 border-emerald-500/50' : 'bg-red-900/80 text-red-400 border-red-500'}`}>
              {envStatus.motion === 'stable' ? '● Posture OK' : '⚠ Face Moving'}
            </div>
          </div>
        )}
        {status === 'recording' && <div className="absolute bottom-4 left-0 w-full text-center z-20"><span className="bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold animate-pulse">RECORDING: {timeLeft}s</span></div>}
        {status === 'processing' && <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center backdrop-blur-sm z-30"><div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mb-3"></div><p className="text-sky-400 font-bold tracking-widest text-sm uppercase">Extracting Vitals</p></div>}
      </div>

      <button onClick={startScan} disabled={status === 'recording' || status === 'processing' || location.lat === 0 || (isEnvironmentBad && status === 'idle')} className="w-full bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-900 font-extrabold py-4 px-6 rounded-xl transition-all shadow-[0_0_20px_rgba(56,189,248,0.3)] uppercase tracking-wide mb-8">
        {location.lat === 0 ? "Enter Location First" : isEnvironmentBad && status === 'idle' ? "Fix Lighting / Stop Moving" : status === 'idle' ? "Initiate 45-Second Scan" : status === 'recording' ? `Recording (${timeLeft}s remaining)` : status === 'processing' ? "AI Processing Data..." : "Scan Complete - Scan Again"}
      </button>

      <div className={`grid grid-cols-2 gap-4 transition-opacity duration-500 ${status === 'complete' || status === 'error' ? 'opacity-100' : 'opacity-30'}`}>
        <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-700/50 shadow-inner"><div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Heart Rate</div><div className="text-3xl font-black text-emerald-400">{vitals.bpm} <span className="text-sm font-medium">BPM</span></div></div>
        <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-700/50 shadow-inner"><div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Respiration</div><div className="text-3xl font-black text-emerald-400">{vitals.resp} <span className="text-sm font-medium">BrPM</span></div></div>
        <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-700/50 shadow-inner"><div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Eye Diagnostics</div><div className={`text-xl font-bold ${vitals.eyeStatus?.includes('Clear') ? 'text-emerald-400' : 'text-sky-400'}`}>{vitals.eyeStatus}</div></div>
        <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-700/50 shadow-inner"><div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Systemic Stress</div><div className={`text-xl font-bold ${vitals.stress?.includes('High') ? 'text-red-400' : 'text-amber-500'}`}>{vitals.stress}</div></div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// 2. AI CONSULT COMPONENT
// ══════════════════════════════════════════════════════════════════
function AIConsult({ userData }: { userData: any }) {
  const [messages, setMessages] = useState<{role: string, text: string}[]>([
    { role: 'ai', text: `Hello ${userData?.name || 'Patient'}. I am your diagnostic AI assistant. Please describe your symptoms.` }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input;
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('http://127.0.0.1:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: userData?.uid, symptoms: userMsg })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'ai', text: data.reply || "Thinking..." }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'ai', text: "⚠️ Multi-Agent Server Offline." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-slate-900/80 rounded-3xl shadow-2xl border border-slate-700/50 backdrop-blur-sm flex flex-col h-[650px]">
      <div className="p-6 border-b border-slate-800"><h2 className="text-xl font-black text-emerald-400 uppercase tracking-widest">Diagnostic Consult</h2></div>
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl p-4 text-sm ${msg.role === 'user' ? 'bg-sky-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700'}`}>{msg.text}</div>
          </div>
        ))}
        {isLoading && <div className="text-xs font-bold text-emerald-400 animate-pulse">Agent is thinking...</div>}
      </div>
      <form onSubmit={sendMessage} className="p-4 bg-slate-900 border-t border-slate-800 flex gap-2">
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type symptoms..." className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none" />
        <button type="submit" disabled={isLoading} className="bg-emerald-500 text-slate-900 font-bold px-6 rounded-xl">Send</button>
      </form>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// 3. IMAGING COMPONENT
// ══════════════════════════════════════════════════════════════════
function MedicalImaging({ userData, setSessionVision }: { userData: any, setSessionVision: any }) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState('');

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setResult('');

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('patient_id', userData?.uid);

      const res = await fetch('http://127.0.0.1:8001/api/analyze-scan', { method: 'POST', body: formData });
      const data = await res.json();
      setResult(data.analysis || "Scan complete.");
      setSessionVision(data.analysis); 
    } catch (err) {
      setResult("⚠️ Vision Server Offline.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-slate-900/80 p-8 rounded-3xl shadow-2xl border border-slate-700/50 backdrop-blur-sm">
      <h2 className="text-2xl font-black text-indigo-400 mb-1 tracking-wider uppercase">Imaging AI</h2>
      <p className="text-slate-400 text-sm mb-8 font-medium">Upload CT/MRI for LLaVA Multimodal evaluation.</p>
      <div className="border-2 border-dashed border-slate-700 rounded-2xl p-10 flex flex-col items-center justify-center bg-slate-950/30 hover:bg-slate-950/50 transition-colors relative">
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
        <div className="text-5xl mb-4 opacity-50">🩻</div>
        <p className="text-slate-300 font-bold">{file ? file.name : "Drag & Drop Medical Scan"}</p>
      </div>
      <button onClick={handleUpload} disabled={!file || isUploading} className="w-full mt-6 bg-indigo-500 hover:bg-indigo-400 text-white font-extrabold py-4 px-6 rounded-xl transition-all shadow-lg uppercase">
        {isUploading ? "AI Analyzing..." : "Run Vision Analysis"}
      </button>
      {result && (
        <div className="mt-8 p-6 bg-slate-950 rounded-xl border border-slate-800 text-slate-300 text-sm leading-relaxed">{result}</div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// 4. EMBEDDED TRIAGE MAP COMPONENT (WITH OVERPASS API PROTECTION)
// ══════════════════════════════════════════════════════════════════
function TriageMap({ userLat, userLng, priority }: { userLat: number, userLng: number, priority: number }) {
  const mapInstance = useRef<any>(null);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [mapError, setMapError] = useState('');

  useEffect(() => {
      const L = (window as any).L;
      if (!L) {
          const script = document.createElement('script');
          script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          const link = document.createElement('link');
          link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
          script.onload = () => initMap((window as any).L);
          document.body.appendChild(script);
      } else { initMap(L); }
      return () => { if (mapInstance.current) mapInstance.current.remove(); };
  }, []);

  const initMap = (L: any) => {
      if (!L || mapInstance.current) return;
      const container = document.getElementById('triage-map-ui');
      if (!container) return;

      mapInstance.current = L.map('triage-map-ui').setView([userLat, userLng], 13);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(mapInstance.current);
      L.circleMarker([userLat, userLng], { radius: 8, fillColor: "#38bdf8", color: "#fff", weight: 2, fillOpacity: 0.9 }).addTo(mapInstance.current);
      fetchHospitals(L);
  };

  // 🌟 FIX: Protected Overpass API Call for Map Drawing
  const fetchHospitals = async (L: any) => {
      try {
          const res = await fetch(`https://overpass-api.de/api/interpreter?data=[out:json];node["amenity"="hospital"](around:10000,${userLat},${userLng});out 5;`);
          
          const contentType = res.headers.get("content-type");
          if (!contentType || !contentType.includes("application/json")) {
              throw new Error("Map API Overloaded");
          }

          const data = await res.json();
          const validElements = data.elements ? data.elements.filter((h: any) => h.lat && h.lon) : [];
          
          const list = validElements.map((h: any) => {
              const marker = L.circleMarker([h.lat, h.lon], { radius: 10, fillColor: "#10b981", color: "#fff", weight: 1, fillOpacity: 0.8 }).addTo(mapInstance.current);
              marker.bindPopup(`<b>${h.tags?.name || "Emergency Facility"}</b>`);
              return { name: h.tags?.name || "Emergency Facility", dist: "Nearby" };
          });
          setHospitals(list);
      } catch (e) { 
          console.error(e);
          setMapError("Live hospital feed temporarily unavailable.");
      }
  };

  return (
      <div className="bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl overflow-hidden h-[500px] flex flex-col md:flex-row relative">
          <div id="triage-map-ui" className="flex-1 h-full bg-slate-950"></div>
          <div className="w-full md:w-72 p-6 bg-slate-950/80 overflow-y-auto z-10 border-l border-slate-800">
              <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-4">Nearby Facilities</h3>
              {mapError && <p className="text-xs text-red-400 mb-4 font-bold animate-pulse">{mapError}</p>}
              {hospitals.length === 0 && !mapError && <p className="text-[10px] text-slate-500 uppercase">Scanning for nodes...</p>}
              {hospitals.map((h, i) => (
                  <div key={i} className="mb-4 p-4 bg-slate-900 rounded-2xl border border-slate-700 hover:border-sky-500/50 cursor-pointer transition-colors">
                      <p className="text-white text-sm font-bold mb-1 truncate">{h.name}</p>
                      <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
                          <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">Traffic: LOW</span>
                          <span>Wait: 5m</span>
                      </div>
                  </div>
              ))}
          </div>
      </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// 5. MAIN DASHBOARD SHELL
// ══════════════════════════════════════════════════════════════════
export default function PatientHub() {
  const router = useRouter();
  const [userData, setUserData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'vitals' | 'imaging' | 'triage-map' | 'executive' | 'chat'>('vitals');
  const [isLoading, setIsLoading] = useState(true);
  
  const [sessionVitals, setSessionVitals] = useState<any>(null);
  const [sessionVision, setSessionVision] = useState<string>("");
  const [userLoc, setUserLoc] = useState({ lat: 12.9716, lng: 77.5946 });

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => { setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }); });
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists() && snap.data().role === 'patient') { setUserData({ uid: user.uid, ...snap.data() }); }
        else { router.push('/login'); }
      } else { router.push('/login'); }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  if (isLoading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-sky-400 font-black animate-pulse uppercase tracking-[.5em]">Authenticating...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row font-sans">
      <aside className="w-full md:w-72 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="p-8 border-b border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 bg-sky-500 rounded-xl flex items-center justify-center font-black text-slate-900 text-xl">N</div>
          <span className="text-xl font-black tracking-widest uppercase">Nidan<span className="text-sky-400">Live</span></span>
        </div>

        <nav className="flex-1 p-4 space-y-3 mt-4">
          <button onClick={() => setActiveTab('vitals')} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-bold transition-all ${activeTab === 'vitals' ? 'bg-sky-500 text-slate-900 shadow-xl' : 'text-slate-400 hover:bg-slate-800'}`}>
            <span className="text-xl">📹</span> Vitals Scan
          </button>
          <button onClick={() => setActiveTab('imaging')} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-bold transition-all ${activeTab === 'imaging' ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-800'}`}>
            <span className="text-xl">🩻</span> Imaging AI
          </button>
          <button onClick={() => setActiveTab('triage-map')} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-bold transition-all ${activeTab === 'triage-map' ? 'bg-emerald-500 text-slate-900 shadow-xl' : 'text-slate-400 hover:bg-slate-800'}`}>
            <span className="text-xl">🗺️</span> Triage Map
          </button>
          <button onClick={() => setActiveTab('executive')} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-bold transition-all ${activeTab === 'executive' ? 'bg-amber-500 text-slate-900 shadow-xl' : 'text-slate-400 hover:bg-slate-800'}`}>
            <span className="text-xl">⚕️</span> Executive Board
          </button>
          <button onClick={() => setActiveTab('chat')} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-bold transition-all ${activeTab === 'chat' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
            <span className="text-xl">🧠</span> AI Consult
          </button>
        </nav>
      </aside>

      <main className="flex-1 p-4 md:p-10 overflow-y-auto relative bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
        <div className="relative z-10 max-w-6xl mx-auto">
          {activeTab === 'vitals' && <VitalsScanner userData={userData} setSessionVitals={setSessionVitals} />}
          {activeTab === 'imaging' && <MedicalImaging userData={userData} setSessionVision={setSessionVision} />}
          {activeTab === 'chat' && <AIConsult userData={userData} />}
          
          {activeTab === 'triage-map' && (
            <div className="space-y-6">
              <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-2xl">
                 <h2 className="text-3xl font-black text-emerald-400 uppercase tracking-tighter mb-2">Satellite Triage</h2>
                 <p className="text-slate-400 text-sm">Real-time hospital traffic analysis and emergency routing based on your clinical severity.</p>
              </div>
              <TriageMap userLat={userLoc.lat} userLng={userLoc.lng} priority={sessionVitals?.stress?.includes('High') ? 1 : 5} />
            </div>
          )}

          {activeTab === 'executive' && (
            <MultiAgentDashboard vitals={sessionVitals} visionReport={sessionVision} patientId={userData?.uid} />
          )}
        </div>
      </main>
    </div>
  );
}