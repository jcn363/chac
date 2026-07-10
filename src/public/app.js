// Chac Frontend
import { marked } from "marked";
import DOMPurify from "dompurify";

const API = "";

marked.setOptions({
  breaks: true,
  gfm: true,
});

// ==================== //
// Utility              //
// ==================== //

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showToast(message, type = "error", duration = 3000) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

function toggleEmptyState(listEl, emptyEl, hasItems) {
  if (hasItems) {
    listEl?.classList.remove("hidden");
    emptyEl?.classList.add("hidden");
  } else {
    listEl?.classList.add("hidden");
    emptyEl?.classList.remove("hidden");
  }
}

// ==================== //
// Tab Switching        //
// ==================== //

document.querySelectorAll(".tab[data-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab[data-tab]").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`${tab.dataset.tab}-tab`)?.classList.add("active");
  });
});

// Session search
document.getElementById("session-search")?.addEventListener("input", (e) => {
  const query = e.target.value.toLowerCase();
  document.querySelectorAll("#session-list .doc-item").forEach((el) => {
    const title = el.querySelector(".session-title")?.textContent?.toLowerCase() ?? "";
    el.style.display = title.includes(query) ? "" : "none";
  });
});

// ==================== //
// Chat                 //
// ==================== //

let currentSession = null;

document.getElementById("new-session")?.addEventListener("click", async () => {
  const btn = document.getElementById("new-session");
  btn.disabled = true;
  btn.textContent = "Creating...";
  try {
    const res = await fetch(`${API}/api/chat/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Chat" }),
    });
    if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
    const session = await res.json();
    currentSession = session.id;
    loadSessions();
    loadMessages();
  } catch (err) {
    showToast("Failed to create session");
  } finally {
    btn.disabled = false;
    btn.textContent = "+ New Session";
  }
});

document.getElementById("chat-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentSession) return;
  const input = document.getElementById("chat-input");
  const sendBtn = document.querySelector('#chat-form button[type="submit"]');
  const msg = input.value.trim();
  if (!msg) return;

  addMessage("user", msg, new Date().toISOString());
  input.value = "";
  input.disabled = true;
  sendBtn.disabled = true;
  input.placeholder = "Thinking...";
  showTypingIndicator();

  try {
    const res = await fetch(`${API}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: currentSession, message: msg }),
    });
    if (!res.ok) throw new Error(`Chat failed: ${res.status}`);
    const data = await res.json();
    addMessage("assistant", data.content ?? "No response", data.created_at);
  } catch (err) {
    addMessage("assistant", `Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    showToast("Failed to send message");
  } finally {
    input.disabled = false;
    sendBtn.disabled = false;
    input.placeholder = "Ask a question...";
    input.focus();
  }
});

function showTypingIndicator() {
  const indicator = document.getElementById("typing-indicator");
  if (indicator) {
    indicator.classList.remove("hidden");
    indicator.scrollIntoView({ behavior: "smooth" });
  }
}

function hideTypingIndicator() {
  document.getElementById("typing-indicator")?.classList.add("hidden");
}

function addMessage(role, content, timestamp, msgId) {
  hideTypingIndicator();
  const div = document.createElement("div");
  div.className = `message ${role}`;
  if (msgId) div.dataset.msgId = msgId;
  const rendered = DOMPurify.sanitize(marked.parse(content));
  const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  const editBtn = role === "user" ? `<button class="msg-edit" data-tooltip="Edit" aria-label="Edit message">&#9998;</button>` : "";
  div.innerHTML = `<div class="message-bubble" data-md="${escapeHtml(content)}">${rendered}</div>` +
    `<span class="message-time">${timeStr}${editBtn}</span>`;
  document.getElementById("messages")?.appendChild(div);
  div.scrollIntoView({ behavior: "smooth" });

  if (role === "user") {
    div.querySelector(".msg-edit")?.addEventListener("click", () => startEditMessage(div));
  }
}

function startEditMessage(msgEl) {
  const bubble = msgEl.querySelector(".message-bubble");
  if (!bubble || msgEl.querySelector(".msg-edit-input")) return;
  const id = msgEl.dataset.msgId;
  const md = bubble.dataset.md || bubble.textContent;

  const textarea = document.createElement("textarea");
  textarea.className = "msg-edit-input";
  textarea.value = md;
  textarea.rows = Math.min(md.split("\n").length + 1, 8);
  textarea.setAttribute("aria-label", "Edit message");
  bubble.replaceWith(textarea);
  textarea.focus();
  textarea.select();

  async function save() {
    const newContent = textarea.value.trim();
    if (!newContent || newContent === md) {
      loadMessages();
      return;
    }
    try {
      const res = await fetch(`${API}/api/chat/messages/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent }),
      });
      if (!res.ok) throw new Error("Failed to update");
    } catch {
      showToast("Failed to update message");
    }
    loadMessages();
  }

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); }
    if (e.key === "Escape") { loadMessages(); }
  });
  textarea.addEventListener("blur", save);
}

function startRename(el) {
  const titleEl = el.querySelector(".session-title");
  if (!titleEl || el.querySelector(".session-rename")) return;
  const id = el.dataset.id;
  const oldTitle = titleEl.textContent;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "session-rename";
  input.value = oldTitle;
  input.setAttribute("aria-label", "Rename session");
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  async function save() {
    const newTitle = input.value.trim() || oldTitle;
    if (newTitle !== oldTitle) {
      try {
        const res = await fetch(`${API}/api/chat/sessions/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle }),
        });
        if (!res.ok) throw new Error("Failed to rename");
      } catch {
        showToast("Failed to rename session");
      }
    }
    loadSessions();
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    if (e.key === "Escape") { input.value = oldTitle; save(); }
  });
  input.addEventListener("blur", save);
}

