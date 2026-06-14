import { App, ButtonComponent, Modal, Notice, Setting } from "obsidian";
import type BookmarkerPlugin from "./main";
import { ImportItem, parseImport } from "./import";
import { findDuplicate } from "./duplicates";
import { detectType } from "./metadata";
import { sanitizeFileName, writeBookmarkNote } from "./note-writer";
import { BookmarkDraft } from "./types";

/** Import bookmarks from a Netscape HTML (Pocket/Raindrop/browser) or CSV export. */
export class ImportModal extends Modal {
	private readonly plugin: BookmarkerPlugin;
	private file: File | null = null;
	private statusEl!: HTMLElement;
	private importButton?: ButtonComponent;
	private importing = false;

	constructor(app: App, plugin: BookmarkerPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Import bookmarks" });
		contentEl.createEl("p", {
			cls: "bookmarker-domain-notice",
			text: "Pick a Netscape HTML export (Pocket, Raindrop, browser) or a Raindrop CSV. Existing URLs are skipped.",
		});

		const fileInput = contentEl.createEl("input", {
			attr: { type: "file", accept: ".html,.htm,.csv" },
		});
		fileInput.addEventListener("change", () => {
			this.file = fileInput.files?.[0] ?? null;
		});

		this.statusEl = contentEl.createEl("p", { cls: "bookmarker-domain-notice" });

		new Setting(contentEl)
			.addButton((button) => {
				this.importButton = button;
				button
					.setButtonText("Import")
					.setCta()
					.onClick(() => void this.run());
			})
			.addButton((button) =>
				button.setButtonText("Cancel").onClick(() => this.close()),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async run(): Promise<void> {
		if (this.importing) return;
		if (!this.file) {
			this.statusEl.setText("Choose a file first.");
			return;
		}
		this.importing = true;
		this.importButton?.setDisabled(true);
		try {
			const content = await this.file.text();
			const items = parseImport(this.file.name, content);
			if (items.length === 0) {
				this.statusEl.setText("No bookmarks found in that file.");
				return;
			}
			const { imported, skipped, failed } = await this.importItems(items);
			const tail = failed ? `, ${failed} failed` : "";
			new Notice(`Imported ${imported}, skipped ${skipped} duplicate(s)${tail}.`);
			this.close();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.statusEl.setText(`Import failed: ${message}`);
		} finally {
			this.importing = false;
			this.importButton?.setDisabled(false);
		}
	}

	private async importItems(
		items: ImportItem[],
	): Promise<{ imported: number; skipped: number; failed: number }> {
		const { app } = this;
		const settings = this.plugin.settings;
		let imported = 0;
		let skipped = 0;
		let failed = 0;
		for (let i = 0; i < items.length; i++) {
			this.statusEl.setText(`Importing ${i + 1}/${items.length}…`);
			const item = items[i];
			const existing = findDuplicate(app, settings.rootFolder, item.url);
			if (existing?.exact) {
				skipped++;
				continue;
			}
			try {
				await writeBookmarkNote(app, settings, toDraft(item));
				imported++;
			} catch (error) {
				failed++;
				console.warn(`[bookmarker] import failed for ${item.url}:`, error);
			}
		}
		return { imported, skipped, failed };
	}
}

function toDraft(item: ImportItem): BookmarkDraft {
	return {
		url: item.url,
		name: sanitizeFileName(item.title),
		title: item.title,
		description: "",
		tags: item.tags,
		folder: item.folder ?? "",
		imageUrl: null,
		faviconUrl: null,
		domain: hostname(item.url),
		type: detectType(item.url, ""),
		favorite: false,
		created: safeIso(item.created),
	};
}

function hostname(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return "";
	}
}

/** Keep `created` only if it parses to a real date; otherwise let the writer use now. */
function safeIso(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const date = new Date(value);
	return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}
