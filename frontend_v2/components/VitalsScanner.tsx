'use client';
import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function VitalsScanner({ userData, setSessionVitals }: { userData: any, setSessionVitals: any }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const animationRef = useRef<number | null>(null);
  const prevFrameRef = useRef<Uint8Array | null>(null);

  const [status, setStatus] = useState<string>('idle'); 
  const [timeLeft, setTimeLeft] = useState(10); // 🌟 10 Second Timer
  const [vitals, setVitals] = useState({ bpm: '--', resp: '--', stress: '--', eyeStatus: '--' });
  const [location, setLocation] = useState({ lat: 0, lng: 0 }); 
  const [locationInput, setLocationInput] = useState('');
  const [locationError, setLocationError] = useState('');
  const [nearestHospital, setNearestHospital] = useState({ name: 'Waiting for location...', lat: 0, lng: 0 });
  const [isLocating, setIsLocating] = useState(false);
  const [envStatus, setEnvStatus] = useState({ lighting: 'checking', motion: 'checking' });

  const findNearestHospital = async (lat: number, lng: number) => {
    setIsLocating(true);
    try {
      const query = `[out:json];node["amenity"="hospital"](around:15000,${lat},${lng});out 5;`;
      const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
      const contentType = res.headers.get("content-type");
      if (!res.ok || !contentType || !contentType.includes("application/json")) throw new Error("API Overloaded");

      const data = await res.json();
      if (data.elements && data.elements.length > 0) {
        const validHospitals = data.elements.filter((h: any) => h.lat && h.lon);
        if (validHospitals.length > 0) {
            setNearestHospital({ name: validHospitals[0].tags?.name || "General Medical Center", lat: validHospitals[0].lat, lng: validHospitals[0].lon });
        } else {
            setNearestHospital({ name: "General Medical Center", lat: lat + 0.01, lng: lng + 0.01 });
        }
      } else { throw new Error("No hospitals found."); }
    } catch (err) {
      setNearestHospital({ name: "Central City Hospital", lat: lat + 0.015, lng: lng + 0.015 });
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
    } catch (err) { setLocationError("Search failed."); setIsLocating(false); }
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
      } catch (err) { setStatus('error'); }
    };
    startCamera();
    return () => { 
      if (stream) stream.getTracks().forEach(track => track.stop()); 
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const startScan = () => {
    if (location.lat === 0 && location.lng === 0) { setLocationError("ERROR: Provide location."); return; }
    setStatus('recording'); setTimeLeft(10); recordedChunksRef.current = [];
    const stream = videoRef.current?.srcObject as MediaStream;
    if (!stream) return;

    const timerInterval = setInterval(() => {
      setTimeLeft(prev => { if (prev <= 1) clearInterval(timerInterval); return prev - 1; });
    }, 1000);

    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) recordedChunksRef.current.push(event.data); };

    mediaRecorder.onstop = async () => {
      setStatus('processing');
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const formData = new FormData(); formData.append('video', blob, 'scan.webm');

      try {
        // 🌟 DYNAMIC HOST: Works on both localhost and Mobile IPs
        const host = window.location.hostname;
        const response = await fetch(`http://${host}:8000/api/scan`, { method: 'POST', body: formData });
        const data = await response.json();

        if (data.vitals?.status === "success") {
          const results = { bpm: data.vitals.bpm || '--', resp: data.vitals.respiration_rate || '--', stress: data.vitals.stress_level || '--', eyeStatus: data.vitals.eye_status || '--' };
          setVitals(results); setSessionVitals(results); setStatus('complete');

          await addDoc(collection(db, "scans"), {
            patientId: userData?.uid || "Anonymous", patientName: userData?.name || "Anonymous", ...results,
            priority: data.triage_priority, routedTo: nearestHospital.name, timestamp: serverTimestamp(),
            lat: location.lat, lng: location.lng,
          });
        } else { throw new Error(data.vitals?.message || "Signal failed."); }
      } catch (err: any) { setStatus('error'); }
    };

    mediaRecorder.start();
    setTimeout(() => { if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop(); }, 10000); 
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
            <div className={`px-2 py-1 rounded backdrop-blur-sm border ${envStatus.lighting === 'good' ? 'bg-emerald-900/50 text-emerald-400 border-emerald-500/50' : 'bg-red-900/80 text-red-400 border-red-500'}`}>{envStatus.lighting === 'good' ? '● Lighting OK' : '⚠ Too Dark'}</div>
            <div className={`px-2 py-1 rounded backdrop-blur-sm border ${envStatus.motion === 'stable' ? 'bg-emerald-900/50 text-emerald-400 border-emerald-500/50' : 'bg-red-900/80 text-red-400 border-red-500'}`}>{envStatus.motion === 'stable' ? '● Posture OK' : '⚠ Face Moving'}</div>
          </div>
        )}
        {status === 'recording' && <div className="absolute bottom-4 left-0 w-full text-center z-20"><span className="bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold animate-pulse">RECORDING: {timeLeft}s</span></div>}
        {status === 'processing' && <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center backdrop-blur-sm z-30"><div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mb-3"></div><p className="text-sky-400 font-bold tracking-widest text-sm uppercase">Extracting Vitals</p></div>}
      </div>

      <button onClick={startScan} disabled={status === 'recording' || status === 'processing' || location.lat === 0 || (isEnvironmentBad && status === 'idle')} className="w-full bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-900 font-extrabold py-4 px-6 rounded-xl transition-all shadow-[0_0_20px_rgba(56,189,248,0.3)] uppercase tracking-wide mb-8">
        {location.lat === 0 ? "Enter Location First" : isEnvironmentBad && status === 'idle' ? "Fix Lighting / Stop Moving" : status === 'idle' ? "Initiate 10-Second Scan" : status === 'recording' ? `Recording (${timeLeft}s remaining)` : status === 'processing' ? "AI Processing Data..." : "Scan Complete - Scan Again"}
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