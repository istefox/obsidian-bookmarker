import { requestUrl } from "obsidian";

const MICROLINK_BASE = "https://api.microlink.io/";
const WSRV_BASE = "https://wsrv.nl/";
const TARGET_WIDTH = 1200;
const FAVICON_FALLBACK_BASE = "https://www.google.com/s2/favicons";

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

/**
 * Undo proxiedImage: recover the origin URL from a wsrv.nl wrapper. Downloading a
 * cover into the vault should keep the original bytes, not the proxy's resized webp.
 */
export function unproxiedImage(imageUrl: string): string {
	if (!imageUrl.startsWith(WSRV_BASE)) return imageUrl;
	try {
		return new URL(imageUrl).searchParams.get("url") || imageUrl;
	} catch {
		return imageUrl;
	}
}

/** A favicon-service URL for `domain`, used when the page itself declares none. */
export function faviconFallbackUrl(domain: string): string {
	return `${FAVICON_FALLBACK_BASE}?sz=64&domain=${encodeURIComponent(domain)}`;
}

/** The favicon URL to use for a draft: the page's own, or the fallback service when
 * the page declared none and the setting allows it. */
export function resolveFaviconUrl(
	pageFaviconUrl: string | null,
	domain: string,
	enableFallback: boolean,
): string | null {
	if (pageFaviconUrl) return pageFaviconUrl;
	return enableFallback ? faviconFallbackUrl(domain) : null;
}
