// Chac Frontend
const API = "";

// Tab switching
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`${tab.dataset.tab}-tab`)?.classList.add("active");
  });
});

// Chat
let currentSession = null;

document.getElementById("new-session")?.addEventListener("click", async () => {
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
  } catch (err) {
    console.error("Failed to create session:", err);
  }
});

document.getElementById("chat-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentSession) return;
  const input = document.getElementById("chat-input");
  const msg = input.value.trim();
  if (!msg) return;

  addMessage("user", msg);
  input.value = "";

  try {
    const res = await fetch(`${API}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: currentSession, message: msg }),
    });
    if (!res.ok) throw new Error(`Chat failed: ${res.status}`);
    const data = await res.json();
    addMessage("assistant", data.content ?? "No response");
  } catch (err) {
    addMessage("assistant", `Error: ${err instanceof Error ? err.message : "Unknown error"}`);
  }
});

function addMessage(role, content) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.innerHTML = `<div class="message-bubble">${escapeHtml(content)}</div>`;
  document.getElementById("messages")?.appendChild(div);
  div.scrollIntoView({ behavior: "smooth" });
}

async function loadSessions() {
  try {
    const res = await fetch(`${API}/api/chat/sessions`);
    if (!res.ok) throw new Error(`Failed to load sessions: ${res.status}`);
    const sessions = await res.json();
    const list = document.getElementById("session-list");
    if (!list) return;
    list.innerHTML = sessions
      .map(
        (s) =>
          `<div class="doc-item ${s.id === currentSession ? "active" : ""}" data-id="${s.id}">${escapeHtml(s.title || "Untitled")}</div>`
      )
      .join("");
    list.querySelectorAll(".doc-item").forEach((el) => {
      el.addEventListener("click", () => {
        currentSession = el.dataset.id ?? null;
        loadSessions();
        loadMessages();
      });
    });
  } catch (err) {
    console.error("Failed to load sessions:", err);
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
      addMessage(msg.role, msg.content);
    }
  } catch (err) {
    console.error("Failed to load messages:", err);
  }
}

// Documents
async function loadDocuments(page = 1) {
  try {
    const res = await fetch(`${API}/api/documents?page=${page}`);
    if (!res.ok) throw new Error(`Failed to load documents: ${res.status}`);
    const data = await res.json();
    const list = document.getElementById("doc-list");
    if (!list) return;
    list.innerHTML = (data.documents || [])
      .map(
        (d) =>
          `<div class="doc-item" data-id="${d.id}">
            <strong>${escapeHtml(d.title)}</strong>
            <span class="setting-value">${d.chunk_count} chunks</span>
          </div>`
      )
      .join("");
  } catch (err) {
    console.error("Failed to load documents:", err);
  }
}

document.getElementById("ingest-btn")?.addEventListener("click", async () => {
  const path = prompt("Enter file path:");
  if (!path) return;
  try {
    const res = await fetch(`${API}/api/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) throw new Error(`Failed to ingest document: ${res.status}`);
    loadDocuments();
  } catch (err) {
    console.error("Failed to ingest document:", err);
  }
});

// Wiki
async function loadWiki() {
  try {
    const res = await fetch(`${API}/api/wiki`);
    if (!res.ok) throw new Error(`Failed to load wiki: ${res.status}`);
    const data = await res.json();
    const list = document.getElementById("wiki-list");
    if (!list) return;
    list.innerHTML = (data.pages || [])
      .map(
        (p) =>
          `<div class="wiki-item">
            <strong>${escapeHtml(p.title)}</strong>
            <p>${escapeHtml((p.content || "").slice(0, 200))}...</p>
          </div>`
      )
      .join("");
  } catch (err) {
    console.error("Failed to load wiki:", err);
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
  } catch (err) {
    console.error("Failed to compile wiki:", err);
  } finally {
    btn.disabled = false;
    btn.textContent = "Compile Wiki";
  }
});

// Settings
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
          `<div class="setting-row">
            <span class="setting-key">${escapeHtml(s.key)}</span>
            <span class="setting-value">${escapeHtml(String(s.value))}</span>
          </div>`
      )
      .join("");
  } catch (err) {
    console.error("Failed to load settings:", err);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Init
loadSessions();
loadDocuments();
loadWiki();
loadSettings();
