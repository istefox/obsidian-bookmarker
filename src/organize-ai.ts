import { App, Notice, normalizePath, TFile } from "obsidian";
import type BookmarkerPlugin from "./main";
import { classifyBookmark } from "./classifier";
import { readTaxonomy } from "./taxonomy";
import { ensureFolder, sanitizeFileName, sanitizeFolderPath } from "./note-writer";
import { BOOKMARK_VIEW_TYPE, BookmarkView } from "./bookmark-view";
import { ClassificationResult } from "./types";
import { OrganizeModal, OrganizeRow, OrganizeSelection } from "./organize-modal";
import { bookmarkNoteFiles } from "./organize-scan";

interface Candidate {
	file: TFile;
	title: string;
	currentTags: string[];
	currentFolder: string;
	classification: ClassificationResult;
}

/** Re-run the classifier over the selected/visible bookmarks and replace their tags. */
export async function bulkRetagBookmarks(plugin: BookmarkerPlugin): Promise<void> {
	const candidates = await classifyCandidates(plugin);
	if (!candidates) return;

	const byId = new Map<string, Candidate>();
	const rows: OrganizeRow[] = candidates.map((c) => {
		byId.set(c.file.path, c);
		const before = c.currentTags.join(", ") || "(none)";
		const after = c.classification.tags.join(", ") || "(none)";
		return {
			id: c.file.path,
			label: c.title,
			detail: `${before} → ${after}`,
			selected: true,
		};
	});

	new OrganizeModal(plugin.app, {
		title: "Bulk re-tag bookmarks",
		intro: `${rows.length} bookmark(s). Checked items have their tags replaced with the proposal.`,
		rows,
		applyLabel: "Re-tag",
		onApply: (selected) => applyRetag(plugin.app, byId, selected),
	}).open();
}

/** Propose a better destination subfolder for the selected/visible bookmarks. */
export async function suggestFolderMoves(plugin: BookmarkerPlugin): Promise<void> {
	const candidates = await classifyCandidates(plugin);
	if (!candidates) return;

	// Only propose a move when the suggested folder actually differs.
	const moves = candidates.filter(
		(c) => sanitizeFolderPath(c.classification.folder) !== sanitizeFolderPath(c.currentFolder),
	);
	if (moves.length === 0) {
		new Notice("Bookmarker: no folder changes suggested.");
		return;
	}

	const byId = new Map<string, Candidate>();
	const rows: OrganizeRow[] = moves.map((c) => {
		byId.set(c.file.path, c);
		const from = c.currentFolder || "(root)";
		const to = c.classification.folder || "(root)";
		return {
			id: c.file.path,
			label: c.title,
			detail: `${from} → ${to}`,
			selected: true,
		};
	});

	new OrganizeModal(plugin.app, {
		title: "Suggest folder moves",
		intro: `${rows.length} bookmark(s) look misfiled. Checked items move to the suggested subfolder.`,
		rows,
		applyLabel: "Move",
		onApply: (selected) => applyMoves(plugin, byId, selected),
	}).open();
}

/**
 * Resolve candidates (board selection → visible cards → whole vault), cap them, and
 * classify each from stored frontmatter (no per-page fetch). Returns null when there
 * is nothing to do (a Notice is shown).
 */
