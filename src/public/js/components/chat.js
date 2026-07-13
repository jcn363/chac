import { marked } from "marked";
import DOMPurify from "dompurify";
import { apiGet, apiPost, apiPut, apiDelete, sendWsMessage, onWsMessage, connectWebSocket } from "../lib/api.js";
import { escapeHtml, showToast, toggleEmptyState } from "../lib/dom.js";
import { getCurrentSession, setCurrentSession, setCurrentToken } from "../lib/state.js";

marked.setOptions({ breaks: true, gfm: true });

let streamingDiv = null;

export function initChat() {
  document.getElementById("new-session")?.addEventListener("click", createSession);
  document.getElementById("chat-form")?.addEventListener("submit", sendMessage);
  document.getElementById("export-btn")?.addEventListener("click", exportChat);
  document.getElementById("search-toggle")?.addEventListener("click", toggleSearch);
  document.getElementById("msg-search")?.addEventListener("input", onSearchInput);

  document.getElementById("chat-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      document.getElementById("chat-form")?.requestSubmit();
    }
  });

  onWsMessage("chat:start", () => showTypingIndicator());
  onWsMessage("chat:chunk", (data) => appendStreamingChunk(data.content));
  onWsMessage("chat:done", (data) => finalizeStreaming(data.message));
  onWsMessage("chat:error", (data) => {
    hideTypingIndicator();
    showToast(data.error);
  });

  loadSessions();
}

async function createSession() {
  const btn = document.getElementById("new-session");
  btn.disabled = true;
  btn.textContent = "Creating...";
  try {
    const session = await apiPost("/api/chat/sessions", { title: "New Chat" });
    setCurrentSession(session.id);
    setCurrentToken(session.auth_token);
    connectWebSocket();
    loadSessions();
    loadMessages();
  } catch {
    showToast("Failed to create session");
  } finally {
    btn.disabled = false;
    btn.textContent = "+ New Session";
  }
}

async function sendMessage(e) {
  e.preventDefault();
  const sessionId = getCurrentSession();
  if (!sessionId) return;
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

  const sent = sendWsMessage({ type: "chat", sessionId, message: msg });
  if (!sent) {
    try {
      const data = await apiPost("/api/chat", { sessionId, message: msg });
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
  } else {
    input.disabled = false;
    sendBtn.disabled = false;
    input.placeholder = "Ask a question...";
    input.focus();
  }
}

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

function appendStreamingChunk(content) {
  hideTypingIndicator();
  if (!streamingDiv) {
    streamingDiv = document.createElement("div");
    streamingDiv.className = "message assistant";
    document.getElementById("messages")?.appendChild(streamingDiv);
  }
  const bubble = streamingDiv.querySelector(".message-bubble") || (() => {
    const b = document.createElement("div");
    b.className = "message-bubble";
    streamingDiv.appendChild(b);
    return b;
  })();
  bubble.dataset.md = (bubble.dataset.md || "") + content;
  bubble.innerHTML = DOMPurify.sanitize(marked.parse(bubble.dataset.md));
  streamingDiv.scrollIntoView({ behavior: "smooth" });
}

function finalizeStreaming(msg) {
  if (streamingDiv && msg) {
    streamingDiv.dataset.msgId = msg.id;
  }
  streamingDiv = null;
}

function addMessage(role, content, timestamp, msgId) {
  hideTypingIndicator();
  const div = document.createElement("div");
  div.className = `message ${role}`;
  if (msgId) div.dataset.msgId = msgId;
  const rendered = DOMPurify.sanitize(marked.parse(content));
  const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  const editBtn = role === "user" ? `<button class="msg-edit" data-tooltip="Edit" aria-label="Edit message">&#9998;</button>` : "";
  const deleteBtn = `<button class="msg-delete" data-tooltip="Delete" aria-label="Delete message">&times;</button>`;
  div.innerHTML = `<div class="message-bubble" data-md="${escapeHtml(content)}">${rendered}</div>` +
    `<span class="message-time">${timeStr}${editBtn}${deleteBtn}</span>`;
  document.getElementById("messages")?.appendChild(div);
  div.scrollIntoView({ behavior: "smooth" });

  if (role === "user") {
    div.querySelector(".msg-edit")?.addEventListener("click", () => startEditMessage(div));
  }
  div.querySelector(".msg-delete")?.addEventListener("click", async () => {
    if (!confirm("Delete this message?")) return;
    try {
      await apiDelete(`/api/chat/messages/${msgId}`);
      loadMessages();
      showToast("Message deleted", "success");
    } catch {
      showToast("Failed to delete message");
    }
  });
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
      await apiPut(`/api/chat/messages/${id}`, { content: newContent });
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
        await apiPut(`/api/chat/sessions/${id}`, { title: newTitle });
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

export async function loadSessions() {
  try {
    const sessions = await apiGet("/api/chat/sessions");
    const list = document.getElementById("session-list");
    const empty = document.getElementById("chat-empty");
    if (!list) return;

    toggleEmptyState(list, empty, sessions.length > 0);
    const current = getCurrentSession();

    list.innerHTML = sessions
      .map(
        (s) =>
          `<div class="doc-item ${s.id === current ? "active" : ""}" data-id="${s.id}" data-token="${escapeHtml(s.auth_token || "")}" tabindex="0">
            <span class="session-title">${escapeHtml(s.title || "Untitled")}</span>
            <button class="session-delete" data-id="${s.id}" aria-label="Delete session" data-tooltip="Delete">&times;</button>
          </div>`
      )
      .join("");

    list.querySelectorAll(".doc-item").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest(".session-delete") || e.target.closest(".session-rename")) return;
        setCurrentSession(el.dataset.id ?? null);
        setCurrentToken(el.dataset.token ?? null);
        connectWebSocket();
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
          await apiDelete(`/api/chat/sessions/${id}`);
          if (getCurrentSession() === id) {
            setCurrentSession(null);
            document.getElementById("messages").innerHTML = "";
          }
          loadSessions();
          showToast("Session deleted", "success");
        } catch {
          showToast("Failed to delete session");
        }
      });
    });

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
        if (draggedEl && draggedEl !== el) el.classList.add("drag-over");
      });
      el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
      el.addEventListener("drop", async (e) => {
        e.preventDefault();
        el.classList.remove("drag-over");
        if (!draggedEl || draggedEl === el) return;
        const items = [...list.querySelectorAll(".doc-item")];
        const fromIdx = items.indexOf(draggedEl);
        const toIdx = items.indexOf(el);
        if (fromIdx < toIdx) el.after(draggedEl);
        else el.before(draggedEl);
        const newOrder = [...list.querySelectorAll(".doc-item")].map((item) => item.dataset.id);
        try {
          await apiPut("/api/chat/sessions", { ids: newOrder });
        } catch {
          showToast("Failed to reorder sessions");
          loadSessions();
        }
      });
    });
  } catch {
    showToast("Failed to load sessions");
  }
}

