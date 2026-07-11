import {
  getProfiles,
  saveProfiles,
  exclusiveEnable,
  getPauseState,
  pauseAll,
  resumeAll,
} from "../lib/storage.js";
import { countActiveHeaders } from "../lib/rule-compiler.js";

const list = document.getElementById("profile-list");
const countEl = document.getElementById("header-count");
const pauseBtn = document.getElementById("pause-toggle");
const pauseIcon = document.getElementById("pause-icon");
const pausedBanner = document.getElementById("paused-banner");

document.getElementById("manage").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

pauseBtn.addEventListener("click", async () => {
  const { paused } = await getPauseState();
  if (paused) await resumeAll();
  else await pauseAll();
  render();
});

async function switchTo(id) {
  const { paused } = await getPauseState();
  if (paused) {
    // Choosing a profile while paused resumes with that profile.
    await chrome.storage.local.set({ paused: false, resumeProfileId: null });
  }
  const profiles = await getProfiles();
  await saveProfiles(exclusiveEnable(profiles, id));
  render();
}

function updateCountAndPauseUi(profiles, paused) {
  const active = profiles.find((p) => p.enabled);
  const count = paused ? 0 : countActiveHeaders(active);

  if (!paused && count > 0) {
    countEl.hidden = false;
    countEl.textContent = String(count);
  } else {
    countEl.hidden = true;
  }

  pausedBanner.hidden = !paused;
  pauseIcon.textContent = paused ? "▶" : "⏸";
  pauseBtn.title = paused ? "Resume" : "Pause";
  pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
  pauseBtn.classList.toggle("paused", paused);
  document.body.classList.toggle("is-paused", paused);
}

async function render() {
  const [profiles, { paused }] = await Promise.all([getProfiles(), getPauseState()]);
  updateCountAndPauseUi(profiles, paused);

  if (profiles.length === 0) {
    list.innerHTML = `<li class="empty">No profiles yet. Click Manage to add one.</li>`;
    return;
  }

  list.innerHTML = profiles
    .map(
      (p) => `
      <li>
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
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

render();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.profiles || changes.paused)) render();
});
