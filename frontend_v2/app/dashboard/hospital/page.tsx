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

// 🌟 MANCHESTER TRIAGE SYSTEM (MTS) HELPER
const getMTSConfig = (priority: number) => {
  switch(priority) {
    case 1: return { color: 'bg-red-600 text-white border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)] animate-pulse', label: '1 - IMMEDIATE', time: '0 min' };
    case 2: return { color: 'bg-orange-500 text-white border-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.4)]', label: '2 - V. URGENT', time: '10 min' };
    case 3: return { color: 'bg-yellow-400 text-slate-900 border-yellow-300 font-black', label: '3 - URGENT', time: '60 min' };
    case 4: return { color: 'bg-emerald-500 text-white border-emerald-400', label: '4 - STANDARD', time: '120 min' };
    case 5: default: return { color: 'bg-blue-600 text-white border-blue-500', label: '5 - NON-URGENT', time: '240 min' };
  }
};

// 🌟 DEMO SETTING: Set to 15 so you can easily show the judges the "Full Capacity" warning!
const MAX_HOSPITAL_CAPACITY = 15;

export default function HospitalDashboard() {
  const router = useRouter();
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [crowdCount, setCrowdCount] = useState(12);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [isAllocating, setIsAllocating] = useState(false);
  const [allocationLog, setAllocationLog] = useState<string>('');

  const [filter, setFilter] = useState<'all' | 'critical' | 'unassigned'>('all');
  const [isCodeRed, setIsCodeRed] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

  // 🌟 NEW: Calculate if facility is full
  const isAtCapacity = patients.length >= MAX_HOSPITAL_CAPACITY;

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) router.push('/login');
    });

    const q = query(collection(db, 'scans'), orderBy('timestamp', 'desc'), limit(50));
    const unsubscribeDb = onSnapshot(q, (snapshot) => {
      const patientList = snapshot.docs.map(doc => ({ id: doc.id, room: 'Unassigned', ...doc.data() }));
      
      setPatients(patientList);
      
      const hasUnassignedCritical = patientList.some(p => p.priority === 1 && p.room === 'Unassigned');
      setIsCodeRed(hasUnassignedCritical);
      
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeDb();
    };
  }, [router]);

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

  const handleAutoAllocate = () => {
    setIsAllocating(true);
    
    if (isAtCapacity) {
        setAllocationLog('⚠️ CAPACITY BREACH: Attempting to overflow Ward rooms...');
    } else {
        setAllocationLog('Initializing MTS Routing Engine...');
    }
    
    setTimeout(() => {
      const updated = patients.map(p => {
        const prio = p.priority || 5;
        if (prio === 1) p.room = `Resuscitation-${Math.floor(Math.random() * 3) + 1}`;
        else if (prio === 2) p.room = `Trauma-${Math.floor(Math.random() * 5) + 1}`;
        else if (prio === 3) p.room = `Urgent Care-${Math.floor(Math.random() * 10) + 1}`;
        else if (prio === 4) p.room = `Ward-${Math.floor(Math.random() * 20) + 10}`;
        else p.room = `Waiting Area`;
        return p;
      });
      setPatients(updated);
      setIsCodeRed(false); 
      setAllocationLog('✅ MTS Protocol Executed. Rooms assigned.');
      setTimeout(() => setIsAllocating(false), 3000);
    }, 1500);
  };

  const handleQuickAction = (msg: string) => {
    setActionMessage(msg);
    setTimeout(() => setActionMessage(''), 3000);
  };

  const criticalCount = patients.filter(p => p.priority === 1 || p.priority === 2).length;
  const averageBpm = patients.length > 0 
    ? Math.round(patients.reduce((acc, p) => acc + (parseInt(p.bpm) || 0), 0) / patients.length) 
    : 0;

  const filteredPatients = patients.filter(p => {
      if (filter === 'critical') return p.priority === 1 || p.priority === 2;
      if (filter === 'unassigned') return p.room === 'Unassigned';
      return true;
  });

  return (
    <div className={`min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 transition-all duration-700 ${isCodeRed && !isAtCapacity ? 'shadow-[inset_0_0_150px_rgba(220,38,38,0.15)]' : ''}`}>
      
      {/* 🌟 DIVERSION WARNING BANNER */}
      {isAtCapacity && (
        <div className="w-full bg-amber-500 text-slate-950 font-black uppercase tracking-[0.2em] p-2 text-center text-xs animate-pulse border-b-4 border-amber-600 shadow-[0_0_20px_rgba(245,158,11,0.5)] z-50">
           ⚠️ FACILITY AT MAXIMUM CAPACITY. INITIATING AMBULANCE DIVERSION TO SECONDARY NODES. ⚠️
        </div>
      )}

      <header className={`border-b p-4 flex items-center justify-between sticky top-0 z-40 shadow-2xl transition-colors duration-500 ${isCodeRed && !isAtCapacity ? 'bg-red-950/40 border-red-900/50' : 'bg-slate-900 border-slate-800'}`}>
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-slate-900 text-2xl transition-all duration-500 ${isCodeRed && !isAtCapacity ? 'bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.8)] animate-pulse' : 'bg-gradient-to-br from-emerald-400 to-teal-600 shadow-[0_0_20px_rgba(16,185,129,0.5)]'}`}>
            {isCodeRed && !isAtCapacity ? '🚨' : '🏥'}
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-widest uppercase">Nidan-Live <span className={isCodeRed && !isAtCapacity ? 'text-red-400' : 'text-emerald-400'}>Command</span></h1>
            <p className="text-xs text-slate-400 font-mono">Manchester Triage System (MTS) Protocol Active</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          {isCodeRed && !isAtCapacity && (
              <span className="hidden lg:block text-red-400 font-black tracking-widest uppercase text-sm animate-pulse bg-red-500/10 px-4 py-2 rounded-xl border border-red-500/30">
                  CODE RED: Unassigned P1 Patient Detected
              </span>
          )}
          <div className="hidden md:flex items-center gap-3 bg-slate-950 px-5 py-2 rounded-xl border border-slate-800 shadow-inner">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Live Cloud Sync</span>
          </div>
          <button onClick={() => { signOut(auth); router.push('/'); }} className="text-sm font-bold text-slate-500 hover:text-red-400 bg-slate-800 hover:bg-slate-800/80 px-4 py-2 rounded-lg transition-colors border border-slate-700">
            Secure Logout
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-[1600px] mx-auto w-full grid grid-cols-1 xl:grid-cols-4 gap-6">
        
        <div className="xl:col-span-1 flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4">
            
            {/* 🌟 CAPACITY PROGRESS CARD */}
            <div className={`border p-5 rounded-2xl shadow-xl transition-all duration-300 ${isAtCapacity ? 'bg-amber-900/20 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'bg-slate-900 border-slate-800 hover:border-sky-500/30'}`}>
              <div className="flex justify-between items-end mb-1">
                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Capacity</p>
                 <span className={`text-[10px] font-black uppercase tracking-widest ${isAtCapacity ? 'text-amber-400 animate-pulse' : 'text-emerald-400'}`}>{isAtCapacity ? 'FULL' : 'OPEN'}</span>
              </div>
              <p className={`text-4xl font-black ${isAtCapacity ? 'text-amber-400' : 'text-white'}`}>{patients.length} <span className="text-lg text-slate-500">/ {MAX_HOSPITAL_CAPACITY}</span></p>
              <div className="w-full bg-slate-950 h-1.5 mt-3 rounded-full overflow-hidden border border-slate-800">
                 <div className={`h-full ${isAtCapacity ? 'bg-amber-400' : 'bg-sky-400'}`} style={{ width: `${Math.min((patients.length / MAX_HOSPITAL_CAPACITY) * 100, 100)}%`, transition: 'width 0.5s ease-in-out' }}></div>
              </div>
            </div>

            <div className="bg-slate-900 border border-red-900/50 p-5 rounded-2xl shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 blur-2xl rounded-full group-hover:bg-red-500/20 transition-colors"></div>
              <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1 relative z-10">MTS Level 1 & 2</p>
              <p className="text-4xl font-black text-red-400 relative z-10">{criticalCount}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl hover:border-emerald-500/30 transition-colors">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Avg Wait</p>
              <p className={`text-3xl font-black ${isAtCapacity ? 'text-amber-400' : 'text-emerald-400'}`}>{isAtCapacity ? '45' : '14'}<span className="text-sm text-slate-500 ml-1">min</span></p>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl hover:border-sky-500/30 transition-colors">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Avg Fleet BPM</p>
              <p className="text-3xl font-black text-sky-400">{averageBpm}</p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[280px]">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/80 backdrop-blur-md z-10">
              <h3 className="font-black text-white flex items-center gap-2 text-sm uppercase tracking-wider">
                <span className="text-xl">📷</span> CCTV Edge Analytics
              </h3>
              <span className="text-[10px] font-black bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 px-2 py-1 rounded shadow-[0_0_10px_rgba(16,185,129,0.2)]">YOLOv8 Active</span>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=80&w=2053&auto=format&fit=crop')] bg-cover bg-center opacity-30 grayscale contrast-150 mix-blend-overlay scale-105"></div>
              <div className="absolute inset-0 bg-slate-900/60"></div>
              
              <div className="relative z-10 text-center bg-slate-950/80 border border-slate-700/50 p-6 rounded-3xl backdrop-blur-sm">
                <p className="text-7xl font-black text-white mb-1 tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] transition-all">{crowdCount}</p>
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Detected in ER Waiting</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl h-[280px] flex flex-col">
             <div className="p-3 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md z-10">
                <h3 className="font-black text-white text-xs uppercase tracking-wider pl-2">Live Ambulatory Map</h3>
             </div>
             <div className="flex-1 bg-slate-950">
                <MapWithNoSSR scans={patients} />
             </div>
          </div>
        </div>

        <div className="xl:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden h-[870px] relative">
          
          <div className="p-6 border-b border-slate-800 flex flex-col lg:flex-row lg:justify-between lg:items-center bg-slate-950/80 backdrop-blur-md z-10 gap-4">
            <div>
              <h2 className="text-2xl font-black text-white uppercase tracking-widest flex items-center gap-3">
                Autonomous Triage Queue
              </h2>
              <div className="flex flex-wrap gap-2 mt-2">
                 <span className="text-[9px] font-black uppercase text-white bg-red-600 px-2 py-0.5 rounded shadow-[0_0_10px_rgba(220,38,38,0.5)]">1 - Immediate</span>
                 <span className="text-[9px] font-black uppercase text-white bg-orange-500 px-2 py-0.5 rounded">2 - Very Urgent</span>
                 <span className="text-[9px] font-black uppercase text-slate-900 bg-yellow-400 px-2 py-0.5 rounded">3 - Urgent</span>
                 <span className="text-[9px] font-black uppercase text-white bg-emerald-500 px-2 py-0.5 rounded">4 - Standard</span>
                 <span className="text-[9px] font-black uppercase text-white bg-blue-600 px-2 py-0.5 rounded">5 - Non-Urgent</span>
              </div>
            </div>
            
            <div className="flex items-center gap-4 flex-wrap">
               <div className="bg-slate-950 border border-slate-700 p-1 rounded-xl flex gap-1 mr-2">
                  <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filter === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>All</button>
                  <button onClick={() => setFilter('critical')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filter === 'critical' ? 'bg-red-500/20 text-red-400' : 'text-slate-400 hover:text-red-400'}`}>Critical</button>
                  <button onClick={() => setFilter('unassigned')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filter === 'unassigned' ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-400 hover:text-indigo-300'}`}>Unassigned</button>
               </div>

               {isAllocating && <span className={`text-xs font-bold animate-pulse px-3 py-1.5 rounded-lg border ${isAtCapacity ? 'text-amber-400 bg-amber-900/30 border-amber-500/30' : 'text-sky-400 bg-sky-900/30 border-sky-500/30'}`}>{allocationLog}</span>}
               <button 
                  onClick={handleAutoAllocate}
                  disabled={isAllocating || patients.length === 0}
                  className={`${isAtCapacity ? 'bg-amber-600 hover:bg-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.3)]' : 'bg-emerald-600 hover:bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]'} disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-black py-3 px-6 rounded-xl transition-all uppercase tracking-wider whitespace-nowrap`}
                >
                  {isAllocating ? 'Routing...' : isAtCapacity ? 'Force Overflow Allocation' : 'Auto-Allocate Rooms'}
                </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-0 custom-scrollbar bg-slate-950/30">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Decrypting Queue...</p>
              </div>
            ) : filteredPatients.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mb-4 border border-slate-800 shadow-inner">
                    <span className="text-4xl">☕</span>
                </div>
                <p className="font-bold text-lg text-white">No Results</p>
                <p className="text-sm font-mono mt-1">Try changing your filter settings.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-900/90 text-[10px] uppercase tracking-widest text-slate-500 sticky top-0 z-10 backdrop-blur-md border-b border-slate-800">
                  <tr>
                    <th className="p-5 font-black">Patient Data</th>
                    <th className="p-5 font-black">rPPG Vitals</th>
                    <th className="p-5 font-black">Stress Index</th>
                    <th className="p-5 font-black">Room Allocation</th>
                    <th className="p-5 font-black text-center">MTS Priority</th>
                    <th className="p-5 font-black text-right">Dossier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {filteredPatients.map((patient) => {
                    const mts = getMTSConfig(patient.priority || 5);
                    return (
                    <tr key={patient.id} className={`hover:bg-slate-800/40 transition-colors group ${patient.priority === 1 ? 'bg-red-950/10' : ''}`}>
                      <td className="p-5">
                        <p className="font-black text-white text-base tracking-tight">{patient.patientName || 'Anonymous Patient'}</p>
                        {patient.timestamp && (
                            <p className="text-[10px] font-bold text-emerald-400 mt-1">Scanned: {new Date(patient.timestamp?.toDate ? patient.timestamp.toDate() : patient.timestamp).toLocaleTimeString()}</p>
                        )}
                        <p className="text-[10px] text-slate-500 font-mono mt-1">ID: {patient.patientId}</p>
                        {patient.lat && <p className="text-[9px] text-sky-400 mt-1">GPS: {patient.lat.toFixed(3)}, {patient.lng.toFixed(3)}</p>}
                      </td>
                      <td className="p-5">
                        <div className="flex items-center gap-4 bg-slate-950/50 p-2 rounded-xl border border-slate-800/50 w-fit">
                          <div className="text-center px-2">
                            <p className={`text-xl font-black ${parseInt(patient.bpm) > 110 ? 'text-red-400' : parseInt(patient.bpm) < 50 ? 'text-orange-400' : 'text-emerald-400'}`}>{patient.bpm}</p>
                            <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">BPM</p>
                          </div>
                          <div className="w-px h-8 bg-slate-700/50"></div>
                          <div className="text-center px-2">
                            <p className={`text-xl font-black ${parseInt(patient.resp) > 24 ? 'text-red-400' : 'text-sky-400'}`}>{patient.resp}</p>
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
                        <div className="flex flex-col items-center">
                           <div className={`inline-flex items-center justify-center px-3 py-1.5 rounded-lg font-black text-xs border ${mts.color}`}>
                             {mts.label}
                           </div>
                           <p className="text-[9px] text-slate-500 font-bold mt-1 uppercase tracking-widest">Max Wait: {mts.time}</p>
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
                  )})}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </main>

      {/* 🌟 Patient Dossier Modal */}
      {selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 w-full max-w-4xl rounded-3xl border border-slate-700 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
             
             <div className={`p-6 border-b border-slate-800 flex justify-between items-start ${selectedPatient.priority === 1 ? 'bg-red-950/40' : 'bg-slate-950/80'}`}>
                <div>
                   <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
                     {selectedPatient.patientName || 'Anonymous Patient'}
                     {selectedPatient.priority === 1 && <span className="bg-red-600 text-white text-[10px] px-2 py-1 rounded uppercase tracking-widest animate-pulse">Critical</span>}
                   </h2>
                   <p className="text-xs text-slate-500 font-mono mt-1">ID: {selectedPatient.patientId}</p>
                </div>
                <button onClick={() => setSelectedPatient(null)} className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-red-500 flex items-center justify-center transition-colors font-bold">
                   ✕
                </button>
             </div>

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
                        {selectedPatient.visionReport || "Patient vitals captured via remote photoplethysmography (rPPG). No advanced imaging data (MRI/CT) was provided during this triage session. Proceed with physical evaluation."}
                     </p>
                   </div>
                </div>

                {actionMessage && (
                   <div className="bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 text-sm font-bold p-3 rounded-xl text-center animate-in slide-in-from-bottom-2">
                     {actionMessage}
                   </div>
                )}

             </div>

             <div className="p-6 border-t border-slate-800 bg-slate-950/50 flex flex-wrap justify-between items-center gap-4">
                <div className="flex gap-3">
                   <button onClick={() => handleQuickAction('🚑 Ambulance Dispatched! ETA: 8 mins.')} className="px-4 py-2.5 rounded-xl text-xs font-black text-slate-900 bg-sky-400 hover:bg-sky-300 transition-colors uppercase tracking-widest flex items-center gap-2">
                      Dispatch Ambulance
                   </button>
                   <button onClick={() => handleQuickAction('📟 Page sent to On-Call ICU Team.')} className="px-4 py-2.5 rounded-xl text-xs font-black text-white bg-slate-800 hover:bg-slate-700 transition-colors uppercase tracking-widest border border-slate-700 flex items-center gap-2">
                      Page ICU Team
                   </button>
                </div>

                <div className="flex gap-3">
                   <button onClick={() => setSelectedPatient(null)} className="px-6 py-2.5 rounded-xl font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                      Close
                   </button>
                   <button onClick={() => { handleAutoAllocate(); setSelectedPatient(null); }} className="px-6 py-2.5 rounded-xl font-black text-slate-900 bg-emerald-500 hover:bg-emerald-400 transition-colors shadow-lg uppercase tracking-wider">
                      Admit Patient
                   </button>
                </div>
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