import { App, Modal, Setting, TextComponent, setIcon } from "obsidian";

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
 * A broad set of Lucide icon names to pick from. Names that the running Obsidian
 * build does not ship are filtered out at render time, so the palette stays valid
 * across versions without a hard dependency on a specific Lucide release.
 */
const ICON_CANDIDATES = [
	"folder", "folder-open", "folder-heart", "folder-git-2", "file", "file-text", "files",
	"bookmark", "book", "book-open", "library", "newspaper", "sticky-note", "clipboard",
	"list", "list-checks", "layout-grid", "layout-list", "columns", "table",
	"star", "heart", "flag", "tag", "tags", "hash", "bell", "inbox", "mail", "send",
	"message-circle", "message-square", "phone", "at-sign",
	"home", "building", "building-2", "factory", "store", "warehouse", "school",
	"landmark", "church", "castle", "hotel",
	"briefcase", "calendar", "calendar-days", "calendar-check", "clock", "alarm-clock",
	"timer", "hourglass", "history",
	"search", "filter", "settings", "sliders-horizontal", "wrench", "hammer", "cog",
	"plug", "power",
	"cpu", "database", "server", "hard-drive", "save", "download", "upload", "cloud",
	"archive", "trash-2",
	"lock", "unlock", "key", "shield", "shield-check", "eye", "eye-off", "fingerprint",
	"camera", "image", "images", "film", "video", "clapperboard", "music", "headphones",
	"mic", "speaker", "volume-2", "radio", "podcast", "disc",
	"monitor", "smartphone", "tablet", "laptop", "tv", "printer", "mouse", "keyboard",
	"gamepad-2", "joystick", "webcam",
	"wifi", "bluetooth", "signal", "battery", "zap", "flashlight",
	"sun", "moon", "cloud-rain", "cloud-snow", "umbrella", "snowflake", "droplet", "wind",
	"thermometer", "sunrise", "sunset", "rainbow",
	"leaf", "tree-pine", "trees", "flower", "sprout", "clover", "mountain", "waves",
	"tent", "palmtree",
	"coffee", "cup-soda", "utensils", "pizza", "beef", "salad", "apple", "cherry",
	"ice-cream", "cookie", "wine", "beer", "martini", "candy", "cake", "croissant",
	"egg", "fish", "carrot", "wheat",
	"car", "bus", "train-front", "plane", "ship", "sailboat", "bike", "rocket", "fuel",
	"anchor", "compass", "map", "map-pin", "navigation", "globe", "route", "footprints",
	"luggage",
	"dices", "puzzle", "swords", "trophy", "medal", "award", "target", "crosshair",
	"dumbbell",
	"palette", "brush", "paintbrush", "pen-tool", "pencil", "pen", "highlighter",
	"eraser", "scissors", "ruler", "shapes", "sticker", "stamp", "type",
	"graduation-cap", "presentation", "microscope", "telescope", "atom", "flask-conical",
	"test-tube", "dna", "calculator", "binary", "sigma", "infinity", "brain", "lightbulb",
	"users", "user", "user-check", "smile", "frown", "laugh", "thumbs-up", "thumbs-down",
	"hand", "handshake", "baby", "accessibility",
	"heart-pulse", "activity", "trending-up", "bar-chart-3", "line-chart", "pie-chart",
	"gauge", "scale",
	"dollar-sign", "euro", "bitcoin", "credit-card", "wallet", "banknote", "coins",
	"piggy-bank", "receipt", "percent", "shopping-cart", "shopping-bag", "package",
	"truck", "box", "boxes", "gift", "ticket",
	"github", "git-branch", "git-merge", "git-pull-request", "code", "terminal", "braces",
	"bug", "command", "container", "blocks", "component", "webhook", "qr-code",
	"link", "external-link", "share-2", "rss", "paperclip",
	"flame", "sparkles", "party-popper", "gem", "crown", "diamond", "feather", "ghost",
	"skull", "bot",
	"shirt", "glasses", "watch", "dog", "cat", "bird", "rabbit", "turtle", "snail",
	"pill", "stethoscope", "syringe", "bandage", "cross", "heart-handshake",
	"axe", "pickaxe", "shovel",
];

/**
 * Pick a color and an icon for a category tile. The icon can be chosen from the
 * built-in palette or typed directly (an emoji or any Lucide name); the preview
 * reflects whichever the field resolves to.
 */
export class CategoryStyleModal extends Modal {
	private readonly opts: CategoryStyleOptions;
	private color: string;
	private icon: string;
	private previewEl: HTMLElement | null = null;
	private iconInput: TextComponent | null = null;
	private paletteEl: HTMLElement | null = null;

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
			.setDesc("Pick one below, or type an emoji or a Lucide icon name.")
			.addText((text) => {
				this.iconInput = text;
				text
					.setPlaceholder("🛒 or shopping-cart")
					.setValue(this.icon)
					.onChange((value) => {
						this.icon = value.trim();
						this.updatePreview();
						this.markSelectedIcon();
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

		const filter = contentEl.createEl("input", {
			cls: "bookmarker-icon-filter",
			attr: { type: "search", placeholder: "Filter icons…" },
		});
		this.paletteEl = contentEl.createDiv({ cls: "bookmarker-icon-palette" });
		this.buildPalette("");
		filter.addEventListener("input", () => this.buildPalette(filter.value.toLowerCase().trim()));

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

	/** Render the icon palette, skipping names the running Lucide build does not provide. */
	private buildPalette(needle: string): void {
		const palette = this.paletteEl;
		if (!palette) return;
		palette.empty();
		for (const name of ICON_CANDIDATES) {
			if (needle && !name.includes(needle)) continue;
			const option = palette.createSpan({
				cls: "bookmarker-icon-option",
				attr: { "aria-label": name, title: name },
			});
			setIcon(option, name);
			if (!option.querySelector("svg")) {
				option.remove();
				continue;
			}
			if (name === this.icon) option.addClass("is-selected");
			option.addEventListener("click", () => {
				this.icon = name;
				this.iconInput?.setValue(name);
				this.updatePreview();
				this.markSelectedIcon();
			});
		}
	}

	/** Sync the palette highlight with the current icon value. */
	private markSelectedIcon(): void {
		this.paletteEl?.querySelectorAll(".bookmarker-icon-option").forEach((el) => {
			el.toggleClass("is-selected", el.getAttr("aria-label") === this.icon);
		});
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
