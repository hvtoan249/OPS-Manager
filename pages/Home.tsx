
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Gamepad2, BarChart3 } from 'lucide-react';

const Home: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="relative h-screen w-full flex flex-col items-center justify-center overflow-hidden bg-slate-900 text-white">
      {/* Background */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center opacity-40"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1464037866556-6812c9d1c72e?auto=format&fit=crop&w=1920&q=80')" }}
      />
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-slate-900/80 to-slate-900/90" />

      {/* Content */}
      <div className="relative z-10 text-center">
        <h1 className="text-5xl md:text-6xl font-extrabold mb-4 tracking-tight drop-shadow-xl">
          Airport Ops Master
        </h1>
        <p className="text-slate-400 text-lg md:text-xl mb-12 font-light">
          Ground Handling Management & Data Analytics System
        </p>

        <div className="flex flex-col md:flex-row gap-8 justify-center">
          <div 
            onClick={() => navigate('/dispatch')}
            className="group w-72 bg-white/5 backdrop-blur-md border border-white/10 p-10 rounded-3xl cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:bg-white/10 hover:border-sky-400 hover:shadow-2xl hover:shadow-sky-500/20"
          >
            <Gamepad2 className="w-16 h-16 mx-auto mb-6 text-slate-300 group-hover:text-sky-400 transition-colors" />
            <span className="block text-2xl font-bold mb-2">Dispatch</span>
            <span className="block text-sm text-slate-400 leading-relaxed">
              Gate Planning, Check-in Gantt,<br/>Peak Analysis & Conflict Alerts.
            </span>
          </div>

          <div 
            onClick={() => navigate('/analytics')}
            className="group w-72 bg-white/5 backdrop-blur-md border border-white/10 p-10 rounded-3xl cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:bg-white/10 hover:border-emerald-400 hover:shadow-2xl hover:shadow-emerald-500/20"
          >
            <BarChart3 className="w-16 h-16 mx-auto mb-6 text-slate-300 group-hover:text-emerald-400 transition-colors" />
            <span className="block text-2xl font-bold mb-2">Analytics</span>
            <span className="block text-sm text-slate-400 leading-relaxed">
              Operational Reports, Delay Analysis,<br/>Load Factors & Market Share.
            </span>
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 text-xs text-slate-500 font-mono">
        Version 5.1 • React Edition
      </div>
    </div>
  );
};

export default Home;