async function loadSessions() {
  try {
    const res = await fetch(`${API}/api/chat/sessions`);
    if (!res.ok) throw new Error(`Failed to load sessions: ${res.status}`);
    const sessions = await res.json();
    const list = document.getElementById("session-list");
    const empty = document.getElementById("chat-empty");
    if (!list) return;

    toggleEmptyState(list, empty, sessions.length > 0);

    list.innerHTML = sessions
      .map(
        (s) =>
          `<div class="doc-item ${s.id === currentSession ? "active" : ""}" data-id="${s.id}" tabindex="0">
            <span class="session-title">${escapeHtml(s.title || "Untitled")}</span>
            <button class="session-delete" data-id="${s.id}" aria-label="Delete session" data-tooltip="Delete">&times;</button>
          </div>`
      )
      .join("");
    list.querySelectorAll(".doc-item").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest(".session-delete") || e.target.closest(".session-rename")) return;
        currentSession = el.dataset.id ?? null;
        loadSessions();
        loadMessages();
      });
      el.addEventListener("dblclick", (e) => {
        if (e.target.closest(".session-delete")) return;
        startRename(el);
      });
    });
    list.querySelectorAll(".session-delete").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (!confirm("Delete this session?")) return;
        try {
          const res = await fetch(`${API}/api/chat/sessions/${id}`, { method: "DELETE" });
          if (!res.ok) throw new Error("Failed to delete");
          if (currentSession === id) {
            currentSession = null;
            document.getElementById("messages").innerHTML = "";
          }
          loadSessions();
          showToast("Session deleted", "success");
        } catch {
          showToast("Failed to delete session");
        }
      });
    });

    // Drag and drop reordering
    let draggedEl = null;
    list.querySelectorAll(".doc-item").forEach((el) => {
      el.draggable = true;
      el.addEventListener("dragstart", (e) => {
        draggedEl = el;
        el.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      el.addEventListener("dragend", () => {
        el.classList.remove("dragging");
        list.querySelectorAll(".doc-item").forEach((item) => item.classList.remove("drag-over"));
        draggedEl = null;
      });
      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (draggedEl && draggedEl !== el) {
          el.classList.add("drag-over");
        }
      });
      el.addEventListener("dragleave", () => {
        el.classList.remove("drag-over");
      });
      el.addEventListener("drop", async (e) => {
        e.preventDefault();
        el.classList.remove("drag-over");
        if (!draggedEl || draggedEl === el) return;
        const items = [...list.querySelectorAll(".doc-item")];
        const fromIdx = items.indexOf(draggedEl);
        const toIdx = items.indexOf(el);
        if (fromIdx < toIdx) {
          el.after(draggedEl);
        } else {
          el.before(draggedEl);
        }
        // Save new order
        const newOrder = [...list.querySelectorAll(".doc-item")].map((item) => item.dataset.id);
        try {
          const res = await fetch(`${API}/api/chat/sessions`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: newOrder }),
          });
          if (!res.ok) throw new Error("Reorder failed");
        } catch {
          showToast("Failed to reorder sessions");
          loadSessions();
        }
      });
    });
  } catch (err) {
    showToast("Failed to load sessions");
  }
}

async function loadMessages() {
  const messagesEl = document.getElementById("messages");
  if (!messagesEl) return;
  messagesEl.innerHTML = "";
  if (!currentSession) return;

  try {
    const res = await fetch(`${API}/api/chat/sessions/${currentSession}/messages`);
    if (!res.ok) throw new Error(`Failed to load messages: ${res.status}`);
    const messages = await res.json();
    for (const msg of messages) {
      addMessage(msg.role, msg.content, msg.created_at, msg.id);
    }
  } catch (err) {
    showToast("Failed to load messages");
  }
}

