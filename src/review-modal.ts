import { App, Modal, Setting } from "obsidian";
import { BookmarkDraft, Taxonomy } from "./types";
import { isSafeRemoteUrl } from "./url-safety";

export interface ReviewInput {
	draft: BookmarkDraft;
	taxonomy: Taxonomy;
	confidence: number;
	allowNewFolders: boolean;
}

/**
 * Review window shown before saving (brief §9): edit the title (which renames the
 * note and its file), description, tags, and the destination folder. Resolves with
 * the final draft on Save, or null on Cancel/close.
 */
export class ReviewModal extends Modal {
	private readonly result: BookmarkDraft;
	private readonly input: ReviewInput;
	private readonly onSubmit: (draft: BookmarkDraft | null) => void;
	private settled = false;
	private tagsEl!: HTMLElement;
	private errorEl!: HTMLElement;
	private newFolder = "";

	constructor(
		app: App,
		input: ReviewInput,
		onSubmit: (draft: BookmarkDraft | null) => void,
	) {
		super(app);
		this.input = input;
		this.result = { ...input.draft, tags: [...input.draft.tags] };
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Review bookmark" });

		if (this.result.imageUrl && isSafeRemoteUrl(this.result.imageUrl)) {
			contentEl.createEl("img", {
				cls: "bookmarker-preview",
				attr: { src: this.result.imageUrl },
			});
		}

		new Setting(contentEl).setName("Title").addText((text) => {
			text.setValue(this.result.title).onChange((v) => {
				this.result.title = v;
				this.errorEl.setText("");
			});
			text.inputEl.addClass("bookmarker-wide-input");
		});

		new Setting(contentEl).setName("URL").addText((text) => {
			text.setValue(this.result.url).setDisabled(true);
			text.inputEl.addClass("bookmarker-wide-input");
		});

		new Setting(contentEl).setName("Description").addTextArea((area) => {
			area.setValue(this.result.description).onChange((v) => {
				this.result.description = v;
			});
			area.inputEl.addClass("bookmarker-wide-input");
			area.inputEl.rows = 3;
		});

		// Tags: removable chips + an add-tag input.
		const tagsSetting = new Setting(contentEl).setName("Tags");
		this.tagsEl = tagsSetting.controlEl.createDiv({ cls: "bookmarker-tags" });
		this.renderTags();
		new Setting(contentEl)
			.setName("Add tag")
			.addText((text) => {
				const commit = () => {
					const tag = text.getValue().replace(/^#/, "").trim();
					if (tag && !this.result.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
						this.result.tags.push(tag);
						this.renderTags();
					}
					text.setValue("");
				};
				text.inputEl.addEventListener("keydown", (e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						commit();
					}
				});
			});

		// Destination folder: existing subfolders (+ root), optional new folder.
		new Setting(contentEl)
			.setName("Destination folder")
			.setDesc("Where to file this bookmark, under the root folder.")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "(root)");
				for (const folder of this.input.taxonomy.folders) {
					dropdown.addOption(folder, folder);
				}
				// Proposed folder may be new (not yet in the taxonomy list).
				if (this.result.folder && !this.input.taxonomy.folders.includes(this.result.folder)) {
					dropdown.addOption(this.result.folder, `${this.result.folder} (new)`);
				}
				dropdown.setValue(this.result.folder).onChange((v) => {
					this.result.folder = v;
				});
			});

		if (this.input.allowNewFolders) {
			new Setting(contentEl)
				.setName("Or new subfolder")
				.setDesc("If set, overrides the dropdown above.")
				.addText((text) =>
					text.setPlaceholder("e.g. tech/ai").onChange((v) => {
						this.newFolder = v.trim().replace(/^\/+|\/+$/g, "");
					}),
				);
		}

		contentEl.createEl("p", {
			cls: "bookmarker-confidence",
			text: `Confidence ${this.input.confidence.toFixed(2)}`,
		});

		this.errorEl = contentEl.createEl("p", { cls: "bookmarker-modal-error" });

		new Setting(contentEl)
			.addButton((button) =>
				button
					.setButtonText("Save")
					.setCta()
					.onClick(() => this.save()),
			)
			.addButton((button) =>
				button.setButtonText("Cancel").onClick(() => this.close()),
			);
	}

	onClose(): void {
		this.contentEl.empty();
		this.settle(null);
	}

	private renderTags(): void {
		this.tagsEl.empty();
		if (this.result.tags.length === 0) {
			this.tagsEl.createSpan({ cls: "bookmarker-tags-empty", text: "No tags" });
			return;
		}
		for (const tag of this.result.tags) {
			const chip = this.tagsEl.createSpan({ cls: "bookmarker-tag-chip" });
			chip.createSpan({ text: tag });
			const remove = chip.createSpan({ cls: "bookmarker-tag-remove", text: "×" });
			remove.addEventListener("click", () => {
				this.result.tags = this.result.tags.filter((t) => t !== tag);
				this.renderTags();
			});
		}
	}

	private save(): void {
		const title = this.result.title.trim();
		if (!title) {
			this.errorEl.setText("Title cannot be empty.");
			return;
		}
		this.result.title = title;
		if (this.newFolder) this.result.folder = this.newFolder;
		const draft = this.result;
		this.settle(draft);
		this.close();
	}

	private settle(draft: BookmarkDraft | null): void {
		if (this.settled) return;
		this.settled = true;
		this.onSubmit(draft);
	}
}
