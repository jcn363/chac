export function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function showToast(message, type = "error", duration = 3000) {
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

export function toggleEmptyState(listEl, emptyEl, hasItems) {
  if (hasItems) {
    listEl?.classList.remove("hidden");
    emptyEl?.classList.add("hidden");
  } else {
    listEl?.classList.add("hidden");
    emptyEl?.classList.remove("hidden");
  }
}
