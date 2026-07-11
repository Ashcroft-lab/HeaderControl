// Common request header names for autocomplete hints.
// Focused on headers people typically set/override in tools like this.

export const COMMON_REQUEST_HEADERS = [
  // Auth & identity
  "Authorization",
  "Proxy-Authorization",
  "Cookie",
  "X-API-Key",
  "X-Auth-Token",
  "X-Access-Token",
  "X-CSRF-Token",
  "X-XSRF-TOKEN",

  // Content negotiation
  "Accept",
  "Accept-Charset",
  "Accept-Encoding",
  "Accept-Language",
  "Content-Type",
  "Content-Length",
  "Content-Encoding",
  "Content-Language",

  // Caching / conditional
  "Cache-Control",
  "Pragma",
  "If-Match",
  "If-None-Match",
  "If-Modified-Since",
  "If-Unmodified-Since",
  "If-Range",

  // Client / navigation
  "User-Agent",
  "Referer",
  "Origin",
  "Host",
  "From",
  "Range",
  "TE",
  "Upgrade-Insecure-Requests",

  // Connection / transfer
  "Connection",
  "Keep-Alive",
  "Transfer-Encoding",
  "Trailer",
  "Via",
  "Forwarded",

  // Proxy / forwarding
  "X-Forwarded-For",
  "X-Forwarded-Host",
  "X-Forwarded-Proto",
  "X-Real-IP",
  "X-Forwarded-Prefix",

  // CORS preflight related (request side)
  "Access-Control-Request-Method",
  "Access-Control-Request-Headers",

  // Common app / API custom headers
  "X-Requested-With",
  "X-Request-ID",
  "X-Correlation-ID",
  "X-Client-ID",
  "X-Client-Version",
  "X-App-Version",
  "X-Device-ID",
  "X-Tenant-ID",
  "X-Organization-ID",
  "X-User-ID",
  "X-Idempotency-Key",
  "X-Trace-ID",
  "X-Custom-Header",

  // Prefer / misc
  "Prefer",
  "Purpose",
  "Sec-Fetch-Dest",
  "Sec-Fetch-Mode",
  "Sec-Fetch-Site",
  "Sec-Fetch-User",
  "Sec-CH-UA",
  "Sec-CH-UA-Mobile",
  "Sec-CH-UA-Platform",
];

const STYLE_ID = "header-hint-styles";
const MAX_VISIBLE = 8;

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .header-hint-wrap {
      position: relative;
      display: block;
      min-width: 0;
    }
    .header-hint-wrap > input {
      width: 100%;
    }
    .header-hint-menu {
      position: absolute;
      left: 0;
      right: 0;
      top: calc(100% + 4px);
      z-index: 50;
      margin: 0;
      padding: 4px;
      list-style: none;
      max-height: 180px;
      overflow-y: auto;
      background: var(--surface, #1b1e27);
      border: 1px solid var(--border, #2a2e3a);
      border-radius: 7px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    }
    .header-hint-menu[hidden] {
      display: none !important;
    }
    .header-hint-item {
      padding: 6px 8px;
      border-radius: 5px;
      font-family: var(--mono, ui-monospace, "SF Mono", Consolas, monospace);
      font-size: inherit;
      color: var(--text, #e8e9ed);
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .header-hint-item:hover,
    .header-hint-item.is-active {
      background: var(--accent-dim, #7c5cfc33);
      color: var(--text, #e8e9ed);
    }
  `;
  document.head.appendChild(style);
}

function filterHeaders(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = [];
  const contains = [];
  for (const name of COMMON_REQUEST_HEADERS) {
    const lower = name.toLowerCase();
    if (lower.startsWith(q)) starts.push(name);
    else if (lower.includes(q)) contains.push(name);
  }
  return [...starts, ...contains].slice(0, MAX_VISIBLE);
}

function hideMenu(menu) {
  menu.hidden = true;
  menu.innerHTML = "";
  menu.dataset.activeIndex = "-1";
}

function renderMenu(menu, matches, activeIndex) {
  if (!matches.length) {
    hideMenu(menu);
    return;
  }
  menu.hidden = false;
  menu.innerHTML = matches
    .map(
      (name, i) =>
        `<li class="header-hint-item${i === activeIndex ? " is-active" : ""}" role="option" data-value="${name.replace(/"/g, "&quot;")}">${name}</li>`
    )
    .join("");
  menu.dataset.activeIndex = String(activeIndex);
}

/**
 * Custom filtered header-name hints.
 * Shows only after the user types, and only matching names.
 * Styled to match the extension UI (not native datalist).
 */
export function attachHeaderNameHints(input) {
  if (!input || input.tagName !== "INPUT" || input.dataset.hintsAttached) return;
  input.dataset.hintsAttached = "1";
  input.setAttribute("autocomplete", "off");
  input.setAttribute("spellcheck", "false");
  input.removeAttribute("list");

  ensureStyles();

  const wrap = document.createElement("div");
  wrap.className = "header-hint-wrap";
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const menu = document.createElement("ul");
  menu.className = "header-hint-menu";
  menu.hidden = true;
  menu.setAttribute("role", "listbox");
  wrap.appendChild(menu);

  let matches = [];
  // Hints stay closed until the user types; stay closed after a pick.
  let hintsEnabled = false;

  const sync = () => {
    if (!hintsEnabled) {
      hideMenu(menu);
      matches = [];
      return;
    }
    matches = filterHeaders(input.value);
    renderMenu(menu, matches, matches.length ? 0 : -1);
  };

  const pick = (value) => {
    hintsEnabled = false;
    matches = [];
    input.value = value;
    hideMenu(menu);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus();
  };

  input.addEventListener("input", () => {
    if (!hintsEnabled) {
      hideMenu(menu);
      return;
    }
    sync();
  });

  input.addEventListener("focus", () => {
    hideMenu(menu);
  });

  input.addEventListener("blur", () => {
    // Delay so a click on an item can register.
    setTimeout(() => hideMenu(menu), 120);
  });

  input.addEventListener("keydown", (e) => {
    const typing =
      e.key.length === 1 || e.key === "Backspace" || e.key === "Delete";
    if (typing) {
      hintsEnabled = true;
      // Menu updates on the following input event.
      return;
    }

    if (menu.hidden || !matches.length) {
      if (e.key === "Escape") hideMenu(menu);
      return;
    }

    let idx = Number(menu.dataset.activeIndex || "-1");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      idx = Math.min(idx + 1, matches.length - 1);
      renderMenu(menu, matches, idx);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      idx = Math.max(idx - 1, 0);
      renderMenu(menu, matches, idx);
    } else if (e.key === "Enter" && idx >= 0) {
      e.preventDefault();
      pick(matches[idx]);
    } else if (e.key === "Escape") {
      hintsEnabled = false;
      hideMenu(menu);
    }
  });

  menu.addEventListener("mousedown", (e) => {
    const item = e.target.closest(".header-hint-item");
    if (!item) return;
    e.preventDefault();
    pick(item.dataset.value);
  });
}
