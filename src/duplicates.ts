import { App, normalizePath, TFile } from "obsidian";

const TRACKING_PARAM =
	/^(utm_|ref$|ref_|fbclid$|gclid$|mc_|igshid$|si$|spm$|_hsenc$|_hsmi$)/i;

/**
 * Normalize a URL for duplicate comparison: drop protocol (http/https unify), `www.`,
 * the hash, a trailing slash, and well-known tracking params; lowercase the host and
 * sort the remaining params. Conservative — only strips known trackers.
 */
export function normalizeUrl(raw: string): string {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return raw.trim().toLowerCase();
	}
	const host = url.host.toLowerCase().replace(/^www\./, "");
	const path = url.pathname.replace(/\/+$/, "") || "/";

	const params: Array<[string, string]> = [];
	url.searchParams.forEach((value, key) => {
		if (!TRACKING_PARAM.test(key)) params.push([key, value]);
	});
	params.sort((a, b) => a[0].localeCompare(b[0]));
	const query = new URLSearchParams(params).toString();

	return `${host}${path}${query ? `?${query}` : ""}`;
}

export interface DuplicateMatch {
	file: TFile;
	/** true if the raw URL string is identical; false if only normalized-equal. */
	exact: boolean;
}

/**
 * Find an existing bookmark for this URL. An EXACT raw-string match wins over a
 * normalized-only match. Exact → caller should block re-saving; normalized-only →
 * caller should warn but allow saving.
 */
export function findDuplicate(
	app: App,
	rootFolder: string,
	url: string,
): DuplicateMatch | null {
	const targetRaw = url.trim();
	const targetNorm = normalizeUrl(url);
	const root = normalizePath(rootFolder);
	const prefix = `${root}/`;

	let normalized: TFile | null = null;
	for (const file of app.vault.getMarkdownFiles()) {
		if (file.path !== root && !file.path.startsWith(prefix)) continue;
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm || fm.source !== "obsidian-bookmarker") continue;
		const fmUrl = typeof fm.url === "string" ? fm.url : "";
		if (!fmUrl) continue;
		if (fmUrl.trim() === targetRaw) return { file, exact: true };
		if (!normalized && normalizeUrl(fmUrl) === targetNorm) normalized = file;
	}
	return normalized ? { file: normalized, exact: false } : null;
}

/** How many existing bookmark notes share the same domain (www-insensitive). */
export function countSameDomain(
	app: App,
	rootFolder: string,
	domain: string,
): number {
	const target = domain.toLowerCase().replace(/^www\./, "");
	if (!target) return 0;
	const root = normalizePath(rootFolder);
	const prefix = `${root}/`;
	let count = 0;
	for (const file of app.vault.getMarkdownFiles()) {
		if (file.path !== root && !file.path.startsWith(prefix)) continue;
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm || fm.source !== "obsidian-bookmarker") continue;
		const fmDomain = typeof fm.domain === "string" ? fm.domain : "";
		if (fmDomain.toLowerCase().replace(/^www\./, "") === target) count++;
	}
	return count;
}
