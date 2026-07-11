import {
  getProfiles,
  saveProfiles,
  createProfile,
  exportProfiles,
  parseImport,
  exclusiveEnable,
  normalizeAtMostOneEnabled,
} from "../lib/storage.js";

let profiles = [];
let selectedId = null;

const listEl = document.getElementById("profile-list");
const editorEl = document.getElementById("editor");

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
      <p class="hint">Comma separated. Excluding a domain also excludes its subdomains.</p>
    </div>

    <h2>Request headers</h2>
    <div id="requestHeaders" class="header-table"></div>
    <button data-add="requestHeaders" class="add-row">+ Add request header</button>
  `;

  renderHeaderRows("requestHeaders", profile.requestHeaders);

  editorEl.querySelector("#name").addEventListener("input", (e) => updateProfile({ name: e.target.value }));
  editorEl.querySelector("#urlFilter").addEventListener("input", (e) => updateProfile({ urlFilter: e.target.value }));
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
  });
  editorEl.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.add;
      const current = profiles.find((p) => p.id === selectedId);
      current[key].push({ name: "", value: "", operation: "set", enabled: true });
      saveProfiles(profiles).then(renderEditor);
    });
  });
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
        <input type="checkbox" data-field="enabled" ${h.enabled !== false ? "checked" : ""} title="Apply this header" aria-label="Apply header" />
        <input class="mono" placeholder="Header-Name" value="${escapeAttr(h.name)}" data-field="name" />
        <select data-field="operation">
          <option value="set" ${h.operation === "set" ? "selected" : ""}>set</option>
          <option value="append" ${h.operation === "append" ? "selected" : ""}>append</option>
          <option value="remove" ${h.operation === "remove" ? "selected" : ""}>remove</option>
        </select>
        <input class="mono" placeholder="value" value="${escapeAttr(h.value)}" data-field="value" ${h.operation === "remove" ? "disabled" : ""} />
        <button data-remove aria-label="Remove header">&times;</button>
      </div>`
    )
    .join("");

  container.querySelectorAll(".header-row").forEach((row) => {
    const index = Number(row.dataset.index);
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

function updateProfile(patch) {
  const i = profiles.findIndex((p) => p.id === selectedId);
  if (i < 0) return;
  profiles[i] = { ...profiles[i], ...patch };
  saveProfiles(profiles);
  renderList();
}

document.getElementById("add-profile").addEventListener("click", async () => {
  const profile = createProfile(`Profile ${profiles.length + 1}`);
  profiles = exclusiveEnable([...profiles, profile], profile.id);
  selectedId = profile.id;
  await saveProfiles(profiles);
  renderList();
  renderEditor();
});

document.getElementById("export").addEventListener("click", () => {
  const blob = new Blob([exportProfiles(profiles)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `headercraft-profiles-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("import").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const imported = parseImport(await file.text());
    profiles = exclusiveEnable(
      [...profiles.map((p) => ({ ...p, enabled: false })), ...imported],
      imported[0]?.id || null
    );
    selectedId = imported[0]?.id || selectedId;
    await saveProfiles(profiles);
    renderList();
    renderEditor();
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
  return (str ?? "").replace(/"/g, "&quot;");
}

load();
