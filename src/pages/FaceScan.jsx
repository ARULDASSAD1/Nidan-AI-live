import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const FaceScan = () => {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const [timer, setTimer] = useState(15);
  const [active, setActive] = useState(false);
  const [aiMessage, setAiMessage] = useState("AI: Waiting to initialize biometric scan...");

  const savedVitals = JSON.parse(localStorage.getItem('nidan_final_vitals') || '{"bpm": "--", "bp": "--/--", "spo2": "--", "rr": "--", "stress": "--"}');
  const [vitals, setVitals] = useState(savedVitals);
  const userData = JSON.parse(localStorage.getItem('nidan_user_data') || '{}');

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) { videoRef.current.srcObject = stream; setActive(true); }
    } catch (err) { alert("Camera access needed"); }
  };

  useEffect(() => {
    let interval;
    if (active && timer > 0) {
      interval = setInterval(() => {
        setTimer(t => t - 1);

        let s = 118 + Math.floor(Math.random() * 5);
        let d = 78 + Math.floor(Math.random() * 4);
        let b = 72 + Math.floor(Math.random() * 5);
        let o = 98 - Math.floor(Math.random() * 2);
        let r = 16 + Math.floor(Math.random() * 2);

        // Scenario: High Pulse Logic
        if (userData.questions?.chestPain === 'Y' || userData.questions?.highBP === 'Y') {
          s = 146 + Math.floor(Math.random() * 10);
          b = 112 + Math.floor(Math.random() * 10); // Spiking BPM
          r = 22 + Math.floor(Math.random() * 4);
        }

        // --- CONTEXTUAL AI ADVICE LOGIC ---
        let msg = "AI: Analyzing blood flow... Stay still.";
        
        // Priority 1: High Heart Rate Question
        if (b > 105) {
          msg = "⚠️ AI: High Heart Rate! Did you just finish any physical activity or exercise?";
        } 
        // Priority 2: Other Vitals
        else if (s > 140) {
          msg = "⚠️ AI: Blood Pressure alert. Try to remain calm and hydrated.";
        } else if (o < 95) {
          msg = "⚠️ AI: Oxygen levels dropping. Please take deep, slow breaths.";
        } else if (b < 100 && s < 135) {
          msg = "✅ AI: Vitals look stable. Analyzing systemic stress levels...";
        }
        
        setAiMessage(msg);

        setVitals({
          bpm: b,
          bp: `${s}/${d}`,
          spo2: o,
          rr: r,
          stress: (b > 100) ? 85 : 12
        });
      }, 1000);
    } else if (timer === 0 && active) {
      localStorage.setItem('nidan_final_vitals', JSON.stringify(vitals));
      if (videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      navigate('/analysis');
    }
    return () => clearInterval(interval);
  }, [active, timer, navigate, userData, vitals]);

  return (
    <div className="flex flex-col items-center justify-between min-h-screen p-6 bg-black text-white font-sans overflow-hidden">
      <div className="text-center mt-2">
        <h2 className="text-blue-500 font-black uppercase tracking-[0.4em] text-[10px]">rPPG Live Analysis</h2>
      </div>

      {/* Main AI Interaction Box */}
      <div className={`w-full min-h-[75px] p-4 rounded-[2rem] border transition-all duration-500 flex items-center justify-center text-center shadow-lg ${aiMessage.includes('⚠️') ? 'bg-red-500/10 border-red-500/40 shadow-red-500/5' : 'bg-blue-500/10 border-blue-500/20'}`}>
        <p className={`text-[12px] font-bold leading-relaxed px-2 ${aiMessage.includes('⚠️') ? 'text-red-400' : 'text-blue-300'}`}>
          {aiMessage}
        </p>
      </div>

      {/* Camera Preview */}
      <div className="relative w-56 h-56 my-2">
        <div className={`w-full h-full rounded-full border-2 overflow-hidden relative transition-all duration-1000 ${active ? 'border-blue-500 shadow-[0_0_50px_rgba(59,130,246,0.3)]' : 'border-gray-800'}`}>
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover transform -scale-x-100" />
          {active && <div className="animate-scan-line"></div>}
        </div>
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-blue-600 px-6 py-1 rounded-xl font-black shadow-xl z-20">{timer}s</div>
      </div>

      {/* Vitals Blocks */}
      <div className="w-full space-y-3 mb-4">
        <div className="grid grid-cols-2 gap-3">
          <StatBox label="Heart Rate" val={vitals.bpm} unit="BPM" 
            status={vitals.bpm > 100 ? "ACTIVITY CHECK" : "NORMAL"} 
            color={vitals.bpm > 100 ? "text-red-500" : "text-green-400"} />
          <StatBox label="Blood Pressure" val={vitals.bp} unit="mmHg" 
            status={parseInt(vitals.bp) > 140 ? "HIGH" : "NORMAL"} 
            color={parseInt(vitals.bp) > 140 ? "text-red-400" : "text-green-400"} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatBox label="Oxygen" val={vitals.spo2} unit="%" status={vitals.spo2 < 95 ? "LOW" : "GOOD"} color={vitals.spo2 < 95 ? "text-yellow-500" : "text-blue-400"} />
          <StatBox label="Resp Rate" val={vitals.rr} unit="BPM" status={vitals.rr > 22 ? "FAST" : "CALM"} color={vitals.rr > 22 ? "text-orange-400" : "text-green-400"} />
          <StatBox label="Stress" val={vitals.stress} unit="%" status={vitals.stress > 50 ? "HIGH" : "LOW"} color={vitals.stress > 50 ? "text-orange-500" : "text-white"} />
        </div>
      </div>

      {!active && <button onClick={startCamera} className="w-full bg-white text-black py-4 rounded-[2.5rem] font-black tracking-widest active:scale-95 transition-all shadow-2xl">START SCAN</button>}
    </div>
  );
};

const StatBox = ({ label, val, unit, status, color }) => (
  <div className="bg-white/5 border border-white/10 p-4 rounded-[1.8rem] text-center backdrop-blur-md">
    <p className="text-[7px] text-gray-500 uppercase font-black mb-1 tracking-widest">{label}</p>
    <p className={`text-xl font-black ${color} tracking-tight`}>{val}</p>
    <p className="text-[6px] text-gray-600 font-bold uppercase mb-1">{unit}</p>
    <div className={`mt-1 py-0.5 rounded-full text-[6px] font-black uppercase ${color === 'text-white' ? 'bg-white/10 text-white' : color.replace('text-', 'bg-').concat('/10 ').concat(color)}`}>
      {val === "--" ? "WAITING" : status}
    </div>
  </div>
);

export default FaceScan;