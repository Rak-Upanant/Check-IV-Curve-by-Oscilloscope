// frontend/src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";

import BoardSelect    from "./pages/BoardSelect";      // Home — landing page
import AnalyzeSetup   from "./pages/AnalyzeSetup";    // Analysis board + tech select
import CollectSetup   from "./pages/CollectSetup";     // Create Report — multi-board + Tag NO
import CollectFlow    from "./pages/CollectFlow";      // One-page image collector
import TestFlow       from "./pages/TestFlow";         // Point-by-point analysis
import SessionSummary from "./pages/SessionSummary";
import MasterUpload   from "./pages/MasterUpload";
import DebugAnalyzer  from "./pages/DebugAnalyzer";
import Dashboard      from "./pages/Dashboard";
import "./styles.css";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="app">
          <Routes>
            {/* Home — clean landing page, no board list */}
            <Route path="/"                             element={<BoardSelect />} />

            {/* Analysis — board select + technician → TestFlow */}
            <Route path="/analyze"                      element={<AnalyzeSetup />} />

            {/* Create Report — multi-board checkbox + Tag NO */}
            <Route path="/collect"                      element={<CollectSetup />} />

            {/* One-page image collector (collect mode, multi-board) */}
            <Route path="/collect-flow"                 element={<CollectFlow />} />

            {/* Point-by-point analysis flow */}
            <Route path="/test/:sessionId"              element={<TestFlow />} />

            {/* Session summary + PDF */}
            <Route path="/summary/:sessionId"           element={<SessionSummary />} />

            {/* Master signature management */}
            <Route path="/master/:boardId"              element={<MasterUpload />} />

            {/* Inspection history dashboard */}
            <Route path="/dashboard"                    element={<Dashboard />} />

            {/* Pipeline debug visualizer */}
            <Route path="/debug"                        element={<DebugAnalyzer />} />

            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: "#1a1f2e",
              color: "#e2e8f0",
              border: "1px solid #2d3748",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "13px",
            },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
