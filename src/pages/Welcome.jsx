import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Welcome() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
      <div className="w-24 h-24 bg-red-600 rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-red-500/40 animate-pulse">
        <svg width="50" height="50" viewBox="0 0 24 24" fill="white">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      </div>
      <h1 className="text-5xl font-black tracking-tighter mb-2 italic">NIDAN LIVE</h1>
      <p className="text-blue-400 text-lg font-light mb-12 tracking-[0.2em] uppercase">AI Vital Monitoring</p>
      
      <button 
        onClick={() => navigate('/profile')}
        className="w-full max-w-xs bg-white text-black font-black py-5 rounded-2xl transition-all active:scale-95 shadow-xl hover:bg-blue-500 hover:text-white"
      >
        START HEALTH SCAN
      </button>
      <p className="mt-10 text-gray-600 text-[10px] tracking-widest uppercase font-bold">Hackathon Edition 2026</p>
    </div>
  );
}