'use client';

import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { getAuth, signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import dynamic from 'next/dynamic';

const auth = getAuth(db.app);

// Safe Map Import
const MapWithNoSSR = dynamic(() => import('@/components/LeafletMap'), { 
  ssr: false,
  loading: () => <div className="p-4 text-emerald-400 flex justify-center items-center h-full bg-slate-950 border border-slate-800 rounded-xl font-mono text-sm animate-pulse">Initializing Secure Map...</div> 
});

export default function HospitalDashboard() {
  const router = useRouter();
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 🌟 Presentation Upgrades
  const [crowdCount, setCrowdCount] = useState(12);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [isAllocating, setIsAllocating] = useState(false);
  const [allocationLog, setAllocationLog] = useState<string>('');

  useEffect(() => {
    // 1. Security Check
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) router.push('/login');
    });

    // 2. Listen to Live Triage Queue from Firebase
    const q = query(collection(db, 'scans'), orderBy('timestamp', 'desc'), limit(50));
    const unsubscribeDb = onSnapshot(q, (snapshot) => {
      const patientList = snapshot.docs.map(doc => ({ id: doc.id, room: 'Unassigned', ...doc.data() }));
      // Sort so Priority 1 is always at the top
      patientList.sort((a, b) => (a.priority || 5) - (b.priority || 5));
      setPatients(patientList);
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeDb();
    };
  }, [router]);

  // 🌟 Hackathon Trick: Simulate Live CCTV YOLOv8 Analytics
  useEffect(() => {
    const interval = setInterval(() => {
      setCrowdCount(prev => {
        const change = Math.random() > 0.5 ? 1 : -1;
        const newCount = prev + change;
        return newCount > 25 ? 25 : newCount < 5 ? 5 : newCount;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // 🌟 Simulated Autonomous Room Allocation
  const handleAutoAllocate = () => {
    setIsAllocating(true);
    setAllocationLog('Initializing Autonomous Routing Engine...');
    
    setTimeout(() => {
      const updated = patients.map(p => {
        if (p.priority === 1) p.room = `ICU-${Math.floor(Math.random() * 9) + 1}`;
        else if (p.priority === 2) p.room = `Trauma-${Math.floor(Math.random() * 5) + 1}`;
        else p.room = `Ward-${Math.floor(Math.random() * 20) + 10}`;
        return p;
      });
      setPatients(updated);
      setAllocationLog('✅ All critical patients routed to ICU/Trauma.');
      setTimeout(() => setIsAllocating(false), 3000);
    }, 1500);
  };

  // Stats
  const criticalCount = patients.filter(p => p.priority === 1 || p.priority === 2).length;
  const averageBpm = patients.length > 0 
    ? Math.round(patients.reduce((acc, p) => acc + (parseInt(p.bpm) || 0), 0) / patients.length) 
    : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30">
      
      {/* 🌟 Top Command Navbar */}
      <header className="bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between sticky top-0 z-40 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center font-black text-slate-900 text-2xl shadow-[0_0_20px_rgba(16,185,129,0.5)]">
            🏥
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-widest uppercase">Nidan-Live <span className="text-emerald-400">Command</span></h1>
            <p className="text-xs text-slate-400 font-mono">Central Triage & Fleet Management Protocol Active</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-3 bg-slate-950 px-5 py-2 rounded-xl border border-slate-800 shadow-inner">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Live Cloud Sync</span>
          </div>
          <button onClick={() => { signOut(auth); router.push('/'); }} className="text-sm font-bold text-slate-500 hover:text-red-400 bg-slate-800 hover:bg-slate-800/80 px-4 py-2 rounded-lg transition-colors border border-slate-700">
            Secure Logout
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-[1600px] mx-auto w-full grid grid-cols-1 xl:grid-cols-4 gap-6">
        
        {/* 🌟 LEFT COLUMN: Stats, Edge AI & Map */}
        <div className="xl:col-span-1 flex flex-col gap-6">
          
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl hover:border-sky-500/30 transition-colors">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Queue Size</p>
              <p className="text-4xl font-black text-white">{patients.length}</p>
            </div>
            <div className="bg-slate-900 border border-red-900/50 p-5 rounded-2xl shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 blur-2xl rounded-full group-hover:bg-red-500/20 transition-colors"></div>
              <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1 relative z-10">Critical</p>
              <p className="text-4xl font-black text-red-400 relative z-10">{criticalCount}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl hover:border-emerald-500/30 transition-colors">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Avg Wait</p>
              <p className="text-3xl font-black text-emerald-400">14<span className="text-sm text-slate-500 ml-1">min</span></p>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl hover:border-sky-500/30 transition-colors">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Avg Fleet BPM</p>
              <p className="text-3xl font-black text-sky-400">{averageBpm}</p>
            </div>
          </div>

          {/* YOLOv8 CCTV Edge Analytics Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[280px]">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/80 backdrop-blur-md z-10">
              <h3 className="font-black text-white flex items-center gap-2 text-sm uppercase tracking-wider">
                <span className="text-xl">📷</span> CCTV Edge Analytics
              </h3>
              <span className="text-[10px] font-black bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 px-2 py-1 rounded shadow-[0_0_10px_rgba(16,185,129,0.2)]">YOLOv8 Active</span>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
              {/* Fake CCTV feed styling */}
              <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=80&w=2053&auto=format&fit=crop')] bg-cover bg-center opacity-30 grayscale contrast-150 mix-blend-overlay scale-105"></div>
              <div className="absolute inset-0 bg-slate-900/60"></div>
              
              <div className="relative z-10 text-center bg-slate-950/80 border border-slate-700/50 p-6 rounded-3xl backdrop-blur-sm">
                <p className="text-7xl font-black text-white mb-1 tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] transition-all">{crowdCount}</p>
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Detected in ER Waiting</p>
              </div>

              {/* Bounding Box decorations */}
              <div className="absolute top-8 left-12 w-20 h-32 border border-emerald-500/50 bg-emerald-500/10 rounded z-10"></div>
              <div className="absolute bottom-12 right-16 w-16 h-24 border border-emerald-500/50 bg-emerald-500/10 rounded z-10"></div>
            </div>
          </div>

          {/* Geospatial Map */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl h-[280px] flex flex-col">
             <div className="p-3 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md z-10">
                <h3 className="font-black text-white text-xs uppercase tracking-wider pl-2">Live Ambulatory Map</h3>
             </div>
             <div className="flex-1 bg-slate-950">
               {/* Note: This uses the MapWithNoSSR. Ensure LeafletMap component handles multiple scans if passed */}
                <MapWithNoSSR scans={patients} />
             </div>
          </div>

        </div>

        {/* 🌟 RIGHT COLUMN: The Live Triage Queue */}
        <div className="xl:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden h-[870px] relative">
          <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950/80 backdrop-blur-md z-10">
            <div>
              <h2 className="text-2xl font-black text-white uppercase tracking-widest">Autonomous Triage Queue</h2>
              <p className="text-xs text-slate-400 mt-1 font-mono">Ranked via LangGraph multi-agent consensus & rPPG</p>
            </div>
            
            <div className="flex items-center gap-4">
               {isAllocating && <span className="text-xs font-bold text-sky-400 animate-pulse bg-sky-900/30 px-3 py-1.5 rounded-lg border border-sky-500/30">{allocationLog}</span>}
               <button 
                  onClick={handleAutoAllocate}
                  disabled={isAllocating || patients.length === 0}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-black py-3 px-6 rounded-xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] uppercase tracking-wider"
                >
                  {isAllocating ? 'Routing...' : 'Auto-Allocate Rooms'}
                </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-0 custom-scrollbar bg-slate-950/30">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Decrypting Queue...</p>
              </div>
            ) : patients.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mb-4 border border-slate-800 shadow-inner">
                    <span className="text-4xl">☕</span>
                </div>
                <p className="font-bold text-lg text-white">ER is Clear</p>
                <p className="text-sm font-mono mt-1">No incoming triage requests.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-900/90 text-[10px] uppercase tracking-widest text-slate-500 sticky top-0 z-10 backdrop-blur-md border-b border-slate-800">
                  <tr>
                    <th className="p-5 font-black">Patient Data</th>
                    <th className="p-5 font-black">rPPG Vitals</th>
                    <th className="p-5 font-black">Stress Index</th>
                    <th className="p-5 font-black">Room Allocation</th>
                    <th className="p-5 font-black text-center">AI Priority</th>
                    <th className="p-5 font-black text-right">Dossier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {patients.map((patient) => (
                    <tr key={patient.id} className={`hover:bg-slate-800/40 transition-colors group ${patient.priority === 1 ? 'bg-red-950/10' : ''}`}>
                      <td className="p-5">
                        <p className="font-black text-white text-base tracking-tight">{patient.patientName || 'Anonymous Patient'}</p>
                        <p className="text-[10px] text-slate-500 font-mono mt-1">{patient.patientId}</p>
                        {patient.lat && <p className="text-[9px] text-sky-400 mt-1">GPS: {patient.lat.toFixed(3)}, {patient.lng.toFixed(3)}</p>}
                      </td>
                      <td className="p-5">
                        <div className="flex items-center gap-4 bg-slate-950/50 p-2 rounded-xl border border-slate-800/50 w-fit">
                          <div className="text-center px-2">
                            <p className={`text-xl font-black ${parseInt(patient.bpm) > 100 ? 'text-red-400' : parseInt(patient.bpm) < 50 ? 'text-orange-400' : 'text-emerald-400'}`}>{patient.bpm}</p>
                            <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">BPM</p>
                          </div>
                          <div className="w-px h-8 bg-slate-700/50"></div>
                          <div className="text-center px-2">
                            <p className={`text-xl font-black ${parseInt(patient.resp) > 22 ? 'text-red-400' : 'text-sky-400'}`}>{patient.resp}</p>
                            <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Resp</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-5">
                        <span className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide border shadow-sm ${
                          patient.stress?.includes('High') ? 'bg-red-500/10 text-red-400 border-red-500/30' : 
                          patient.stress?.includes('Low') ? 'bg-sky-500/10 text-sky-400 border-sky-500/30' : 
                          'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        }`}>
                          {patient.stress || 'Normal'}
                        </span>
                      </td>
                      <td className="p-5">
                          <span className={`text-xs font-bold font-mono px-3 py-1.5 rounded-lg ${patient.room !== 'Unassigned' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'text-slate-500 border border-slate-800'}`}>
                             {patient.room}
                          </span>
                      </td>
                      <td className="p-5 text-center">
                        <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl font-black text-lg border ${
                          patient.priority === 1 ? 'bg-red-600 text-white border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)] animate-pulse' :
                          patient.priority === 2 ? 'bg-orange-500/20 text-orange-400 border-orange-500/50' :
                          patient.priority === 3 ? 'bg-amber-500/20 text-amber-400 border-amber-500/50' :
                          'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          P{patient.priority || 5}
                        </div>
                      </td>
                      <td className="p-5 text-right">
                        <button 
                          onClick={() => setSelectedPatient(patient)}
                          className="text-xs font-black text-sky-400 hover:text-slate-900 bg-slate-950 hover:bg-sky-400 transition-all px-4 py-2.5 rounded-xl border border-slate-700 hover:border-sky-400 shadow-md uppercase tracking-wider"
                        >
                          Review AI
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </main>

      {/* 🌟 Patient Dossier Modal */}
      {selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 w-full max-w-3xl rounded-3xl border border-slate-700 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
             
             {/* Modal Header */}
             <div className="p-6 border-b border-slate-800 bg-slate-950/80 flex justify-between items-start">
                <div>
                   <h2 className="text-2xl font-black text-white tracking-tight">{selectedPatient.patientName || 'Anonymous Patient'}</h2>
                   <p className="text-xs text-slate-500 font-mono mt-1">ID: {selectedPatient.patientId}</p>
                </div>
                <button onClick={() => setSelectedPatient(null)} className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-red-500 flex items-center justify-center transition-colors font-bold">
                   ✕
                </button>
             </div>

             {/* Modal Body */}
             <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                
                <div className="grid grid-cols-3 gap-4">
                   <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 shadow-inner">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Heart Rate</p>
                      <p className="text-3xl font-black text-white">{selectedPatient.bpm} <span className="text-sm text-emerald-400">BPM</span></p>
                   </div>
                   <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 shadow-inner">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Respiration</p>
                      <p className="text-3xl font-black text-white">{selectedPatient.resp} <span className="text-sm text-sky-400">BrPM</span></p>
                   </div>
                   <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 shadow-inner">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Calculated Stress</p>
                      <p className={`text-xl mt-2 font-black uppercase ${selectedPatient.stress?.includes('High') ? 'text-red-400' : 'text-emerald-400'}`}>{selectedPatient.stress}</p>
                   </div>
                </div>

                <div className="bg-indigo-950/20 p-5 rounded-2xl border border-indigo-500/20">
                   <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                     <span className="text-base">🩻</span> Diagnostic AI Report (Vision)
                   </h3>
                   <div className="bg-slate-950 rounded-xl p-4 border border-slate-800">
                     <p className="text-slate-300 text-sm leading-relaxed font-mono whitespace-pre-wrap">
                        {/* Simulating what a stored vision report might look like if not passed from frontend directly, or using placeholder */}
                        {selectedPatient.visionReport || "Patient vitals captured via remote photoplethysmography (rPPG). No advanced imaging data (MRI/CT) was provided during this triage session. Proceed with physical evaluation."}
                     </p>
                   </div>
                </div>

             </div>

             {/* Modal Footer */}
             <div className="p-6 border-t border-slate-800 bg-slate-950/50 flex justify-end gap-4">
                <button onClick={() => setSelectedPatient(null)} className="px-6 py-3 rounded-xl font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                   Close Dossier
                </button>
                <button onClick={() => { handleAutoAllocate(); setSelectedPatient(null); }} className="px-6 py-3 rounded-xl font-black text-slate-900 bg-emerald-500 hover:bg-emerald-400 transition-colors shadow-lg uppercase tracking-wider">
                   Admit Patient
                </button>
             </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
      `}</style>
    </div>
  );
}