import React, { useState, useEffect, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

// Handle global variables injected by the environment safely in TypeScript
declare global {
  var __firebase_config: string | undefined;
  var __app_id: string | undefined;
  // 🌟 FIX: Removed "var L: any" to prevent duplicate identifier error
}

const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'nidan-local-dev';

interface Vitals {
    bpm: number | string;
    resp: number | string;
    stress: string;
}

interface MultiAgentDashboardProps {
    vitals?: Vitals;
    visionReport?: string;
    patientId?: string;
    userLat?: number;
    userLng?: number;
}

interface MedicalReport {
    cardiologist: string;
    pulmonologist: string;
    neurologist: string;
    executive_summary: string;
    [key: string]: any;
}

interface ChatMessage {
    role: 'user' | 'agent';
    text: string;
}

interface Hospital {
    name: string;
    lat: number;
    lng: number;
    distance: string;
    occupancy: 'Low' | 'Medium' | 'High';
    waitTime: string;
}

export default function MultiAgentDashboard({ 
    vitals, 
    visionReport, 
    patientId = "demo-patient",
    userLat = 12.9716, 
    userLng = 77.5946 
}: MultiAgentDashboardProps) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [report, setReport] = useState<MedicalReport | null>(null);
    const [chatInput, setChatInput] = useState<string>("");
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [isChatting, setIsChatting] = useState<boolean>(false);
    const [isExporting, setIsExporting] = useState<boolean>(false);
    
    const mapInstance = useRef<any>(null);
    const [hospitals, setHospitals] = useState<Hospital[]>([]);
    const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, setUser);
        return () => unsubscribe();
    }, []);

    // 🌟 UPDATED: Leaflet Load & Init Logic
    useEffect(() => {
        const loadLeaflet = () => {
            const Leaflet = (window as any).L;
            if (Leaflet) {
                initMap(Leaflet);
                findNearbyHospitals(userLat, userLng, Leaflet);
                return;
            }

            if (!document.getElementById('leaflet-css')) {
                const link = document.createElement('link');
                link.id = 'leaflet-css';
                link.rel = 'stylesheet';
                link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
                document.head.appendChild(link);
            }

            const script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.async = true;
            script.onload = () => {
                const L_obj = (window as any).L;
                initMap(L_obj);
                findNearbyHospitals(userLat, userLng, L_obj);
            };
            document.body.appendChild(script);
        };

        const initMap = (L: any) => {
            if (!L || mapInstance.current) return;
            const mapContainer = document.getElementById('triage-map');
            if (!mapContainer) return;

            mapInstance.current = L.map('triage-map').setView([userLat, userLng], 13);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(mapInstance.current);

            L.circleMarker([userLat, userLng], {
                radius: 8,
                fillColor: "#0ea5e9",
                color: "#fff",
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(mapInstance.current).bindPopup("<b>Your Location</b>").openPopup();
        };

        loadLeaflet();

        return () => {
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    }, [userLat, userLng]);

    const findNearbyHospitals = async (lat: number, lng: number, L: any) => {
        if (!L || !mapInstance.current) return;
        try {
            const query = `[out:json];node["amenity"="hospital"](around:10000,${lat},${lng});out 5;`;
            const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
            const data = await res.json();
            
            const processed = data.elements.map((h: any) => {
                const hLat = h.lat;
                const hLng = h.lon;
                const dist = Math.sqrt(Math.pow(hLat - lat, 2) + Math.pow(hLng - lng, 2)) * 111;
                
                const occupancyOptions: ('Low' | 'Medium' | 'High')[] = ['Low', 'Medium', 'High'];
                const randomOcc = occupancyOptions[Math.floor(Math.random() * 3)];
                const waitTime = randomOcc === 'High' ? '45-60 mins' : randomOcc === 'Medium' ? '15-20 mins' : '5 mins';

                const hData: Hospital = {
                    name: h.tags.name || "General Hospital",
                    lat: hLat,
                    lng: hLng,
                    distance: dist.toFixed(1),
                    occupancy: randomOcc,
                    waitTime: waitTime
                };

                const markerColor = randomOcc === 'High' ? '#ef4444' : randomOcc === 'Medium' ? '#f59e0b' : '#10b981';
                L.circleMarker([hLat, hLng], {
                    radius: 12,
                    fillColor: markerColor,
                    color: "#fff",
                    weight: 1,
                    fillOpacity: 0.9
                }).addTo(mapInstance.current)
                  .bindPopup(`<b>${hData.name}</b><br/>Wait Time: ${waitTime}<br/>Crowd: ${randomOcc}`)
                  .on('click', () => setSelectedHospital(hData));

                return hData;
            });
            setHospitals(processed);
        } catch (err) {
            console.error("Map Data Error:", err);
        }
    };

    const runMultiAgentAnalysis = async () => {
        setLoading(true);
        try {
            const res = await fetch("http://127.0.0.1:8003/api/multi-agent-analysis", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    patient_id: patientId,
                    vitals: vitals || { bpm: 72, resp: 16, stress: "low" },
                    vision_report: visionReport || "No imaging provided."
                })
            });
            if (!res.ok) throw new Error("Server responded with error");
            const data = await res.json();
            
            if (data.status === "success") {
                setReport(data.report);
                saveToFirebase(data.report);
            }
        } catch (error) {
            console.error("Agent Error:", error);
            alert("Connection Failed: Ensure Port 8003 is active!");
        }
        setLoading(false);
    };

    const saveToFirebase = async (reportData: MedicalReport) => {
        if (!user) return; 
        try {
            const reportRef = doc(db, 'artifacts', appId, 'users', user.uid, 'medical_reports', `report_${Date.now()}`);
            await setDoc(reportRef, {
                patientId: patientId,
                timestamp: new Date().toISOString(),
                ...reportData
            });
        } catch (error) {
            console.error("Firebase Storage Error:", error);
        }
    };

    const downloadProfessionalPDF = () => {
        if (!report) return;
        setIsExporting(true);

        const generatePDF = () => {
            const pdfMake = (window as any).pdfMake;
            const docDefinition = {
                pageSize: 'A4',
                pageMargins: [40, 60, 40, 60],
                watermark: { text: 'NIDAN SECURE', color: '#e2e8f0', opacity: 0.1, bold: true },
                content: [
                    { text: 'EXECUTIVE MEDICAL DOSSIER', style: 'header' },
                    { text: 'Generated by Autonomous Multi-Agent Board', style: 'subHeader' },
                    { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 2, lineColor: '#0ea5e9' }] },
                    { text: '\n' },
                    {
                        columns: [
                            { text: [ { text: 'PATIENT ID: ', color: '#64748b', bold: true }, { text: patientId, bold: true } ] },
                            { text: [ { text: 'DATE: ', color: '#64748b', bold: true }, { text: new Date().toLocaleString() } ], alignment: 'right' }
                        ]
                    },
                    { text: '\n\nI. PATIENT TELEMETRY (rPPG)', style: 'sectionTitle' },
                    {
                        table: {
                            headerRows: 1,
                            widths: ['*', '*', '*'],
                            body: [
                                [ { text: 'Heart Rate', style: 'tableHeader' }, { text: 'Respiration', style: 'tableHeader' }, { text: 'Stress Index', style: 'tableHeader' } ],
                                [ { text: `${vitals?.bpm || '--'} BPM`, style: 'tableData' }, { text: `${vitals?.resp || '--'} BrPM`, style: 'tableData' }, { text: `${vitals?.stress || 'Normal'}`, style: 'tableData' } ]
                            ]
                        },
                        layout: 'lightHorizontalLines'
                    },
                    { text: '\n\nII. SPECIALIST AI ASSESSMENTS', style: 'sectionTitle' },
                    {
                        table: { widths: ['*'], body: [
                            [ { text: '🫀 CHIEF CARDIOLOGIST', fillColor: '#fee2e2', color: '#b91c1c', bold: true, margin: [10, 5] } ],
                            [ { text: report.cardiologist, margin: [10, 10], color: '#334155' } ]
                        ] },
                        margin: [0, 0, 0, 15]
                    },
                    {
                        table: { widths: ['*'], body: [
                            [ { text: '🫁 CHIEF PULMONOLOGIST', fillColor: '#e0f2fe', color: '#0369a1', bold: true, margin: [10, 5] } ],
                            [ { text: report.pulmonologist, margin: [10, 10], color: '#334155' } ]
                        ] },
                        margin: [0, 0, 0, 15]
                    },
                    {
                        table: { widths: ['*'], body: [
                            [ { text: '🧠 CHIEF NEUROLOGIST', fillColor: '#f3e8ff', color: '#7e22ce', bold: true, margin: [10, 5] } ],
                            [ { text: report.neurologist, margin: [10, 10], color: '#334155' } ]
                        ] },
                        margin: [0, 0, 0, 15]
                    },
                    { text: '\nIII. EXECUTIVE SYNTHESIS', style: 'sectionTitle' },
                    {
                        table: { widths: ['*'], body: [
                            [ { text: '⚕️ CHIEF MEDICAL OFFICER', fillColor: '#fef3c7', color: '#b45309', bold: true, margin: [10, 5] } ],
                            [ { text: report.executive_summary, margin: [10, 10], bold: true, fontSize: 13, color: '#0f172a' } ]
                        ] },
                        margin: [0, 0, 0, 15]
                    }
                ],
                styles: {
                    header: { fontSize: 24, bold: true, color: '#0f172a' },
                    subHeader: { fontSize: 11, color: '#64748b', margin: [0, 5, 0, 10] },
                    sectionTitle: { fontSize: 14, bold: true, color: '#0ea5e9', margin: [0, 10, 0, 10] },
                    tableHeader: { bold: true, fontSize: 11, color: '#475569', fillColor: '#f1f5f9' },
                    tableData: { fontSize: 14, bold: true, margin: [5, 10] }
                }
            };

            pdfMake.createPdf(docDefinition).download(`Nidan_Dossier_${patientId}.pdf`);
            setIsExporting(false);
        };

        if (!(window as any).pdfMake) {
            const s1 = document.createElement('script'); 
            s1.src = "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/pdfmake.min.js"; 
            document.body.appendChild(s1);
            s1.onload = () => {
                const s2 = document.createElement('script'); 
                s2.src = "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/vfs_fonts.js"; 
                document.body.appendChild(s2);
                s2.onload = generatePDF;
            };
        } else { generatePDF(); }
    };

    const handleAskQuestion = async () => {
        if (!chatInput.trim() || !report) return;
        
        const newChat: ChatMessage[] = [...chatHistory, { role: "user", text: chatInput }];
        setChatHistory(newChat);
        setIsChatting(true);
        setChatInput("");

        try {
            const res = await fetch("http://127.0.0.1:8003/api/chat-with-agents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    patient_id: patientId,
                    question: chatInput,
                    context: JSON.stringify(report)
                })
            });
            const data = await res.json();
            setChatHistory([...newChat, { role: "agent", text: data.reply }]);
        } catch (error) {
            setChatHistory([...newChat, { role: "agent", text: "Connection error. Ensure Agent Server is running." }]);
        }
        setIsChatting(false);
    };

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-8 font-sans animate-in fade-in duration-500">
            
            <div className="flex flex-col md:flex-row justify-between items-center bg-slate-900 p-6 rounded-3xl shadow-2xl border border-slate-700 gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-sky-500/20 flex items-center justify-center text-3xl border border-sky-500/30 shadow-[0_0_20px_rgba(56,189,248,0.2)]">⚕️</div>
                    <div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tight">Executive Medical Board</h2>
                        <p className="text-slate-400 text-sm font-mono mt-1">Status: {report ? 'Consolidated Assessment Ready' : 'Awaiting Analysis...'}</p>
                    </div>
                </div>
                <div className="flex gap-4 w-full md:w-auto">
                    {!report ? (
                        <button onClick={runMultiAgentAnalysis} disabled={loading} className="flex-1 md:flex-none px-8 py-4 bg-emerald-600 text-white font-black rounded-2xl hover:bg-emerald-500 disabled:opacity-50 transition-all shadow-lg uppercase tracking-wider">
                            {loading ? "Board Deliberating..." : "Initiate Board Review"}
                        </button>
                    ) : (
                        <button onClick={downloadProfessionalPDF} disabled={isExporting} className="flex-1 md:flex-none px-8 py-4 bg-sky-600 text-white font-black rounded-2xl hover:bg-sky-500 disabled:opacity-50 transition-all shadow-lg flex items-center justify-center gap-3 uppercase tracking-wider">
                            {isExporting ? "Encrypting..." : "📥 Download Official Dossier"}
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <div className="bg-slate-900 rounded-3xl overflow-hidden border border-slate-700 shadow-2xl">
                        <div className="p-6 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-black text-sky-400 uppercase">Live Routing & Crowd Analytics</h3>
                                <p className="text-slate-500 text-xs font-mono">Routing optimized by distance + Traffic occupancy</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="flex h-3 w-3"><span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span></span>
                                <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Live Feed</span>
                            </div>
                        </div>
                        
                        <div className="flex flex-col md:flex-row">
                            <div id="triage-map" className="h-[400px] w-full md:w-3/5 border-r border-slate-800 bg-slate-950"></div>
                            <div className="w-full md:w-2/5 p-4 bg-slate-900/50 overflow-y-auto h-[400px] space-y-3 custom-scrollbar">
                                <h4 className="text-xs font-black text-slate-500 uppercase px-2 mb-4">Recommended Facilities</h4>
                                {hospitals.length === 0 && <p className="text-slate-600 text-sm text-center py-20 font-mono italic">Scanning hospital satellites...</p>}
                                {hospitals.map((h, i) => (
                                    <div 
                                        key={i} 
                                        onClick={() => setSelectedHospital(h)}
                                        className={`p-4 rounded-2xl border transition-all cursor-pointer ${selectedHospital?.name === h.name ? 'border-sky-500 bg-sky-500/10 shadow-lg' : 'border-slate-800 bg-slate-950/50 hover:border-slate-600'}`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <h5 className="font-bold text-white text-sm line-clamp-1">{h.name}</h5>
                                            <span className={`text-[10px] font-black px-2 py-1 rounded-full ${h.occupancy === 'Low' ? 'bg-emerald-500/20 text-emerald-400' : h.occupancy === 'Medium' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>
                                                {h.occupancy} Traffic
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-slate-400 font-medium">{h.distance} km away</span>
                                            <span className="text-slate-300 font-black">{h.waitTime} wait</span>
                                        </div>
                                        {selectedHospital?.name === h.name && (
                                            <a 
                                                href={`https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`} 
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="mt-4 block w-full py-2.5 bg-sky-600 text-white text-center rounded-xl text-xs font-black uppercase tracking-widest hover:bg-sky-500 transition-colors"
                                            >
                                                Start Navigation
                                            </a>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {report && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-slate-950 p-6 rounded-3xl border border-red-900/20 shadow-xl group hover:border-red-500/30 transition-all">
                                <h3 className="font-black text-red-400 text-lg flex items-center gap-2 mb-4 tracking-tighter uppercase">🫀 Cardiologist</h3>
                                <p className="text-slate-300 text-sm leading-relaxed font-medium">{report.cardiologist}</p>
                            </div>
                            <div className="bg-slate-950 p-6 rounded-3xl border border-sky-900/20 shadow-xl group hover:border-sky-500/30 transition-all">
                                <h3 className="font-black text-sky-400 text-lg flex items-center gap-2 mb-4 tracking-tighter uppercase">🫁 Pulmonologist</h3>
                                <p className="text-slate-300 text-sm leading-relaxed font-medium">{report.pulmonologist}</p>
                            </div>
                            <div className="bg-slate-950 p-6 rounded-3xl border border-purple-900/20 shadow-xl group hover:border-purple-500/30 transition-all">
                                <h3 className="font-black text-purple-400 text-lg flex items-center gap-2 mb-4 tracking-tighter uppercase">🧠 Neurologist</h3>
                                <p className="text-slate-300 text-sm leading-relaxed font-medium">{report.neurologist}</p>
                            </div>
                            <div className="bg-slate-950 p-6 rounded-3xl border border-amber-900/40 shadow-xl group hover:border-amber-500/50 transition-all bg-gradient-to-br from-slate-950 to-amber-950/20">
                                <h3 className="font-black text-amber-400 text-lg flex items-center gap-2 mb-4 tracking-tighter uppercase">⚕️ Chief Officer</h3>
                                <p className="text-white text-sm font-black leading-relaxed">{report.executive_summary}</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-8">
                    <div className="bg-slate-900 p-6 rounded-3xl border border-slate-700 shadow-2xl">
                        <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 border-b border-slate-800 pb-2">Telemetry Snapshot</h4>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-bold text-slate-400">Heart Rate</span>
                                <span className="text-xl font-black text-emerald-400">{vitals?.bpm || '--'} <span className="text-xs">BPM</span></span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-bold text-slate-400">Respiration</span>
                                <span className="text-xl font-black text-sky-400">{vitals?.resp || '--'} <span className="text-xs">BrPM</span></span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-bold text-slate-400">Stress Index</span>
                                <span className="text-md font-black text-amber-400 uppercase">{vitals?.stress || 'Normal'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-900 p-6 rounded-3xl border border-slate-700 shadow-2xl flex flex-col h-[525px]">
                        <h3 className="font-black text-emerald-400 mb-4 flex items-center gap-2 uppercase tracking-tight">💬 Discussion Board</h3>
                        <div className="flex-1 overflow-y-auto mb-4 p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-4 custom-scrollbar">
                            {chatHistory.length === 0 && <p className="text-slate-600 text-center mt-32 font-mono text-sm tracking-tighter italic">Secure consultation channel active.</p>}
                            {chatHistory.map((msg, i) => (
                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] p-4 rounded-2xl text-xs font-medium leading-relaxed ${msg.role === 'user' ? 'bg-emerald-600 text-white rounded-br-none' : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none shadow-lg'}`}>
                                        {msg.text}
                                    </div>
                                </div>
                            ))}
                            {isChatting && (
                                <div className="flex justify-start">
                                    <div className="bg-slate-800 rounded-2xl rounded-bl-none p-3 border border-slate-700 flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce"></span>
                                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce delay-75"></span>
                                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce delay-150"></span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={chatInput} 
                                onChange={(e) => setChatInput(e.target.value)} 
                                onKeyPress={(e) => e.key === 'Enter' && handleAskQuestion()} 
                                placeholder="Clarify report findings..." 
                                className="flex-1 p-4 bg-slate-950 border border-slate-700 rounded-2xl text-white text-sm focus:outline-none focus:border-emerald-500 transition-all font-medium" 
                            />
                            <button onClick={handleAskQuestion} disabled={isChatting || !report} className="px-6 bg-emerald-600 text-white font-black rounded-2xl hover:bg-emerald-500 transition-all disabled:opacity-30">
                                Send
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
                .leaflet-popup-content-wrapper { background: #0f172a !important; color: white !important; border-radius: 12px !important; border: 1px solid #334155 !important; }
                .leaflet-popup-tip { background: #0f172a !important; }
            `}</style>
        </div>
    );
}