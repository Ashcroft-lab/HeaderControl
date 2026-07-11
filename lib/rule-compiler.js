// Pure function: profiles in, declarativeNetRequest rules out.
// No chrome.* calls in here on purpose — this is the one piece worth
// unit testing without a browser.

const HEADER_OPS = new Set(["append", "set", "remove"]);

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
    };

    const excluded = (profile.excludedDomains || [])
      .map((d) => String(d).trim())
      .filter(Boolean);
    if (excluded.length) condition.excludedRequestDomains = excluded;

    if (profile.resourceTypes?.length) {
      condition.resourceTypes = profile.resourceTypes;
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
  // "remove" doesn't need a value; set/append do.
  return op.name?.trim() && (normalizeOp(op.operation) === "remove" || op.value?.trim());
}

/** Checked + complete request headers on a profile (what would be applied). */
export function countActiveHeaders(profile) {
  if (!profile) return 0;
  return (profile.requestHeaders || []).filter(isActive).filter(isComplete).length;
}

function normalizeOp(operation) {
  return HEADER_OPS.has(operation) ? operation : "set";
}

function toRuleHeader(op) {
  const operation = normalizeOp(op.operation);
  const header = { header: op.name.trim(), operation };
  if (operation !== "remove") header.value = String(op.value);
  return header;
}
