import { getCurrentToken } from "./state.js";

const API = "";

export async function apiGet(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function apiPost(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function apiPut(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function apiDelete(path) {
  const res = await fetch(`${API}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function apiUpload(path, file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}${path}`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

let ws = null;
let wsHandlers = {};
let reconnectAttempts = 0;
const maxReconnectDelay = 30000;

export function connectWebSocket() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.onopen = () => {
    reconnectAttempts = 0;
    const token = getCurrentToken();
    if (token) {
      sendWsMessage({ type: "auth", token });
    }
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    const handler = wsHandlers[data.type];
    if (handler) handler(data);
  };

  ws.onclose = (event) => {
    if (event.code === 4001 || event.code === 4003) return;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), maxReconnectDelay);
    const jitter = delay * (0.5 + Math.random() * 0.5);
    reconnectAttempts++;
    setTimeout(connectWebSocket, jitter);
  };
}

export function onWsMessage(type, handler) {
  wsHandlers[type] = handler;
}

export function sendWsMessage(data) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
    return true;
  }
  return false;
}
