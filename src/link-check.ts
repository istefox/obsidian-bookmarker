import { App, requestUrl } from "obsidian";
import { BookmarkerSettings } from "./settings";
import { bookmarkNoteFiles } from "./organize-scan";
import { withTimeout } from "./timeout";

const TIMEOUT_MS = 10000;

export interface BrokenResult {
	checked: number;
	broken: number;
}

/**
 * Test every bookmark's URL and flag dead ones in frontmatter (`broken: true`).
 * Deliberately conservative: only a network failure/timeout or a 404/410 counts as
 * broken. 403/429/5xx (anti-bot, rate limiting) are NOT treated as broken.
 */
export async function checkBrokenLinks(
	app: App,
	settings: BookmarkerSettings,
	onProgress: (done: number, total: number) => void,
): Promise<BrokenResult> {
	const files = bookmarkNoteFiles(app, settings);
	let checked = 0;
	let broken = 0;
	for (let i = 0; i < files.length; i++) {
		const fm = app.metadataCache.getFileCache(files[i])?.frontmatter;
		const url = fm && typeof fm.url === "string" ? fm.url : "";
		if (url) {
			const isBroken = await isUrlBroken(url);
			try {
				await app.fileManager.processFrontMatter(
					files[i],
					(f: Record<string, unknown>) => {
						f.broken = isBroken;
					},
				);
				checked++;
				if (isBroken) broken++;
			} catch (error) {
				console.warn(`[bookmarker] could not flag ${files[i].path}:`, error);
			}
		}
		onProgress(i + 1, files.length);
	}
	return { checked, broken };
}

/**
 * Conservative liveness test: only a 404/410 or a network failure/timeout counts as
 * broken. 403/429/5xx (anti-bot, rate limiting) are NOT treated as broken.
 */
export async function isUrlBroken(url: string): Promise<boolean> {
	try {
		const response = await withTimeout(
			requestUrl({ url, method: "GET", throw: false }),
			TIMEOUT_MS,
		);
		return response.status === 404 || response.status === 410;
	} catch {
		// Network failure or timeout — treat as broken.
		return true;
	}
}

