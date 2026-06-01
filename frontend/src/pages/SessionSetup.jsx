// pages/SessionSetup.jsx
import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getBoards, createSession } from "../lib/api";
import toast from "react-hot-toast";

export default function SessionSetup() {
  const { boardId } = useParams();
  const nav = useNavigate();
  const [tech, setTech] = useState("");
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState("analyze"); // "analyze" | "collect"

  const { data: boards } = useQuery({ queryKey: ["boards"], queryFn: getBoards });
  const board = boards?.find(b => b.board_id === boardId);

  const mutation = useMutation({
    mutationFn: () => createSession({ board_id: boardId, technician: tech, notes }),
    onSuccess: (session) => {
      nav(`/test/${session.session_id}`, { state: { mode } });
    },
    onError: () => toast.error("Failed to create session"),
  });

  return (
    <div className="page">
      <div className="topbar">
        <button className="back-btn" onClick={() => nav("/")}>‹</button>
        <span className="topbar-title">New Test Session</span>
      </div>

      <div className="section" style={{ paddingTop: 24 }}>
        <div className="card" style={{ marginBottom: 24, background: "var(--bg3)" }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text3)", letterSpacing: 2, marginBottom: 4 }}>BOARD</div>
          <div style={{ fontFamily: "var(--mono)", fontWeight: 600, color: "var(--accent)" }}>
            {board?.board_name || "—"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>{board?.description}</div>
        </div>

        <div className="input-group">
          <label>Technician Name</label>
          <input
            value={tech}
            onChange={e => setTech(e.target.value)}
            placeholder="Enter your name"
            autoComplete="name"
          />
        </div>

        {/* Mode selector */}
        <div className="input-group">
          <label>Session Mode</label>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            {[
              { key: "analyze", label: "Analyze", desc: "Run full I-V comparison" },
              { key: "collect", label: "Collect Only", desc: "Upload images, skip analysis" },
            ].map(({ key, label, desc }) => (
              <div key={key}
                onClick={() => setMode(key)}
                style={{
                  flex: 1, padding: "12px", borderRadius: 8, cursor: "pointer",
                  border: `1px solid ${mode === key ? "var(--accent)" : "var(--border2)"}`,
                  background: mode === key ? "rgba(0,188,212,0.08)" : "var(--bg3)",
                  transition: "all 0.15s",
                }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600,
                  color: mode === key ? "var(--accent)" : "var(--text)", marginBottom: 4 }}>
                  {label}
                </div>
                <div style={{ fontSize: 11, color: "var(--text3)" }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="input-group">
          <label>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Board serial, remarks..."
            rows={3}
            style={{
              width: "100%", background: "var(--bg3)", border: "1px solid var(--border2)",
              borderRadius: 6, padding: "12px 14px",
              color: "var(--text)", fontFamily: "var(--mono)", fontSize: 13,
              outline: "none", resize: "vertical"
            }}
          />
        </div>

        <button
          className="btn btn-primary mt-4"
          disabled={!tech.trim() || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Starting..." : "▶  Start Testing"}
        </button>
      </div>
    </div>
  );
}
