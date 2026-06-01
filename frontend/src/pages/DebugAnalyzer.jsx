// pages/DebugAnalyzer.jsx — Pipeline step-by-step debug visualizer
import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, ResponsiveContainer, Tooltip, Legend,
} from "recharts";
import { getBoards, getTestPoints, debugAnalyze } from "../lib/api";
import toast from "react-hot-toast";

// ── Status colour helpers ────────────────────────────────────
const STATUS_COLOR = {
  ok:      "var(--ok)",
  warning: "var(--warning)",
  fault:   "var(--fault)",
};
const STEP_ACCENT = [
  "#00d4ff","#00e676","#ffd600","#ff9800",
  "#e040fb","#40c4ff","#69f0ae","#ff6d00","#b2ff59","#ff4081",
];

// ── Small chart components ───────────────────────────────────
function ScatterPlot({ v, i }) {
  const data = v.map((vv, idx) => ({ v: vv, i: i[idx] }));
  return (
    <ResponsiveContainer width="100%" height={140}>
      <ScatterChart margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
        <XAxis dataKey="v" type="number" name="V"
          tick={{ fontSize: 9, fill: "var(--text3)", fontFamily: "var(--mono)" }}
          tickLine={false} axisLine={{ stroke: "var(--border)" }} />
        <YAxis dataKey="i" type="number" name="I"
          tick={{ fontSize: 9, fill: "var(--text3)", fontFamily: "var(--mono)" }}
          tickLine={false} axisLine={{ stroke: "var(--border)" }} />
        <Tooltip
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 10 }}
          formatter={(val, name) => [Number(val).toFixed(3), name]}
        />
        <Scatter data={data} fill="var(--yellow)" opacity={0.7} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function LinePlot({ v, i, color = "var(--accent)" }) {
  const data = v.map((vv, idx) => ({ v: vv, i: i[idx] }));
  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
        <XAxis dataKey="v"
          tick={{ fontSize: 9, fill: "var(--text3)", fontFamily: "var(--mono)" }}
          tickLine={false} axisLine={{ stroke: "var(--border)" }} />
        <YAxis
          tick={{ fontSize: 9, fill: "var(--text3)", fontFamily: "var(--mono)" }}
          tickLine={false} axisLine={{ stroke: "var(--border)" }} />
        <Tooltip
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 10 }}
          formatter={val => [Number(val).toFixed(3), "I"]}
          labelFormatter={v => `V: ${Number(v).toFixed(2)}`}
        />
        <Line dataKey="i" stroke={color} dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ComparisonPlot({ master_v, master_i, test_v, test_i }) {
  const data = master_v.map((vv, idx) => ({
    v:      vv,
    master: master_i[idx],
    test:   test_i[idx],
  }));
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
        <XAxis dataKey="v"
          tick={{ fontSize: 9, fill: "var(--text3)", fontFamily: "var(--mono)" }}
          tickLine={false} axisLine={{ stroke: "var(--border)" }} />
        <YAxis
          tick={{ fontSize: 9, fill: "var(--text3)", fontFamily: "var(--mono)" }}
          tickLine={false} axisLine={{ stroke: "var(--border)" }} />
        <Tooltip
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 10 }}
          formatter={(val, name) => [Number(val).toFixed(3), name]}
          labelFormatter={v => `V: ${Number(v).toFixed(2)}`}
        />
        <Legend wrapperStyle={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text2)" }} />
        <Line dataKey="master" stroke="rgba(255,214,0,0.7)" dot={false} strokeWidth={2} />
        <Line dataKey="test"   stroke="var(--accent)"       dot={false} strokeWidth={2} strokeDasharray="4 2" />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Feature table ────────────────────────────────────────────
