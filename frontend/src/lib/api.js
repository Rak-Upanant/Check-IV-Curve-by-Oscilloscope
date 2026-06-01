// frontend/src/lib/api.js
import axios from "axios";

// Development:  baseURL = ""  → requests go to same origin (e.g. localhost:3000)
//               CRA "proxy" in package.json forwards them to localhost:8000
//               → zero CORS issues, works regardless of which port React is on
//
// Production:   REACT_APP_API_URL is set in Render env vars to the deployed
//               backend URL (https://iv-sig-api.onrender.com)
//               → direct cross-origin request, backend allows_origins=["*"]
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "",
  timeout: 60000,
});

export const getBoards      = ()            => api.get("/boards").then(r => r.data);
export const getAllSessions = ()            => api.get("/sessions").then(r => r.data);
export const getTestPoints  = (boardId)     => api.get(`/boards/${boardId}/points`).then(r => r.data);
export const getBoardHistory= (boardId)     => api.get(`/boards/${boardId}/history`).then(r => r.data);

export const createSession  = (body)        => api.post("/sessions", body).then(r => r.data);
export const getSession     = (id)          => api.get(`/sessions/${id}`).then(r => r.data);
export const completeSession= (id)          => api.patch(`/sessions/${id}/complete`).then(r => r.data);
export const generateReport = (id)          => api.post(`/sessions/${id}/report`).then(r => r.data);

export const uploadMaster   = (boardId, pointId, file) => {
  const fd = new FormData(); fd.append("file", file);
  return api.post(`/boards/${boardId}/points/${pointId}/master`, fd,
    { headers: { "Content-Type": "multipart/form-data" } }).then(r => r.data);
};

export const analyzeImage   = (sessionId, pointId, file) => {
  const fd = new FormData(); fd.append("file", file);
  return api.post(`/sessions/${sessionId}/analyze?point_id=${pointId}`, fd,
    { headers: { "Content-Type": "multipart/form-data" } }).then(r => r.data);
};

export const debugAnalyze   = (file, pointId = null) => {
  const fd = new FormData(); fd.append("file", file);
  const url = pointId ? `/debug/analyze?point_id=${pointId}` : "/debug/analyze";
  return api.post(url, fd, { headers: { "Content-Type": "multipart/form-data" } }).then(r => r.data);
};

// serial → used by backend to build storage path: collected/{tag}/{board}/{serial}/{point}.png
export const collectImage   = (sessionId, pointId, file, serial = "") => {
  const fd = new FormData(); fd.append("file", file);
  const qs = new URLSearchParams({ point_id: pointId });
  if (serial.trim()) qs.append("serial", serial.trim());
  return api.post(`/sessions/${sessionId}/collect?${qs}`, fd,
    { headers: { "Content-Type": "multipart/form-data" } }).then(r => r.data);
};