// ==================== //
// Documents            //
// ==================== //

async function loadDocuments(page = 1) {
  try {
    const res = await fetch(`${API}/api/documents?page=${page}`);
    if (!res.ok) throw new Error(`Failed to load documents: ${res.status}`);
    const data = await res.json();
    const list = document.getElementById("doc-list");
    const empty = document.getElementById("doc-empty");
    if (!list) return;

    const docs = data.documents || [];
    toggleEmptyState(list, empty, docs.length > 0);

    list.innerHTML = docs
      .map(
        (d) =>
          `<div class="doc-item" data-id="${d.id}" tabindex="0">
            <strong>${escapeHtml(d.title)}</strong>
            <span class="setting-value">${d.chunk_count} chunks</span>
          </div>`
      )
      .join("");
  } catch (err) {
    showToast("Failed to load documents");
  }
}

document.getElementById("ingest-btn")?.addEventListener("click", async () => {
  const btn = document.getElementById("ingest-btn");
  const path = prompt("Enter file path:");
  if (!path) return;
  btn.disabled = true;
  btn.textContent = "Adding...";
  try {
    const res = await fetch(`${API}/api/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) throw new Error(`Failed to ingest document: ${res.status}`);
    loadDocuments();
    showToast("Document added", "success");
  } catch (err) {
    showToast("Failed to add document");
  } finally {
    btn.disabled = false;
    btn.textContent = "+ Add Document";
  }
});

// ==================== //
// Wiki                 //
// ==================== //

async function loadWiki() {
  try {
    const res = await fetch(`${API}/api/wiki`);
    if (!res.ok) throw new Error(`Failed to load wiki: ${res.status}`);
    const data = await res.json();
    const list = document.getElementById("wiki-list");
    const empty = document.getElementById("wiki-empty");
    if (!list) return;

    const pages = data.pages || [];
    toggleEmptyState(list, empty, pages.length > 0);

    list.innerHTML = pages
      .map(
        (p) =>
          `<div class="wiki-item" tabindex="0">
            <strong>${escapeHtml(p.title)}</strong>
            <p>${escapeHtml((p.content || "").slice(0, 200))}...</p>
          </div>`
      )
      .join("");
  } catch (err) {
    showToast("Failed to load wiki");
  }
}

document.getElementById("compile-btn")?.addEventListener("click", async () => {
  const btn = document.getElementById("compile-btn");
  btn.disabled = true;
  btn.textContent = "Compiling...";
  try {
    const res = await fetch(`${API}/api/wiki/compile`, { method: "POST" });
    if (!res.ok) throw new Error(`Failed to compile wiki: ${res.status}`);
    loadWiki();
    showToast("Wiki compiled", "success");
  } catch (err) {
    showToast("Failed to compile wiki");
  } finally {
    btn.disabled = false;
    btn.textContent = "Compile Wiki";
  }
});

// ==================== //
// Settings             //
// ==================== //

async function loadSettings() {
  try {
    const res = await fetch(`${API}/api/settings`);
    if (!res.ok) throw new Error(`Failed to load settings: ${res.status}`);
    const settings = await res.json();
    const list = document.getElementById("settings-list");
    if (!list) return;
    list.innerHTML = settings
      .map(
        (s) =>
          `<div class="setting-row" data-tooltip="${escapeHtml(s.description || "")}">
            <span class="setting-key">${escapeHtml(s.key)}</span>
            <span class="setting-value">${escapeHtml(String(s.value))}</span>
          </div>`
      )
      .join("");
  } catch (err) {
    showToast("Failed to load settings");
  }
}

// ==================== //
// Help Overlay         //
// ==================== //

function toggleHelp() {
  const overlay = document.getElementById("help-overlay");
  if (!overlay) return;
  if (overlay.classList.contains("hidden")) {
    openHelp();
  } else {
    closeHelp();
  }
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

let previousFocus = null;

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
    const [statusRes, llmRes, settingsRes] = await Promise.all([
      fetch(`${API}/api/status`),
      fetch(`${API}/api/llm/status`),
      fetch(`${API}/api/settings`),
    ]);

    const status = statusRes.ok ? await statusRes.json() : null;
    const llm = llmRes.ok ? await llmRes.json() : null;
    const settings = settingsRes.ok ? await settingsRes.json() : [];

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

// Help event listeners
document.getElementById("help-toggle")?.addEventListener("click", toggleHelp);
document.querySelector(".overlay-backdrop")?.addEventListener("click", closeHelp);
document.querySelector(".overlay-close")?.addEventListener("click", closeHelp);

// ==================== //
// Message Search       //
// ==================== //

document.getElementById("search-toggle")?.addEventListener("click", () => {
  const input = document.getElementById("msg-search");
  const count = document.getElementById("msg-search-count");
  input.classList.toggle("hidden");
  count.classList.add("hidden");
  if (!input.classList.contains("hidden")) {
    input.focus();
  } else {
    input.value = "";
    clearSearchHighlights();
  }
});

document.getElementById("msg-search")?.addEventListener("input", (e) => {
  const query = e.target.value.trim();
  const countEl = document.getElementById("msg-search-count");
  clearSearchHighlights();
  if (!query) { countEl.classList.add("hidden"); return; }

  const messages = document.querySelectorAll("#messages .message-bubble");
  let matches = 0;
  messages.forEach((bubble) => {
    const md = bubble.dataset.md || bubble.textContent;
    const lower = md.toLowerCase();
    const q = query.toLowerCase();
    let idx = 0;
    let result = "";
    while (idx < md.length) {
      const pos = lower.indexOf(q, idx);
      if (pos === -1) { result += md.slice(idx); break; }
      result += md.slice(idx, pos);
      result += `<<mark>${md.slice(pos, pos + query.length)}</mark>>`;
      idx = pos + query.length;
      matches++;
    }
    bubble.innerHTML = DOMPurify.sanitize(marked.parse(result));
  });

  countEl.textContent = matches > 0 ? `${matches} match${matches > 1 ? "es" : ""}` : "No matches";
  countEl.classList.remove("hidden");

  const first = document.querySelector(".message-bubble mark");
  if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
});

function clearSearchHighlights() {
  document.querySelectorAll("#messages .message-bubble").forEach((bubble) => {
    const md = bubble.dataset.md || "";
    bubble.innerHTML = DOMPurify.sanitize(marked.parse(md));
  });
}

// ==================== //
// Export Chat          //
// ==================== //

document.getElementById("export-btn")?.addEventListener("click", async () => {
  if (!currentSession) {
    showToast("Select a session to export");
    return;
  }
  try {
    const res = await fetch(`${API}/api/chat/sessions/${currentSession}/messages`);
    if (!res.ok) throw new Error("Failed to load messages");
    const messages = await res.json();
    if (messages.length === 0) {
      showToast("No messages to export");
      return;
    }

    let md = "# Chat Export\n\n";
    for (const msg of messages) {
      const role = msg.role === "user" ? "**You**" : "**Assistant**";
      md += `### ${role}\n\n${msg.content}\n\n---\n\n`;
    }

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-${currentSession.slice(0, 8)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
    showToast("Chat exported", "success");
  } catch {
    showToast("Failed to export chat");
  }
});

// ==================== //
// Keyboard Shortcuts   //
// ==================== //

document.addEventListener("keydown", (e) => {
  // ? to toggle help (not when typing in input/textarea)
  if (e.key === "?" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
    e.preventDefault();
    toggleHelp();
  }

  // Escape to close help overlay
  if (e.key === "Escape") {
    const overlay = document.getElementById("help-overlay");
    if (overlay && !overlay.classList.contains("hidden")) {
      closeHelp();
    }
  }

  // Focus trap inside help overlay
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

// Ctrl+Enter to send message
document.getElementById("chat-input")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    document.getElementById("chat-form")?.requestSubmit();
  }
});

