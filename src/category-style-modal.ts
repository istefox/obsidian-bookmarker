import { App, Modal, Setting, setIcon } from "obsidian";

interface CategoryStyleOptions {
	/** Display name of the category ("Uncategorized" for root-level bookmarks). */
	category: string;
	color: string;
	icon: string;
	onSave: (color: string, icon: string) => void;
}

/** Theme-friendly swatches offered for a category accent color. */
const SWATCHES = [
	"#e5534b",
	"#d9730d",
	"#dfab01",
	"#49852e",
	"#2f9e9e",
	"#4f7cd9",
	"#9a5cd0",
	"#c2557f",
];

/**
 * Pick a color and an icon for a category tile. The icon accepts either an emoji
 * or a Lucide icon name; the preview reflects whichever the field resolves to.
 */
export class CategoryStyleModal extends Modal {
	private readonly opts: CategoryStyleOptions;
	private color: string;
	private icon: string;
	private previewEl: HTMLElement | null = null;

	constructor(app: App, opts: CategoryStyleOptions) {
		super(app);
		this.opts = opts;
		this.color = opts.color;
		this.icon = opts.icon;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: `Category "${this.opts.category}"` });

		const preview = contentEl.createDiv({ cls: "bookmarker-category-preview" });
		this.previewEl = preview.createSpan({ cls: "bookmarker-category-icon" });
		this.updatePreview();

		new Setting(contentEl)
			.setName("Icon")
			.setDesc("An emoji or a Lucide icon name (e.g. shopping-cart).")
			.addText((text) => {
				text
					.setPlaceholder("🛒 or shopping-cart")
					.setValue(this.icon)
					.onChange((value) => {
						this.icon = value.trim();
						this.updatePreview();
					});
			});

		const colorSetting = new Setting(contentEl).setName("Color");
		const swatches = colorSetting.controlEl.createDiv({ cls: "bookmarker-color-swatches" });
		const mark = (selected: HTMLElement): void => {
			swatches
				.querySelectorAll(".bookmarker-color-swatch")
				.forEach((el) => el.removeClass("is-selected"));
			selected.addClass("is-selected");
		};
		for (const value of SWATCHES) {
			const swatch = swatches.createSpan({ cls: "bookmarker-color-swatch" });
			swatch.setCssProps({ "--bm-swatch": value });
			if (value === this.color) swatch.addClass("is-selected");
			swatch.addEventListener("click", () => {
				this.color = value;
				mark(swatch);
				this.updatePreview();
			});
		}
		const none = swatches.createSpan({
			cls: "bookmarker-color-swatch bookmarker-color-none",
			text: "None",
		});
		if (!this.color) none.addClass("is-selected");
		none.addEventListener("click", () => {
			this.color = "";
			mark(none);
			this.updatePreview();
		});

		new Setting(contentEl)
			.addButton((button) =>
				button
					.setButtonText("Save")
					.setCta()
					.onClick(() => {
						this.close();
						this.opts.onSave(this.color, this.icon);
					}),
			)
			.addButton((button) =>
				button.setButtonText("Reset").onClick(() => {
					this.close();
					this.opts.onSave("", "");
				}),
			)
			.addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()));
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/** Render the chosen icon (Lucide or emoji) tinted with the chosen color. */
	private updatePreview(): void {
		const el = this.previewEl;
		if (!el) return;
		el.empty();
		el.setCssProps({ "--bm-cat-color": this.color || "var(--text-normal)" });
		const value = this.icon || "folder";
		setIcon(el, value);
		if (!el.querySelector("svg")) el.setText(value);
	}
}
