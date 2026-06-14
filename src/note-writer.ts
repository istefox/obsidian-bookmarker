import { App, normalizePath, requestUrl, stringifyYaml, TFolder } from "obsidian";
import { BookmarkerSettings } from "./settings";
import { PageMetadata } from "./types";
import { isSafeRemoteUrl } from "./url-safety";

/**
 * Write a bookmark note into the root folder (M2: no category subfolder yet —
 * the classifier picks a subfolder in M3). Downloads the preview image into the
 * asset subfolder; drops the image if the URL is unsafe or the download fails.
 * Returns the vault path of the created note.
 */
export async function writeBookmarkNote(
	app: App,
	settings: BookmarkerSettings,
	url: string,
	metadata: PageMetadata,
): Promise<string> {
	const root = normalizePath(settings.rootFolder);
	await ensureFolder(app, root);

	const slug = uniqueSlug(app, root, metadata.title);

	let imageRef = "";
	if (metadata.imageUrl) {
		imageRef = await downloadImage(app, settings, root, slug, metadata.imageUrl);
	}

	const created = new Date().toISOString();
	const notePath = `${root}/${slug}.md`;
	await app.vault.create(notePath, buildNote(url, metadata, imageRef, created));
	return notePath;
}

/**
 * Download the image into `<root>/<assetSubfolder>/` and return its vault path.
 * Returns "" (no image) if the URL fails the SSRF guard or the download fails —
 * we deliberately do NOT fall back to embedding the page-controlled external URL.
 */
async function downloadImage(
	app: App,
	settings: BookmarkerSettings,
	root: string,
	slug: string,
	imageUrl: string,
): Promise<string> {
	if (!isSafeRemoteUrl(imageUrl)) {
		return "";
	}
	try {
		const response = await requestUrl({ url: imageUrl, throw: false });
		if (response.status < 200 || response.status >= 300) {
			return "";
		}
		const ext = pickExtension(imageUrl, response.headers?.["content-type"]);
		const assetDir = normalizePath(`${root}/${settings.assetSubfolder}`);
		await ensureFolder(app, assetDir);
		const assetPath = `${assetDir}/${slug}.${ext}`;
		await app.vault.createBinary(assetPath, response.arrayBuffer);
		return assetPath;
	} catch {
		return "";
	}
}

function pickExtension(url: string, contentType?: string): string {
	const byType: Record<string, string> = {
		"image/jpeg": "jpg",
		"image/jpg": "jpg",
		"image/png": "png",
		"image/gif": "gif",
		"image/webp": "webp",
		"image/svg+xml": "svg",
		"image/avif": "avif",
	};
	if (contentType) {
		const key = contentType.split(";")[0].trim().toLowerCase();
		if (byType[key]) return byType[key];
	}
	try {
		const match = new URL(url).pathname.match(
			/\.(jpe?g|png|gif|webp|svg|avif)$/i,
		);
		if (match) {
			const ext = match[1].toLowerCase();
			return ext === "jpeg" ? "jpg" : ext;
		}
	} catch {
		// fall through to default
	}
	return "png";
}

/** kebab-case slug of the title, truncated ~60 chars, deduped against the root. */
function uniqueSlug(app: App, root: string, title: string): string {
	const base = slugify(title) || "bookmark";
	let candidate = base;
	let n = 1;
	while (app.vault.getAbstractFileByPath(`${root}/${candidate}.md`)) {
		candidate = `${base}-${n++}`;
	}
	return candidate;
}

function slugify(title: string): string {
	return title
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60)
		.replace(/-+$/g, "");
}

async function ensureFolder(app: App, path: string): Promise<void> {
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFolder) return;
	if (existing) {
		throw new Error(`a file already exists where a folder is expected: ${path}`);
	}
	await app.vault.createFolder(path);
}

function buildNote(
	url: string,
	metadata: PageMetadata,
	imageRef: string,
	created: string,
): string {
	const title = sanitizeText(metadata.title) || metadata.domain || "Bookmark";
	const description = sanitizeText(metadata.description);

	// stringifyYaml handles quoting/escaping; we pass plain values.
	const frontmatter = stringifyYaml({
		url,
		title,
		description,
		created,
		domain: metadata.domain,
		tags: [],
		image: imageRef,
		favicon: metadata.faviconUrl ?? "",
		archive: "",
		source: "obsidian-bookmarker",
	}).replace(/\s+$/, "");

	const body: string[] = [`# ${title}`, ""];
	if (imageRef) {
		body.push(`![preview](${imageRef})`, "");
	}
	if (description) {
		body.push(description, "");
	}
	body.push(`[${metadata.domain}](${url})`, "");

	return `---\n${frontmatter}\n---\n\n${body.join("\n")}`;
}

/** Collapse control chars and whitespace so page text can't break note structure. */
function sanitizeText(value: string): string {
	let out = "";
	for (const ch of value) {
		const code = ch.charCodeAt(0);
		// Replace C0 controls (incl. CR/LF/tab), DEL, and line/paragraph separators.
		const isControl =
			code <= 0x1f || code === 0x7f || code === 0x2028 || code === 0x2029;
		out += isControl ? " " : ch;
	}
	return out.replace(/\s+/g, " ").trim();
}
