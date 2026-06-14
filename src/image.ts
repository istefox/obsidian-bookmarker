import { requestUrl } from "obsidian";

const MICROLINK_BASE = "https://api.microlink.io/";
const WSRV_BASE = "https://wsrv.nl/";
const TARGET_WIDTH = 1200;

/**
 * Fetch a page screenshot via Microlink. The call is SYNCHRONOUS: it returns the
 * ready CDN screenshot URL (no "generating…" placeholder). Returns null on any
 * failure (e.g. Amazon anti-bot), so the caller simply ends up with no image.
 */
export async function fetchScreenshot(pageUrl: string): Promise<string | null> {
	const api = `${MICROLINK_BASE}?url=${encodeURIComponent(pageUrl)}&screenshot=true&meta=false`;
	try {
		const response = await requestUrl({ url: api, throw: false });
		if (response.status < 200 || response.status >= 300) return null;
		const json = response.json as {
			status?: string;
			data?: { screenshot?: { url?: string } };
		};
		if (json?.status !== "success") return null;
		const url = json.data?.screenshot?.url;
		return typeof url === "string" && url ? url : null;
	} catch {
		return null;
	}
}

/**
 * Wrap an external image URL through the wsrv.nl proxy for caching, resizing, and to
 * hide the user's IP/referer from the origin. Already-proxied URLs pass through.
 */
export function proxiedImage(imageUrl: string, useProxy: boolean): string {
	if (!useProxy || !imageUrl || imageUrl.startsWith(WSRV_BASE)) return imageUrl;
	return `${WSRV_BASE}?url=${encodeURIComponent(imageUrl)}&w=${TARGET_WIDTH}&output=webp`;
}