function FeatureTable({ features }) {
  const SHAPE_COLOR = {
    diode:            "var(--ok)",
    resistive:        "var(--warning)",
    capacitive_loop:  "var(--fault)",
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
      {Object.entries(features).map(([k, v]) => (
        <div key={k} style={{
          background: "var(--bg2)", border: "1px solid var(--border)",
          borderRadius: 6, padding: "8px 10px",
        }}>
          <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--text3)",
            letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 3 }}>{k}</div>
          <div style={{
            fontFamily: "var(--mono)", fontSize: 12,
            color: k === "shape_type" ? (SHAPE_COLOR[v] || "var(--accent)") : "var(--text)",
            fontWeight: k === "shape_type" ? 600 : 400,
          }}>
            {typeof v === "number" ? v.toFixed(4) : String(v)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Single step card ─────────────────────────────────────────
function StepCard({ step, index }) {
  const [expanded, setExpanded] = useState(true);
  const accent = STEP_ACCENT[index % STEP_ACCENT.length];
  const isComparison = step.chart?.type === "comparison";

  return (
    <div style={{
      background: "var(--surface)", border: `1px solid var(--border)`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: 8, marginBottom: 10, overflow: "hidden",
    }}>
      {/* Header — tap to collapse */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 14px", cursor: "pointer",
          background: expanded ? "rgba(0,0,0,0.15)" : "transparent",
        }}
      >
        {/* Step number badge */}
        <div style={{
          width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
          background: accent, display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, color: "#000",
        }}>{index + 1}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600,
            color: "var(--text)", marginBottom: 2 }}>{step.name}</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {step.desc}
          </div>
        </div>

        {/* Score badge for comparison step */}
        {step.score !== undefined && (
          <span style={{
            fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700,
            color: STATUS_COLOR[step.status] || "var(--text)",
            background: `${STATUS_COLOR[step.status]}18`,
            border: `1px solid ${STATUS_COLOR[step.status]}40`,
            borderRadius: 12, padding: "2px 8px", flexShrink: 0,
          }}>{step.score}%</span>
        )}

        <span style={{ color: "var(--text3)", fontSize: 12, flexShrink: 0 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {/* Body */}
      {expanded && (
        <div style={{ padding: "0 14px 14px" }}>

          {/* Full description (wrapping) */}
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text2)",
            marginBottom: 10, lineHeight: 1.6, paddingTop: 4 }}>
            {step.desc}
          </div>

          {/* Images (1 or 2) */}
          {step.images?.map((img, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--text3)",
                letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>
                {img.label}
              </div>
              <img
                src={`data:image/png;base64,${img.b64}`}
                alt={img.label}
                style={{
                  width: "100%", display: "block", borderRadius: 4,
                  border: "1px solid var(--border)",
                  background: "#000", imageRendering: "pixelated",
                }}
              />
            </div>
          ))}

          {/* Charts */}
          {step.chart && (() => {
            const c = step.chart;
            const chartBg = {
              background: "var(--bg3)", border: "1px solid var(--border)",
              borderRadius: 6, padding: "8px 4px", marginTop: 4,
            };
            if (c.type === "scatter")
              return (
                <div style={chartBg}>
                  <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--text3)",
                    letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4, paddingLeft: 8 }}>
                    Raw extracted points (V vs I)
                  </div>
                  <ScatterPlot v={c.v} i={c.i} />
                </div>
              );
            if (c.type === "line")
              return (
                <div style={chartBg}>
                  <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--text3)",
                    letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4, paddingLeft: 8 }}>
                    Resampled I-V curve
                  </div>
                  <LinePlot v={c.v} i={c.i} />
                </div>
              );
            if (c.type === "comparison")
              return (
                <div style={chartBg}>
                  {/* Legend */}
                  <div style={{ display: "flex", gap: 16, paddingLeft: 8, marginBottom: 4 }}>
                    {[
                      { color: "rgba(255,214,0,0.7)", label: "Master" },
                      { color: "var(--accent)",        label: "Test (dashed)" },
                    ].map(({ color, label }) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", gap: 6,
                        fontSize: 10, fontFamily: "var(--mono)", color: "var(--text2)" }}>
                        <div style={{ width: 20, height: 2, background: color, borderRadius: 1 }} />
                        {label}
                      </div>
                    ))}
                  </div>
                  <ComparisonPlot {...c} />
                  {/* Diagnosis row */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap",
                    padding: "8px 8px 0", borderTop: "1px solid var(--border)", marginTop: 4 }}>
                    {[
                      ["Score",    `${step.score}%`],
                      ["Shape",    step.shape],
                      ["Expected", step.expected],
                      ["Status",   step.status?.toUpperCase()],
                      ["Diagnosis",step.diagnosis],
                    ].map(([label, val]) => (
                      <div key={label} style={{
                        background: "var(--bg2)", borderRadius: 4, padding: "4px 8px", flex: "0 0 auto",
                      }}>
                        <div style={{ fontSize: 8, fontFamily: "var(--mono)", color: "var(--text3)",
                          letterSpacing: 1.5, textTransform: "uppercase" }}>{label}</div>
                        <div style={{
                          fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600,
                          color: label === "Status" ? STATUS_COLOR[step.status] : "var(--text)",
                        }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            return null;
          })()}

          {/* Features table */}
          {step.features && <FeatureTable features={step.features} />}
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────
export default function DebugAnalyzer() {
  const nav      = useNavigate();
  const fileRef  = useRef();
  const [file,    setFile]    = useState(null);
  const [preview, setPreview] = useState(null);
  const [boardId, setBoardId] = useState("");
  const [pointId, setPointId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);   // { steps, error }

  const { data: boards } = useQuery({ queryKey: ["boards"], queryFn: () =>
    import("../lib/api").then(m => m.getBoards()) });
  const { data: points } = useQuery({
    queryKey: ["points", boardId],
    queryFn: () => import("../lib/api").then(m => m.getTestPoints(boardId)),
    enabled: !!boardId,
  });

  const handleFile = (f) => {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
  };

  const handleRun = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await debugAnalyze(file, pointId || null);
      setResult(res);
    } catch (e) {
      toast.error("Debug analysis failed");
      setResult({ steps: [], error: e?.response?.data?.detail || e.message });
    } finally {
      setLoading(false);
    }
  };

  const totalSteps = result?.steps?.length ?? 0;

  return (
    <div className="page">
      {/* Top bar */}
      <div className="topbar">
        <button className="back-btn" onClick={() => nav("/")}>‹</button>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)",
          letterSpacing: 2, textTransform: "uppercase" }}>▸ IV·SIG</span>
        <span className="topbar-title" style={{ flex: 1, textAlign: "right" }}>
          Pipeline Debugger
        </span>
      </div>

      <div className="section" style={{ paddingTop: 20 }}>

        {/* Info banner */}
        <div className="card" style={{ background: "var(--bg3)", marginBottom: 16,
          borderLeft: "3px solid var(--accent)" }}>
          <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text2)", lineHeight: 1.7 }}>
            Upload an oscilloscope image to inspect each step of the analysis pipeline.
            Select a master test point to also run similarity comparison.
          </div>
        </div>

        {/* File upload */}
        <div className="label">Test Image</div>
        {preview ? (
          <div style={{ position: "relative", marginBottom: 12 }}>
            <img src={preview} alt="preview"
              style={{ width: "100%", borderRadius: 6, border: "1px solid var(--border2)",
                maxHeight: 160, objectFit: "contain", background: "#000" }} />
            <button
              onClick={() => { setFile(null); setPreview(null); setResult(null); }}
              style={{
                position: "absolute", top: 8, right: 8, background: "rgba(8,12,20,0.8)",
                border: "1px solid var(--border2)", borderRadius: 4, color: "var(--text2)",
                cursor: "pointer", padding: "3px 10px", fontSize: 11, fontFamily: "var(--mono)",
              }}>✕ clear</button>
          </div>
        ) : (
          <div className="upload-zone" onClick={() => fileRef.current?.click()}
            style={{ marginBottom: 12 }}>
            <div className="icon">🔬</div>
            <p>Tap to select oscilloscope image</p>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />

        {/* Optional master comparison */}
        <div className="label" style={{ marginTop: 8 }}>Compare with Master (optional)</div>
        <div className="input-group">
          <select value={boardId}
            onChange={e => { setBoardId(e.target.value); setPointId(""); }}>
            <option value="">— Select board —</option>
            {boards?.map(b =>
              <option key={b.board_id} value={b.board_id}>{b.board_name}</option>)}
          </select>
        </div>
        {boardId && (
          <div className="input-group">
            <select value={pointId} onChange={e => setPointId(e.target.value)}>
              <option value="">— Select test point —</option>
              {points?.map(p =>
                <option key={p.point_id} value={p.point_id}>
                  {p.point_name}  ({p.component_type})
                </option>)}
            </select>
          </div>
        )}

        <button className="btn btn-primary" disabled={!file || loading} onClick={handleRun}>
          {loading ? (
            <><div style={{ width: 16, height: 16, border: "2px solid currentColor",
              borderTopColor: "transparent", borderRadius: "50%",
              animation: "spin 0.7s linear infinite" }} />
              Running pipeline...</>
          ) : `▶  Run Debug Analysis${pointId ? " + Comparison" : ""}`}
        </button>
      </div>

      {/* Error */}
      {result?.error && (
        <div className="section" style={{ paddingTop: 0 }}>
          <div style={{ background: "rgba(255,61,61,0.08)", border: "1px solid rgba(255,61,61,0.25)",
            borderRadius: 8, padding: 14, fontFamily: "var(--mono)", fontSize: 12, color: "var(--fault)" }}>
            {result.error}
          </div>
        </div>
      )}

      {/* Steps */}
      {result?.steps?.length > 0 && (
        <div className="section" style={{ paddingTop: 0 }}>
          <div className="label">{totalSteps} pipeline steps  ·  tap any step to collapse</div>
          {result.steps.map((step, idx) =>
            <StepCard key={idx} step={step} index={idx} />)}
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="processing-overlay">
          <div className="processing-circle" />
          <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)", letterSpacing: 2 }}>
            RUNNING PIPELINE...
          </div>
          <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)", textAlign: "center" }}>
            Crop → HSV → Morph → Skel → I-V → DTW
          </div>
        </div>
      )}
    </div>
  );
}