async function loadMessages() {
  const messagesEl = document.getElementById("messages");
  if (!messagesEl) return;
  messagesEl.innerHTML = "";
  const sessionId = getCurrentSession();
  if (!sessionId) return;

  try {
    const messages = await apiGet(`/api/chat/sessions/${sessionId}/messages`);
    for (const msg of messages) {
      addMessage(msg.role, msg.content, msg.created_at, msg.id);
    }
  } catch {
    showToast("Failed to load messages");
  }
}

async function exportChat() {
  const sessionId = getCurrentSession();
  if (!sessionId) {
    showToast("Select a session to export");
    return;
  }
  try {
    const messages = await apiGet(`/api/chat/sessions/${sessionId}/messages`);
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
    a.download = `chat-${sessionId.slice(0, 8)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
    showToast("Chat exported", "success");
  } catch {
    showToast("Failed to export chat");
  }
}

function toggleSearch() {
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
}

function onSearchInput(e) {
  const query = e.target.value.trim();
  const countEl = document.getElementById("msg-search-count");
  clearSearchHighlights();
  if (!query) { countEl.classList.add("hidden"); return; }

  const messages = document.querySelectorAll("#messages .message-bubble");
  let matches = 0;
  messages.forEach((bubble) => {
    const md = bubble.dataset.md || "";
    bubble.innerHTML = DOMPurify.sanitize(marked.parse(md));
    highlightTextNode(bubble, query);
    matches += bubble.querySelectorAll("mark").length;
  });

  countEl.textContent = matches > 0 ? `${matches} match${matches > 1 ? "es" : ""}` : "No matches";
  countEl.classList.remove("hidden");

  const first = document.querySelector(".message-bubble mark");
  if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
}

function highlightTextNode(el, query) {
  if (!query) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  const lower = query.toLowerCase();
  textNodes.forEach((node) => {
    const text = node.textContent;
    const lowerText = text.toLowerCase();
    if (!lowerText.includes(lower)) return;
    const frag = document.createDocumentFragment();
    let idx = 0;
    while (idx < text.length) {
      const pos = lowerText.indexOf(lower, idx);
      if (pos === -1) { frag.appendChild(document.createTextNode(text.slice(idx))); break; }
      if (pos > idx) frag.appendChild(document.createTextNode(text.slice(idx, pos)));
      const mark = document.createElement("mark");
      mark.textContent = text.slice(pos, pos + query.length);
      frag.appendChild(mark);
      idx = pos + query.length;
    }
    node.parentNode.replaceChild(frag, node);
  });
}

function clearSearchHighlights() {
  document.querySelectorAll("#messages .message-bubble").forEach((bubble) => {
    const md = bubble.dataset.md || "";
    bubble.innerHTML = DOMPurify.sanitize(marked.parse(md));
  });
}
