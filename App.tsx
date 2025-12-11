import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Dispatch from './pages/Dispatch';
import DispatchLocal from './pages/DispatchLocal';
import Analytics from './pages/Analytics';
import AnalyticsLocal from './pages/AnalyticsLocal';

const App: React.FC = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<Home />} />
        
        {/* Main Routes (Will be upgraded to Supabase) */}
        <Route path="/dispatch" element={<Dispatch />} />
        <Route path="/analytics" element={<Analytics />} />
        
        {/* Backup Local Routes (Excel based) */}
        <Route path="/dispatch-local" element={<DispatchLocal />} />
        <Route path="/analytics-local" element={<AnalyticsLocal />} />
      </Routes>
    </HashRouter>
  );
};

export default App;