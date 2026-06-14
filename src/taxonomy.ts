import { App, normalizePath, TFolder } from "obsidian";
import { Taxonomy } from "./types";

/**
 * Read the vault's existing taxonomy so the classifier can reuse it: all tags
 * (without the leading '#') and the subfolders under the bookmark root folder
 * (paths relative to that root).
 */
export function readTaxonomy(app: App, rootFolder: string): Taxonomy {
	return {
		tags: readTags(app),
		folders: readSubfolders(app, normalizePath(rootFolder)),
	};
}

/** getTags() exists at runtime but is not in Obsidian's public typings. */
interface TagIndex {
	getTags(): Record<string, number>;
}

function readTags(app: App): string[] {
	// getTags() returns a record of "#tag" -> count.
	const raw = (app.metadataCache as unknown as TagIndex).getTags();
	const seen = new Set<string>();
	for (const tag of Object.keys(raw)) {
		const clean = tag.replace(/^#/, "").trim();
		if (clean) seen.add(clean);
	}
	return Array.from(seen).sort();
}

function readSubfolders(app: App, root: string): string[] {
	const rootFolder = app.vault.getAbstractFileByPath(root);
	if (!(rootFolder instanceof TFolder)) return [];

	const out: string[] = [];
	const walk = (folder: TFolder) => {
		for (const child of folder.children) {
			if (child instanceof TFolder) {
				// Path relative to the root, e.g. "tech/ai".
				out.push(child.path.slice(root.length + 1));
				walk(child);
			}
		}
	};
	walk(rootFolder);
	return out.sort();
}
