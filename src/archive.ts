import { requestUrl } from "obsidian";
import { withTimeout } from "./timeout";

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
		return closestSnapshotUrl(response.json as unknown);
	} catch {
		return null;
	}
}

/** Safely walk the availability-API response: `archived_snapshots.closest.url`. */
function closestSnapshotUrl(json: unknown): string | null {
	const snapshots = asRecord(json)?.archived_snapshots;
	const closest = asRecord(snapshots)?.closest;
	const record = asRecord(closest);
	if (record?.available === true && typeof record.url === "string") {
		// The API may return a protocol-relative or http URL; normalize to https.
		return record.url.replace(/^http:\/\//i, "https://");
	}
	return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}
