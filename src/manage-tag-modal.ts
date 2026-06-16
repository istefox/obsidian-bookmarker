import { App, ButtonComponent, Modal, Setting } from "obsidian";

interface ManageTagOptions {
	tag: string;
	usage: number;
	onReplace: (replacement: string) => void | Promise<void>;
	onDelete: () => void | Promise<void>;
}

/**
 * Right-click action for a tag chip: replace the tag with another across all
 * bookmarks, or delete it everywhere. Replace is enabled once a new tag is typed;
 * Delete removes it from every note (and therefore from the tag panel).
 */
export class ManageTagModal extends Modal {
	private readonly opts: ManageTagOptions;
	private replacement = "";
	private replaceButton: ButtonComponent | null = null;

	constructor(app: App, opts: ManageTagOptions) {
		super(app);
		this.opts = opts;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: `Manage tag "${this.opts.tag}"` });
		contentEl.createEl("p", {
			cls: "bookmarker-domain-notice",
			text:
				`Used on ${this.opts.usage} bookmark${this.opts.usage === 1 ? "" : "s"}. ` +
				`Replace it with another tag, or delete it from all of them.`,
		});

		new Setting(contentEl).setName("Replace with").addText((text) => {
			text.setPlaceholder("new tag (optional)").onChange((value) => {
				this.replacement = value.replace(/^#/, "").trim();
				this.replaceButton?.setDisabled(this.replacement.length === 0);
			});
			text.inputEl.addEventListener("keydown", (event) => {
				if (event.key === "Enter" && this.replacement) {
					event.preventDefault();
					this.doReplace();
				}
			});
		});

		new Setting(contentEl)
			.addButton((button) => {
				this.replaceButton = button;
				button.setButtonText("Replace").setCta().setDisabled(true).onClick(() => this.doReplace());
			})
			.addButton((button) => {
				// mod-warning is the stable CSS class behind the (version-gated) destructive
				// button helpers; applying it directly keeps minAppVersion at 1.7.2.
				button.buttonEl.addClass("mod-warning");
				button.setButtonText("Delete from all").onClick(() => this.doDelete());
			})
			.addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()));
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private doReplace(): void {
		if (!this.replacement) return;
		this.close();
		void this.opts.onReplace(this.replacement);
	}

	private doDelete(): void {
		this.close();
		void this.opts.onDelete();
	}
}
