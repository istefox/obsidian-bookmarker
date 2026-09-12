import { App, Notice, TFile } from "obsidian";
import type BookmarkerPlugin from "./main";
import { trashBookmarks } from "./cover-gc";
import { normalizeUrl } from "./duplicates";
import { OrganizeModal, OrganizeRow, OrganizeSelection } from "./organize-modal";
import { bookmarkNoteFiles } from "./organize-scan";
import { normalizeTags } from "./tags";

interface DedupNote {
	file: TFile;
	title: string;
	url: string;
	tags: string[];
	favorite: boolean;
	hasImage: boolean;
	body: string;
	score: number;
}

interface DedupRow {
	row: OrganizeRow;
	keeper: TFile;
	victim: DedupNote;
}

/**
 * Find bookmark notes that resolve to the same normalized URL, keep the richest
 * note in each group, merge the others' tags/notes/favorite into it, and delete
 * the duplicates the user approves. Never empties a group: the keeper is never a row.
 */
export async function deduplicateBookmarks(plugin: BookmarkerPlugin): Promise<void> {
	const { app, settings } = plugin;
	const files = bookmarkNoteFiles(app, settings);

	// Group by normalized URL using cached frontmatter (no file reads yet).
	const groups = new Map<string, TFile[]>();
	for (const file of files) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		const url = fm && typeof fm.url === "string" ? fm.url : "";
		if (!url) continue;
		const key = normalizeUrl(url);
		const list = groups.get(key);
		if (list) list.push(file);
		else groups.set(key, [file]);
	}

	const duplicateGroups = [...groups.values()].filter((g) => g.length > 1);
	if (duplicateGroups.length === 0) {
		new Notice("Bookmarker: no duplicate bookmarks found.");
		return;
	}

	const rows: DedupRow[] = [];
	for (const group of duplicateGroups) {
		const notes = await Promise.all(group.map((f) => readDedupNote(app, f)));
		notes.sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path));
		const [keeper, ...victims] = notes;
		for (const victim of victims) {
			rows.push({
				keeper: keeper.file,
				victim,
				row: {
					id: victim.file.path,
					label: victim.title,
					detail: `Duplicate of "${keeper.title}": merge tags/notes, then delete`,
					selected: true,
					destructive: true,
				},
			});
		}
	}

	const byId = new Map(rows.map((r) => [r.row.id, r]));
	new OrganizeModal(app, {
		title: "Deduplicate bookmarks",
		intro: `${rows.length} duplicate note(s) across ${duplicateGroups.length} group(s). Checked notes are merged into the kept note and deleted.`,
		rows: rows.map((r) => r.row),
		applyLabel: "Merge & delete",
		onApply: (selected) => applyDedup(plugin, byId, selected),
	}).open();
}

async function applyDedup(
	plugin: BookmarkerPlugin,
	byId: Map<string, DedupRow>,
	selected: OrganizeSelection[],
): Promise<void> {
	const { app } = plugin;
	// Two phases: never trash a victim whose merge into the keeper failed, so a
	// partial failure leaves the duplicate intact rather than silently lost.
	const merged: TFile[] = [];
	let failed = 0;
	for (const sel of selected) {
		const entry = byId.get(sel.id);
		if (!entry) continue;
		try {
			await mergeInto(app, entry.keeper, entry.victim);
			merged.push(entry.victim.file);
		} catch (error) {
			failed++;
			console.warn(`[bookmarker] dedup merge failed for ${entry.victim.file.path}:`, error);
		}
	}

	// Trashing the whole batch at once lets two victims sharing one cover release it.
	const result = await trashBookmarks(plugin, merged);
	failed += result.failed;
	const tail = failed ? `, ${failed} failed` : "";
	const covers = result.coversRemoved
		? `, ${result.coversRemoved} cover${result.coversRemoved === 1 ? "" : "s"} reclaimed`
		: "";
	new Notice(
		`Bookmarker: merged & deleted ${result.trashed.length} duplicate(s)${tail}${covers}.`,
	);
}

/** Frontmatter keys owned by the plugin's own schema (note-writer.ts's buildNote,
 * plus broken/hidden set later) — never overwritten by, and never sourced from, a
 * victim's value beyond the tags/favorite handling already done above. */
const KNOWN_FRONTMATTER_KEYS = new Set([
	"url",
	"title",
	"description",
	"created",
	"domain",
	"type",
	"favorite",
	"tags",
	"image",
	"favicon",
	"archive",
	"source",
	"broken",
	"hidden",
]);

/**
 * Copy the victim's custom (non-schema) frontmatter properties into the keeper,
 * without overwriting anything the keeper already has set. Mutates `keeperFm` in
 * place, mirroring the existing tags/favorite merge in `mergeInto`.
 */
export function mergeCustomFrontmatter(
	keeperFm: Record<string, unknown>,
	victimFm: Record<string, unknown> | undefined,
): void {
	if (!victimFm) return;
	for (const key of Object.keys(victimFm)) {
		if (KNOWN_FRONTMATTER_KEYS.has(key)) continue;
		if (keeperFm[key] === undefined) keeperFm[key] = victimFm[key];
	}
}

/**
 * Extract any body content from a victim note that isn't already carried over by
 * the tags/favorite/Notes-bullets merge: everything except the leading `# Title`
 * H1; in the span between the title and the `[domain](url)` fallback link, a lone
 * `![[cover]]` wikilink embed line, a ```embed fenced cover-card block, and (when
 * `description` is given) a plain paragraph that matches it exactly — the
 * auto-generated cover/description boilerplate `buildNote()` writes, not user
 * content; the fallback link line itself; and the `## Notes` section (heading +
 * all its lines, already handled by `extractNotesBullets`). Returns the residual,
 * trimmed of surrounding blank lines, or "" if there is none. Pure and
 * Obsidian-free for easy unit testing.
 */
