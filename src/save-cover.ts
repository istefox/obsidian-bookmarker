import { App, Notice, normalizePath, requestUrl, TFile } from "obsidian";
import type BookmarkerPlugin from "./main";
import type { BookmarkerSettings } from "./settings";
import { assetsFolder, coverValue, parseWikilink, toWikilink } from "./cover";
import { ImageSuggestModal, listVaultImages } from "./image-suggest";
import { proxiedImage, unproxiedImage } from "./image";
import { ensureFolder, uniqueName } from "./note-writer";
import { withTimeout } from "./timeout";
import { isSafeRemoteUrl } from "./url-safety";

/**
 * Local covers: point a bookmark at an image inside the vault instead of a remote
 * URL that can rot. Either pick an image the user already has, or download the
 * current remote cover once and keep it forever.
 */

/** Refuse anything larger; the check runs on bytes already in memory (requestUrl
 * has no streaming API), so it protects the vault rather than peak memory. */
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15000;

/** A native embed line on its own, e.g. `![[_bookmarks/_assets/foo.png]]`. */
const EMBED_LINE = /^!\[\[[^\]]+\]\]\s*$/;

/** Pick a vault image and make it this bookmark's cover. */
export function setCoverFromVault(plugin: BookmarkerPlugin, note: TFile): void {
	const { app, settings } = plugin;
	const images = listVaultImages(app, assetsFolder(settings.rootFolder));
	if (images.length === 0) {
		new Notice("Bookmarker: no images in the vault.");
		return;
	}
	new ImageSuggestModal(app, images, (image) => {
		void applyLocalCover(app, note, image)
			.then(() => new Notice("Bookmarker: cover updated."))
			.catch((error: unknown) => {
				const msg = error instanceof Error ? error.message : String(error);
				new Notice(`Set cover failed: ${msg}`);
			});
	}).open();
}

/**
 * Download the note's current remote cover into the assets folder and repoint the
 * note at it. Idempotent: a cover that is already a vault image is left alone.
 */
export async function saveCoverToVault(plugin: BookmarkerPlugin, note: TFile): Promise<void> {
	const { app, settings } = plugin;
	const fm = app.metadataCache.getFileCache(note)?.frontmatter ?? {};
	const stored = coverValue(fm.image).trim();

	if (parseWikilink(stored)) {
		new Notice("Bookmarker: this cover is already a vault image.");
		return;
	}
	if (!isSafeRemoteUrl(stored)) {
		new Notice("Bookmarker: this bookmark has no downloadable cover.");
		return;
	}

	// The stored URL is usually the proxy's resized webp; fetch the origin bytes.
	// Re-validate after unwrapping — otherwise a proxy wrapper smuggles a private host.
	const source = unproxiedImage(stored);
	if (!isSafeRemoteUrl(source)) {
		new Notice("Bookmarker: this cover points at a private address.");
		return;
	}

	const notice = new Notice("Downloading cover…", 0);
	try {
		let bytes = await download(source);
		if (!bytes) {
			// Some origins block hotlinking but serve the proxy fine — but only when
			// the user actually allows contacting wsrv.nl.
			const fallbackUrl = resolveProxyFallbackUrl(stored, settings.useImageProxy);
			if (fallbackUrl) bytes = await download(fallbackUrl);
		}
		if (!bytes) throw new Error("could not download the image");
		if (bytes.byteLength === 0) throw new Error("empty response");
		if (bytes.byteLength > MAX_COVER_BYTES) throw new Error("image is over 5 MB");

		const ext = sniffImageExtension(bytes);
		if (!ext) throw new Error("not a supported image");

		const dir = assetsFolder(settings.rootFolder);
		await ensureFolder(app, dir);
		const name = uniqueName(app, dir, note.basename, ext);
		const path = normalizePath(`${dir}/${name}.${ext}`);
		const created = await app.vault.createBinary(path, bytes);
		if (recordDownloadedAsset(settings, created.path)) await plugin.saveSettings();

		await applyLocalCover(app, note, created);
		new Notice(`Bookmarker: cover saved to ${path}`);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		new Notice(`Save cover failed: ${msg}`);
	} finally {
		notice.hide();
	}
}

/**
 * Record `path` as plugin-downloaded, the ownership registry cover-gc trusts to
 * decide what it may delete. Deduped: returns false (nothing to persist) if `path`
 * is already recorded.
 */
export function recordDownloadedAsset(settings: BookmarkerSettings, path: string): boolean {
	if (settings.downloadedAssets.includes(path)) return false;
	settings.downloadedAssets.push(path);
	return true;
}

