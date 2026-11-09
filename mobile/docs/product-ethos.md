# Product ethos

**2lakes.app should make lake days easier — not add friction, guilt, or noise.**

This app answers one question: *“What’s the lake doing right now?”* Everything else is in service of that, or it does not ship.

## North star

| Do | Don't |
|----|--------|
| Show the answer fast | Block the UI with modals users didn't ask for |
| Work offline when we already have readings | Wipe the screen because a refresh failed |
| Keep history on-device, opt-in | Nag about settings, donations, or accounts |
| Use plain language | Corporate error-speak or beta fear-mongering |
| Respect attention | Ads, rewarded video, paywalls, “sync across devices” upsells |

## Monetization & sustainability

- **$0 hosting** for the free app (Cloudflare Pages + local storage).
- **No ads** — ever; not as fallback if donations are low.
- **Donations** — optional link in Settings only; never required; never interrupts lake data.
- **Paid cloud backup** — optional future; not required to run at $0.

See [zero-cost-policy.md](zero-cost-policy.md).

## UX rules for contributors

1. **Helpful, not scolding** — offline copy: “Showing last saved readings” not “Connection lost! Find stable internet!”
2. **No surprise interruptions** — don't full-screen modal on `window.offline` if cached data is on screen.
3. **Honest copy** — history is **on this device**; never imply cloud sync unless backup ships.
4. **Defaults are gentle** — background history is **off** until the user opts in.
5. **Errors are recoverable** — one clear action (retry, OK); no shame.
6. **Weather alerts** — NWS warnings are safety info, not app nagging; show them, don't embellish.

## Agents

Before shipping mobile UI or copy, ask: *Does this make someone's lake check faster and calmer?* If not, simplify or cut.

Related: skill **`mobile-local-first`**, rule **`mobile-local-first.mdc`**.
