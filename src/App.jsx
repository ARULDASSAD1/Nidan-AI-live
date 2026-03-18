import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Welcome from "./pages/Welcome.jsx";
import Profile from "./pages/Profile.jsx";
import FaceScan from "./pages/FaceScan.jsx";
import Analysis from "./pages/Analysis.jsx";
import Token from "./pages/Token.jsx";

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-[#050b18] text-white">
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/scan" element={<FaceScan />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/token" element={<Token />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;