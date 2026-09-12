import { App, TFile } from "obsidian";
import type BookmarkerPlugin from "./main";
import type { BookmarkerSettings } from "./settings";
import { coverValue, isImageFile, parseWikilink } from "./cover";

/**
 * Deleting a bookmark used to leave its downloaded cover in `_assets/` forever.
 * Every path that trashes a bookmark note goes through `trashBookmarks`, which
 * reclaims a cover only when this plugin downloaded it and nothing else still
 * points at it.
 */

export interface TrashResult {
	/** Notes actually trashed, in call order. */
	trashed: TFile[];
	/** Notes whose deletion threw; already logged. */
	failed: number;
	coversRemoved: number;
}

/** The vault image a bookmark note uses as its cover. Null for a remote cover or none. */
export function coverAsset(app: App, note: TFile): TFile | null {
	const fm = app.metadataCache.getFileCache(note)?.frontmatter;
	if (!fm) return null;
	const linkpath = parseWikilink(coverValue(fm.image));
	if (!linkpath) return null;
	const file = app.metadataCache.getFirstLinkpathDest(linkpath, note.path);
	return file instanceof TFile && isImageFile(file) ? file : null;
}

/**
 * Trash the notes, then any cover only they referenced. Never throws: a failure on
 * one note is counted and the rest proceed, and a cover that cannot be trashed
 * leaves the already-successful note deletion untouched.
 */
export async function trashBookmarks(
	plugin: BookmarkerPlugin,
	notes: TFile[],
): Promise<TrashResult> {
	const { app, settings } = plugin;
	// Read the covers before anything is trashed — a deleted note's frontmatter is
	// no longer readable, and the metadata cache updates on its own schedule.
	const covers = new Map<string, TFile>();
	for (const note of notes) {
		const asset = coverAsset(app, note);
		if (asset && isDownloadedAsset(asset.path, settings)) covers.set(asset.path, asset);
	}

	const trashed: TFile[] = [];
	let failed = 0;
	for (const note of notes) {
		try {
			// Recoverable: honours the user's "Deleted files" preference.
			await app.fileManager.trashFile(note);
			trashed.push(note);
		} catch (error) {
			failed++;
			console.warn(`[bookmarker] delete failed for ${note.path}:`, error);
		}
	}

	// Excluding the paths just trashed makes this correct whether or not the cache
	// has caught up. A note whose deletion failed still holds its cover, so its
	// asset is found by the scan below and kept.
	const removed = new Set(trashed.map((file) => file.path));
	let coversRemoved = 0;
	let registryChanged = false;
	for (const asset of covers.values()) {
		if (isReferenced(app, asset, removed)) continue;
		try {
			await app.fileManager.trashFile(asset);
			coversRemoved++;
			const index = settings.downloadedAssets.indexOf(asset.path);
			if (index !== -1) {
				settings.downloadedAssets.splice(index, 1);
				registryChanged = true;
			}
		} catch (error) {
			console.warn(`[bookmarker] cover cleanup failed for ${asset.path}:`, error);
		}
	}
	if (registryChanged) await plugin.saveSettings();

	return { trashed, failed, coversRemoved };
}

/**
 * True only for a file this plugin itself downloaded, per the `downloadedAssets`
 * registry — never inferred from folder location. An image the user picked from
 * elsewhere in the vault (or placed manually, even under `_assets/`) is theirs and
 * outlives the bookmark.
 */
function isDownloadedAsset(path: string, settings: BookmarkerSettings): boolean {
	return new Set(settings.downloadedAssets).has(path);
}

/**
 * Whether anything still points at `asset` once `removed` are gone. Reads the
 * `image` frontmatter itself rather than trusting `frontmatterLinks` to be enabled,
 * and unions `resolvedLinks` so a body embed or an unrelated note counts too.
 */
function isReferenced(app: App, asset: TFile, removed: Set<string>): boolean {
	for (const [source, targets] of Object.entries(app.metadataCache.resolvedLinks)) {
		if (source === asset.path || removed.has(source)) continue;
		if (targets[asset.path]) return true;
	}

	for (const file of app.vault.getMarkdownFiles()) {
		if (removed.has(file.path)) continue;
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm) continue;
		const linkpath = parseWikilink(coverValue(fm.image));
		if (!linkpath) continue;
		if (app.metadataCache.getFirstLinkpathDest(linkpath, file.path)?.path === asset.path) {
			return true;
		}
	}

	return false;
}
