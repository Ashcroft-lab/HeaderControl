// Shared storage helpers used by background.js, popup, and options.
// Single source of truth: chrome.storage.local under the "profiles" key.

const STORAGE_KEY = "profiles";
const PAUSED_KEY = "paused";
const RESUME_ID_KEY = "resumeProfileId";
const SCHEMA_VERSION = 1;
const PALETTE = ["#7C5CFC", "#22B8CF", "#FF6B6B", "#FAB005", "#12B886"];

export const MAX_PROFILES = 10;
export const MAX_HEADERS_PER_PROFILE = 20;

const DEFAULT_PROFILE_NAMES = ["Profile 1", "Profile 2", "Profile 3"];

/** Three empty starter profiles; first one enabled. */
export function createDefaultProfiles() {
  const profiles = DEFAULT_PROFILE_NAMES.map((name, i) => ({
    ...createProfile(name),
    color: PALETTE[i % PALETTE.length],
  }));
  return exclusiveEnable(profiles, profiles[0]?.id ?? null);
}

export async function getProfiles() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  // Key present (even as []) means the user already has storage — don't reseed.
  if (Object.prototype.hasOwnProperty.call(data, STORAGE_KEY)) {
    return data[STORAGE_KEY] || [];
  }
  const defaults = createDefaultProfiles();
  await chrome.storage.local.set({ [STORAGE_KEY]: defaults });
  return defaults;
}

export async function getPauseState() {
  const data = await chrome.storage.local.get([PAUSED_KEY, RESUME_ID_KEY]);
  return {
    paused: Boolean(data[PAUSED_KEY]),
    resumeProfileId: data[RESUME_ID_KEY] || null,
  };
}

/** Pause: remember the active profile, then disable all. */
export async function pauseAll() {
  const profiles = await getProfiles();
  const active = profiles.find((p) => p.enabled);
  await chrome.storage.local.set({
    [PAUSED_KEY]: true,
    [RESUME_ID_KEY]: active?.id || null,
    [STORAGE_KEY]: exclusiveEnable(profiles, null),
  });
}

/** Resume: re-enable the profile that was active when paused. */
export async function resumeAll() {
  const { resumeProfileId } = await getPauseState();
  const profiles = await getProfiles();
  const id =
    resumeProfileId && profiles.some((p) => p.id === resumeProfileId)
      ? resumeProfileId
      : profiles[0]?.id || null;
  await chrome.storage.local.set({
    [PAUSED_KEY]: false,
    [RESUME_ID_KEY]: null,
    [STORAGE_KEY]: exclusiveEnable(profiles, id),
  });
}

/** Enable exactly one profile (or none if id is null). */
export function exclusiveEnable(profiles, id) {
  return profiles.map((p) => ({ ...p, enabled: id != null && p.id === id }));
}

/** Keep at most the first enabled profile; turn the rest off. */
export function normalizeAtMostOneEnabled(profiles) {
  let kept = false;
  return profiles.map((p) => {
    if (!p.enabled) return p;
    if (kept) return { ...p, enabled: false };
    kept = true;
    return p;
  });
}

/** Cap profiles and per-profile headers to the hard limits. */
export function enforceLimits(profiles) {
  return profiles.slice(0, MAX_PROFILES).map((p) => ({
    ...p,
    requestHeaders: (p.requestHeaders || []).slice(0, MAX_HEADERS_PER_PROFILE),
    responseHeaders: (p.responseHeaders || []).slice(0, MAX_HEADERS_PER_PROFILE),
  }));
}

export async function saveProfiles(profiles) {
  const normalized = enforceLimits(normalizeAtMostOneEnabled(profiles));
  const patch = { [STORAGE_KEY]: normalized };
  // Activating a profile always leaves the paused state.
  if (normalized.some((p) => p.enabled)) {
    patch[PAUSED_KEY] = false;
    patch[RESUME_ID_KEY] = null;
  }
  await chrome.storage.local.set(patch);
}

export function createProfile(name = "New profile") {
  return {
    id: crypto.randomUUID(),
    name,
    color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
    enabled: true,
    urlFilter: "*://*/*",
    excludedDomains: [],
    resourceTypes: [],
    requestHeaders: [],
    responseHeaders: [],
  };
}

// Export a portable JSON blob. Versioned so a future schema change
// can still read (or explicitly reject) older exports.
export function exportProfiles(profiles) {
  return JSON.stringify(
    { schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), profiles },
    null,
    2
  );
}

// Parses + minimally validates an imported file. Throws on anything
// that doesn't look like a profiles export, rather than importing
// silently-wrong data.
export function parseImport(json) {
  const data = JSON.parse(json);
  if (!data || !Array.isArray(data.profiles)) {
    throw new Error("This file doesn't look like a HeaderControl export (missing a profiles array).");
  }
  return data.profiles.slice(0, MAX_PROFILES).map((p) => {
    const profile = {
      ...createProfile(p.name || "Imported profile"),
      ...p,
      id: crypto.randomUUID(), // avoid id collisions with existing profiles
    };
    profile.requestHeaders = (profile.requestHeaders || []).slice(0, MAX_HEADERS_PER_PROFILE);
    profile.responseHeaders = (profile.responseHeaders || []).slice(0, MAX_HEADERS_PER_PROFILE);
    return profile;
  });
}
