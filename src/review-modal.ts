import { App, Modal, Setting, TFile } from "obsidian";
import { BookmarkDraft, Taxonomy } from "./types";
import { isSafeRemoteUrl } from "./url-safety";

const BOOKMARK_TYPES = ["article", "video", "image", "document", "audio", "link"];

export interface ReviewInput {
	draft: BookmarkDraft;
	taxonomy: Taxonomy;
	confidence: number;
	allowNewFolders: boolean;
	/** Preview-image candidates to choose from (first is the default). */
	imageCandidates: string[];
	/** Path of an existing bookmark with the same URL, if any. */
	duplicatePath?: string;
	/** The page's domain, and how many existing bookmarks share it. */
	domain?: string;
	domainCount?: number;
	/** Open the board filtered to this domain. */
	onOpenDomain?: () => void;
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
	private previewEl!: HTMLElement;
	private coverOptionsEl!: HTMLElement;
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

		if (this.input.duplicatePath) {
			const name = this.input.duplicatePath.split("/").pop() ?? this.input.duplicatePath;
			contentEl.createEl("p", {
				cls: "bookmarker-setting-warning",
				text: `This page may be a duplicate — a bookmark with a similar URL already exists ("${name}").`,
			});
		}

		// Soft same-domain notice (only when this isn't a same-page duplicate).
		const count = this.input.domainCount ?? 0;
		if (!this.input.duplicatePath && count > 0 && this.input.domain) {
			const notice = contentEl.createDiv({ cls: "bookmarker-domain-notice" });
			notice.createSpan({
				text: `You already have ${count} bookmark${count === 1 ? "" : "s"} from ${this.input.domain}. `,
			});
			const link = notice.createEl("a", {
				cls: "bookmarker-domain-link",
				text: "Show them",
			});
			link.addEventListener("click", () => {
				this.input.onOpenDomain?.();
				this.close();
			});
		}

		this.previewEl = contentEl.createDiv();
		this.renderPreview();
		this.renderCoverPicker(contentEl);

		new Setting(contentEl).setName("Title").addText((text) => {
			text.setValue(this.result.title).onChange((v) => {
				this.result.title = v;
				this.errorEl.setText("");
			});
			text.inputEl.addClass("bookmarker-wide-input");
		});

		new Setting(contentEl)
			.setName("Note name")
			.setDesc("The file name of the note. Defaults to the title; edit to rename.")
			.addText((text) => {
				text.setValue(this.result.name).onChange((v) => {
					this.result.name = v;
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

		new Setting(contentEl).setName("Type").addDropdown((dropdown) => {
			for (const type of BOOKMARK_TYPES) dropdown.addOption(type, type);
			if (this.result.type && !BOOKMARK_TYPES.includes(this.result.type)) {
				dropdown.addOption(this.result.type, this.result.type);
			}
			dropdown.setValue(this.result.type).onChange((v) => {
				this.result.type = v;
			});
		});

		new Setting(contentEl).setName("Favorite").addToggle((toggle) => {
			toggle.setValue(this.result.favorite).onChange((v) => {
				this.result.favorite = v;
			});
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

		const isDuplicate = !!this.input.duplicatePath;
		let armed = false;
		const actions = new Setting(contentEl)
			.addButton((button) => {
				button.setButtonText("Save").setCta();
				button.onClick(() => {
					// On a possible duplicate, require a second confirming click.
					if (isDuplicate && !armed) {
						armed = true;
						button.setButtonText("Confirm duplicate save").setWarning();
						return;
					}
					this.save();
				});
			})
			.addButton((button) =>
				button.setButtonText("Cancel").onClick(() => this.close()),
			);
		if (isDuplicate) {
			actions.addButton((button) =>
				button.setButtonText("Open similar bookmark").onClick(() => {
					const path = this.input.duplicatePath as string;
					const file = this.app.vault.getAbstractFileByPath(path);
					this.close();
					if (file instanceof TFile) {
						void this.app.workspace.getLeaf(false).openFile(file);
					}
				}),
			);
		}
	}

	onClose(): void {
		this.contentEl.empty();
		this.settle(null);
	}

	private renderPreview(): void {
		this.previewEl.empty();
		const url = this.result.imageUrl;
		if (url && isSafeRemoteUrl(url)) {
			this.previewEl.createEl("img", {
				cls: "bookmarker-preview",
				attr: { src: url },
			});
		} else {
			this.previewEl.createDiv({
				cls: "bookmarker-preview bookmarker-preview-empty",
				text: "No cover",
			});
		}
	}

	private renderCoverPicker(parent: HTMLElement): void {
		const setting = new Setting(parent)
			.setName("Cover")
			.setDesc("Pick a preview image, or paste your own below.");
		this.coverOptionsEl = setting.controlEl.createDiv({ cls: "bookmarker-covers" });
		this.renderCoverOptions();

		new Setting(parent)
			.setName("Cover URL")
			.setDesc("Paste an image URL to use a custom cover.")
			.addText((text) => {
				text.setPlaceholder("https://…/image.jpg");
				const commit = () => {
					const url = text.getValue().trim();
					if (url && isSafeRemoteUrl(url)) this.setCover(url);
				};
				text.inputEl.addEventListener("blur", commit);
				text.inputEl.addEventListener("keydown", (e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						commit();
					}
				});
				text.inputEl.addClass("bookmarker-wide-input");
			});
	}

	private renderCoverOptions(): void {
		this.coverOptionsEl.empty();
		const none = this.coverOptionsEl.createDiv({
			cls: "bookmarker-cover-option bookmarker-cover-none",
			text: "None",
		});
		if (!this.result.imageUrl) none.addClass("bookmarker-cover-selected");
		none.addEventListener("click", () => this.setCover(null));

		for (const url of this.safeCandidates()) {
			const opt = this.coverOptionsEl.createEl("img", {
				cls: "bookmarker-cover-option",
				attr: { src: url },
			});
			if (url === this.result.imageUrl) opt.addClass("bookmarker-cover-selected");
			opt.addEventListener("click", () => this.setCover(url));
		}
	}

	private setCover(url: string | null): void {
		this.result.imageUrl = url;
		this.renderPreview();
		this.renderCoverOptions();
	}

	private safeCandidates(): string[] {
		return this.input.imageCandidates.filter((u) => isSafeRemoteUrl(u));
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
		if (!this.result.name.trim()) this.result.name = title;
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
