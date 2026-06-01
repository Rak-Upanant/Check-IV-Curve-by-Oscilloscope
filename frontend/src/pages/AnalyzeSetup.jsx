// pages/AnalyzeSetup.jsx — Analysis mode board + technician selection
// Single-board radio select → technician name → Start Analysis → TestFlow

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getBoards, createSession } from "../lib/api";
import toast from "react-hot-toast";

export default function AnalyzeSetup() {
  const nav = useNavigate();
  const [boardId, setBoardId] = useState("");
  const [tech,    setTech]    = useState("");

  const { data: boards, isLoading } = useQuery({
    queryKey: ["boards"],
    queryFn:  getBoards,
  });

  const mutation = useMutation({
    mutationFn: () => createSession({ board_id: boardId, technician: tech.trim() }),
    onSuccess:  (session) => nav(`/test/${session.session_id}`, { state: { mode: "analyze" } }),
    onError:    () => toast.error("Failed to create session"),
  });

  const canStart = boardId && tech.trim();

  return (
    <div className="page">
      {/* Top bar */}
      <div className="topbar">
        <button className="back-btn" onClick={() => nav("/")}>‹</button>
        <span style={{
          fontFamily: "var(--mono)", fontSize: 11,
          color: "var(--accent)", letterSpacing: 2,
        }}>▸ IV·SIG</span>
        <span className="topbar-title" style={{ flex: 1, textAlign: "right" }}>
          Start Analysis
        </span>
      </div>

      <div className="section" style={{ paddingTop: 20 }}>

        {/* ── Board selection (single) ─────────────────────── */}
        <div className="label" style={{ marginBottom: 10 }}>Select Board</div>

        {isLoading && (
          <div style={{ textAlign: "center", padding: 24, color: "var(--text3)",
            fontFamily: "var(--mono)", fontSize: 12 }}>Loading…</div>
        )}

        {boards?.map(b => {
          const active = boardId === b.board_id;
          return (
            <div
              key={b.board_id}
              onClick={() => setBoardId(b.board_id)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 16px", borderRadius: 8, cursor: "pointer",
                marginBottom: 8,
                border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                background: active ? "rgba(0,212,255,0.06)" : "var(--surface)",
                transition: "all 0.15s",
              }}
            >
              {/* Radio dot */}
              <div style={{
                width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                border: `2px solid ${active ? "var(--accent)" : "var(--border2)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}>
                {active && (
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: "var(--accent)",
                  }} />
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "var(--mono)", fontWeight: 600, fontSize: 13,
                  color: active ? "var(--accent)" : "var(--text)", marginBottom: 2,
                }}>
                  {b.board_name}
                </div>
                {b.description && (
                  <div style={{
                    fontSize: 11, color: "var(--text2)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {b.description}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* ── Technician name ───────────────────────────────── */}
        <div className="input-group" style={{ marginTop: 20 }}>
          <label>Technician Name</label>
          <input
            value={tech}
            onChange={e => setTech(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && canStart) mutation.mutate(); }}
            placeholder="Enter your name"
            autoComplete="name"
          />
        </div>

        {/* ── Start button ─────────────────────────────────── */}
        <button
          className="btn btn-primary mt-4"
          disabled={!canStart || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending
            ? <><div style={{
                width: 14, height: 14,
                border: "2px solid currentColor", borderTopColor: "transparent",
                borderRadius: "50%", animation: "spin 0.7s linear infinite",
              }} /> Starting…</>
            : "▶  Start Analysis"}
        </button>

      </div>
    </div>
  );
}
