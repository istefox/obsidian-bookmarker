import { App, normalizePath, stringifyYaml, TFolder } from "obsidian";
import { BookmarkerSettings } from "./settings";
import { BookmarkDraft } from "./types";
import { isSafeRemoteUrl } from "./url-safety";

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
	const targetDir = draft.folder
		? normalizePath(`${root}/${draft.folder}`)
		: root;
	await ensureFolder(app, targetDir);

	const slug = uniqueSlug(app, targetDir, draft.title);
	const notePath = normalizePath(`${targetDir}/${slug}.md`);
	await app.vault.create(notePath, buildNote(draft));
	return notePath;
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

/** kebab-case slug of the title, truncated ~60 chars, deduped against the folder. */
function uniqueSlug(app: App, dir: string, title: string): string {
	const base = slugify(title) || "bookmark";
	let candidate = base;
	let n = 1;
	while (app.vault.getAbstractFileByPath(normalizePath(`${dir}/${candidate}.md`))) {
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

function buildNote(draft: BookmarkDraft): string {
	const title = sanitizeText(draft.title) || draft.domain || "Bookmark";
	const description = sanitizeText(draft.description);
	const image = draft.imageUrl && isSafeRemoteUrl(draft.imageUrl) ? draft.imageUrl : "";
	const favicon =
		draft.faviconUrl && isSafeRemoteUrl(draft.faviconUrl) ? draft.faviconUrl : "";

	const frontmatter = stringifyYaml({
		url: draft.url,
		title,
		description,
		created: new Date().toISOString(),
		domain: draft.domain,
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
