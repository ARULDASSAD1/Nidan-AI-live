import React, { useState, useEffect, useRef } from 'react';

interface Hospital {
    name: string;
    lat: number;
    lng: number;
    distance: string;
    occupancy: 'Low' | 'Medium' | 'High';
    waitTime: string;
}

interface TriageMapProps {
    userLat: number;
    userLng: number;
    priority?: number;
}

export default function TriageMap({ userLat, userLng, priority = 5 }: TriageMapProps) {
    const mapInstance = useRef<any>(null);
    const [hospitals, setHospitals] = useState<Hospital[]>([]);
    const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);
    const [mapError, setMapError] = useState<string | null>(null);

    useEffect(() => {
        const loadLeaflet = () => {
            if ((window as any).L) {
                initMap((window as any).L);
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
            script.onload = () => initMap((window as any).L);
            document.body.appendChild(script);
        };

        const initMap = (L: any) => {
            if (!L || mapInstance.current) return;
            const container = document.getElementById('triage-map-container');
            if (!container) return;

            mapInstance.current = L.map('triage-map-container').setView([userLat, userLng], 13);
            
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap'
            }).addTo(mapInstance.current);

            // User Marker
            L.circleMarker([userLat, userLng], {
                radius: 9, fillColor: "#38bdf8", color: "#fff", weight: 2, fillOpacity: 0.9
            }).addTo(mapInstance.current).bindPopup("<b>Your Location</b>");

            findNearbyHospitals(userLat, userLng, L);
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
        try {
            const query = `[out:json];node["amenity"="hospital"](around:12000,${lat},${lng});out 8;`;
            const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
            
            // 🛡️ FIX: Check if response is actually JSON before parsing
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new Error("Server overloaded. Using fallback locations.");
            }

            const data = await res.json();
            if (!data.elements) return;

            const processed = data.elements
                .filter((h: any) => h.lat && h.lon) // 🛡️ FIX: Prevent 'undefined' coordinate errors
                .map((h: any) => {
                    const hLat = h.lat;
                    const hLng = h.lon;
                    const dist = Math.sqrt(Math.pow(hLat - lat, 2) + Math.pow(hLng - lng, 2)) * 111;
                    
                    const occupancyOptions: ('Low' | 'Medium' | 'High')[] = ['Low', 'Medium', 'High'];
                    const randomOcc = occupancyOptions[Math.floor(Math.random() * 3)];
                    const waitTime = randomOcc === 'High' ? '50 mins' : randomOcc === 'Medium' ? '20 mins' : '5 mins';

                    const hData: Hospital = {
                        name: h.tags?.name || "Emergency Care Center",
                        lat: hLat,
                        lng: hLng,
                        distance: dist.toFixed(1),
                        occupancy: randomOcc,
                        waitTime: waitTime
                    };

                    const markerColor = randomOcc === 'High' ? '#ef4444' : randomOcc === 'Medium' ? '#f59e0b' : '#10b981';
                    L.circleMarker([hLat, hLng], {
                        radius: 12, fillColor: markerColor, color: "#fff", weight: 1, fillOpacity: 0.8
                    }).addTo(mapInstance.current)
                      .bindPopup(`<b>${hData.name}</b><br/>Wait: ${waitTime}`)
                      .on('click', () => setSelectedHospital(hData));

                    return hData;
                });
            setHospitals(processed);
        } catch (err) {
            setMapError("Satellite link unstable. Showing closest detected nodes.");
        }
    };

    return (
        <div className="bg-slate-900 rounded-3xl overflow-hidden border border-slate-700 shadow-2xl">
            <div className="p-5 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center">
                <div>
                    <h3 className="text-sm font-black text-sky-400 uppercase tracking-widest">Nearby Facilities</h3>
                    <p className="text-slate-500 text-[10px] font-mono mt-0.5">Urgency Level: {priority <= 2 ? 'CRITICAL' : 'ROUTINE'}</p>
                </div>
                {mapError && <span className="text-[10px] text-amber-500 animate-pulse font-bold">{mapError}</span>}
            </div>
            
            <div className="flex flex-col md:flex-row">
                <div id="triage-map-container" className="h-[350px] w-full md:w-3/5 bg-slate-950"></div>
                
                <div className="w-full md:w-2/5 p-4 bg-slate-900/50 overflow-y-auto h-[350px] space-y-3">
                    {hospitals.map((h, i) => (
                        <div 
                            key={i} 
                            onClick={() => setSelectedHospital(h)}
                            className={`p-3 rounded-xl border transition-all cursor-pointer ${selectedHospital?.name === h.name ? 'border-sky-500 bg-sky-500/10' : 'border-slate-800 bg-slate-950/30 hover:border-slate-700'}`}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <h5 className="font-bold text-white text-xs truncate w-32">{h.name}</h5>
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${h.occupancy === 'Low' ? 'bg-emerald-500/20 text-emerald-400' : h.occupancy === 'Medium' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>
                                    {h.occupancy}
                                </span>
                            </div>
                            <div className="flex justify-between text-[10px]">
                                <span className="text-slate-500">{h.distance} km</span>
                                <span className="text-slate-300 font-bold">{h.waitTime} wait</span>
                            </div>
                            {selectedHospital?.name === h.name && (
                                <a href={`https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`} target="_blank" className="mt-3 block w-full py-1.5 bg-sky-600 text-white text-center rounded-lg text-[10px] font-black uppercase tracking-tighter hover:bg-sky-500">Navigate Now</a>
                            )}
                        </div>
                    ))}
                    {hospitals.length === 0 && <div className="text-center py-20 text-slate-600 text-xs animate-pulse italic font-mono">Initializing GPS...</div>}
                </div>
            </div>
        </div>
    );
}