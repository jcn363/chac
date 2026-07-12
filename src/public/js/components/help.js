import { apiGet } from "../lib/api.js";
import { escapeHtml, showToast } from "../lib/dom.js";

let previousFocus = null;

export function initHelp() {
  document.getElementById("help-toggle")?.addEventListener("click", toggleHelp);
  document.querySelector(".overlay-backdrop")?.addEventListener("click", closeHelp);
  document.querySelector(".overlay-close")?.addEventListener("click", closeHelp);

  document.addEventListener("keydown", (e) => {
    if (e.key === "?" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      toggleHelp();
    }
    if (e.key === "Escape") {
      const overlay = document.getElementById("help-overlay");
      if (overlay && !overlay.classList.contains("hidden")) closeHelp();
    }
    const overlay = document.getElementById("help-overlay");
    if (overlay && !overlay.classList.contains("hidden") && e.key === "Tab") {
      const focusable = overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  });
}

function toggleHelp() {
  const overlay = document.getElementById("help-overlay");
  if (!overlay) return;
  if (overlay.classList.contains("hidden")) openHelp();
  else closeHelp();
}

function openHelp() {
  const overlay = document.getElementById("help-overlay");
  if (!overlay) return;
  overlay.classList.remove("hidden");
  loadHelpStatus();
  previousFocus = document.activeElement;
  const firstFocusable = overlay.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
  firstFocusable?.focus();
}

function closeHelp() {
  const overlay = document.getElementById("help-overlay");
  if (!overlay) return;
  overlay.classList.add("hidden");
  previousFocus?.focus();
  previousFocus = null;
}

async function loadHelpStatus() {
  const statusEl = document.getElementById("help-status");
  if (!statusEl) return;
  statusEl.innerHTML = '<div class="status-row"><span class="status-dot"></span> Loading...</div>';

  try {
    const [status, llm, settings] = await Promise.all([
      apiGet("/api/status"),
      apiGet("/api/llm/status"),
      apiGet("/api/settings"),
    ]);

    const settingsMap = {};
    settings.forEach((s) => { settingsMap[s.key] = s.value; });

    let html = "";
    html += `<div class="status-row"><span class="status-dot ${status?.status === "ok" ? "green" : "red"}"></span> Server ${status?.status === "ok" ? "Running" : "Stopped"} (v${status?.version || "?"})</div>`;
    html += `<div class="status-row"><span class="status-dot ${llm?.chat ? "green" : "red"}"></span> Chat LLM ${llm?.chat ? "Ready" : "Not ready"}</div>`;
    html += `<div class="status-row"><span class="status-dot ${llm?.embed ? "green" : "red"}"></span> Embedding ${llm?.embed ? "Ready" : "Not ready"}</div>`;
    html += `<div class="status-row"><span class="status-dot ${llm?.vision ? "green" : "red"}"></span> Vision ${llm?.vision ? "Ready" : "Not ready"}</div>`;
    html += `<div class="status-row"><span class="status-dot ${llm?.gpu ? "green" : "red"}"></span> GPU ${llm?.gpu ? "Active" : "Inactive"}</div>`;
    html += `<div class="status-row">Model: ${escapeHtml(String(settingsMap["llm.chat.model"] || "?"))}</div>`;
    html += `<div class="status-row">Port: ${escapeHtml(String(settingsMap["server.port"] || "3000"))}</div>`;

    statusEl.innerHTML = html;
  } catch {
    statusEl.innerHTML = '<div class="status-row"><span class="status-dot red"></span> Unable to load status</div>';
  }
}
