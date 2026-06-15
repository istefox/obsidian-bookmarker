import { App, Modal, Setting } from "obsidian";

/** Small text box to add a dated note to a bookmark. */
export class AnnotateModal extends Modal {
	private readonly bookmarkTitle: string;
	private text = "";
	private readonly onSave: (text: string) => void;

	constructor(app: App, bookmarkTitle: string, onSave: (text: string) => void) {
		super(app);
		this.bookmarkTitle = bookmarkTitle;
		this.onSave = onSave;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Add note" });
		contentEl.createEl("p", { cls: "bookmarker-domain-notice", text: this.bookmarkTitle });

		new Setting(contentEl).addTextArea((area) => {
			area.setPlaceholder("Your note…").onChange((v) => {
				this.text = v;
			});
			area.inputEl.addClass("bookmarker-wide-input");
			area.inputEl.rows = 4;
			window.setTimeout(() => area.inputEl.focus(), 0);
		});

		new Setting(contentEl)
			.addButton((button) =>
				button
					.setButtonText("Save")
					.setCta()
					.onClick(() => {
						const text = this.text.trim();
						if (text) this.onSave(text);
						this.close();
					}),
			)
			.addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
