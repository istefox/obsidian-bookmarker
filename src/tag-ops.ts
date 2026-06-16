import { App } from "obsidian";
import { BookmarkerSettings } from "./settings";
import { bookmarkNoteFiles } from "./organize-scan";
import { normalizeTags } from "./tags";

/** How many bookmark notes carry `tag` (case-insensitive). */
export function countTagUsage(app: App, settings: BookmarkerSettings, tag: string): number {
	const target = tag.toLowerCase();
	let count = 0;
	for (const file of bookmarkNoteFiles(app, settings)) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (normalizeTags(fm?.tags).some((t) => t.toLowerCase() === target)) count++;
	}
	return count;
}

/**
 * Replace `oldTag` with `replacement` across every bookmark note, or remove it when
 * `replacement` is null. De-duplicates case-insensitively so a rename onto an existing
 * tag merges rather than doubling. Returns the number of notes changed.
 */
export async function changeTagEverywhere(
	app: App,
	settings: BookmarkerSettings,
	oldTag: string,
	replacement: string | null,
): Promise<number> {
	const target = oldTag.toLowerCase();
	const repl = replacement ? replacement.replace(/^#/, "").trim() : "";
	let changed = 0;

	for (const file of bookmarkNoteFiles(app, settings)) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		const tags = normalizeTags(fm?.tags);
		if (!tags.some((t) => t.toLowerCase() === target)) continue;

		const out: string[] = [];
		const seen = new Set<string>();
		for (const tag of tags) {
			const value = tag.toLowerCase() === target ? repl : tag;
			if (!value) continue; // deletion, or an empty replacement
			if (!seen.has(value.toLowerCase())) {
				out.push(value);
				seen.add(value.toLowerCase());
			}
		}

		try {
			await app.fileManager.processFrontMatter(file, (f: Record<string, unknown>) => {
				f.tags = out;
			});
			changed++;
		} catch (error) {
			console.warn(`[bookmarker] tag change failed for ${file.path}:`, error);
		}
	}
	return changed;
}
