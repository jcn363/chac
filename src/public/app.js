import { connectWebSocket } from "./js/lib/api.js";
import { initChat } from "./js/components/chat.js";
import { initDocuments } from "./js/components/documents.js";
import { initWiki } from "./js/components/wiki.js";
import { initMemory } from "./js/components/memory.js";
import { initSettings } from "./js/components/settings.js";
import { initHelp } from "./js/components/help.js";

// Tab switching
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

// Dark mode
let currentTheme = "system";
const THEME_CYCLE = ["system", "dark", "light"];

function applyTheme(mode) {
  currentTheme = mode;
  document.body.classList.remove("dark", "light");
  if (mode === "dark") document.body.classList.add("dark");
  else if (mode === "light") document.body.classList.add("light");
}

async function loadTheme() {
  try {
    const { default: { apiGet } } = await import("./js/lib/api.js");
    const settings = await apiGet("/api/settings");
    const saved = settings.find((s) => s.key === "ui.dark_mode");
    if (saved) applyTheme(saved.value || "system");
  } catch {}
}

async function cycleTheme() {
  const idx = THEME_CYCLE.indexOf(currentTheme);
  const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
  applyTheme(next);
  try {
    const { default: { apiPut } } = await import("./js/lib/api.js");
    await apiPut("/api/settings", { key: "ui.dark_mode", value: next });
  } catch {}
  const { default: { showToast } } = await import("./js/lib/dom.js");
  showToast(`Theme: ${next}`, "success", 1500);
}

document.getElementById("theme-toggle")?.addEventListener("click", cycleTheme);
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (currentTheme === "system") applyTheme("system");
});

// Keyboard nav for list items
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    const item = e.target.closest(".doc-item, .wiki-item");
    if (item) {
      e.preventDefault();
      item.click();
    }
  }
});

// Init all components
loadTheme();
connectWebSocket();
initChat();
initDocuments();
initWiki();
initMemory();
initSettings();
initHelp();
