import { App, normalizePath, requestUrl, TFolder } from "obsidian";
import { BookmarkerSettings } from "./settings";
import { PageMetadata } from "./types";

/**
 * Write a bookmark note into the root folder (M2: no category subfolder yet —
 * the classifier picks a subfolder in M3). Downloads the preview image into the
 * asset subfolder; on download failure keeps the external image URL instead.
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

/** Download the image into `<root>/<assetSubfolder>/`; return its vault path, or
 *  the original external URL if the download fails. */
async function downloadImage(
	app: App,
	settings: BookmarkerSettings,
	root: string,
	slug: string,
	imageUrl: string,
): Promise<string> {
	try {
		const response = await requestUrl({ url: imageUrl, throw: false });
		if (response.status < 200 || response.status >= 300) {
			return imageUrl;
		}
		const ext = pickExtension(imageUrl, response.headers?.["content-type"]);
		const assetDir = normalizePath(`${root}/${settings.assetSubfolder}`);
		await ensureFolder(app, assetDir);
		const assetPath = `${assetDir}/${slug}.${ext}`;
		await app.vault.createBinary(assetPath, response.arrayBuffer);
		return assetPath;
	} catch {
		return imageUrl;
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
	const frontmatter = [
		"---",
		`url: ${yaml(url)}`,
		`title: ${yaml(metadata.title)}`,
		`description: ${yaml(metadata.description)}`,
		`created: ${yaml(created)}`,
		`domain: ${yaml(metadata.domain)}`,
		"tags: []",
		`image: ${yaml(imageRef)}`,
		`favicon: ${yaml(metadata.faviconUrl ?? "")}`,
		`archive: ${yaml("")}`,
		`source: ${yaml("obsidian-bookmarker")}`,
		"---",
		"",
	];

	const body: string[] = [`# ${metadata.title}`, ""];
	if (imageRef) {
		body.push(`![preview](${imageRef})`, "");
	}
	if (metadata.description) {
		body.push(metadata.description, "");
	}
	body.push(`[${metadata.domain}](${url})`, "");

	return frontmatter.concat(body).join("\n");
}

/** Double-quoted YAML scalar with backslash/quote escaping. */
function yaml(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
