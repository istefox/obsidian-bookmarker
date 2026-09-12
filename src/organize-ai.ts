import { App, Notice, normalizePath, TFile } from "obsidian";
import type BookmarkerPlugin from "./main";
import { classifyBookmark } from "./classifier";
import { readTaxonomy } from "./taxonomy";
import { ensureFolder, sanitizeFileName, sanitizeFolderPath } from "./note-writer";
import { BOOKMARK_VIEW_TYPE, BookmarkView } from "./bookmark-view";
import { ClassificationResult } from "./types";
import { OrganizeModal, OrganizeRow, OrganizeSelection } from "./organize-modal";
import { bookmarkNoteFiles } from "./organize-scan";
import { normalizeTags } from "./tags";

interface Candidate {
	file: TFile;
	title: string;
	currentTags: string[];
	currentFolder: string;
	classification: ClassificationResult;
}

/** Re-run the classifier over the selected/visible bookmarks and replace their tags. */
export async function bulkRetagBookmarks(plugin: BookmarkerPlugin): Promise<void> {
	const candidates = await classifyCandidates(plugin, "bulk-retag");
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
	const candidates = await classifyCandidates(plugin, "suggest-folder-moves");
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
 * Per-command batch-continuation offsets, so a re-run advances into the untouched
 * tail of the resolved candidate set instead of always re-slicing from index 0.
 * Keyed by an opaque command id ("bulk-retag" vs. "suggest-folder-moves" each get
 * independent progress) plus the resolved set's signature (sorted file paths): if
 * the composition of candidates changes between runs (different board
 * selection/filter, files added/removed), the offset resets to 0 rather than
 * skipping files that were never actually processed. Session-only, in-memory:
 * closing/reopening Obsidian resets progress, which is an acceptable same-session
 * convenience, not a persisted queue.
 */
interface BatchContinuation {
	signature: string;
	offset: number;
}
const batchContinuations = new Map<string, BatchContinuation>();

/** Stable signature for a resolved candidate set, order-independent. */
function candidateSetSignature(paths: string[]): string {
	return [...paths].sort().join("\n");
}

/**
 * Pure offset lookup: where to resume `commandId`'s batch within `paths`. Returns 0
 * when there is no prior state or the candidate set's composition changed since the
 * last run. Exported for unit testing without a live Obsidian App/TFile.
 */
export function nextBatchOffset(
	state: Map<string, BatchContinuation>,
	commandId: string,
	paths: string[],
): { offset: number; signature: string } {
	const signature = candidateSetSignature(paths);
	const prior = state.get(commandId);
	const offset = prior && prior.signature === signature ? prior.offset : 0;
	return { offset, signature };
}

/**
 * Pure offset commit: advance `commandId`'s progress past a successfully processed
 * batch, or forget it once the whole set is consumed (so the next run starts over
 * from the top). Only call this after the batch actually finished processing —
 * committing before a failed classify would skip the files that were never
 * classified. Exported for unit testing.
 */
export function commitBatchOffset(
	state: Map<string, BatchContinuation>,
	commandId: string,
	signature: string,
	offsetBefore: number,
	batchSize: number,
	total: number,
): void {
	const offsetAfter = offsetBefore + batchSize;
	if (offsetAfter >= total) {
		state.delete(commandId);
	} else {
		state.set(commandId, { signature, offset: offsetAfter });
	}
}

/**
 * Resolve candidates (board selection → visible cards → whole vault), cap them, and
 * classify each from stored frontmatter (no per-page fetch). Returns null when there
 * is nothing to do (a Notice is shown). `commandId` scopes batch-continuation state
 * (see `nextBatchOffset`/`commitBatchOffset`) independently per calling command.
 */
async function classifyCandidates(
	plugin: BookmarkerPlugin,
	commandId: string,
): Promise<Candidate[] | null> {
	const { app, settings } = plugin;
	const files = resolveCandidateFiles(plugin);
	if (files.length === 0) {
		new Notice("Bookmarker: no bookmarks to organize.");
		return null;
	}

	const cap = settings.organizeBatchCap;
	const paths = files.map((f) => f.path);
	const { offset, signature } = nextBatchOffset(batchContinuations, commandId, paths);
	const capped = files.slice(offset, offset + cap);

	const taxonomy = readTaxonomy(app, settings.rootFolder, settings.brokenFolderName);
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
	commitBatchOffset(batchContinuations, commandId, signature, offset, capped.length, files.length);

	const processedSoFar = offset + capped.length;
	const remaining = files.length - processedSoFar;
	if (remaining > 0) {
		new Notice(
			`Bookmarker: processed ${processedSoFar} of ${files.length} (batch cap reached); ` +
				`re-run to continue with the remaining ${remaining}.`,
		);
	}
	return out;
}

/**
 * Board selection, else the visible cards, else — only when no board view is open
 * at all — every bookmark under the root. Once a board is open, "zero visible
 * cards" (e.g. an active filter/search matching nothing) means zero candidates: it
 * must never silently expand back out to the whole vault, since that would run the
 * classifier over hidden bookmarks the user never selected or even saw.
 */
function resolveCandidateFiles(plugin: BookmarkerPlugin): TFile[] {
	const leaf = plugin.app.workspace.getLeavesOfType(BOOKMARK_VIEW_TYPE)[0];
	const view = leaf?.view instanceof BookmarkView ? leaf.view : null;
	if (view) {
		return pickCandidateFiles(true, view.getSelectedFiles(), view.getVisibleFiles(), []);
	}
	return pickCandidateFiles(false, [], [], bookmarkNoteFiles(plugin.app, plugin.settings));
}

/**
 * Pure candidate-resolution decision. With a board view open, selection wins, else
 * visible cards (even if that list is empty — no vault-wide fallback). The
 * whole-vault fallback applies only when there is no board view open at all.
 * Exported for unit testing without a live Obsidian App/TFile.
 */
export function pickCandidateFiles<T>(
	hasBoardView: boolean,
	selectedFiles: T[],
	visibleFiles: T[],
	wholeVaultFiles: T[],
): T[] {
	if (hasBoardView) {
		return selectedFiles.length > 0 ? selectedFiles : visibleFiles;
	}
	return wholeVaultFiles;
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
