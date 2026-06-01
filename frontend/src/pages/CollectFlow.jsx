// pages/CollectFlow.jsx — Multi-board one-page image collector
//
// URL: /collect-flow?sessions=id1,id2,id3&tag=TAG-001
//
// Collect-only mode: upload oscilloscope photos for each test point.
// PDF generation is done from the Inspection Dashboard, not here.

import React, { useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  getSession, getTestPoints,
  collectImage,
} from "../lib/api";
import toast from "react-hot-toast";

// ── Component type badge colours ─────────────────────────────
const TYPE_COLOR = {
  diode:           "var(--accent)",
  capacitive_loop: "var(--warning)",
  resistive:       "var(--ok)",
};

// ── Status key for pointStatus map ───────────────────────────
const sk = (sessionId, pointId) => `${sessionId}::${pointId}`;

// ── Single test-point row ─────────────────────────────────────
function PointRow({ point, status, onUpload }) {
  const { state, imageUrl, fileName } = status ?? {};
  const uploaded  = state === "uploaded";
  const uploading = state === "uploading";
  const errored   = state === "error";

  return (
    <div style={{
      padding: "12px 0",
      borderBottom: "1px solid var(--border)",
    }}>
      {/* Top row: status + name + button */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>

        {/* Status dot */}
        <div style={{
          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
          background: uploaded ? "var(--ok)"
            : errored   ? "var(--fault)"
            : uploading ? "var(--accent)"
            : "var(--border2)",
          boxShadow: uploading ? "0 0 0 3px rgba(0,212,255,0.2)" : undefined,
        }} />

        {/* Name + type */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{
              fontFamily: "var(--mono)", fontWeight: 600, fontSize: 13,
              color: uploaded ? "var(--ok)" : "var(--text)",
            }}>
              {point.point_name}
            </span>
            <span style={{
              fontSize: 9, fontFamily: "var(--mono)", letterSpacing: 1.5,
              textTransform: "uppercase",
              color: TYPE_COLOR[point.component_type] ?? "var(--text3)",
            }}>
              {point.component_type}
            </span>
          </div>

          {point.description && !uploaded && (
            <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 1 }}>
              {point.description}
            </div>
          )}

          {uploaded && fileName && (
            <div style={{
              fontSize: 10, color: "var(--ok)", fontFamily: "var(--mono)", marginTop: 1,
              maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>✓ {fileName}</div>
          )}
          {errored && (
            <div style={{ fontSize: 10, color: "var(--fault)", fontFamily: "var(--mono)", marginTop: 1 }}>
              Upload failed
            </div>
          )}
        </div>

        {/* Action button */}
        <button
          className={`btn ${uploaded ? "btn-ghost" : "btn-primary"}`}
          style={{ width: "auto", padding: "7px 14px", fontSize: 11, minWidth: 74, flexShrink: 0 }}
          disabled={uploading}
          onClick={onUpload}
        >
          {uploading
            ? <div style={{ width: 12, height: 12, border: "2px solid currentColor",
                borderTopColor: "transparent", borderRadius: "50%",
                animation: "spin 0.7s linear infinite" }} />
            : uploaded ? "Replace" : errored ? "Retry" : "Upload"}
        </button>
      </div>

      {/* Thumbnail */}
      {uploaded && imageUrl && (
        <img
          src={imageUrl} alt={point.point_name}
          style={{
            width: "100%", display: "block", marginTop: 8,
            borderRadius: 4, maxHeight: 100,
            objectFit: "contain", background: "#000",
            border: "1px solid var(--border)",
          }}
        />
      )}
    </div>
  );
}

const BOARD_TYPES = ["AGDR-71C", "AGDR-76C"];

// ── Board accordion section ───────────────────────────────────
function BoardSection({
  session, points, pointStatus, serial, boardType,
  onSerialChange, onBoardTypeChange, onUpload, expanded, onToggle,
}) {
  const uploaded = points.filter(
    p => pointStatus[sk(session.session_id, p.point_id)]?.state === "uploaded"
  ).length;
  const total   = points.length;
  const allDone = uploaded === total && total > 0;

  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: 10,
      marginBottom: 12, overflow: "hidden",
    }}>
      {/* Section header */}
      <div
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 16px", cursor: "pointer",
          background: allDone ? "rgba(0,230,118,0.04)" : "var(--surface)",
        }}
      >
        {/* Board name */}
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: "var(--mono)", fontWeight: 600, fontSize: 13,
            color: allDone ? "var(--ok)" : "var(--accent)",
            marginBottom: 6,
          }}>
            {session.boards?.board_name ?? "…"}
          </div>

          {/* Progress bar */}
          <div style={{ height: 3, background: "var(--border)", borderRadius: 2 }}>
            <div style={{
              height: "100%", borderRadius: 2,
              background: allDone ? "var(--ok)" : "var(--accent)",
              width: `${total ? (uploaded / total) * 100 : 0}%`,
              transition: "width 0.4s ease",
            }} />
          </div>
        </div>

        {/* Counter */}
        <span style={{
          fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600,
          color: allDone ? "var(--ok)" : "var(--text2)",
          flexShrink: 0,
        }}>
          {uploaded}/{total} {allDone && "✓"}
        </span>

        {/* Chevron */}
        <span style={{
          color: "var(--text3)", fontSize: 14, flexShrink: 0,
          transform: expanded ? "rotate(180deg)" : "none",
          transition: "transform 0.2s",
        }}>▼</span>
      </div>

      {/* Expandable body */}
      {expanded && (
        <div style={{ padding: "0 16px 16px", background: "var(--bg2)" }}>

          {/* Board Serial / Unit ID */}
          <div style={{ paddingTop: 14, marginBottom: 10 }}>
            <div className="label" style={{ marginBottom: 5 }}>Board Serial / Unit ID</div>
            <input
              value={serial}
              onChange={e => onSerialChange(e.target.value)}
              placeholder="e.g. SN-00142"
              style={{
                width: "100%", background: "var(--bg3)",
                border: "1px solid var(--border2)", borderRadius: 6,
                padding: "9px 12px", color: "var(--text)",
                fontFamily: "var(--mono)", fontSize: 12, outline: "none",
              }}
            />
          </div>

          {/* Type */}
          <div style={{ marginBottom: 12 }}>
            <div className="label" style={{ marginBottom: 5 }}>Type</div>
            <div style={{ display: "flex", gap: 8 }}>
              {BOARD_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => onBoardTypeChange(boardType === t ? "" : t)}
                  style={{
                    flex: 1, padding: "9px 0", borderRadius: 6, cursor: "pointer",
                    fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600,
                    border: `1px solid ${boardType === t ? "var(--accent)" : "var(--border2)"}`,
                    background: boardType === t ? "rgba(0,212,255,0.1)" : "var(--bg3)",
                    color: boardType === t ? "var(--accent)" : "var(--text2)",
                    transition: "all 0.15s",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)", marginTop: 4 }}>
              Storage: collected/{session.technician}/{session.boards?.board_name}/
              {boardType || "—"}/{serial || "no-sn"}/…
            </div>
          </div>

          {/* Test points */}
          {points.map(pt => (
            <PointRow
              key={pt.point_id}
              point={pt}
              status={pointStatus[sk(session.session_id, pt.point_id)]}
              onUpload={() => onUpload(session.session_id, pt.point_id)}
            />
          ))}

          {allDone && (
            <div style={{
              marginTop: 14, padding: "10px 12px", borderRadius: 6,
              background: "rgba(0,230,118,0.06)", border: "1px solid rgba(0,230,118,0.2)",
              fontFamily: "var(--mono)", fontSize: 11, color: "var(--ok)",
            }}>
              ✓ All points uploaded — view PDF from Inspection Dashboard
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function CollectFlow() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionIds = (searchParams.get("sessions") ?? "").split(",").filter(Boolean);
  const tagNo      = searchParams.get("tag") ?? "";

  // Upload state: { "sessionId::pointId": { state, imageUrl, fileName } }
  const [pointStatus, setPointStatus] = useState({});

  // Serial per session: { [sessionId]: "SN-00142" }
  const [serials, setSerials] = useState({});

  // Board type per session: { [sessionId]: "AGDR-71C" | "AGDR-76C" | "" }
  const [boardTypes, setBoardTypes] = useState({});

  // Which board sections are expanded (all by default)
  const [collapsed, setCollapsed] = useState(new Set());

  // Batch progress
  const [batchActive,   setBatchActive]   = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });

  // File input refs
  const singleRef      = useRef();
  const batchRef       = useRef();
  const pendingRef     = useRef(null); // { sessionId, pointId }

  // ── Load all sessions + their test points ─────────────────
  const { data: allData, isLoading } = useQuery({
    queryKey: ["multiCollect", ...sessionIds],
    queryFn: async () => {
      const sessions = await Promise.all(sessionIds.map(id => getSession(id)));
      const points   = await Promise.all(sessions.map(s => getTestPoints(s.board_id)));
      return sessions.map((session, i) => ({ session, points: points[i] ?? [] }));
    },
    enabled: sessionIds.length > 0,
  });

  // ── Derived counts ────────────────────────────────────────
  const uploadedTotal = Object.values(pointStatus).filter(s => s?.state === "uploaded").length;
  const totalAll = allData?.reduce((n, { points }) => n + points.length, 0) ?? 0;

  // Flat list of all uncollected points (for batch upload)
  const allUncollected = (allData ?? []).flatMap(({ session, points }) =>
    points
      .filter(p => pointStatus[sk(session.session_id, p.point_id)]?.state !== "uploaded")
      .map(p => ({ sessionId: session.session_id, pointId: p.point_id }))
  );

  // ── Core upload ───────────────────────────────────────────
  const uploadToPoint = async (sessionId, pointId, file) => {
    const key = sk(sessionId, pointId);
    setPointStatus(prev => ({ ...prev, [key]: { state: "uploading" } }));
    try {
      const sn   = serials[sessionId] ?? "";
      const type = boardTypes[sessionId] ?? "";
      // Combine type + serial so storage path captures both: AGDR-71C_SN-001
      const serial = type && sn ? `${type}_${sn}` : type || sn;
      const result = await collectImage(sessionId, pointId, file, serial);
      setPointStatus(prev => ({
        ...prev,
        [key]: { state: "uploaded", imageUrl: result.image_url, fileName: file.name },
      }));
    } catch {
      setPointStatus(prev => ({ ...prev, [key]: { state: "error" } }));
      toast.error("Upload failed");
    }
  };

  // ── Single file handler ───────────────────────────────────
  const onSingleChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !pendingRef.current) return;
    const { sessionId, pointId } = pendingRef.current;
    pendingRef.current = null;
    await uploadToPoint(sessionId, pointId, file);
  };

  const handlePointUpload = (sessionId, pointId) => {
    pendingRef.current = { sessionId, pointId };
    singleRef.current?.click();
  };

  // ── Batch handler ─────────────────────────────────────────
  const onBatchChange = async (e) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;

    const targets = allUncollected.slice(0, files.length);
    setBatchActive(true);
    setBatchProgress({ done: 0, total: targets.length });

    for (let i = 0; i < targets.length; i++) {
      await uploadToPoint(targets[i].sessionId, targets[i].pointId, files[i]);
      setBatchProgress({ done: i + 1, total: targets.length });
    }
    setBatchActive(false);
    setBatchProgress({ done: 0, total: 0 });
  };

  // ── Loading ───────────────────────────────────────────────
  if (isLoading || !allData) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", color: "var(--text3)", fontFamily: "var(--mono)", fontSize: 13,
      }}>
        Loading…
      </div>
    );
  }

  const allDoneGlobal = uploadedTotal === totalAll && totalAll > 0;

  return (
    <div className="page">

      {/* ── Top bar ─────────────────────────────────────────── */}
      <div className="topbar">
        <button className="back-btn" onClick={() => nav("/")}>‹</button>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11,
          color: "var(--accent)", letterSpacing: 2 }}>▸ IV·SIG</span>
        <span className="topbar-title" style={{ flex: 1, textAlign: "right" }}>
          Collection
        </span>
        <span style={{
          fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, marginLeft: 10,
          color: allDoneGlobal ? "var(--ok)" : "var(--text2)", flexShrink: 0,
        }}>
          {uploadedTotal}/{totalAll} {allDoneGlobal && "✓"}
        </span>
      </div>

      <div className="section" style={{ paddingTop: 16 }}>

        {/* ── Inspection header ─────────────────────────────── */}
        <div className="card" style={{ background: "var(--bg3)", marginBottom: 16 }}>
          <div className="flex-between" style={{ marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text3)",
                letterSpacing: 2, textTransform: "uppercase", marginBottom: 3 }}>
                Tag NO
              </div>
              <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 16,
                color: "var(--text)" }}>
                {tagNo || "—"}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text3)",
                marginBottom: 3 }}>
                {allData.length} board{allData.length !== 1 ? "s" : ""}
              </div>
              <div style={{ fontSize: 12, fontFamily: "var(--mono)",
                color: allDoneGlobal ? "var(--ok)" : "var(--text2)" }}>
                {allUncollected.length} point{allUncollected.length !== 1 ? "s" : ""} remaining
              </div>
            </div>
          </div>

          {/* Overall progress bar */}
          <div style={{ height: 4, background: "var(--border)", borderRadius: 2 }}>
            <div style={{
              height: "100%", borderRadius: 2,
              background: allDoneGlobal ? "var(--ok)" : "var(--accent)",
              width: `${totalAll ? (uploadedTotal / totalAll) * 100 : 0}%`,
              transition: "width 0.4s ease",
            }} />
          </div>
        </div>

        {/* ── Batch upload ──────────────────────────────────── */}
        {!allDoneGlobal && (
          <>
            <button
              className="btn btn-ghost"
              style={{
                marginBottom: batchActive ? 6 : 16,
                borderColor: "var(--accent)", color: "var(--accent)",
              }}
              disabled={batchActive || allUncollected.length === 0}
              onClick={() => batchRef.current?.click()}
            >
              {batchActive
                ? `Uploading ${batchProgress.done} / ${batchProgress.total}…`
                : `📂  Upload Multiple Files  (${allUncollected.length} remaining across all boards)`}
            </button>
            {batchActive && (
              <div style={{ height: 2, background: "var(--border)", borderRadius: 1, marginBottom: 14 }}>
                <div style={{
                  height: "100%", background: "var(--accent)", borderRadius: 1,
                  width: batchProgress.total
                    ? `${(batchProgress.done / batchProgress.total) * 100}%` : "0%",
                  transition: "width 0.3s",
                }} />
              </div>
            )}
          </>
        )}

        {/* ── Board sections (accordion) ────────────────────── */}
        {allData.map(({ session, points }) => (
          <BoardSection
            key={session.session_id}
            session={session}
            points={points}
            pointStatus={pointStatus}
            serial={serials[session.session_id] ?? ""}
            boardType={boardTypes[session.session_id] ?? ""}
            onSerialChange={v =>
              setSerials(prev => ({ ...prev, [session.session_id]: v }))}
            onBoardTypeChange={v =>
              setBoardTypes(prev => ({ ...prev, [session.session_id]: v }))}
            onUpload={handlePointUpload}
            expanded={!collapsed.has(session.session_id)}
            onToggle={() =>
              setCollapsed(prev => {
                const next = new Set(prev);
                next.has(session.session_id) ? next.delete(session.session_id) : next.add(session.session_id);
                return next;
              })}
          />
        ))}

        {/* ── Hidden file inputs ────────────────────────────── */}
        <input ref={singleRef} type="file" accept="image/*"
          style={{ display: "none" }} onChange={onSingleChange} />
        <input ref={batchRef} type="file" accept="image/*" multiple
          style={{ display: "none" }} onChange={onBatchChange} />

        {/* ── Footer ───────────────────────────────────────── */}
        <div className="divider" />
        <button className="btn btn-ghost" style={{ color: "var(--text3)" }}
          onClick={() => nav("/")}>
          ← Back to Home
        </button>

      </div>
    </div>
  );
}
