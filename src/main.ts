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
import { checkBrokenLinks } from "./link-check";
import { ImportModal } from "./import-modal";
import { fetchRaindropItems } from "./raindrop";
import { importBookmarks } from "./import-writer";

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
				new Notice("Bookmarker: obsidian://bookmark needs a valid HTTP(s) URL.");
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
		this.addCommand({
			id: "check-broken-links",
			name: "Check for broken links",
			callback: () => void this.runBrokenLinkCheck(),
		});
		this.addCommand({
			id: "import-bookmarks",
			name: "Import bookmarks…",
			callback: () => new ImportModal(this.app, this).open(),
		});
		this.addCommand({
			id: "import-from-raindrop",
			name: "Import from Raindrop",
			callback: () => void this.runRaindropImport(),
		});

		this.addSettingTab(new BookmarkerSettingTab(this.app, this));
	}

	onunload(): void {}

	private async runBrokenLinkCheck(): Promise<void> {
		const notice = new Notice("Checking links…", 0);
		try {
			const { checked, broken } = await checkBrokenLinks(
				this.app,
				this.settings,
				(done, total) => notice.setMessage(`Checking links ${done}/${total}…`),
			);
			notice.hide();
			new Notice(`Checked ${checked} bookmark(s): ${broken} broken.`);
		} catch (error) {
			notice.hide();
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Link check failed: ${message}`);
		}
	}

	private async runRaindropImport(): Promise<void> {
		const token = this.settings.raindropToken;
		if (!token) {
			new Notice("Bookmarker: set your Raindrop API token in settings first.");
			return;
		}
		const notice = new Notice("Fetching from Raindrop…", 0);
		try {
			const items = await fetchRaindropItems(token, (count) =>
				notice.setMessage(`Fetching from Raindrop… ${count} found`),
			);
			if (items.length === 0) {
				notice.hide();
				new Notice("Bookmarker: no bookmarks found in Raindrop.");
				return;
			}
			const { imported, skipped, failed } = await importBookmarks(
				this.app,
				this.settings,
				items,
				(done, total) => notice.setMessage(`Importing ${done}/${total}…`),
			);
			notice.hide();
			const tail = failed ? `, ${failed} failed` : "";
			new Notice(`Raindrop import: ${imported} imported, ${skipped} skipped${tail}.`);
		} catch (error) {
			notice.hide();
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Raindrop import failed: ${message}`);
		}
	}

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
		const data = (await this.loadData()) as Partial<BookmarkerSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
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
