import { App, normalizePath, TFolder } from "obsidian";
import { Taxonomy } from "./types";
import { assetsFolder } from "./cover";

/**
 * Read the vault's existing taxonomy so the classifier can reuse it: all tags
 * (without the leading '#') and the subfolders under the bookmark root folder
 * (paths relative to that root), excluding the plugin's own internal-use
 * subfolders (covers, broken-link remediation) — see `internalFolderPaths`.
 *
 * `brokenFolderName` defaults to the plugin's own settings default ("_broken", see
 * `settings.ts`) only for a caller with no live settings to read; every call site
 * in this codebase has settings in scope and passes `settings.brokenFolderName`
 * explicitly, so a user-customized name is honored everywhere.
 */
export function readTaxonomy(app: App, rootFolder: string, brokenFolderName = "_broken"): Taxonomy {
	const root = normalizePath(rootFolder);
	const internal = internalFolderPaths(root, brokenFolderName);
	return {
		tags: readTags(app),
		folders: readSubfolders(app, root, internal),
	};
}

/**
 * Full vault-relative paths the plugin manages for its own internal use and that
 * must never be offered to the classifier as an ordinary destination folder: the
 * downloaded-cover assets folder (`cover.ts`'s `assetsFolder`, hardcoded "_assets",
 * not user-configurable) and the broken-link remediation folder (user-configurable
 * via settings, `brokenFolderName`). Exported for unit testing.
 */
export function internalFolderPaths(root: string, brokenFolderName: string): string[] {
	return [assetsFolder(root), normalizePath(`${root}/${brokenFolderName}`)];
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

function readSubfolders(app: App, root: string, internalFolders: string[]): string[] {
	const rootFolder = app.vault.getAbstractFileByPath(root);
	if (!(rootFolder instanceof TFolder)) return [];

	const out: string[] = [];
	const walk = (folder: TFolder) => {
		for (const child of folder.children) {
			if (child instanceof TFolder) {
				if (isInternalFolder(child.path, internalFolders)) continue;
				// Path relative to the root, e.g. "tech/ai".
				out.push(child.path.slice(root.length + 1));
				walk(child);
			}
		}
	};
	walk(rootFolder);
	return out.sort();
}

/**
 * True when `path` is exactly one of `internalFolders` or nested under one (so
 * excluding "_assets" also excludes anything a user or the plugin later creates
 * inside it). Pure, exported for unit testing.
 */
export function isInternalFolder(path: string, internalFolders: string[]): boolean {
	return internalFolders.some((folder) => path === folder || path.startsWith(`${folder}/`));
}
