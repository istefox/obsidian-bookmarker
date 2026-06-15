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

	const imageCandidates = collectImages(doc, pageUrl);
	const imageUrl = imageCandidates[0] ?? null;

	const rawFavicon =
		doc.querySelector('link[rel~="icon"]')?.getAttribute("href") ?? "";
	const faviconUrl = resolveUrl(rawFavicon, pageUrl);

	const excerpt = extractExcerpt(doc, excerptLength);
	const type = detectType(pageUrl, metaContent(doc, 'meta[property="og:type"]'));

	return {
		title,
		description,
		imageUrl,
		imageCandidates,
		faviconUrl,
		excerpt,
		domain,
		type,
	};
}

/** Infer a coarse content type from the URL, domain, and og:type. */
export function detectType(url: string, ogType: string): string {
	const lower = url.toLowerCase();
	if (/\.(pdf|docx?|pptx?|xlsx?|epub|odt|rtf)(\?|#|$)/.test(lower)) return "document";
	if (/\.(jpe?g|png|gif|webp|svg|bmp|avif)(\?|#|$)/.test(lower)) return "image";
	if (/\.(mp4|webm|mov|mkv|avi)(\?|#|$)/.test(lower)) return "video";
	if (/\.(mp3|wav|ogg|flac|m4a|aac)(\?|#|$)/.test(lower)) return "audio";

	const host = safeHostname(url).replace(/^www\./, "");
	if (/^(youtube\.com|youtu\.be|vimeo\.com|twitch\.tv|dailymotion\.com)$/.test(host)) {
		return "video";
	}
	if (/^(open\.)?spotify\.com$|^soundcloud\.com$/.test(host)) return "audio";

	const og = ogType.toLowerCase();
	if (og.startsWith("video")) return "video";
	if (og.startsWith("music")) return "audio";
	if (og === "article") return "article";
	return "link";
}

function metaContent(doc: Document, selector: string): string {
	return doc.querySelector(selector)?.getAttribute("content")?.trim() ?? "";
}

/**
 * Collect STRUCTURED preview-image candidates in priority order, each resolved and
 * SSRF-guarded, deduped: og:image → twitter:image → link rel=image_src → JSON-LD.
 * We deliberately do NOT scrape arbitrary <img> tags (on pages like Amazon that picks
 * promo banners). When this is empty, the caller falls back to a page screenshot.
 */
function collectImages(doc: Document, pageUrl: string): string[] {
	const raw = [
		metaContent(doc, 'meta[property="og:image"]'),
		metaContent(doc, 'meta[name="twitter:image"]'),
		metaContent(doc, 'meta[property="twitter:image"]'),
		doc.querySelector('link[rel="image_src"]')?.getAttribute("href") ?? "",
		jsonLdImage(doc),
	];
	const out: string[] = [];
	const seen = new Set<string>();
	for (const candidate of raw) {
		const resolved = resolveUrl(candidate, pageUrl);
		if (resolved && !seen.has(resolved)) {
			seen.add(resolved);
			out.push(resolved);
		}
	}
	return out;
}

/** Pull an `image` out of any JSON-LD block (string, {url}, or array of those). */
function jsonLdImage(doc: Document): string {
	const blocks = doc.querySelectorAll('script[type="application/ld+json"]');
	for (const block of Array.from(blocks)) {
		let data: unknown;
		try {
			data = JSON.parse(block.textContent ?? "");
		} catch {
			continue;
		}
		const found = pickJsonLdImage(data);
		if (found) return found;
	}
	return "";
}

function pickJsonLdImage(data: unknown): string {
	const nodes = Array.isArray(data) ? data : [data];
	for (const node of nodes) {
		if (!node || typeof node !== "object") continue;
		const image = (node as { image?: unknown }).image;
		const url = imageValueToUrl(image);
		if (url) return url;
		// Common nesting: { "@graph": [ ... ] }
		const graph = (node as { "@graph"?: unknown })["@graph"];
		if (graph) {
			const nested = pickJsonLdImage(graph);
			if (nested) return nested;
		}
	}
	return "";
}

function imageValueToUrl(image: unknown): string {
	if (!image) return "";
	if (typeof image === "string") return image;
	if (Array.isArray(image)) {
		for (const item of image) {
			const url = imageValueToUrl(item);
			if (url) return url;
		}
		return "";
	}
	if (typeof image === "object") {
		const url = (image as { url?: unknown }).url;
		return typeof url === "string" ? url : "";
	}
	return "";
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
	// Prefer the main content container so site chrome (menus, headers, sidebars)
	// does not dominate the excerpt and bias classification. Fall back to the body.
	const source = doc.querySelector("article") ?? doc.querySelector("main") ?? doc.body;
	if (!source) return "";
	const clone = source.cloneNode(true) as HTMLElement;
	clone
		.querySelectorAll("script, style, nav, header, footer, aside, form, noscript")
		.forEach((el) => el.remove());
	const text = (clone.textContent ?? "").replace(/\s+/g, " ").trim();
	return text.slice(0, excerptLength);
}
