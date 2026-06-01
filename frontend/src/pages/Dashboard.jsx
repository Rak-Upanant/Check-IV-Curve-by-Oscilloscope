// pages/Dashboard.jsx — Read-only inspection history dashboard
//
// Accessible at /dashboard from any browser (desktop or mobile).
// Shows all sessions grouped by Tag NO, newest first.
// No login required (Supabase RLS allows public reads).
//
// Each inspection group shows:
//   • Tag NO  · Date  · Boards inspected
//   • Per-board: board name, points collected/tested, OK/WARN/FAULT counts, status badge
//   • Expand → see individual point results
//   • PDF download link (if report generated)

import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAllSessions, generateReport, completeSession } from "../lib/api";
import toast from "react-hot-toast";

// ── Helpers ──────────────────────────────────────────────────
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
const fmtTime = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

const STATUS_COLOR = {
  ok:        "var(--ok)",
  warning:   "var(--warning)",
  fault:     "var(--fault)",
  collected: "var(--accent)",
};
const STATUS_BG = {
  ok:        "rgba(0,230,118,0.12)",
  warning:   "rgba(255,179,0,0.12)",
  fault:     "rgba(255,61,61,0.12)",
  collected: "rgba(0,212,255,0.12)",
};

function Badge({ status }) {
  return (
    <span style={{
      fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700,
      letterSpacing: 1.5, textTransform: "uppercase", padding: "3px 8px",
      borderRadius: 99,
      color:       STATUS_COLOR[status] ?? "var(--text3)",
      background:  STATUS_BG[status]   ?? "rgba(255,255,255,0.05)",
      border: `1px solid ${STATUS_COLOR[status] ?? "var(--border)"}40`,
    }}>
      {status ?? "—"}
    </span>
  );
}

