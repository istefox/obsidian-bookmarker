import { Notice, Plugin } from "obsidian";
import {
	BookmarkerSettings,
	BookmarkerSettingTab,
	DEFAULT_SETTINGS,
} from "./settings";
import { CaptureModal } from "./capture-modal";
import { captureBookmark } from "./capture";
import { isHttpUrl } from "./url-safety";
import { BOOKMARK_VIEW_TYPE, BookmarkView } from "./bookmark-view";

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

		// Raindrop-like board: a grid of cover cards for the saved bookmarks.
		this.registerView(
			BOOKMARK_VIEW_TYPE,
			(leaf) => new BookmarkView(leaf, this),
		);
		this.addRibbonIcon("bookmark", "Open bookmarks board", () => {
			void this.openBoard();
		});
		this.addCommand({
			id: "open-bookmarks-board",
			name: "Open bookmarks board",
			callback: () => void this.openBoard(),
		});

		this.addSettingTab(new BookmarkerSettingTab(this.app, this));
	}

	onunload(): void {}

	/** Reveal the bookmarks board, creating its leaf if needed; optionally filter by domain. */
	async openBoard(domain?: string): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(BOOKMARK_VIEW_TYPE)[0];
		if (!leaf) {
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({ type: BOOKMARK_VIEW_TYPE, active: true });
		}
		await workspace.revealLeaf(leaf);
		if (domain && leaf.view instanceof BookmarkView) {
			leaf.view.filterByDomain(domain);
		}
	}

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