// ==================== //
// Keyboard Nav Items   //
// ==================== //

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    const item = e.target.closest(".doc-item, .wiki-item");
    if (item) {
      e.preventDefault();
      item.click();
    }
  }
});

// ==================== //
// Dark Mode Toggle     //
// ==================== //

let currentTheme = "system";
const THEME_CYCLE = ["system", "dark", "light"];

function applyTheme(mode) {
  currentTheme = mode;
  document.body.classList.remove("dark", "light");
  if (mode === "dark") document.body.classList.add("dark");
  else if (mode === "light") document.body.classList.add("light");
  // "system" = no class, relies on @media query
}

async function loadTheme() {
  try {
    const res = await fetch(`${API}/api/settings`);
    if (!res.ok) return;
    const settings = await res.json();
    const saved = settings.find((s) => s.key === "ui.dark_mode");
    if (saved) applyTheme(saved.value || "system");
  } catch {}
}

async function cycleTheme() {
  const idx = THEME_CYCLE.indexOf(currentTheme);
  const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
  applyTheme(next);
  try {
    await fetch(`${API}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "ui.dark_mode", value: next }),
    });
  } catch {}
  showToast(`Theme: ${next}`, "success", 1500);
}

document.getElementById("theme-toggle")?.addEventListener("click", cycleTheme);

// Listen for system preference changes (only when in system mode)
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (currentTheme === "system") applyTheme("system");
});

// ==================== //
// Init                 //
// ==================== //

loadTheme();
loadSessions();
loadDocuments();
loadWiki();
loadSettings();
