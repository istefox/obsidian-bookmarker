# Chrome Web Store submission: Bookmarker for Obsidian

A step-by-step guide to publish this extension on the Chrome Web Store. It assumes you already have a paid Chrome Web Store developer account.

This extension is an unofficial, third-party companion to Obsidian. Say so in the listing so reviewers and users are not misled about an affiliation that does not exist.

## What is already done

- Manifest V3, `activeTab` permission only, no host permissions.
- Icons at 16, 32, 48, and 128 px in `icons/`, wired into both `action.default_icon` and the top-level `icons` field. The 128 px icon doubles as the store icon.

## What you still need to provide

These are image assets this repo cannot generate for you:

1. **At least one screenshot**, 1280×800 or 640×400, PNG or 24-bit JPG (no alpha). Up to five. A good first shot: the toolbar button on a normal web page next to a saved note in Obsidian.
2. **Small promo tile** (optional but recommended), 440×280 PNG or JPG.

## Step 1: Package the extension

The Web Store wants a zip whose root contains `manifest.json` directly, not a nested folder. From the repo root:

```bash
cd extension
zip -r ../bookmarker-extension.zip manifest.json background.js icons/icon-16.png icons/icon-32.png icons/icon-48.png icons/icon-128.png
```

`icon.svg`, `README.md`, and `SUBMISSION.md` stay out of the package. They are source and docs, not runtime files.

Verify the zip has `manifest.json` at the top level:

```bash
unzip -l ../bookmarker-extension.zip
```

## Step 2: Create the listing

In the [developer dashboard](https://chrome.google.com/webstore/devconsole), choose "Add new item" and upload the zip. Then fill in the store listing:

- **Name:** Bookmarker for Obsidian
- **Summary** (132 chars max): One-click save of the current page into your Obsidian vault, with AI tags and a preview, via the Bookmarker plugin.
- **Category:** Productivity
- **Language:** English
- **Detailed description:** see the block below.

### Detailed description (paste this)

Bookmarker for Obsidian saves the page you are on into your Obsidian vault with one click.

The extension stays small on purpose. It reads the current tab's URL when you click the toolbar button and hands it to the Bookmarker Obsidian plugin through the `obsidian://bookmark` link. The plugin does the real work: fetch the page, pull its title and preview image, propose tags and a destination folder, and write a Markdown note into your vault.

Requirements:
- The Bookmarker plugin installed and enabled in Obsidian.
- Obsidian running or launchable, since it registers the `obsidian://bookmark` handler.

Privacy: the extension asks for `activeTab` only. It reads the active tab's URL when you click and nothing else. No host permissions, no tracking, no data sent to any server we run.

This is an unofficial, third-party extension and is not affiliated with or endorsed by Obsidian.

## Step 3: Privacy practices tab

This is where most first submissions get held up. Fill every field.

- **Single purpose:** Save the current browser tab to an Obsidian vault by handing its URL to the Bookmarker Obsidian plugin.
- **`activeTab` justification:** The extension reads the active tab's URL only when the user clicks the toolbar button, to pass it to Obsidian. It uses no host permissions and accesses no other tabs.
- **Data usage:** the extension collects nothing. Check every "I do not sell or transfer…" and "I do not use or transfer for purposes unrelated…" box, then certify compliance.
- **Privacy policy URL:** Chrome requires one even when you collect no data. Host the `PRIVACY.md` text (below) somewhere public and paste its URL. A GitHub raw link to a `PRIVACY.md` in the repo works, or a GitHub Pages page.

### Privacy policy text (host this, then link it)

Bookmarker for Obsidian does not collect, store, sell, or transfer any personal data. The extension requests the `activeTab` permission and reads the active tab's URL only at the moment you click its toolbar button, solely to pass that URL to the Obsidian Bookmarker plugin via the `obsidian://bookmark` link. No data is sent to any server operated by the developer. No analytics, no tracking, no cookies.

Contact: stefano@stefer.it

## Step 4: Submit and wait

Submit for review. Review usually takes a few days; a first submission from a new account can take longer. You get an email on approval or rejection. Rejections name the policy and the fix, so read them and resubmit.

## Step 5: Updates after approval

To ship a new version, raise `version` in `manifest.json`, re-zip with the Step 1 command, and upload the new package in the dashboard. Installed users update automatically.

## Known review risk

A reviewer who tests the extension without Obsidian installed sees the toolbar button flash a red badge and do nothing, because no `obsidian://bookmark` handler is registered. That is expected behavior, but it can read as "broken." The detailed description and the requirements line above exist to set that expectation. If a rejection cites this, reply that the extension is a documented companion to an Obsidian plugin and behaves correctly when that plugin is present.
