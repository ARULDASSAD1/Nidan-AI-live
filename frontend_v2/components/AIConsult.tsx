'use client';
import React, { useState } from 'react';

export default function AIConsult({ userData }: { userData: any }) {
  const [messages, setMessages] = useState<{role: string, text: string}[]>([
    { role: 'ai', text: `Hello ${userData?.name || 'Patient'}. I am connected to your Pinecone Medical Records. How can I help you today?` }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault(); 
    if (!input.trim()) return;

    const userMsg = input; 
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput(''); 
    setIsLoading(true);

    try {
      const host = window.location.hostname;
      const res = await fetch(`http://${host}:8000/api/chat`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ patient_id: userData?.uid, symptoms: userMsg }) 
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'ai', text: data.reply }]);
    } catch (err) { 
        setMessages(prev => [...prev, { role: 'ai', text: "⚠️ Multi-Agent Server Offline." }]); 
    } finally { 
        setIsLoading(false); 
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-slate-900/80 rounded-3xl border border-slate-700/50 flex flex-col h-[650px] overflow-hidden shadow-2xl backdrop-blur-sm">
      <div className="p-6 border-b border-slate-800 font-black text-emerald-400 uppercase tracking-widest bg-slate-950/50 flex justify-between items-center">
          Diagnostic Agent
          <span className="text-[10px] text-sky-400 font-mono tracking-normal bg-sky-900/30 px-2 py-1 rounded">RAG Enabled</span>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-950/20 custom-scrollbar">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl p-4 text-sm ${msg.role === 'user' ? 'bg-sky-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-300 border border-slate-700 rounded-tl-none whitespace-pre-wrap'}`}>{msg.text}</div>
          </div>
        ))}
        {isLoading && <div className="text-xs font-bold text-emerald-400 animate-pulse pl-2">Querying Pinecone DB...</div>}
      </div>
      <form onSubmit={sendMessage} className="p-4 bg-slate-900 border-t border-slate-800 flex gap-2">
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type symptoms..." className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-emerald-500 transition-colors" />
        <button type="submit" disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-6 rounded-xl uppercase text-xs transition-colors">Send</button>
      </form>
    </div>
  );
}