import {
  getProfiles,
  saveProfiles,
  createProfile,
  exportProfiles,
  parseImport,
  exclusiveEnable,
  normalizeAtMostOneEnabled,
  MAX_PROFILES,
  MAX_HEADERS_PER_PROFILE,
} from "../lib/storage.js";
import { normalizeDomainList } from "../lib/rule-compiler.js";
import { attachHeaderNameHints } from "../lib/common-headers.js";

let profiles = [];
let selectedId = null;

const listEl = document.getElementById("profile-list");
const editorEl = document.getElementById("editor");

const versionEl = document.getElementById("ext-version");
if (versionEl) {
  versionEl.textContent = `v${chrome.runtime.getManifest().version}`;
}

async function load() {
  const raw = await getProfiles();
  profiles = normalizeAtMostOneEnabled(raw);
  const active = profiles.find((p) => p.enabled);
  selectedId = active?.id || profiles[0]?.id || null;
  if (raw.some((p, i) => Boolean(p.enabled) !== Boolean(profiles[i].enabled))) {
    await saveProfiles(profiles);
  }
  renderList();
  renderEditor();
  refreshAddProfileButton();
}

/** Select a profile: it becomes the only active one; all others are disabled. */
async function switchTo(id) {
  selectedId = id;
  profiles = exclusiveEnable(profiles, id);
  await saveProfiles(profiles);
  renderList();
  renderEditor();
}

function renderList() {
  if (profiles.length === 0) {
    listEl.innerHTML = `<li class="empty">No profiles yet</li>`;
    return;
  }
  listEl.innerHTML = profiles
    .map(
      (p) => `
      <li class="${p.id === selectedId ? "selected" : ""}" data-id="${p.id}">
        <span class="dot" style="background:${p.color}"></span>
        <span class="name">${escapeHtml(p.name)}</span>
        ${p.enabled ? '<span class="on">active</span>' : ""}
      </li>`
    )
    .join("");

  listEl.querySelectorAll("li[data-id]").forEach((li) => {
    li.addEventListener("click", () => switchTo(li.dataset.id));
  });
}

function renderEditor() {
  const profile = profiles.find((p) => p.id === selectedId);
  if (!profile) {
    editorEl.innerHTML = `<p class="empty-state">Select a profile on the left, or create a new one.</p>`;
    return;
  }

  editorEl.innerHTML = `
    <div class="field-row top">
      <input id="name" class="name-input" value="${escapeAttr(profile.name)}" />
      <button id="delete" class="danger">Delete</button>
    </div>

    <div class="field-row">
      <label for="urlFilter">Applies to</label>
      <input id="urlFilter" class="mono" value="${escapeAttr(profile.urlFilter)}" placeholder="*://*.example.com/*" />
      <p class="hint">DNR urlFilter syntax. <code>*://*/*</code> matches every site.</p>
    </div>

    <div class="field-row">
      <label for="excludedDomains">Except on these domains</label>
      <input id="excludedDomains" class="mono" value="${escapeAttr((profile.excludedDomains || []).join(", "))}" placeholder="staging.example.com, internal.example.com" />
      <p class="hint">Comma separated hostnames only (no <code>https://</code>). Skips those sites and their subdomains — both requests to them and from pages on them.</p>
    </div>

    <h2>Request headers</h2>
    <div id="requestHeaders" class="header-table"></div>
    <button data-add="requestHeaders" class="add-row">+ Add request header</button>
  `;

  renderHeaderRows("requestHeaders", profile.requestHeaders);

  editorEl.querySelector("#name").addEventListener("input", (e) => updateProfile({ name: e.target.value }));
  editorEl.querySelector("#urlFilter").addEventListener("input", (e) => updateProfile({ urlFilter: e.target.value }));
  editorEl.querySelector("#excludedDomains").addEventListener("change", (e) => {
    const excludedDomains = normalizeDomainList(
      e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
    );
    e.target.value = excludedDomains.join(", ");
    updateProfile({ excludedDomains });
  });
  editorEl.querySelector("#excludedDomains").addEventListener("input", (e) =>
    updateProfile({
      excludedDomains: e.target.value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    })
  );
  editorEl.querySelector("#delete").addEventListener("click", async () => {
    if (!confirm(`Delete "${profile.name}"? This can't be undone.`)) return;
    profiles = profiles.filter((p) => p.id !== selectedId);
    if (profiles.length) {
      // Keep exactly one active after delete.
      const nextId = profiles[0].id;
      profiles = exclusiveEnable(profiles, nextId);
      selectedId = nextId;
    } else {
      selectedId = null;
    }
    await saveProfiles(profiles);
    renderList();
    renderEditor();
    refreshAddProfileButton();
  });
  editorEl.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.add;
      const current = profiles.find((p) => p.id === selectedId);
      if (!current[key]) current[key] = [];
      if (current[key].length >= MAX_HEADERS_PER_PROFILE) {
        alert(`Each profile can have at most ${MAX_HEADERS_PER_PROFILE} headers.`);
        return;
      }
      current[key].push({ name: "", value: "", operation: "set", enabled: true });
      saveProfiles(profiles).then(renderEditor);
    });
  });

  const addBtn = editorEl.querySelector("[data-add]");
  if (addBtn) {
    const atLimit = (profile.requestHeaders || []).length >= MAX_HEADERS_PER_PROFILE;
    addBtn.disabled = atLimit;
    addBtn.title = atLimit
      ? `Maximum ${MAX_HEADERS_PER_PROFILE} headers per profile`
      : "";
  }
}

