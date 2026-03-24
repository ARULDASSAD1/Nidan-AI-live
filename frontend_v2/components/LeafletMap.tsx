'use client';

import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo, useState } from 'react';

// --- PATIENT PINS ---
const createPatientIcon = (priority: number) => {
  let colorClass = 'bg-emerald-500 shadow-[0_0_15px_#10b981]'; 
  if (priority === 1) colorClass = 'bg-red-500 shadow-[0_0_15px_#ef4444] animate-[ping_1.5s_infinite]'; 
  else if (priority === 2) colorClass = 'bg-amber-500 shadow-[0_0_15px_#f59e0b] animate-pulse';

  return L.divIcon({
    className: 'bg-transparent border-none', 
    html: `<div class="relative w-4 h-4"><div class="absolute inset-0 rounded-full ${colorClass} opacity-75"></div><div class="absolute inset-1 rounded-full bg-white"></div></div>`,
    iconSize: [16, 16], iconAnchor: [8, 8]
  });
};

// --- HOSPITAL PINS ---
const hospitalIcon = L.divIcon({
  className: 'bg-transparent border-none',
  html: `<div class="w-8 h-8 bg-sky-900 border-2 border-sky-400 rounded flex items-center justify-center shadow-[0_0_15px_#38bdf8]"><span class="text-sky-400 font-bold text-lg leading-none">+</span></div>`,
  iconSize: [32, 32], iconAnchor: [16, 16]
});

// 🌟 NEW: REAL ROAD ROUTING COMPONENT
function RealRouteLine({ start, end, color }: { start: [number, number], end: [number, number], color: string }) {
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null);

  useEffect(() => {
    const fetchRoute = async () => {
      // The API Key from your uploaded script
      const apiKey = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImU0N2E2NTJlZTFlZDQwMmViYWEyMmEyMzFlYzIxYThiIiwiaCI6Im11cm11cjY0In0="; 
      
      try {
        // OpenRouteService requires coordinates in [Longitude, Latitude] format
        const response = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
          method: "POST",
          headers: {
            "Authorization": apiKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            coordinates: [
              [start[1], start[0]], // User Lon, Lat
              [end[1], end[0]]      // Hosp Lon, Lat
            ]
          })
        });

        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
          // Extract road coordinates and flip them back to Leaflet's [Lat, Lon] format
          const roads = data.features[0].geometry.coordinates.map((c: any) => [c[1], c[0]]);
          setRouteCoords(roads);
        } else {
          setRouteCoords([start, end]); // Fallback to straight line if API is confused
        }
      } catch (error) {
        console.error("Routing API failed, falling back to tactical line.", error);
        setRouteCoords([start, end]); // Fallback to straight line on network error
      }
    };

    fetchRoute();
  }, [start, end]);

  // If loading, draw a dashed line. If loaded, draw a solid thick road line.
  return (
    <Polyline 
      positions={routeCoords || [start, end]} 
      pathOptions={{ 
        color: color, 
        weight: routeCoords && routeCoords.length > 2 ? 4 : 2, 
        dashArray: routeCoords && routeCoords.length > 2 ? undefined : '5, 10', 
        opacity: 0.8 
      }} 
    />
  );
}

// --- AUTO-FRAMING CAMERA ---
function MapCameraController({ scans }: { scans: any[] }) {
  const map = useMap();
  
  useEffect(() => {
    const validScan = scans.find(s => 
      typeof s.lat === 'number' && typeof s.lng === 'number' && 
      typeof s.hospitalLat === 'number' && typeof s.hospitalLng === 'number'
    );
    
    if (validScan) {
      try {
        const hLat = validScan.lat === validScan.hospitalLat ? validScan.hospitalLat + 0.005 : validScan.hospitalLat;
        const hLng = validScan.lng === validScan.hospitalLng ? validScan.hospitalLng + 0.005 : validScan.hospitalLng;

        const bounds = L.latLngBounds([validScan.lat, validScan.lng], [hLat, hLng]);
        map.flyToBounds(bounds, { padding: [60, 60], animate: true, duration: 1.5 });
      } catch (error) {}
    }
  }, [scans, map]);
  
  return null;
}

// --- MAIN MAP COMPONENT ---
export default function LeafletMap({ scans }: { scans: any[] }) {
  const fallbackCenter: [number, number] = [11.6643, 78.1460]; 

  const activeHospitals = useMemo(() => {
    const map = new Map();
    scans.forEach(scan => {
      if (typeof scan.hospitalLat === 'number' && typeof scan.hospitalLng === 'number' && scan.routedTo) {
        map.set(scan.routedTo, [scan.hospitalLat, scan.hospitalLng]);
      }
    });
    return Array.from(map.entries());
  }, [scans]);

  return (
    <div className="relative w-full h-full bg-slate-900 rounded-xl overflow-hidden">
      
      {/* Legend */}
      <div className="absolute bottom-6 right-6 z-[1000] bg-slate-950/80 backdrop-blur-md border border-slate-700 p-4 rounded-xl shadow-2xl pointer-events-none">
        <h4 className="text-slate-300 text-xs font-bold uppercase tracking-widest mb-3 border-b border-slate-700 pb-2">Live Triage Status</h4>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3"><div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_10px_#ef4444] animate-pulse"></div><span className="text-slate-200 font-medium">Level 1 (Emergency)</span></div>
          <div className="flex items-center gap-3"><div className="w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_10px_#f59e0b]"></div><span className="text-slate-200 font-medium">Level 2 (Urgent)</span></div>
          <div className="flex items-center gap-3"><div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]"></div><span className="text-slate-200 font-medium">Level 3 (Routine)</span></div>
        </div>
      </div>

      <MapContainer center={fallbackCenter} zoom={12} style={{ height: '100%', width: '100%', zIndex: 0 }}>
        <MapCameraController scans={scans} />
        
        {/* Map Tiles */}
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' className="map-tiles" />

        {/* Plot Hospitals */}
        {activeHospitals.map(([name, coords]) => (
          <Marker position={coords as [number, number]} key={`hosp-${name}`} icon={hospitalIcon}>
            <Popup className="medical-popup"><div className="bg-slate-900 text-slate-100 p-2 font-bold text-sky-400">{name}</div></Popup>
          </Marker>
        ))}
        
        {/* Plot Patients & REAL ROAD LINES */}
        {scans.map((scan, idx) => {
          if (typeof scan.lat !== 'number' || typeof scan.lng !== 'number' || typeof scan.hospitalLat !== 'number') return null; 

          const patientCoords: [number, number] = [scan.lat + (Math.random() - 0.5) * 0.002, scan.lng + (Math.random() - 0.5) * 0.002];
          const facilityCoords: [number, number] = [scan.hospitalLat, scan.hospitalLng];
          const lineColor = scan.priority === 1 ? '#ef4444' : scan.priority === 2 ? '#f59e0b' : '#10b981';

          return (
            <div key={`scan-${scan.patientId || idx}`}>
              <Marker position={patientCoords} icon={createPatientIcon(scan.priority)}>
                <Popup className="medical-popup"><div className="bg-slate-900 text-slate-100 p-2 text-sky-400 font-bold">{scan.patientId}</div></Popup>
              </Marker>
              
              {/* 🌟 IMPLEMENTING THE REAL ROAD COMPONENT HERE */}
              <RealRouteLine start={patientCoords} end={facilityCoords} color={lineColor} />
            </div>
          );
        })}
      </MapContainer>
    </div>
  );
}