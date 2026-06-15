# Bookmarker for Obsidian (browser extension)

A thin Chromium (Chrome / Edge / Brave / Arc) extension that saves the page you are
on to your Obsidian vault with one click. It does no scraping itself: it hands the
current tab's URL to the **Bookmarker** Obsidian plugin through
`obsidian://bookmark?url=<encoded>`, and the plugin runs the whole capture chain
(fetch, metadata, og:image, AI tags, note writing).

See `docs/architecture/ADR-001` in the plugin repo for why the capture logic lives
in the plugin and not here.

## Install

From the [Chrome Web Store](https://chromewebstore.google.com/detail/gmpfgkokpoblhaajglclanlmfnldoiee):
one click, with automatic updates. Then pin the **Bookmarker** action to the toolbar.
The steps in "Install (unpacked, for development)" below load the source instead.

## Requirements

- The **Bookmarker** Obsidian plugin installed and enabled, with Obsidian running (or
  launchable), since it registers the `obsidian://bookmark` handler.

## Install (unpacked, for development)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. **Load unpacked** → select this `extension/` folder.
4. Pin the **Bookmarker** action to the toolbar.

## Use

- Click the toolbar button on any `http(s)` page → Obsidian comes to focus and saves
  the bookmark. A short **green ✓** badge confirms hand-off; the browser page stays
  where it was.
- On a non-web page (`chrome://`, `about:`, `file://`, empty new tab) the button shows
  a **red !** badge and does nothing.

## Permissions

- `activeTab` only. The extension reads the active tab's URL when you click, and
  nothing else. No host permissions, no background page access, no `tabs`/`scripting`.

## Contract with the plugin

The only coupling is the query parameter name: `obsidian://bookmark?url=…`. If the
plugin's protocol handler param name changes, update `OBSIDIAN_ACTION` /
the param in `background.js`.

## Hand-off fallbacks

The primary method is `chrome.tabs.update(tabId, { url: "obsidian://…" })`, which on
current Chromium invokes the OS handler without navigating the page away. If a future
Chromium version blanks the tab or shows an error page instead, switch the listener in
`background.js` to one of:

1. **Transient tab**: `chrome.tabs.create({ url: target })`, then
   `chrome.tabs.remove(newTab.id)` on a ~600 ms timer.
2. **Injected navigation**: `chrome.scripting.executeScript` running
   `location.href = target` in the active tab (requires adding the `scripting`
   permission to `manifest.json`).

## Icons

Icons live in `icons/`, generated from `icons/icon.svg` with `rsvg-convert`:

```bash
cd icons
for s in 16 32 48 128; do rsvg-convert -w $s -h $s icon.svg -o icon-$s.png; done
```

## Not included yet

Firefox build, passing selected text/title.
