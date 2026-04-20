// frontend/src/lib/api.js
import axios from "axios";

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:8000",
  timeout: 60000,
});

export const getBoards      = ()            => api.get("/boards").then(r => r.data);
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
