# App Store Packaging

Generate native store packages from the deployed PWA URL.

**Prerequisite:** Deploy `mobile/` to HTTPS — see [root README § Hosting](../../README.md#hosting) and [`.github/workflows/deploy-mobile.yml`](../../.github/workflows/deploy-mobile.yml).

Replace `YOUR_DEPLOYED_URL` below with your live URL (e.g. `https://2lakes.app` or `https://alienfacepalm.github.io/2lakes.app/`).

## Android (Trusted Web Activity)

### Option A — PWABuilder (recommended)

1. Open https://www.pwabuilder.com/
2. Enter your deployed PWA URL
3. Fix any reported manifest / service worker issues
4. Click **Package for stores** → **Android**
5. Download the generated Android Studio project or APK/AAB
6. Update [`public/.well-known/assetlinks.json`](../public/.well-known/assetlinks.json):
   - `package_name`: from your Play Console app ID
   - `sha256_cert_fingerprints`: from your signing key (`keytool -list -v -keystore ...`)
7. Redeploy so asset links are live at `https://your-domain/.well-known/assetlinks.json`
8. Upload AAB to Google Play Console ($25 one-time developer fee)

### Option B — Bubblewrap CLI

```bash
pnpm dlx @bubblewrap/cli init --manifest https://YOUR_DEPLOYED_URL/manifest.json
pnpm dlx @bubblewrap/cli build
```

Use [`twa-manifest.json`](twa-manifest.json) as a starting template.

## iOS (WKWebView wrapper)

1. Open https://www.pwabuilder.com/ with your deployed URL
2. **Package for stores** → **iOS**
3. Download the Xcode project
4. Set bundle ID, signing team, and app icons in Xcode
5. Archive and upload to App Store Connect ($99/yr Apple Developer)

**Review tip:** Emphasize lake-specific monitoring, offline shell, and standalone display — not a generic website wrapper.

## Verify before submit

- [ ] PWA loads over HTTPS
- [ ] `/manifest.json` valid
- [ ] Service worker registers (`sw.js`)
- [ ] `/api/kc` returns buoy data (Cloudflare function)
- [ ] Icons 192 + 512 PNG present
- [ ] `assetlinks.json` updated for Android TWA
- [ ] Offline: app shell loads; last buoy data shown from cache

## Updating the live app

TWA and iOS wrapper load your hosted PWA. Push to `main` (with CI) to update content without a store resubmit for most changes.
