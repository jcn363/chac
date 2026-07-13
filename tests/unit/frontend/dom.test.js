import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { escapeHtml, showToast, toggleEmptyState } from "../../../src/public/js/lib/dom.js";

describe("escapeHtml", () => {
  it("escapes ampersands", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes angle brackets", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    );
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it("escapes multiple special characters in one string", () => {
    expect(escapeHtml('<div class="x">y & z</div>')).toBe(
      "&lt;div class=&quot;x&quot;&gt;y &amp; z&lt;/div&gt;"
    );
  });

  it("returns empty string for empty input", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("returns plain text unchanged", () => {
    expect(escapeHtml("hello world 123")).toBe("hello world 123");
  });

  it("escapes all five characters simultaneously", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});

describe("toggleEmptyState", () => {
  let listEl, emptyEl;

  beforeEach(() => {
    listEl = { classList: { add() {}, remove() {} } };
    emptyEl = { classList: { add() {}, remove() {} } };
  });

  it("hides empty state and shows list when hasItems is true", () => {
    const removed = [];
    const added = [];
    listEl.classList.remove = (c) => removed.push(c);
    emptyEl.classList.add = (c) => added.push(c);

    toggleEmptyState(listEl, emptyEl, true);

    expect(removed).toContain("hidden");
    expect(added).toContain("hidden");
  });

  it("shows empty state and hides list when hasItems is false", () => {
    const addedToList = [];
    const removedFromEmpty = [];
    listEl.classList.add = (c) => addedToList.push(c);
    emptyEl.classList.remove = (c) => removedFromEmpty.push(c);

    toggleEmptyState(listEl, emptyEl, false);

    expect(addedToList).toContain("hidden");
    expect(removedFromEmpty).toContain("hidden");
  });

  it("does not crash with null listEl", () => {
    expect(() => toggleEmptyState(null, emptyEl, true)).not.toThrow();
  });

  it("does not crash with null emptyEl", () => {
    expect(() => toggleEmptyState(listEl, null, false)).not.toThrow();
  });

  it("does not crash with both null", () => {
    expect(() => toggleEmptyState(null, null, true)).not.toThrow();
  });
});

function createMockElement() {
  const classes = [];
  return {
    className: "",
    textContent: "",
    classList: {
      add(c) { classes.push(c); },
      remove(c) { const i = classes.indexOf(c); if (i >= 0) classes.splice(i, 1); },
      contains(c) { return classes.includes(c); },
    },
    _classes: classes,
    remove() {},
  };
}

describe("showToast", () => {
  let appendedToasts;

  beforeEach(() => {
    appendedToasts = [];
    globalThis.document = {
      getElementById: () => ({
        appendChild: (el) => appendedToasts.push(el),
      }),
      createElement: () => createMockElement(),
    };
    globalThis.requestAnimationFrame = (cb) => cb();
  });

  afterEach(() => {
    delete globalThis.document;
    delete globalThis.requestAnimationFrame;
  });

  it("creates a toast element with the message", () => {
    showToast("test message", "error", 1000);
    expect(appendedToasts.length).toBe(1);
    expect(appendedToasts[0].textContent).toBe("test message");
  });

  it("applies the type as a CSS class", () => {
    showToast("info toast", "info", 1000);
    expect(appendedToasts[0].className).toBe("toast info");
  });

  it("defaults type to error", () => {
    showToast("default toast");
    expect(appendedToasts[0].className).toBe("toast error");
  });

  it("adds show class via requestAnimationFrame", () => {
    let rafCallback;
    globalThis.requestAnimationFrame = (cb) => {
      rafCallback = cb;
      return 1;
    };
    showToast("raf test", "success", 1000);
    const toast = appendedToasts[0];
    expect(toast.classList.contains("show")).toBe(false);
    rafCallback();
    expect(toast.classList.contains("show")).toBe(true);
  });
});
