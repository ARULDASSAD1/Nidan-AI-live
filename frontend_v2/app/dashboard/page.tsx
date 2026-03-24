'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// FIX: Using the @ alias prevents Turbopack from getting lost in relative folders
const MapWithNoSSR = dynamic(() => import('@/components/LeafletMap'), { 
  ssr: false,
  loading: () => <div className="p-4 text-emerald-400">Initializing Secure Map...</div> 
});

export default function CommandDashboard() {
  const [scans, setScans] = useState<any[]>([]);
  const [time, setTime] = useState<string>('');

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    
    const fetchScans = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/dashboard_data');
        const data = await res.json();
        setScans(data.recent_scans);
      } catch (err) {
        console.error("Dashboard offline");
      }
    };

    fetchScans();
    const poller = setInterval(fetchScans, 3000);

    return () => { clearInterval(timer); clearInterval(poller); };
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      <div className="flex justify-between items-center border-b border-slate-700 pb-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-sky-400">Central Triage Command</h1>
          <p className="text-slate-400">Live rPPG Telemetry Feed & Geospatial Routing</p>
        </div>
        <div className="text-2xl font-mono text-emerald-400">{time}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-slate-800 rounded-xl overflow-hidden border border-slate-700 h-[500px]">
          <MapWithNoSSR scans={scans} />
        </div>

        <div className="lg:col-span-2 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-950 text-slate-400 text-sm uppercase">
              <tr>
                <th className="p-4">ID</th>
                <th className="p-4">Time</th>
                <th className="p-4">Vitals</th>
                <th className="p-4">Facility Routing</th>
                <th className="p-4">Priority</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {scans.length === 0 ? (
                <tr><td colSpan={5} className="p-4 text-center text-slate-500">Awaiting incoming scans...</td></tr>
              ) : scans.map((scan, i) => (
                <tr key={i} className="hover:bg-slate-700 transition-colors">
                  <td className="p-4 font-bold text-sky-300">{scan.id}</td>
                  <td className="p-4 text-slate-400">{scan.timestamp}</td>
                  <td className="p-4">
                    <span className="text-emerald-400">{scan.bpm} BPM</span><br/>
                    <span className={scan.spo2 < 95 ? "text-red-400" : "text-sky-400"}>{scan.spo2}% SpO2</span>
                  </td>
                  <td className="p-4">{scan.routed_to}</td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      scan.priority <= 2 ? 'bg-red-900 text-red-200' : 'bg-emerald-900 text-emerald-200'
                    }`}>
                      Level {scan.priority}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}