// pages/MasterUpload.jsx
import React, { useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTestPoints, uploadMaster } from "../lib/api";
import toast from "react-hot-toast";

export default function MasterUpload() {
  const { boardId } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [uploadingId, setUploadingId] = useState(null);
  const fileRef = useRef();
  const pendingPoint = useRef(null);

  const { data: points } = useQuery({
    queryKey: ["points", boardId],
    queryFn: () => getTestPoints(boardId),
    enabled: !!boardId
  });

  const mutation = useMutation({
    mutationFn: ({ pointId, file }) => uploadMaster(boardId, pointId, file),
    onSuccess: () => {
      toast.success("Master uploaded ✓");
      qc.invalidateQueries(["points", boardId]);
      setUploadingId(null);
    },
    onError: () => { toast.error("Upload failed"); setUploadingId(null); }
  });

  const handleClick = (pointId) => {
    pendingPoint.current = pointId;
    fileRef.current?.click();
  };

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f || !pendingPoint.current) return;
    setUploadingId(pendingPoint.current);
    mutation.mutate({ pointId: pendingPoint.current, file: f });
    e.target.value = "";
  };

  return (
    <div className="page">
      <div className="topbar">
        <button className="back-btn" onClick={() => nav("/")}>‹</button>
        <span className="topbar-title">Upload Master Signatures</span>
      </div>

      <div className="section" style={{ paddingTop: 20 }}>
        <div className="card" style={{ background: "var(--bg3)", marginBottom: 20, fontSize: 12, color: "var(--text2)" }}>
          Upload one reference oscilloscope image per test point from a known-good board.
          These become the master signatures for comparison.
        </div>

        <div className="label">Test Points</div>
        {points?.map(pt => {
          const hasMaster = pt.master_signatures?.length > 0;
          const isUploading = uploadingId === pt.point_id;
          return (
            <div key={pt.point_id} className="card" style={{ padding: "14px 16px" }}>
              <div className="flex-between">
                <div>
                  <div style={{ fontFamily: "var(--mono)", fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>
                    {pt.point_name}
                    <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: 8 }}>{pt.component_type}</span>
                  </div>
                  {hasMaster && (
                    <div style={{ fontSize: 11, color: "var(--ok)", fontFamily: "var(--mono)" }}>✓ Master loaded</div>
                  )}
                </div>
                <button
                  className={`btn ${hasMaster ? "btn-ghost" : "btn-primary"}`}
                  style={{ width: "auto", padding: "8px 14px", fontSize: 11 }}
                  disabled={isUploading}
                  onClick={() => handleClick(pt.point_id)}
                >
                  {isUploading ? "..." : hasMaster ? "Replace" : "Upload"}
                </button>
              </div>
              {hasMaster && pt.master_signatures[0].image_url && (
                <img src={pt.master_signatures[0].image_url} alt="master"
                  style={{ width: "100%", borderRadius: 4, marginTop: 10, maxHeight: 120, objectFit: "contain", background: "#000" }} />
              )}
            </div>
          );
        })}
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFileChange} />
    </div>
  );
}
