import { App, normalizePath, TFile } from "obsidian";
import type { BookmarkerSettings } from "./settings";
import { coverValue } from "./cover";
import { normalizeTags } from "./tags";

/**
 * One bookmark note, as read from frontmatter. Shared by the board (`bookmark-view`)
 * and the top bar (`bookmark-bar`) so both see the same set from the same scan.
 */
export interface BookmarkItem {
	file: TFile;
	title: string;
	url: string;
	/** Remote image URL, or a `[[vault image]]` wikilink for a local cover. */
	image: string;
	/** Remote favicon URL, or "" when the page declared none. */
	favicon: string;
	tags: string[];
	domain: string;
	folder: string;
	created: string;
	/** File modification time (ms epoch), for the "Modified" sort. */
	modified: number;
	type: string;
	favorite: boolean;
	broken: boolean;
	hidden: boolean;
	description: string;
}

/** True when a path is the root folder or sits under it. */
export function isUnderRoot(path: string, rootFolder: string): boolean {
	const root = normalizePath(rootFolder);
	return path === root || path.startsWith(`${root}/`);
}

/** Scan the vault for bookmark notes under the root folder, newest first. */
export function loadBookmarks(app: App, settings: BookmarkerSettings): BookmarkItem[] {
	const root = normalizePath(settings.rootFolder);
	const prefix = `${root}/`;
	const items: BookmarkItem[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		if (file.path !== root && !file.path.startsWith(prefix)) continue;
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm || fm.source !== "obsidian-bookmarker") continue;
		const parent = file.parent?.path ?? "";
		items.push({
			file,
			title: settings.useFileNameAsTitle ? file.basename : asString(fm.title) || file.basename,
			url: asString(fm.url),
			image: coverValue(fm.image),
			favicon: asString(fm.favicon),
			tags: normalizeTags(fm.tags),
			domain: asString(fm.domain),
			folder: parent.startsWith(prefix) ? parent.slice(prefix.length) : "",
			created: asString(fm.created),
			modified: file.stat.mtime,
			type: asString(fm.type) || "link",
			favorite: fm.favorite === true,
			broken: fm.broken === true,
			hidden: fm.hidden === true,
			description: asString(fm.description),
		});
	}
	items.sort((a, b) => b.created.localeCompare(a.created));
	return items;
}

/**
 * Category folders present in a set of bookmarks, named ones alphabetically and
 * Uncategorized ("") always last — the ordering the board's landing tiles use.
 */
export function categoryNames(items: BookmarkItem[]): string[] {
	const names = new Set(items.map((item) => item.folder));
	return [...names].sort((a, b) => Number(a === "") - Number(b === "") || a.localeCompare(b));
}

export function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}
