# Releasing HeaderControl

Maintainer notes for packaging and Chrome Web Store draft uploads.
Not included in the store zip (pack only ships extension runtime files).

## Pack locally

```bash
./scripts/pack.sh
```

Writes `dist/HeaderControl-<version>.zip` from `manifest.json` `version`.

## GitHub Actions

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `CI` | push/PR to `main` or `dev` | Validates `manifest.json`, packs zip, uploads artifact |
| `Release Chrome Web Store (draft)` | tag `v*` or manual run | Packs zip and **uploads a draft** to the store (does not publish) |

After a draft upload, open the [Developer Dashboard](https://chrome.google.com/webstore/devconsole), review the package, then submit/publish yourself.

Store listing: [HeaderControl](https://chromewebstore.google.com/detail/headercontrol/ljopaddcofbllcmmbajkenhjeegoaclp)  
Extension id: `ljopaddcofbllcmmbajkenhjeegoaclp`

## Release steps

1. Bump `version` in `manifest.json` (must be higher than the live store version).
2. Commit and merge to `main` (or tag the commit you want).
3. Tag and push: `git tag v0.1.20 && git push origin v0.1.20`
4. Wait for **Release Chrome Web Store (draft)** to finish.
5. In the Dashboard → publish / submit for review.

## Repository secrets (Actions)

Use **Repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Purpose |
|--------|---------|
| `CHROME_CLIENT_ID` | Google OAuth client ID |
| `CHROME_CLIENT_SECRET` | Google OAuth client secret |
| `CHROME_REFRESH_TOKEN` | OAuth refresh token (Playground) |
| `CHROME_EXTENSION_ID` | `ljopaddcofbllcmmbajkenhjeegoaclp` |

OAuth setup: [Chrome Web Store API](https://developer.chrome.com/docs/webstore/using_webstore_api/).

While the OAuth consent screen is in **Testing**, add the CWS owner email as a **Test user**. You do not need Google verification for personal CI tokens.
