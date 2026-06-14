import { Notice, Plugin } from "obsidian";
import {
	BookmarkerSettings,
	BookmarkerSettingTab,
	DEFAULT_SETTINGS,
} from "./settings";
import { CaptureModal } from "./capture-modal";
import { captureBookmark } from "./capture";
import { isHttpUrl } from "./url-safety";

export default class BookmarkerPlugin extends Plugin {
	settings!: BookmarkerSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addCommand({
			id: "bookmark-a-url",
			name: "Bookmark a URL",
			callback: async () => {
				const initialUrl = await this.readClipboardUrl();
				new CaptureModal(
					this.app,
					this,
					(url) => {
						void captureBookmark(this, url);
					},
					initialUrl,
				).open();
			},
		});

		// One-click entry point: obsidian://bookmark?url=<encoded>
		// Fired by the companion browser extension (desktop) or an Apple Shortcut
		// (iOS/iPad Share Sheet). See ADR-001.
		this.registerObsidianProtocolHandler("bookmark", (params) => {
			const url = (params.url ?? "").trim();
			if (!isHttpUrl(url)) {
				new Notice("Bookmarker: obsidian://bookmark needs a valid http(s) url.");
				return;
			}
			void captureBookmark(this, url);
		});

		this.addSettingTab(new BookmarkerSettingTab(this.app, this));
	}

	onunload(): void {}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** Prefill the modal when the clipboard holds an http(s) URL. Safe on mobile. */
	private async readClipboardUrl(): Promise<string> {
		try {
			const clip = (await navigator.clipboard.readText())?.trim();
			return clip && /^https?:\/\//i.test(clip) ? clip : "";
		} catch {
			// Clipboard API unavailable or permission denied — ignore.
			return "";
		}
	}
}
