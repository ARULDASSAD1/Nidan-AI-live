'use client';

import { useRouter } from 'next/navigation';

export default function LandingPage() {
  const router = useRouter();

  const handlePortalClick = (role: 'patient' | 'hospital') => {
    router.push(`/login?role=${role}`);
  };

  return (
    <>
      {/* Custom CSS for Medical Cursor and 3D Flip Animations */}
      <style dangerouslySetInnerHTML={{__html: `
        .medical-cursor, .medical-cursor * {
          cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="%230ea5e9" stroke="%23ffffff" stroke-width="1.5"><path d="M10.5 2h3v8h8v3h-8v8h-3v-8h-8v-3h8z"/></svg>') 14 14, auto !important;
        }
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}} />

      <div className="medical-cursor min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-sky-500/30 overflow-x-hidden">
        
        {/* Modern Header */}
        <header className="fixed top-0 w-full z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/50">
          <div className="flex items-center justify-between p-4 max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-emerald-400 flex items-center justify-center font-black text-slate-900 text-xl shadow-[0_0_15px_rgba(56,189,248,0.5)]">
                N
              </div>
              <span className="text-2xl font-bold tracking-widest">NIDAN-<span className="text-sky-400">LIVE</span></span>
            </div>
            <nav className="hidden md:flex gap-8 text-sm font-semibold text-slate-400">
              <a href="#about" className="hover:text-sky-400 transition-colors">Platform</a>
              <a href="#features" className="hover:text-sky-400 transition-colors">AI Core</a>
              <a href="#login" className="hover:text-emerald-400 transition-colors">Access Portals</a>
            </nav>
            <button onClick={() => document.getElementById('login')?.scrollIntoView({ behavior: 'smooth' })} className="hidden md:block bg-sky-500/10 text-sky-400 border border-sky-500/50 px-5 py-2 rounded-full font-bold hover:bg-sky-500 hover:text-slate-900 transition-all">
              Initialize
            </button>
          </div>
        </header>

        {/* Massive Hero Section */}
        <main className="max-w-7xl mx-auto px-6 pt-40 pb-20 flex flex-col items-center text-center relative">
          
          {/* Background Glow */}
          <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-sky-600/20 blur-[120px] rounded-full pointer-events-none"></div>

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-700 text-sky-400 text-xs font-bold mb-8 uppercase tracking-widest shadow-xl z-10">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            LangGraph + Pinecone + MedGemma Deployed
          </div>
          
          <h1 className="text-5xl md:text-8xl font-black tracking-tighter mb-8 leading-tight z-10">
            The Future of <br className="hidden md:block"/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-emerald-400 to-teal-200">Autonomous Triage.</span>
          </h1>
          
          <p className="text-lg md:text-2xl text-slate-400 max-w-3xl mb-16 z-10 font-light leading-relaxed">
            Nidan-Live is an enterprise-grade diagnostic engine. We extract clinical vitals via webcam rPPG, analyze scans with multimodal MedGemma, and route patients to optimal facilities using a multi-agent framework.
          </p>

          {/* LOGIN SECTION (Brought up for easy access) */}
          <div id="login" className="grid md:grid-cols-2 gap-8 w-full max-w-4xl z-10 relative scroll-mt-32 mb-32">
            
            {/* Patient Portal */}
            <div className="bg-slate-900/80 p-8 rounded-3xl border border-slate-700 hover:border-sky-500/50 shadow-2xl transition-all duration-500 group flex flex-col h-full">
              <div className="w-16 h-16 bg-gradient-to-br from-sky-500/20 to-blue-500/20 border border-sky-500/30 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform text-3xl shadow-[0_0_20px_rgba(56,189,248,0.2)]">
                🩺
              </div>
              <h2 className="text-3xl font-bold mb-3 text-left text-white">Patient Portal</h2>
              <p className="text-slate-400 text-sm text-left mb-8 flex-grow leading-relaxed">
                Experience instant clinical assessment. Scan your vitals contact-free, chat with our universal LLM diagnostic agent, upload MRI/CT scans, and receive real-time hospital routing based on city traffic and severity.
              </p>
              <button 
                onClick={() => handlePortalClick('patient')}
                className="w-full flex items-center justify-center gap-3 bg-white text-slate-900 font-extrabold py-4 px-6 rounded-xl hover:bg-sky-50 transition-colors text-lg shadow-lg hover:shadow-sky-500/20"
              >
                Enter Patient Hub
              </button>
            </div>

            {/* Hospital Portal */}
            <div className="bg-slate-900/80 p-8 rounded-3xl border border-slate-700 hover:border-emerald-500/50 shadow-2xl transition-all duration-500 group flex flex-col h-full">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform text-3xl shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                🏥
              </div>
              <h2 className="text-3xl font-bold mb-3 text-left text-white">Hospital Admin</h2>
              <p className="text-slate-400 text-sm text-left mb-8 flex-grow leading-relaxed">
                Complete facility management. Monitor live incoming triage queues, view YOLOv8 CCTV crowd analytics, automatically allocate hospital rooms to critical patients, and review AI-generated diagnostic summaries.
              </p>
              <button 
                onClick={() => handlePortalClick('hospital')}
                className="w-full flex items-center justify-center gap-3 bg-slate-800 text-white border border-slate-600 font-extrabold py-4 px-6 rounded-xl hover:bg-slate-700 hover:border-emerald-500/50 transition-all text-lg shadow-lg hover:shadow-emerald-500/10"
              >
                Enter Hospital Hub
              </button>
            </div>
            
          </div>
        </main>

        {/* 3D FLIPPING FEATURES SECTION */}
        <section id="features" className="py-24 bg-slate-950 border-t border-slate-900 relative">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-black mb-4">The Architecture of Care</h2>
              <p className="text-slate-400 max-w-2xl mx-auto text-lg">Hover over our core modules to explore the deep-tech infrastructure powering Nidan-Live.</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              
              {/* Card 1: rPPG */}
              <div className="group perspective-1000 h-80">
                <div className="relative w-full h-full transition-all duration-700 transform-style-3d group-hover:rotate-y-180">
                  {/* Front */}
                  <div className="absolute inset-0 w-full h-full backface-hidden bg-slate-900 border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center shadow-xl">
                    <div className="text-5xl mb-4">📹</div>
                    <h3 className="text-2xl font-bold text-sky-400">Contactless rPPG</h3>
                    <p className="text-slate-500 mt-2 font-medium">Remote Photoplethysmography</p>
                  </div>
                  {/* Back */}
                  <div className="absolute inset-0 w-full h-full backface-hidden rotate-y-180 bg-gradient-to-br from-sky-900 to-slate-900 border border-sky-500/50 rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-[0_0_30px_rgba(56,189,248,0.2)]">
                    <h3 className="text-xl font-bold text-white mb-3">GPU-Powered Math</h3>
                    <p className="text-sky-100 text-sm leading-relaxed">
                      Utilizes 1D Convolutional Neural Networks and IQR clipping to extract pulse waves from webcam video. Automatically ignores light flicker and tracks pupillary hippus for stress metrics.
                    </p>
                  </div>
                </div>
              </div>

              {/* Card 2: LangGraph & Pinecone */}
              <div className="group perspective-1000 h-80">
                <div className="relative w-full h-full transition-all duration-700 transform-style-3d group-hover:rotate-y-180">
                  {/* Front */}
                  <div className="absolute inset-0 w-full h-full backface-hidden bg-slate-900 border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center shadow-xl">
                    <div className="text-5xl mb-4">🧠</div>
                    <h3 className="text-2xl font-bold text-emerald-400">Autonomous Agents</h3>
                    <p className="text-slate-500 mt-2 font-medium">LangGraph & Vector DB</p>
                  </div>
                  {/* Back */}
                  <div className="absolute inset-0 w-full h-full backface-hidden rotate-y-180 bg-gradient-to-br from-emerald-900 to-slate-900 border border-emerald-500/50 rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                    <h3 className="text-xl font-bold text-white mb-3">Multi-Agent Routing</h3>
                    <p className="text-emerald-100 text-sm leading-relaxed">
                      Symptom data is embedded into Pinecone Vector DB for memory. LangGraph routes queries dynamically between Gemini, Claude, or a local Mistral fallback.
                    </p>
                  </div>
                </div>
              </div>

              {/* Card 3: MedGemma */}
              <div className="group perspective-1000 h-80">
                <div className="relative w-full h-full transition-all duration-700 transform-style-3d group-hover:rotate-y-180">
                  {/* Front */}
                  <div className="absolute inset-0 w-full h-full backface-hidden bg-slate-900 border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center shadow-xl">
                    <div className="text-5xl mb-4">🩻</div>
                    <h3 className="text-2xl font-bold text-indigo-400">MedGemma Vision</h3>
                    <p className="text-slate-500 mt-2 font-medium">Diagnostic Image AI</p>
                  </div>
                  {/* Back */}
                  <div className="absolute inset-0 w-full h-full backface-hidden rotate-y-180 bg-gradient-to-br from-indigo-900 to-slate-900 border border-indigo-500/50 rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-[0_0_30px_rgba(99,102,241,0.2)]">
                    <h3 className="text-xl font-bold text-white mb-3">Multimodal Analysis</h3>
                    <p className="text-indigo-100 text-sm leading-relaxed">
                      Upload legacy CT or MRI scans. Our integrated MedGemma model evaluates the imaging for anomalies, generating immediate radiological context for the triage agent.
                    </p>
                  </div>
                </div>
              </div>

              {/* Card 4: Edge Analytics */}
              <div className="group perspective-1000 h-80">
                <div className="relative w-full h-full transition-all duration-700 transform-style-3d group-hover:rotate-y-180">
                  {/* Front */}
                  <div className="absolute inset-0 w-full h-full backface-hidden bg-slate-900 border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center shadow-xl">
                    <div className="text-5xl mb-4">📊</div>
                    <h3 className="text-2xl font-bold text-amber-400">Hospital Edge</h3>
                    <p className="text-slate-500 mt-2 font-medium">CCTV & Queue Analytics</p>
                  </div>
                  {/* Back */}
                  <div className="absolute inset-0 w-full h-full backface-hidden rotate-y-180 bg-gradient-to-br from-amber-900 to-slate-900 border border-amber-500/50 rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-[0_0_30px_rgba(245,158,11,0.2)]">
                    <h3 className="text-xl font-bold text-white mb-3">Live Fleet Control</h3>
                    <p className="text-amber-100 text-sm leading-relaxed">
                      YOLOv8 scripts monitor CCTV for crowd density, adjusting AI triage routing based on hospital traffic. Admins get live Recharts analytics and automated room allocation.
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Detailed Footer */}
        <footer className="bg-slate-950 border-t border-slate-800/50 pt-16 pb-8">
          <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 rounded bg-gradient-to-br from-sky-400 to-emerald-400 flex items-center justify-center font-bold text-slate-900 text-xs">N</div>
                <span className="text-lg font-bold tracking-wide">NIDAN-LIVE</span>
              </div>
              <p className="text-slate-500 text-sm max-w-sm leading-relaxed">
                Bridging the gap between emergency onset and clinical admission through asynchronous AI triage, local model fallbacks, and real-time hospital network synchronization.
              </p>
            </div>
            <div>
              <h4 className="text-white font-bold mb-4">Core Technology</h4>
              <ul className="text-slate-500 text-sm space-y-2">
                <li>Next.js & Tailwind CSS</li>
                <li>Python FastAPI & PyTorch</li>
                <li>LangGraph & Pinecone DB</li>
                <li>MediaPipe & YOLOv8</li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold mb-4">AI Integrations</h4>
              <ul className="text-slate-500 text-sm space-y-2">
                <li>MedGemma Multimodal</li>
                <li>Universal LLM Router</li>
                <li>Mistral Offline Fallback</li>
                <li>Firebase Realtime Analytics</li>
              </ul>
            </div>
          </div>
          <div className="text-center text-slate-700 text-sm border-t border-slate-800/50 pt-8">
            <p>© {new Date().getFullYear()} Developed for advanced hackathon review. All systems operational.</p>
          </div>
        </footer>

      </div>
    </>
  );
}