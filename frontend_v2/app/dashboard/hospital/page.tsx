'use client';

import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { getAuth, signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';

const auth = getAuth(db.app);

export default function HospitalDashboard() {
  const router = useRouter();
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // CCTV Crowd Analytics (This will connect to our YOLOv8 script later)
  const [crowdCount, setCrowdCount] = useState(12);

  useEffect(() => {
    // 1. Security Check
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) router.push('/login');
    });

    // 2. Listen to Live Triage Queue from Firebase
    const q = query(collection(db, 'scans'), orderBy('timestamp', 'desc'), limit(50));
    
    const unsubscribeDb = onSnapshot(q, (snapshot) => {
      const patientList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPatients(patientList);
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeDb();
    };
  }, [router]);

  // Calculate live stats
  const criticalCount = patients.filter(p => p.priority === 1 || p.priority === 2).length;
  const averageBpm = patients.length > 0 
    ? Math.round(patients.reduce((acc, p) => acc + (parseInt(p.bpm) || 0), 0) / patients.length) 
    : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30">
      
      {/* Top Navbar */}
      <header className="bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center font-black text-slate-900 text-xl shadow-[0_0_15px_rgba(16,185,129,0.5)]">
            🏥
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wide">NIDAN-LIVE <span className="text-emerald-400">COMMAND</span></h1>
            <p className="text-xs text-slate-400 font-mono">Central Triage & Fleet Management</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 bg-slate-950 px-4 py-2 rounded-lg border border-slate-800">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Live Sync Active</span>
          </div>
          <button onClick={() => { signOut(auth); router.push('/'); }} className="text-sm font-bold text-slate-400 hover:text-red-400 transition-colors">
            Sign Out
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: Stats & CCTV */}
        <div className="space-y-6 flex flex-col">
          
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Waiting</p>
              <p className="text-4xl font-black text-white">{patients.length}</p>
            </div>
            <div className="bg-slate-900 border border-red-900/50 p-5 rounded-2xl shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/10 blur-xl rounded-full"></div>
              <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1">Critical (P1/P2)</p>
              <p className="text-4xl font-black text-red-400">{criticalCount}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Avg Wait Time</p>
              <p className="text-3xl font-black text-emerald-400">14<span className="text-lg">m</span></p>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Avg Fleet BPM</p>
              <p className="text-3xl font-black text-sky-400">{averageBpm}</p>
            </div>
          </div>

          {/* YOLOv8 CCTV Edge Analytics Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg flex-1 min-h-[300px] flex flex-col">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
              <h3 className="font-bold text-white flex items-center gap-2">
                <span>📷</span> CCTV Edge Analytics
              </h3>
              <span className="text-xs font-bold bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded">YOLOv8 Active</span>
            </div>
            <div className="p-4 flex-1 flex flex-col items-center justify-center relative">
              {/* Fake CCTV feed for demo */}
              <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=80&w=2053&auto=format&fit=crop')] bg-cover bg-center opacity-20 grayscale sepia mix-blend-overlay"></div>
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent"></div>
              
              <div className="relative z-10 text-center">
                <p className="text-6xl font-black text-white mb-2 tracking-tighter">{crowdCount}</p>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Detected in Waiting Room</p>
              </div>

              {/* Bounding Box decorations */}
              <div className="absolute top-10 left-10 w-16 h-24 border-2 border-emerald-500/50 rounded z-10"></div>
              <div className="absolute bottom-20 right-20 w-12 h-20 border-2 border-emerald-500/50 rounded z-10"></div>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: The Live Triage Queue */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg flex flex-col overflow-hidden h-[800px]">
          <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
            <div>
              <h2 className="text-xl font-black text-white">Live Autonomous Triage Queue</h2>
              <p className="text-xs text-slate-400 mt-1">Patients ranked by rPPG vitals & AI symptom severity</p>
            </div>
            <button className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 text-sm font-bold py-2 px-4 rounded-lg transition-colors shadow-[0_0_15px_rgba(16,185,129,0.3)]">
              Auto-Allocate Rooms
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-0">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full"></div>
              </div>
            ) : patients.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <span className="text-4xl mb-3">☕</span>
                <p>No patients in queue. The ER is clear.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-950/80 text-xs uppercase text-slate-500 sticky top-0 z-10 backdrop-blur-md">
                  <tr>
                    <th className="p-4 font-bold tracking-wider">Patient</th>
                    <th className="p-4 font-bold tracking-wider">Vitals (rPPG)</th>
                    <th className="p-4 font-bold tracking-wider">Stress Index</th>
                    <th className="p-4 font-bold tracking-wider text-center">Priority</th>
                    <th className="p-4 font-bold tracking-wider text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {patients.map((patient) => (
                    <tr key={patient.id} className="hover:bg-slate-800/30 transition-colors group">
                      <td className="p-4">
                        <p className="font-bold text-white text-sm">{patient.patientName || 'Unknown'}</p>
                        <p className="text-xs text-slate-500">{patient.patientId}</p>
                        <p className="text-[10px] text-slate-600 mt-1">{patient.timeString}</p>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="text-center">
                            <p className={`text-lg font-black ${parseInt(patient.bpm) > 100 ? 'text-red-400' : 'text-emerald-400'}`}>{patient.bpm}</p>
                            <p className="text-[9px] uppercase tracking-widest text-slate-500">BPM</p>
                          </div>
                          <div className="w-px h-8 bg-slate-800"></div>
                          <div className="text-center">
                            <p className={`text-lg font-black ${parseInt(patient.rr) > 22 ? 'text-orange-400' : 'text-sky-400'}`}>{patient.rr}</p>
                            <p className="text-[9px] uppercase tracking-widest text-slate-500">Resp</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          patient.stress?.includes('High') ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
                          patient.stress?.includes('Low') ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 
                          'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}>
                          {patient.stress || 'Normal'}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-black text-sm ${
                          patient.priority === 1 ? 'bg-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.5)]' :
                          patient.priority === 2 ? 'bg-orange-500 text-white' :
                          patient.priority === 3 ? 'bg-amber-400 text-slate-900' :
                          'bg-slate-700 text-slate-300'
                        }`}>
                          P{patient.priority || 5}
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <button className="text-xs font-bold text-sky-400 hover:text-white bg-slate-800 hover:bg-sky-500 transition-colors px-3 py-2 rounded-lg border border-slate-700">
                          Review AI Report
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
    </div>
  );
}