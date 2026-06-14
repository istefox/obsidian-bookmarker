import { App, PluginSettingTab, Setting } from "obsidian";
import type BookmarkerPlugin from "./main";

export interface BookmarkerSettings {
	anthropicApiKey: string;
	classifierMode: "claude" | "heuristic";
	model: string;
	rootFolder: string;
	alwaysReview: boolean;
	useImageProxy: boolean;
	enableScreenshotFallback: boolean;
	enableFaviconFallback: boolean;
	enableWaybackArchive: boolean;
	allowNewTags: boolean;
	allowNewFolders: boolean;
	warnOnDuplicate: boolean;
	warnOnSameDomain: boolean;
	maxTags: number;
	excerptLength: number;
}

export const DEFAULT_SETTINGS: BookmarkerSettings = {
	anthropicApiKey: "",
	classifierMode: "claude",
	model: "claude-haiku-4-5",
	rootFolder: "_bookmarks",
	alwaysReview: true,
	useImageProxy: true,
	enableScreenshotFallback: true,
	enableFaviconFallback: true,
	enableWaybackArchive: true,
	allowNewTags: true,
	allowNewFolders: true,
	warnOnDuplicate: true,
	warnOnSameDomain: true,
	maxTags: 5,
	excerptLength: 1500,
};

export class BookmarkerSettingTab extends PluginSettingTab {
	private readonly plugin: BookmarkerPlugin;

	constructor(app: App, plugin: BookmarkerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Classification").setHeading();

		new Setting(containerEl)
			.setName("Anthropic API key")
			.setDesc("Used by the Claude classifier. Stored in plaintext in this plugin's data.json.")
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("sk-ant-...")
					.setValue(this.plugin.settings.anthropicApiKey)
					.onChange(async (value) => {
						this.plugin.settings.anthropicApiKey = value.trim();
						await this.plugin.saveSettings();
					});
			});

		const warning = containerEl.createEl("p", {
			cls: "bookmarker-setting-warning",
		});
		warning.setText(
			"Privacy: the API key is stored in .obsidian/plugins/obsidian-bookmarker/data.json. " +
				"If you sync .obsidian, the key syncs too — exclude it from sync.",
		);

		new Setting(containerEl)
			.setName("Classifier mode")
			.setDesc("Claude proposes tags and folder via the API. Heuristic is offline and free.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("claude", "Claude (default)")
					.addOption("heuristic", "Heuristic (offline)")
					.setValue(this.plugin.settings.classifierMode)
					.onChange(async (value) => {
						this.plugin.settings.classifierMode = value as "claude" | "heuristic";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Model")
			.setDesc("Anthropic model id used by the Claude classifier.")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Vault layout").setHeading();

		new Setting(containerEl)
			.setName("Root folder")
			.setDesc("Bookmarks are written under this folder; categories are subfolders.")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.rootFolder)
					.onChange(async (value) => {
						this.plugin.settings.rootFolder = value.trim() || "_bookmarks";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Always review before saving")
			.setDesc(
				"Open a review window (edit title, tags, and destination folder) before " +
					"writing the note. Turn off for a silent one-click save with the proposed values.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.alwaysReview)
					.onChange(async (value) => {
						this.plugin.settings.alwaysReview = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Preview").setHeading();

		new Setting(containerEl)
			.setName("Preview card plugin")
			.setDesc(
				"Image previews render as cards via the obsidian-link-embed community " +
					"plugin. Install it to see the card; without it the note shows the raw " +
					"embed block plus a fallback link.",
			)
			.addButton((button) =>
				button
					.setButtonText("Install link-embed")
					.setCta()
					.onClick(() => {
						window.open("obsidian://show-plugin?id=obsidian-link-embed");
					}),
			)
			.addButton((button) =>
				button.setButtonText("GitHub").onClick(() => {
					window.open("https://github.com/Seraphli/obsidian-link-embed");
				}),
			);

		new Setting(containerEl)
			.setName("Cache & privacy proxy")
			.setDesc(
				"Serve preview images through wsrv.nl: caching, resizing, and it hides " +
					"your IP from the origin site. Trade-off: wsrv.nl sees the image URLs.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useImageProxy)
					.onChange(async (value) => {
						this.plugin.settings.useImageProxy = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Screenshot fallback")
			.setDesc(
				"When a page exposes no image, fetch a Microlink screenshot (synchronous, " +
					"no placeholder). Free, ~50/day; may still fail on bot-protected sites like Amazon.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableScreenshotFallback)
					.onChange(async (value) => {
						this.plugin.settings.enableScreenshotFallback = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Free service layers").setHeading();

		new Setting(containerEl)
			.setName("Favicon fallback")
			.setDesc("Use a favicon service when the page declares no favicon.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableFaviconFallback)
					.onChange(async (value) => {
						this.plugin.settings.enableFaviconFallback = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Wayback archive")
			.setDesc("Trigger a Wayback Machine snapshot in the background.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableWaybackArchive)
					.onChange(async (value) => {
						this.plugin.settings.enableWaybackArchive = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Classification behavior").setHeading();

		new Setting(containerEl)
			.setName("Allow new tags")
			.setDesc("Let the classifier introduce tags not already in the vault.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.allowNewTags)
					.onChange(async (value) => {
						this.plugin.settings.allowNewTags = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Allow new folders")
			.setDesc("Let the classifier create a destination subfolder if none fits.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.allowNewFolders)
					.onChange(async (value) => {
						this.plugin.settings.allowNewFolders = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Warn on duplicate URL")
			.setDesc(
				"Before saving, check if the URL is already bookmarked. In the review " +
					"window you can open the existing note or save anyway.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.warnOnDuplicate)
					.onChange(async (value) => {
						this.plugin.settings.warnOnDuplicate = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Notice on same domain")
			.setDesc(
				"Show a discreet notice when you already have bookmarks from the same site " +
					"(different page). No confirmation, just a heads-up with a link to see them.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.warnOnSameDomain)
					.onChange(async (value) => {
						this.plugin.settings.warnOnSameDomain = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Max tags")
			.setDesc("Maximum number of tags proposed per bookmark.")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.maxTags))
					.onChange(async (value) => {
						const parsed = Number(value);
						if (Number.isFinite(parsed) && parsed > 0) {
							this.plugin.settings.maxTags = Math.floor(parsed);
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName("Excerpt length")
			.setDesc("Characters of page text sent to the classifier.")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.excerptLength))
					.onChange(async (value) => {
						const parsed = Number(value);
						if (Number.isFinite(parsed) && parsed > 0) {
							this.plugin.settings.excerptLength = Math.floor(parsed);
							await this.plugin.saveSettings();
						}
					}),
			);
	}
}