// ── Session card for one board in an inspection ───────────────
function SessionCard({ session }) {
  const [open,    setOpen]    = useState(false);
  const [pdfUrl,  setPdfUrl]  = useState(session.report_url ?? null);
  const [loading, setLoading] = useState(false);

  const results  = session.test_results ?? [];
  const total    = results.length;
  const ok       = results.filter(r => r.status === "ok").length;
  const warn     = results.filter(r => r.status === "warning").length;
  const fault    = results.filter(r => r.status === "fault").length;
  const coll     = results.filter(r => r.status === "collected").length;
  const isCollect= results.every(r => ["collected","pending",null].includes(r.status));

  // Derive session-level status
  const sessionStatus = isCollect ? "collected"
    : fault  > 0 ? "fault"
    : warn   > 0 ? "warning"
    : ok     > 0 ? "ok"
    : "—";

  const handlePdf = async () => {
    setLoading(true);
    try {
      await completeSession(session.session_id).catch(() => {});
      const { pdf_url } = await generateReport(session.session_id);
      setPdfUrl(pdf_url);
      toast.success("Report ready");
    } catch {
      toast.error("Report generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: "var(--bg3)", borderRadius: 8, marginBottom: 6,
      border: "1px solid var(--border)",
      overflow: "hidden",
    }}>
      {/* Card header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 14px", cursor: "pointer",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "var(--mono)", fontWeight: 600, fontSize: 12,
            color: "var(--text)", marginBottom: 3,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {session.boards?.board_name ?? "—"}
          </div>
          <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)" }}>
            {isCollect
              ? `${coll}/${total} collected`
              : `${ok} OK · ${warn} WARN · ${fault} FAULT  (${total} pts)`}
          </div>
        </div>

        <Badge status={sessionStatus} />

        {/* PDF button */}
        {pdfUrl ? (
          <a href={pdfUrl} target="_blank" rel="noreferrer"
            style={{
              fontSize: 10, color: "var(--ok)", fontFamily: "var(--mono)",
              textDecoration: "none", flexShrink: 0,
              border: "1px solid rgba(0,230,118,0.3)", borderRadius: 4,
              padding: "3px 8px",
            }}
            onClick={e => e.stopPropagation()}>
            ↓ PDF
          </a>
        ) : (
          <button
            disabled={loading}
            onClick={e => { e.stopPropagation(); handlePdf(); }}
            style={{
              background: "none", border: "1px solid var(--border2)",
              borderRadius: 4, cursor: "pointer", padding: "3px 10px",
              fontSize: 10, fontFamily: "var(--mono)", color: "var(--accent)",
              flexShrink: 0, whiteSpace: "nowrap",
            }}
          >
            {loading ? "Loading…" : "Load PDF"}
          </button>
        )}

        <span style={{
          color: "var(--text3)", fontSize: 10, transform: open ? "rotate(180deg)" : "none",
          transition: "transform 0.2s", flexShrink: 0,
        }}>▼</span>
      </div>

      {/* Expanded: per-point table */}
      {open && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "10px 14px" }}>
          {results.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)" }}>
              No results recorded
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead>
                <tr>
                  {["Point", "Component", isCollect ? "Status" : "Score", !isCollect && "Status", !isCollect && "Diagnosis"]
                    .filter(Boolean)
                    .map(h => (
                      <th key={h} style={{
                        textAlign: "left", padding: "3px 6px",
                        fontFamily: "var(--mono)", color: "var(--text3)",
                        fontSize: 9, letterSpacing: 1, textTransform: "uppercase",
                        borderBottom: "1px solid var(--border)",
                      }}>{h}</th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const pt = r.test_points ?? {};
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "4px 6px", fontFamily: "var(--mono)", color: "var(--text)", fontWeight: 600 }}>
                        {pt.point_name ?? "—"}
                      </td>
                      <td style={{ padding: "4px 6px", color: "var(--text2)", fontFamily: "var(--mono)" }}>
                        {pt.component_type ?? "—"}
                      </td>
                      {isCollect ? (
                        <td style={{ padding: "4px 6px" }}><Badge status={r.status} /></td>
                      ) : (
                        <>
                          <td style={{ padding: "4px 6px", fontFamily: "var(--mono)",
                            color: r.similarity_score != null ? "var(--text)" : "var(--text3)" }}>
                            {r.similarity_score != null ? `${Number(r.similarity_score).toFixed(1)}%` : "—"}
                          </td>
                          <td style={{ padding: "4px 6px" }}><Badge status={r.status} /></td>
                          <td style={{ padding: "4px 6px", color: "var(--text2)",
                            fontFamily: "var(--mono)", fontSize: 9 }}>
                            {r.diagnosis ?? "—"}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────
export default function Dashboard() {
  const nav         = useNavigate();
  const queryClient = useQueryClient();
  const [search,     setSearch]     = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const { data: sessions, isLoading, isError, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["all-sessions"],
    queryFn:  getAllSessions,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    // Invalidate cache first so refetch never serves stale data
    await queryClient.invalidateQueries({ queryKey: ["all-sessions"] });
    await refetch();
    setRefreshing(false);
  };

  // Group by Tag NO (technician), newest group first
  const grouped = useMemo(() => {
    if (!sessions) return [];
    const map = new Map();
    for (const s of sessions) {
      const tag = s.technician || "No Tag";
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag).push(s);
    }
    // Each group: derive the date from the newest session
    return [...map.entries()]
      .map(([tag, list]) => ({
        tag,
        date: list[0]?.test_date ?? "",
        sessions: list,
      }))
      .filter(g => !search || g.tag.toLowerCase().includes(search.toLowerCase()));
  }, [sessions, search]);

  const totalInspections = grouped.length;
  const totalSessions    = sessions?.length ?? 0;

  return (
    <div className="page" style={{ maxWidth: 760, margin: "0 auto" }}>

      {/* ── Top bar ─────────────────────────────────────────── */}
      <div className="topbar">
        <button className="back-btn" onClick={() => nav("/")}>‹</button>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11,
          color: "var(--accent)", letterSpacing: 2 }}>▸ IV·SIG</span>
        <span className="topbar-title" style={{ flex: 1, textAlign: "right" }}>
          Inspection Dashboard
        </span>
        <button
          onClick={handleRefresh}
          disabled={refreshing || isLoading}
          style={{
            background: "none", border: "1px solid var(--border2)",
            borderRadius: 4, cursor: "pointer", padding: "4px 10px",
            fontSize: 11, fontFamily: "var(--mono)", color: "var(--text3)",
            marginLeft: 8, flexShrink: 0,
            opacity: refreshing || isLoading ? 0.5 : 1,
          }}
        >
          {refreshing ? "…" : "↻"}
        </button>
      </div>

      <div className="section" style={{ paddingTop: 20 }}>

        {/* ── Summary strip ─────────────────────────────────── */}
        <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 20 }}>
          {[
            ["Inspections", totalInspections, "var(--accent)"],
            ["Sessions",    totalSessions,    "var(--text)"],
            ["Boards",      new Set(sessions?.map(s => s.boards?.board_name)).size, "var(--text2)"],
          ].map(([label, val, color]) => (
            <div key={label} className="card" style={{ textAlign: "center", padding: "12px 8px" }}>
              <div style={{ fontSize: 22, fontFamily: "var(--mono)", fontWeight: 700, color }}>
                {val}
              </div>
              <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--text3)",
                letterSpacing: 2, textTransform: "uppercase", marginTop: 2 }}>
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* ── Search ────────────────────────────────────────── */}
        <div style={{ position: "relative", marginBottom: 20 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search Tag NO…"
            style={{
              width: "100%", background: "var(--bg3)",
              border: "1px solid var(--border2)", borderRadius: 6,
              padding: "10px 14px 10px 36px",
              color: "var(--text)", fontFamily: "var(--mono)", fontSize: 12, outline: "none",
            }}
          />
          <span style={{
            position: "absolute", left: 12, top: "50%",
            transform: "translateY(-50%)", color: "var(--text3)", fontSize: 14,
          }}>🔍</span>
        </div>

        {/* ── Loading / error ───────────────────────────────── */}
        {isLoading && (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text3)",
            fontFamily: "var(--mono)", fontSize: 12 }}>Loading…</div>
        )}
        {isError && (
          <div style={{ padding: 16, color: "var(--fault)", fontFamily: "var(--mono)",
            fontSize: 12, background: "rgba(255,61,61,0.06)",
            border: "1px solid rgba(255,61,61,0.2)", borderRadius: 8 }}>
            <div style={{ marginBottom: 8 }}>Cannot reach API</div>
            <button className="btn btn-ghost"
              style={{ width: "auto", padding: "6px 12px", fontSize: 10 }}
              onClick={() => refetch()}>Retry</button>
          </div>
        )}

        {/* ── Inspection groups ─────────────────────────────── */}
        {grouped.map(({ tag, date, sessions: list }) => (
          <div key={tag} style={{ marginBottom: 24 }}>

            {/* Group header */}
            <div style={{
              display: "flex", alignItems: "baseline", gap: 12,
              marginBottom: 8, paddingBottom: 6,
              borderBottom: "1px solid var(--border)",
            }}>
              <span style={{
                fontFamily: "var(--mono)", fontWeight: 700, fontSize: 14,
                color: "var(--accent)",
              }}>
                {tag}
              </span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)" }}>
                {fmtDate(date)}  {fmtTime(date)}
              </span>
              <span style={{
                marginLeft: "auto", fontSize: 10, color: "var(--text3)",
                fontFamily: "var(--mono)",
              }}>
                {list.length} board{list.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Session cards */}
            {list.map(s => <SessionCard key={s.session_id} session={s} />)}
          </div>
        ))}

        {!isLoading && !isError && grouped.length === 0 && (
          <div style={{ textAlign: "center", padding: 48, color: "var(--text3)",
            fontFamily: "var(--mono)", fontSize: 12 }}>
            {search ? `No inspections matching "${search}"` : "No inspections recorded yet"}
          </div>
        )}

        <div style={{
          marginTop: 16, fontSize: 10, color: "var(--text3)",
          fontFamily: "var(--mono)", textAlign: "center",
        }}>
          {dataUpdatedAt
            ? `Updated ${new Date(dataUpdatedAt).toLocaleTimeString()}  ·  auto-refresh 30 s`
            : "Auto-refresh every 30 s"}
        </div>
      </div>
    </div>
  );
}
