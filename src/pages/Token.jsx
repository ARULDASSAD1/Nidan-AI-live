import React from 'react';
import { useNavigate } from 'react-router-dom';

const Token = () => {
  const navigate = useNavigate();
  const tokenNumber = "ND-" + Math.floor(Math.random() * 9000 + 1000);

  return (
    <div className="p-6 max-w-md mx-auto min-h-screen flex flex-col justify-center items-center bg-[#050b18]">
      <div className="w-full bg-white/5 border border-white/10 p-8 rounded-[3rem] text-center shadow-2xl">
        <p className="text-blue-400 font-bold tracking-widest uppercase text-[10px] mb-2">Emergency Queue Token</p>
        <h1 className="text-6xl font-black my-4 text-white">{tokenNumber}</h1>
        <p className="text-gray-400 text-sm mb-6 px-4">Present this at **Apollo Hospital** for priority treatment.</p>
        
        {/* Simple Map Placeholder */}
        <div className="w-full h-40 bg-gray-800 rounded-3xl mb-6 flex items-center justify-center border border-white/10 overflow-hidden relative">
           <div className="absolute inset-0 opacity-30 bg-gradient-to-br from-blue-500 to-purple-600"></div>
           <span className="text-3xl relative z-10">📍</span>
           <p className="absolute bottom-2 text-[10px] text-gray-400">Hospital: 1.2km away</p>
        </div>

        <button 
          onClick={() => window.print()}
          className="w-full bg-blue-600 py-4 rounded-2xl font-bold text-white shadow-lg shadow-blue-900/40"
        >
          DOWNLOAD TOKEN
        </button>
      </div>

      <button 
        onClick={() => navigate('/')}
        className="mt-8 text-gray-600 hover:text-white text-xs uppercase tracking-widest font-bold"
      >
        Back to Home
      </button>
    </div>
  );
};

export default Token;