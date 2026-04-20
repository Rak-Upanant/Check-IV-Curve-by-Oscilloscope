// frontend/src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import BoardSelect from "./pages/BoardSelect";
import SessionSetup from "./pages/SessionSetup";
import TestFlow from "./pages/TestFlow";
import SessionSummary from "./pages/SessionSummary";
import MasterUpload from "./pages/MasterUpload";
import "./styles.css";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="app">
          <Routes>
            <Route path="/"                        element={<BoardSelect />} />
            <Route path="/session/:boardId"        element={<SessionSetup />} />
            <Route path="/test/:sessionId"         element={<TestFlow />} />
            <Route path="/summary/:sessionId"      element={<SessionSummary />} />
            <Route path="/master/:boardId"         element={<MasterUpload />} />
            <Route path="*"                        element={<Navigate to="/" />} />
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
