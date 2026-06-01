// pages/BoardSelect.jsx — Home / Landing page
// Clean entry point: two primary actions + utility links.
// No board list here — board selection happens inside each flow.

import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getBoards } from "../lib/api";

export default function BoardSelect() {
  const nav = useNavigate();

  // Pre-fetch boards so downstream pages load instantly
  const { data: boards } = useQuery({ queryKey: ["boards"], queryFn: getBoards });
  const firstBoardId = boards?.[0]?.board_id;

  return (
    <div className="page">
      {/* Top bar */}
      <div className="topbar">
        <span className="topbar-logo">▸ IV·SIG</span>
        <span className="topbar-title">Signature Analyzer</span>
      </div>

      <div className="section" style={{ paddingTop: 32 }}>

        {/* Header banner */}
        <div style={{
          background: "linear-gradient(135deg, #0d1421, #141b2d)",
          border: "1px solid #2a3650", borderRadius: 12, padding: "24px 20px",
          marginBottom: 32, textAlign: "center",
        }}>
          <div style={{
            fontSize: 10, fontFamily: "var(--mono)", color: "var(--accent)",
            letterSpacing: 3, marginBottom: 8,
          }}>
            SIGNATURE ANALYSIS SYSTEM
          </div>
          <div style={{
            fontSize: 22, fontWeight: 600, color: "var(--text)",
            fontFamily: "var(--mono)", marginBottom: 6,
          }}>
            I-V Curve Tester
          </div>
          <div style={{ fontSize: 12, color: "var(--text2)" }}>
            Rohde &amp; Schwarz RTC1002 · IGBT Module
          </div>
        </div>

        {/* ── Primary actions ──────────────────────────────── */}
        <button
          className="btn btn-primary"
          style={{ marginBottom: 12, fontSize: 14, padding: "16px 20px" }}
          onClick={() => nav("/analyze")}
        >
          ▶&nbsp;&nbsp;Start Analysis
        </button>

        <button
          className="btn btn-primary"
          style={{
            marginBottom: 32, fontSize: 14, padding: "16px 20px",
            background: "transparent",
            border: "1px solid var(--accent)", color: "var(--accent)",
          }}
          onClick={() => nav("/collect")}
        >
          📄&nbsp;&nbsp;Create Report
        </button>

        {/* ── Utility links ─────────────────────────────────── */}
        <div className="divider" />

        <button
          className="btn btn-ghost"
          style={{ marginBottom: 8 }}
          onClick={() => nav("/dashboard")}
        >
          📊&nbsp;&nbsp;Inspection Dashboard
        </button>

        <button
          className="btn btn-ghost"
          style={{ marginBottom: 8 }}
          disabled={!firstBoardId}
          onClick={() => nav(`/master/${firstBoardId}`)}
        >
          ⚙&nbsp;&nbsp;Upload Master Signatures
        </button>

        <button
          className="btn btn-ghost"
          style={{ borderColor: "var(--border)", color: "var(--text3)" }}
          onClick={() => nav("/debug")}
        >
          🔬&nbsp;&nbsp;Pipeline Debugger
        </button>

      </div>
    </div>
  );
}
