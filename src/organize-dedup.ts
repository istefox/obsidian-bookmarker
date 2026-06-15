import { App, Notice, TFile } from "obsidian";
import type BookmarkerPlugin from "./main";
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
		onApply: (selected) => applyDedup(app, byId, selected),
	}).open();
}

async function applyDedup(
	app: App,
	byId: Map<string, DedupRow>,
	selected: OrganizeSelection[],
): Promise<void> {
	let merged = 0;
	let failed = 0;
	for (const sel of selected) {
		const entry = byId.get(sel.id);
		if (!entry) continue;
		// Two phases: never trash a victim whose merge into the keeper failed, so a
		// partial failure leaves the duplicate intact rather than silently lost.
		try {
			await mergeInto(app, entry.keeper, entry.victim);
		} catch (error) {
			failed++;
			console.warn(`[bookmarker] dedup merge failed for ${entry.victim.file.path}:`, error);
			continue;
		}
		try {
			await app.fileManager.trashFile(entry.victim.file);
			merged++;
		} catch (error) {
			failed++;
			console.warn(`[bookmarker] dedup delete failed for ${entry.victim.file.path}:`, error);
		}
	}
	const tail = failed ? `, ${failed} failed` : "";
	new Notice(`Bookmarker: merged & deleted ${merged} duplicate(s)${tail}.`);
}

/** Merge a victim's tags, favorite, and Notes bullets into the keeper. */
async function mergeInto(app: App, keeper: TFile, victim: DedupNote): Promise<void> {
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
	});

	const bullets = extractNotesBullets(victim.body);
	if (bullets.length) await appendNotesBullets(app, keeper, bullets);
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

async function appendNotesBullets(app: App, keeper: TFile, bullets: string[]): Promise<void> {
	await app.vault.process(keeper, (data) => {
		const lines = data.split("\n");
		const idx = lines.findIndex((l) => /^##\s+Notes\s*$/.test(l));
		if (idx === -1) {
			while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
			lines.push("", "## Notes", ...bullets);
			return lines.join("\n") + "\n";
		}
		let insertAt = lines.length;
		for (let i = idx + 1; i < lines.length; i++) {
			if (/^#{1,6}\s/.test(lines[i])) {
				insertAt = i;
				break;
			}
		}
		while (insertAt > idx + 1 && lines[insertAt - 1].trim() === "") insertAt--;
		lines.splice(insertAt, 0, ...bullets);
		return lines.join("\n");
	});
}
