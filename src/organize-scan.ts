import { App, normalizePath, TFile } from "obsidian";
import { BookmarkerSettings } from "./settings";

/**
 * Every bookmark note in the vault: a markdown file under the root folder carrying
 * the `source: "obsidian-bookmarker"` frontmatter marker. Shared by the Organize
 * commands (the same scan also lives in link-check, duplicates, and the board).
 */
export function bookmarkNoteFiles(app: App, settings: BookmarkerSettings): TFile[] {
	const root = normalizePath(settings.rootFolder);
	const prefix = `${root}/`;
	const out: TFile[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		if (file.path !== root && !file.path.startsWith(prefix)) continue;
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (fm?.source === "obsidian-bookmarker") out.push(file);
	}
	return out;
}

/** Read a bookmark note's frontmatter URL, or "" when absent. */
export function frontmatterUrl(app: App, file: TFile): string {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	return fm && typeof fm.url === "string" ? fm.url : "";
}
