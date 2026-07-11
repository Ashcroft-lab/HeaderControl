# HeaderCraft

A Manifest V3 Chrome extension for adding, overriding, and removing HTTP
request headers, organized into profiles (only one active at a time).

## Load it in Chrome

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this folder
4. Click the extension icon to open the popup, or right-click → **Options**
   to manage profiles

Site access (`host_permissions: <all_urls>`) is granted when you load the
extension, so header rules apply as soon as a profile is enabled — no extra
runtime permission prompts.

## Project structure

```
manifest.json          MV3 manifest — permissions, entry points
background.js          Service worker: recompiles rules on storage change
lib/
  storage.js            get/set profiles, export/import, id generation
  rule-compiler.js       pure function: profiles -> declarativeNetRequest rules
popup/                  Quick-toggle list, opens on icon click
options/                Full profile editor: headers, filters, import/export
icons/                  Generated placeholder icons (swap for a real mark)
```

`lib/rule-compiler.js` has no `chrome.*` calls in it — it's a plain
function you can unit test without a browser. Everything else is thin
glue around it and around `chrome.storage`.

## How a profile becomes browser behavior

1. You edit a profile in the popup or options page → written to
   `chrome.storage.local`
2. `chrome.storage.onChanged` wakes the service worker
3. `compileRules()` turns all enabled profiles into
   `declarativeNetRequest` rule JSON
4. `chrome.declarativeNetRequest.updateDynamicRules()` hands that to
   Chrome

After step 4, the service worker isn't involved anymore — Chrome's own
network stack enforces the rules even if the worker has gone idle.

## Known limitations (by design, not bugs)

- **No true per-request dynamic values.** Rule values are static JSON.
  A header value can't be "a fresh UUID every request" — the closest
  approximation is having the service worker periodically rewrite a
  rule's value, which is coarser than real per-request generation.
- **`append` only works on a fixed set of headers** (things like
  `accept-encoding`, `cache-control`, `cookie`, `user-agent`,
  `x-forwarded-for`). The UI doesn't currently block invalid combos —
  worth adding validation before it trips someone up.
- **No in-app "which rule matched" log.** Chrome's debug APIs for this
  (`onRuleMatchedDebug`, `getMatchedRules`, `testMatchOutcome`) only work
  on unpacked/dev-mode extensions, not once published. A real "test a
  URL against my rules" panel would need the `urlFilter` matching logic
  reimplemented in plain JS.
- **Excluding a domain excludes its subdomains**, which is usually what
  you want — but exclusion is matched against the request's *initiator*,
  so a third-party resource embedded via iframe can behave differently
  than a top-level navigation to the same domain. Worth keeping in mind
  if exclude rules seem to "not work" on embedded content.
- **Only one profile can be enabled at a time.** Enabling a profile turns
  the others off. You can also disable all of them.

## Before publishing this for real

- Swap the generated icons for a real mark
- Write an actual privacy policy (even "we collect nothing" needs to be
  stated, not implied)
- Keep permissions as narrow as practical — `<all_urls>` is required for
  header modification across sites; resist adding `scripting` unless a
  specific feature truly needs it
- Nothing in this codebase fetches or evals remote code, and Manifest V3
  won't let a future update add that quietly — keep it that way
