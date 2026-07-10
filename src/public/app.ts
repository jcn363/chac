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
let currentSession: string | null = null;

document.getElementById("new-session")?.addEventListener("click", async () => {
  const res = await fetch(`${API}/api/chat/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "New Chat" }),
  });
  const session = await res.json();
  currentSession = session.id;
  loadSessions();
});

document.getElementById("chat-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentSession) return;
  const input = document.getElementById("chat-input") as HTMLTextAreaElement;
  const msg = input.value.trim();
  if (!msg) return;

  addMessage("user", msg);
  input.value = "";

  const res = await fetch(`${API}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: currentSession, message: msg }),
  });
  const data = await res.json();
  addMessage("assistant", data.content);
});

function addMessage(role: string, content: string) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.innerHTML = `<div class="message-bubble">${escapeHtml(content)}</div>`;
  document.getElementById("messages")?.appendChild(div);
  div.scrollIntoView({ behavior: "smooth" });
}

async function loadSessions() {
  const res = await fetch(`${API}/api/chat/sessions`);
  const sessions = await res.json();
  const list = document.getElementById("session-list");
  if (!list) return;
  list.innerHTML = sessions
    .map(
      (s: any) =>
        `<div class="doc-item ${s.id === currentSession ? "active" : ""}" data-id="${s.id}">${escapeHtml(s.title || "Untitled")}</div>`
    )
    .join("");
  list.querySelectorAll(".doc-item").forEach((el) => {
    el.addEventListener("click", () => {
      currentSession = el.dataset.id;
      loadSessions();
    });
  });
}

// Documents
async function loadDocuments(page = 1) {
  const res = await fetch(`${API}/api/documents?page=${page}`);
  const data = await res.json();
  const list = document.getElementById("doc-list");
  if (!list) return;
  list.innerHTML = data.documents
    .map(
      (d: any) =>
        `<div class="doc-item" data-id="${d.id}">
          <strong>${escapeHtml(d.title)}</strong>
          <span class="setting-value">${d.chunk_count} chunks</span>
        </div>`
    )
    .join("");
}

document.getElementById("ingest-btn")?.addEventListener("click", async () => {
  const path = prompt("Enter file path:");
  if (!path) return;
  await fetch(`${API}/api/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  loadDocuments();
});

// Wiki
async function loadWiki() {
  const res = await fetch(`${API}/api/wiki`);
  const data = await res.json();
  const list = document.getElementById("wiki-list");
  if (!list) return;
  list.innerHTML = data.pages
    .map(
      (p: any) =>
        `<div class="wiki-item">
          <strong>${escapeHtml(p.title)}</strong>
          <p>${escapeHtml(p.content.slice(0, 200))}...</p>
        </div>`
    )
    .join("");
}

document.getElementById("compile-btn")?.addEventListener("click", async () => {
  const btn = document.getElementById("compile-btn") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "Compiling...";
  await fetch(`${API}/api/wiki/compile`, { method: "POST" });
  btn.disabled = false;
  btn.textContent = "Compile Wiki";
  loadWiki();
});

// Settings
async function loadSettings() {
  const res = await fetch(`${API}/api/settings`);
  const settings = await res.json();
  const list = document.getElementById("settings-list");
  if (!list) return;
  list.innerHTML = settings
    .map(
      (s: any) =>
        `<div class="setting-row">
          <span class="setting-key">${escapeHtml(s.key)}</span>
          <span class="setting-value">${escapeHtml(s.value)}</span>
        </div>`
    )
    .join("");
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Init
loadSessions();
loadDocuments();
loadWiki();
loadSettings();
