import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Profile = () => {
  const navigate = useNavigate();
  const [age, setAge] = useState("");
  const [tempC, setTempC] = useState("");
  const [tempF, setTempF] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [medHistory, setMedHistory] = useState("");
  const [listeningTo, setListeningTo] = useState(null);

  const [questions, setQuestions] = useState({
    chestPain: 'N', breathShortness: 'N', diabetes: 'N', highBP: 'N'
  });

  const handleTempChange = (val, unit) => {
    if (unit === 'C') {
      setTempC(val);
      if (val !== "") setTempF(((val * 9/5) + 32).toFixed(1));
      else setTempF("");
    } else {
      setTempF(val);
      if (val !== "") setTempC(((val - 32) * 5/9).toFixed(1));
      else setTempC("");
    }
  };

  const startVoice = (target) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Mic not supported");
    const rec = new SpeechRecognition();
    rec.onstart = () => setListeningTo(target);
    rec.onend = () => setListeningTo(null);
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      if (target === 'symptoms') setSymptoms(prev => prev + " " + text);
      if (target === 'history') setMedHistory(prev => prev + " " + text);
    };
    rec.start();
  };

  const handleProceed = () => {
    const userData = { age, tempF, symptoms, medHistory, questions };
    localStorage.setItem('nidan_user_data', JSON.stringify(userData));
    navigate('/scan');
  };

  return (
    <div className="p-4 max-w-md mx-auto min-h-screen bg-[#050b18] text-white font-sans pb-10">
      <div className="mt-4 mb-6">
        <h2 className="text-2xl font-black tracking-tight italic text-blue-500">PATIENT PROFILE</h2>
        <p className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">Medical Intake Form</p>
      </div>

      <div className="space-y-4">
        {/* Row 1: Age & Temp (Side by Side) */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
            <label className="text-[9px] uppercase text-gray-500 font-bold mb-1 block">Age</label>
            <input type="number" className="w-full bg-transparent border-b border-white/10 p-1 text-sm outline-none focus:border-blue-500" placeholder="Years" value={age} onChange={(e) => setAge(e.target.value)} />
          </div>
          <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
            <label className="text-[9px] uppercase text-gray-500 font-bold mb-1 block">Temp (°C / °F)</label>
            <div className="flex gap-2">
              <input type="number" className="w-1/2 bg-transparent border-b border-white/10 p-1 text-xs outline-none focus:border-blue-500" placeholder="37" value={tempC} onChange={(e) => handleTempChange(e.target.value, 'C')} />
              <input type="number" className="w-1/2 bg-transparent border-b border-white/10 p-1 text-xs outline-none focus:border-blue-500" placeholder="98" value={tempF} onChange={(e) => handleTempChange(e.target.value, 'F')} />
            </div>
          </div>
        </div>

        {/* Row 2: Immediate Checks (Grid of 2x2) */}
        <div className="bg-white/5 p-4 rounded-[2rem] border border-white/5">
          <label className="text-[9px] uppercase text-blue-400 font-black mb-4 block tracking-widest text-center">Immediate Quick Scan</label>
          <div className="grid grid-cols-1 gap-4">
            <QuestionRow label="Chest Pain?" stateKey="chestPain" questions={questions} onSelect={(k,v) => setQuestions({...questions, [k]:v})} />
            <QuestionRow label="Breath Shortness?" stateKey="breathShortness" questions={questions} onSelect={(k,v) => setQuestions({...questions, [k]:v})} />
            <div className="h-[1px] bg-white/5 w-full my-1"></div>
            <QuestionRow label="Diabetes History?" stateKey="diabetes" questions={questions} onSelect={(k,v) => setQuestions({...questions, [k]:v})} />
            <QuestionRow label="High BP History?" stateKey="highBP" questions={questions} onSelect={(k,v) => setQuestions({...questions, [k]:v})} />
          </div>
        </div>

        {/* Row 3: Symptoms & History (Voice Enabled) */}
        <div className="grid grid-cols-1 gap-3">
          <InputWithMic label="Current Symptoms" value={symptoms} onChange={setSymptoms} onMic={() => startVoice('symptoms')} isListening={listeningTo === 'symptoms'} />
          <InputWithMic label="Medical History" value={medHistory} onChange={setMedHistory} onMic={() => startVoice('history')} isListening={listeningTo === 'history'} />
        </div>
      </div>

      <button onClick={handleProceed} className="w-full mt-8 bg-blue-600 py-5 rounded-[2rem] font-black text-lg shadow-xl shadow-blue-500/20 active:scale-95 transition-all uppercase tracking-tighter">
        Proceed to AI Scan 
      </button>
    </div>
  );
};

// Reusable Components
const InputWithMic = ({ label, value, onChange, onMic, isListening }) => (
  <div className="bg-white/5 p-4 rounded-3xl border border-white/5">
    <div className="flex justify-between items-center mb-2 px-1">
      <label className="text-[9px] uppercase text-gray-500 font-bold">{label}</label>
      <button onClick={onMic} className={`p-1.5 rounded-full transition-all ${isListening ? 'bg-red-500 animate-pulse' : 'bg-blue-600/40 hover:bg-blue-600'}`}>
        <svg width="12" height="12" fill="white" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
      </button>
    </div>
    <textarea className="w-full bg-black/20 rounded-xl p-3 text-xs outline-none border border-white/5 focus:border-blue-500/50" rows="1" placeholder={isListening ? "Listening..." : "Speak/Type..."} value={value} onChange={(e) => onChange(e.target.value)} />
  </div>
);

const QuestionRow = ({ label, stateKey, questions, onSelect }) => (
  <div className="flex justify-between items-center px-1">
    <span className="text-[11px] font-medium text-gray-300">{label}</span>
    <div className="flex gap-1">
      <button onClick={() => onSelect(stateKey, 'Y')} className={`w-12 py-1.5 rounded-lg text-[10px] font-black transition-all ${questions[stateKey] === 'Y' ? 'bg-blue-600 shadow-lg shadow-blue-500/30' : 'bg-white/5 text-gray-600'}`}>YES</button>
      <button onClick={() => onSelect(stateKey, 'N')} className={`w-12 py-1.5 rounded-lg text-[10px] font-black transition-all ${questions[stateKey] === 'N' ? 'bg-red-600/80 shadow-lg shadow-red-500/20' : 'bg-white/5 text-gray-600'}`}>NO</button>
    </div>
  </div>
);

export default Profile;
