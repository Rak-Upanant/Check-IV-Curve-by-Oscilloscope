// pages/TestFlow.jsx  — core testing workflow
import React, { useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { getSession, getTestPoints, analyzeImage, collectImage, completeSession } from "../lib/api";
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
  const location = useLocation();
  const collectOnly = location.state?.mode === "collect";  // passed from SessionSetup

  const [currentIdx, setCurrentIdx] = useState(0);
  const [results, setResults] = useState({});       // point_id -> result
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const fileRef = useRef();

  // Collect-only batch upload state
  const [batchActive,   setBatchActive]   = useState(false);
  const [batchTotal,    setBatchTotal]    = useState(0);
  const [batchDone,     setBatchDone]     = useState(0);
  const [batchNames,    setBatchNames]    = useState([]);   // filenames for display

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
    mutationFn: () => collectOnly
      ? collectImage(sessionId, currentPoint.point_id, file)
      : analyzeImage(sessionId, currentPoint.point_id, file),
    onSuccess: (res) => {
      if (collectOnly) {
        // Collect mode: auto-advance without showing result card
        setFile(null); setPreview(null);
        setCurrentIdx(i => i + 1);
      } else {
        setResults(prev => ({ ...prev, [currentPoint.point_id]: res }));
        setFile(null); setPreview(null);
      }
    },
    onError: () => toast.error(collectOnly ? "Upload failed — try again" : "Analysis failed — try again"),
  });

  const finishMutation = useMutation({
    mutationFn: () => completeSession(sessionId),
    onSuccess: () => nav(`/summary/${sessionId}`),
  });

  const onFileChange = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;

    if (collectOnly && files.length > 1) {
      // ── Batch collect: assign files to consecutive test points in order ──
      const startIdx = currentIdx;
      const toUpload = files.slice(0, points.length - startIdx);
      setBatchNames(toUpload.map(f => f.name));
      setBatchTotal(toUpload.length);
      setBatchDone(0);
      setBatchActive(true);
      let uploaded = 0;
      for (let i = 0; i < toUpload.length; i++) {
        const point = points[startIdx + i];
        try {
          await collectImage(sessionId, point.point_id, toUpload[i]);
          uploaded++;
          setBatchDone(uploaded);
        } catch {
          toast.error(`Upload failed: ${point.point_name}`);
        }
      }
      setCurrentIdx(startIdx + uploaded);
      setBatchActive(false);
      setBatchTotal(0);
      setBatchDone(0);
      setBatchNames([]);
    } else {
      // ── Single file: preview → confirm button ──
      const f = files[0];
      setFile(f);
      setPreview(URL.createObjectURL(f));
    }
  }, [collectOnly, currentIdx, points, sessionId]);

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
        <span className="topbar-title">{collectOnly ? "Collection Complete" : "All Points Done"}</span>
      </div>
      <div className="section" style={{ paddingTop: 40, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 16, color: "var(--ok)", marginBottom: 8 }}>
          {collectOnly
            ? `${points.length} images collected`
            : `All ${points.length} points tested`}
        </div>
        {!collectOnly && (
          <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 32 }}>
            {Object.values(results).filter(r => r.status === "ok").length} OK ·{" "}
            {Object.values(results).filter(r => r.status === "warning").length} Warning ·{" "}
            {Object.values(results).filter(r => r.status === "fault").length} Fault
          </div>
        )}
        {collectOnly && (
          <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 32, fontFamily: "var(--mono)" }}>
            Images stored — upload masters when ready to enable analysis
          </div>
        )}
        <button className="btn btn-primary" onClick={() => finishMutation.mutate()}
          disabled={finishMutation.isPending}>
          {finishMutation.isPending ? "Finishing..." : collectOnly ? "Done →" : "Generate Report →"}
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

        {/* Master reference — hidden in collect mode */}
        {!collectOnly && currentPoint?.master_signatures?.[0] && (
          <div style={{ marginBottom: 16 }}>
            <div className="label">Master Reference</div>
            <img
              src={currentPoint.master_signatures[0].image_url}
              alt="master"
              style={{ width: "100%", borderRadius: 6, border: "1px solid var(--border)", maxHeight: 160, objectFit: "contain", background: "#000" }}
            />
          </div>
        )}

        {/* Collect-mode batch info banner */}
        {collectOnly && !batchActive && !preview && (
          <div className="card" style={{ background: "var(--bg3)", marginBottom: 12,
            borderLeft: "3px solid var(--accent)", fontSize: 11,
            fontFamily: "var(--mono)", color: "var(--text2)", lineHeight: 1.7 }}>
            Select <strong style={{ color: "var(--accent)" }}>one or multiple</strong> images.
            Multiple files are automatically matched to test points in order
            starting from <strong style={{ color: "var(--text)" }}>{currentPoint?.point_name}</strong>.
          </div>
        )}

        {/* Batch upload progress */}
        {batchActive && (
          <div className="card" style={{ background: "var(--bg3)", marginBottom: 12 }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)",
              marginBottom: 10 }}>
              Uploading {batchDone}/{batchTotal}...
            </div>
            {/* Progress bar */}
            <div style={{ height: 4, background: "var(--border)", borderRadius: 2, marginBottom: 10 }}>
              <div style={{ height: "100%", borderRadius: 2, background: "var(--accent)",
                width: `${batchTotal ? (batchDone / batchTotal) * 100 : 0}%`,
                transition: "width 0.3s ease" }} />
            </div>
            {/* File list */}
            {batchNames.map((name, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8,
                fontSize: 11, fontFamily: "var(--mono)", color: "var(--text3)",
                marginBottom: 3 }}>
                <span style={{ color: i < batchDone ? "var(--ok)" : i === batchDone ? "var(--accent)" : "var(--text3)" }}>
                  {i < batchDone ? "✓" : i === batchDone ? "→" : "·"}
                </span>
                <span style={{ color: i < batchDone ? "var(--ok)" : "var(--text3)" }}>
                  {points?.[currentIdx - batchDone + batchDone + i]?.point_name ?? `Point ${i + 1}`}
                </span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: "nowrap", color: "var(--text3)" }}>— {name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Upload / preview */}
        {!currentResult && !batchActive && (
          <>
            <div className="label">
              {collectOnly ? "Select Image(s)" : "Captured Image"}
            </div>
            {preview ? (
              <div style={{ position: "relative", marginBottom: 12 }}>
                <img src={preview} alt="preview"
                  style={{ width: "100%", borderRadius: 6, border: "1px solid var(--border2)", maxHeight: 200, objectFit: "contain", background: "#000" }} />
                <div className="scan-line" style={{ top: 0 }} />
              </div>
            ) : (
              <div className="upload-zone" onClick={() => fileRef.current?.click()}>
                <div className="icon">{collectOnly ? "📂" : "📷"}</div>
                <p>{collectOnly
                  ? <>Tap to select image(s)<br /><span style={{ fontSize: 11, color: "var(--text3)" }}>Select all at once to batch-upload</span></>
                  : <>Tap to capture / select<br />oscilloscope screenshot</>
                }</p>
              </div>
            )}
            {/* collect mode: multiple allowed; analyze mode: camera capture */}
            {collectOnly
              ? <input ref={fileRef} type="file" accept="image/*" multiple
                  style={{ display: "none" }} onChange={onFileChange} />
              : <input ref={fileRef} type="file" accept="image/*" capture="environment"
                  style={{ display: "none" }} onChange={onFileChange} />
            }
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
        {batchActive ? (
          /* Batch in progress — no action needed */
          <div style={{ textAlign: "center", fontFamily: "var(--mono)", fontSize: 11,
            color: "var(--text3)" }}>
            Uploading batch — please wait…
          </div>
        ) : !currentResult ? (
          <button className="btn btn-primary"
            disabled={!file || analyzeMutation.isPending}
            onClick={() => analyzeMutation.mutate()}>
            {analyzeMutation.isPending
              ? <><div style={{ width: 16, height: 16, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> {collectOnly ? "Saving..." : "Analyzing..."}</>
              : collectOnly ? "▶  Save Image" : "▶  Analyze Curve"}
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
            {collectOnly ? "SAVING IMAGE..." : "ANALYZING CURVE..."}
          </div>
          <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)" }}>
            {collectOnly ? "Uploading to dataset" : "Skeletonization · DTW · Diagnosis"}
          </div>
        </div>
      )}
    </div>
  );
}
