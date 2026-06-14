// Bookmarker for Obsidian — MV3 service worker.
//
// The whole job: on toolbar click, read the active tab's URL and hand it to the
// Obsidian Bookmarker plugin via `obsidian://bookmark?url=<encoded>`. The plugin
// runs the full capture chain (fetch, metadata, og:image, AI tags, note writing).
// This extension stays "dumb" on purpose and asks for `activeTab` only.

const OBSIDIAN_ACTION = "obsidian://bookmark";
const BADGE_MS = 1500;

chrome.action.onClicked.addListener(async (tab) => {
	const url = tab && tab.url ? tab.url : "";

	// Only http(s) pages are bookmarkable; chrome://, about:, file://, and the
	// empty new-tab page are not.
	if (!/^https?:\/\//i.test(url)) {
		await flashBadge("!", "#cc0000");
		return;
	}

	const target = `${OBSIDIAN_ACTION}?url=${encodeURIComponent(url)}`;

	try {
		// Navigating the active tab to an external protocol makes Chrome invoke the
		// OS handler (launches/focuses Obsidian) without replacing the page document,
		// so the user keeps the page they were on. See README for fallbacks.
		await chrome.tabs.update(tab.id, { url: target });
		await flashBadge("✓", "#2e7d32");
	} catch (error) {
		await flashBadge("!", "#cc0000");
	}
});

async function flashBadge(text, color) {
	await chrome.action.setBadgeBackgroundColor({ color });
	await chrome.action.setBadgeText({ text });
	setTimeout(() => {
		chrome.action.setBadgeText({ text: "" });
	}, BADGE_MS);
}
