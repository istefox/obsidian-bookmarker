import { App } from "obsidian";
import { BookmarkerSettings } from "./settings";
import { ImportItem } from "./import";
import { findDuplicate } from "./duplicates";
import { detectType } from "./metadata";
import { sanitizeFileName, writeBookmarkNote } from "./note-writer";
import { isSafeRemoteUrl } from "./url-safety";
import { BookmarkDraft } from "./types";

export interface ImportResult {
	imported: number;
	skipped: number;
	failed: number;
}

/**
 * Write a batch of imported items as bookmark notes. Lightweight: no page fetch
 * or classifier call, it trusts the source's metadata (Raindrop cover, tags,
 * folder). Skips items whose exact URL is already bookmarked.
 */
export async function importBookmarks(
	app: App,
	settings: BookmarkerSettings,
	items: ImportItem[],
	onProgress: (done: number, total: number) => void,
): Promise<ImportResult> {
	let imported = 0;
	let skipped = 0;
	let failed = 0;
	for (let i = 0; i < items.length; i++) {
		onProgress(i + 1, items.length);
		const item = items[i];
		const existing = findDuplicate(app, settings.rootFolder, item.url);
		if (existing?.exact) {
			skipped++;
			continue;
		}
		try {
			await writeBookmarkNote(app, settings, toDraft(item));
			imported++;
		} catch (error) {
			failed++;
			console.warn(`[bookmarker] import failed for ${item.url}:`, error);
		}
	}
	return { imported, skipped, failed };
}

function toDraft(item: ImportItem): BookmarkDraft {
	const cover = item.cover && isSafeRemoteUrl(item.cover) ? item.cover : null;
	return {
		url: item.url,
		name: sanitizeFileName(item.title),
		title: item.title,
		description: item.description ?? "",
		tags: item.tags,
		folder: item.folder ?? "",
		imageUrl: cover,
		faviconUrl: null,
		domain: hostname(item.url),
		type: item.type || detectType(item.url, ""),
		favorite: item.favorite ?? false,
		created: safeIso(item.created),
	};
}

function hostname(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return "";
	}
}

/** Keep `created` only if it parses to a real date; otherwise let the writer use now. */
function safeIso(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const date = new Date(value);
	return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}
