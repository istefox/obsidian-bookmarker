import { App, normalizePath, TFile } from "obsidian";
import { isSafeRemoteUrl } from "./url-safety";

/**
 * A card cover is either a remote URL or a vault image stored as a wikilink
 * (`[[_bookmarks/_assets/foo.png]]`). The wikilink form is what lets Obsidian
 * rewrite the reference when the image is renamed or moved, so a local cover
 * never rots the way a CDN URL does.
 */

/** Extensions Obsidian renders as images (native embeds and <img src>). */
export const IMAGE_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"bmp",
	"svg",
	"avif",
]);

export function isImageFile(file: TFile): boolean {
	return IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
}

/** A cover value resolved to something renderable. */
export type CoverSource =
	| { kind: "remote"; src: string }
	| { kind: "vault"; src: string; file: TFile }
	| { kind: "none" };

const WIKILINK = /^!?\[\[([^\]]+)\]\]$/;

/** The target inside `[[…]]`/`![[…]]`, alias and subpath stripped. Null if not a wikilink. */
export function parseWikilink(value: string): string | null {
	const match = WIKILINK.exec(value.trim());
	if (!match) return null;
	const target = match[1].split("|")[0].split("#")[0].trim();
	return target || null;
}

export function toWikilink(path: string): string {
	return `[[${path}]]`;
}

/**
 * Frontmatter `image` as a string. A wikilink written by this plugin is always
 * quoted by the YAML emitter and reads back as a string, but a HAND-EDITED
 * unquoted `image: [[foo.png]]` parses as a nested array — rebuild it rather
 * than letting the cover silently vanish.
 */
export function coverValue(value: unknown): string {
	if (typeof value === "string") return value;
	if (Array.isArray(value) && Array.isArray(value[0]) && typeof value[0][0] === "string") {
		return toWikilink(value[0][0]);
	}
	return "";
}

/** Folder holding downloaded covers, derived from the configured root folder. */
export function assetsFolder(rootFolder: string): string {
	return normalizePath(`${rootFolder}/_assets`);
}

/**
 * Turn a stored `image` value into something renderable: a safe remote URL, a vault
 * image resolved through the metadata cache, or nothing. `sourcePath` is the note's
 * path — it disambiguates a shortest-form wikilink when two images share a basename.
 */
export function resolveCover(app: App, value: string, sourcePath = ""): CoverSource {
	const raw = value.trim();
	if (!raw) return { kind: "none" };

	const linkpath = parseWikilink(raw);
	if (linkpath) {
		// getFirstLinkpathDest resolves against the metadata cache, so it can only
		// ever return a file inside the vault — traversal is impossible by design.
		const file = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
		if (file instanceof TFile && isImageFile(file)) {
			return { kind: "vault", src: app.vault.getResourcePath(file), file };
		}
		return { kind: "none" };
	}

	return isSafeRemoteUrl(raw) ? { kind: "remote", src: raw } : { kind: "none" };
}
