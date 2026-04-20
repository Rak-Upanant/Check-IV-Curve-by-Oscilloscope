// pages/BoardSelect.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getBoards } from "../lib/api";

export default function BoardSelect() {
  const nav = useNavigate();
  const { data: boards, isLoading } = useQuery({ queryKey: ["boards"], queryFn: getBoards });

  return (
    <div className="page">
      <div className="topbar">
        <span className="topbar-logo">▸ IV·SIG</span>
        <span className="topbar-title">Select Board</span>
      </div>

      <div className="section" style={{ paddingTop: 28 }}>
        <div style={{
          background: "linear-gradient(135deg, #0d1421, #141b2d)",
          border: "1px solid #2a3650", borderRadius: 10, padding: "20px",
          marginBottom: 28, textAlign: "center"
        }}>
          <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--accent)", letterSpacing: 3, marginBottom: 6 }}>
            SIGNATURE ANALYSIS SYSTEM
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, color: "var(--text)", fontFamily: "var(--mono)" }}>
            I-V Curve Tester
          </div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 6 }}>
            Rohde &amp; Schwarz RTC1002 · IGBT Module
          </div>
        </div>

        <div className="label">Available Boards</div>

        {isLoading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text3)", fontFamily: "var(--mono)", fontSize: 12 }}>
            Loading...
          </div>
        ) : boards?.map(b => (
          <div key={b.board_id} className="card clickable" onClick={() => nav(`/session/${b.board_id}`)}>
            <div className="flex-between">
              <div>
                <div style={{ fontFamily: "var(--mono)", fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                  {b.board_name}
                </div>
                <div style={{ fontSize: 12, color: "var(--text2)" }}>{b.description}</div>
              </div>
              <span style={{ color: "var(--accent)", fontSize: 20 }}>›</span>
            </div>
          </div>
        ))}

        <div className="divider" />
        <button className="btn btn-ghost" onClick={() => nav(`/master/${boards?.[0]?.board_id}`)}>
          ⚙ Upload Master Signatures
        </button>
      </div>
    </div>
  );
}
