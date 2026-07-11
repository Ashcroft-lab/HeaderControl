import {
  getProfiles,
  saveProfiles,
  exclusiveEnable,
  getPauseState,
  pauseAll,
  resumeAll,
  MAX_HEADERS_PER_PROFILE,
} from "../lib/storage.js";
import { countActiveHeaders } from "../lib/rule-compiler.js";
import { attachHeaderNameHints } from "../lib/common-headers.js";

const list = document.getElementById("profile-list");
const countEl = document.getElementById("header-count");
const pauseBtn = document.getElementById("pause-toggle");
const pauseIcon = document.getElementById("pause-icon");
const pausedBanner = document.getElementById("paused-banner");
const quickEdit = document.getElementById("quick-edit");
const editLabel = document.getElementById("edit-label");
const headerRows = document.getElementById("header-rows");
const addHeaderBtn = document.getElementById("add-header");

/** Profile currently shown in the quick editor (usually the active one). */
let selectedId = null;
/** Skip full re-render when our own saves echo back via storage.onChanged. */
let skipNextStorageRender = false;

document.getElementById("manage").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

pauseBtn.addEventListener("click", async () => {
  const { paused } = await getPauseState();
  if (paused) await resumeAll();
  else await pauseAll();
  render();
});

addHeaderBtn.addEventListener("click", async () => {
  const profiles = await getProfiles();
  const profile = profiles.find((p) => p.id === selectedId);
  if (!profile) return;
  if (!profile.requestHeaders) profile.requestHeaders = [];
  if (profile.requestHeaders.length >= MAX_HEADERS_PER_PROFILE) {
    alert(`Each profile can have at most ${MAX_HEADERS_PER_PROFILE} headers.`);
    return;
  }
  profile.requestHeaders.push({
    name: "",
    value: "",
    operation: "set",
    enabled: true,
  });
  await persist(profiles);
  renderHeaderEditor(profile);
  updateCountUi(profiles, (await getPauseState()).paused);
  // Focus the new name field.
  const nameInputs = headerRows.querySelectorAll('[data-field="name"]');
  nameInputs[nameInputs.length - 1]?.focus();
});

async function persist(profiles) {
  skipNextStorageRender = true;
  await saveProfiles(profiles);
  // Allow later external changes to re-render again.
  queueMicrotask(() => {
    skipNextStorageRender = false;
  });
}

async function switchTo(id) {
  const { paused } = await getPauseState();
  if (paused) {
    await chrome.storage.local.set({ paused: false, resumeProfileId: null });
  }
  selectedId = id;
  const profiles = await getProfiles();
  await saveProfiles(exclusiveEnable(profiles, id));
  render();
}

function updateCountAndPauseUi(profiles, paused) {
  updateCountUi(profiles, paused);

  pausedBanner.hidden = !paused;
  pauseIcon.textContent = paused ? "▶" : "⏸";
  pauseBtn.title = paused ? "Resume" : "Pause";
  pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
  pauseBtn.classList.toggle("paused", paused);
  document.body.classList.toggle("is-paused", paused);
}

function updateCountUi(profiles, paused) {
  const active = profiles.find((p) => p.enabled);
  const count = paused ? 0 : countActiveHeaders(active);

  if (!paused && count > 0) {
    countEl.hidden = false;
    countEl.textContent = String(count);
  } else {
    countEl.hidden = true;
  }
}