export function extractResidualBody(body: string, description?: string): string {
	let lines = body.split("\n");

	// The victim's raw content includes the frontmatter block; strip it first.
	if (lines[0]?.trim() === "---") {
		const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
		if (end !== -1) lines = lines.slice(end + 1);
	}

	let i = 0;
	while (i < lines.length && lines[i].trim() === "") i++;
	if (i < lines.length && /^#\s+.+$/.test(lines[i])) i++;

	const normalizedDescription = description?.trim();
	// Only the leading span before the fallback link is eligible for the
	// cover/description boilerplate skips below — past that point a wikilink or
	// a paragraph happening to match the description is ordinary user content.
	let pastFallbackLink = false;
	const kept: string[] = [];
	for (; i < lines.length; i++) {
		const line = lines[i];
		if (line.trim() === "```embed") {
			i++;
			while (i < lines.length && lines[i].trim() !== "```") i++;
			continue;
		}
		if (/^\[[^\]]*\]\([^)]*\)\s*$/.test(line)) {
			pastFallbackLink = true;
			continue;
		}
		if (!pastFallbackLink && /^!\[\[[^\]]+\]\]$/.test(line.trim())) continue;
		if (!pastFallbackLink && normalizedDescription && line.trim() === normalizedDescription) {
			continue;
		}
		if (/^##\s+Notes\s*$/.test(line)) {
			i++;
			while (i < lines.length && !/^#{1,6}\s/.test(lines[i])) i++;
			i--;
			continue;
		}
		kept.push(line);
	}

	while (kept.length && kept[0].trim() === "") kept.shift();
	while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
	return kept.join("\n");
}

/** Merge a victim's tags, favorite, custom frontmatter, Notes bullets, and any
 * other residual body content into the keeper. */
async function mergeInto(app: App, keeper: TFile, victim: DedupNote): Promise<void> {
	const victimFm = app.metadataCache.getFileCache(victim.file)?.frontmatter;
	await app.fileManager.processFrontMatter(keeper, (fm: Record<string, unknown>) => {
		const existing = normalizeTags(fm.tags);
		const seen = new Set(existing.map((t) => t.toLowerCase()));
		for (const tag of victim.tags) {
			if (!seen.has(tag.toLowerCase())) {
				existing.push(tag);
				seen.add(tag.toLowerCase());
			}
		}
		fm.tags = existing;
		if (victim.favorite) fm.favorite = true;
		mergeCustomFrontmatter(fm, victimFm);
	});

	const victimDescription =
		typeof victimFm?.description === "string" ? victimFm.description : undefined;
	const bullets = extractNotesBullets(victim.body);
	const residual = extractResidualBody(victim.body, victimDescription);
	if (bullets.length || residual) {
		await appendMergedContent(app, keeper, bullets, residual, victim.file.basename);
	}
}

async function readDedupNote(app: App, file: TFile): Promise<DedupNote> {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
	const tags = normalizeTags(fm.tags);
	const favorite = fm.favorite === true;
	const hasImage = typeof fm.image === "string" && fm.image.length > 0;
	const title = typeof fm.title === "string" && fm.title ? fm.title : file.basename;
	const url = typeof fm.url === "string" ? fm.url : "";
	const body = await app.vault.read(file);
	// Richer notes win: a cover, more tags, a favorite, and a longer body.
	const score =
		(hasImage ? 100 : 0) + (favorite ? 50 : 0) + tags.length * 10 + body.length * 0.001;
	return { file, title, url, tags, favorite, hasImage, body, score };
}

function extractNotesBullets(body: string): string[] {
	const lines = body.split("\n");
	const idx = lines.findIndex((l) => /^##\s+Notes\s*$/.test(l));
	if (idx === -1) return [];
	const out: string[] = [];
	for (let i = idx + 1; i < lines.length; i++) {
		if (/^#{1,6}\s/.test(lines[i])) break;
		if (lines[i].trim().startsWith("- ")) out.push(lines[i]);
	}
	return out;
}

/**
 * Append a victim's Notes bullets (into the keeper's own `## Notes` section, or a
 * new one) and any residual body content (as a clearly attributed new section at
 * the end) in a single `vault.process` pass.
 */
export async function appendMergedContent(
	app: App,
	keeper: TFile,
	bullets: string[],
	residual: string,
	victimBasename: string,
): Promise<void> {
	await app.vault.process(keeper, (data) => {
		let lines = data.split("\n");

		if (bullets.length) {
			const idx = lines.findIndex((l) => /^##\s+Notes\s*$/.test(l));
			if (idx === -1) {
				while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
				lines.push("", "## Notes", ...bullets);
			} else {
				let insertAt = lines.length;
				for (let i = idx + 1; i < lines.length; i++) {
					if (/^#{1,6}\s/.test(lines[i])) {
						insertAt = i;
						break;
					}
				}
				while (insertAt > idx + 1 && lines[insertAt - 1].trim() === "") insertAt--;
				lines = [
					...lines.slice(0, insertAt),
					...bullets,
					...lines.slice(insertAt),
				];
			}
		}

		if (residual) {
			while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
			lines.push(
				"",
				`## Merged from duplicate (${victimBasename})`,
				"",
				...residual.split("\n"),
			);
		}

		return lines.join("\n") + "\n";
	});
}
