import { App, requestUrl } from "obsidian";
import { BookmarkerSettings } from "./settings";
import { bookmarkNoteFiles, frontmatterUrl } from "./organize-scan";
import { withTimeout } from "./timeout";

const TIMEOUT_MS = 10000;
const CONCURRENCY = 6;

/** Definitive dead (404/410), reachable (anything else), or no answer at all. */
export type LinkProbe = "alive" | "broken" | "unreachable";

export interface BrokenResult {
	checked: number;
	broken: number;
	/** URLs that gave no answer (network failure/timeout); flags left unchanged. */
	unreachable: number;
}

/** One request; returns the HTTP status, or null on network failure/timeout. */
async function requestStatus(url: string, method: "HEAD" | "GET"): Promise<number | null> {
	try {
		const response = await withTimeout(
			requestUrl({ url, method, throw: false }),
			TIMEOUT_MS,
		);
		return response.status;
	} catch {
		return null;
	}
}

/**
 * Probe a URL. HEAD first (cheap, no body), falling back to GET when the server
 * rejects or blocks HEAD (405/501/403/429), with one retry to ride out a transient
 * blip. Only a 404/410 is "broken"; a network failure/timeout is "unreachable"
 * (ambiguous — could be the page or your own connection), never assumed broken.
 */
export async function probeUrl(url: string): Promise<LinkProbe> {
	let status = await requestStatus(url, "HEAD");
	if (status === null || status === 403 || status === 405 || status === 429 || status === 501) {
		status = await requestStatus(url, "GET");
	}
	// One more GET retry on a still-failed request, to ride out a transient blip.
	if (status === null) status = await requestStatus(url, "GET");
	if (status === null) return "unreachable";
	return status === 404 || status === 410 ? "broken" : "alive";
}

/** Conservative boolean: only a definitive 404/410 counts as broken. */
export async function isUrlBroken(url: string): Promise<boolean> {
	return (await probeUrl(url)) === "broken";
}

/**
 * Probe every bookmark with bounded concurrency. A definitive result writes the
 * `broken` flag; an unreachable URL is left untouched (a transient outage never
 * rewrites flags) and counted so the user knows to re-run.
 */
export async function checkBrokenLinks(
	app: App,
	settings: BookmarkerSettings,
	onProgress: (done: number, total: number) => void,
): Promise<BrokenResult> {
	const files = bookmarkNoteFiles(app, settings).filter((f) => frontmatterUrl(app, f));
	const total = files.length;
	let checked = 0;
	let broken = 0;
	let unreachable = 0;
	let done = 0;
	let next = 0;

	const worker = async (): Promise<void> => {
		// next++ is synchronous between awaits, so no two workers take the same file.
		while (next < files.length) {
			const file = files[next++];
			const probe = await probeUrl(frontmatterUrl(app, file));
			if (probe === "unreachable") {
				unreachable++;
			} else {
				const isBroken = probe === "broken";
				try {
					await app.fileManager.processFrontMatter(
						file,
						(f: Record<string, unknown>) => {
							f.broken = isBroken;
						},
					);
					checked++;
					if (isBroken) broken++;
				} catch (error) {
					console.warn(`[bookmarker] could not flag ${file.path}:`, error);
				}
			}
			onProgress(++done, total);
		}
	};

	const pool = Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker());
	await Promise.all(pool);
	return { checked, broken, unreachable };
}
