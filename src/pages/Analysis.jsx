import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Analysis = () => {
  const navigate = useNavigate();
  const [report, setReport] = useState({ condition: "", risk: "", advice: "" });
  
  // Data-va localStorage-la irundhu edukkurom
  const userData = JSON.parse(localStorage.getItem('nidan_user_data') || '{}');
  const vitals = JSON.parse(localStorage.getItem('nidan_final_vitals') || '{}');

  useEffect(() => {
    let condition = "Stable";
    let risk = "Low";
    let advice = "Your vitals appear normal. Maintain hydration.";

    // SMART AI LOGIC ENGINE
    if (vitals.bpm > 100 || userData.questions?.chestPain === 'Y') {
      condition = "Cardiac Stress Detected";
      risk = "HIGH ALERT";
      advice = "Immediate ECG and medical consultation required. Avoid physical exertion.";
    } else if (userData.tempF > 100 || userData.symptoms?.toLowerCase().includes('fever')) {
      condition = "Febrile Response (Infection)";
      risk = "MODERATE";
      advice = "High body temperature detected. Take rest and consult a physician for infection screening.";
    } else if (userData.questions?.breathShortness === 'Y' || vitals.spo2 < 95) {
      condition = "Respiratory Distress";
      risk = "CRITICAL";
      advice = "Low oxygen levels or breathing difficulty noted. Emergency oxygen support might be needed.";
    }

    setReport({ condition, risk, advice });
  }, [userData, vitals]);

  return (
    <div className="p-6 max-w-md mx-auto min-h-screen bg-[#050b18] text-white flex flex-col justify-center">
      <div className="text-center mb-8">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${report.risk === 'HIGH ALERT' || report.risk === 'CRITICAL' ? 'bg-red-500/20' : 'bg-green-500/20'}`}>
          <span className="text-3xl">{report.risk === 'LOW' ? '✅' : '⚠️'}</span>
        </div>
        <h2 className="text-3xl font-bold italic tracking-tighter uppercase">NIDAN Analysis</h2>
      </div>

      <div className="bg-white/5 border border-white/10 p-8 rounded-[3rem] shadow-2xl space-y-6">
        <div className="flex justify-between items-center">
          <span className="text-blue-400 font-bold text-[10px] uppercase tracking-widest">Medical Status</span>
          <span className={`text-[10px] font-black px-3 py-1 rounded-full italic ${report.risk === 'LOW' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
            {report.risk}
          </span>
        </div>

        <div>
          <p className="text-gray-500 text-[10px] uppercase font-bold mb-1">Detected Condition</p>
          <p className="text-xl font-medium text-white">{report.condition}</p>
        </div>

        <div className="h-[1px] bg-white/10 w-full"></div>

        <div>
          <p className="text-gray-500 text-[10px] uppercase font-bold mb-1">AI Recommendation</p>
          <p className="text-sm text-gray-300 leading-relaxed">{report.advice}</p>
        </div>

        {/* Displaying Summary of Inputs */}
        <div className="bg-black/40 p-4 rounded-2xl text-[11px] text-gray-400 space-y-1">
          <p>Age: <span className="text-white">{userData.age}</span></p>
          <p>Input Temp: <span className="text-white">{userData.tempF}°F</span></p>
          <p>Medical History: <span className="text-white">{userData.medHistory || "None"}</span></p>
        </div>
      </div>

      <button onClick={() => navigate('/token')} className="w-full mt-8 bg-red-600 py-5 rounded-[2rem] font-black text-lg shadow-xl shadow-red-900/30 animate-pulse">
        SEND SOS / GET TOKEN
      </button>
      
      <button onClick={() => navigate('/')} className="mt-4 text-gray-600 text-[10px] uppercase font-bold text-center">Discard and Exit</button>
    </div>
  );
};

export default Analysis;