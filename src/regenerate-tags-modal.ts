import { App, Modal, Setting } from "obsidian";

/**
 * Review window for re-proposed tags: shows the AI suggestion as removable chips
 * plus an add-tag input, and applies the final list on Save.
 */
export class RegenerateTagsModal extends Modal {
	private readonly title: string;
	private tags: string[];
	private readonly onApply: (tags: string[]) => void;
	private tagsEl!: HTMLElement;

	constructor(app: App, title: string, tags: string[], onApply: (tags: string[]) => void) {
		super(app);
		this.title = title;
		this.tags = [...tags];
		this.onApply = onApply;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Regenerate tags" });
		contentEl.createEl("p", { cls: "bookmarker-domain-notice", text: this.title });

		const tagsSetting = new Setting(contentEl).setName("Tags");
		this.tagsEl = tagsSetting.controlEl.createDiv({ cls: "bookmarker-tags" });
		this.renderTags();

		new Setting(contentEl).setName("Add tag").addText((text) => {
			text.inputEl.addEventListener("keydown", (e) => {
				if (e.key !== "Enter") return;
				e.preventDefault();
				const tag = text.getValue().replace(/^#/, "").trim();
				if (tag && !this.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
					this.tags.push(tag);
					this.renderTags();
				}
				text.setValue("");
			});
		});

		new Setting(contentEl)
			.addButton((button) =>
				button
					.setButtonText("Save")
					.setCta()
					.onClick(() => {
						this.onApply(this.tags);
						this.close();
					}),
			)
			.addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()));
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderTags(): void {
		this.tagsEl.empty();
		if (this.tags.length === 0) {
			this.tagsEl.createSpan({ cls: "bookmarker-domain-notice", text: "No tags." });
			return;
		}
		for (const tag of this.tags) {
			const chip = this.tagsEl.createSpan({ cls: "bookmarker-tag-chip", text: tag });
			const remove = chip.createSpan({ cls: "bookmarker-tag-remove", text: " ✕" });
			remove.addEventListener("click", () => {
				this.tags = this.tags.filter((t) => t !== tag);
				this.renderTags();
			});
		}
	}
}
