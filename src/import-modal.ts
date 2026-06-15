import { App, ButtonComponent, Modal, Notice, Setting } from "obsidian";
import type BookmarkerPlugin from "./main";
import { parseImport } from "./import";
import { importBookmarks } from "./import-writer";

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
			const { imported, skipped, failed } = await importBookmarks(
				this.app,
				this.plugin.settings,
				items,
				(done, total) => this.statusEl.setText(`Importing ${done}/${total}…`),
			);
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
}
