import { requestUrl } from "obsidian";
import { PageMetadata } from "./types";
import { isSafeRemoteUrl } from "./url-safety";

/** Fetch a page's HTML via Obsidian's requestUrl (CORS-free, mobile-safe). */
export async function fetchHtml(url: string): Promise<string> {
	const response = await requestUrl({ url, throw: false });
	if (response.status < 200 || response.status >= 300) {
		throw new Error(`page fetch failed (HTTP ${response.status})`);
	}
	return response.text;
}

/** Parse title, description, image, favicon, and an excerpt out of HTML. */
export function parseMetadata(
	html: string,
	pageUrl: string,
	excerptLength: number,
): PageMetadata {
	const doc = new DOMParser().parseFromString(html, "text/html");
	const domain = safeHostname(pageUrl);

	const title =
		metaContent(doc, 'meta[property="og:title"]') ||
		doc.querySelector("title")?.textContent?.trim() ||
		domain;

	const description =
		metaContent(doc, 'meta[property="og:description"]') ||
		metaContent(doc, 'meta[name="description"]') ||
		"";

	const rawImage =
		metaContent(doc, 'meta[property="og:image"]') ||
		metaContent(doc, 'meta[name="twitter:image"]') ||
		metaContent(doc, 'meta[property="twitter:image"]');
	const imageUrl = resolveUrl(rawImage, pageUrl);

	const rawFavicon =
		doc.querySelector('link[rel~="icon"]')?.getAttribute("href") ?? "";
	const faviconUrl = resolveUrl(rawFavicon, pageUrl);

	const excerpt = extractExcerpt(doc, excerptLength);

	return { title, description, imageUrl, faviconUrl, excerpt, domain };
}

function metaContent(doc: Document, selector: string): string {
	return doc.querySelector(selector)?.getAttribute("content")?.trim() ?? "";
}

/**
 * Resolve a possibly-relative URL against the page base. Returns null if empty,
 * invalid, or rejected by the SSRF guard (non-http(s) or private host).
 */
function resolveUrl(value: string, base: string): string | null {
	if (!value) return null;
	let href: string;
	try {
		href = new URL(value, base).href;
	} catch {
		return null;
	}
	return isSafeRemoteUrl(href) ? href : null;
}

function safeHostname(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return "";
	}
}

/** Strip non-content elements, collapse whitespace, take the first N chars. */
function extractExcerpt(doc: Document, excerptLength: number): string {
	const body = doc.body;
	if (!body) return "";
	const clone = body.cloneNode(true) as HTMLElement;
	clone
		.querySelectorAll("script, style, nav, footer, noscript")
		.forEach((el) => el.remove());
	const text = (clone.textContent ?? "").replace(/\s+/g, " ").trim();
	return text.slice(0, excerptLength);
}
