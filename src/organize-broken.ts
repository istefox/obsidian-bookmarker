import { App, Notice, normalizePath, TFile } from "obsidian";
import type BookmarkerPlugin from "./main";
import { isUrlBroken } from "./link-check";
import { fetchWaybackSnapshot } from "./archive";
import { ensureFolder, sanitizeFileName } from "./note-writer";
import { OrganizeModal, OrganizeRow, OrganizeSelection } from "./organize-modal";
import { bookmarkNoteFiles, frontmatterUrl } from "./organize-scan";
import { addTag } from "./tags";

interface BrokenEntry {
	file: TFile;
	url: string;
	snapshot: string | null;
}

/**
 * Scan every bookmark for a dead URL and offer per-item, non-destructive remediation:
 * swap in a Wayback snapshot, move the note into the broken-link folder, or mark it
 * with frontmatter + a #broken tag. Conservative detection (see link-check).
 */
export async function cleanUpBrokenLinks(plugin: BookmarkerPlugin): Promise<void> {
	const { app, settings } = plugin;
	const files = bookmarkNoteFiles(app, settings);
	if (files.length === 0) {
		new Notice("Bookmarker: no bookmarks to check.");
		return;
	}

	const notice = new Notice("Checking links…", 0);
	const broken: BrokenEntry[] = [];
	try {
		for (let i = 0; i < files.length; i++) {
			notice.setMessage(`Checking links ${i + 1}/${files.length}…`);
			const url = frontmatterUrl(app, files[i]);
			if (url && (await isUrlBroken(url))) {
				const snapshot = await fetchWaybackSnapshot(url);
				broken.push({ file: files[i], url, snapshot });
			}
		}
	} finally {
		notice.hide();
	}

	if (broken.length === 0) {
		new Notice("Bookmarker: no broken links found.");
		return;
	}

	const byId = new Map<string, BrokenEntry>();
	const rows: OrganizeRow[] = broken.map((entry) => {
		byId.set(entry.file.path, entry);
		const hasSnapshot = entry.snapshot !== null;
		const preferred = settings.brokenDefaultRemediation;
		const effective = preferred === "wayback" && !hasSnapshot ? "mark" : preferred;
		return {
			id: entry.file.path,
			label: title(app, entry.file),
			detail: entry.url,
			selected: true,
			options: [
				{ value: "wayback", label: "Swap in Wayback snapshot", disabled: !hasSnapshot },
				{ value: "move", label: `Move to ${settings.brokenFolderName}` },
				{ value: "mark", label: "Mark (frontmatter + #broken tag)" },
			],
			optionValue: effective,
		};
	});

	new OrganizeModal(app, {
		title: "Clean up broken links",
		intro: `${broken.length} broken link(s). Choose a remediation per item; all actions are non-destructive.`,
		rows,
		applyLabel: "Apply",
		onApply: (selected) => applyRemediations(plugin, byId, selected),
	}).open();
}

async function applyRemediations(
	plugin: BookmarkerPlugin,
	byId: Map<string, BrokenEntry>,
	selected: OrganizeSelection[],
): Promise<void> {
	const { app, settings } = plugin;
	let archived = 0;
	let moved = 0;
	let marked = 0;
	let failed = 0;

	for (const sel of selected) {
		const entry = byId.get(sel.id);
		if (!entry) continue;
		try {
			switch (sel.optionValue) {
				case "wayback":
					if (entry.snapshot) {
						await app.fileManager.processFrontMatter(
							entry.file,
							(fm: Record<string, unknown>) => {
								// Preserve the original URL before swapping in the snapshot.
								if (typeof fm.url === "string" && !fm.originalUrl) {
									fm.originalUrl = fm.url;
								}
								fm.url = entry.snapshot;
								fm.archive = entry.snapshot;
								fm.broken = false;
							},
						);
						archived++;
					}
					break;
				case "move":
					await moveToBrokenFolder(app, entry.file, settings.rootFolder, settings.brokenFolderName);
					moved++;
					break;
				default:
					await app.fileManager.processFrontMatter(
						entry.file,
						(fm: Record<string, unknown>) => {
							fm.broken = true;
							fm.tags = addTag(fm.tags, "broken");
						},
					);
					marked++;
					break;
			}
		} catch (error) {
			failed++;
			console.warn(`[bookmarker] remediation failed for ${entry.file.path}:`, error);
		}
	}

	const tail = failed ? `, ${failed} failed` : "";
	new Notice(
		`Bookmarker: remediated ${archived + moved + marked} link(s) ` +
			`(${archived} archived, ${moved} moved, ${marked} marked)${tail}.`,
	);
}

async function moveToBrokenFolder(
	app: App,
	file: TFile,
	rootFolder: string,
	brokenFolderName: string,
): Promise<void> {
	const targetDir = normalizePath(`${rootFolder}/${brokenFolderName}`);
	if ((file.parent?.path ?? "") === targetDir) return;
	await ensureFolder(app, targetDir);
	const base = sanitizeFileName(file.basename);
	let name = base;
	let n = 1;
	while (app.vault.getAbstractFileByPath(normalizePath(`${targetDir}/${name}.md`))) {
		name = `${base} ${n++}`;
	}
	await app.fileManager.renameFile(file, normalizePath(`${targetDir}/${name}.md`));
}

function title(app: App, file: TFile): string {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	return fm && typeof fm.title === "string" && fm.title ? fm.title : file.basename;
}
