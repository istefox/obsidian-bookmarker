import { App, normalizePath, stringifyYaml, TFolder } from "obsidian";
import { BookmarkerSettings } from "./settings";
import { BookmarkDraft } from "./types";
import { isSafeRemoteUrl } from "./url-safety";
import { proxiedImage } from "./image";

// Standard Open Graph image ratio (1200x630). Supplied to the link-embed card so
// the obsidian-link-embed plugin renders without re-fetching image dimensions.
const DEFAULT_ASPECT_RATIO = 1.91;

/**
 * Write a bookmark note from the final (user-confirmed) draft. The preview image
 * is rendered as an obsidian-link-embed card referencing the external image URL —
 * no local file, no asset folder. Returns the vault path of the created note.
 */
export async function writeBookmarkNote(
	app: App,
	settings: BookmarkerSettings,
	draft: BookmarkDraft,
): Promise<string> {
	const root = normalizePath(settings.rootFolder);
	const safeFolder = sanitizeFolderPath(draft.folder);
	const targetDir = safeFolder ? normalizePath(`${root}/${safeFolder}`) : root;
	await ensureFolder(app, targetDir);

	const name = uniqueName(app, targetDir, draft.name || draft.title);
	const notePath = normalizePath(`${targetDir}/${name}.md`);
	await app.vault.create(notePath, buildNote(draft, settings));
	return notePath;
}

/** Filesystem-safe relative folder path: drop ".."/"." segments and illegal chars. */
function sanitizeFolderPath(folder: string): string {
	return folder
		.split(/[/\\]+/)
		.map((seg) => seg.replace(/[\\/:*?"<>|]/g, "").trim())
		.filter((seg) => seg && seg !== "." && seg !== "..")
		.join("/");
}

/** Create a folder and any missing parents, tolerating folders that already exist. */
async function ensureFolder(app: App, path: string): Promise<void> {
	let current = "";
	for (const part of path.split("/")) {
		current = current ? `${current}/${part}` : part;
		const existing = app.vault.getAbstractFileByPath(current);
		if (existing instanceof TFolder) continue;
		if (existing) {
			throw new Error(`a file already exists where a folder is expected: ${current}`);
		}
		await app.vault.createFolder(current);
	}
}

/** Readable, filesystem-safe file name, deduped against the folder with " 1", " 2". */
function uniqueName(app: App, dir: string, name: string): string {
	const base = sanitizeFileName(name);
	let candidate = base;
	let n = 1;
	while (app.vault.getAbstractFileByPath(normalizePath(`${dir}/${candidate}.md`))) {
		candidate = `${base} ${n++}`;
	}
	return candidate;
}

/** Strip characters Obsidian/filesystems reject, keep it readable. */
export function sanitizeFileName(name: string): string {
	let out = "";
	for (const ch of name) {
		const code = ch.charCodeAt(0);
		const illegal = '\\/:*?"<>|'.includes(ch);
		const control = code <= 0x1f || code === 0x7f;
		out += illegal || control ? " " : ch;
	}
	out = out.replace(/\s+/g, " ").trim().slice(0, 100).trim();
	return out || "Bookmark";
}

function buildNote(draft: BookmarkDraft, settings: BookmarkerSettings): string {
	const title = sanitizeText(draft.title) || draft.domain || "Bookmark";
	const description = sanitizeText(draft.description);
	const safeImage =
		draft.imageUrl && isSafeRemoteUrl(draft.imageUrl) ? draft.imageUrl : "";
	const image = safeImage ? proxiedImage(safeImage, settings.useImageProxy) : "";
	const favicon =
		draft.faviconUrl && isSafeRemoteUrl(draft.faviconUrl) ? draft.faviconUrl : "";

	const frontmatter = stringifyYaml({
		url: draft.url,
		title,
		description,
		created: draft.created || new Date().toISOString(),
		domain: draft.domain,
		type: draft.type,
		favorite: draft.favorite,
		tags: draft.tags,
		image,
		favicon,
		archive: "",
		source: "obsidian-bookmarker",
	}).replace(/\s+$/, "");

	const body: string[] = [`# ${title}`, ""];
	if (image) {
		// obsidian-link-embed card: renders the image by URL (no local file).
		const card = stringifyYaml({
			title,
			image,
			description,
			url: draft.url,
			favicon,
			aspectRatio: DEFAULT_ASPECT_RATIO,
		}).replace(/\s+$/, "");
		body.push("```embed", card, "```", "");
	} else if (description) {
		body.push(description, "");
	}
	// Fallback link, useful even without the link-embed plugin installed.
	body.push(`[${draft.domain}](${draft.url})`, "");

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