async function classifyCandidates(plugin: BookmarkerPlugin): Promise<Candidate[] | null> {
	const { app, settings } = plugin;
	const files = resolveCandidateFiles(plugin);
	if (files.length === 0) {
		new Notice("Bookmarker: no bookmarks to organize.");
		return null;
	}

	const cap = settings.organizeBatchCap;
	const capped = files.slice(0, cap);
	const skipped = files.length - capped.length;

	const taxonomy = readTaxonomy(app, settings.rootFolder);
	const root = normalizePath(settings.rootFolder);
	const prefix = `${root}/`;
	const notice = new Notice("Classifying…", 0);
	const out: Candidate[] = [];
	try {
		for (let i = 0; i < capped.length; i++) {
			notice.setMessage(`Classifying ${i + 1}/${capped.length}…`);
			const file = capped[i];
			const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
			const url = asString(fm.url);
			const classification = await classifyBookmark(
				settings,
				{
					url,
					domain: asString(fm.domain),
					title: asString(fm.title) || file.basename,
					description: asString(fm.description),
					excerpt: "",
				},
				taxonomy,
			);
			const parent = file.parent?.path ?? "";
			out.push({
				file,
				title: asString(fm.title) || file.basename,
				currentTags: normalizeTags(fm.tags),
				currentFolder: parent.startsWith(prefix) ? parent.slice(prefix.length) : "",
				classification,
			});
		}
	} catch (error) {
		notice.hide();
		const msg = error instanceof Error ? error.message : String(error);
		new Notice(`Bookmarker: classify failed (${msg}).`);
		return null;
	}
	notice.hide();

	if (skipped > 0) {
		new Notice(
			`Bookmarker: processed ${capped.length} of ${files.length} (batch cap reached); ` +
				`re-run to continue with the remaining ${skipped}.`,
		);
	}
	return out;
}

/** Board selection, else the visible cards, else every bookmark under the root. */
function resolveCandidateFiles(plugin: BookmarkerPlugin): TFile[] {
	const leaf = plugin.app.workspace.getLeavesOfType(BOOKMARK_VIEW_TYPE)[0];
	const view = leaf?.view instanceof BookmarkView ? leaf.view : null;
	if (view) {
		const selected = view.getSelectedFiles();
		if (selected.length > 0) return selected;
		const visible = view.getVisibleFiles();
		if (visible.length > 0) return visible;
	}
	return bookmarkNoteFiles(plugin.app, plugin.settings);
}

async function applyRetag(
	app: App,
	byId: Map<string, Candidate>,
	selected: OrganizeSelection[],
): Promise<void> {
	let count = 0;
	let failed = 0;
	for (const sel of selected) {
		const c = byId.get(sel.id);
		if (!c) continue;
		try {
			await app.fileManager.processFrontMatter(c.file, (fm: Record<string, unknown>) => {
				fm.tags = normalizeTags(c.classification.tags);
			});
			count++;
		} catch (error) {
			failed++;
			console.warn(`[bookmarker] re-tag failed for ${c.file.path}:`, error);
		}
	}
	const tail = failed ? `, ${failed} failed` : "";
	new Notice(`Bookmarker: re-tagged ${count} bookmark(s)${tail}.`);
}

async function applyMoves(
	plugin: BookmarkerPlugin,
	byId: Map<string, Candidate>,
	selected: OrganizeSelection[],
): Promise<void> {
	const { app, settings } = plugin;
	const root = normalizePath(settings.rootFolder);
	let count = 0;
	let failed = 0;
	for (const sel of selected) {
		const c = byId.get(sel.id);
		if (!c) continue;
		try {
			const rel = sanitizeFolderPath(c.classification.folder);
			const targetDir = rel ? normalizePath(`${root}/${rel}`) : root;
			if (c.file.parent?.path === targetDir) continue;
			await ensureFolder(app, targetDir);
			const base = sanitizeFileName(c.file.basename);
			let name = base;
			let n = 1;
			while (app.vault.getAbstractFileByPath(normalizePath(`${targetDir}/${name}.md`))) {
				name = `${base} ${n++}`;
			}
			await app.fileManager.renameFile(c.file, normalizePath(`${targetDir}/${name}.md`));
			count++;
		} catch (error) {
			failed++;
			console.warn(`[bookmarker] move failed for ${c.file.path}:`, error);
		}
	}
	const tail = failed ? `, ${failed} failed` : "";
	new Notice(`Bookmarker: moved ${count} bookmark(s)${tail}.`);
}

function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function normalizeTags(value: unknown): string[] {
	const parts = Array.isArray(value)
		? value
		: typeof value === "string"
			? value.split(/[\s,]+/)
			: [];
	return parts.map((t) => String(t).replace(/^#/, "").trim()).filter(Boolean);
}
