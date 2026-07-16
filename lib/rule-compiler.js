// Pure function: profiles in, declarativeNetRequest rules out.
// No chrome.* calls in here on purpose — this is the one piece worth
// unit testing without a browser.

/**
 * Chrome omits main_frame when resourceTypes is unspecified
 * (matches everything except document navigations). Empty profile
 * resourceTypes means "all types" in our UI, so we expand explicitly.
 * @see https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest#type-RuleCondition
 */
export const ALL_RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "object",
  "xmlhttprequest",
  "ping",
  "csp_report",
  "media",
  "websocket",
  "webtransport",
  "webbundle",
  "other",
];

export function compileRules(profiles) {
  const rules = [];
  let nextId = 1;

  for (const profile of profiles) {
    if (!profile.enabled) continue;

    const requestHeaders = (profile.requestHeaders || [])
      .filter(isActive)
      .filter(isComplete)
      .map(toRuleHeader);
    if (requestHeaders.length === 0) continue;

    const condition = {
      urlFilter: (profile.urlFilter || "").trim() || "*://*/*",
      // Always set: omitting this skips main_frame (typed URLs / document loads).
      resourceTypes: profile.resourceTypes?.length
        ? profile.resourceTypes
        : [...ALL_RESOURCE_TYPES],
    };

    const excluded = normalizeDomainList(profile.excludedDomains);
    if (excluded.length) {
      // Both are needed for "except on this site":
      // - request: don't modify requests *to* the domain
      // - initiator: don't modify requests *from* pages on the domain
      condition.excludedRequestDomains = excluded;
      condition.excludedInitiatorDomains = excluded;
    }

    rules.push({
      id: nextId++,
      priority: 1,
      action: { type: "modifyHeaders", requestHeaders },
      condition,
    });
  }

  return rules;
}

function isActive(op) {
  // Missing enabled (older profiles) counts as on.
  return op.enabled !== false;
}

function isComplete(op) {
  // "remove" doesn't need a value; set does.
  return op.name?.trim() && (normalizeOp(op.operation) === "remove" || op.value?.trim());
}

/** Checked + complete request headers on a profile (what would be applied). */
export function countActiveHeaders(profile) {
  if (!profile) return 0;
  return (profile.requestHeaders || []).filter(isActive).filter(isComplete).length;
}

/**
 * Turn user-entered domain strings into Chrome DNR canonical domains.
 * Accepts values like "https://Foo.COM/path", "*.example.com", "example.com:443".
 */
export function normalizeDomain(input) {
  let d = String(input ?? "").trim().toLowerCase();
  if (!d) return null;

  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  d = d.split(/[/?#]/)[0];
  if (d.includes("@")) d = d.slice(d.lastIndexOf("@") + 1);
  d = d.replace(/^\*\./, "").replace(/^\./, "").replace(/\.$/, "");

  if (d.startsWith("[")) {
    const end = d.indexOf("]");
    if (end < 0) return null;
    d = d.slice(0, end + 1);
  } else {
    d = d.replace(/:\d+$/, "");
  }

  if (!d) return null;

  try {
    d = new URL(`http://${d}`).hostname;
  } catch {
    return null;
  }

  if (!d) return null;
  // Chrome requires lowercase ASCII / punycode — URL.hostname already does that.
  return d;
}

export function normalizeDomainList(list) {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    const d = normalizeDomain(item);
    if (!d || seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  return out;
}

function normalizeOp(operation) {
  // Only set/remove are supported; legacy "append" becomes set.
  return operation === "remove" ? "remove" : "set";
}

function toRuleHeader(op) {
  const operation = normalizeOp(op.operation);
  const header = { header: op.name.trim(), operation };
  if (operation !== "remove") header.value = String(op.value);
  return header;
}
