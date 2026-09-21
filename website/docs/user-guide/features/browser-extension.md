---
title: Panergos Relay Browser Extension
description: Run a Panergos goal from a scoped Chrome or Edge side panel with live progress, approvals, and a hard Stop control.
sidebar_label: Browser Extension
---

# Panergos Relay Browser Extension

Panergos Relay is the source-distributed Manifest V3 extension in `apps/browser-extension`. Give it one goal from a Chrome or Edge side panel and Panergos can combine its configured tools with safe actions in the one page you explicitly select.

It is not an unrestricted browser backdoor. The extension uses an allowlist of browser actions, asks for site access at runtime, never receives the full API-server owner key, and blocks inputs or controls its DOM/URL checks recognize as consequential or secret-bearing.

## What is implemented

- One-prompt goal submission to the normal Panergos run engine
- Explicit **Use this page** tab-and-origin scope; crossing to another origin requires confirmation again
- Navigation, page snapshot, ordinary anchor navigation without invoking page click handlers, non-secret text entry, scrolling, safe key presses, back, and visible-page screenshot
- Live run timeline and multiline final output
- Stop, deny, and one-time approval controls
- A 120-second, single-use pairing code
- An origin-bound restricted bearer with an eight-hour maximum lifetime
- Session-only credential storage in the extension; the API server stores only its hash
- Automatic controller reconnect while the grant and local API server remain available
- Server-derived session isolation for the paired extension
- Tab-scoped Manifest V3 network block rules installed before a selected tab is bound

## Requirements

- Chrome or Edge 116 or newer
- A local Panergos checkout containing `apps/browser-extension`
- The Panergos API server on a loopback address
- A strong `API_SERVER_KEY`
- Browser extension control explicitly enabled

## 1. Enable Panergos

In `~/.panergos/config.yaml`:

```yaml
browser:
  extension_control:
    enabled: true
```

In `~/.panergos/.env`:

```bash
API_SERVER_ENABLED=true
API_SERVER_KEY=replace-with-a-strong-random-secret
```

Start the gateway:

```bash
panergos gateway
```

The default API address is `http://127.0.0.1:8642`.

## 2. Load the extension

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the repository's `apps/browser-extension` directory.
5. Select the Panergos toolbar icon to open the side panel.

No Node packages or build command are required. A signed web-store package is not part of the v0.1 source release.

## 3. Pair without exposing the owner key

Copy the exact extension origin shown in the side panel, then run:

```bash
panergos extension pair --origin chrome-extension://<extension-id>
```

Chrome and Edge both show an exact `chrome-extension://<extension-id>` origin in the panel. Paste the returned code into Panergos Relay and select **Pair and connect**.

The CLI sends the owner key only to the loopback API server. The side panel exchanges the short-lived code for a narrower bearer that can access only its own session, runs, capabilities, controller registration, and token revocation. The full `API_SERVER_KEY` is never stored in the extension.

Pair again after the API server restarts, the eight-hour grant expires, or you choose **Forget this pairing**.

## 4. Run one goal

1. Open a public HTTP or HTTPS page.
2. Select **Use this page** and approve access to that exact origin.
3. Describe the outcome in the goal box.
4. Select **Run goal** or press `Ctrl/Cmd+Enter`.
5. Follow the live timeline. Select **Stop** at any time.

The goal goes through the regular Panergos run engine, so it can use other tools enabled for that Panergos profile as well as the bound page. Browser actions remain limited to the selected tab and negotiated allowlist. If that tab crosses to another origin, Relay clears the scope and requires **Use this page** again.

## Safety boundary

Panergos Relay refuses:

- `chrome://`, `edge://`, `file://`, extension, and other protected schemes
- literal and recognized localhost, LAN, metadata, reserved, credential-bearing, and secret-looking URLs
- fields whose DOM metadata identifies password, passcode, OTP, MFA, card, bank, payment, or account-security use
- controls whose labels or target URLs identify purchases, transfers, publishing, sending, deletion, subscription changes, credential rotation, or similar consequences
- form and button activation; ordinary links are revalidated twice and opened through native tab navigation without executing the page's click handler
- opening or switching arbitrary tabs, raw JavaScript evaluation, raw CDP, cookie access, and background page injection
- CAPTCHA or browser/website security-control bypass

Those recognized steps must be completed by the authorized human. Secret recognition and page-provided field metadata are defense-in-depth heuristics, not proof that arbitrary text or a hostile page is safe, so enter every confidential value manually and use Relay only where the page and account are within your trust boundary. Site policies, account permissions, laws, provider limits, and Panergos approval policy still apply.

Relay installs tab-scoped `declarativeNetRequest` block rules before advertising a selected tab to the controller and rechecks the loaded URL after navigation. These URL rules cover literal and recognized private/reserved host forms, but Manifest V3 URL filtering does not resolve a hostname to its destination IP. It therefore cannot prove that a public hostname will not be DNS-rebound to a private address. Do not rely on Relay alone as a network-isolation or SSRF boundary on a hostile network; enforce DNS and egress policy outside the browser when that guarantee is required.

## Permission model

The manifest requires only:

- `sidePanel`
- `storage`
- `activeTab`
- `declarativeNetRequest` (tab-scoped block rules only)
- `scripting`
- loopback access to `http://127.0.0.1/*`

Other HTTP(S) origins are optional and requested only when you select a server or page. Incognito use is disabled. There is no persistent content script and no default `<all_urls>` grant.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| **Offline** | Confirm `panergos gateway` is running, the API server is enabled, port `8642` is reachable, and extension control is enabled. |
| **Pairing code rejected** | Copy the exact origin displayed by the extension and request a fresh code; codes expire after 120 seconds and work once. |
| **Pairing expired** | Restarting the API server revokes all extension grants by design. Pair again. |
| **Use this page fails** | The active tab must be a public HTTP(S) page and the requested site permission must be granted. |
| **Action requires the human** | Complete the protected or consequential step in the page, then give Panergos a new goal to continue. |
| **No compatible browser actions** | Update and restart both Panergos and the unpacked extension so their controller protocol versions match. |

For headless/cloud automation and full provider-specific browser backends, use [Browser Automation](/user-guide/features/browser). For the API and run protocol, see [API Server](/user-guide/features/api-server).