function renderHeaderEditor(profile) {
  if (!profile) {
    quickEdit.hidden = true;
    return;
  }

  quickEdit.hidden = false;
  editLabel.textContent = profile.name;
  const atHeaderLimit = (profile.requestHeaders || []).length >= MAX_HEADERS_PER_PROFILE;
  addHeaderBtn.disabled = atHeaderLimit;
  addHeaderBtn.title = atHeaderLimit
    ? `Maximum ${MAX_HEADERS_PER_PROFILE} headers per profile`
    : "Add header";

  const headers = profile.requestHeaders || [];
  headers.forEach((h) => {
    if (h.enabled === undefined) h.enabled = true;
  });

  if (headers.length === 0) {
    headerRows.innerHTML = `<p class="empty-headers">No headers yet</p>`;
    return;
  }

  headerRows.innerHTML = headers
    .map(
      (h, i) => `
      <div class="q-row ${h.enabled === false ? "off" : ""}" data-index="${i}">
        <div class="q-top">
          <input type="checkbox" data-field="enabled" ${h.enabled !== false ? "checked" : ""} title="Apply" aria-label="Apply header" />
          <input class="mono" data-field="name" placeholder="Header" value="${escapeAttr(h.name)}" />
          <select data-field="operation" aria-label="Operation">
            <option value="set" ${h.operation === "set" || h.operation === "append" ? "selected" : ""}>set</option>
            <option value="remove" ${h.operation === "remove" ? "selected" : ""}>remove</option>
          </select>
          <button type="button" data-remove aria-label="Remove">&times;</button>
        </div>
        <textarea class="mono value" data-field="value" placeholder="value (tokens, JWTs, long strings OK)" rows="2" ${h.operation === "remove" ? "disabled" : ""}>${escapeText(h.value)}</textarea>
      </div>`
    )
    .join("");

  headerRows.querySelectorAll(".q-row").forEach((row) => {
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
        input.addEventListener("change", async () => {
          const profiles = await getProfiles();
          const p = profiles.find((x) => x.id === selectedId);
          if (!p?.requestHeaders?.[index]) return;
          p.requestHeaders[index].enabled = input.checked;
          await persist(profiles);
          row.classList.toggle("off", !input.checked);
          updateCountUi(profiles, (await getPauseState()).paused);
        });
        return;
      }

      if (input.tagName === "SELECT") {
        input.addEventListener("change", async () => {
          const profiles = await getProfiles();
          const p = profiles.find((x) => x.id === selectedId);
          if (!p?.requestHeaders?.[index]) return;
          p.requestHeaders[index].operation = input.value;
          await persist(profiles);
          renderHeaderEditor(p);
          updateCountUi(profiles, (await getPauseState()).paused);
        });
      } else {
        let timer = null;
        const commit = async () => {
          const profiles = await getProfiles();
          const p = profiles.find((x) => x.id === selectedId);
          if (!p?.requestHeaders?.[index]) return;
          p.requestHeaders[index][field] = input.value;
          await persist(profiles);
          updateCountUi(profiles, (await getPauseState()).paused);
        };
        input.addEventListener("input", () => {
          if (field === "value" && document.activeElement === input) {
            expandValue(input);
          }
          clearTimeout(timer);
          timer = setTimeout(commit, 250);
        });
        input.addEventListener("change", commit);
      }
    });

    row.querySelector("[data-remove]").addEventListener("click", async () => {
      const profiles = await getProfiles();
      const p = profiles.find((x) => x.id === selectedId);
      if (!p?.requestHeaders) return;
      p.requestHeaders.splice(index, 1);
      await persist(profiles);
      renderHeaderEditor(p);
      updateCountUi(profiles, (await getPauseState()).paused);
    });
  });
}

function expandValue(el) {
  el.classList.add("expanded");
  el.style.height = "auto";
  el.style.height = `${Math.min(Math.max(el.scrollHeight, 64), 160)}px`;
}

function collapseValue(el) {
  el.classList.remove("expanded");
  el.style.height = "";
}

async function render() {
  const [profiles, { paused, resumeProfileId }] = await Promise.all([
    getProfiles(),
    getPauseState(),
  ]);
  updateCountAndPauseUi(profiles, paused);

  if (profiles.length === 0) {
    list.innerHTML = `<li class="empty">No profiles yet. Click Manage to add one.</li>`;
    quickEdit.hidden = true;
    selectedId = null;
    return;
  }

  const active = profiles.find((p) => p.enabled);
  if (active) selectedId = active.id;
  else if (paused && resumeProfileId && profiles.some((p) => p.id === resumeProfileId)) {
    selectedId = resumeProfileId;
  } else if (!profiles.some((p) => p.id === selectedId)) {
    selectedId = profiles[0].id;
  }

  list.innerHTML = profiles
    .map(
      (p) => `
      <li class="${p.id === selectedId ? "selected" : ""}">
        <label>
          <input type="radio" name="active-profile" ${p.enabled ? "checked" : ""} data-id="${p.id}" />
          <span class="dot" style="background:${p.color}"></span>
          <span class="name">${escapeHtml(p.name)}</span>
          <span class="row-count">${countActiveHeaders(p)}</span>
        </label>
      </li>`
    )
    .join("");

  list.querySelectorAll('input[type="radio"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) switchTo(input.dataset.id);
    });
  });

  const editing = profiles.find((p) => p.id === selectedId);
  renderHeaderEditor(editing);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
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

render();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (!(changes.profiles || changes.paused)) return;
  if (skipNextStorageRender) {
    // Still refresh the badge count if profiles changed.
    if (changes.profiles) {
      getProfiles().then(async (profiles) => {
        updateCountUi(profiles, (await getPauseState()).paused);
      });
    }
    return;
  }
  render();
});
