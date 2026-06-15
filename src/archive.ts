import { requestUrl } from "obsidian";

const TIMEOUT_MS = 10000;

/**
 * Look up the closest Wayback Machine snapshot for a URL via the availability API
 * (`https://archive.org/wayback/available`). Returns the snapshot URL, or null when
 * none exists or the lookup fails. Never throws — callers treat null as "no snapshot".
 */
export async function fetchWaybackSnapshot(url: string): Promise<string | null> {
	const endpoint = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
	try {
		const response = await withTimeout(
			requestUrl({ url: endpoint, method: "GET", throw: false }),
			TIMEOUT_MS,
		);
		if (response.status !== 200) return null;
		const snapshot = response.json?.archived_snapshots?.closest;
		if (snapshot?.available === true && typeof snapshot.url === "string") {
			// The API may return a protocol-relative or http URL; normalize to https.
			return snapshot.url.replace(/^http:\/\//i, "https://");
		}
		return null;
	} catch {
		return null;
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
				reject(error instanceof Error ? error : new Error(String(error)));
			},
		);
	});
}