function renderHeaderRows(key, headers) {
  const container = document.getElementById(key);
  if (headers.length === 0) {
    container.innerHTML = `<p class="empty-rows">No ${key === "requestHeaders" ? "request" : "response"} headers yet.</p>`;
    return;
  }

  // Older rows without enabled default to checked.
  headers.forEach((h) => {
    if (h.enabled === undefined) h.enabled = true;
  });

  container.innerHTML = headers
    .map(
      (h, i) => `
      <div class="header-row ${h.enabled === false ? "disabled-row" : ""}" data-index="${i}">
        <div class="header-top">
          <input type="checkbox" data-field="enabled" ${h.enabled !== false ? "checked" : ""} title="Apply this header" aria-label="Apply header" />
          <input class="mono" placeholder="Header-Name" value="${escapeAttr(h.name)}" data-field="name" />
          <select data-field="operation">
            <option value="set" ${h.operation === "set" || h.operation === "append" ? "selected" : ""}>set</option>
            <option value="remove" ${h.operation === "remove" ? "selected" : ""}>remove</option>
          </select>
          <button data-remove aria-label="Remove header">&times;</button>
        </div>
        <textarea class="mono value" data-field="value" placeholder="value (supports long tokens / JWTs)" rows="2" ${h.operation === "remove" ? "disabled" : ""}>${escapeText(h.value)}</textarea>
      </div>`
    )
    .join("");

  container.querySelectorAll(".header-row").forEach((row) => {
    const index = Number(row.dataset.index);
    const nameInput = row.querySelector('[data-field="name"]');
    if (nameInput) attachHeaderNameHints(nameInput);
    const valueEl = row.querySelector('[data-field="value"]');
    if (valueEl) {
      valueEl.addEventListener("focus", () => expandValue(valueEl));
      valueEl.addEventListener("blur", () => collapseValue(valueEl));
    }

    row.querySelectorAll("[data-field]").forEach((input) => {
      const field = input.dataset.field;
      if (field === "enabled") {
        input.addEventListener("change", () => {
          headers[index].enabled = input.checked;
          saveProfiles(profiles);
          row.classList.toggle("disabled-row", !input.checked);
        });
        return;
      }
      const evt = input.tagName === "SELECT" ? "change" : "input";
      input.addEventListener(evt, (e) => {
        headers[index][field] = e.target.value;
        if (field === "value" && document.activeElement === e.target) {
          expandValue(e.target);
        }
        saveProfiles(profiles);
        if (field === "operation") renderEditor();
      });
    });
    row.querySelector("[data-remove]").addEventListener("click", () => {
      headers.splice(index, 1);
      saveProfiles(profiles).then(renderEditor);
    });
  });
}

function expandValue(el) {
  el.classList.add("expanded");
  el.style.height = "auto";
  el.style.height = `${Math.min(Math.max(el.scrollHeight, 72), 200)}px`;
}

function collapseValue(el) {
  el.classList.remove("expanded");
  el.style.height = "";
}

function updateProfile(patch) {
  const i = profiles.findIndex((p) => p.id === selectedId);
  if (i < 0) return;
  profiles[i] = { ...profiles[i], ...patch };
  saveProfiles(profiles);
  renderList();
}

document.getElementById("add-profile").addEventListener("click", async () => {
  if (profiles.length >= MAX_PROFILES) {
    alert(`You can create at most ${MAX_PROFILES} profiles.`);
    return;
  }
  const profile = createProfile(`Profile ${profiles.length + 1}`);
  profiles = exclusiveEnable([...profiles, profile], profile.id);
  selectedId = profile.id;
  await saveProfiles(profiles);
  renderList();
  renderEditor();
  refreshAddProfileButton();
});

function refreshAddProfileButton() {
  const btn = document.getElementById("add-profile");
  const atLimit = profiles.length >= MAX_PROFILES;
  btn.disabled = atLimit;
  btn.title = atLimit ? `Maximum ${MAX_PROFILES} profiles` : "";
}

document.getElementById("export").addEventListener("click", () => {
  const blob = new Blob([exportProfiles(profiles)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `headercontrol-profiles-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("import").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const imported = parseImport(await file.text());
    const room = Math.max(0, MAX_PROFILES - profiles.length);
    if (room === 0) {
      alert(`You already have the maximum of ${MAX_PROFILES} profiles.`);
      e.target.value = "";
      return;
    }
    const toAdd = imported.slice(0, room);
    if (toAdd.length < imported.length) {
      alert(
        `Only ${toAdd.length} of ${imported.length} imported profiles were added (max ${MAX_PROFILES} total).`
      );
    }
    profiles = exclusiveEnable(
      [...profiles.map((p) => ({ ...p, enabled: false })), ...toAdd],
      toAdd[0]?.id || null
    );
    selectedId = toAdd[0]?.id || selectedId;
    await saveProfiles(profiles);
    renderList();
    renderEditor();
    refreshAddProfileButton();
  } catch (err) {
    alert(`Import failed: ${err.message}`);
  }
  e.target.value = "";
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
function escapeAttr(str) {
  return (str ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
function escapeText(str) {
  return (str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

load();
