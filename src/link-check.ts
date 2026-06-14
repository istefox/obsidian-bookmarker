import { App, normalizePath, requestUrl, TFile } from "obsidian";
import { BookmarkerSettings } from "./settings";

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
	const files = bookmarkFiles(app, settings.rootFolder);
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

function bookmarkFiles(app: App, rootFolder: string): TFile[] {
	const root = normalizePath(rootFolder);
	const prefix = `${root}/`;
	const out: TFile[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		if (file.path !== root && !file.path.startsWith(prefix)) continue;
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (fm?.source === "obsidian-bookmarker") out.push(file);
	}
	return out;
}

async function isUrlBroken(url: string): Promise<boolean> {
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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = window.setTimeout(() => reject(new Error("timeout")), ms);
		promise.then(
			(value) => {
				window.clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				window.clearTimeout(timer);
				reject(error);
			},
		);
	});
}
