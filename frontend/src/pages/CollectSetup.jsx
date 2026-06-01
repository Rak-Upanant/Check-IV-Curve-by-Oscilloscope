// pages/CollectSetup.jsx — Create Report setup
// • Multi-select boards (checkboxes)
// • Tag NO as the inspection identifier (stored as session.technician)
// • Board Serial / Unit ID is entered per-board inside CollectFlow
// • Creates one session per selected board → navigates to multi-board CollectFlow

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getBoards, createSession } from "../lib/api";
import toast from "react-hot-toast";

export default function CollectSetup() {
  const nav = useNavigate();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [tagNo,       setTagNo]       = useState("");
  const [loading,     setLoading]     = useState(false);

  const { data: boards, isLoading } = useQuery({
    queryKey: ["boards"],
    queryFn:  getBoards,
  });

  const toggle = (boardId) =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(boardId) ? next.delete(boardId) : next.add(boardId);
      return next;
    });

  const canStart = selectedIds.size > 0 && tagNo.trim();

  const handleStart = async () => {
    if (!canStart || loading) return;
    setLoading(true);
    try {
      // Create one session per selected board in parallel
      const sessions = await Promise.all(
        [...selectedIds].map(boardId =>
          createSession({ board_id: boardId, technician: tagNo.trim() })
        )
      );
      const sessionIds = sessions.map(s => s.session_id).join(",");
      // replace: true removes /collect from browser history →
      // pressing Back from CollectFlow goes directly to Home, not back to setup
      nav(
        `/collect-flow?sessions=${sessionIds}&tag=${encodeURIComponent(tagNo.trim())}`,
        { replace: true }
      );
    } catch {
      toast.error("Failed to create inspection sessions");
      setLoading(false);
    }
  };

  return (
    <div className="page">
      {/* Top bar */}
      <div className="topbar">
        <button className="back-btn" onClick={() => nav("/")}>‹</button>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11,
          color: "var(--accent)", letterSpacing: 2 }}>▸ IV·SIG</span>
        <span className="topbar-title" style={{ flex: 1, textAlign: "right" }}>
          Create Report
        </span>
      </div>

      <div className="section" style={{ paddingTop: 20 }}>

        {/* Info */}
        <div className="card" style={{ background: "var(--bg3)", marginBottom: 24,
          borderLeft: "3px solid var(--accent)" }}>
          <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text2)",
            lineHeight: 1.7 }}>
            Select one or more board types to inspect. Each board's serial number
            is entered during collection. A PDF report is generated per board.
          </div>
        </div>

        {/* ── Tag NO ────────────────────────────────────────── */}
        <div className="input-group">
          <label>Tag NO</label>
          <input
            value={tagNo}
            onChange={e => setTagNo(e.target.value)}
            placeholder="e.g. INS-2025-001 / TAG-042"
            autoComplete="off"
          />
        </div>

        {/* ── Board selection ───────────────────────────────── */}
        <div className="label" style={{ marginBottom: 10 }}>Select Boards to Inspect</div>

        {isLoading && (
          <div style={{ textAlign: "center", padding: 20, color: "var(--text3)",
            fontFamily: "var(--mono)", fontSize: 12 }}>Loading…</div>
        )}

        {boards?.map(b => {
          const active = selectedIds.has(b.board_id);
          return (
            <div
              key={b.board_id}
              onClick={() => toggle(b.board_id)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 16px", borderRadius: 8, cursor: "pointer",
                marginBottom: 8,
                border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                background: active ? "rgba(0,212,255,0.06)" : "var(--surface)",
                transition: "all 0.15s",
              }}
            >
              {/* Checkbox */}
              <div style={{
                width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                border: `2px solid ${active ? "var(--accent)" : "var(--border2)"}`,
                background: active ? "var(--accent)" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}>
                {active && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L4 7L9 1" stroke="#000" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>

              {/* Board info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--mono)", fontWeight: 600, fontSize: 13,
                  color: active ? "var(--accent)" : "var(--text)", marginBottom: 2 }}>
                  {b.board_name}
                </div>
                {b.description && (
                  <div style={{ fontSize: 11, color: "var(--text2)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {b.description}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {selectedIds.size > 0 && (
          <div style={{ textAlign: "center", fontSize: 11, fontFamily: "var(--mono)",
            color: "var(--text3)", marginTop: 4, marginBottom: 8 }}>
            {selectedIds.size} board{selectedIds.size !== 1 ? "s" : ""} selected
          </div>
        )}

        {/* ── Start button ─────────────────────────────────── */}
        <button
          className="btn btn-primary mt-4"
          disabled={!canStart || loading}
          onClick={handleStart}
        >
          {loading
            ? <><div style={{ width: 14, height: 14, border: "2px solid currentColor",
                borderTopColor: "transparent", borderRadius: "50%",
                animation: "spin 0.7s linear infinite" }} /> Creating sessions…</>
            : `Begin Collection →  (${selectedIds.size} board${selectedIds.size !== 1 ? "s" : ""})`}
        </button>

      </div>
    </div>
  );
}
