// pages/SessionSummary.jsx
import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getSession, generateReport } from "../lib/api";
import toast from "react-hot-toast";

const STATUS_ICON = { ok: "✓", warning: "⚠", fault: "✕" };
const DIAG_TEXT = {
  normal: "Normal", cap_leakage: "Cap Leakage",
  diode_degradation: "Diode Degraded", shorted: "Shorted",
  open_circuit: "Open Circuit", degraded: "Degraded",
};

export default function SessionSummary() {
  const { sessionId } = useParams();
  const nav = useNavigate();
  const [pdfUrl, setPdfUrl] = useState(null);

  const { data: session } = useQuery({ queryKey: ["session", sessionId], queryFn: () => getSession(sessionId) });

  const reportMutation = useMutation({
    mutationFn: () => generateReport(sessionId),
    onSuccess: (data) => { setPdfUrl(data.pdf_url); toast.success("Report ready!"); },
    onError: () => toast.error("Report generation failed"),
  });

  const results = session?.test_results || [];
  const okCount      = results.filter(r => r.status === "ok").length;
  const warnCount    = results.filter(r => r.status === "warning").length;
  const faultCount   = results.filter(r => r.status === "fault").length;
  const overall      = faultCount === 0 ? "PASS" : "FAIL";

  return (
    <div className="page">
      <div className="topbar">
        <button className="back-btn" onClick={() => nav("/")}>‹</button>
        <span className="topbar-title">Session Summary</span>
      </div>

      <div className="section" style={{ paddingTop: 24 }}>
        {/* Overall verdict */}
        <div style={{
          background: overall === "PASS" ? "rgba(0,230,118,0.07)" : "rgba(255,61,61,0.07)",
          border: `1px solid ${overall === "PASS" ? "rgba(0,230,118,0.3)" : "rgba(255,61,61,0.3)"}`,
          borderRadius: 10, padding: "20px", textAlign: "center", marginBottom: 20
        }}>
          <div style={{ fontSize: 40, fontFamily: "var(--mono)", fontWeight: 700,
            color: overall === "PASS" ? "var(--ok)" : "var(--fault)" }}>
            {overall}
          </div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4, fontFamily: "var(--mono)" }}>
            {session?.boards?.board_name} · {session?.technician}
          </div>
        </div>

        {/* Stats */}
        <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 20 }}>
          {[["OK", okCount, "var(--ok)"], ["WARN", warnCount, "var(--warning)"], ["FAULT", faultCount, "var(--fault)"]].map(([label, val, color]) => (
            <div key={label} className="card" style={{ textAlign: "center", padding: "14px 8px" }}>
              <div style={{ fontSize: 24, fontFamily: "var(--mono)", fontWeight: 700, color }}>{val}</div>
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text3)", letterSpacing: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        <div className="label">Point-by-Point</div>
        {results
          .sort((a,b) => (a.test_points?.sort_order||0) - (b.test_points?.sort_order||0))
          .map(r => (
          <div key={r.result_id} className="card" style={{ padding: "12px 16px" }}>
            <div className="flex-between">
              <div>
                <div style={{ fontFamily: "var(--mono)", fontWeight: 600, color: "var(--text)" }}>
                  {r.test_points?.point_name}
                  <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: 8 }}>
                    {r.test_points?.component_type}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 3, fontFamily: "var(--mono)" }}>
                  {DIAG_TEXT[r.diagnosis] || r.diagnosis} · score {r.similarity_score?.toFixed(1)}
                </div>
              </div>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: r.status === "ok" ? "rgba(0,230,118,0.15)" : r.status === "warning" ? "rgba(255,179,0,0.15)" : "rgba(255,61,61,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: r.status === "ok" ? "var(--ok)" : r.status === "warning" ? "var(--warning)" : "var(--fault)",
                fontWeight: 700, fontSize: 16
              }}>
                {STATUS_ICON[r.status]}
              </div>
            </div>
          </div>
        ))}

        <div className="divider" />

        {pdfUrl ? (
          <a href={pdfUrl} target="_blank" rel="noreferrer"
            className="btn btn-success" style={{ display: "flex", textDecoration: "none" }}>
            ↓ Download PDF Report
          </a>
        ) : (
          <button className="btn btn-primary" onClick={() => reportMutation.mutate()}
            disabled={reportMutation.isPending}>
            {reportMutation.isPending ? "Generating PDF..." : "📄 Generate PDF Report"}
          </button>
        )}

        <button className="btn btn-ghost mt-2" onClick={() => nav("/")}>
          ← New Session
        </button>
      </div>
    </div>
  );
}
