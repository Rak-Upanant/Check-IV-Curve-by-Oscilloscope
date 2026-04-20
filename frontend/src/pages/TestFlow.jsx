// pages/TestFlow.jsx  — core testing workflow
import React, { useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getSession, getTestPoints, analyzeImage, completeSession } from "../lib/api";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import toast from "react-hot-toast";

const DIAG_LABELS = {
  normal:           { text: "Normal",           color: "var(--ok)" },
  cap_leakage:      { text: "Cap Leakage",      color: "var(--fault)" },
  diode_degradation:{ text: "Diode Degraded",   color: "var(--fault)" },
  shorted:          { text: "Shorted",           color: "var(--fault)" },
  open_circuit:     { text: "Open Circuit",      color: "var(--fault)" },
  degraded:         { text: "Degraded",          color: "var(--warning)" },
};

function ScoreRing({ score, status }) {
  const r = 36; const circ = 2 * Math.PI * r;
  const pct = score / 100;
  const color = status === "ok" ? "var(--ok)" : status === "warning" ? "var(--warning)" : "var(--fault)";
  return (
    <div className="score-ring">
      <svg width="90" height="90" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r={r} fill="none" stroke="var(--border)" strokeWidth="5" />
        <circle cx="45" cy="45" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${circ * pct} ${circ}`} strokeLinecap="round" />
      </svg>
      <div className="score-value">
        <span className="score-num" style={{ color }}>{score.toFixed(0)}</span>
        <span className="score-label">SCORE</span>
      </div>
    </div>
  );
}

function CurveChart({ masterV, masterI, testV, testI }) {
  const masterData = masterV.map((v, i) => ({ v, master: masterI[i] }));
  const testData   = testV.map((v, i) => ({ v, test: testI[i] }));
  // Merge by index
  const data = masterData.map((d, i) => ({ ...d, test: testData[i]?.test }));

  return (
    <div className="curve-compare">
      <div className="curve-legend">
        <div className="curve-legend-item">
          <div className="curve-legend-dot" style={{ background: "rgba(255,214,0,0.6)" }} />
          Master
        </div>
        <div className="curve-legend-item">
          <div className="curve-legend-dot" style={{ background: "var(--accent)" }} />
          Captured
        </div>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
          <XAxis dataKey="v" tick={{ fontSize: 9, fill: "var(--text3)", fontFamily: "var(--mono)" }}
            tickLine={false} axisLine={{ stroke: "var(--border)" }} />
          <YAxis tick={{ fontSize: 9, fill: "var(--text3)", fontFamily: "var(--mono)" }}
            tickLine={false} axisLine={{ stroke: "var(--border)" }} />
          <Tooltip
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11 }}
            labelFormatter={v => `V: ${Number(v).toFixed(1)}`}
            formatter={(val, name) => [val?.toFixed(2) + " mA", name]}
          />
          <Line dataKey="master" stroke="rgba(255,214,0,0.5)" dot={false} strokeWidth={2} />
          <Line dataKey="test"   stroke="var(--accent)"       dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function TestFlow() {
  const { sessionId } = useParams();
  const nav = useNavigate();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [results, setResults] = useState({});       // point_id -> result
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const fileRef = useRef();

  const { data: session } = useQuery({ queryKey: ["session", sessionId], queryFn: () => getSession(sessionId) });
  const { data: points }  = useQuery({
    queryKey: ["points", session?.board_id],
    queryFn:  () => getTestPoints(session.board_id),
    enabled:  !!session?.board_id,
  });

  const currentPoint = points?.[currentIdx];
  const currentResult = currentPoint ? results[currentPoint.point_id] : null;
  const allDone = points && currentIdx >= points.length;

  const analyzeMutation = useMutation({
    mutationFn: () => analyzeImage(sessionId, currentPoint.point_id, file),
    onSuccess: (res) => {
      setResults(prev => ({ ...prev, [currentPoint.point_id]: res }));
      setFile(null); setPreview(null);
    },
    onError: () => toast.error("Analysis failed — try again"),
  });

  const finishMutation = useMutation({
    mutationFn: () => completeSession(sessionId),
    onSuccess: () => nav(`/summary/${sessionId}`),
  });

  const onFileChange = useCallback((e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }, []);

  const handleNext = () => {
    setCurrentIdx(i => i + 1);
    setFile(null); setPreview(null);
  };

  if (!points) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "var(--text3)", fontFamily: "var(--mono)", fontSize: 13 }}>
      Loading session...
    </div>
  );

  if (allDone) return (
    <div className="page">
      <div className="topbar">
        <span className="topbar-logo">▸ IV·SIG</span>
        <span className="topbar-title">All Points Done</span>
      </div>
      <div className="section" style={{ paddingTop: 40, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 16, color: "var(--ok)", marginBottom: 8 }}>
          All {points.length} points tested
        </div>
        <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 32 }}>
          {Object.values(results).filter(r => r.status === "ok").length} OK ·{" "}
          {Object.values(results).filter(r => r.status === "warning").length} Warning ·{" "}
          {Object.values(results).filter(r => r.status === "fault").length} Fault
        </div>
        <button className="btn btn-primary" onClick={() => finishMutation.mutate()}
          disabled={finishMutation.isPending}>
          {finishMutation.isPending ? "Finishing..." : "Generate Report →"}
        </button>
      </div>
    </div>
  );

  const statusClass = currentResult?.status === "ok" ? "ok" : currentResult?.status === "warning" ? "warning" : currentResult ? "fault" : "active";

  return (
    <div className="page">
      {/* Topbar */}
      <div className="topbar">
        <button className="back-btn" onClick={() => nav("/")}>‹</button>
        <span className="topbar-title" style={{ flex: 1 }}>
          {currentPoint?.point_name} · {currentPoint?.component_type}
        </span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>
          {currentIdx + 1}/{points.length}
        </span>
      </div>

      {/* Progress stepper */}
      <div className="stepper">
        {points.map((p, i) => {
          const r = results[p.point_id];
          const cls = i < currentIdx
            ? (r?.status === "fault" ? "fault" : r?.status === "warning" ? "warning" : "done")
            : i === currentIdx ? "active" : "";
          return <div key={p.point_id} className={`step ${cls}`} />;
        })}
      </div>

      <div className="section osc-bg" style={{ position: "relative", flex: 1 }}>

        {/* Point info */}
        <div className="card" style={{ background: "var(--bg2)", marginBottom: 16 }}>
          <div className="flex-between">
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 600, color: "var(--yellow)" }}>
                {currentPoint?.point_name}
              </div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>
                {currentPoint?.component_type} · {currentPoint?.description}
              </div>
            </div>
            {currentResult && <ScoreRing score={currentResult.similarity_score} status={currentResult.status} />}
          </div>
        </div>

        {/* Master reference */}
        {currentPoint?.master_signatures?.[0] && (
          <div style={{ marginBottom: 16 }}>
            <div className="label">Master Reference</div>
            <img
              src={currentPoint.master_signatures[0].image_url}
              alt="master"
              style={{ width: "100%", borderRadius: 6, border: "1px solid var(--border)", maxHeight: 160, objectFit: "contain", background: "#000" }}
            />
          </div>
        )}

        {/* Upload / preview */}
        {!currentResult && (
          <>
            <div className="label">Captured Image</div>
            {preview ? (
              <div style={{ position: "relative", marginBottom: 12 }}>
                <img src={preview} alt="preview"
                  style={{ width: "100%", borderRadius: 6, border: "1px solid var(--border2)", maxHeight: 200, objectFit: "contain", background: "#000" }} />
                <div className="scan-line" style={{ top: 0 }} />
              </div>
            ) : (
              <div className="upload-zone" onClick={() => fileRef.current?.click()}>
                <div className="icon">📷</div>
                <p>Tap to capture / select<br />oscilloscope screenshot</p>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment"
              style={{ display: "none" }} onChange={onFileChange} />
          </>
        )}

        {/* Result */}
        {currentResult && (
          <div className="fade-in-up">
            <div className="flex-between mb-2">
              <div className="label" style={{ margin: 0 }}>Analysis Result</div>
              <span className={`badge badge-${currentResult.status}`}>
                {currentResult.status.toUpperCase()}
              </span>
            </div>

            <div className="grid-2" style={{ marginBottom: 12 }}>
              <div className="card" style={{ padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text3)", marginBottom: 4 }}>SHAPE</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)" }}>
                  {currentResult.shape_type}
                </div>
              </div>
              <div className="card" style={{ padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text3)", marginBottom: 4 }}>DIAGNOSIS</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 11,
                  color: DIAG_LABELS[currentResult.diagnosis]?.color || "var(--text)" }}>
                  {DIAG_LABELS[currentResult.diagnosis]?.text || currentResult.diagnosis}
                </div>
              </div>
            </div>

            {currentResult.master_v && currentResult.v_data && (
              <CurveChart
                masterV={currentResult.master_v} masterI={currentResult.master_i}
                testV={currentResult.v_data}    testI={currentResult.i_data}
              />
            )}
          </div>
        )}
      </div>

      {/* Bottom action */}
      <div style={{ padding: "16px 20px", background: "var(--bg2)", borderTop: "1px solid var(--border)" }}>
        {!currentResult ? (
          <button className="btn btn-primary"
            disabled={!file || analyzeMutation.isPending}
            onClick={() => analyzeMutation.mutate()}>
            {analyzeMutation.isPending
              ? <><div style={{ width: 16, height: 16, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> Analyzing...</>
              : "▶  Analyze Curve"}
          </button>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }}
              onClick={() => { setResults(p => { const n={...p}; delete n[currentPoint.point_id]; return n; }); }}>
              Retake
            </button>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleNext}>
              Next Point ›
            </button>
          </div>
        )}
      </div>

      {/* Processing overlay */}
      {analyzeMutation.isPending && (
        <div className="processing-overlay">
          <div className="processing-circle" />
          <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)", letterSpacing: 2 }}>
            ANALYZING CURVE...
          </div>
          <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)" }}>
            Skeletonization · DTW · Diagnosis
          </div>
        </div>
      )}
    </div>
  );
}
