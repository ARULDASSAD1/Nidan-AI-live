'use client';

import React, { useState, useEffect, useRef } from 'react';

interface Vitals {
    bpm: number | string;
    resp: number | string;
    stress: string;
}

interface AIAvatarProps {
    patientId: string;
    vitals?: Vitals | null;
    visionReport?: string | null;
}

const LANGUAGES = [
    { code: 'en-IN', name: 'English (India)' },
    { code: 'hi-IN', name: 'Hindi (हिंदी)' },
    { code: 'ta-IN', name: 'Tamil (தமிழ்)' },
    { code: 'te-IN', name: 'Telugu (తెలుగు)' },
    { code: 'kn-IN', name: 'Kannada (ಕನ್ನಡ)' },
    { code: 'ml-IN', name: 'Malayalam (മലയാളం)' },
    { code: 'bn-IN', name: 'Bengali (বাংলা)' },
    { code: 'mr-IN', name: 'Marathi (मराठी)' }
];

const QUICK_PROMPTS = [
    "Can you explain my vitals scan?",
    "What does my imaging report say?",
    "What should I do if my heart rate is high?",
    "Do I need to see a doctor immediately?"
];

interface ChatMsg {
    role: 'user' | 'ai';
    text: string;
}

export default function AIAvatar({ patientId, vitals, visionReport }: AIAvatarProps) {
    // Core State
    const [status, setStatus] = useState<'idle' | 'listening' | 'thinking' | 'talking'>('idle');
    const [language, setLanguage] = useState('en-IN');
    const [transcript, setTranscript] = useState('');
    const [history, setHistory] = useState<ChatMsg[]>([{ role: 'ai', text: 'Namaste! I am your AI Medical Assistant. How can I help you today?' }]);
    
    // Settings State
    const [speechRate, setSpeechRate] = useState(1.0);
    const [speechPitch, setSpeechPitch] = useState(1.0);
    const [showSubtitles, setShowSubtitles] = useState(true);

    const recognitionRef = useRef<any>(null);
    const synthRef = useRef<SpeechSynthesis | null>(null);

    // Initialize APIs
    useEffect(() => {
        if (typeof window !== 'undefined') {
            synthRef.current = window.speechSynthesis;
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (SpeechRecognition) {
                recognitionRef.current = new SpeechRecognition();
                recognitionRef.current.continuous = false;
                recognitionRef.current.interimResults = false;
            }
        }
        
        // Force the browser to load voices immediately
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = () => { synthRef.current?.getVoices(); };
        }

        return () => {
            if (synthRef.current) synthRef.current.cancel();
        };
    }, []);

    const stopSpeaking = () => {
        if (synthRef.current) {
            synthRef.current.cancel();
            setStatus('idle');
        }
    };

    const handleListen = () => {
        if (!recognitionRef.current) {
            alert("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
            return;
        }

        stopSpeaking(); // Stop AI if it's currently talking
        
        recognitionRef.current.lang = language;
        setStatus('listening');
        setTranscript('Listening...');

        recognitionRef.current.onresult = (event: any) => {
            const text = event.results[0][0].transcript;
            setTranscript(text);
            askAI(text);
        };

        recognitionRef.current.onerror = (event: any) => {
            console.error("Speech Error:", event.error);
            setStatus('idle');
            setTranscript('Microphone disconnected. Try again.');
        };

        recognitionRef.current.start();
    };

    const handleQuickPrompt = (prompt: string) => {
        stopSpeaking();
        setTranscript(prompt);
        askAI(prompt);
    };

    const askAI = async (userText: string) => {
        setStatus('thinking');
        setHistory(prev => [...prev, { role: 'user', text: userText }]);
        
        const langName = LANGUAGES.find(l => l.code === language)?.name || 'English';
        const localizedQuery = `[Respond strictly in ${langName}]. ${userText}`;

        // 🌟 INJECT LIVE MEDICAL MEMORY INTO THE AI 🌟
        const medicalContext = `
        You are a highly advanced AI Medical Assistant inside a hospital kiosk.
        Patient ID: ${patientId}
        
        CURRENT CLINICAL DATA IN MEMORY:
        - Vitals (rPPG Camera Scan): ${vitals ? `Heart Rate: ${vitals.bpm} BPM, Respiration: ${vitals.resp} BrPM, Stress Level: ${vitals.stress}` : 'No vitals scan performed yet.'}
        - LLaVA Imaging AI Report: ${visionReport ? visionReport : 'No MRI, CT, or X-Ray scan uploaded yet.'}
        
        BEHAVIOR INSTRUCTIONS:
        Address the patient directly. If they ask about their vitals or reports, refer to the data above. 
        Be concise, conversational, and empathetic. Keep sentences short so text-to-speech sounds natural.
        Never list bullet points; speak in fluid, natural paragraphs.
        `;

        try {
            const res = await fetch("http://127.0.0.1:8003/api/chat-with-agents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    patient_id: patientId,
                    question: localizedQuery,
                    context: medicalContext
                })
            });
            const data = await res.json();
            setHistory(prev => [...prev, { role: 'ai', text: data.reply }]);
            speakResponse(data.reply);
        } catch (error) {
            const errorMsg = "I'm sorry, my connection to the medical board was lost.";
            setHistory(prev => [...prev, { role: 'ai', text: errorMsg }]);
            speakResponse(errorMsg);
        }
    };

    const speakResponse = (text: string) => {
        if (!synthRef.current) return;
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = language;
        utterance.rate = speechRate;
        utterance.pitch = speechPitch;
        
        const voices = synthRef.current.getVoices();
        
        // 🌟 AGGRESSIVE FEMALE VOICE ENFORCEMENT 🌟
        const langVoices = voices.filter(v => v.lang === language || v.lang.startsWith(language.split('-')[0]));
        
        // Known female markers in Chrome/Edge/Safari across English & Indian languages
        const femaleKeywords = ['female', 'woman', 'zira', 'swara', 'heera', 'veena', 'pallavi', 'shruti', 'neerja', 'lekha', 'anjali', 'samantha', 'victoria', 'google uk english female', 'google us english'];
        const maleKeywords = ['male', 'man', 'david', 'mark', 'ravi', 'raj', 'madhur', 'google uk english male'];

        // 1. Prioritize strict female matches
        let selectedVoice = langVoices.find(v => {
            const nameLower = v.name.toLowerCase();
            return femaleKeywords.some(kw => nameLower.includes(kw)) && !maleKeywords.some(kw => nameLower.includes(kw));
        });

        // 2. Fallback: Take any voice that is strictly NOT labeled male
        if (!selectedVoice) {
            selectedVoice = langVoices.find(v => {
                const nameLower = v.name.toLowerCase();
                return !maleKeywords.some(kw => nameLower.includes(kw));
            });
        }
        
        // 3. Last Resort: First available voice for the language
        if (!selectedVoice && langVoices.length > 0) {
            selectedVoice = langVoices[0];
        }

        if (selectedVoice) {
            utterance.voice = selectedVoice;
            console.log("Avatar Voice Selected:", selectedVoice.name);
        }

        utterance.onstart = () => setStatus('talking');
        utterance.onend = () => setStatus('idle');
        utterance.onerror = () => setStatus('idle');

        synthRef.current.speak(utterance);
    };

    return (
        <div className="w-full max-w-7xl mx-auto min-h-[750px] py-6 flex flex-col lg:flex-row gap-6 animate-in fade-in duration-500">
            
            {/* 🌟 LEFT PANEL: THE AVATAR DISPLAY (PORTRAIT) */}
            <div className="flex-[3] bg-slate-900/90 rounded-3xl shadow-2xl border border-slate-700/50 backdrop-blur-sm p-8 flex flex-col items-center justify-center relative overflow-hidden">
                
                {/* Background Glow */}
                <div className={`absolute inset-0 blur-[150px] opacity-20 pointer-events-none transition-colors duration-1000 ${status === 'listening' ? 'bg-red-500' : status === 'thinking' ? 'bg-amber-500' : status === 'talking' ? 'bg-emerald-500' : 'bg-sky-500'}`}></div>

                {/* Avatar Video Panel (Portrait Aspect Ratio) */}
                <div className="relative w-64 h-96 lg:w-80 lg:h-[450px] rounded-3xl overflow-hidden border-8 border-slate-800 shadow-[0_0_50px_rgba(0,0,0,0.5)] bg-black mb-8 z-10">
                    <video src="/avatar/idle.mp4" loop autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover" />
                    <video src="/avatar/talking.mp4" loop autoPlay muted playsInline className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${status === 'talking' ? 'opacity-100' : 'opacity-0'}`} />
                </div>

                {/* Subtitles Box */}
                {showSubtitles && (
                    <div className="w-full max-w-2xl bg-slate-950/80 rounded-2xl p-6 border border-slate-800 z-10 min-h-[100px] flex flex-col justify-center text-center backdrop-blur-md shadow-xl">
                        <p className="text-emerald-400 text-sm font-bold mb-2 opacity-70 uppercase tracking-widest">
                            {status === 'listening' ? "Hearing..." : "Avatar"}
                        </p>
                        <p className="text-white text-lg lg:text-xl font-bold leading-relaxed">
                            {status === 'listening' ? transcript : history[history.length - 1]?.text}
                        </p>
                    </div>
                )}

                {/* Main Mic Button */}
                <button 
                    onClick={handleListen}
                    disabled={status === 'talking' || status === 'thinking'}
                    className={`mt-8 px-10 py-5 rounded-full font-black text-lg uppercase tracking-wider transition-all shadow-2xl z-10 flex items-center justify-center gap-3 ${
                        status === 'listening' 
                            ? 'bg-red-500 text-white animate-pulse shadow-[0_0_30px_rgba(239,68,68,0.5)]' 
                            : status === 'talking' || status === 'thinking'
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            : 'bg-sky-600 hover:bg-sky-500 hover:scale-105 text-white shadow-[0_0_30px_rgba(2,132,199,0.5)]'
                    }`}
                >
                    {status === 'listening' ? '🛑 Recording...' : '🎤 Tap to Speak'}
                </button>
            </div>

            {/* 🌟 RIGHT PANEL: CONTROLS & SETTINGS */}
            <div className="flex-[2] flex flex-col gap-6">
                
                {/* Top Settings Block */}
                <div className="bg-slate-900/90 rounded-3xl p-6 border border-slate-700/50 shadow-xl">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-black text-sky-400 uppercase tracking-widest text-sm">Kiosk Controls</h3>
                        <div className="flex items-center gap-2">
                            <span className={`w-3 h-3 rounded-full ${status === 'listening' ? 'bg-red-500 animate-pulse' : status === 'thinking' ? 'bg-amber-500 animate-pulse' : status === 'talking' ? 'bg-emerald-500 animate-bounce' : 'bg-sky-500'}`}></span>
                            <span className="text-xs font-bold text-slate-400 uppercase">{status}</span>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Spoken Language</label>
                            <select 
                                value={language} 
                                onChange={(e) => setLanguage(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 text-sm text-white rounded-xl px-4 py-3 outline-none focus:border-sky-500 cursor-pointer"
                            >
                                {LANGUAGES.map(lang => <option key={lang.code} value={lang.code}>{lang.name}</option>)}
                            </select>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase mb-2 flex justify-between">Speed <span>{speechRate}x</span></label>
                                <input type="range" min="0.5" max="2" step="0.1" value={speechRate} onChange={(e) => setSpeechRate(parseFloat(e.target.value))} className="w-full accent-sky-500" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase mb-2 flex justify-between">Pitch <span>{speechPitch}</span></label>
                                <input type="range" min="0.5" max="2" step="0.1" value={speechPitch} onChange={(e) => setSpeechPitch(parseFloat(e.target.value))} className="w-full accent-sky-500" />
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                            <label className="text-xs font-bold text-slate-400 uppercase cursor-pointer flex items-center gap-2">
                                <input type="checkbox" checked={showSubtitles} onChange={(e) => setShowSubtitles(e.target.checked)} className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-sky-500" />
                                Show Subtitles
                            </label>
                            
                            <button onClick={stopSpeaking} disabled={status !== 'talking'} className="text-xs font-bold bg-red-500/10 text-red-400 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-30">
                                🛑 Stop Voice
                            </button>
                        </div>
                    </div>
                </div>

                {/* Quick Prompts Block */}
                <div className="bg-slate-900/90 rounded-3xl p-6 border border-slate-700/50 shadow-xl flex-1 flex flex-col min-h-[250px]">
                    <h3 className="font-black text-emerald-400 uppercase tracking-widest text-sm mb-4">Quick Questions</h3>
                    <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-2 custom-scrollbar">
                        {QUICK_PROMPTS.map((prompt, i) => (
                            <button 
                                key={i}
                                onClick={() => handleQuickPrompt(prompt)}
                                disabled={status === 'talking' || status === 'thinking'}
                                className="text-left w-full p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-900/10 transition-all text-sm font-medium text-slate-300 disabled:opacity-50"
                            >
                                "{prompt}"
                            </button>
                        ))}
                    </div>
                </div>

            </div>
            
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
            `}</style>
        </div>
    );
}