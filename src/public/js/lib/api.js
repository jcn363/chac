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

let ws = null;
let wsHandlers = {};

export function connectWebSocket() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const token = getCurrentToken();
  const wsUrl = token
    ? `${protocol}//${location.host}/ws?token=${encodeURIComponent(token)}`
    : `${protocol}//${location.host}/ws`;
  ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    const handler = wsHandlers[data.type];
    if (handler) handler(data);
  };

  ws.onclose = (event) => {
    // Don't auto-reconnect if auth failed
    if (event.code === 4001 || event.code === 4003) return;
    setTimeout(connectWebSocket, 3000);
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