/** Drop a local cover, restoring the plain "no cover" state. */
export async function removeCover(app: App, note: TFile): Promise<void> {
	try {
		await app.fileManager.processFrontMatter(note, (f: Record<string, unknown>) => {
			f.image = "";
		});
		await rewriteCoverBody(app, note, null);
		new Notice("Bookmarker: cover removed.");
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		new Notice(`Remove cover failed: ${msg}`);
	}
}

/** Point the note's frontmatter and body at a vault image. */
export async function applyLocalCover(app: App, note: TFile, image: TFile): Promise<void> {
	// Assign the plain string: the YAML emitter quotes `[[…]]`, and an unquoted
	// wikilink would parse back as a nested array.
	await app.fileManager.processFrontMatter(note, (f: Record<string, unknown>) => {
		f.image = toWikilink(image.path);
	});
	await rewriteCoverBody(app, note, image.path);
}

/**
 * Decide whether the origin-download failure should be retried through the wsrv.nl
 * proxy, and with what URL. Returns null when the user has disabled the proxy: with
 * `useImageProxy: false`, `proxiedImage` returns its input unchanged, so retrying
 * would either repeat the exact same failed origin request, or — if `stored` happens
 * to already be a proxied URL from when the setting was last on — silently contact
 * wsrv.nl despite the user having turned it off. Both are wrong, so the fallback is
 * skipped outright rather than attempted with a no-op flag.
 */
export function resolveProxyFallbackUrl(stored: string, useImageProxy: boolean): string | null {
	if (!useImageProxy) return null;
	return proxiedImage(stored, true);
}

/** GET the URL, returning its bytes, or null if the request failed. */
async function download(url: string): Promise<ArrayBuffer | null> {
	try {
		const response = await withTimeout(
			requestUrl({ url, method: "GET", throw: false }),
			DOWNLOAD_TIMEOUT_MS,
		);
		if (response.status < 200 || response.status >= 300) return null;
		return response.arrayBuffer;
	} catch {
		return null;
	}
}

/**
 * Identify the format from the file signature. A Content-Type header is
 * attacker-controlled, so the magic bytes are the authority; an unrecognised
 * payload is refused rather than written to the vault under a fake extension.
 * SVG has no signature and is markup, so it is not downloadable — the vault
 * picker still accepts one the user chose themselves.
 */
function sniffImageExtension(bytes: ArrayBuffer): string | null {
	const b = new Uint8Array(bytes);
	if (b.length < 12) return null;
	const tag = (offset: number): string =>
		String.fromCharCode(b[offset], b[offset + 1], b[offset + 2], b[offset + 3]);

	if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
	if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
	if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "gif";
	if (b[0] === 0x42 && b[1] === 0x4d) return "bmp";
	if (tag(0) === "RIFF" && tag(8) === "WEBP") return "webp";
	if (tag(4) === "ftyp" && tag(8).startsWith("avi")) return "avif";
	return null;
}

/**
 * Sync the note body with the cover: drop the `image` key from the link-embed card
 * (it cannot render a vault path) and replace or insert the native embed. Passing
 * null removes the embed instead. Content further down (## Notes) is untouched.
 */
async function rewriteCoverBody(app: App, note: TFile, imagePath: string | null): Promise<void> {
	await app.vault.process(note, (data) => {
		const end = frontmatterEnd(data);
		const head = data.slice(0, end);
		const lines = data.slice(end).split("\n");

		const fence = lines.findIndex((line) => line.trim() === "```embed");
		if (fence !== -1) {
			let close = lines.length;
			for (let i = fence + 1; i < lines.length; i++) {
				if (lines[i].trim() === "```") {
					close = i;
					break;
				}
			}
			for (let i = close - 1; i > fence; i--) {
				if (/^image:\s/.test(lines[i])) lines.splice(i, 1);
			}
		}

		const existing = lines.findIndex((line) => EMBED_LINE.test(line));
		if (imagePath === null) {
			if (existing !== -1) lines.splice(existing, 1);
		} else if (existing !== -1) {
			// Replace, so repeated saves never stack embeds.
			lines[existing] = `![[${imagePath}]]`;
		} else {
			const heading = lines.findIndex((line) => /^#\s/.test(line));
			lines.splice(heading === -1 ? 0 : heading + 1, 0, "", `![[${imagePath}]]`);
		}

		return head + lines.join("\n");
	});
}

/** Index just past the closing "---" of the frontmatter block, or 0 if there is none. */
function frontmatterEnd(data: string): number {
	if (!data.startsWith("---\n")) return 0;
	const close = data.indexOf("\n---", 3);
	if (close === -1) return 0;
	const lineEnd = data.indexOf("\n", close + 1);
	return lineEnd === -1 ? data.length : lineEnd + 1;
}
