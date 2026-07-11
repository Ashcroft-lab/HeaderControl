import { getProfiles } from "./lib/storage.js";
import { compileRules, countActiveHeaders } from "./lib/rule-compiler.js";

// Serialize syncs so rapid profile switches can't overlap and trip the DNR API.
let syncQueue = Promise.resolve();

function queueSync() {
  syncQueue = syncQueue.then(syncRules).catch(() => {
    // Never surface a prompt; failures are logged only.
  });
}

async function syncRules() {
  const [{ paused }, profiles] = await Promise.all([
    chrome.storage.local.get("paused"),
    getProfiles(),
  ]);
  const rules = paused ? [] : compileRules(profiles);
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((r) => r.id);

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules: rules,
    });
  } catch (err) {
    console.warn("[HeaderCraft] Batch rule sync failed:", err);
    if (removeRuleIds.length) {
      try {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds,
          addRules: [],
        });
      } catch {
        /* ignore */
      }
    }
    for (const rule of rules) {
      try {
        await chrome.declarativeNetRequest.updateDynamicRules({
          addRules: [rule],
        });
      } catch (ruleErr) {
        console.warn("[HeaderCraft] Skipped invalid rule:", rule, ruleErr);
      }
    }
  }

  updateBadge(profiles, Boolean(paused));
}

function updateBadge(profiles, paused) {
  if (paused) {
    chrome.action.setBadgeText({ text: "" });
    return;
  }
  const active = profiles.find((p) => p.enabled);
  const count = countActiveHeaders(active);
  chrome.action.setBadgeText({ text: count ? String(count) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#7C5CFC" });
}

chrome.runtime.onInstalled.addListener(queueSync);
chrome.runtime.onStartup.addListener(queueSync);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.profiles || changes.paused)) queueSync();
});
